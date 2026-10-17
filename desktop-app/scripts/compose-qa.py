from pathlib import Path
from PIL import Image, ImageDraw
APP = Path(__file__).resolve().parents[1]
ROOT = APP.parent
QA = APP / 'qa'
pairs = [
    ('home-2048', 'design/homepage/v4/homepage-cinematic-handwritten.png', 'home-2048-final.png'),
    ('directory-2048', 'design/interior/v2/module-directory-astronomy.png', 'directory-2048-final.png'),
    ('directory-1280', 'design/interior/v2/module-directory-astronomy-1280.png', 'directory-1280-final.png'),
    ('player-2048', 'design/interior/v2/video-player-copernicus.png', 'player-2048-final.png'),
    ('player-1280', 'design/interior/v2/video-player-copernicus-1280.png', 'player-1280-final.png'),
    ('long-title-1280', 'design/interior/v2/video-player-astronomy-04-1280-long-title.png', 'long-title-1280-final.png'),
    ('panel-1280', 'design/interior/v2/video-player-copernicus-1280-directory-open.png', 'panel-1280-final.png'),
]
for name, source, target in pairs:
    if not (QA / target).exists(): continue
    a = Image.open(ROOT / source).convert('RGB')
    b = Image.open(QA / target).convert('RGB')
    assert a.size == b.size, (name, a.size, b.size)
    w,h = a.size
    canvas = Image.new('RGB', (w*2,h+30), '#03141e')
    canvas.paste(a,(0,30)); canvas.paste(b,(w,30))
    d=ImageDraw.Draw(canvas); d.text((10,8),'APPROVED REFERENCE',fill='white');d.text((w+10,8),'INTERACTIVE PROTOTYPE',fill='white')
    canvas.save(QA / f'comparison-{name}.png')
    if name in ['directory-1280','long-title-1280','player-1280']:
        height = 300 if name=='directory-1280' else 180
        focused = Image.new('RGB',(w*2,height))
        focused.paste(a.crop((0,50,w,50+height)),(0,0));focused.paste(b.crop((0,50,w,50+height)),(w,0))
        focused.save(QA / f'focused-{name}.png')
print('Saved normalized reference/prototype comparison images.')
