"""Restore a continuous astronomy backdrop from the approved source pixels.

Only baked-in interface lettering is removed. The starfield, architecture,
instruments and books retain their source positions; no paid image request.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, distance_transform_edt, convolve

APP = Path(__file__).resolve().parents[1]
SOURCE = APP.parent / 'design/interior/v2/module-directory-astronomy.png'
OUTPUT = APP / 'public/assets/astronomy-backdrop.png'


def prepare_astronomy_assets():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    (APP / 'qa').mkdir(parents=True, exist_ok=True)
    # Includes the original dark transition into the lesson column.
    source = Image.open(SOURCE).convert('RGB').crop((0, 0, 930, 1152))
    pixels = np.asarray(source).astype(np.float32)
    mask = np.zeros(pixels.shape[:2], dtype=bool)
    # Editable interface text only, with a margin around its antialiasing.
    regions = [
        (78, 26, 250, 76, 'light'),
        (78, 90, 411, 122, 'all'),
        (80, 158, 332, 194, 'all'),
        (75, 199, 690, 349, 'lettering'),
        (80, 349, 455, 411, 'light'),
    ]
    for x0, y0, x1, y1, kind in regions:
        rgb = pixels[y0:y1, x0:x1]
        ink = rgb.min(axis=2) > 100
        if kind == 'all':
            ink |= (rgb[:, :, 0] > 105) & (rgb[:, :, 1] > 75)
        if kind == 'lettering':
            ink |= (rgb.min(axis=2) > 45) & (rgb[:, :, 0] > rgb[:, :, 2] + 10)
        mask[y0:y1, x0:x1] |= binary_dilation(ink, iterations=3)
    # Remove the outline button, including border and arrow.
    mask[435:494, 87:305] = True
    # Harmonic restoration acts only on the masked UI pixels. Nearest source
    # pixels seed the solve; the surrounding archival texture stays intact.
    _, nearest = distance_transform_edt(mask, return_indices=True)
    restored = pixels.copy()
    restored[mask] = pixels[nearest[0][mask], nearest[1][mask]]
    kernel = np.array([[0, .25, 0], [.25, 0, .25], [0, .25, 0]], np.float32)
    # Restrict the calculation to the UI region for repeatable fast processing.
    slab = restored[20:502, :700].copy()
    holes = mask[20:502, :700]
    for _ in range(1600):
        average = convolve(slab, kernel[:, :, None], mode='nearest')
        slab[holes] = average[holes]
    restored[20:502, :700] = slab
    # Extend the natural dark edge across the remainder of the left half.
    # This also excludes the review image's right-column selection pixels.
    edge = np.clip((917 - np.arange(930)) / 65, 0, 1)
    edge = edge * edge * (3 - 2 * edge)
    dark = np.array((3, 20, 30), dtype=np.float32)
    backdrop = restored * edge[None, :, None] + dark * (1 - edge[None, :, None])
    canvas = Image.new('RGB', (1024, 1152), tuple(dark.astype(int)))
    canvas.paste(Image.fromarray(np.clip(backdrop, 0, 255).astype(np.uint8)), (0, 0))
    canvas.save(OUTPUT)
    # Preserve the approved ivory brush lettering as a separate foreground.
    title = Image.open(SOURCE).convert('RGBA').crop((76, 202, 680, 345))
    rgba = np.asarray(title).copy()
    rgb = rgba[:, :, :3].astype(np.float32)
    background = restored[202:345, 76:680]
    ink = (rgb.min(axis=2) > 100) | ((rgb.min(axis=2) > 45) & (rgb[:, :, 0] > rgb[:, :, 2] + 10))
    alpha = np.clip((rgb.mean(axis=2) - background.mean(axis=2)) /
                    np.maximum(1, 235 - background.mean(axis=2)), 0, 1)
    alpha[~ink] = 0
    foreground = (rgb - background * (1 - alpha[:, :, None])) / np.maximum(.001, alpha[:, :, None])
    rgba[:, :, :3] = np.clip(foreground, 0, 255).astype(np.uint8)
    rgba[:, :, 3] = np.rint(alpha * 255).astype(np.uint8)
    Image.fromarray(rgba).save(APP / 'public/assets/title-astronomy.png')
    record = {
        'source': str(SOURCE.relative_to(APP.parent)),
        'output': str(OUTPUT.relative_to(APP)),
        'crop': [0, 0, 930, 1152],
        'restoration': 'UI ink mask, 3px dilation, nearest seed, 1600 harmonic iterations',
        'regions': regions, 'button': [87, 435, 305, 494],
        'canvas': [1024, 1152], 'right_transition': [852, 917],
        'scene_fit': 'uniform cover, left top; full viewport height; left half width',
    }
    (APP / 'qa/astronomy-asset-record.json').write_text(
        json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    prepare_astronomy_assets()
