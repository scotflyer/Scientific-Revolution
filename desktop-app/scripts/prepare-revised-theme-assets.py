"""Separate approved lettering from each complete revised historical scene.

The review boards contain stretched upper backgrounds and separately resized
lower scenes. Use the original revised image for the backdrop instead: remove
its interface, fit the entire scene once, and blend only the outside edges.
No image API calls are made. Requires Pillow, numpy, scipy and opencv-python-headless.
"""
from pathlib import Path
import json
import numpy as np
import cv2
from PIL import Image
from scipy.ndimage import binary_dilation, binary_propagation, distance_transform_edt, convolve

APP = Path(__file__).resolve().parents[1]
SOURCE = APP.parent / 'design/interior/modules-v2'
PARAMETERS = {
    'exchange': {
        'title': [75, 203, 681, 348],
        'regions': [[78, 26, 255, 78], [78, 90, 757, 122],
                    [78, 158, 352, 198], [75, 200, 684, 350],
                    [78, 354, 633, 403], [78, 414, 256, 445],
                    [78, 447, 470, 478]],
        'button': [86, 493, 305, 551],
        'sceneRegions': [[78, 26, 255, 78], [78, 88, 757, 122],
                         [72, 151, 548, 306], [80, 307, 465, 343],
                         [80, 350, 257, 384], [80, 384, 457, 417]],
        'sceneButton': [87, 434, 304, 494],
        # Fill the complete left-half canvas at its native scene scale.
        # The earlier .77 fit made the visual scene much smaller than the
        # approved directory composition.
        'sceneScale': 1,
    },
    'china': {
        'title': [75, 198, 601, 427],
        'regions': [[78, 26, 255, 78], [78, 90, 690, 122],
                    [78, 151, 341, 194], [73, 196, 604, 430],
                    [78, 437, 376, 485], [78, 494, 333, 529],
                    [78, 530, 450, 560]],
        'button': [86, 574, 303, 633],
        'sceneRegions': [[78, 26, 255, 78], [78, 88, 685, 122],
                         [64, 195, 756, 320], [80, 346, 337, 381],
                         [80, 383, 454, 417]],
        'sceneButton': [87, 434, 304, 494],
        # Keep the full Chinese scene at the same left-half scale as the
        # approved composition rather than leaving a large empty field.
        'sceneScale': 1,
    },
}


def continuous_scene(theme, params):
    path = SOURCE / f'module-directory-{theme}-generated.png'
    pixels = np.asarray(Image.open(path).convert('RGB').crop((0, 0, 930, 1152)))
    mask = np.zeros(pixels.shape[:2], dtype=bool)
    for index, (x0, y0, x1, y1) in enumerate(params['sceneRegions']):
        rgb = pixels[y0:y1, x0:x1].astype(np.float32)
        # White letter cores with connected antialiasing exclude the bronze
        # rings and marble sculpture. Breadcrumb also includes the gold link.
        weak = (rgb.min(axis=2) > 70) | ((rgb.min(axis=2) > 40) &
                (rgb[:, :, 0] > rgb[:, :, 2] + 10) & (rgb[:, :, 0] > 100))
        ink = binary_propagation(rgb.min(axis=2) > 135, mask=weak)
        if theme == 'exchange' and index == 2:
            ink |= weak
        if index != 2:
            ink |= rgb.min(axis=2) > 95
        if index == 1:
            ink |= (rgb[:, :, 0] > 110) & (rgb[:, :, 1] > 80)
        mask[y0:y1, x0:x1] |= binary_dilation(ink, iterations=3)
    x0, y0, x1, y1 = params['sceneButton']
    mask[y0:y1, x0:x1] = True
    if theme == 'exchange':
        # The generated role contains low contrast garbled lettering here.
        mask[384:417, 308:457] = True
    # Local image restoration avoids the old stretched horizontal strips.
    restored = cv2.inpaint(pixels, mask.astype(np.uint8) * 255, 4, cv2.INPAINT_TELEA)
    scale = params['sceneScale']
    scene = Image.fromarray(restored).resize((round(930 * scale), round(1152 * scale)),
                                            Image.Resampling.LANCZOS)
    width, height = scene.size
    top = 1152 - height
    rgb = np.asarray(scene).astype(np.float32)
    dark = np.array((3, 20, 30), dtype=np.float32)
    # One uniformly fitted image; no internal cuts, patches or stretched bands.
    horizontal = np.clip((width - 1 - np.arange(width)) / round(65 * scale), 0, 1)
    horizontal = horizontal * horizontal * (3 - 2 * horizontal)
    # Keep the scene opaque at the page's upper edge; blend only to the right.
    weight = horizontal[None, :, None]
    rgb = rgb * weight + dark * (1 - weight)
    canvas = Image.new('RGB', (1024, 1152), (3, 20, 30))
    canvas.paste(Image.fromarray(np.uint8(np.clip(rgb, 0, 255))), (0, top))
    canvas.save(APP / f'public/assets/{theme}-backdrop.png')
    return {'sceneSource': str(path.relative_to(APP.parent)),
            'sceneCrop': [0, 0, 930, 1152], 'sceneSize': [width, height],
            'sceneOrigin': [0, top], 'topEdgeFade': 0,
            'rightEdgeFade': round(65 * scale),
            'sceneRestoration': 'Connected UI ink, 3px dilation, Telea radius 4; single uniform fit'}


def prepare(theme, params):
    path = SOURCE / f'module-directory-{theme}.png'
    pixels = np.asarray(Image.open(path).convert('RGB').crop((0, 0, 930, 1152))).astype(np.float32)
    mask = np.zeros(pixels.shape[:2], dtype=bool)
    for x0, y0, x1, y1 in params['regions']:
        rgb = pixels[y0:y1, x0:x1]
        ink = (rgb.min(axis=2) > 95) | ((rgb.min(axis=2) > 45) & (rgb[:, :, 0] > rgb[:, :, 2] + 10))
        mask[y0:y1, x0:x1] |= binary_dilation(ink, iterations=3)
    x0, y0, x1, y1 = params['button']
    mask[y0:y1, x0:x1] = True
    _, nearest = distance_transform_edt(mask, return_indices=True)
    restored = pixels.copy()
    restored[mask] = pixels[nearest[0][mask], nearest[1][mask]]
    kernel = np.array([[0, .25, 0], [.25, 0, .25], [0, .25, 0]], np.float32)
    slab, holes = restored[20:750, :770].copy(), mask[20:750, :770]
    for _ in range(1600):
        average = convolve(slab, kernel[:, :, None], mode='nearest')
        slab[holes] = average[holes]
    restored[20:750, :770] = slab
    x0, y0, x1, y1 = params['title']
    rgb = pixels[y0:y1, x0:x1]
    background = restored[y0:y1, x0:x1]
    ink = (rgb.min(axis=2) > 95) | ((rgb.min(axis=2) > 45) & (rgb[:, :, 0] > rgb[:, :, 2] + 10))
    alpha = np.clip((rgb.mean(axis=2) - background.mean(axis=2)) / np.maximum(1, 235 - background.mean(axis=2)), 0, 1)
    alpha[~ink] = 0
    foreground = (rgb - background * (1 - alpha[:, :, None])) / np.maximum(.001, alpha[:, :, None])
    rgba = np.zeros((*alpha.shape, 4), dtype=np.uint8)
    rgba[:, :, :3] = np.uint8(np.clip(foreground, 0, 255))
    rgba[:, :, 3] = np.uint8(np.rint(alpha * 255))
    Image.fromarray(rgba).save(APP / f'public/assets/title-{theme}.png')
    scene_record = continuous_scene(theme, params)
    return {'theme': theme, 'source': str(path.relative_to(APP.parent)),
            'crop': [0, 0, 930, 1152], 'canvas': [1024, 1152],
            'titleRestoration': 'UI ink mask, dilation 3px, nearest seed, harmonic 1600 iterations',
            **params, **scene_record}


if __name__ == '__main__':
    records = [prepare(theme, params) for theme, params in PARAMETERS.items()]
    (APP / 'qa/revised-theme-asset-record.json').write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
