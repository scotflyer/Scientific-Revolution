"""Assemble downloaded Actions artifacts and unchanged local media (Python 3.11+)."""
import hashlib
import json
import pathlib
import plistlib
import shutil
import struct
import zipfile
from datetime import datetime, timezone

APP = pathlib.Path(__file__).resolve().parents[1]
PROJECT = APP.parent
RELEASE = APP / 'release'
OUTPUT = RELEASE / 'Scientific-Revolution-0.1.0-USB'
DOWNLOADS = RELEASE / 'downloaded' / 'run-1'


def digest(filename):
    with filename.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def safe_extract(archive, destination):
    with zipfile.ZipFile(archive) as zipped:
        for entry in zipped.infolist():
            target = (destination / entry.filename).resolve()
            if not target.is_relative_to(destination.resolve()):
                raise ValueError(f'Unsafe archive entry: {entry.filename}')
            if (entry.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('Only the outer Actions archive may be extracted here.')
        zipped.extractall(destination)


def decoded_name(entry):
    # The Mac archiver stores UTF-8 names without the ZIP UTF-8 flag.
    if entry.flag_bits & 0x800:
        return entry.filename
    try:
        return entry.filename.encode('cp437').decode('utf-8')
    except UnicodeError:
        return entry.filename


def main():
    if OUTPUT.exists():
        raise FileExistsError(f'Refusing to overwrite {OUTPUT}')
    artifacts = {}
    for platform, archive_name in [
        ('windows', 'Scientific-Revolution-windows-x64-1.zip'),
        ('mac', 'Scientific-Revolution-mac-universal-1.zip'),
    ]:
        archive = RELEASE / archive_name
        destination = DOWNLOADS / platform
        safe_extract(archive, destination)
        package = destination / platform
        metadata = json.loads((package / 'build-info.json').read_text(encoding='utf-8'))
        if metadata['version'] != '0.1.0' or metadata['platform'] != platform:
            raise ValueError('Unexpected package version/platform')
        checked = 0
        unavailable = 0
        for line in (package / 'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
            expected, name = line.split('  ', 1)
            filename = (package / name).resolve()
            if not filename.is_relative_to(package.resolve()):
                raise ValueError('Unsafe checksum path')
            if not filename.is_file():
                if platform == 'mac' and (name.startswith('mac-universal/') or name in {
                    'builder-debug.yml', 'Scientific-Revolution-0.1.0-mac-universal.zip.blockmap',
                }):
                    unavailable += 1  # CI uploads the inner ZIP, not the unpacked .app.
                    continue
                raise FileNotFoundError(filename)
            if digest(filename) != expected:
                raise ValueError(f'Checksum mismatch: {filename}')
            checked += 1
        artifacts[platform] = {
            'archive': archive.name, 'sha256': digest(archive), 'build': metadata,
            'checkedFiles': checked, 'macBuildFilesNotUploaded': unavailable,
        }

    windows = DOWNLOADS / 'windows' / 'windows' / 'win-unpacked'
    mac = DOWNLOADS / 'mac' / 'mac'
    inner = mac / 'Scientific-Revolution-0.1.0-mac-universal.zip'
    source_content = (DOWNLOADS / 'windows/publication/content.json').read_bytes()
    if json.loads(source_content) != json.loads((APP / 'src/content.json').read_bytes()):
        raise ValueError('Downloaded content differs from project content')
    for filename in [windows / 'resources/app/content.json',
                     DOWNLOADS / 'windows/publication/content.json',
                     DOWNLOADS / 'mac/publication/content.json']:
        if filename.read_bytes() != source_content:
            raise ValueError(f'Content differs: {filename}')
    with zipfile.ZipFile(inner) as zipped:
        entries = {decoded_name(entry): entry for entry in zipped.infolist()}
        prefix = '科学革命.app/Contents/'
        info = plistlib.loads(zipped.read(entries[prefix + 'Info.plist']))
        if info['CFBundleShortVersionString'] != '0.1.0' or info['LSMinimumSystemVersion'] != '12.0.0':
            raise ValueError('Unexpected Mac bundle metadata')
        if zipped.read(entries[prefix + 'Resources/app/content.json']) != source_content:
            raise ValueError('Mac content differs')
        executable = zipped.read(entries[prefix + 'MacOS/' + info['CFBundleExecutable']])
        magic, count = struct.unpack('>II', executable[:8])
        if magic != 0xcafebabe:
            raise ValueError('Expected a universal Mach-O executable')
        architectures = [struct.unpack_from('>I', executable, 8 + i * 20)[0] for i in range(count)]
        if set(architectures) != {0x01000007, 0x0100000c}:
            raise ValueError('Expected x86_64 and arm64')
        artifacts['mac']['bundle'] = {
            'version': info['CFBundleShortVersionString'],
            'minimumSystem': info['LSMinimumSystemVersion'],
            'architectures': ['x86_64', 'arm64'],
            'symlinksPreservedInZip': sum((e.external_attr >> 16) & 0o170000 == 0o120000 for e in entries.values()),
            'signatureVerification': 'pending macOS codesign verification',
        }

    content = json.loads(source_content)
    media = [PROJECT / lesson['relativeVideoPath'] for lesson in content['lessons']]
    if len(media) != 44 or len(set(media)) != 44:
        raise ValueError('Expected 44 distinct video mappings')
    for filename in media:
        if not filename.resolve().is_relative_to((PROJECT / '视频').resolve()) or not filename.is_file():
            raise ValueError(f'Missing or unsafe media path: {filename}')
    required = sum(f.stat().st_size for f in media) + 800_000_000
    if shutil.disk_usage(RELEASE).free < required:
        raise OSError('Insufficient free space')

    OUTPUT.mkdir()
    shutil.copytree(windows, OUTPUT / 'Windows')
    (OUTPUT / 'macOS').mkdir()
    shutil.copy2(inner, OUTPUT / 'macOS' / inner.name)
    (OUTPUT / 'macOS/SHA256SUMS.txt').write_text(digest(inner) + '  ' + inner.name + '\n', encoding='utf-8')
    script = (APP / 'release-resources/安装Mac应用.command').read_text(encoding='utf-8')
    (OUTPUT / 'macOS/安装Mac应用.command').write_text(script, encoding='utf-8', newline='\n')
    (OUTPUT / 'content.json').write_bytes(source_content)
    shutil.copy2(APP / 'release-resources/启动说明.html', OUTPUT / '启动说明.html')
    records = []
    for index, source in enumerate(media, 1):
        relative = source.relative_to(PROJECT)
        target = OUTPUT / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        source_hash = digest(source)
        if digest(target) != source_hash:
            raise ValueError(f'Copied video differs: {relative}')
        records.append({'path': relative.as_posix(), 'bytes': source.stat().st_size, 'sha256': source_hash})
        print(f'Video {index}/44 copied and verified', flush=True)

    report = {
        'publication': '科学革命', 'applicationVersion': '0.1.0',
        'assembledAt': datetime.now(timezone.utc).isoformat(),
        'githubRun': 'https://github.com/scotflyer/Scientific-Revolution/actions/runs/39076469886',
        'sourceCommit': '74c91f308b24259a2d496be60ef9d7459c4c10f5',
        'platforms': {'windows': 'Windows 10/11 x64; unsigned', 'mac': 'macOS 12+; universal; ad-hoc; not notarized'},
        'layout': 'Windows ready; Mac ZIP must be extracted on a Mac local filesystem',
        'acceptance': '准备版；静态完整性已核对；应用运行、Mac签名验证、目标系统和实体U盘验收待完成',
        'artifacts': artifacts, 'videoCount': len(records), 'videoBytes': sum(r['bytes'] for r in records),
    }
    (OUTPUT / '版本信息.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    evidence = OUTPUT / '发行核对'
    evidence.mkdir()
    shutil.copy2(APP / 'release-resources/实机验收清单.md', evidence / '实机验收清单.md')
    (evidence / '视频校验.json').write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for platform in ['windows', 'mac']:
        shutil.copy2(DOWNLOADS / platform / platform / 'build-info.json', evidence / f'{platform}-build-info.json')
        shutil.copy2(DOWNLOADS / platform / platform / 'SHA256SUMS.txt', evidence / f'{platform}-build-SHA256SUMS.txt')
    files = sorted(p for p in OUTPUT.rglob('*') if p.is_file())
    hashes = []
    media_hashes = {r['path']: r['sha256'] for r in records}
    for filename in files:
        name = filename.relative_to(OUTPUT).as_posix()
        value = media_hashes[name] if name in media_hashes else digest(filename)
        hashes.append(f'{value}  {name}')
    (OUTPUT / 'SHA256SUMS.txt').write_text('\n'.join(hashes) + '\n', encoding='utf-8')
    print(f'Assembly complete: {OUTPUT}', flush=True)


if __name__ == '__main__':
    main()
