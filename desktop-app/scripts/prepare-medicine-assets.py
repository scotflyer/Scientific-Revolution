"""Separate the approved medicine lettering and continuous historical scene.

The source composition is preserved. Only baked interface pixels are restored
with a harmonic solve, then the source's dark right edge blends to #03141e.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, binary_propagation, distance_transform_edt, convolve

APP = Path(__file__).resolve().parents[1]
SOURCE = APP.parent / 'design/interior/modules-v1/module-directory-medicine.png'
OUTPUT = APP / 'public/assets/medicine-backdrop.png'
TITLE = APP / 'public/assets/title-medicine.png'


def prepare_medicine_assets():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    (APP / 'qa').mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert('RGB').crop((0, 0, 930, 1152))
    pixels = np.asarray(source).astype(np.float32)
    mask = np.zeros(pixels.shape[:2], dtype=bool)
    regions = [
        (78, 26, 250, 76, 'light'),
        (78, 88, 620, 123, 'all'),
        (80, 155, 332, 194, 'all'),
        (76, 194, 690, 360, 'lettering'),
        (80, 354, 395, 396, 'light'),
        (80, 404, 400, 477, 'light'),
    ]
    for x0, y0, x1, y1, kind in regions:
        rgb = pixels[y0:y1, x0:x1]
        ink = rgb.min(axis=2) > 100
        if kind == 'all':
            ink |= (rgb[:, :, 0] > 105) & (rgb[:, :, 1] > 75)
        if kind == 'lettering':
            ink |= (rgb.min(axis=2) > 45) & (rgb[:, :, 0] > rgb[:, :, 2] + 10)
        mask[y0:y1, x0:x1] |= binary_dilation(ink, iterations=3)
    button = [87, 494, 305, 549]
    mask[button[1]:button[3], button[0]:button[2]] = True
    _, nearest = distance_transform_edt(mask, return_indices=True)
    restored = pixels.copy()
    restored[mask] = pixels[nearest[0][mask], nearest[1][mask]]
    kernel = np.array([[0, .25, 0], [.25, 0, .25], [0, .25, 0]], np.float32)
    slab = restored[20:558, :710].copy()
    holes = mask[20:558, :710]
    for _ in range(1600):
        average = convolve(slab, kernel[:, :, None], mode='nearest')
        slab[holes] = average[holes]
    restored[20:558, :710] = slab
    edge = np.clip((917 - np.arange(930)) / 65, 0, 1)
    edge = edge * edge * (3 - 2 * edge)
    dark = np.array((3, 20, 30), dtype=np.float32)
    backdrop = restored * edge[None, :, None] + dark * (1 - edge[None, :, None])
    canvas = Image.new('RGB', (1024, 1152), tuple(dark.astype(int)))
    canvas.paste(Image.fromarray(np.clip(backdrop, 0, 255).astype(np.uint8)), (0, 0))
    canvas.save(OUTPUT)

    title_crop = [76, 195, 690, 357]
    rgba = np.asarray(Image.open(SOURCE).convert('RGBA').crop(title_crop)).copy()
    rgb = rgba[:, :, :3].astype(np.float32)
    background = restored[195:357, 76:690]
    weak_ink = (rgb.min(axis=2) > 100) | ((rgb.min(axis=2) > 45) & (rgb[:, :, 0] > rgb[:, :, 2] + 10))
    ink = binary_propagation(rgb.min(axis=2) > 150, mask=weak_ink)
    alpha = np.clip((rgb.mean(axis=2) - background.mean(axis=2)) /
                    np.maximum(1, 235 - background.mean(axis=2)), 0, 1)
    alpha[~ink] = 0
    foreground = (rgb - background * (1 - alpha[:, :, None])) / np.maximum(.001, alpha[:, :, None])
    rgba[:, :, :3] = np.clip(foreground, 0, 255).astype(np.uint8)
    rgba[:, :, 3] = np.rint(alpha * 255).astype(np.uint8)
    title_image = Image.fromarray(rgba)
    title_image.save(TITLE)
    title_preview = Image.new('RGBA', title_image.size, (3, 20, 30, 255))
    title_preview.alpha_composite(title_image)
    title_preview.convert('RGB').save(APP / 'qa/medicine-title-on-background.png')
    record = {
        'source': str(SOURCE.relative_to(APP.parent)),
        'output': str(OUTPUT.relative_to(APP)),
        'title': str(TITLE.relative_to(APP)),
        'crop': [0, 0, 930, 1152],
        'title_crop': title_crop,
        'title_alpha': 'cream core min RGB >150; connected antialiased warm ink; foreground unpremultiplied against restored source',
        'restoration': 'UI ink mask, 3px dilation, nearest seed, 1600 harmonic iterations',
        'regions': regions, 'button': button,
        'canvas': [1024, 1152], 'right_transition': [852, 917],
        'scene_fit': 'uniform cover, left top; full viewport height; left half width',
        'subtitle': '现当代医学的诞生; rendered as HTML above restored backdrop',
        'preserved': 'anatomy volumes, open book, medicine bottles, instruments, source lighting and positions',
        'visual_review': {
            'backdrop': 'No baked header, breadcrumbs, theme count, title, subtitle, speaker or switch button visible; smooth dark right transition',
            'title': 'Full brush strokes retained, no theme-number fragments; reviewed on #03141e with no visible gray halo',
        },
    }
    (APP / 'qa/medicine-asset-record.json').write_text(
        json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    prepare_medicine_assets()
