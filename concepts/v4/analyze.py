"""Frame-diff a concepts/v4/record.mjs recording (real GPU, real clock).
   python3 concepts/v4/analyze.py <dir>
Cuts the webm to 20 fps, then per consecutive frame pair (1280x720, 16 px cells): a cell is ON when >25% of its
pixels change by >24 (luma). POP = a connected ON blob of >= 4 cells, fill > 0.5, not touching the frame edge (the
QA viewer's metric, so numbers compare with qa/viewer). POPX = the same ON-cell blobs on the EXCESS grid (change not explained by the pair before or after within 3 cells:
motion changes neighbouring pairs too, a pop or vanish does not). BLINK = cells that change and come back on the next
frame (|f[i]-f[i-1]| ON but |f[i+1]-f[i-1]| < 8% of the cell): a flicker, which motion never does.
QVANISH = a frame whose count of bright pixels (luma > 180)
inside the question box is < 25% of the recording's median (the #q overlay dropping out).
Writes <dir>/diff.json, <dir>/worst/*.png (before|after crops) and <dir>/sheets/walkNN.png (8 frames per walk)."""
import sys, os, glob, json, subprocess
import numpy as np
from PIL import Image
from scipy import ndimage

D = sys.argv[1]
ev = json.load(open(os.path.join(D, 'events.json')))
vid = glob.glob(os.path.join(D, 'video', '*.webm'))[0]
fr = os.path.join(D, 'fr'); os.makedirs(fr, exist_ok=True)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', vid, '-vf', 'fps=20', os.path.join(fr, '%05d.png')], check=True)
F = sorted(glob.glob(os.path.join(fr, '*.png')))
walks = ev['walks']; WAIT = 1200

def label(ms):
    for w in walks:
        if w['t0'] - 200 <= ms <= w['t0'] + w['T'] + WAIT:
            kind = (w['kind'] + 'IN') if w['kind'] in ('barn', 'shack') else ('OUT' if w['exit'] else w['kind'])
            if w['exit']: kind = 'barnOUT' if ev['route']['route'][w['from']] == 'barn' else 'shackOUT'
            return f"w{w['from']}>{w['to']}", kind
    return 'wander', 'wander'

QB = (256, 201, 1024, 518)
rows = []; prev = None; qs = []; grids = []; imgs = []
def cells(d, th=24): H, W = d.shape; return (d > th)[:H // 16 * 16, :W // 16 * 16].reshape(H // 16, 16, W // 16, 16).mean((1, 3))
def blobs(c, edgeok=True):
    lab, n = ndimage.label(c); out = []
    for j, sl in enumerate(ndimage.find_objects(lab)):
        sz = int((lab[sl] == j + 1).sum()); h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
        edge = sl[0].start == 0 or sl[1].start == 0 or sl[0].stop == c.shape[0] or sl[1].stop == c.shape[1]
        if sz >= 4 and (edgeok or not edge) and sz / (h * w) > 0.4: out.append((sz, [sl[1].start * 16, sl[0].start * 16, w * 16, h * 16]))
    return sorted(out)[::-1][:3]
for i, f in enumerate(F):
    a = np.asarray(Image.open(f).convert('L'), dtype=np.int16)
    qs.append(int((a[QB[1]:QB[3], QB[0]:QB[2]] > 180).sum()))
    if prev is not None:
        d = np.abs(a - prev); H, W = d.shape
        c = (d > 24)[:H // 16 * 16, :W // 16 * 16].reshape(H // 16, 16, W // 16, 16).mean((1, 3)) > 0.25
        lab, n = ndimage.label(c); pops = []
        for j, sl in enumerate(ndimage.find_objects(lab)):
            sz = int((lab[sl] == j + 1).sum()); h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
            edge = sl[0].start == 0 or sl[1].start == 0 or sl[0].stop == c.shape[0] or sl[1].stop == c.shape[1]
            if sz >= 4 and not edge and sz / (h * w) > 0.5: pops.append((sz, [sl[1].start * 16, sl[0].start * 16, w * 16, h * 16]))
        grids.append(cells(d)); ms = i * 50; wk, kind = label(ms)
        rows.append(dict(i=i, ms=ms, walk=wk, kind=kind, mean=float(d.mean()), cells=int(c.sum()), pops=sorted(pops)[::-1][:3]))
    prev = a; imgs.append(a)
# second pass: excess pops and blinks
for k, r in enumerate(rows):
    g = grids[k]; z = np.zeros_like(g)
    gp = ndimage.maximum_filter(grids[k - 1], size=7) if k > 0 else z
    gn = ndimage.maximum_filter(grids[k + 1], size=7) if k + 1 < len(grids) else z
    ex = np.maximum(0, g - np.minimum(gp, gn)); r['popx'] = blobs(ex > 0.25)
    i = r['i']
    if i + 1 < len(imgs): back = cells(np.abs(imgs[i + 1] - imgs[i - 1])); r['blink'] = blobs((g > 0.25) & (back < 0.08))
    else: r['blink'] = []
med = float(np.median(qs)); qv = [i for i, v in enumerate(qs) if med > 50 and v < 0.25 * med]
for r in rows: r['qv'] = r['i'] in qv
json.dump(dict(rows=rows, qbright=qs), open(os.path.join(D, 'diff.json'), 'w'))
from collections import defaultdict
S = defaultdict(list)
for r in rows: S[r['kind']].append(r)
summ = {}
for k, v in sorted(S.items()):
    pf = [r for r in v if r['pops']]; px = [r for r in v if r['popx']]; bl = [r for r in v if r['blink']]
    summ[k] = dict(frames=len(v), popFrames=len(pf), maxPop=max([r['pops'][0][0] for r in pf], default=0), popxFrames=len(px), maxPopx=max([r['popx'][0][0] for r in px], default=0),
                   blinkFrames=len(bl), maxBlink=max([r['blink'][0][0] for r in bl], default=0), maxCells=max(r['cells'] for r in v), qVanish=sum(r['qv'] for r in v))
    print(f"{k:10s} frames={len(v):4d} viewerPop={len(pf):3d}/{summ[k]['maxPop']:3d} excessPop={len(px):3d}/{summ[k]['maxPopx']:3d} blink={len(bl):3d}/{summ[k]['maxBlink']:3d} maxChangedCells={summ[k]['maxCells']:4d} qVanish={summ[k]['qVanish']}")
print('q bright median', med, 'vanish frames', qv[:20])
import shutil; shutil.rmtree(os.path.join(D, 'worst'), ignore_errors=True); os.makedirs(os.path.join(D, 'worst'), exist_ok=True)
worst = sorted([(r, 'popx') for r in rows if r['popx']] + [(r, 'blink') for r in rows if r['blink']], key=lambda t: -t[0][t[1]][0][0])[:12]
for n, (r, kk) in enumerate(worst):
    x, y, w, h = r[kk][0][1]; pad = 48; box = (max(0, x - pad), max(0, y - pad), min(1280, x + w + pad), min(720, y + h + pad))
    A = Image.open(F[r['i'] - 1]).crop(box); B = Image.open(F[r['i']]).crop(box)
    o = Image.new('RGB', (A.width * 2 + 8, A.height), 'red'); o.paste(A, (0, 0)); o.paste(B, (A.width + 8, 0)); C = Image.open(F[min(r['i'] + 1, len(F) - 1)]).crop(box)
    o = Image.new('RGB', (A.width * 3 + 16, A.height), 'red'); o.paste(A, (0, 0)); o.paste(B, (A.width + 8, 0)); o.paste(C, (2 * A.width + 16, 0))
    o.save(os.path.join(D, 'worst', f"{n:02d}_{kk}_{r['walk']}_{r['kind']}_{r['ms']}.png"))
    print('worst', kk, r['walk'], r['kind'], r['ms'], r[kk][0])
os.makedirs(os.path.join(D, 'sheets'), exist_ok=True)
for w in walks:
    i0 = int(w['t0'] / 50); i1 = min(len(F) - 1, int((w['t0'] + w['T'] + WAIT) / 50)); idx = np.linspace(i0, i1, 8).astype(int)
    sh = Image.new('RGB', (4 * 480, 2 * 270))
    for j, ix in enumerate(idx): sh.paste(Image.open(F[ix]).resize((480, 270)), ((j % 4) * 480, (j // 4) * 270))
    sh.save(os.path.join(D, 'sheets', f"walk{w['from']:02d}_{w['kind']}{'_exit' if w['exit'] else ''}.png"))
json.dump(summ, open(os.path.join(D, 'summary.json'), 'w'))
