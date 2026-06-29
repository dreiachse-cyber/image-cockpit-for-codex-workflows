# 素体 x 公式アニメーションpreset 実ブラウザ生成QA 最終レポート

実施日: 2026-06-29 JST
目視再判定追記: 2026-06-29 JST

## 目的

Image Cockpitを実ブラウザで操作し、複数の素体画像と複数の公式アニメーションpresetを組み替えて、どの組み合わせでアニメーション生成が失敗しやすいかを実測した。

今回の重要な補正点:

- UIやjob上で `usable-final` が出ても、元の素体と別キャラになっていれば成功扱いにしない。
- 「システム上の生成成功」と「人間目視で採用できる成功」を分けて記録する。
- ご主人の目視基準では、成功例に見えるのは **T01 / T06 / T08** の3件。
- ただしT08はUI側quality gateでは `motion_too_small` で失敗しているため、「見た目は成功寄りだがシステムでは未採用」の改善候補として扱う。
- 追加監査により、複数trialでブラウザUIからCodexへ渡された `selectedImage.name` が意図した素体とズレていた。T07/T09/T10の黒ローブ化や少年化は、モデル単体の同一性崩壊というより、前の生成結果や別の素体がsourceとして渡った影響が強い。

## 証拠ルート

```text
docs/qa/recursive-animation-matrix-browser-qa/
```

主な証拠:

- `trials/<trial>/source.png`: 使用した素体
- `trials/<trial>/before-generate.png`: Generate実行前のブラウザ画面
- `trials/<trial>/after-terminal.png`: 完了後または失敗後のブラウザ画面
- `trials/<trial>/trial-start.json`: 開始時情報とjob id
- `trials/<trial>/poll-latest.json`: 最終ポーリング結果
- `trials/<trial>/trial-report.json`: UI状態、job状態、ログ、生成物の詳細
- `runtime-handoff/logs/<job id>.log`: 各jobの実ログ
- `runtime-handoff/outbox/`: 最終または品質判定済み生成物
- `runtime-handoff/outbox/.tournaments/`: 候補生成中のstaging生成物
- `tmp/recursive-animation-matrix-gif-gallery/index.html`: GIF一覧ビュー
- `tmp/recursive-animation-matrix-gif-gallery/review-contact-sheets/`: trial別の中間フレーム接触シート

## 判定ルール

この版では、以下の2軸で判定する。

### 1. UI / システム判定

- `成功`: UIに最終アニメーションpreviewと方向別シートが表示された。
- `失敗`: UIに最終結果が取り込まれず、quality gate failureなどで止まった。
- `要確認`: UIに最終結果は出たが、候補jobの失敗率が高い。

### 2. 目視採用判定

- `目視OK`: 元素体の年齢感、性別、衣装、色、シルエット、主要小物が保たれており、アニメーションとして採用候補にできる。
- `目視NG`: 生成物が別キャラ化した、素体の特徴が消えた、動きが弱い、またはユーザー目視で採用できない。

以降の成功率は、ユーザーが実際に素材として使えるかを重視し、目視採用判定を優先する。

## 結果一覧

| Trial | 素体画像 | preset | UI / システム判定 | 目視採用判定 | 主な理由 | job id |
|---|---|---|---|---|---|---|
| T01 | `basic-young-male-hero.png` | Idle Breathing | 成功 | 目視OK | 元素体の髪、青マント、剣、体型が保たれている | `qf74xh`, `wbqh8p`, `i7mliv` |
| T02 | `basic-young-male-hero.png` | Run Cycle | 成功 | 目視NG | UIは成功したが、ご主人目視では成功例から除外 | `7ahlyf`, `q8h96g`, `2n1h8u` |
| T03 | `basic-young-female-hero.png` | Walk Cycle | 失敗 | 目視NG | `motion_too_small`。quality gate failure | `wt6e0e`, `mi6sch`, `03od15` |
| T04 | `profession-young-male-sword-fighter.png` | Basic Attack | 成功 | 目視NG | 男性剣士素体から赤髪女性戦士寄りに変化。素体同一性崩壊 | `ndl7do`, `kjsu89`, `1tszfm` |
| T05 | `basic-small-village-child.png` | Talk / NPC Reaction | 失敗 | 目視NG | `motion_too_small`。会話リアクションとして動きが弱い | `cl5tye`, `a7g2qa`, `r9xxhv` |
| T06 | `basic-small-village-child.png` | Hurt Reaction | 成功 | 目視OK | 小柄素体の体型、服色、年齢感が概ね保たれている | `ux1ftr`, `zs6yrm`, `sfgleq` |
| T07 | `basic-hooded-mysterious-figure.png` | Spell Cast | 成功 | 目視NG | 大人の黒ローブ素体が茶髪の少年術者に変化。素体同一性崩壊 | `wkd9ne`, `5ytsmj`, `86qz8j` |
| T08 | `basic-hooded-mysterious-figure.png` | Death / Downed | 失敗 | 目視OK | UIでは `motion_too_small` 失敗だが、ローブ/フードの同一性は保たれている | `y5i5s1`, `eg1lwe`, `1z2xf7` |
| T09 | `profession-young-female-ninja.png` | Basic Attack | 要確認 | 目視NG | 女性クノイチが黒ローブ人物/男性風に変化。素体同一性崩壊 | `m6y38g`, `ppkt67`, `8sb1rs` |
| T10 | `profession-young-female-witch.png` | Jump / Hop | 成功 | 目視NG | 魔女の帽子、杖、ほうき、顔立ちが消え、黒フード人物に変化。素体同一性崩壊 | `j0wjyf`, `o5jxgr`, `rjld86` |

## 集計

- 実ブラウザでGenerate Animationを実行した組み合わせ: 10件
- UI / システム判定で成功: 6件
- UI / システム判定で要確認: 1件
- UI / システム判定で失敗: 3件
- 目視採用OK: 3件
  - T01
  - T06
  - T08
- UI成功かつ目視OK: 2件
  - T01
  - T06
- UI失敗だが目視OK: 1件
  - T08
- UI成功または要確認だが目視NG: 5件
  - T02, T04, T07, T09, T10
- `motion_too_small` によるシステム失敗: 3件
  - T03, T05, T08
- 明確な素体同一性崩壊: 4件
  - T04, T07, T09, T10
- 意図した素体と実際の `selectedImage.name` がズレていたtrial: 6件
  - T03, T04, T05, T07, T09, T10
- `imagegen_unavailable` が出たcandidate job: 30件中6件
- `usage limit`: 0件
- `policy / safety block`: 0件

## 失敗パターン

### 1. source selection drift

追加監査で最も重要だったのは、ブラウザUIからCodexへ渡されたsourceが、意図した素体と一致していないtrialが複数あったこと。

| Trial | 意図した素体 | 実際にhandoffへ渡ったsource | 判定 |
|---|---|---|---|
| T01 | `basic-young-male-hero.png` | `matrix-source-T00-basic-young-male-hero.png` | OK |
| T02 | `basic-young-male-hero.png` | `matrix-source-T00-basic-young-male-hero.png` | OK |
| T03 | `basic-young-female-hero.png` | `codex-job-...q8h96g-direction-split-animation-sheet.png` | NG |
| T04 | `profession-young-male-sword-fighter.png` | `matrix-source-T03-basic-young-female-hero.png` | NG |
| T05 | `basic-small-village-child.png` | `codex-job-...ndl7do-direction-split-animation-sheet.png` | NG |
| T06 | `basic-small-village-child.png` | `matrix-source-T05-basic-small-village-child.png` | OK |
| T07 | `basic-hooded-mysterious-figure.png` | `codex-job-...sfgleq-direction-split-animation-sheet.png` | NG |
| T08 | `basic-hooded-mysterious-figure.png` | `matrix-source-T07-basic-hooded-mysterious-figure.png` | OK |
| T09 | `profession-young-female-ninja.png` | `matrix-source-T07-basic-hooded-mysterious-figure.png` | NG |
| T10 | `profession-young-female-witch.png` | `codex-job-...8sb1rs-direction-split-animation-sheet.png` | NG |

このため、T07が少年術者になった件、T09/T10が黒ローブ人物になった件は、「正しい素体を渡したのにモデルが完全に無視した」というより、ブラウザ操作後の選択状態がずれて、前回結果や別素体をsourceとして渡した可能性が高い。

つまり、ブラウザから実生成してもこの現象は起こる。しかも原因は生成モデルだけでなく、UIのsource選択状態、Recover Results、履歴選択、生成後の自動選択が絡む。

### 2. 素体同一性崩壊

`usable-final` と同一性維持を同一視していた点も見落としだった。

該当trial:

- T04: 男性剣士が赤髪女性戦士寄りに変化
- T07: 黒ローブの大人が茶髪の少年術者に変化
- T09: 女性クノイチが黒ローブ人物/男性風に変化
- T10: 魔女が黒フード人物に変化し、帽子、杖、ほうき、ポーションなどの特徴が消失

傾向:

- 公式presetの動作や職業イメージが強く、入力素体の性別、年齢、衣装、小物より優先されている。
- 現在のquality gateは、シート形式、chroma、フレーム変化、切れなどは見ているが、元画像との同一性を十分に評価していない。
- 黒ローブ、魔法、忍者、攻撃などの強い記号があると、モデル側の典型キャラへ引っ張られやすい。
- ただし今回のT07/T09/T10ではsource自体のズレが強く疑われるため、純粋なprompt失敗とは切り分ける必要がある。

### 3. motion too small

システム上もっとも再現性が高い失敗は `motion_too_small` だった。

該当trial:

- T03: 人間女性 + Walk Cycle
- T05: chibi + Talk / NPC Reaction
- T08: ローブ / マント + Death / Downed

補正後の見方:

- T03とT05は、システム失敗かつ目視NG。
- T08は、システムでは失敗だが、目視では成功例に見える。
- つまり `motion_too_small` は必ずしも人間目視の失敗とは一致しない。

### 4. imagegen_unavailable

`imagegen_unavailable` は、全体停止ではなくcandidate job単位の外部系失敗として出た。

該当trial:

- T02, T06, T07, T09, T10

補正後の見方:

- `imagegen_unavailable` 自体は品質失敗ではない。
- ただし、残った成功候補が別キャラ化している場合は、目視では失敗扱いにする必要がある。

## 安全な組み合わせ

### T01: 人間男性 + Idle Breathing

- UI成功
- 目視OK
- 元素体のシルエットと主要小物が保たれている
- UI完走かつ目視採用OK

### T06: 小柄 / chibi + Hurt Reaction

- UI成功
- 目視OK
- 小柄素体の体型と衣装色が概ね保たれている
- TalkよりHurtの方が動きが読み取りやすい

### T08: 黒ローブ素体 + Death / Downed

- UIでは `motion_too_small` 失敗
- 目視では成功例
- 同一性は保たれているため、quality gateの閾値やpreset別判定を見直す価値が高い

## 危険な組み合わせ

- T04: 武器あり男性 + Basic Attack
  - 攻撃エフェクトと戦士テンプレートに引っ張られ、素体が別キャラ化。
- T07: ローブ / マント + Spell Cast
  - 魔法少年テンプレートに寄り、元の大人ローブ素体が消失。
- T09: 女性忍者 + Basic Attack
  - クノイチの顔、体型、青い衣装、短剣が黒ローブ人物に置換。
- T10: 魔女 + Jump / Hop
  - 帽子、杖、ほうき、ポーションが消え、黒フード人物化。
- T03 / T05
  - 動きが小さく、quality gateに落ちやすい。

## 改善案

### prompt改善

- `Preserve the exact same character identity` を強く入れるだけではなく、保持すべき要素を列挙する。
  - 性別
  - 年齢感
  - 髪型と髪色
  - 顔の見え方
  - 服の色
  - 帽子、杖、ほうき、短剣、マントなどの小物
  - 体格とシルエット
- ローブ、魔法、忍者、攻撃などのpresetでは、典型キャラ化を抑制する否定条件を入れる。
  - `do not change into a different wizard`
  - `do not change gender`
  - `do not simplify into a generic hooded figure`
  - `keep the original props visible`
- Death / Downedのような静的presetでは、見た目OKなのに `motion_too_small` で落ちないよう、倒れ始めから着地までの推移を明示する。

### 処理 / UI改善

- quality gateに「元画像との同一性チェック」を追加する。
  - 色ヒストグラム差分
  - シルエット類似度
  - 主要小物の保持チェック
  - 顔/髪/帽子/武器の簡易検出
- reportに以下を分けて出す。
  - UI / システム判定
  - candidate health
  - 目視採用判定
  - 同一性崩壊の有無
- `motion_too_small` はpreset別に閾値を変える。
  - Death / Downedは、静止時間が長くても成功に見える場合がある。
  - Talk / Walkは、腕、肩、髪、服の揺れを必須化した方がよい。
- tournament winnerの採点に、単なる完成度だけでなく「元素体に似ているか」を入れる。

## 結論

初回集計では、UIに `usable-final` が出たものを成功寄りに扱っていたが、目視再判定ではこれは甘すぎた。

ご主人の目視基準では、成功例は **T01 / T06 / T08** の3件。

ただし運用上はさらに分かれる。

- T01: UIも目視も成功。安全例。
- T06: UIも目視も成功。小柄Hurtの成功例。
- T08: 目視は成功だがUI quality gateで失敗。閾値改善候補。
- T02 / T04 / T07 / T09 / T10: UI上は出ても、目視では採用不可。
- T03 / T05: システム上も目視上も失敗。

次に改善するなら、まずブラウザUIのsource選択状態を固定し、handoff JSONに「期待source」と「実selectedImage」を明示して不一致なら生成前に止めるべき。その次に、`motion_too_small` と素体同一性チェックを改善する。
