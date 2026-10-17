"""Create matched-size reference comparisons for the astronomy page review."""
from pathlib import Path
import argparse
from PIL import Image, ImageDraw, ImageFont

APP = Path(__file__).resolve().parents[1]
QA = APP / 'qa'
REFERENCES = APP.parent / 'design/interior/v2'
FONT = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 25)
parser = argparse.ArgumentParser()
parser.add_argument('--capture-prefix', default='astronomy-background')
parser.add_argument('--review-prefix', default='astronomy-design')
args = parser.parse_args()

for width, height in ((2048, 1152), (1280, 720)):
    suffix = '-1280' if width == 1280 else ''
    reference = Image.open(REFERENCES / f'module-directory-astronomy{suffix}.png').convert('RGB')
    implementation = Image.open(QA / f'{args.capture_prefix}-{width}-after.png').convert('RGB')
    board = Image.new('RGB', (width * 2, height + 55), '#10202b')
    board.paste(reference, (0, 55))
    board.paste(implementation, (width, 55))
    draw = ImageDraw.Draw(board)
    draw.text((24, 9), f'已确认设计图 · {width} × {height}', font=FONT, fill='#f2e8d8')
    draw.text((width + 24, 9), '天文学主题页 · 实际浏览器截图', font=FONT, fill='#f2e8d8')
    board.save(QA / f'{args.review_prefix}-comparison-{width}.png')
    # Preserve readable foreground and instrument detail in the QA evidence.
    crop_width = 840 if width == 2048 else 525
    focus = Image.new('RGB', (crop_width * 2, height + 55), '#10202b')
    focus.paste(reference.crop((0, 0, crop_width, height)), (0, 55))
    focus.paste(implementation.crop((0, 0, crop_width, height)), (crop_width, 55))
    ImageDraw.Draw(focus).text((24, 9), '左侧细节：设计图 / 实际页面', font=FONT, fill='#f2e8d8')
    focus.save(QA / f'{args.review_prefix}-focus-{width}.png')
