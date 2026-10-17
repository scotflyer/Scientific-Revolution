import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build, Platform, Arch } from 'electron-builder';
import { preparePublication } from './prepare-publication.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const platform = process.argv[2];
if (!['windows', 'mac'].includes(platform)) throw new Error('Use npm run package:windows or npm run package:mac.');
const requiredHost = platform === 'windows' ? 'win32' : 'darwin';
if (process.platform !== requiredHost) {
  throw new Error(platform === 'mac' ? 'Mac universal packaging must run on the selected cloud Mac.' : 'Windows packaging must run on Windows.');
}

// Keep inherited developer credentials out of this no-certificate workflow.
for (const name of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'CSC_NAME', 'WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD', 'CSC_IDENTITY_AUTO_DISCOVERY', 'CSC_FOR_PULL_REQUEST', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID', 'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER', 'ELECTRON_RUN_AS_NODE']) delete process.env[name];
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';

const npmCLI = process.env.npm_execpath;
if (!npmCLI) throw new Error('Run this script through npm so the build uses the installed npm executable.');
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [npmCLI, 'run', 'build:desktop'], { cwd: root, env: process.env, stdio: 'inherit', windowsHide: true });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Desktop build failed (${code}).`)));
});

const require = createRequire(import.meta.url);
const config = require('../electron-builder.config.cjs');
const output = path.join(root, 'release', platform);
const targets = platform === 'windows' ? Platform.WINDOWS.createTarget('dir', Arch.x64) : Platform.MAC.createTarget('zip', Arch.universal);
// Reuse the already installed, pinned Windows runtime instead of downloading
// it a second time. Mac universal builds need both architectures from builder.
const runtime = platform === 'windows' && process.arch === 'x64'
  ? { electronDist: path.join(path.dirname(require.resolve('electron/package.json')), 'dist') } : {};
await build({ projectDir: root, config: { ...config, ...runtime, directories: { ...config.directories, output } }, targets, publish: 'never' });
await preparePublication(root);
const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'build-info.json'), JSON.stringify({
  version: metadata.version, electron: config.electronVersion, electronBuilder: metadata.devDependencies['electron-builder'],
  platform, architecture: platform === 'mac' ? 'universal (x64 + arm64)' : 'x64',
  signing: platform === 'mac' ? 'ad-hoc; not notarized' : 'unsigned',
  host: { platform: process.platform, arch: process.arch, node: process.version },
  builtAt: new Date().toISOString(), acceptance: 'pending; packaging is not target-system or USB acceptance',
}, null, 2) + '\n');
// Hash regular files without following .app symlinks. Mac ZIPs preserve those
// links and are hashed as complete archives as well.
async function hashes(directory, relative = '') {
  const lines = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  for (const entry of entries) {
    const name = path.posix.join(relative, entry.name);
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) lines.push(...await hashes(filename, name));
    else if (entry.isFile() && entry.name !== 'SHA256SUMS.txt') {
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(filename)) hash.update(chunk);
      lines.push(`${hash.digest('hex')}  ${name}`);
    }
  }
  return lines;
}
await writeFile(path.join(output, 'SHA256SUMS.txt'), (await hashes(output)).join('\n') + '\n');
console.log(`Package created in ${output}. Publication companion files: release/publication. Target-system and physical USB acceptance remain pending.`);
