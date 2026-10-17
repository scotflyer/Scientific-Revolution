"""Regenerate homepage-only artwork with the approved contour transparency.

Run independently of the content/video metadata pipeline. Contours are traced
in crop-local pixels from the source artwork, not a generic rounded rectangle.
The requested thumbnails use their generated or locally edited source images,
resized to the existing crop dimensions. Module UI geometry is preserved.
"""
from pathlib import Path
import json
import math
from PIL import Image, ImageDraw

APP = Path(__file__).resolve().parents[1]
SOURCE = 'design/homepage/v4/homepage-cinematic-handwritten.png'
SCENE_SOURCE = 'design/homepage/scene-v1/observatory-clean.png'
SCENE_CROP = (870, 96, 2048, 680)
SCENE_FADES = {'left': 200, 'bottom': 32}
DISPLAY_MASK_SIZE = (1178, 584)
DISPLAY_FADES = {'left': 72, 'bottom': 72}
GENERATED_THUMBNAILS = {
    2: 'design/homepage/thumbnails-v1/exchange-generated.png',
    3: 'design/homepage/thumbnails-v1/astronomy-generated.png',
    4: 'design/homepage/thumbnails-v1/physics-generated.png',
    6: 'design/homepage/china-brush-v1/china-brush.png',
}

# Crop dimensions and polygons preserve the delivered homepage geometry.
MODULES = [
    {'crop': (70, 686, 374, 877), 'feather': 8,
     'contour': [(4, 49), (15, 18), (43, 8), (50, 0), (75, 0), (87, 10), (111, 10),
                 (159, 5), (204, 3), (251, 6), (289, 4), (300, 16),
                 (300, 56), (302, 85), (298, 112), (302, 145),
                 (293, 177), (257, 187), (222, 183), (193, 187),
                 (150, 180), (110, 174), (75, 169), (42, 160),
                 (16, 151), (5, 129), (3, 99), (7, 72)]},
    {'crop': (390, 595, 723, 785), 'feather': 6,
     'contour': [(4, 30), (22, 16), (55, 7), (88, 6), (118, 11),
                 (150, 7), (184, 4), (228, 4), (261, 7), (295, 5),
                 (327, 12), (330, 43), (327, 79), (330, 116),
                 (327, 161), (302, 181), (270, 182), (238, 179),
                 (208, 183), (177, 182), (143, 185), (113, 188),
                 (81, 183), (58, 171), (39, 152), (17, 143),
                 (8, 116), (4, 79), (9, 52)]},
    {'crop': (744, 678, 1048, 880), 'feather': 8,
     'contour': [(6, 49), (21, 22), (44, 12), (76, 7), (103, 10),
                 (129, 5), (164, 8), (198, 11), (228, 16),
                 (263, 28), (282, 50), (294, 79), (297, 111),
                 (300, 143), (297, 178), (274, 191), (245, 198),
                 (213, 194), (182, 198), (150, 192), (112, 189),
                 (79, 184), (46, 179), (19, 171), (5, 151),
                 (7, 121), (3, 85)]},
    {'crop': (1060, 671, 1395, 812), 'feather': 8,
     'contour': [(3, 15), (28, 9), (62, 7), (101, 5), (137, 9),
                 (169, 4), (211, 8), (252, 4), (289, 9), (325, 11),
                 (331, 30), (328, 53), (332, 79), (322, 111),
                 (301, 134), (270, 136), (241, 132), (208, 137),
                 (170, 132), (139, 129), (107, 122), (73, 115),
                 (39, 111), (8, 112), (4, 86), (8, 60)]},
    {'crop': (1406, 726, 1680, 904), 'feather': 6,
     'contour': [(7, 76), (19, 48), (37, 28), (64, 16), (88, 10),
                 (119, 8), (145, 4), (176, 8), (200, 13),
                 (225, 22), (246, 36), (263, 52), (268, 80),
                 (270, 110), (267, 140), (259, 169), (235, 173),
                 (205, 175), (175, 171), (147, 175), (117, 171),
                 (86, 167), (59, 163), (32, 155), (11, 147),
                 (4, 123), (9, 102)]},
    {'crop': (1704, 678, 2000, 876), 'feather': 8,
     'contour': [(4, 22), (27, 14), (58, 11), (89, 8), (124, 10),
                 (159, 6), (195, 5), (230, 8), (261, 14), (288, 21),
                 (291, 51), (287, 85), (291, 115), (285, 150),
                 (269, 177), (243, 188), (207, 193), (174, 189),
                 (142, 194), (108, 187), (80, 185), (47, 180),
                 (18, 177), (6, 156), (4, 126), (8, 93), (3, 55)]},
]


def smoothstep(value):
    value = max(0, min(1, value))
    return value * value * (3 - 2 * value)


def edge_mask(size, fades):
    width, height = size
    left = fades.get('left', 0)
    top = fades.get('top', 0)
    bottom = fades.get('bottom', 0)
    xs = [smoothstep(x / left) if left else 1 for x in range(width)]
    ys = [(smoothstep(y / top) if top else 1) *
          (smoothstep((height - 1 - y) / bottom) if bottom else 1)
          for y in range(height)]
    mask = Image.new('L', size)
    mask.putdata([round(255 * xs[x] * ys[y])
                  for y in range(height) for x in range(width)])
    return mask


def contour_mask(size, contour, feather):
    inside = Image.new('L', size)
    ImageDraw.Draw(inside).polygon(contour, fill=255)
    segments = list(zip(contour, contour[1:] + contour[:1]))
    # Distance from the traced edge gives a small inward feather without
    # blurring RGB, bleeding beyond the crop, or creating a dark outer halo.
    values = []
    for y in range(size[1]):
        for x in range(size[0]):
            if not inside.getpixel((x, y)):
                values.append(0)
                continue
            distance = min(x, y, size[0] - 1 - x, size[1] - 1 - y, feather)
            for (ax, ay), (bx, by) in segments:
                dx, dy = bx - ax, by - ay
                ratio = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
                distance = min(distance, math.hypot(x - ax - ratio * dx, y - ay - ratio * dy))
            values.append(round(255 * smoothstep(distance / feather)))
    inside.putdata(values)
    return inside


def prepare_home_assets():
    assets = APP / 'public/assets'
    assets.mkdir(parents=True, exist_ok=True)
    source = Image.open(APP.parent / SOURCE).convert('RGBA')
    scene = Image.open(APP.parent / SCENE_SOURCE).convert('RGBA')
    scene.putalpha(edge_mask(scene.size, SCENE_FADES))
    scene.save(assets / 'observatory-home.png')
    # CSS stretches this raster mask to the rendered element, so object-fit
    # cropping at small viewports cannot remove the left/bottom transition.
    # Top/right stay opaque so the scene reaches the viewport edges.
    display_mask = Image.new('RGBA', DISPLAY_MASK_SIZE, 'white')
    display_mask.putalpha(edge_mask(DISPLAY_MASK_SIZE, DISPLAY_FADES))
    display_mask.save(assets / 'home-scene-mask.png')
    for index, spec in enumerate(MODULES, 1):
        replacement = GENERATED_THUMBNAILS.get(index)
        if replacement:
            left, top, right, bottom = spec['crop']
            image = Image.open(APP.parent / replacement).convert('RGBA').resize(
                (right - left, bottom - top), Image.Resampling.LANCZOS)
        else:
            image = source.crop(spec['crop'])
        image.putalpha(contour_mask(image.size, spec['contour'], spec['feather']))
        image.save(assets / f'home-module-{index}.png')
    record_path = assets / 'source-record.json'
    record = json.loads(record_path.read_text(encoding='utf-8')) if record_path.exists() else {}
    record['homepageEdges'] = {
        'source': SOURCE,
        'scene': {'output': 'observatory-home.png', 'source': SCENE_SOURCE,
                  'originalCrop': SCENE_CROP, 'fadePixels': SCENE_FADES,
                  'generationRecord': 'design/homepage/scene-v1/generation-record.json'},
        'displayMask': {'output': 'home-scene-mask.png', 'size': DISPLAY_MASK_SIZE, 'fadePixels': DISPLAY_FADES},
        'modules': [{'output': f'home-module-{index}.png', **spec,
                     **({'source': GENERATED_THUMBNAILS[index], 'sourceTransform': 'resize-to-existing-crop-dimensions'}
                        if index in GENERATED_THUMBNAILS else {})}
                    for index, spec in enumerate(MODULES, 1)],
        'thumbnailGeneration': 'design/homepage/thumbnails-v1/generation-record.json',
        'chinaThumbnailEdit': 'design/homepage/china-brush-v1/generation-record.json',
        'notes': 'Homepage themes 2/3/4 use the user-requested generated artwork with existing crop dimensions and contour alpha. Theme 6 replaces the fountain pen with a traditional Chinese brush using a local composited edit. The scene removes the lower-left brass optical parts using a local composited repair. Other v4 artwork is preserved. Only left/bottom scene fade; top/right extend to viewport. Interior assets unchanged.',
    }
    record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Prepared homepage contour PNGs, the locally repaired scene and display mask.')


if __name__ == '__main__':
    prepare_home_assets()
