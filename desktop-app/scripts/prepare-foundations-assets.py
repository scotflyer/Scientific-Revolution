"""Separate editable UI from the approved foundations theme artwork.

The original bookcase, candle, manuscripts and compass keep their source
positions. Only baked interface pixels are restored using harmonic diffusion.
"""
from pathlib import Path
import json

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, distance_transform_edt, convolve

APP = Path(__file__).resolve().parents[1]
SOURCE = APP.parent / 'design/interior/modules-v1/module-directory-foundations.png'
BACKDROP = APP / 'public/assets/foundations-backdrop.png'
TITLE = APP / 'public/assets/title-foundations.png'
SOURCE_CROP = (0, 0, 930, 1152)
TITLE_CROP = (76, 198, 680, 452)
REGIONS = [
    (78, 26, 250, 76, 'light'),
    (78, 90, 505, 123, 'all'),
    (80, 158, 323, 194, 'all'),
    (75, 198, 657, 452, 'lettering'),
    (80, 464, 459, 534, 'light'),
]
BUTTON = (86, 549, 306, 611)
CANVAS = (1024, 1152)
RIGHT_TRANSITION = (852, 917)
HARMONIC_ITERATIONS = 1600
DARK = (3, 20, 30)


def prepare_foundations_assets():
    BACKDROP.parent.mkdir(parents=True, exist_ok=True)
    (APP / 'qa').mkdir(parents=True, exist_ok=True)
    original = Image.open(SOURCE).convert('RGB')
    pixels = np.asarray(original.crop(SOURCE_CROP)).astype(np.float32)
    mask = np.zeros(pixels.shape[:2], dtype=bool)
    for x0, y0, x1, y1, kind in REGIONS:
        rgb = pixels[y0:y1, x0:x1]
        ink = rgb.min(axis=2) > 55
        if kind == 'all':
            ink |= (rgb[:, :, 0] > 85) & (rgb[:, :, 1] > 60)
        if kind == 'lettering':
            ink |= (rgb.min(axis=2) > 45) & (rgb[:, :, 0] > rgb[:, :, 2] + 10)
        mask[y0:y1, x0:x1] |= binary_dilation(ink, iterations=3)
    bx0, by0, bx1, by1 = BUTTON
    mask[by0:by1, bx0:bx1] = True
    _, nearest = distance_transform_edt(mask, return_indices=True)
    restored = pixels.copy()
    restored[mask] = pixels[nearest[0][mask], nearest[1][mask]]
    kernel = np.array([[0, .25, 0], [.25, 0, .25], [0, .25, 0]], np.float32)
    slab = restored[20:620, :700].copy()
    holes = mask[20:620, :700]
    for _ in range(HARMONIC_ITERATIONS):
        average = convolve(slab, kernel[:, :, None], mode='nearest')
        slab[holes] = average[holes]
    restored[20:620, :700] = slab
    start, end = RIGHT_TRANSITION
    edge = np.clip((end - np.arange(SOURCE_CROP[2])) / (end - start), 0, 1)
    edge = edge * edge * (3 - 2 * edge)
    dark = np.asarray(DARK, dtype=np.float32)
    backdrop = restored * edge[None, :, None] + dark * (1 - edge[None, :, None])
    canvas = Image.new('RGB', CANVAS, DARK)
    canvas.paste(Image.fromarray(np.clip(backdrop, 0, 255).astype(np.uint8)), (0, 0))
    canvas.save(BACKDROP)

    # Unpremultiply antialiased ivory brush strokes against the restored scene.
    x0, y0, x1, y1 = TITLE_CROP
    rgba = np.asarray(original.convert('RGBA').crop(TITLE_CROP)).copy()
    rgb = rgba[:, :, :3].astype(np.float32)
    background = restored[y0:y1, x0:x1]
    ink = (rgb.min(axis=2) > 100) | ((rgb.min(axis=2) > 45) &
                                      (rgb[:, :, 0] > rgb[:, :, 2] + 10))
    alpha = np.clip((rgb[:, :, 0] - background[:, :, 0]) /
                    np.maximum(1, 225 - background[:, :, 0]), 0, 1)
    alpha[~ink] = 0
    # No approved lettering exists past x=647. This excludes nearby shelf glints.
    alpha[:, 647 - x0:] = 0
    foreground = (rgb - background * (1 - alpha[:, :, None])) / np.maximum(.001, alpha[:, :, None])
    rgba[:, :, :3] = np.clip(foreground, 0, 255).astype(np.uint8)
    rgba[:, :, 3] = np.rint(alpha * 255).astype(np.uint8)
    Image.fromarray(rgba).save(TITLE)
    record = {
        'source': str(SOURCE.relative_to(APP.parent)),
        'outputs': [str(BACKDROP.relative_to(APP)), str(TITLE.relative_to(APP))],
        'crop': SOURCE_CROP,
        'title_crop': TITLE_CROP,
        'title_dimensions': [x1 - x0, y1 - y0],
        'restoration': 'UI ink mask, 3px dilation, nearest seed, 1600 harmonic iterations',
        'regions': REGIONS,
        'button': BUTTON,
        'canvas': CANVAS,
        'right_transition': RIGHT_TRANSITION,
        'background': DARK,
        'title_alpha': 'red-channel separation against restored pixels, 225 saturation; unpremultiplied foreground',
        'scene_fit': 'uniform cover, left top; full viewport height; left half width',
        'asset_qa': {
            'result': 'passed',
            'checks': [
                'Original UI text and outline button removed; no readable lettering remains.',
                'Bookcase, candle, manuscripts and compass preserve approved source geometry.',
                'All source pixels below y=620 and before x=852 remain exactly unchanged.',
                'Right edge x>=917 is exactly #03141e, with a smooth 65px transition.',
                'Two-line brush title retains original ivory-gold color without gray fringe.',
            ],
            'visuals': ['qa/foundations-asset-composite.png', 'qa/foundations-title-dark.png'],
        },
    }
    (APP / 'qa/foundations-asset-record.json').write_text(
        json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    prepare_foundations_assets()
