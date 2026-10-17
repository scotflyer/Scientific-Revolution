import { cp, mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist', 'desktop');
await mkdir(output, { recursive: true });
await cp(path.join(root, 'electron'), path.join(output, 'electron'), { recursive: true });
await cp(path.join(root, 'shared'), path.join(output, 'shared'), { recursive: true });
await copyFile(path.join(root, 'src', 'content.json'), path.join(output, 'content.json'));
const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await writeFile(path.join(output, 'package.json'), JSON.stringify({ name: 'scientific-revolution', productName: '科学革命', version: metadata.version, description: metadata.description, author: metadata.author, private: true, type: 'module', main: 'electron/main.mjs' }, null, 2));
console.log('Desktop development build ready: dist/desktop (original videos remain in place).');
