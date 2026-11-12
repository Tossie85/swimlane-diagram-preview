'use strict';

// 描画エンジン（assets/swimlane.js ＝ media/swimlane.js）の「ノードの辺の使い分け」を検証する。
//
//   ・出力（線の棒側）は 右・下 から出す
//   ・入力（矢印の先側）は 左・上 へ入れる
//   ・例外1: 出力が1本も使っていない出力辺（TB=右 / LR=下）には入力を入れてよい
//   ・例外2: ひし形の分岐が3本以上で戻りの入力が無いときは、入力辺（TB=左 / LR=上）も出口に使ってよい
//
// 例外があるので「どの辺を使ったか」を直接数えても意味がない。代わりに、
// 例外まで含めて必ず成り立つ次の2つを確かめる。
//   (1) 同じノードの同じ辺に、出力の根元と入力の矢先が混在しない
//   (2) 同じ点から出力の棒が出て、同じ点へ入力の矢先が刺さらない
// これが崩れると、同じ場所から線が出入りして図が読めなくなる。

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

// "M x y (H x | V y)*" を線分に分ける
function segmentsOf(d) {
  const t = d.split(/\s+/);
  let x = 0, y = 0;
  const segs = [];
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === 'M') { x = +t[++i]; y = +t[++i]; }
    else if (c === 'H') { const nx = +t[++i]; segs.push([x, y, nx, y]); x = nx; }
    else if (c === 'V') { const ny = +t[++i]; segs.push([x, y, x, ny]); y = ny; }
  }
  return segs;
}

const EPS = 1.5;
function sideOf(box, px, py) {
  if (Math.abs(py - (box.y + box.h)) <= EPS) return '下';
  if (Math.abs(py - box.y) <= EPS) return '上';
  if (Math.abs(px - (box.x + box.w)) <= EPS) return '右';
  if (Math.abs(px - box.x) <= EPS) return '左';
  return '?';
}

// 図を描いて、ノードごとに「出力の根元」と「入力の矢先」を集める
function portsOf(code) {
  const { state, errors } = Swimlane.parse(code);
  assert.strictEqual(errors.length, 0, '構文エラー: ' + errors.join(' / '));
  const lay = Swimlane.computeLayout(state);
  const svg = Swimlane.drawSvg(state);

  const ports = new Map();   // nodeId -> [{ kind, side, x, y, link }]
  const push = (id, rec) => { if (!ports.has(id)) ports.set(id, []); ports.get(id).push(rec); };
  const seen = new Set();
  // 当たり判定用と見た目用で同じ経路のpathが2本出るので、片方だけ見る
  for (const m of svg.matchAll(/<path d="([^"]+)"[^>]*data-idx="(\d+)"/g)) {
    const i = Number(m[2]);
    if (seen.has(i)) continue;
    seen.add(i);
    const e = state.links[i];
    const a = lay.boxById.get(e.from), b = lay.boxById.get(e.to);
    if (!a || !b) continue;
    const segs = segmentsOf(m[1]);
    const first = segs[0], last = segs[segs.length - 1];
    const link = `${e.from}→${e.to}`;
    push(e.from, { kind: 'out', side: sideOf(a, first[0], first[1]), x: first[0], y: first[1], link });
    push(e.to, { kind: 'in', side: sideOf(b, last[2], last[3]), x: last[2], y: last[3], link });
  }
  return { state, lay, ports };
}

function assertPortRule(label, body) {
  ['TB', 'LR'].forEach(dir => {
    const code = body.replace(/^swimlane\n/, `swimlane\ndirection ${dir}\n`);
    const { ports } = portsOf(code);
    ports.forEach((list, id) => {
      const outs = list.filter(p => p.kind === 'out');
      const ins = list.filter(p => p.kind === 'in');
      ['左', '右', '上', '下'].forEach(side => {
        const o = outs.filter(p => p.side === side), n = ins.filter(p => p.side === side);
        assert.ok(!(o.length && n.length),
          `${label} ${dir}: ${id} の${side}辺に出力(${o.map(p => p.link).join('・')})と`
          + `入力(${n.map(p => p.link).join('・')})が混在している`);
      });
      outs.forEach(o => ins.forEach(n => {
        assert.ok(!(Math.abs(o.x - n.x) <= 2 && Math.abs(o.y - n.y) <= 2),
          `${label} ${dir}: ${id} の (${Math.round(o.x)}, ${Math.round(o.y)}) から`
          + `出力(${o.link})が出て、同じ点へ入力(${n.link})が刺さっている`);
      }));
      // 辺が判定できない＝ノードから離れた所から線が生えている（経路の作り間違い）
      list.forEach(p => assert.notStrictEqual(p.side, '?',
        `${label} ${dir}: ${id} の${p.kind === 'out' ? '出口' : '入口'}(${p.link})が辺の上にない`));
    });
  });
}

const 差戻し = `swimlane
lane a "担当"
node n1 "申請を出す" lane=a shape=start
node n2 "内容を確認" lane=a
node n3 "判定" lane=a shape=decision
node n4 "受理" lane=a shape=end
n1 -> n2
n2 -> n3 "確認依頼"
n3 -> n4 "OK"
n3 -> n2 "差戻し"`;

const レーンまたぎ = `swimlane
lane a "営業"
lane b "審査"
node n1 "申込を受ける" lane=a shape=start
node n2 "書類を審査" lane=b
node n3 "判定" lane=b shape=decision
node n4 "再提出を依頼" lane=a
node n5 "完了" lane=a shape=end
n1 -> n2
n2 -> n3
n3 -> n4 "NG"
n4 -> n2 "再審査"
n3 -> n5 "OK"`;

const 集約 = `swimlane
lane a "事務"
node n0 "受付" lane=a shape=start
node n1 "内容を点検" lane=a
node n2 "記載を直す" lane=a
node n3 "添付を直す" lane=a
node n4 "押印をもらう" lane=a
node n9 "受理" lane=a shape=end
n0 -> n1
n1 -> n2
n2 -> n3
n3 -> n4
n2 -> n1
n3 -> n1
n4 -> n1
n1 -> n9`;

const 三分岐 = `swimlane
lane a "受付"
node n0 "受付" lane=a shape=start
node d1 "区分を判定" lane=a shape=decision
node x "通常処理" lane=a
node y "特例処理" lane=a
node z "差戻し処理" lane=a
n0 -> d1
d1 -> x "通常"
d1 -> y "特例"
d1 -> z "対象外"`;

// 同じ3分岐でも、フェーズをまたぐと別の経路生成を通る
const 三分岐フェーズ付き
 = `swimlane
lane a "受付"
phase ph1 "判定"
phase ph2 "処理"
node n0 "受付" lane=a phase=ph1 shape=start
node d1 "区分を判定" lane=a phase=ph1 shape=decision
node x "通常処理" lane=a phase=ph2
node y "特例処理" lane=a phase=ph2
node z "差戻し処理" lane=a phase=ph2
n0 -> d1
d1 -> x "通常"
d1 -> y "特例"
d1 -> z "対象外"`;

const 四分岐 = `swimlane
lane a "受付"
node n0 "受付" lane=a shape=start
node d1 "区分を判定" lane=a shape=decision
node w "処理1" lane=a
node x "処理2" lane=a
node y "処理3" lane=a
node z "処理4" lane=a
n0 -> d1
d1 -> w "1"
d1 -> x "2"
d1 -> y "3"
d1 -> z "4"`;

const 三分岐と戻り = `swimlane
lane a "受付"
node n0 "受付" lane=a shape=start
node d1 "区分を判定" lane=a shape=decision
node x "通常処理" lane=a
node y "特例処理" lane=a
node z "再判定待ち" lane=a
n0 -> d1
d1 -> x "通常"
d1 -> y "特例"
d1 -> z "保留"
z -> d1 "やり直し"`;

const 受注フロー = `swimlane
title "受注フロー"
lane sales "営業部"
lane back "業務部"
lane fin "経理部"
phase p1 "受付"
phase p2 "審査"
phase p3 "出荷"
node s0 "" lane=sales phase=p1 shape=startdot
node n1 "申込を受ける" lane=sales phase=p1 shape=start
node n2 "内容を確認" lane=back phase=p1
node n3 "与信を審査" lane=fin phase=p2 shape=decision
node n4 "受注を登録" lane=back phase=p2
node n5 "出荷を指示" lane=back phase=p3
node n6 "請求書を発行" lane=fin phase=p3
node n7 "完了" lane=sales phase=p3 shape=end
node e0 "" lane=sales phase=p3 shape=enddot
s0 -> n1
n1 -> n2 "申込書"
n2 -> n3 "審査依頼"
n3 -> n4 "OK"
n3 -> n2 "差戻し"
n4 -> n5
n5 -> n6
n6 -> n7
n7 -> e0`;

const ループ = `swimlane
lane a "担当"
node s0 "" lane=a shape=startdot
node n17 "受付" lane=a shape=start
node n18 "準備" lane=a
node n19 "実施" lane=a
node n20 "点検" lane=a
node n21 "完了" lane=a shape=end
node e0 "" lane=a shape=enddot
s0 -> n17
n17 -> n18
n18 -> n19
n19 -> n20
n20 -> n18 "やり直し"
n20 -> n21 "合格"
n21 -> e0`;

check('同じレーン内で戻る図: 出力と入力が同じ辺・同じ点に混ざらない', () => assertPortRule('差戻し', 差戻し));
check('レーンをまたいで戻る図: 同上', () => assertPortRule('レーンまたぎ', レーンまたぎ));
check('1つのノードに3本戻る図: 同上', () => assertPortRule('集約', 集約));
check('分岐3本の図: 同上', () => assertPortRule('三分岐', 三分岐));
check('分岐3本＋分岐へ戻る図: 同上', () => assertPortRule('三分岐と戻り', 三分岐と戻り));
check('3レーン＋フェーズの図: 同上', () => assertPortRule('受注フロー', 受注フロー));
check('ループを含む図: 同上', () => assertPortRule('ループ', ループ));

check('分岐の根元が行き先の並び順と同じ順に並ぶ（無用な交差を作らない）', () => {
  ['TB', 'LR'].forEach(dir => {
    const code = 三分岐と戻り.replace(/^swimlane\n/, `swimlane\ndirection ${dir}\n`);
    const { state, lay, ports } = portsOf(code);
    const roots = new Map();   // 行き先id -> 根元の座標
    ports.get('d1').filter(p => p.kind === 'out')
      .forEach(p => roots.set(p.link.split('→')[1], dir === 'TB' ? p.x : p.y));
    // 行き先 x(手前) → y → z(奥) の順に、根元も手前→奥へ並んでいること
    const pos = (id) => { const b = lay.boxById.get(id); return dir === 'TB' ? b.x : b.y; };
    const order = ['x', 'y', 'z'].sort((p, q) => pos(p) - pos(q));
    for (let i = 1; i < order.length; i++) {
      assert.ok(roots.get(order[i]) > roots.get(order[i - 1]),
        `${dir}: ${order[i]} への線の根元(${roots.get(order[i])})が `
        + `${order[i - 1]} への線の根元(${roots.get(order[i - 1])})より手前にある`);
    }
    assert.strictEqual(state.links.length, 5);
  });
});

// 根元を辺に沿って並べるのは、同じ辺から2本以上出るときだけ。1本しか出ていない辺で
// 中央から外れていると、ずらす理由が無いのに根元が偏って見える。
// フェーズを使う図では、同じ3分岐でも別の経路生成を通るので両方で確かめる。
check('同じ辺に1本しか出ていなければ、根元は辺の中央から出る', () => {
  [['フェーズなし', 三分岐], ['フェーズあり', 三分岐フェーズ付き]].forEach(([label, body]) => {
    ['TB', 'LR'].forEach(dir => {
      const code = body.replace(/^swimlane\n/, `swimlane\ndirection ${dir}\n`);
      const { lay, ports } = portsOf(code);
      const box = lay.boxById.get('d1');
      const outs = ports.get('d1').filter(p => p.kind === 'out');
      assert.strictEqual(outs.length, 3, `${label} ${dir}: 出力が3本ではない`);
      // 3本は別々の辺（TB: 左・下・右 / LR: 上・右・下）から出るので、並べ直す必要がない
      assert.strictEqual(new Set(outs.map(p => p.side)).size, 3,
        `${label} ${dir}: 3本が別々の辺から出ていない（${outs.map(p => p.side).join('')}）`);
      outs.forEach(p => {
        const 横 = p.side === '上' || p.side === '下';
        const center = 横 ? box.x + box.w / 2 : box.y + box.h / 2;
        const at = 横 ? p.x : p.y;
        assert.strictEqual(at, center,
          `${label} ${dir}: ${p.link} の根元が${p.side}辺の中央から ${at - center}px ずれている`);
      });
    });
  });
});

check('同じ辺から2本以上出るときは、中央をはさんで対称に並べる', () => {
  ['TB', 'LR'].forEach(dir => {
    const code = 四分岐.replace(/^swimlane\n/, `swimlane\ndirection ${dir}\n`);
    const { lay, ports } = portsOf(code);
    const box = lay.boxById.get('d1');
    const outs = ports.get('d1').filter(p => p.kind === 'out');
    const 流れ辺 = dir === 'TB' ? '下' : '右';
    const onEdge = outs.filter(p => p.side === 流れ辺);
    assert.strictEqual(onEdge.length, 2, `${dir}: ${流れ辺}辺に2本出ていない`);
    const center = dir === 'TB' ? box.x + box.w / 2 : box.y + box.h / 2;
    const offs = onEdge.map(p => (dir === 'TB' ? p.x : p.y) - center).sort((a, b) => a - b);
    assert.ok(offs[0] < 0 && offs[1] > 0 && Math.abs(offs[0] + offs[1]) < 0.01,
      `${dir}: ${流れ辺}辺の2本が中央をはさんで対称になっていない（${offs.join(', ')}）`);
  });
});

check('同じノードの同じ点から2本以上の線が出ない', () => {
  const cases = { 差戻し, レーンまたぎ, 集約, 三分岐, 三分岐と戻り, 受注フロー, ループ };
  Object.entries(cases).forEach(([label, body]) => {
    ['TB', 'LR'].forEach(dir => {
      const code = body.replace(/^swimlane\n/, `swimlane\ndirection ${dir}\n`);
      const { ports } = portsOf(code);
      ports.forEach((list, id) => {
        const outs = list.filter(p => p.kind === 'out');
        outs.forEach((o, i) => outs.slice(i + 1).forEach(q => {
          assert.ok(Math.abs(o.x - q.x) > 2 || Math.abs(o.y - q.y) > 2,
            `${label} ${dir}: ${id} の (${Math.round(o.x)}, ${Math.round(o.y)}) から `
            + `${o.link} と ${q.link} の2本が出ている`);
        }));
      });
    });
  });
});

check('ループを含んでも並び順が崩れない', () => {
  ['TB', 'LR'].forEach(dir => {
    const code = ループ.replace(/^swimlane\n/, `swimlane\ndirection ${dir}\n`);
    const { lay } = portsOf(code);
    const at = (id) => { const b = lay.boxById.get(id); return dir === 'TB' ? b.y : b.x; };
    const ids = ['n17', 'n18', 'n19', 'n20', 'n21'];
    for (let i = 1; i < ids.length; i++) {
      assert.ok(at(ids[i]) > at(ids[i - 1]), `${dir}: ${ids[i]} が ${ids[i - 1]} より前にある`);
    }
  });
});

// フェーズを使っていない図では、流れ方向のスロットは同じ幅で並ぶ。
// どこか1箇所だけ間隔が広い＝ノードが1つも無いスロットが挟まっている、ということ。
check('流れ方向に空きスロットができない', () => {
  const cases = { 差戻し, レーンまたぎ, 集約, 三分岐, 三分岐と戻り, ループ };
  Object.entries(cases).forEach(([label, body]) => {
    ['TB', 'LR'].forEach(dir => {
      const code = body.replace(/^swimlane\n/, `swimlane\ndirection ${dir}\n`);
      const { lay } = portsOf(code);
      // ●は接続先の隣に置かれるのでスロットを持たない。除いて数える。
      const at = [...new Set(lay.boxes
        .filter(b => !Swimlane.isDot(b.node.shape))
        .map(b => (dir === 'TB' ? b.y : b.x)))].sort((p, q) => p - q);
      const gaps = at.slice(1).map((v, i) => v - at[i]);
      assert.ok(Math.max(...gaps) === Math.min(...gaps),
        `${label} ${dir}: スロットの間隔がそろっていない（空きスロットがある） ${gaps.join(', ')}`);
    });
  });
});

check('接続のラベルが描画範囲の外に出ない', () => {
  [差戻し, レーンまたぎ, 三分岐と戻り, 受注フロー].forEach(body => {
    ['TB', 'LR'].forEach(dir => {
      const code = body.replace(/^swimlane\n/, `swimlane\ndirection ${dir}\n`);
      const r = Swimlane.render(code);
      assert.ok(r.ok, r.errors.join(' / '));
      const g = r.svg.match(/<g transform="translate\((-?[\d.]+),\s*(-?[\d.]+)\)"/);
      const sx = g ? Number(g[1]) : 0, sy = g ? Number(g[2]) : 0;
      for (const m of r.svg.matchAll(/<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="18"/g)) {
        const x = Number(m[1]) + sx, y = Number(m[2]) + sy, w = Number(m[3]);
        assert.ok(x >= 0 && y >= 0 && x + w <= r.width && y + 18 <= r.height,
          `${dir}: ラベルが描画範囲(${r.width}x${r.height})からはみ出している `
          + `x=${x} y=${y} w=${w}`);
      }
    });
  });
});

if (failed) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll tests passed.');
