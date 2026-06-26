# Codex Log Card Limit 3 QA

実施日: 2026-06-27 JST

## 対象

- branch: `codex/codex-log-card-limit-3`
- base: `origin/main` `0da438f`
- 目的: Codex生成jobの同時実行上限3本に合わせて、通常表示 / fullscreen / mobile fullscreenのCodexログカード保持上限を最大3件へ揃え、ログ本文を最新行へ追従させる。

## 変更理由

- `MAX_ACTIVE_CODEX_JOBS = 3` に対して `CODEX_LOG_HISTORY_LIMIT = 2` のままだと、3本同時実行中に1本分のログカードを確認できない。
- 完了後も最新3本のログを残すことで、queue drain後に直近の実行結果を比較しやすくする。
- ログ本文が伸びても先頭側に残ると、実行中の最新状態を見落としやすい。

## 確認内容

- `CODEX_LOG_HISTORY_LIMIT` を `MAX_ACTIVE_CODEX_JOBS` に揃えた。
- 通常表示のCodexログカードは最大3件まで表示される。
- fullscreen表示のCodexログカードは最大3件まで表示される。
- mobile fullscreen表示でも最大3件前提で横あふれしない。
- mock runnerが複数行ログと `mock runner tail marker` を出力し、通常表示でログ本文が末尾へ自動スクロールされる。
- fullscreen切替直後とmobile fullscreen切替直後も、ログ本文が最新行側を指す。
- 4本投入後のqueue drainで、完了後ログカードは最新3件だけ残る。

## 実行結果

```text
node --check scripts/ui-smoke.mjs
node --check scripts/release-audit.mjs
tsc --noEmit
vitest run
tsc -b
vite build
scripts/smoke.mjs
scripts/release-audit.mjs
scripts/ui-smoke.mjs
git diff --check
```

すべて成功。

Codex DesktopのWindows環境では、Node系コマンドはバンドルNodeで直接実行した。`vite build` は既存のchunk size warningのみ出力した。

## 補足

- ログ本文の保存範囲、job履歴保存、localStorage / IndexedDB保存方式、Codex runner契約は変更していない。
- 手動で過去ログを読んでいる場合は、通常更新では可能な範囲で強制的に末尾へ戻さない。fullscreen切替時は最新行確認を優先して末尾へ寄せる。
