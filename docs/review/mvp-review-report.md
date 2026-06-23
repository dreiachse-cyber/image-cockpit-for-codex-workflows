# MVP Review Report

更新日: 2026-06-23

## 目的

このMVPは、Codexがインストールされたローカル環境で、画像生成 / 画像編集 / スプライトシート生成 / スプライトシート編集を一つの制作コクピットから扱えるかを確認するためのprivate pre-release版です。

アプリ自身はOpenAI APIを直接呼びません。Codex連携は `codex-handoff/` 配下のローカルファイル受け渡しと、実行可能な環境での `codex exec` 起動に限定しています。

## レビュー手順

1. `npm run dev:all` を起動する。
2. 表示されたlocal URLを開く。
3. Guided Startで4つの入口を確認する。
4. `画像編集` を開き、prompt、編集メモ、注釈、選択画像がCodex handoff jobへ入ることを確認する。
5. `スプライトシート生成` でgrid splitからtimelineへ入る流れを確認する。
6. `スプライトシート編集` でframe size、anchor、chroma key透明化、exportを確認する。
7. `codex-handoff/inbox/`、`codex-handoff/assets/`、`codex-handoff/status/`、`codex-handoff/logs/` を確認する。
8. `codex exec` が実行できない環境では、`docs/usage/manual-handoff.md` に沿って画像を `codex-handoff/outbox/` に置き、Local Inbox取り込みを確認する。

## 主要成果

- Guided Startから4大ワークフローへ入れる。
- UIは低優先の細かい機能を既定非表示にし、主要操作を先に見せる。
- Codex job作成後は、結果が戻るまで二重作成を防ぐ。
- 簡素化UIでも `Import Latest` が見えるため、manual handoff後にprovider一覧を開かずLocal Inboxから取り込める。
- handoff jobにworkflow種別、編集メモ、選択画像asset、注釈、grid、sprite contextが入る。
- 画像生成jobはprompt中心にし、画像編集jobだけが選択画像assetと注釈を持つ。
- local serverは `IMAGE_COCKPIT_CODEX_AUTORUN=1` のとき `codex exec` を起動する。
- runnerがdisabled / unavailable / failed / completedを記録し、UIのpendingを解除できる。
- sprite-editではframe size、anchor、chroma key透明化、PNG / ZIP / GIF / metadata exportを確認できる。

## 検証済み

```powershell
npm run doctor
npm run typecheck
npm test
npm run build
npm run smoke
npm run release:audit
```

追加smoke:

- `IMAGE_COCKPIT_CODEX_AUTORUN=0` でrunner state `disabled` を確認。
- `npm run doctor` で必須ファイル、handoff folder書き込み、Codex command availabilityを確認。
- 現在のWindows環境では `codex` 実行が `spawn EPERM` となり、runner state `unavailable` として記録されることを確認。
- `/api/codex/jobs` smokeで、job JSONに `workflowMode=image-edit`、編集メモ、`annotationCount=1`、`selectedImage.assetPath` が入ることを確認。
- `/api/codex/jobs` smokeで、`workflowMode=image-generate` のjobに選択画像asset、編集注釈、sprite contextが混入しないことを確認。
- `/api/codex/results` smokeで、outbox画像の一覧表示、非画像除外、画像data URL取り込みを確認。
- release auditで、簡素化UIがLocal Inbox import actionを露出していることを確認。
- Chrome headlessでimage-edit desktop、sprite-edit desktop、sprite-edit mobileを確認し、sprite-edit mobileに横あふれがないことを確認。
- `.github/workflows/ci.yml` でdoctor、typecheck、test、build、smoke、release auditを走らせるCI導線を追加。

## リリース候補資料

- `CHANGELOG.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `docs/release/v0.1.0-checklist.md`
- `docs/release/v0.1.0-runbook.md`
- `docs/release/v0.1.0-release-notes.md`
- `docs/usage/manual-handoff.md`
- `.github/workflows/ci.yml`

## QA証跡

- `docs/qa/guided-start-1440x1024.png`
- `docs/qa/image-edit-handoff-1440x1024.png`
- `docs/qa/sprite-edit-simple-1440x1024.png`
- `docs/qa/sprite-edit-mobile-390x844.png`
- `docs/qa/runner-preflight-1440x1024.png`
- `docs/qa/workflow-aware-image-generate-1440x1024.png`
- `docs/demo/mvp-demo.gif`
- `design-qa.md`

## Runner Preflight Addendum

- `GET /api/codex/runner` now reports whether the configured Codex command is ready, disabled for manual handoff, or unavailable before a job is created.
- The workflow summary shows the same preflight state so reviewers can tell whether the current machine can attempt `codex exec` or should use manual handoff.

## 既知の制約

- この環境ではCodex executableの直接起動が `spawn EPERM` になるため、自動画像生成の完走は未確認。
- repoは最初のリリース版までprivateのまま。main merge / public化はご主人確認後。
