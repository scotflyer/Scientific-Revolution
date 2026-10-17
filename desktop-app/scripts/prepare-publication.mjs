import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function preparePublication(root) {
  const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const output = path.join(root, 'release', 'publication');
  await mkdir(output, { recursive: true });
  await copyFile(path.join(root, 'src', 'content.json'), path.join(output, 'content.json'));
  await copyFile(path.join(root, 'release-resources', '启动说明.html'), path.join(output, '启动说明.html'));
  await writeFile(path.join(output, '版本信息.json'), JSON.stringify({
    publication: '科学革命', applicationVersion: metadata.version,
    platforms: { windows: 'Windows 10/11 x64; unsigned', mac: 'macOS 12+; Intel + Apple Silicon universal; ad-hoc signed; not notarized' },
    acceptance: '待目标系统及实体 U 盘验收；这些配套文件不代表完整发行物',
  }, null, 2) + '\n');
  console.log('Publication companion files prepared without copying or changing videos.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await preparePublication(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
}
