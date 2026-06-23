# MVP Review Report

更新日: 2026-06-23

## 目的

このMVPは、Codexがインストールされたローカル環境で、画像生成 / 画像編集 / スプライトシート生成 / スプライトシート編集を一つの制作コクピットから扱えるかを確認するためのprivate pre-release版です。

アプリ自身はOpenAI APIを直接呼びません。Codex連携は `codex-handoff/` 配下のローカルファイル受け渡しと、実行可能な環境での `codex exec` 起動に限定しています。

## レビュー手順

1. `npm run dev:server` を起動する。
2. `npm run dev` を起動し、表示されたlocal URLを開く。
3. Guided Startで4つの入口を確認する。
4. `画像編集` を開き、prompt、編集メモ、注釈、選択画像がCodex handoff jobへ入ることを確認する。
5. `スプライトシート生成` でgrid splitからtimelineへ入る流れを確認する。
6. `スプライトシート編集` でframe size、anchor、chroma key透明化、exportを確認する。
7. `codex-handoff/inbox/`、`codex-handoff/assets/`、`codex-handoff/status/`、`codex-handoff/logs/` を確認する。
8. `codex exec` が実行できない環境では、画像を `codex-handoff/outbox/` に置いてLocal Inbox取り込みを確認する。

## 主要成果

- Guided Startから4大ワークフローへ入れる。
- UIは低優先の細かい機能を既定非表示にし、主要操作を先に見せる。
- Codex job作成後は、結果が戻るまで二重作成を防ぐ。
- handoff jobにworkflow種別、編集メモ、選択画像asset、注釈、grid、sprite contextが入る。
- local serverは `IMAGE_COCKPIT_CODEX_AUTORUN=1` のとき `codex exec` を起動する。
- runnerがdisabled / unavailable / failed / completedを記録し、UIのpendingを解除できる。
- sprite-editではframe size、anchor、chroma key透明化、PNG / ZIP / GIF / metadata exportを確認できる。

## 検証済み

```powershell
npm run typecheck
npm test
npm run build
```

追加smoke:

- `IMAGE_COCKPIT_CODEX_AUTORUN=0` でrunner state `disabled` を確認。
- 現在のWindows環境では `codex` 実行が `spawn EPERM` となり、runner state `unavailable` として記録されることを確認。
- `/api/codex/jobs` smokeで、job JSONに `workflowMode=image-edit`、編集メモ、`annotationCount=1`、`selectedImage.assetPath` が入ることを確認。
- Chrome headlessでimage-edit desktop、sprite-edit desktop、sprite-edit mobileを確認し、sprite-edit mobileに横あふれがないことを確認。

## QA証跡

- `docs/qa/guided-start-1440x1024.png`
- `docs/qa/image-edit-handoff-1440x1024.png`
- `docs/qa/sprite-edit-simple-1440x1024.png`
- `docs/qa/sprite-edit-mobile-390x844.png`
- `design-qa.md`

## 既知の制約

- この環境ではCodex executableの直接起動が `spawn EPERM` になるため、自動画像生成の完走は未確認。
- demo GIFは未収録。手順は `docs/demo/mvp-demo-capture.md` に残している。
- repoは最初のリリース版までprivateのまま。main merge / public化はご主人確認後。
