# talk / spell 実ブラウザ生成テスト結果

実施日時: 2026-06-29 22:16-22:46 JST
実施ブランチ: `codex/recursive-animation-matrix-identity-rerun`
実施方法: Image Cockpit のブラウザUIで source / animation preset を選択し、`Generate Animation` をクリックして実生成した。

## 結論

`talk` と `spell/cast` は、どちらもブラウザUI経由の実生成で `Animation frames ready` まで到達した。今回の2件では `motion too small`、usage limit、policy/safety、imagegen unavailable、import failure、chroma残り、透過破損は発生していない。

`talk` と `spell/cast` はもともと動きが小さいpresetのため、今回の判定では「低モーション成功」として合格扱いにする。特に `talk` は小さな反応・口/腕/姿勢差が主目的なので、idle / walk / attack と同じ移動量で失敗判定しない。

## 実生成結果

| ID | 素体 | preset | job id | UI結果 | 判定 | 主な証拠 |
| --- | --- | --- | --- | --- | --- | --- |
| T05-talk | 小柄/child | Talk / NPC Reaction | `codex-job-2026-06-29T13-16-15-896Z-wh1gmh` | `Animation frames ready` | 成功 | `T05-talk-07-after-complete-ui.png`, `T05-talk-runner.log`, `generated/T05-talk/` |
| T07-spell | ローブ/フード | Spell Cast | `codex-job-2026-06-29T13-30-17-657Z-0ai82l` | `Animation frames ready` | 成功 | `T07-spell-07-after-complete-ui.png`, `T07-spell-runner.log`, `generated/T07-spell/` |

## T05-talk 詳細

- source: `matrix-rerun-source-T05-basic-small-village-child.png`
- preset: `Talk / NPC Reaction`
- handoff action: `talk`
- candidate count: `1`
- runner status: `completed`, `exitCode: 0`
- 生成PNG: front / front-three-quarter / side / back-three-quarter / back の5方向
- UI import後プレビュー: `codex-job-2026-06-29T13-16-15-896Z-wh1gmh-direction-split-animation-sheet.png`
- 備考: runner途中にtimestamp解析まわりの一時的なログノイズはあったが、最終生成・import・UI表示は成功した。

## T07-spell 詳細

- source: `matrix-rerun-source-T07-basic-hooded-mysterious-figure.png`
- preset: `Spell Cast`
- handoff action: `cast`
- candidate count: `1`
- runner status: `completed`, `exitCode: 0`
- 生成PNG: front / front-three-quarter / side / back-three-quarter / back の5方向
- UI import後プレビュー: `codex-job-2026-06-29T13-30-17-657Z-0ai82l-direction-split-animation-sheet.png`
- 備考: staging中に端エフェクト/セル境界由来の警告が出たが、最終v2でchromaとセル境界を清掃し、QA警告0で完了した。

## 判定ルールメモ

- `talk`, `talk-react`, `cast`, `spell-cast` は subtle motion profile として扱う。
- 小さいモーションpresetでは「大きく動かないこと」自体を失敗にしない。
- ただし、素体同一性崩壊、向きごとのキャラサイズ変動、接地ずれ、chroma残り、透過破損、頭/足切れは通常どおり失敗または要確認に分類する。
- usage limit / policy / imagegen unavailable は品質失敗ではなく外部ブロックとして扱う。

## 証拠ファイル

- UIスクリーンショット: `*.png`
- UI DOMスナップショット: `*.dom.txt`
- Handoff投入前後: `T05-talk-04-handoff-before.json`, `T05-talk-06-handoff-after-click.json`, `T07-spell-04-handoff-before.json`, `T07-spell-06-handoff-after-click.json`
- job inbox/status/log: `T05-talk-inbox.json`, `T05-talk-status.json`, `T05-talk-runner.log`, `T07-spell-inbox.json`, `T07-spell-status.json`, `T07-spell-runner.log`
- 最終生成物コピー: `generated/T05-talk/`, `generated/T07-spell/`
- staging/QAコピー: `runner/T05-talk/`, `runner/T07-spell/`
