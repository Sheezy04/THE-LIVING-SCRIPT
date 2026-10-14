import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist', 'ziqi-public');
if (path.relative(root, output).startsWith('..')) throw new Error('Output must stay inside the project');
await mkdir(output, { recursive: true });
// A fixed allowlist excludes credentials, Git metadata, caches, and private working files.
for (const name of ['server', 'src', 'data', 'assets', 'index.html', 'Dockerfile', '.dockerignore', '.env.example', 'LICENSE']) {
  await cp(path.join(root, name), path.join(output, name), { recursive: true,
    filter: source => !/\.(ttf|otf)$/i.test(source) });
}
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
manifest.scripts = { start: manifest.scripts.start };
await writeFile(path.join(output, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
await cp(path.join(root, 'docs', '公网部署与AI问答.md'), path.join(output, 'DEPLOY.md'));
console.log('Deployment directory: ' + output);
