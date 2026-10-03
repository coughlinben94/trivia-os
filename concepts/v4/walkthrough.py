"""Frame analysis of a concepts/v4/walkthrough.mjs recording (real GPU, real clock).   python3 concepts/v4/walkthrough.py <dir>
Reads the CDP screencast frames (compositor output, ~20 fps) as luma, 16 px cells, a cell is ON when >25% of its pixels change by >24.
  POP   = ON blob >= 4 cells, fill > 0.5, not touching the frame edge (the QA viewer's metric)
  POPX  = the same on the EXCESS grid (change not explained by the pair before or after within 3 cells)
  BLINK = cells that change and come back on the next frame
  BOX   = the question box (20%,28%,60%x44%), per 100 ms step: mean |delta| and pixels over 24 (in 1920x1080 px)
Each frame is labelled by where the camera is (arc from the page's own clock, rAF samples): the nearest segment join
(kind>kind), door (door in / door out), loop wrap, within +-0.8 m; else 'mid'; and by input (press +0..0.6 s,
retarget last 1 s, quicken end +-0.5 s). Writes <dir>/analysis.json and <dir>/worst/*.png (before|after|next)."""
import sys, os, glob, json, subprocess
import numpy as np
from PIL import Image
from scipy import ndimage

D = sys.argv[1]; E = json.load(open(os.path.join(D, 'events.json')))
CF = sorted(glob.glob(os.path.join(D, 'cast', '*.jpg')), key=lambda f: float(os.path.basename(f)[:-4]))
PT = [float(os.path.basename(f)[:-4]) * 1000 - E['epochOff'] for f in CF]   # page ms of each compositor frame
info = E['info']; S = info['S']; L = info['L']; route = info['route']; NS = 13
kind = lambda k: route[k][:-1]
inner = lambda k: kind(k) in ('barn', 'shack')
def lab(k):
    if inner((k - 1) % NS): return kind((k - 1) % NS) + 'OUT'
    return kind(k) + ('IN' if inner(k) else '')
JOINS = []
for k in range(NS):
    a = S[k - 1] if k else 0.0
    JOINS.append((a, ('wrap ' if k == 0 else '') + lab((k - 1) % NS) + '>' + lab(k)))
    if inner(k): A = S[k - 1] + 9; JOINS += [(A, 'door in ' + kind(k)), (A + 13, 'door out ' + kind(k))]
fr = np.array([x for x in E['fr'] if x[1] is not None], float)
def u_at(pt): return float(np.interp(pt, fr[:, 0], fr[:, 1]))
presses = [e for e in E['ev'] if e['what'] in ('next', 'next5', 'back', 'jump')]
def label(pt):
    u = u_at(pt); uu = u % L; best = ('mid', 9)
    for a, n in JOINS:
        d = min(abs(uu - a), L - abs(uu - a))
        if d < 0.8 and d < best[1]: best = (n, d)
    tags = []
    for e in presses:
        if 0 <= pt - e['pt'] < 600: tags.append('press:' + e['what'])
        if e.get('T') and -1000 <= pt - (e['pt'] + e['T']) < 0: tags.append('quickenLast1s')
        if e.get('T') and abs(pt - (e['pt'] + e['T'])) < 500: tags.append('quickenEnd')
    return best[0], tags, round(u, 2)

W, H = 1280, 720
QB = (256, 202, 1024, 518)
def frames():
    for f in CF: yield np.asarray(Image.open(f).convert('L').resize((W, H)), dtype=np.int16)
def cells(d, th=24): return (d > th)[:H // 16 * 16, :W // 16 * 16].reshape(H // 16, 16, W // 16, 16).mean((1, 3))
def blobs(c, edgeok=False, fill=0.5):
    labl, n = ndimage.label(c); out = []
    for j, sl in enumerate(ndimage.find_objects(labl)):
        sz = int((labl[sl] == j + 1).sum()); h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
        edge = sl[0].start == 0 or sl[1].start == 0 or sl[0].stop == c.shape[0] or sl[1].stop == c.shape[1]
        # >= 2 cells both ways: a 1-cell-thick line is a fast edge sweeping across (roof line, beam), not a pop
        if sz >= 4 and h >= 2 and w >= 2 and (edgeok or not edge) and sz / (h * w) > fill: out.append((sz, [sl[1].start * 16, sl[0].start * 16, w * 16, h * 16]))
    return sorted(out)[::-1][:3]
rows = []; win = []; grids = []; keep = []
for i, a in enumerate(frames()):
    win.append(a); win = win[-4:]
    if i >= 1:
        d = np.abs(win[-1] - win[-2]); g = cells(d); grids.append(g); grids = grids[-3:]
        box100 = None
        if i >= 2:
            b = np.abs(win[-1] - win[-3])[QB[1]:QB[3], QB[0]:QB[2]]; box100 = (float(b.mean()), int((b > 24).sum() * 2.25))
        rows.append(dict(i=i, ms=round(PT[i]), mean=float(d.mean()), cells=int((g > 0.25).sum()), pops=blobs(g > 0.25), box=box100))
    # excess/blink for the previous pair (needs the pair after it)
    if i >= 3:
        r = rows[-2]; gp, g, gn = grids[0], grids[1], grids[2]
        ex = np.maximum(0, g - np.minimum(ndimage.maximum_filter(gp, size=7), ndimage.maximum_filter(gn, size=7)))
        r['popx'] = blobs(ex > 0.25); back = cells(np.abs(win[-1] - win[-3])); r['blink'] = blobs((g > 0.25) & (back < 0.08))
        sc = max([p[0] for p in r['popx']] + [p[0] for p in r['blink']] + [0])
        if sc >= 6:
            keep.append((sc, r['i'], [win[-3].astype(np.uint8), win[-2].astype(np.uint8), win[-1].astype(np.uint8)], r)); keep.sort(key=lambda t: -t[0]); keep = keep[:16]
for r in rows:
    r.setdefault('popx', []); r.setdefault('blink', [])
    r['join'], r['tags'], r['u'] = label(r['ms'])
rows = [r for r in rows if r['ms'] >= E['ev'][0]['pt']]   # from the 'start' mark on (load excluded)
from collections import defaultdict
by = defaultdict(list)
for r in rows:
    by[r['join']].append(r)
    for t in set(r['tags']): by['@' + t].append(r)
summ = {}
for k, v in sorted(by.items()):
    px = [r for r in v if r['popx']]; bl = [r for r in v if r['blink']]; pp = [r for r in v if r['pops']]
    summ[k] = dict(frames=len(v), popFrames=len(pp), maxPop=max([r['pops'][0][0] for r in pp], default=0), popx=len(px), maxPopx=max([r['popx'][0][0] for r in px], default=0),
                   blink=len(bl), maxBlink=max([r['blink'][0][0] for r in bl], default=0), maxMean=round(max(r['mean'] for r in v), 2), p95Mean=round(float(np.percentile([r['mean'] for r in v], 95)), 2))
bx = [r for r in rows if r['box'] and not {'press:jump', 'press:back'} & set(r['tags'])]   # covered cuts excluded
calm = dict(worstMean=round(max(r['box'][0] for r in bx), 3), worstOver24=max(r['box'][1] for r in bx), p99Mean=round(float(np.percentile([r['box'][0] for r in bx], 99)), 3),
            worstAt=max(bx, key=lambda r: r['box'][0])['ms'], worstLabel=(lambda r: [r['join'], r['tags']])(max(bx, key=lambda r: r['box'][0])))
os.makedirs(os.path.join(D, 'worst'), exist_ok=True)
for f in glob.glob(os.path.join(D, 'worst', '*.png')): os.remove(f)
worst = []
for n, (sc, i, fs, r) in enumerate(keep):
    kk = 'popx' if r['popx'] and r['popx'][0][0] == sc else 'blink'
    x, y, w, h = r[kk][0][1]; pad = 48; box = (max(0, x - pad), max(0, y - pad), min(W, x + w + pad), min(H, y + h + pad))
    ims = [Image.fromarray(f).crop(box) for f in fs]; o = Image.new('L', (ims[0].width * 3 + 16, ims[0].height), 255)
    for j, im in enumerate(ims): o.paste(im, (j * (im.width + 8), 0))
    fn = f"{n:02d}_{kk}{sc}_{r['join'].replace(' ', '_').replace('>', '-')}_{r['ms']}.png"; o.save(os.path.join(D, 'worst', fn))
    worst.append(dict(file=fn, ms=r['ms'], u=r['u'], join=r['join'], tags=r['tags'], kind=kk, blob=r[kk][0]))
# speed curve from the schedule's own arc per frame: v over 100 ms windows; the jerk = largest change of v between
# neighbouring windows (piecewise-constant 100 ms steps by design), and any backward step of the arc
tq = np.arange(fr[0, 0], fr[-1, 0], 100.0); uq = np.interp(tq, fr[:, 0], fr[:, 1]); vq = np.diff(uq) * 10; dv = np.abs(np.diff(vq))
cuts = [e['pt'] for e in E['ev'] if e['what'] in ('jump', 'back')]
okw = np.array([all(abs(t - c) > 1200 for c in cuts) for t in tq[1:-1]])
vel = dict(vmax=round(float(vq.max()), 2), maxDv100=round(float(dv[okw].max()) if okw.any() else 0, 3), p99Dv100=round(float(np.percentile(dv[okw], 99)) if okw.any() else 0, 3),
           backSteps=int(((np.diff(fr[:, 1]) < -1e-6)).sum()))
print('velocity', vel)
out = dict(summary=E['summary'], calm=calm, vel=vel, joins=summ, worst=worst)
json.dump(out, open(os.path.join(D, 'analysis.json'), 'w'), indent=1)
print(json.dumps(E['summary']))
print('calm', calm)
for k, s in summ.items():
    if s['popx'] or s['blink'] or k.startswith('@') or k == 'mid': print(f"{k:28s} {s}")
for w in worst: print('worst', w)
