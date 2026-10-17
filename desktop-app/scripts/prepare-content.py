"""Derive prototype assets and metadata from the approved local material."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json
import subprocess
from PIL import Image, ImageDraw
from prepare_home_assets import prepare_home_assets
from importlib import util

APP = Path(__file__).resolve().parents[1]
ROOT = APP.parent
ASSETS = APP / 'public' / 'assets'
ASSETS.mkdir(parents=True, exist_ok=True)
home = Image.open(ROOT / 'design/homepage/v4/homepage-cinematic-handwritten.png').convert('RGBA')

def fade_left(im, width):
    mask = Image.new('L', im.size, 255)
    draw = ImageDraw.Draw(mask)
    for x in range(width):
        draw.line((x, 0, x, im.height), fill=round(255 * x / width))
    im.putalpha(mask)
    return im

fade_left(home.crop((870, 96, 2048, 680)), 200).save(ASSETS / 'observatory.png')
boxes = [(70, 686, 374, 877), (390, 595, 723, 785), (744, 678, 1048, 880),
         (1060, 671, 1395, 812), (1406, 726, 1680, 904), (1704, 678, 2000, 876)]
for i, box in enumerate(boxes, 1):
    home.crop(box).save(ASSETS / f'module-{i}.png')

def extract_lettering(im, box, output):
    title = im.crop(box).convert('RGBA')
    pixels = title.load()
    for y in range(title.height):
        for x in range(title.width):
            r, g, b, _ = pixels[x, y]
            alpha = max(0, min(255, round((min(r, g, b) - 100) * 2.5)))
            pixels[x, y] = (r, g, b, alpha)
    title.save(ASSETS / output)

extract_lettering(home, (95, 156, 773, 322), 'title-scientific-revolution.png')
directory = Image.open(ROOT / 'design/interior/v2/module-directory-astronomy.png').convert('RGBA')
extract_lettering(directory, (76, 202, 680, 345), 'title-astronomy.png')
directory.crop((708, 95, 855, 460)).save(ASSETS / 'astronomy-sky.png')
astronomy_spec = util.spec_from_file_location('prepare_astronomy_assets', APP / 'scripts/prepare-astronomy-assets.py')
astronomy_assets = util.module_from_spec(astronomy_spec)
astronomy_spec.loader.exec_module(astronomy_assets)
astronomy_assets.prepare_astronomy_assets()
player = Image.open(ROOT / 'design/interior/v2/video-player-copernicus.png').convert('RGB')
player.crop((0, 95, 76, 1040)).save(ASSETS / 'player-edge-left.jpg', quality=92)
player.crop((1990, 95, 2048, 1040)).save(ASSETS / 'player-edge-right.jpg', quality=92)

modules = []
lessons = []
module_ids = ['foundations', 'exchange', 'astronomy', 'physics', 'medicine', 'china']
short_names = ['科学革命的基本问题', '科学之光', '天文学革命', '新物理学的诞生', '医学革命', '从“格致”到“科学”']
for line in (ROOT / '内容映射核对.md').read_text(encoding='utf-8').splitlines():
    cells = [c.strip() for c in line.strip().strip('|').split('|')]
    if len(cells) != 7 or not cells[1].isdigit():
        continue
    title, number, lesson_title, speaker, role, video_path, _ = cells
    if not modules or modules[-1]['title'] != title:
        index = len(modules)
        modules.append({'id': module_ids[index], 'title': title, 'shortTitle': short_names[index],
                        'order': index+1, 'videoFolder': str(Path(video_path).parent).replace('\\', '/'),
                        'image': f'/assets/module-{index+1}.png'})
    module = modules[-1]
    lessons.append({'id': f"{module['id']}-{int(number):02d}", 'moduleId': module['id'],
                    'number': int(number), 'title': lesson_title, 'speaker': speaker,
                    'speakerRole': role, 'relativeVideoPath': video_path})

def probe(lesson):
    result = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                             '-of', 'json', str(ROOT / lesson['relativeVideoPath'])],
                            capture_output=True, text=True, encoding='utf-8', check=True)
    lesson['durationSeconds'] = float(json.loads(result.stdout)['format']['duration'])
    return lesson

with ThreadPoolExecutor(max_workers=4) as pool:
    lessons = list(pool.map(probe, lessons))
for module in modules:
    module['lessonCount'] = sum(l['moduleId'] == module['id'] for l in lessons)
manifest = {'schemaVersion': 1, 'publication': {'id': 'scientific-revolution', 'title': '科学革命',
            'subtitle': '科学思想的变革和科学精神的塑造', 'producer': '国家开放大学',
            'publisher': '国家开放大学音像出版社'}, 'modules': modules, 'lessons': lessons}
(APP / 'src/content.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
(ASSETS / 'source-record.json').write_text(json.dumps({'source': 'approved local visual assets',
    'home': 'design/homepage/v4/homepage-cinematic-handwritten.png',
    'directory': 'design/interior/v2/module-directory-astronomy.png',
    'notes': 'Prototype lettering is extracted raster display artwork; official distribution font licensing remains pending.',
    'moduleCropBoxes': boxes}, ensure_ascii=False, indent=2), encoding='utf-8')
prepare_home_assets()
print(f'Prepared {len(modules)} modules, {len(lessons)} lessons; videos read in place.')
