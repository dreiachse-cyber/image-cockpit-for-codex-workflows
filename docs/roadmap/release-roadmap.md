# Image Cockpit 完成までのロードマップ

更新日: 2026-06-23

## いまの状態

このプロジェクトは、最初のレビュー可能なMVPを作っている段階です。

- repo: `dreiachse-cyber/image-cockpit-for-codex-workflows`
- visibility: private（最初の公開リリースまではprivate）
- active branch: `codex/mvp-local-cockpit`
- draft PR: https://github.com/dreiachse-cyber/image-cockpit-for-codex-workflows/pull/1
- product boundary: Codexがインストールされたローカル環境で動作し、アプリ自身はOpenAI APIを直接呼ばない

## 最優先の判断基準

v0.1.0までの最重要目標は、以下の4つを分かりやすく行えることです。

1. 画像生成
2. 画像編集
3. スプライトシート生成
4. スプライトシート編集

デザイン案やSprite Bench画面に見えている細かい機能は、この4つのワークフローを成立させるための補助です。variant比較、細かいQC、engine別export、adapter、背景除去などは、4大ワークフローの分かりやすさを損なってまで優先しません。

すでにできていること:

- Guided Startで、画像生成 / 画像編集 / スプライトシート生成 / スプライトシート編集を選んで開始できる
- 低優先の細かいUIは既定非表示にし、4大ワークフローの主操作が先に見えるシンプル画面へ戻している
- 日本語 / English の言語切り替えをグローバルヘッダーから選べる
- Local File / Codex Handoff / Local Inbox のprovider概念がある
- `codex-handoff/inbox/` にCodex向けJSON jobを書ける
- handoff jobにはworkflow種別、編集メモ、選択画像asset、注釈、grid / sprite contextを入れられる
- Codex job作成後は結果画像がoutboxへ戻るまでjob作成ボタンを待機状態にし、新しいoutbox画像を検知したら自動で取り込める
- `IMAGE_COCKPIT_CODEX_AUTORUN=1` のとき、local serverが `codex exec` を起動してhandoff job処理へ渡せる。実行不可環境では手動handoffへ戻る
- sprite-editではframe size、anchor、chroma key透明化、exportの最短導線を表示できる
- 画像のimport、history、annotation、grid split、timeline、QC、PNG / ZIP / GIF / metadata exportができる

## 完成の定義

最初の完成は「公開前のv0.1.0として、ご主人が通しで触って判断できる状態」です。

1. ローカルで迷わず起動できる
2. Guided Startから4大ワークフローへ目的別に入れる
3. 画像生成: Codex handoff jobを作り、Local Inboxから結果を取り込める
4. 画像編集: 画像を選び、注釈や編集メモをCodex handoffへ渡せる
5. スプライトシート生成: 画像を取り込み、grid splitでフレーム化できる
6. スプライトシート編集: フレーム順、action、anchor、透明化、exportを最低限調整できる
7. READMEとdemo手順を見れば、第三者もMVPの意図を理解できる
8. API key、token、権利不明素材、モデル重みを含まない
9. ご主人確認前にmain mergeやpublic化をしない

## フェーズ別ロードマップ

| フェーズ | 目的 | 完了条件 | ご主人の確認ポイント |
| --- | --- | --- | --- |
| Phase 0: MVP骨格 | 触れるコクピットを作る | 4大ワークフローの入口、local handoff、sprite exportが動く | 入口と目的が分かるか |
| Phase 1: Handoff一周 | 画像生成 / 画像編集をLocal Codex handoffで一周させる | inbox job作成、outbox結果取り込み、履歴反映まで通る | 「Codexに投げて戻す」感覚が自然か |
| Phase 2: スプライト一周 | スプライトシート生成 / 編集を一周させる | import、grid split、timeline編集、exportまで通る | ゲーム素材化の最短導線が分かるか |
| Phase 3: レビュー可能MVP | 初回レビューで迷わない状態にする | README、roadmap、demo capture plan、QA証跡、検証コマンドが揃う | 何を見ればよいか分かるか |
| Phase 4: v0.1.0候補 | privateのままrelease候補にする | 既知のP0/P1バグなし、スクショ/短いdemo、tag前確認 | public化してよい品質か |
| Phase 5: 初回公開 | OSSとして外に出す | repo public化、release note、license、basic contribution docs | どこまで打ち出すか |
| Phase 6: 拡張 | adapterと制作機能を育てる | ComfyUI/A1111等のadapter、IndexedDB、ゲームエンジンexport等 | どのユーザー層を優先するか |

## 直近の実装順

1. ご主人レビュー: `docs/review/mvp-review-report.md` の順番でprivate MVPを触って確認する
2. レビューで出たP0/P1/P2を直す
3. `codex exec` が実行できる環境で自動完走を確認する
4. public化 / main merge / tag作成の承認を得る

## ご主人がレビューするときの見方

1. `npm run dev:all` で起動する
2. Guided Startの4択が分かりやすいか見る
3. `Codex Handoff` でjobを作り、`codex-handoff/inbox/*.json` を確認する
4. `codex exec` が使える環境ではrunner status/logsを確認する。使えない環境では画像を `codex-handoff/outbox/` に置き、`Local Inbox` から取り込めるか見る
5. 取り込んだ画像をgrid splitして、PNG / ZIP / GIF / metadataを書き出す
6. ここまでで「初回MVPとして見せてよいか」を判断する

## まだやらないこと

最初のv0.1.0までは、以下は後回しにします。

- デザイン案に載っているが4大ワークフローに直結しない細かい操作
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
