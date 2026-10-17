"""Compare this scoped scene/layer revision without overwriting edge QA evidence."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

APP = Path(__file__).resolve().parents[1]
QA = APP / 'qa'
source = Image.open(APP.parent / 'design/homepage/v4/homepage-cinematic-handwritten.png').convert('RGB')
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 20)

for width, height in [(2048, 1152), (1280, 720)]:
    reference = source.resize((width, height), Image.Resampling.LANCZOS)
    before = Image.open(QA / f'home-edges-{width}-after.png').convert('RGB')
    after = Image.open(QA / f'home-immersive-{width}.png').convert('RGB')
    assert before.size == after.size == (width, height)
    views = [('Approved source (latest feedback changes CTA/scene)', reference),
             ('Previous prototype', before), ('Updated prototype', after)]
    full = Image.new('RGB', (width * 3, height + 38), '#20252b')
    draw = ImageDraw.Draw(full)
    for index, (label, view) in enumerate(views):
        draw.text((index * width + 12, 8), label, font=font, fill='white')
        full.paste(view, (index * width, 38))
    full.save(QA / f'comparison-home-immersive-{width}.png')
    scale = width / 2048
    regions = [('Top / right edge and navigation', (1320, 0, 2048, 180)),
               ('Primary CTA / staggered module overlap', (100, 490, 800, 770)),
               ('Scene bottom / overlaid modules', (1020, 610, 2048, 920))]
    crops = [(label, tuple(round(v * scale) for v in box)) for label, box in regions]
    focused = Image.new('RGB', (max(box[2] - box[0] for _, box in crops) * 3,
                                sum(box[3] - box[1] + 38 for _, box in crops)), '#20252b')
    draw = ImageDraw.Draw(focused)
    y = 0
    for label, box in crops:
        tile_width, tile_height = box[2] - box[0], box[3] - box[1]
        for index, (state, view) in enumerate(views):
            draw.text((index * tile_width + 6, y + 8), f'{label} / {state.split(" (")[0]}', font=font, fill='white')
            focused.paste(view.crop(box), (index * tile_width, y + 38))
        y += tile_height + 38
    focused.save(QA / f'focused-home-immersive-{width}.png')
print('Saved full and focused reference / previous / updated homepage comparisons.')
