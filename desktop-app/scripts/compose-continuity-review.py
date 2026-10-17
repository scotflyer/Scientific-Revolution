"""Compare complete revised scenes, approved boards and corrected pages."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

APP = Path(__file__).resolve().parents[1]
QA = APP / 'qa'
FONT = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 23)
LABELS = {'exchange': '科学之光', 'china': '科学革命在中国'}

for width, height in [(2048, 1152), (1280, 720)]:
    for theme, label in LABELS.items():
        folder = APP.parent / 'design/interior/modules-v2'
        raw = Image.open(folder / f'module-directory-{theme}-generated.png').convert('RGB')
        approved = Image.open(folder / f'module-directory-{theme}.png').convert('RGB')
        after = Image.open(QA / f'{theme}-continuity-{width}-after.png').convert('RGB')
        board = Image.new('RGB', (width * 2, height + 52), '#10202b')
        draw = ImageDraw.Draw(board)
        draw.text((20, 10), f'{label} · 已确认稿', font=FONT, fill='#f2e8d8')
        draw.text((width + 20, 10), '修正后实际页面 · 连续场景', font=FONT, fill='#f2e8d8')
        board.paste(approved.resize((width, height), Image.Resampling.LANCZOS), (0, 52))
        board.paste(after, (width, 52))
        board.save(QA / f'{theme}-continuity-comparison-{width}.png')
        # Match the source scale used for the single continuous scene. This
        # focus board reveals geometry, fit and whether objects remain whole.
        focus_width = width // 2
        focus = Image.new('RGB', (focus_width * 2, height + 52), '#10202b')
        ImageDraw.Draw(focus).text((20, 10), '原始完整场景 / 修正后实际页面', font=FONT, fill='#f2e8d8')
        source = raw.crop((0, 0, 930, 1152))
        source.thumbnail((focus_width, height), Image.Resampling.LANCZOS)
        focus.paste(source, (0, 52 + height - source.height))
        focus.paste(after.crop((0, 0, focus_width, height)), (focus_width, 52))
        focus.save(QA / f'{theme}-continuity-focus-{width}.png')

overview = Image.new('RGB', (2112, 656), '#05141d')
for index, (theme, label) in enumerate(LABELS.items()):
    x = 24 + 1056 * index
    ImageDraw.Draw(overview).text((x, 20), label, font=FONT, fill='#f2e8d8')
    image = Image.open(QA / f'{theme}-continuity-2048-after.png')
    overview.paste(image.resize((1024, 576), Image.Resampling.LANCZOS), (x, 64))
overview.save(QA / 'two-themes-continuity-overview.png')
