"""Equal-size source/prototype views, plus enlarged edge comparisons."""
from pathlib import Path
import json
from PIL import Image, ImageDraw

APP = Path(__file__).resolve().parents[1]
QA = APP / 'qa'
source = Image.open(APP.parent / 'design/homepage/v4/homepage-cinematic-handwritten.png').convert('RGB')
before = json.loads((QA / 'home-edges-before.json').read_text(encoding='utf-8'))['views']
specs = json.loads((APP / 'public/assets/source-record.json').read_text(encoding='utf-8'))['homepageEdges']['modules']
for width in (2048, 1280):
    current = Image.open(QA / f'home-edges-{width}-after.png').convert('RGB')
    reference = source.resize(current.size, Image.Resampling.LANCZOS)
    height = current.height
    comparison = Image.new('RGB', (width * 2, height + 30), '#03131c')
    comparison.paste(reference, (0, 30))
    comparison.paste(current, (width, 30))
    draw = ImageDraw.Draw(comparison)
    draw.text((10, 8), 'APPROVED V4 / NORMALIZED REFERENCE', fill='white')
    draw.text((width + 10, 8), 'UPDATED INTERACTIVE HOMEPAGE', fill='white')
    comparison.save(QA / f'comparison-home-edges-{width}.png')
    # Every module: raw approved crop, delivered opaque asset, corrected alpha.
    tiles = Image.new('RGB', (960, 6 * 255), '#03131c')
    draw = ImageDraw.Draw(tiles)
    old = Image.open(QA / f'home-edges-{width}-before.png').convert('RGB')
    for index, (spec, entry) in enumerate(zip(specs, before[str(width)]['entries'])):
        r = entry['image']
        box = (round(r['x']), round(r['y']), round(r['x'] + r['width']), round(r['y'] + r['height']))
        images = [source.crop(spec['crop']), old.crop(box), current.crop(box)]
        y = index * 255
        for column, (label, image) in enumerate(zip(['REFERENCE', 'BEFORE', 'AFTER'], images)):
            draw.text((column * 320 + 8, y + 8), f'{index + 1:02d} {label}', fill='white')
            scale = min(310 / image.width, 215 / image.height)
            image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
            tiles.paste(image, (column * 320 + 5, y + 30))
    tiles.save(QA / f'focused-home-modules-{width}.png')
    scene = before[str(width)]['scene']
    bounds = (round(scene['x']), round(scene['y']), round(scene['x'] + scene['width']), round(scene['y'] + scene['height']))
    crop_width = bounds[2] - bounds[0]
    edges = Image.new('RGB', (crop_width * 2, 220), '#03131c')
    draw = ImageDraw.Draw(edges)
    for column, image in enumerate([old, current]):
        draw.text((column * crop_width + 8, 5), ['BEFORE', 'AFTER'][column], fill='white')
        edges.paste(image.crop((bounds[0], bounds[1] - 8, bounds[2], bounds[1] + 82)), (column * crop_width, 25))
        edges.paste(image.crop((bounds[0], bounds[3] - 78, bounds[2], bounds[3] + 12)), (column * crop_width, 125))
    edges.save(QA / f'focused-home-scene-edges-{width}.png')
print('Saved full homepage and enlarged module/scene comparisons at 2048 and 1280.')
