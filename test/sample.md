# Swimlane Diagram Preview 動作確認

`F5` で拡張機能開発ホストを起動し、開いたウィンドウでこのファイルを開いて `Ctrl+Shift+V`（プレビュー）を実行してください。下の図が描画されれば動作OKです。

## 正常系

```swimlane
swimlane
    title "受注フロー"
    direction LR

    lane customer "顧客" #E3F2FD
    lane sales "営業部" #FFF9C4

    node start1 "" lane=customer shape=startdot
    node n1 "申込を送る" lane=customer
    node n2 "内容を確認" lane=sales
    node n3 "承認" lane=sales shape=decision
    node end1 "" lane=customer shape=enddot

    start1 -> n1
    n1 -> n2
    n2 -> n3 "確認完了"
    n3 -> end1 "承認"
    n3 --> n2 "差戻し"
```

## エラー表示の確認（わざと壊れた記法）

```swimlane
swimlane
    this is not a valid line
```

## 無関係な言語（変わらないことの確認）

```js
const x = 1;
console.log(x);
```
