"""Compose matched viewport screenshots with the approved theme designs."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

APP = Path(__file__).resolve().parents[1]
QA = APP / 'qa'
FONT = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 23)
THEMES = ['foundations', 'exchange', 'physics', 'medicine', 'china']
LABELS = {'astronomy': '天文学革命', 'foundations': '科学革命的基本问题',
          'exchange': '科学之光', 'physics': '新物理学的诞生',
          'medicine': '医学革命', 'china': '科学革命在中国'}
for width, height in [(2048, 1152), (1280, 720)]:
    overview = Image.new('RGB', (width * 2, (height + 52) * 5), '#10202b')
    for index, theme in enumerate(THEMES):
        version = 'modules-v2' if theme in ['exchange', 'china'] else 'modules-v1'
        reference = Image.open(APP.parent / f'design/interior/{version}/module-directory-{theme}.png').convert('RGB')
        if width == 1280:
            reference = reference.resize((width, height), Image.Resampling.LANCZOS)
        actual = Image.open(QA / f'{theme}-theme-{width}-after.png').convert('RGB')
        assert reference.size == actual.size == (width, height)
        board = Image.new('RGB', (width * 2, height + 52), '#10202b')
        draw = ImageDraw.Draw(board)
        draw.text((20, 10), f'{LABELS[theme]} · 已确认设计图', font=FONT, fill='#f2e8d8')
        draw.text((width + 20, 10), f'实际页面 · {width} × {height}', font=FONT, fill='#f2e8d8')
        board.paste(reference, (0, 52))
        board.paste(actual, (width, 52))
        board.save(QA / f'{theme}-theme-comparison-{width}.png')
        focus_width = round(width * .44)
        focus = Image.new('RGB', (focus_width * 2, height + 52), '#10202b')
        ImageDraw.Draw(focus).text((20, 10), f'{LABELS[theme]} · 左侧细节：设计图 / 实际页面', font=FONT, fill='#f2e8d8')
        focus.paste(reference.crop((0, 0, focus_width, height)), (0, 52))
        focus.paste(actual.crop((0, 0, focus_width, height)), (focus_width, 52))
        focus.save(QA / f'{theme}-theme-focus-{width}.png')
        overview.paste(board, (0, (height + 52) * index))
    overview.save(QA / f'five-themes-comparison-{width}.png')

overview = Image.new('RGB', (2112, 1948), '#05141d')
for index, theme in enumerate(['astronomy', *THEMES]):
    x, y = 24 + (index % 2) * 1056, 24 + (index // 2) * 642
    ImageDraw.Draw(overview).text((x, y), LABELS[theme], font=FONT, fill='#f2e8d8')
    overview.paste(Image.open(QA / f'{theme}-theme-2048-after.png').resize((1024, 576), Image.Resampling.LANCZOS), (x, y + 52))
overview.save(QA / 'six-themes-implemented-overview.png')
