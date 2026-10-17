"""Separate the foreground flame from approved local artwork; no new image generation.

Only the flame silhouette is inpainted. The wick, wax, room and original ambient
lighting stay in place. The runtime uses a small repair rectangle from this plate
over the unchanged homepage image, then draws the anchored flame and extra glow.
Run: python scripts/prepare-candle-assets.py
"""
from pathlib import Path
import json

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

APP = Path(__file__).resolve().parents[1]
SOURCE = 'design/homepage/scene-v1/observatory-clean.png'
FLAME_BOUNDS = (1009, 198, 1041, 275)
ANCHOR = (1025, 274)
REPAIR_BOUNDS = (955, 150, 1115, 305)
# Outline follows the existing luminous flame, ending above the dark wick.
OUTLINE = [(1026, 203), (1028, 213), (1030, 231), (1033, 247),
           (1033, 263), (1031, 269), (1028, 274), (1023, 274),
           (1020, 268), (1019, 261), (1019, 247), (1021, 231),
           (1023, 217)]


def prepare_candle_assets():
    source = Image.open(APP.parent / SOURCE).convert('RGB')
    width, height = source.size
    scale = 4
    silhouette = Image.new('L', (width * scale, height * scale))
    ImageDraw.Draw(silhouette).polygon(
        [(x * scale, y * scale) for x, y in OUTLINE], fill=255)
    silhouette = silhouette.resize(source.size, Image.Resampling.LANCZOS)
    alpha = silhouette.filter(ImageFilter.GaussianBlur(0.65))
    # Keep all pixels at/below the anchor on the stationary plate.
    alpha_array = np.array(alpha)
    alpha_array[ANCHOR[1]:, :] = 0
    alpha = Image.fromarray(alpha_array)
    flame = source.convert('RGBA')
    flame.putalpha(alpha)
    flame = flame.crop(FLAME_BOUNDS)

    removal = cv2.dilate(np.array(silhouette), np.ones((7, 7), np.uint8))
    removal[ANCHOR[1]:, :] = 0
    plate = cv2.inpaint(np.array(source), removal, 5, cv2.INPAINT_TELEA)
    assets = APP / 'public/assets'
    assets.mkdir(parents=True, exist_ok=True)
    Image.fromarray(plate).save(assets / 'home-candle-plate.png')
    flame.save(assets / 'home-candle-flame.png')
    config = {
        'source': SOURCE,
        'size': {'width': width, 'height': height},
        'anchor': {'x': ANCHOR[0], 'y': ANCHOR[1]},
        'flame': {'x': FLAME_BOUNDS[0], 'y': FLAME_BOUNDS[1],
                  'width': FLAME_BOUNDS[2] - FLAME_BOUNDS[0],
                  'height': FLAME_BOUNDS[3] - FLAME_BOUNDS[1]},
        'repair': {'x': REPAIR_BOUNDS[0], 'y': REPAIR_BOUNDS[1],
                   'width': REPAIR_BOUNDS[2] - REPAIR_BOUNDS[0],
                   'height': REPAIR_BOUNDS[3] - REPAIR_BOUNDS[1]},
        'plateAsset': 'home-candle-plate.png',
        'flameAsset': 'home-candle-flame.png',
    }
    (assets / 'home-candle.json').write_text(
        json.dumps(config, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    record_path = assets / 'source-record.json'
    record = json.loads(record_path.read_text(encoding='utf-8')) if record_path.exists() else {}
    record['homepageCandle'] = {
        **config,
        'method': 'Local silhouette extraction and OpenCV inpainting above the fixed wick',
        'outline': OUTLINE,
        'script': 'scripts/prepare-candle-assets.py',
        'notes': 'Foreground candle only. Original homepage image remains the static fallback. No paid image generation; wick and wax unchanged.',
    }
    record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Prepared local foreground candle plate, transparent flame and coordinate record.')


if __name__ == '__main__':
    prepare_candle_assets()
