"""Replace only the homepage China thumbnail's pen with a Chinese brush."""
from pathlib import Path
import argparse
import json
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'design/homepage/china-brush-v1'
SOURCE = 'design/homepage/v4/homepage-cinematic-handwritten.png'
CROP = (1704, 678, 2000, 876)
API_SIZE = (1008, 672)


def brush_mask(size, include_brush_tip=False):
    mask = Image.new('L', (296, 198))
    # The generated soft bristles extend slightly past the original metal nib.
    left = 94 if include_brush_tip else 116
    ImageDraw.Draw(mask).polygon(
        [(left, 180), (154, 157), (211, 130), (248, 106),
         (283, 104), (295, 120), (282, 141), (221, 162),
         (172, 188), (145, 197), (left, 197)], fill=255)
    return mask.filter(ImageFilter.GaussianBlur(3)).resize(size, Image.Resampling.LANCZOS)


def prepare():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    original = Image.open(ROOT / SOURCE).convert('RGB').crop(CROP)
    original.save(OUTPUT / 'china-before.png')
    original.resize(API_SIZE, Image.Resampling.LANCZOS).save(OUTPUT / 'reference.png')
    mask = Image.new('RGBA', API_SIZE, 'white')
    mask.putalpha(brush_mask(API_SIZE).point(lambda value: 255 - value))
    mask.save(OUTPUT / 'edit-mask.png')
    print('Prepared China thumbnail source and brush edit mask.')


def composite():
    original = Image.open(OUTPUT / 'china-before.png').convert('RGB')
    generated = Image.open(OUTPUT / 'generated.png').convert('RGB')
    result = Image.composite(generated.resize(original.size, Image.Resampling.LANCZOS),
                             original, brush_mask(original.size, include_brush_tip=True))
    result.save(OUTPUT / 'china-brush.png')
    record = {
        'date': '2026-10-17', 'scope': 'Homepage China thumbnail pen only',
        'model': 'gpt-image-2.5-flare', 'quality': 'low',
        'apiSize': API_SIZE, 'outputSize': original.size,
        'source': SOURCE, 'sourceCrop': CROP,
        'reference': 'reference.png', 'mask': 'edit-mask.png',
        'prompt': 'prompt.txt', 'generated': 'generated.png',
        'output': 'china-brush.png',
        'composition': 'Composite only the feathered pen region into original pixels; retain homepage contour alpha during asset preparation.',
        'appOutput': 'desktop-app/public/assets/home-module-6.png',
    }
    (OUTPUT / 'generation-record.json').write_text(
        json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Composited traditional Chinese brush into the original thumbnail.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['prepare', 'composite'])
    args = parser.parse_args()
    prepare() if args.action == 'prepare' else composite()
