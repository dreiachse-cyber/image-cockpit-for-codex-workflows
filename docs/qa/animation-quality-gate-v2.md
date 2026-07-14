# Animation Quality Gate v2 QA

実施日: 2026-07-15
branch: `codex/animation-uplift-sequence`
mode: `shadow-v1`

## 結論

Quality Gate v2は既存hard gateを変更せず、補正前と補正後を別々に記録する。レポート保存だけでは`usable-final`、history許可、download許可を変更しない。

## 実装した観測値

- `rawMetrics` / `normalizedMetrics`: center、footline、bbox変動、ground contact、隣接フレーム差分、loop seam。
- `normalizationCorrection`: frame単位のscale、translateX、translateY、raw／normalized bboxと集計値。
- identity: 元素体がある場合は色分布とbbox内8x8 silhouette、ない場合は先頭フレーム基準の一貫性。
- action profile: `grounded-strict`、`grounded-soft`、`airborne-or-exempt`、`subtle-loop`。
- `expectedPhases`: actionごとのanticipation、active/contact、recovery、return、またはloop contact順序。
- score: identity、palette、silhouette、footline、loop seam、phase、motion。
- `shadowDecision`: 未較正指標が将来block候補と判断した理由。`hardGateUnchanged`は常に`true`。

## 90% footlineと92% export anchor

値は統一せず、`src/lib/animationAlignment.ts`を定義元にした。

| 用途 | ratio | 256px cell |
|---|---:|---:|
| 正規化時の足位置 | 0.90 | y=230 |
| 既存export anchor | 0.92 | y=236 |

0.90はセル下端との安全余白を確保する描画基準、0.92は既存Animation Packとの互換性を守る書き出し基準としてPhase 1では維持する。

## 自動fixture

`animation-quality-gate-v2-fixtures.json`に、小型、通常、ローブ、浮遊、jump、death、subtle loop、identity palette shiftを記録した。`system pass / human reject`と`system reject / human accept`の両方を含む。

自動テストでは次を確認する。

- raw footline defectが正規化で消えてもshadow warningへ残る。
- loop actionだけ最終フレームから先頭フレームを測る。
- one-shotはloop seam対象外になる。
- source paletteをidentity基準へ使う。
- frame単位の補正量を集計できる。
- 256pxでfootline 230、export anchor 236を維持する。
- 旧manifestにQuality v2がなくても読み込める。
- report-only APIが`usable-final`を変えない。

## 実ブラウザtrial

固定元素体: `codex-job-2026-06-25T21-08-05-007Z.png`
設定: 実Codex runner、候補1、3方向、8 frames/direction、green chroma key。

| 系統 | action | job ID | loop判定 | 状態 | human review |
|---|---|---|---|---|---|
| subtle loop | idle | `codex-job-2026-07-14T18-35-48-068Z-dd7r4v` | loop | hard gate reject | reject。3方向中2方向で呼吸動作が視認できず、history／downloadへ流さない挙動も確認 |
| locomotion | walk | `codex-job-2026-07-14T18-41-02-175Z-z31kse` | loop | usable-final / shadow clear | conditional accept。歩行量は控えめだが3方向で読め、preview／download可 |
| high motion one-shot | attack | `codex-job-2026-07-14T18-41-02-307Z-mvltox` | exempt | usable-final / shadow warning | accept。anticipation、swing、recoveryが明瞭で、元素体も維持 |
| airborne | jump | `codex-job-2026-07-14T18-41-02-375Z-rcst8a` | exempt | usable-final / shadow warning | accept。離陸から着地まで読め、preview／全export導線を確認 |

### Quality v2実測

| action | identity | footline | loop seam | phase | 補正frame率 | 平均scale差 | 平均移動量 | raw → normalized foot drift | shadow |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| idle | 85.55 | 89.00 | 63.80 | 77.84 | 0.3750 | 0.0060 | 1.66px | 1.00 → 0px | clear（実測後にstatic-loop検出を追加） |
| walk | 85.19 | 100.00 | 45.13 | 76.85 | 0.4583 | 0.0087 | 2.53px | 0 → 0px | clear |
| attack | 80.87 | 96.32 | exempt | 94.19 | 0.9167 | 0.1154 | 30.60px | 0.67 → 0px | normalization補正量を警告 |
| jump | 85.72 | 100.00 | exempt | 89.24 | 1.0000 | 0.0376 | 34.86px | 24.67 → 0px | normalization補正量を警告 |

idleの実測レポート作成時点ではshadowがstatic loopを警告できなかったため、最終実装では`idle`／`subtle-loop`の3方向中2方向以上がほぼ静止なら警告する条件と回帰テストを追加した。既存hard gateの判定は変更していない。

attackとjumpは正規化後のfootlineだけを見ると良好に見えるが、raw値と補正量を分離したことで、見た目の合格を維持しながら生成側の改善候補を残せた。特にjumpはraw foot drift 24.67pxが正規化後0pxになっており、v2の目的どおり「補正で隠れた揺れ」を記録できた。

ブラウザでは3方向artifactのserver recovery、history登録、preview、Animation Pack downloadを確認した。3方向結果でも一部ラベルが「5方向プレビュー」と表示される点はPhase 6のUI文言改善候補として残す。

## 検証コマンド

```text
node scripts/doctor.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build
node scripts/smoke.mjs
node scripts/release-audit.mjs
node scripts/ui-smoke.mjs
```

2026-07-15時点で実runner 4件とブラウザ目視を完了。doctor、型検査、全73テスト、production build、server smoke、release audit、UI smoke（276.4秒）はすべて成功した。
