# T01-T07 GIF目視レビュー

ご主人のGIF確認結果を反映した目視評価。

## 目視評価

| ID | 内容 | 目視判定 | メモ |
| --- | --- | --- | --- |
| T01 | male / idle | 合格 / 完璧 | かなり良い。素体同一性も動きも問題なし。 |
| T02 | male / run | 合格 / 完璧 | かなり良い。runとして読みやすい。 |
| T03 | female / walk | 外部ブロック | usage limit / runner stall。品質評価から除外。 |
| T04 | sword fighter / attack | 要確認 | 動きは良いが、少しガタガタしている。接地とフレーム間の足元安定を強く見る。 |
| T05 | child / talk | 合格 / 完璧 | UI gateでは `motion_too_small` だったが、talkは小さい動きが自然で、GIF目視では非常に良い。 |
| T06 | child / hurt | 合格 / 完璧 | かなり良い。素体同一性も保てている。 |
| T07 | hooded robe / spell cast | 合格ライン | クオリティは悪くないので合格ライン。接地は強めに確認する。 |

## UI gateとのズレ

- T05はUI上 `quality_gate_failure / motion_too_small` だが、人間目視では合格 / 完璧。
- T07もUI上 `quality_gate_failure / motion_too_small` だが、人間目視では合格ライン。
- talk/reactや控えめなcastでは、現在の `motion_too_small` gate が過敏に働く可能性が高い。

## 追加で強く見るべき観点

- T04: 攻撃モーション自体は良いが、ガタつきと足元のブレを重点確認する。
- T07: 見た目品質は合格ラインだが、接地と足元の安定を重点確認する。
- 今後のレポートでは、UI自動gate結果とご主人のGIF目視採用結果を分けて記録する。
