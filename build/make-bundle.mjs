/**
 * vendor/swimlane.js を拡張へ同梱する（media/swimlane.js）。
 *
 * この拡張の描画エンジンは swimlane-diagram のもので、vendor/ にその複製を置いている。
 * 手でコピーすると追従漏れが出るので、ビルド時に必ず取り直す。
 * media/swimlane.js は生成物なのでリポジトリには含めない（.gitignore）。
 *
 * extension.js は media/swimlane.js を Node の require で読むので、コピーしたものが
 * CommonJS として読めて render() を持つところまで確認する。読めなければ停止する。
 *
 * 実行: node build/make-bundle.mjs（npm run build）
 */
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const SRC = resolve(repoRoot, 'vendor', 'swimlane.js');
const OUT_DIR = resolve(here, '..', 'media');
const OUT = resolve(OUT_DIR, 'swimlane.js');

if (!(await stat(SRC).catch(() => null))) {
  throw new Error(`[make-bundle] 元のライブラリが見つかりません: ${SRC}`);
}

await mkdir(OUT_DIR, { recursive: true });
await copyFile(SRC, OUT);

const required = createRequire(import.meta.url)(OUT);
if (typeof required.render !== 'function') {
  throw new Error('[make-bundle] コピーした swimlane.js から render() を読み出せません');
}
const probe = required.render('swimlane\nlane l "L"\nnode n "n" lane=l\n');
if (!probe.ok) {
  throw new Error('[make-bundle] コピーした swimlane.js が図を描けません: ' + probe.errors.join(' / '));
}

console.log(`[make-bundle] 同梱しました: ${OUT}`);
console.log(`[make-bundle]   元: ${SRC} (VERSION ${required.VERSION})`);
