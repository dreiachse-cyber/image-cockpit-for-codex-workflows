# X Launch Thread JA

## 1

Codex時代の画像制作パイプラインUIとして、Image Cockpit for Codex Workflows を公開しました。

AI画像生成UIそのものではなく、Codexで作った画像を確認、注釈、修正し、ゲーム素材化していくローカル制作コクピットです。

https://github.com/dreiachse-cyber/image-cockpit-for-codex-workflows

## 2

できることは大きく3つです。

- ピクセルアート生成
- 画像編集メモと矩形注釈
- 生成/アップロード画像からのアニメーション生成

アニメーション生成では、sprite sheet、GIF、WebP、animation packを書き出せます。

## 3

アプリ自体はOpenAI公式ではありません。

また、アプリ自身はOpenAI APIを直接呼ばず、APIキーも要求しません。ローカルにあるCodex handoff / `codex exec` workflowへジョブを渡し、返ってきた画像を取り込みます。

## 4

作った理由は、画像生成の「結果を見て終わり」ではなく、そのあとに人間が確認、修正指示、素材化まで進める場所が欲しかったからです。

特にゲーム制作では、ピクセルアート、方向別アニメーション、sprite sheet、exportがまとまっていると手が止まりにくくなります。

## 5

READMEには実際の画面スクリーンショットとdemo GIFを載せています。

Forkやローカル実験は歓迎です。Upstream PRは当面、プロダクト方向性を保護するためdisabledまたはlimitedにしています。

#Codex #個人開発 #ゲーム制作 #PixelArt
