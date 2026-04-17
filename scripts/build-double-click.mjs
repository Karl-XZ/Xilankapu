import { build } from 'esbuild';
import { mkdir, readdir, rm, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.join(rootDir, '双击打开版');
const publicDir = path.join(rootDir, 'public');

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function copyPublicAssets() {
  const entries = await readdir(publicDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) =>
        copyFile(path.join(publicDir, entry.name), path.join(releaseDir, entry.name)),
      ),
  );
}

async function writeReleaseHtml() {
  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>西兰卡普静态版</title>
    <link rel="icon" type="image/svg+xml" href="./favicon.svg" />
    <link rel="stylesheet" href="./app.css" />
  </head>
  <body>
    <div id="root"></div>
    <script src="./app.js"></script>
  </body>
</html>
`;

  await writeFile(path.join(releaseDir, 'index.html'), html, 'utf8');
}

async function writeReadme() {
  const content = `双击本目录下的 index.html 即可打开。

说明：
1. 这是纯前端离线包，不需要启动本地服务。
2. 首次点击“开始创作/生成”时会弹窗询问 API Key、模型 ID 和 Base URL，仅本次打开有效。
3. 如果只想先看效果，可在 API Key 弹窗里输入 mock，系统会生成演示图。
4. 如果真实图片接口不允许 file:// 页面跨域访问，请改成允许 CORS 的 HTTPS 接口。`;

  await writeFile(path.join(releaseDir, 'README.txt'), content, 'utf8');
}

await rm(releaseDir, { recursive: true, force: true });
await ensureDir(releaseDir);

await build({
  absWorkingDir: rootDir,
  entryPoints: ['src/main.tsx'],
  bundle: true,
  minify: true,
  sourcemap: false,
  target: ['es2019'],
  platform: 'browser',
  format: 'iife',
  jsx: 'automatic',
  loader: {
    '.png': 'dataurl',
    '.svg': 'dataurl',
  },
  outfile: path.join(releaseDir, 'app.js'),
});

await copyPublicAssets();
await writeReleaseHtml();
await writeReadme();
