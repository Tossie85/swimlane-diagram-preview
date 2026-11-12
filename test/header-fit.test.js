'use strict';

// 見出し（レーン名・フェーズ名）が、その見出しの帯の中に収まっているかを検証する。
//
// 見出しの帯は2種類あり、広げられる向きが違う。
//   ・細い帯（高さ38px固定。TBの上＝レーン名 / LRの上＝フェーズ名）
//       … 横書きの文字が帯の長さ方向に並ぶ。帯の長さを名前に合わせて広げる。
//   ・左の列（幅132px固定。LRの左＝レーン名 / TBの左＝フェーズ名）
//       … 横には広げられないので折り返す。行数は帯の厚みが許すぶんだけ使う。
//
// どちらも破れると、長い名前が帯からはみ出して隣に重なったり、図の外に出て切れたりする。

const assert = require('assert');
const Swimlane = require('../media/swimlane.js');

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

// 見出し文字のおおよその表示幅。描画側（headerTextWidth）と同じ見積もりを使う。
function textWidth(s, fontSize) {
  return [...String(s || '')]
    .reduce((n, ch) => n + (/[\x00-\xff]/.test(ch) ? fontSize * 0.58 : fontSize), 0);
}

// <g data-pick="lane|phase"> ごとに、見出しの帯（グループ内の最後のrect）と文字を取り出す
function headersOf(code) {
  const r = Swimlane.render(code);
  assert.ok(r.ok, r.errors.join(' / '));
  const out = [];
  for (const g of r.svg.matchAll(/<g data-pick="(lane|phase)" data-idx="\d+">([\s\S]*?)<\/g>/g)) {
    const kind = g[1], inner = g[2];
    const rects = [...inner.matchAll(/<rect[^>]*x="(-?[\d.]+)"[^>]*y="(-?[\d.]+)"[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/g)];
    if (!rects.length) continue;
    const h = rects[rects.length - 1];
    const texts = [...inner.matchAll(/<text x="(-?[\d.]+)" y="(-?[\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)]
      .map(t => ({ cx: +t[1], y: +t[2], size: +t[3], text: t[4] }));
    out.push({ kind, box: { x: +h[1], y: +h[2], w: +h[3], h: +h[4] }, texts });
  }
  return { render: r, headers: out };
}

function assertFits(label, body) {
  ['TB', 'LR'].forEach(dir => {
    const code = body.replace(/^swimlane\n/, `swimlane\ndirection ${dir}\n`);
    const { headers } = headersOf(code);
    assert.ok(headers.length, `${label} ${dir}: 見出しが1つも描かれていない`);
    headers.forEach(h => {
      h.texts.forEach(t => {
        const w = textWidth(t.text, t.size);
        const left = t.cx - w / 2, right = t.cx + w / 2;
        const top = t.y - t.size, bottom = t.y + t.size * 0.3;
        assert.ok(left >= h.box.x - 0.5 && right <= h.box.x + h.box.w + 0.5,
          `${label} ${dir}: ${h.kind}の見出し "${t.text}" が帯の左右からはみ出している `
          + `文字 ${Math.round(left)}..${Math.round(right)} / 帯 ${Math.round(h.box.x)}..${Math.round(h.box.x + h.box.w)}`);
        assert.ok(top >= h.box.y - 0.5 && bottom <= h.box.y + h.box.h + 0.5,
          `${label} ${dir}: ${h.kind}の見出し "${t.text}" が帯の上下からはみ出している `
          + `文字 ${Math.round(top)}..${Math.round(bottom)} / 帯 ${Math.round(h.box.y)}..${Math.round(h.box.y + h.box.h)}`);
      });
    });
  });
}

const 長い日本語 = `swimlane
lane sales "営業推進部カスタマーサクセス第一課"
lane back "業務オペレーション統括部"
phase p1 "申込受付と一次確認"
phase p2 "与信審査および社内稟議の実施"
phase p3 "出荷"
node n1 "申込を受ける" lane=sales phase=p1 shape=start
node n2 "内容を確認" lane=back phase=p1
node n3 "与信を審査" lane=back phase=p2
node n4 "受注を登録" lane=back phase=p3
node n5 "完了" lane=sales phase=p3 shape=end
n1 -> n2
n2 -> n3
n3 -> n4
n4 -> n5`;

const 長い英語 = `swimlane
lane ops "Operations and Fulfilment Team"
lane fin "Finance"
phase p1 "Intake and first review"
phase p2 "Credit assessment and approval"
node n1 "Receive order" lane=ops phase=p1 shape=start
node n2 "Check details" lane=ops phase=p1
node n3 "Assess credit" lane=fin phase=p2
node n4 "Done" lane=ops phase=p2 shape=end
n1 -> n2
n2 -> n3
n3 -> n4`;

// 帯の長さがノード1つ分しかないのに名前が長い。帯を広げないと確実にはみ出す。
const 短い帯に長い名前 = `swimlane
lane a "担当"
phase p1 "申込内容の受付確認および不備照会対応"
phase p2 "完了"
node n1 "受付" lane=a phase=p1 shape=start
node n2 "完了" lane=a phase=p2 shape=end
n1 -> n2`;

const 極端に長い名前 = `swimlane
lane a "第一営業本部首都圏法人ソリューション推進グループ"
phase p1 "申込内容の受付確認および不備照会対応フェーズ"
node n1 "受付" lane=a phase=p1 shape=start
node n2 "完了" lane=a phase=p1 shape=end
n1 -> n2`;

const フェーズなし = `swimlane
lane a "営業推進部カスタマーサクセス第一課"
node n1 "受付" lane=a shape=start
node n2 "完了" lane=a shape=end
n1 -> n2`;

const 短い名前 = `swimlane
lane sales "営業部"
phase p1 "受付"
phase p2 "審査"
node n1 "申込" lane=sales phase=p1 shape=start
node n2 "審査" lane=sales phase=p2
node n3 "完了" lane=sales phase=p2 shape=end
n1 -> n2
n2 -> n3`;

check('長い日本語の見出しが帯に収まる', () => assertFits('長い日本語', 長い日本語));
check('長い英語の見出しが帯に収まる', () => assertFits('長い英語', 長い英語));
check('帯が短いフェーズの長い名前も収まる（帯を広げる）', () => assertFits('短い帯に長い名前', 短い帯に長い名前));
check('極端に長い見出しでも収まる', () => assertFits('極端に長い名前', 極端に長い名前));
check('フェーズを使わない図の長いレーン名も収まる', () => assertFits('フェーズなし', フェーズなし));
check('短い見出しも当然収まる', () => assertFits('短い名前', 短い名前));

check('ふつうの長さの名前は「…」で切り詰めない', () => {
  [長い日本語, 長い英語, 短い帯に長い名前].forEach(body => {
    ['TB', 'LR'].forEach(dir => {
      const code = body.replace(/^swimlane\n/, `swimlane\ndirection ${dir}\n`);
      headersOf(code).headers.forEach(h => h.texts.forEach(t => {
        assert.ok(!t.text.includes('…'),
          `${dir}: 見出し "${t.text}" が切り詰められている（折り返せる行数が足りない）`);
      }));
    });
  });
});

check('短い見出しの図は寸法が変わらない（これまでの図を動かさない）', () => {
  // 見出しが帯に収まっている図では、帯を広げる処理は何もしない
  const expect = { TB: '364x319', LR: '743x188' };
  ['TB', 'LR'].forEach(dir => {
    const r = Swimlane.render(短い名前.replace(/^swimlane\n/, `swimlane\ndirection ${dir}\n`));
    assert.strictEqual(`${r.width}x${r.height}`, expect[dir],
      `${dir}: 短い見出しの図の寸法が変わった`);
  });
});

if (failed) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll tests passed.');
