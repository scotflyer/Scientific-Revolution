import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import executable from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const development = process.argv.includes('--dev');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
// Electron is a visible desktop app. SW_HIDE can suppress its first native
// window on Windows even after BrowserWindow.show() has been called.
const child = spawn(executable, development ? [root, '--dev'] : [path.join(root, 'dist/desktop')], { cwd: root, env, stdio: 'inherit', windowsHide: false });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code || 0; });
