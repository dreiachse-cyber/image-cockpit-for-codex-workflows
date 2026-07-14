# Motion Recipe / Prompt Compiler QA

## 実装範囲

- `image-cockpit.motion-recipe.v1` と Recipe v1 / Compiler `1.0.0` を追加した。
- 既存16プリセットを `src/lib/motionRecipes.ts` へ移行し、ID・日本語/英語名・アクション・プレビュー・FPS・ループ挙動を維持した。
- `defaultActions`、プリセット選択UI、生成プロンプト、negative prompt、Quality v2契約、履歴、direction manifest、animation pack exportを同じRecipeから供給する。
- App内の旧プリセット表と旧プリセット別プロンプト表は削除し、`MOTION_RECIPES` を実行時の唯一の定義元にした。

## Compiler契約

出力順は常に次の通り。

1. `hard`
2. `motion`
3. `phases`
4. `identity`
5. `direction`
6. `background`
7. `negative`

各文を正規化して重複除去し、Recipe ID/版、Compiler版、適用modifier、除外modifier、重複除去数をdiagnosticsへ残す。modifier未指定時は自由入力を補わず、版付きRecipeだけを利用する。

## QA契約

Recipeから次をコンパイルする。

- Quality v2 action profile
- 期待フレームフェーズ
- ループ/seam要否
- grounding profile
- motion range
- root/footline許容値
- 必須prop / 許可VFX
- FPS / frame count / export defaults

Quality v2はRecipe契約が渡された場合、アクション名推測よりRecipeを優先する。既存ジョブは従来のアクション名フォールバックを維持する。

## 互換性

- 版なしの旧preset/historyはpreset IDまたはactionからv1へ解決し、migration warningを返す。
- v0はv1へ移行しwarningを返す。
- 未知の版は黙って解釈せず、現行版へフォールバックしたことを明示warningに残す。
- `motionRecipe`を持たない旧animation pack manifestは従来どおり読み込める。
- 新規direction manifest、履歴、animation packにはRecipe ID/版/Compiler版/QA profileを保存する。

## 自動テスト

- 16 Recipeそれぞれのschema validation + snapshot。
- Compiler節順序、modifier追加/除外、重複除去、metadataのテスト。
- exact / legacy / v0 / unknown version / action fallback / safe defaultの解決テスト。
- subtle loop / locomotion / grounded one-shot / airborne-downedのQA契約テスト。
- Animation Quality v2がRecipe契約を優先するテスト。
- 旧pack manifest互換と新Recipe metadata保持のテスト。

## 実ブラウザQA

2026-07-15に `http://127.0.0.1:5181/` を実ブラウザで操作し、同じ参照画像を使って Fast / 1 candidate / front・side・back の3方向生成を要求した。

| 代表契約 | Recipe | Tournament | Job / 状態（記録時点） |
| --- | --- | --- | --- |
| subtle loop | `idle-breathing` | `anim-tournament_stf9wl_mrl83615` | `codex-job-2026-07-14T22-28-27-846Z-yokvph` / 3方向PNGとmanifest生成済み |
| locomotion | `walk-cycle` | `anim-tournament_mfck7d_mrl85awz` | `codex-job-2026-07-14T22-30-07-669Z-0c35mq` / running |
| grounded one-shot | `basic-attack` | `anim-tournament_7hx0gs_mrl86d4z` | `codex-job-2026-07-14T22-30-57-010Z-dzysdo` / accepted |
| airborne/downed | `death-downed` | `anim-tournament_qqz4t6_mrl87569` | `codex-job-2026-07-14T22-46-53-022Z-mo1gs3` / queuedからrunningへ自動昇格 |

確認事項:

- 4件とも `tournament.json` にRecipe ID、Recipe v1、Compiler `1.0.0` が保存された。
- `idle-breathing` の実direction manifestに `qualityProfile: subtle-loop` が保存された。
- `basic-attack` の実direction manifestに `qualityProfile: grounded-soft` が保存された。
- UIのAdvanced diagnosticsで節順 `hard -> motion -> phases -> identity -> direction -> background -> negative`、QA profile、適用/除外modifier、重複除去数を確認した。
- 3件実行中に4件目を選ぶとボタンが「キューに追加」へ変わり、投入後は `queued` / `Waiting for an open slot` 相当として保持された。
- `basic-attack` の完了後、待機していた `death-downed` が自動的にrunner枠へ入り、実job IDを取得した。
- subtle loopのランナーログでは24セルの余白、足元基準、隣接フレーム差分を実測してから3方向PNGを公開しており、Recipe由来のQA指示が実生成工程まで到達した。

実生成成果物はgit管理対象外の `codex-handoff/outbox/.tournaments/` に保存される。Phase 3のリポジトリ検証は、上記実ブラウザ確認とは別に `doctor`、型検査、108 unit tests、production build、smoke、UI smoke、release audit、`git diff --check` を通した。
