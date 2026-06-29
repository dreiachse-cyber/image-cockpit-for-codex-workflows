# T07完了時点の一時停止メモ

ご主人の指示により、T07完了後にこの再測定をいったん区切る。
T08以降は開始していない。

## 作業場所

- slot: `<slot6-worktree>`
- branch: `codex/recursive-animation-matrix-identity-rerun`
- evidence root: `docs\qa\recursive-animation-matrix-identity-rerun`
- trial dir: `docs\qa\recursive-animation-matrix-identity-rerun\trials\T07-basic-hooded-mysterious-figure-spell-cast`

## T07結果

| 項目 | 内容 |
| --- | --- |
| trial | T07 |
| source | `matrix-rerun-source-T07-basic-hooded-mysterious-figure.png` |
| preset | `Spell Cast` |
| job id | `codex-job-2026-06-29T10-27-10-480Z-43zitc` |
| runner status | `completed`, exitCode `0` |
| UI status | `failed` |
| 主分類 | `quality_gate_failure`, `motion_too_small` |
| visual adoption | `visual_review` |
| source match | `selectedImage.name` はT07元画像と一致 |
| identity collapse | `none` |
| import failure | 技術的なimport破損ではなく、quality gateによるimport拒否 |
| external block | なし |

## UI failure

UI上の失敗表示:

```text
Material quality gate failed
The completed Codex job returned outbox files, but the app could not import them.
Reason: Animation quality gate failed: no history or final download item was added.
All animation tournament candidates failed.
candidate 1/1: Direction split QA failed: front: motion too small (2% average frame change)
```

## 同一性崩壊メモ

生成された5方向画像を `t07-direction-contact.png` で目視確認した。
フード付きローブ、黒紫系の衣装、胸元/手元の紫発光、低い全身シルエットはおおむね維持されている。
くノ一が黒ずくめの男に変わるような、素体カテゴリ自体の崩壊はT07では見られない。

失敗理由は「別人化」ではなく、front方向の動きが小さすぎてアプリ側のdirection split QAに落ちたこと。

## 証拠ファイル

- `before-generate.png`
- `before-generate.txt`
- `after-click.png`
- `after-click.txt`
- `after-complete-ui.png`
- `after-complete-ui.txt`
- `t07-direction-contact.png`
- `codex-job-2026-06-29T10-27-10-480Z-43zitc.inbox.json`
- `codex-job-2026-06-29T10-27-10-480Z-43zitc.status.json`
- `codex-job-2026-06-29T10-27-10-480Z-43zitc.log`
- `codex-job-2026-06-29T10-27-10-480Z-43zitc-front.png`
- `codex-job-2026-06-29T10-27-10-480Z-43zitc-front-three-quarter.png`
- `codex-job-2026-06-29T10-27-10-480Z-43zitc-side.png`
- `codex-job-2026-06-29T10-27-10-480Z-43zitc-back-three-quarter.png`
- `codex-job-2026-06-29T10-27-10-480Z-43zitc-back.png`
- `codex-job-2026-06-29T10-27-10-480Z-43zitc-manifest.json`

## T01-T07時点の暫定分類

| ID | 状態 | 主分類 | 同一性崩壊 | メモ |
| --- | --- | --- | --- | --- |
| T01 | 成功 | `visual_ok` | `none` | 男性idle。 |
| T02 | 成功 | `visual_ok`, candidate-level `imagegen_unavailable` | `none` | 男性run。候補3のみ外部候補エラー。 |
| T03 | 外部ブロック | `usage_limit`, `runner_stall` | 未確定 | quality failureとして数えない。 |
| T04 | 成功 | `visual_ok` | `none` | 剣士attack。 |
| T05 | 失敗 | `quality_gate_failure`, `motion_too_small` | `none` | child talk。 |
| T06 | 成功 | `visual_ok` | `none` | child hurt。 |
| T07 | 失敗 | `quality_gate_failure`, `motion_too_small` | `none` | hooded spell cast。ローブ素体の別人化はなし。 |

## 未実施

- T08 basic-hooded-mysterious-figure / death-downed
- T09 profession-young-female-ninja / basic-attack
- T10 profession-young-female-witch / jump-hop
- 日本語最終レポート
- `tmp` のGIF一覧HTML
- 同一性崩壊の追加試行

再開する場合はT08から続行する。
