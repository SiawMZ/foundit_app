"""Draws the Linkbox grid mark: a 3x3 grid of ink squares, the top-right one red ("the one you saved").

Regenerate the app icons and splash marks: python scripts/make_icons.py assets/images
"""
import sys
from PIL import Image, ImageDraw

OUT = sys.argv[1]
PAPER = (0xF2, 0xF0, 0xEB, 255)
INK = (0x14, 0x13, 0x11, 255)
RED = (0xD6, 0x00, 0x0E, 255)
RED_DARK = (0xFF, 0x2B, 0x2B, 255)
CLEAR = (0, 0, 0, 0)
WHITE = (255, 255, 255, 255)

# Square : gap = 3 : 1, so the mark is 3s + 2g = 11 units wide.
def grid(draw, size, mark, ink, red, outline_red=0):
    unit = mark / 11
    s, g = unit * 3, unit
    start = (size - mark) / 2
    for row in range(3):
        for col in range(3):
            x0 = round(start + col * (s + g))
            y0 = round(start + row * (s + g))
            x1 = round(start + col * (s + g) + s) - 1
            y1 = round(start + row * (s + g) + s) - 1
            special = row == 0 and col == 2
            if special and outline_red:
                draw.rectangle([x0, y0, x1, y1], outline=red, width=outline_red)
            else:
                draw.rectangle([x0, y0, x1, y1], fill=red if special else ink)

def make(name, size, mark, bg, ink, red, outline_red=0):
    img = Image.new('RGBA', (size, size), bg)
    grid(ImageDraw.Draw(img), size, mark, ink, red, outline_red)
    img.save(f'{OUT}/{name}')

# Full-bleed icon (Play Store / fallback): mark ~45% of the tile, like the concept sketch.
make('icon.png', 1024, 462, PAPER, INK, RED)
# Adaptive layers on the 108dp canvas: keep the mark inside the 66dp safe circle (~44dp square).
Image.new('RGBA', (1024, 1024), PAPER).save(f'{OUT}/android-icon-background.png')
make('android-icon-foreground.png', 1024, 418, CLEAR, INK, RED)
# Themed icons are one colour: the saved square becomes an outline so it still stands out.
make('android-icon-monochrome.png', 1024, 418, CLEAR, WHITE, WHITE, outline_red=22)
# Splash marks (transparent; the background colour comes from app.json).
make('splash-icon.png', 512, 506, CLEAR, INK, RED)
make('splash-icon-dark.png', 512, 506, CLEAR, PAPER, RED_DARK)
# Web favicon: 9px squares with 3px gaps so edges stay crisp.
make('favicon.png', 48, 33, PAPER, INK, RED)
print('ok')
