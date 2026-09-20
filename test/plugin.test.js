'use strict';

// VS Code なしで extendMarkdownIt() の変換ロジックだけを検証する簡易テスト。
// 実際のVS Codeが渡してくる markdown-it インスタンスの代わりに、
// devDependency の markdown-it をそのまま使う。

const assert = require('assert');
const MarkdownIt = require('markdown-it');
const { extendMarkdownIt } = require('../extension.js');

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failed++;
    console.error(`NOT OK - ${name}`);
    console.error('  ' + (err && err.message ? err.message : err));
  }
}

function render(markdown) {
  const md = new MarkdownIt();
  extendMarkdownIt(md);
  return md.render(markdown);
}

check('```swimlane ブロックがSVGに置き換わる', () => {
  const html = render([
    '# タイトル',
    '',
    '```swimlane',
    'swimlane',
    '    lane a "A"',
    '    node n1 "start" lane=a shape=start',
    '    node n2 "end" lane=a shape=end',
    '    n1 -> n2',
    '```',
    '',
  ].join('\n'));
  assert.ok(html.includes('<div class="swimlane-diagram">'), 'swimlane-diagram divが無い: ' + html);
  assert.ok(html.includes('<svg'), 'svgが無い: ' + html);
  assert.ok(!html.includes('<pre>'), '生のpreが残っている（変換されていない）: ' + html);
});

check('構文エラー時はエラー用のpreを出す', () => {
  const html = render([
    '```swimlane',
    'swimlane',
    '    this is not a valid line',
    '```',
    '',
  ].join('\n'));
  assert.ok(html.includes('class="swimlane-error"'), 'swimlane-errorが無い: ' + html);
  assert.ok(!html.includes('<svg'), 'エラーなのにSVGが出ている: ' + html);
});

check('言語指定なし・他言語のフェンスは既定の挙動のまま', () => {
  const html = render([
    '```',
    'plain text block',
    '```',
    '',
    '```js',
    'const x = 1;',
    '```',
    '',
  ].join('\n'));
  assert.ok(html.includes('<pre><code>plain text block'), '無指定フェンスが変わってしまった: ' + html);
  assert.ok(html.includes('language-js'), 'js フェンスが変わってしまった: ' + html);
  assert.ok(!html.includes('swimlane-diagram'), '無関係のフェンスがswimlane扱いになっている: ' + html);
});

check('言語名の大文字・前後の空白を許容する', () => {
  const html = render([
    '```SWIMLANE ',
    'swimlane',
    '    lane a "A"',
    '    node n1 "x" lane=a',
    '```',
    '',
  ].join('\n'));
  assert.ok(html.includes('<div class="swimlane-diagram">'), '大文字言語名で反応しない: ' + html);
});

check('複数のswimlaneブロックが独立して描画される（状態の混線がない）', () => {
  const html = render([
    '```swimlane',
    'swimlane',
    '    lane a "A"',
    '    node n1 "one" lane=a',
    '```',
    '',
    '```swimlane',
    'swimlane',
    '    lane b "B"',
    '    node n2 "two" lane=b',
    '```',
    '',
  ].join('\n'));
  const count = (html.match(/class="swimlane-diagram"/g) || []).length;
  assert.strictEqual(count, 2, `2つ描画されるはずが ${count} 個: ` + html);
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll tests passed.');
}
