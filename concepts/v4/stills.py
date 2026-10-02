"""Darkness and text-box contrast for concepts/v4/stills.mjs captures.   python3 concepts/v4/stills.py <dir>
crushed = % of pixels OUTSIDE the question box (384..1536 x 302..777) whose R, G and B are all < 20 (black on a TV).
contrast = cream #fff1dc against the box background at its 99.5th luminance percentile (WCAG ratio; >= 7 wanted).
Also writes <dir>/sheet_<seed>.png (13 stations, 4 per row) and prints mean RGB per frame."""
import sys, os, glob, json
import numpy as np
from PIL import Image
D = sys.argv[1]
def rl(a):
    c = a / 255.0; c = np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4); return .2126 * c[..., 0] + .7152 * c[..., 1] + .0722 * c[..., 2]
LC = float(rl(np.array([[[255, 241, 220]]], float))[0, 0])
rows = []; by = {}
for f in sorted(glob.glob(os.path.join(D, 's[0-9]*_[0-9]*.png'))):
    a = np.asarray(Image.open(f).convert('RGB')).astype(float)
    m = np.ones(a.shape[:2], bool); m[302:777, 384:1536] = False
    crushed = float(((a < 20).all(-1) & m).sum() / m.sum() * 100)
    box = rl(a[302:777, 384:1536]); bg = float(np.percentile(box, 99.5)); con = (LC + .05) / (bg + .05)
    seed = os.path.basename(f).split('_')[0][1:]; by.setdefault(seed, []).append(f)
    rows.append(dict(f=os.path.basename(f), crushed=round(crushed, 1), contrast=round(con, 2), mean=[round(x, 1) for x in a.reshape(-1, 3).mean(0)]))
for r in rows: print(r)
print('worst crushed %', max(r['crushed'] for r in rows), 'mean crushed %', round(np.mean([r['crushed'] for r in rows]), 1), 'worst contrast', min(r['contrast'] for r in rows),
      'mean RGB', np.round(np.mean([r['mean'] for r in rows], 0), 1).tolist())
for seed, fs in by.items():
    sh = Image.new('RGB', (4 * 480, ((len(fs) + 3) // 4) * 270))
    for j, f in enumerate(fs): sh.paste(Image.open(f).resize((480, 270)), ((j % 4) * 480, (j // 4) * 270))
    sh.save(os.path.join(D, f'sheet_{seed}.png'))
json.dump(rows, open(os.path.join(D, 'stills.json'), 'w'))
