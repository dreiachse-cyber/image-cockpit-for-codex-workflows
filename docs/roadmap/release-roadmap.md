# Image Cockpit 完成までのロードマップ

更新日: 2026-06-23

## いまの状態

このプロジェクトは、最初のレビュー可能なMVPを作っている段階です。

- repo: `dreiachse-cyber/image-cockpit-for-codex-workflows`
- visibility: private（最初の公開リリースまではprivate）
- active branch: `codex/mvp-local-cockpit`
- draft PR: https://github.com/dreiachse-cyber/image-cockpit-for-codex-workflows/pull/1
- product boundary: Codexがインストールされたローカル環境で動作し、アプリ自身はOpenAI APIを直接呼ばない

すでにできていること:

- Guided Startで、画像生成 / 画像編集 / スプライトシート生成 / スプライトシート編集を選んで開始できる
- 日本語 / English の言語切り替えをグローバルヘッダーから選べる
- Local File / Codex Handoff / Local Inbox のprovider概念がある
- `codex-handoff/inbox/` にCodex向けJSON jobを書ける
- 画像のimport、history、annotation、grid split、timeline、QC、PNG / ZIP / GIF / metadata exportができる

## 完成の定義

最初の完成は「公開前のv0.1.0として、ご主人が通しで触って判断できる状態」です。

1. ローカルで迷わず起動できる
2. Guided Startから目的別に入れる
3. Codex handoff jobを作れる
4. Codex / ユーザーがoutboxへ置いた結果をLocal Inboxから取り込める
5. 取り込んだ画像を注釈、分割、QC、exportできる
6. READMEとdemo手順を見れば、第三者もMVPの意図を理解できる
7. API key、token、権利不明素材、モデル重みを含まない
8. ご主人確認前にmain mergeやpublic化をしない

## フェーズ別ロードマップ

| フェーズ | 目的 | 完了条件 | ご主人の確認ポイント |
| --- | --- | --- | --- |
| Phase 0: MVP骨格 | 触れるコクピットを作る | UI、local handoff、sprite exportが動く | 画面の方向性が合っているか |
| Phase 1: Handoff一周 | Codexとのローカル受け渡しを一周させる | inbox job作成、outbox結果取り込み、exportまで通る | 「Codexに投げて戻す」感覚が自然か |
| Phase 2: レビュー可能MVP | 初回レビューで迷わない状態にする | README、roadmap、demo capture plan、QA証跡、検証コマンドが揃う | 何を見ればよいか分かるか |
| Phase 3: v0.1.0候補 | privateのままrelease候補にする | 既知のP0/P1バグなし、スクショ/短いdemo、tag前確認 | public化してよい品質か |
| Phase 4: 初回公開 | OSSとして外に出す | repo public化、release note、license、basic contribution docs | どこまで打ち出すか |
| Phase 5: 拡張 | adapterと制作機能を育てる | ComfyUI/A1111等のadapter、IndexedDB、ゲームエンジンexport等 | どのユーザー層を優先するか |

## 直近の実装順

1. Local Inboxから `codex-handoff/outbox/` の画像を取り込めるようにする
2. READMEからロードマップへ移動できるようにする
3. demo capture planを、Guided Startからoutbox取り込みまでの流れに更新する
4. Browser QAで日本語 / Englishのヘッダー、Guided Start、Local Inbox取り込みを確認する
5. ご主人レビュー用に「見る順番」をfinal reportへ短くまとめる

## ご主人がレビューするときの見方

1. `npm run dev:server` と `npm run dev` で起動する
2. Guided Startの4択が分かりやすいか見る
3. `Codex Handoff` でjobを作り、`codex-handoff/inbox/*.json` を確認する
4. 画像を `codex-handoff/outbox/` に置き、`Local Inbox` から取り込めるか見る
5. 取り込んだ画像をgrid splitして、PNG / ZIP / GIF / metadataを書き出す
6. ここまでで「初回MVPとして見せてよいか」を判断する

## まだやらないこと

最初のv0.1.0までは、以下は後回しにします。

- OpenAI APIへの直接接続
- ComfyUI / AUTOMATIC1111 / Replicate adapter
- AI背景除去
- Godot / Unity / Phaser専用export
- IndexedDB本格永続化
- 完全な多言語化
- 画像生成モデルや重みの同梱

## 判断ゲート

- Gate A: MVPレビュー
  - ご主人がローカルで触って、方向性と基本導線を確認する
- Gate B: v0.1.0候補
  - 既知の重大バグを潰し、READMEとdemoを整える
- Gate C: public化
  - repo visibilityをpublicへ変更し、初回release noteを出す

