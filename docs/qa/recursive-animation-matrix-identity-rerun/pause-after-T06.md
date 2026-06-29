# T06完了時点の一時停止メモ

ご主人のPC更新と再起動のため、T06完了後に作業を中断した。

## 作業場所

- 正規ルート: `<project-root>`
- 作業slot: `<slot6-worktree>`
- ブランチ: `codex/recursive-animation-matrix-identity-rerun`
- マトリクス: `docs\qa\recursive-animation-matrix-identity-rerun\matrix.md`

## 実行状況

T01からT06まで、Image Cockpitの実ブラウザUIから `Generate Animation` を実行済み。
T07以降は未実施。

T01からT03は標準の3候補トーナメントで実行した。
T04からT06はusage limit回避のため、`VITE_STANDARD_ANIMATION_TOURNAMENT_CANDIDATES=1` を指定した単候補QAモードで実行した。

## T06までの分類

| ID | 素体 | preset | 状態 | 主分類 | メモ |
| --- | --- | --- | --- | --- | --- |
| T01 | basic-young-male-hero | idle-breathing | 成功 | visual_ok | 同一性維持。idleは小さめだがUI import成功。 |
| T02 | basic-young-male-hero | run-cycle | 成功 | visual_ok / external_candidate_error | winnerは成功。candidate 3のみ `imagegen_unavailable`。 |
| T03 | basic-young-female-hero | walk-cycle | 外部ブロック | usage_limit / runner_stall | usage limitにより停止。品質失敗として数えない。 |
| T04 | profession-young-male-sword-fighter | basic-attack | 成功 | visual_ok | 剣士同一性と攻撃動作を維持。 |
| T05 | basic-small-village-child | talk | 失敗 | quality_gate_failure / motion_too_small | `Direction split QA failed: side: motion too small (2% average frame change)`。 |
| T06 | basic-small-village-child | hurt-reaction | 成功 | visual_ok | 子供素体の同一性を維持。hurt反応も読み取れる。 |

## T06証拠

- trial dir: `docs\qa\recursive-animation-matrix-identity-rerun\trials\T06-basic-small-village-child-hurt-reaction`
- job id: `codex-job-2026-06-29T09-52-42-073Z-7a0dtw`
- completed: `2026-06-29T10:15:28.622Z`
- UI screenshot: `after-complete-ui.png`
- UI text: `after-complete-ui.txt`
- preview capture: `ui-preview-image.png`

T06のUI上に残っている `Material quality gate failed` 通知は、T05の古い通知であり、T06の失敗ではない。

## 未完了

- T07 basic-hooded-mysterious-figure / spell-cast
- T08 basic-hooded-mysterious-figure / death-downed
- T09 profession-young-female-ninja / basic-attack
- T10 profession-young-female-witch / jump-hop
- 日本語最終レポート作成
- 失敗分を含む生成GIF一覧HTMLを `tmp` に作成
- 同一性崩壊の原因整理と改善案作成

## 再開時の目安

再開時はT07から続行する。
サーバーを起動する場合は、T04からT06で使った単候補QAモードを維持する。

```powershell
$env:VITE_STANDARD_ANIMATION_TOURNAMENT_CANDIDATES='1'
$env:VITE_IMAGE_COCKPIT_SUPERVISOR_PORT='8876'
$env:IMAGE_COCKPIT_VITE_PORT='5266'
$env:IMAGE_COCKPIT_API_PORT='8866'
$env:IMAGE_COCKPIT_SUPERVISOR_PORT='8876'
$env:IMAGE_COCKPIT_HANDOFF_DIR='tmp\recursive-animation-matrix-identity-rerun\handoff'
$env:IMAGE_COCKPIT_CODEX_AUTORUN='1'
$env:IMAGE_COCKPIT_ARTIFACT_STABLE_MS='0'
npm run dev:all
```

再開後は、T06の成果物とログを再確認してから、T07の実ブラウザ生成へ進む。
