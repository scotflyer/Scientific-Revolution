"""Recover the physics scene and separate the approved brush title.

All scene pixels come from the approved local review image. Only baked-in UI
is repaired; the pendulum, balance, manuscript and lighting stay in place.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, distance_transform_edt, convolve

APP = Path(__file__).resolve().parents[1]
SOURCE = APP.parent / 'design/interior/modules-v1/module-directory-physics.png'
OUTPUT = APP / 'public/assets/physics-backdrop.png'
TITLE_OUTPUT = APP / 'public/assets/title-physics.png'
TITLE_CROP = (76, 198, 605, 431)
REGIONS = [
    (78, 26, 254, 77, 'light'),
    (78, 90, 456, 125, 'breadcrumb'),
    (80, 158, 332, 195, 'gold'),
    (76, 198, 605, 431, 'brush'),
    (84, 446, 457, 512, 'light'),
]
BUTTON = (87, 532, 305, 590)
BACKGROUND = np.array((3, 20, 30), dtype=np.float32)


def ink_mask(rgb, kind):
    # Warm instruments retain their dark blue component. Ivory UI ink has
    # high blue as well as red/green, including the thin brush antialiasing.
    minimum = rgb.min(axis=2)
    if kind == 'gold':
        return (rgb[:, :, 0] > 135) & (rgb[:, :, 1] > 92) & (rgb[:, :, 2] > 45)
    if kind == 'breadcrumb':
        return (minimum > 75) | ((rgb[:, :, 0] > 90) & (rgb[:, :, 1] > 60))
    if kind == 'brush':
        return (minimum > 95) | ((minimum > 45) & (rgb[:, :, 0] > rgb[:, :, 2] + 10)
            & (rgb[:, :, 1] > rgb[:, :, 2] + 8) & (rgb[:, :, 0] - rgb[:, :, 1] < 55))
    return minimum > 100


def prepare_physics_assets():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    (APP / 'qa').mkdir(parents=True, exist_ok=True)
    original = Image.open(SOURCE).convert('RGB')
    pixels = np.asarray(original.crop((0, 0, 930, 1152))).astype(np.float32)
    mask = np.zeros(pixels.shape[:2], dtype=bool)
    title_ink = None
    for x0, y0, x1, y1, kind in REGIONS:
        ink = ink_mask(pixels[y0:y1, x0:x1], kind)
        if kind == 'brush':
            title_ink = ink.copy()
        mask[y0:y1, x0:x1] |= binary_dilation(ink, iterations=3)
    x0, y0, x1, y1 = BUTTON
    mask[y0:y1, x0:x1] = True

    # Seed each UI hole from nearby scene pixels, then interpolate only the
    # holes. This preserves the structure and colour of the experimental post.
    _, nearest = distance_transform_edt(mask, return_indices=True)
    restored = pixels.copy()
    restored[mask] = pixels[nearest[0][mask], nearest[1][mask]]
    # The two title strokes obscure the illuminated wooden post. Continue
    # the same original post texture upward inside those UI holes so its
    # golden vertical face does not turn into a dark blur after restoration.
    for y in range(300, 431):
        for x in range(492, 557):
            if mask[y, x]:
                restored[y, x] = pixels[y + 160, x]
    kernel = np.array([[0, .25, 0], [.25, 0, .25], [0, .25, 0]], np.float32)
    slab = restored[20:598, :700].copy()
    holes = mask[20:598, :700]
    structural = np.zeros(holes.shape, dtype=bool)
    structural[280:411, 492:557] = holes[280:411, 492:557]
    structure_seed = slab.copy()
    for _ in range(1800):
        average = convolve(slab, kernel[:, :, None], mode='nearest')
        slab[holes] = average[holes]
        slab[structural] = average[structural] * .3 + structure_seed[structural] * .7
    restored[20:598, :700] = slab

    edge = np.clip((917 - np.arange(930)) / 65, 0, 1)
    edge = edge * edge * (3 - 2 * edge)
    backdrop = restored * edge[None, :, None] + BACKGROUND * (1 - edge[None, :, None])
    canvas = Image.new('RGB', (1024, 1152), tuple(BACKGROUND.astype(int)))
    canvas.paste(Image.fromarray(np.clip(backdrop, 0, 255).astype(np.uint8)), (0, 0))
    canvas.save(OUTPUT)

    x0, y0, x1, y1 = TITLE_CROP
    rgb = pixels[y0:y1, x0:x1]
    background = restored[y0:y1, x0:x1]
    # Recover foreground colour after subtracting the repaired background;
    # transparent pixels carry no dark source rectangle or grey fringe.
    alpha = np.clip((rgb.mean(axis=2) - background.mean(axis=2)) /
                    np.maximum(1, 235 - background.mean(axis=2)), 0, 1)
    # The title has a few isolated warm scene flecks in its bounding box;
    # retain connected brush strokes and discard small nonletter components.
    from scipy.ndimage import label
    labels, count = label(title_ink)
    sizes = np.bincount(labels.ravel())
    title_ink &= sizes[labels] > 30
    alpha[~title_ink] = 0
    foreground = (rgb - background * (1 - alpha[:, :, None])) / np.maximum(.001, alpha[:, :, None])
    rgba = np.zeros((*rgb.shape[:2], 4), dtype=np.uint8)
    rgba[:, :, :3] = np.clip(foreground, 0, 255).astype(np.uint8)
    rgba[:, :, 3] = np.rint(alpha * 255).astype(np.uint8)
    rgba[rgba[:, :, 3] == 0, :3] = 0
    Image.fromarray(rgba).save(TITLE_OUTPUT)

    record = {
        'source': str(SOURCE.relative_to(APP.parent)),
        'output': str(OUTPUT.relative_to(APP)),
        'crop': [0, 0, 930, 1152], 'canvas': [1024, 1152],
        'restoration': 'UI ink mask, 3px dilation, nearest source seed, 1800 harmonic iterations',
        'regions': REGIONS, 'button': BUTTON,
        'right_transition': [852, 917], 'background': '#03141e',
        'title': str(TITLE_OUTPUT.relative_to(APP)), 'title_crop': TITLE_CROP,
        'title_ink': 'minimum >95 or warm ivory minimum >45, red-green <55; discard components <=30px',
        'post_repair': 'UI holes x492:557/y300:431 reuse source post texture from y+160; 70% texture constraint',
        'scene_fit': 'uniform cover, left top; full viewport height; left half width',
        'validation': 'Inspect backdrop and title at original size for leftover UI, seams and coloured fringe.',
    }
    (APP / 'qa/physics-asset-record.json').write_text(
        json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    prepare_physics_assets()
