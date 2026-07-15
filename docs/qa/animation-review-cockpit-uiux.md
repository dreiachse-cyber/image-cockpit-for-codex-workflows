# Animation Review Cockpit UI/UX QA

実施日: 2026-07-15
対象ブランチ: `codex/animation-uplift-sequence`
対象Phase: 6 / Animation Review Cockpit UI/UX

## 到達点

- Tournament Monitor の永続候補から Review A/B/C を開き、候補ごとの実アーティファクトを同じ方向、フレーム、速度で同期表示する。
- Raw / Normalized、原画オーバーレイ濃度、0.5x–2x、再生 / 停止 / 前後フレーム、全方向切替を一か所にまとめる。
- Identity、Palette、Silhouette、接地QA、Loop seam、Phase、Motion、Correction の8指標を、数値・アイコン・Pass / Warning / Failで併記する。
- 自動採用理由、残警告、Candidate C追加理由、失敗理由、Direction Repair由来候補を候補カード内で確認できる。
- Human Review は winner / hold / reject、理由タグ、1000文字メモをトーナメントmanifestへ永続化し、再起動と再表示後も復元する。
- Calibration JSON は自動指標と人手判断を混ぜず、`image-cockpit.animation-review-calibration.v1` として書き出す。
- Direction × Frame QC Matrix は6ヒートマップを持ち、セル詳細で Raw / Normalized / Adjacent diff、scale、translate X/Yを確認する。
- Direction Repair は選択方向だけを既存APIへ渡す。Frame-range Repair は未変更フレーム保証がないため、理由付きで無効化する。
- Preview Studio は Onion、Prev/next diff、Ground、Pivot、Socket、Hitbox、Hurtbox、Checker / Light / Dark、Loop seamを持つ。
- 生成導線は3段の折りたたみstepperとsticky CTAにし、Actual source、source mismatch、active animation jobsをCTA付近へ固定する。
- Motion Browser は既存の検索、Topology、Loop、Weapon、Movement、Frames、Recent / Favoritesに Category と Verified / Experimental を追加する。

## 永続化契約

トーナメントmanifestに次を追加した。

```json
{
  "humanReview": {
    "updatedAt": "ISO-8601",
    "manualWinnerJobId": "codex-job-*",
    "decisions": [
      {
        "jobId": "codex-job-*",
        "decision": "winner",
        "reasonTags": ["over-correction"],
        "note": "目視判断"
      }
    ]
  }
}
```

`POST /api/codex/tournaments/:id/review` は候補外job idを除外し、decision、タグ数、タグ長、メモ長を正規化してatomic writeする。自動winnerの`winnerCandidateId`は人手レビュー保存だけでは変更せず、明示的な採用操作でのみ既存winner APIを通す。

## ブラウザfixture matrix

| シナリオ | 候補 | 方向 | 状態 | 確認項目 |
| --- | ---: | ---: | --- | --- |
| 実ローカルFast | 1 | 3 | accepted / 7 warnings / repairable | 12f 4×3シート、8指標、保存と再読込、BBox Failセル |
| UI smoke Best | 3 | 5 | quality-evaluated / accepted | A/B/C同期、5方向、手動winner、タグ、メモ、QC、overlay |
| UI smoke error paths | 1–3 | 3 / 5 | failed / missing / quality-gated | fail理由、非カラー状態、Reviewを壊さず表示 |
| Direction Repair | 追加候補 | 1以上 | repairing / quality-evaluated | 対象方向のみ、frame-range無効理由、既存方向保持 |

## アクセシビリティ

- Review と Motion Browser は `role="dialog"`、`aria-modal`、見出し参照を持つ。
- 初期フォーカス、Tab / Shift+Tab trap、Escape終了、呼び出しボタンへのフォーカス復帰を実装した。
- 候補選択、品質状態、方向選択、filter tab、overlayは `aria-pressed` / `aria-selected` / テキストラベルを持つ。
- QC状態は色だけに依存せず、Check / Warning / Failアイコン、状態名、数値を併記する。
- ArrowLeft / ArrowRightでフレーム移動、Spaceで再生 / 停止する。
- `prefers-reduced-motion: reduce` ではReview自動再生を停止し、Motion Browserの無限sample animationをpauseする。

## レスポンシブ

- 1280×720: header / sync toolbar / scroll body / adoption footerを分離し、footerを常時表示する。
- 390×844: modalを全画面化し、候補、Human Review、QC比較を1列化する。
- QC tableとsync toolbarだけを必要箇所で横スクロール可能にし、document全体とadoption footerは横あふれしない。

## 実行結果

- `tsc --noEmit`: pass
- Vitest: 9 files / 171 tests pass
- `scripts/smoke.mjs`: pass
- `scripts/ui-smoke.mjs`: pass、277.1秒
- UI smoke内 Phase 6: 実候補画像、8指標、review保存、6 heatmap、QC detail、7 overlays、keyboard、390×844、Escape / focus returnをpass
- Vite production build: pass
- 実ブラウザ: Fast / 3方向 / 12f accepted artifactを読込、Human Review保存、API再起動後の再保存、再表示一致を確認

## 監査画像

### Before

- `docs/qa/screenshots/animation-review-cockpit-audit/01-generation-flow-before.png`
- `docs/qa/screenshots/animation-review-cockpit-audit/02-tournament-monitor-before.png`
- `docs/qa/screenshots/animation-review-cockpit-audit/03-timeline-before.png`
- `docs/qa/screenshots/animation-review-cockpit-audit/04-motion-browser-before.png`

### After

- `docs/qa/screenshots/animation-review-cockpit-after/05-animation-review-after.png`
- `docs/qa/screenshots/animation-review-cockpit-after/ui-smoke-animation-generation-1280x720.png`
- `docs/qa/screenshots/animation-review-cockpit-after/ui-smoke-animation-preset-examples-modal-1280x720.png`

## 既知の境界

- Frame-range Repairは、生成器側で未変更フレームのhash不変を保証できるまで有効化しない。
- Normalized表示はQuality Gate v2の補正値をレビュー表示へ適用する。採用ファイル自体の再書き出しはPhase 5 timeline / pack側の責務とする。
- 原画オーバーレイは対応するsource historyがローカルに残っている候補だけで有効になる。
