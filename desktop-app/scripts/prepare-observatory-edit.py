"""Prepare and composite the requested local homepage scene repair."""
from pathlib import Path
import argparse
import json
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'design/homepage/scene-v1'
CROP = (870, 96, 2048, 680)
API_SIZE = (1184, 592)


def repair_mask(size):
    mask = Image.new('L', (1178, 584))
    # Include both brass parts and their immediate tabletop reflections.
    ImageDraw.Draw(mask).polygon(
        [(0, 390), (219, 390), (232, 416), (239, 515),
         (220, 535), (0, 549)], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(8))
    return mask.resize(size, Image.Resampling.LANCZOS)


def prepare():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    scene = Image.open(ROOT / 'design/homepage/v4/homepage-cinematic-handwritten.png').convert('RGB').crop(CROP)
    scene.save(OUTPUT / 'observatory-before.png')
    scene.resize(API_SIZE, Image.Resampling.LANCZOS).save(OUTPUT / 'reference.png')
    mask = Image.new('RGBA', API_SIZE, 'white')
    mask.putalpha(repair_mask(API_SIZE).point(lambda value: 255 - value))
    mask.save(OUTPUT / 'edit-mask.png')
    print('Prepared source and local edit mask.')


def composite():
    scene = Image.open(OUTPUT / 'observatory-before.png').convert('RGB')
    generated = Image.open(OUTPUT / 'generated.png').convert('RGB')
    result = Image.composite(
        generated.resize(scene.size, Image.Resampling.LANCZOS),
        scene, repair_mask(scene.size))
    result.save(OUTPUT / 'observatory-clean.png')
    record = {
        'model': 'gpt-image-2.5-flare', 'quality': 'low',
        'apiSize': API_SIZE, 'outputSize': scene.size,
        'source': 'design/homepage/v4/homepage-cinematic-handwritten.png',
        'sourceCrop': CROP, 'reference': 'reference.png',
        'mask': 'edit-mask.png', 'prompt': 'prompt.txt',
        'generated': 'generated.png', 'output': 'observatory-clean.png',
        'composition': 'Only the feathered lower-left repair mask is composited into the original scene.',
    }
    (OUTPUT / 'generation-record.json').write_text(
        json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Composited local repair into the original scene.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['prepare', 'composite'])
    args = parser.parse_args()
    prepare() if args.action == 'prepare' else composite()
