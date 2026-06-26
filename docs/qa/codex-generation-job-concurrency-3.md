# Codex Generation Job Concurrency 3 QA

実施日: 2026-06-26 13:35 JST

## 対象

- branch: `codex/generation-job-concurrency-3`
- base: `origin/main` `c0b8118`
- 目的: Codex / built-in imagegen 生成jobの同時実行上限を2本から3本へ変更し、4本目以降は既存queueへ積む。

## 確認内容

- `MAX_ACTIVE_CODEX_JOBS` を3へ変更した。
- UI smokeのCodex queue確認を4本投入へ更新した。
- 1本目、2本目、3本目は通常の生成アクションで投入できることを確認した。
- 3本実行中のみprimary actionが `Queue Codex Job` に切り替わることを確認した。
- 4本目は `Queued` / `Waiting for an open slot` として表示されることを確認した。
- queue drain後に `.codex-job-row` が0件へ戻ることを確認した。
- 完了後のCodex log card保持上限は従来どおり最大2件であることを確認した。

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
git diff --check
scripts/ui-smoke.mjs
```

すべて成功。

## 補足

- 実imagegenによる大量投入確認は未実施。
- queue制御そのものはUI smokeのmock runnerで確認した。
- `vite build` では既存のchunk size warningのみ出力された。
