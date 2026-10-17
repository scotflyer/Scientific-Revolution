"""Regenerate all six approved theme backdrops and calligraphy assets."""
from pathlib import Path
import runpy

SCRIPTS = Path(__file__).resolve().parent
for name in ['foundations', 'astronomy', 'physics', 'medicine']:
    runpy.run_path(str(SCRIPTS / f'prepare-{name}-assets.py'), run_name='__main__')
runpy.run_path(str(SCRIPTS / 'prepare-revised-theme-assets.py'), run_name='__main__')
