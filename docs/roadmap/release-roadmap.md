# Image Cockpit 完成までのロードマップ

更新日: 2026-06-26

## Readable Update: Prompt Examples

- Move Prompt Examples out of the global header/start route and place the button directly below the Pixel Art Prompt field.
- Keep the modal focused on two actions: copy a tuned pixel-art prompt, or load it directly into Pixel Art Generation.
- Treat Prompt Examples as support for the primary quality question: whether complex pixel-art prompts can reliably return useful generated images through local Codex imagegen.

## Readable Update: Animation Generation

- Keep the workspace centered on three tabs: Pixel Art Generation, Image Editing, and Animation Generation.
- Make Animation Generation a source-first flow: choose or upload pixel art, choose a validated motion preset, generate direction frames, then download animated GIF, animated WebP, sprite sheet, frame ZIP, or animation pack.
- Keep advanced sprite tuning secondary until the core generation and editing loops are comfortable.

## いまの状態

このプロジェクトは、v0.1.0初回公開後に、ピクセルアート生成、画像編集、アニメーション生成の3導線へプロダクト軸を絞っている段階です。

- repo: `dreiachse-cyber/image-cockpit-for-codex-workflows`
- visibility: public
- active branch: `codex/real-generation-workflows`
- product boundary: Codexがインストールされたローカル環境で動作し、アプリ自身はOpenAI APIを直接呼ばない

## 最優先の判断基準

現在の最重要目標は、以下の3つを分かりやすく行えることです。

1. ピクセルアートの生成
2. 生成済みまたは取り込んだ画像への矩形コメント付き画像編集
3. 生成またはアップロードしたピクセルアートからのアニメーション生成

スプライトシートはアニメーション生成の過程で作られる成果物として扱います。variant比較、細かいQC、engine別export、adapter、背景除去などは、この3つの導線の分かりやすさを損なってまで優先しません。

すでにできていること:

- ワークフロー欄で、Pixel Art Generation / Image Editing / Animation Generation の3タブを直接切り替えられる
- ピクセルアート生成では、`Codex Handoff` から `codex exec` -> `imagegen` skill / built-in `image_gen` を使い、複雑promptから実画像PNGをoutboxへ返せることを確認済み
- 内蔵ローカル生成器は、開発・fallback・smoke用の決定的PNG生成として残している
- アニメーション生成では、アップロードまたは選択済みのピクセルアートを必須sourceとして、8フレームのanimation sheetを生成しtimeline frameへ即時分割できる
- 低優先の細かいUIは既定非表示にし、3つの主操作が先に見えるシンプル画面へ戻している
- 画像編集では、矩形選択、番号付き注釈、コメント付きCodex handoffを扱える
- 日本語 / English の言語切り替えをグローバルヘッダーから選べ、主要操作ラベルが選択言語に追従する
- Local File / Codex Handoff / Local Inbox のprovider概念がある
- `codex-handoff/inbox/` にCodex向けJSON jobを書ける
- handoff jobにはworkflow種別、編集メモ、選択画像asset、注釈、grid / sprite contextを入れられる
- 既存のCodex handoff payloadは後方互換として残しつつ、初期導線はピクセルアート生成とアニメーション生成へ絞っている
- Codex job作成後は結果画像がoutboxへ戻るまでjob作成ボタンを待機状態にし、新しいoutbox画像を検知したら自動で取り込める
- 簡素化UIでも `Import Latest` が見えるため、手動handoff後にLocal Inboxから返却画像を取り込める
- `IMAGE_COCKPIT_CODEX_AUTORUN=1` のとき、local serverが `codex exec` を起動してhandoff job処理へ渡せる。実行不可環境では手動handoffへ戻る
- 旧sprite-edit系のframe size、anchor、grid split、timeline、QC、metadata exportは後方互換として残しつつ、初期導線からは外している
- 画像のimport、history、annotation、direction GIF preview、PNG / ZIP / GIF / WebP / animation pack exportができる
- public化前の最低限の `CONTRIBUTING.md` / `SECURITY.md` / `CODE_OF_CONDUCT.md` を用意している
- `docs/release/v0.1.0-runbook.md` でレビュー、検証、main merge、public化、tag作成の承認ゲートを整理している
- `docs/release/v0.1.0-release-notes.md` で初回公開用release noteの叩き台を用意している
- `docs/release/v0.1.0-owner-review.md` で、ご主人レビュー時の最短確認手順を整理している
- `docs/release/v0.1.0-final-audit.md` で、完成定義とユーザー明示要件に対する証跡を整理している
- `docs/release/v0.1.0-acceptance-evidence.md` でv0.1.0時点のworkflow、local-first境界、manual handoff、公開前gateの証跡を一覧化している
- `docs/release/v0.1.0-owner-decision.md` で、v0.1.0公開前レビューで確認済みの項目と承認履歴を分けている
- `npm run doctor` でローカルhandoff folderとCodex command availabilityを診断できる
- Windowsでは `%LOCALAPPDATA%\OpenAI\Codex\bin\...\codex.exe` のterminal-runnable Codex CLIを自動発見し、WindowsApps desktop shimのsubprocess制限を避けられる
- `npm run verify` でdoctor / typecheck / test / build / smoke / release auditを一括実行できる
- `npm run smoke` でmanual handoff、imagegen handoff指示、mock autorun runnerの `ready -> running -> completed -> outbox PNG import` を確認できる
- `npm run ui:smoke` で3つのworkspace tab、`ピクセルアート生成 -> Codex Handoff job作成`、`画像編集 -> Codex Handoff job作成`、`アニメーション生成 -> local animation生成`、言語切替をheadless browserで確認できる
- `npm run codex:smoke` で実Codex CLIのno-image handoff完走を再実行できる
- `npm run imagegen:smoke` で実Codex CLIのprompt-only imagegen画像生成を任意再実行できる
- `npm run review:local` でrelease verification、browser workflow smoke、実Codex runner smokeをまとめて確認できる
- 実Codex CLIでもno-image runner smokeが完走し、outboxへMarkdown sidecarを書けることを確認済み
- `docs/usage/manual-handoff.md` で `codex exec` が使えない環境の手動受け渡し手順を確認できる
- `docs/qa/manual-handoff-import-latest-1280x720.png` で、runner unavailable後もoutbox返却画像を `Import Latest` から取り込めることを確認している
- `.github/workflows/ci.yml` で `main` と `codex/**` branch上の `npm run verify` を確認できる

## 完成の定義

最初の完成は「公開済みv0.1.0として、ご主人と第三者が通しで触って意図を理解できる状態」です。

1. ローカルで迷わず起動できる
2. ワークフロー欄から3つの中核ワークフローへ目的別に入れる
3. ピクセルアート生成: promptからCodex imagegen経由でPNGを生成し、outbox / Import Latest / historyへ戻せる
4. 画像編集: 矩形選択とコメントをCodex handoffへ渡し、before / afterを確認できる
5. アニメーション生成: ピクセルアートsourceを必須にし、direction frames、GIF preview、sprite sheetを生成できる
6. スプライトシート: アニメーション生成の過程で生成され、PNG / ZIP / GIF / WebP / animation packを書き出せる
7. READMEとdemo手順を見れば、第三者もMVPの意図を理解できる
8. API key、token、権利不明素材、モデル重みを含まない
9. public後のREADME / docs / GitHub設定が、実際のプロダクト境界と一致している

## フェーズ別ロードマップ

| フェーズ | 目的 | 完了条件 | ご主人の確認ポイント |
| --- | --- | --- | --- |
| Phase 0: MVP骨格 | 触れるコクピットを作る | local handoff、history、preview / downloadが動く | 入口と目的が分かるか |
| Phase 1: ピクセルアート生成 | promptからピクセルアートを作る | Codex imagegen経由のPNG生成、outbox返却、history反映、確認が通る | 生成結果が素材として使えそうか |
| Phase 2: アニメーション生成 | ピクセルアートsourceから動きを作る | upload/source必須、animation sheet、timeline frames、exportまで通る | ゲーム素材化の最短導線が分かるか |
| Phase 3: 画像編集 | コメント付き編集を実用化する | 矩形選択、番号、コメント、before / after確認が通る | 修正指示が自然に書けるか |
| Phase 4: レビュー可能MVP | 初回レビューで迷わない状態にする | README、roadmap、demo capture plan、QA証跡、検証コマンドが揃う | 何を見ればよいか分かるか |
| Phase 5: 初回公開 | OSSとして外に出す | release note、license、basic contribution/security/conduct docs、GitHub topics/social previewが揃う | どこまで打ち出すか |
| Phase 6: 拡張 | adapterと制作機能を育てる | ComfyUI/A1111等のadapter、IndexedDB、ゲームエンジンexport等 | どのユーザー層を優先するか |

## 直近の実装順

1. ピクセルアート生成、画像編集、アニメーション生成をCodex handoff中心の3タブ導線として、UIとsmokeで確認する
2. ご主人が生成結果の質感と導線を触って確認する
3. 次に外部AI画像モデルadapter、またはアニメーションpreset追加の方針を決める
4. 選択されたCodex launch commandで、実際の `codex exec` no-image job自動完走とprompt-only imagegen画像生成は確認済み。画像編集/annotation編集/sprite sheet整合は継続QAで確認する

## ご主人がレビューするときの見方

1. `npm run dev:all` で起動する
2. Codexが入ったレビュー機では `npm run review:local` を通す
3. ワークフロー欄の3タブが分かりやすいか見る
4. `ピクセルアートの生成` で `Codex Handoff` routeになり、複雑promptからoutboxへPNGが返るか見る
5. `Import Latest` または自動取り込みで生成PNGがhistoryへ追加されるか見る
6. `画像編集` で矩形選択、番号、コメント、before / after確認が自然に使えるか見る
7. `アニメーションの生成` でピクセルアートsource必須になっており、生成後にdirection GIF previewとsprite sheetができるか見る
8. 必要に応じて `codex-handoff/inbox/*.json` とrunner status/logsを確認する
9. PNG / ZIP / GIF / WebP / animation packを書き出す

## まだやらないこと

最初のv0.1.0までは、以下は後回しにします。

- デザイン案に載っているが3つの中核ワークフローに直結しない細かい操作
- OpenAI APIへの直接接続
- ComfyUI / AUTOMATIC1111 / Replicate adapter
- AI背景除去
- Godot / Unity / Phaser専用export
- IndexedDB本格永続化
- 高度機能や周辺文言まで含む完全な多言語化
- 画像生成モデルや重みの同梱

## 判断ゲート

- Gate A: MVPレビュー
  - ご主人がローカルで触って、方向性と基本導線を確認する
- Gate B: v0.1.0公開品質
  - 既知の重大バグを潰し、README、demo、GitHub表示を整える
- Gate C: 公開後の継続改善
  - 生成品質、preset、編集体験、ドキュメントを実利用に合わせて育てる
