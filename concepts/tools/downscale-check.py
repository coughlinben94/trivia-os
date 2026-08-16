#!/usr/bin/env python3
# Crop the max-fill (right) object out of a headline-isolated-*.png, then
# produce a 64px-wide greyscale version and a ~20-foot-viewing simulation
# (heavy downscale + slight blur) for visual identifiability checks.
import sys
from PIL import Image, ImageFilter

src = sys.argv[1]
out_prefix = sys.argv[2]
# right-half crop box, in px: x0 x1 y0 y1
x0, y0, x1, y1 = [int(v) for v in sys.argv[3:7]]

img = Image.open(src).convert('RGB')
crop = img.crop((x0, y0, x1, y1))
crop.save(f'{out_prefix}-crop.png')

grey64 = crop.convert('L').resize((64, max(1, round(64 * crop.height / crop.width))), Image.LANCZOS)
grey64.save(f'{out_prefix}-64grey.png')

# 20ft sim: downscale hard (as if the object now occupies a small fraction
# of a TV screen viewed from across a room), then blur slightly to mimic
# the acuity loss of real viewing distance, then scale back up so it's
# actually visible in the saved file.
small = crop.resize((max(1, crop.width // 8), max(1, crop.height // 8)), Image.LANCZOS)
small = small.filter(ImageFilter.GaussianBlur(radius=0.6))
sim = small.resize((crop.width, crop.height), Image.NEAREST)
sim.save(f'{out_prefix}-20ft.png')

print(f'{out_prefix}: crop {crop.width}x{crop.height} -> 64grey {grey64.width}x{grey64.height}, 20ft-sim saved')
