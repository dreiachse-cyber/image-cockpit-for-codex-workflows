# Official Animation Preset Batch 2-10 QA

作成日: 2026-06-26

## Summary

`basic-attack`、`hurt-reaction`、`death-downed`、`spell-cast`、`jump-hop`、`guard-block`、`victory-cheer`、`interact-pickup` の8件を、方向別Codex/imagegen実生成から公式サンプル化した。

今回の状態は「pilot structural QA pass / 1 accepted generation per preset」。各presetは5方向 x 8フレーム、2048 x 1280、1セル256 x 256pxの機械QAと目視QAを通したが、指示書で理想としている5回連続のprompt安定性ゲートはまだ完了していない。

`dash` は今回対象外のため追加していない。

## Prompt Contract Location

最終prompt contractはコード側に集約している。

- `src/App.tsx`
- `animationPresetCatalog`
- `animationPresetMotionSheetLines`
- `animationPresetMotionPromptLines`
- `buildAnimationPresetNotes(...)`

各ジョブは、上記のpreset別motion prompt、共通の5方向/8フレーム/256px固定セル/ガイドグリッド/クロマキー条件、negative prompt、retry観点を渡して実生成した。

## Accepted Samples

| preset | action | adopted job id | sample | mechanical QA | visual QA |
| --- | --- | --- | --- | --- | --- |
| `basic-attack` | `attack` | `codex-job-2026-06-25T21-02-07-575Z` | `public/samples/basic-attack-sheet.png` | errors 0 / warnings 2 | 採用。基本攻撃として読める。小さな攻撃表現の右側余白がやや近いフレームあり。 |
| `hurt-reaction` | `hurt` | `codex-job-2026-06-25T21-19-09-228Z` | `public/samples/hurt-reaction-sheet.png` | errors 0 / warnings 0 | 採用。のけぞり、踏ん張り、復帰が読める。 |
| `death-downed` | `death` | `codex-job-2026-06-25T21-33-50-902Z` | `public/samples/death-downed-sheet.png` | errors 0 / warnings 0 | 採用。非グロのダウンとして読め、背面も真後ろに近い。 |
| `spell-cast` | `cast` | `codex-job-2026-06-26T04-21-32-475Z` | `public/samples/spell-cast-sheet.png` | errors 0 / warnings 0 | リテイク採用。1方向だけ頭身・服装が変わる問題を解消し、白髪・服・杖・体型が5方向で揃った。 |
| `jump-hop` | `jump` | `codex-job-2026-06-25T21-33-50-977Z` | `public/samples/jump-hop-sheet.png` | errors 0 / warnings 0 | 採用。小さなその場ジャンプとして読める。 |
| `guard-block` | `guard` | `codex-job-2026-06-25T21-54-18-523Z` | `public/samples/guard-block-sheet.png` | errors 0 / warnings 0 | 採用。盾なしでもガード姿勢として読める。 |
| `victory-cheer` | `cheer` | `codex-job-2026-06-25T21-54-18-553Z` | `public/samples/victory-cheer-sheet.png` | errors 0 / warnings 0 | 採用。手振り/勝利ポーズ/軽い跳ねとして読める。 |
| `interact-pickup` | `interact` | `codex-job-2026-06-25T22-10-11-861Z` | `public/samples/interact-pickup-sheet.png` | errors 0 / warnings 0 | 採用。見る、手を伸ばす、拾う/調べる、戻る動きとして読める。 |

## QA Artifacts

各presetのQA成果物は以下に保存した。

- `docs/qa/official-basic-attack/`
- `docs/qa/official-hurt-reaction/`
- `docs/qa/official-death-downed/`
- `docs/qa/official-spell-cast/`
- `docs/qa/official-jump-hop/`
- `docs/qa/official-guard-block/`
- `docs/qa/official-victory-cheer/`
- `docs/qa/official-interact-pickup/`

各ディレクトリには、少なくとも以下を置いている。

- `*-grid-qa.png`
- `*-transparent-contact.png`
- 5方向GIF
- `*-mechanical-qa.json`

## Transparency Audit

ユーザーレビューで複数presetのGIF previewに非透過フレーム疑いが出たため、全16公式presetのPNG sheetと5方向GIF previewを再監査した。監査結果は `docs/qa/official-animation-transparency-audit.json` に保存し、現時点のfailuresは0。

元のPNG sheetは透過だったが、QA GIF書き出し時にopaque matteが混じる可能性があったため、5方向GIFを透明index付きで再生成した。

## Retake Notes

`spell-cast` は初回採用版で1方向だけ頭身・服装が違って見えたため、prompt contractへ同一術者identity、同一robe/staff、同一head-to-body ratio、同一compact magic effect languageを追加し、再生成版を採用した。

## Discarded Job

`codex-job-2026-06-25T21-52-19-109Z` は、PowerShell側のjob body組み立てミスでpromptに `New-JobBody` 断片が混ざったため破棄した。これは画像生成promptの失敗やCodex/imagegenのpolicy failureとしては数えない。

## Stability Gate Status

指示書の理想条件である「同じfinal prompt contractで5回連続または近い条件5回の構造QA 0件不合格」は、今回まだ完了していない。

現時点でUIに出している根拠は、各presetの1採用ジョブで以下を満たしたこと。

- 実生成サンプルである
- 5方向 x 8フレームの構造になっている
- 2048 x 1280、1セル256 x 256pxとして切り出せる
- 機械QAでedge touchなし
- 方向別GIFで動作が読める
- back行が背面として読める

次の品質向上タスクでは、各presetにつき最低5回の近条件生成を走らせ、失敗パターンをprompt contractへ反映する。
