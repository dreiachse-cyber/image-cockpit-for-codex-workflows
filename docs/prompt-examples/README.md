# Pixel-Art Prompt Examples

Image Cockpitのピクセルアート生成で使うprompt例の参照置き場です。
UIに組み込む前の候補や、手元で試験生成するときのコピー元として使います。

## Prompt Lists

- [Basic Character Prompts](./basic-character-prompts.md)
- [Profession Character Prompts](./profession-character-prompts.md)
- [Monster Prompts](./monster-prompts.md)

## Shared Direction

- 1枚につき1キャラクターまたは1モンスターのみ生成する。
- 頭、髪、手、小物、武器、足先まで全身を画像内に収める。
- アニメーション生成の元画像に使いやすいよう、中央配置とidle-ready poseを基本にする。
- 背景は透明を優先し、不可なら完全な単色クロマキー背景を使う。
- 緑系の服・肌・葉・草・体色がある場合は、クロマキー背景を `#ff00ff` に逃がす。
- 読める文字、ロゴ、ウォーターマーク、背景 scenery は入れない。
