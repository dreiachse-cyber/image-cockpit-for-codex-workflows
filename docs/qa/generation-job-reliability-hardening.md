# Generation Job Reliability Hardening QA

実施日: 2026-06-27 JST

## 対象

- branch: `codex/generation-job-reliability-hardening`
- base: `origin/main` `0eb9ddf`
- 方針: 確認ゲート付き。実装、commit、branch push、検証までは進めるが、main merge前にご主人確認へ戻す。

## 変更内容

- direction split標準出力は、manifestを最終commit markerとして扱う。
- manifestなしのpartial direction PNGだけでは `Direction split import failed` を出さず、最終manifest待ちにする。
- manifest + 5方向PNGが揃った場合は、runner statusがrunning中でもUI import成功でactive job枠を解放する。
- import failed noticeには元job情報を保持し、同jobIdのoutbox更新を自動再試行する。
- import failed cardへ `Retry import` / `再取り込み` を追加した。
- 成功したjobの同jobId failure noticeは自動で消す。
- `/api/codex/results` は `.staging*`、`*-work-*`、`*-qa.json`、`.qa.json` を通常import候補から外す。
- 子Codex向けprompt / job notesへ、work-in-progressはoutbox rootへ置かない、manifestを最後に書く、`git status` / `Remove-Item` cleanupをしない方針を追記した。

## 検証シナリオ

- partial direction files:
  - UI smokeで `mock-partial-direction-split-recovery.flag` を使い、先に2方向PNGだけをoutboxへ書く。
  - manifestがまだない間、failure cardが増えないことを確認した。
  - 後から5方向PNG + manifestが揃った時点でhistoryへ取り込まれ、active job枠が解放されることを確認した。
- manifest + 5方向PNG:
  - unit testで `selectDirectionSplitAnimationResults()` がmanifest + 5方向PNGをready扱いすることを確認した。
  - UI smokeで `direction-split manifest ok` の成功statusを確認した。
- import failure後のoutbox更新:
  - import failed noticeにretry job snapshotを保持し、自動再試行と手動 `Retry import` の導線を追加した。
  - 成功時は `clearCodexFailureNotice()` で同jobIdのfailure noticeを消す。
- QA / work files:
  - smokeで `manual-qa.json`、`manual-work-output.png`、`.staging-manual.png` が `/api/codex/results` に出ないことを確認した。
- policy / safety blocker:
  - 既存UI smokeの `policy blocked ui smoke` で、安全なfailure noticeとactive slot解放を継続確認した。

## 実行結果

```text
node --check scripts/ui-smoke.mjs
node --check scripts/release-audit.mjs
node --check scripts/smoke.mjs
tsc --noEmit
vitest run
tsc -b
vite build
scripts/smoke.mjs
scripts/release-audit.mjs
scripts/ui-smoke.mjs
git diff --check
```

すべて成功。`vite build` は既存のchunk size warningのみ出力した。

## 未確認 / 確認ゲート

- 実Codex / 実imagegenで、stream reconnect後に完成品が出るケースの手動確認は未実施。
- Bronze fallbackの専用サムネイルUIは追加していない。現時点ではimport failed card、outbox保持、自動再試行、手動 `Retry import` で救済する。
- main mergeはご主人確認後に行う。
