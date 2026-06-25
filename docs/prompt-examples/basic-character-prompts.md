# Basic Character Pixel-Art Prompt Examples

作成日: 2026-06-26

このファイルは、ピクセルアート生成の「基本キャラクター」向けprompt例をまとめた参照用メモです。
UIへ組み込む前の候補として、まずは全身・中央配置・背景なし・アニメーション素材化しやすい条件を揃えています。

## 共通方針

- 1枚につき1キャラクターのみ生成する。
- 頭、髪、手、小物、足先まで全身を画像内に収める。
- アニメーション生成の元画像に使いやすいよう、正面寄りのidle-ready poseにする。
- 背景は透明を優先し、不可なら完全な単色クロマキー背景を使う。
- 緑系衣装のキャラクターは、背景クロマキーを `#ff00ff` に逃がす。

## Common Negative Prompt

```text
blur, text, watermark, logo, cropped head, cropped feet, cut off body, extra limbs, duplicate character, scenery, detailed background, floor shadow, photorealistic, 3d render, vector art
```

## Basic Character Prompts

### 01. Boy Adventurer

```text
Create a single full-body pixel-art character asset: a cheerful young boy adventurer with a small backpack, short cloak, leather boots, simple sword at his side, friendly brave expression, centered idle-animation-ready stance, clear feet contact, readable silhouette, transparent background preferred, crisp 32-bit fantasy RPG pixel-art rendering, no scenery, no readable text, no logo, no watermark. Keep the entire head, hair, hands, props, and feet fully inside the image with comfortable transparent padding around the character. If transparency is unavailable, use a perfectly flat solid #00ff00 chroma-key background with no shadows, gradients, texture, floor plane, or lighting variation.
```

### 02. Girl Adventurer

```text
Create a single full-body pixel-art character asset: a cheerful young girl adventurer with a small satchel, short travel cape, leather boots, tiny dagger, bright curious expression, centered idle-animation-ready stance, clear feet contact, readable silhouette, transparent background preferred, crisp 32-bit fantasy RPG pixel-art rendering, no scenery, no readable text, no logo, no watermark. Keep the entire head, hair, hands, props, and feet fully inside the image with comfortable transparent padding around the character. If transparency is unavailable, use a perfectly flat solid #00ff00 chroma-key background with no shadows, gradients, texture, floor plane, or lighting variation.
```

### 03. Young Male Hero

```text
Create a single full-body pixel-art character asset: a young male fantasy hero with light armor, blue scarf, simple longsword, confident relaxed pose, clean heroic silhouette, centered idle-animation-ready stance, clear feet contact, transparent background preferred, crisp 32-bit RPG pixel-art rendering, no scenery, no readable text, no logo, no watermark. Keep the entire head, hair, hands, weapon, and feet fully inside the image with comfortable transparent padding around the character. If transparency is unavailable, use a perfectly flat solid #00ff00 chroma-key background with no shadows, gradients, texture, floor plane, or lighting variation.
```

### 04. Young Female Hero

```text
Create a single full-body pixel-art character asset: a young female fantasy hero with light armor, red scarf, compact sword, confident relaxed pose, clean heroic silhouette, centered idle-animation-ready stance, clear feet contact, transparent background preferred, crisp 32-bit RPG pixel-art rendering, no scenery, no readable text, no logo, no watermark. Keep the entire head, hair, hands, weapon, and feet fully inside the image with comfortable transparent padding around the character. If transparency is unavailable, use a perfectly flat solid #00ff00 chroma-key background with no shadows, gradients, texture, floor plane, or lighting variation.
```

### 05. Middle-Aged Male Mercenary

```text
Create a single full-body pixel-art character asset: a middle-aged male mercenary with rugged leather armor, travel-worn cloak, stubble, heavy belt pouches, one hand resting near a sword, calm experienced expression, centered idle-animation-ready stance, clear feet contact, transparent background preferred, crisp 32-bit fantasy RPG pixel-art rendering, no scenery, no readable text, no logo, no watermark. Keep the entire head, hair, hands, sword, pouches, and feet fully inside the image with comfortable transparent padding around the character. If transparency is unavailable, use a perfectly flat solid #00ff00 chroma-key background with no shadows, gradients, texture, floor plane, or lighting variation.
```

### 06. Middle-Aged Female Ranger

```text
Create a single full-body pixel-art character asset: a middle-aged female ranger with practical leather armor, short green-brown cloak, bow and quiver, composed experienced expression, centered idle-animation-ready stance, clear feet contact, readable silhouette, transparent background preferred, crisp 32-bit fantasy RPG pixel-art rendering, no scenery, no readable text, no logo, no watermark. Keep the entire head, hair, hands, bow, quiver, cloak, and feet fully inside the image with comfortable transparent padding around the character. If transparency is unavailable, use a perfectly flat solid #ff00ff chroma-key background because the character uses green clothing; no shadows, gradients, texture, floor plane, or lighting variation.
```

### 07. Elder Male Sage

```text
Create a single full-body pixel-art character asset: an elderly male sage with long white beard, layered robe, wooden staff, small charm ornaments, gentle wise expression, compact readable silhouette, centered idle-animation-ready stance, clear feet contact, transparent background preferred, crisp 32-bit fantasy RPG pixel-art rendering, no scenery, no readable text, no logo, no watermark. Keep the entire head, beard, hands, staff, robe hem, and feet fully inside the image with comfortable transparent padding around the character. If transparency is unavailable, use a perfectly flat solid #00ff00 chroma-key background with no shadows, gradients, texture, floor plane, or lighting variation.
```

### 08. Elder Female Herbalist

```text
Create a single full-body pixel-art character asset: an elderly female herbalist with gray hair, warm shawl, herb pouch, small basket, wooden cane, kind wise expression, compact readable silhouette, centered idle-animation-ready stance, clear feet contact, transparent background preferred, crisp 32-bit fantasy RPG pixel-art rendering, no scenery, no readable text, no logo, no watermark. Keep the entire head, hair, hands, basket, cane, shawl, and feet fully inside the image with comfortable transparent padding around the character. If transparency is unavailable, use a perfectly flat solid #00ff00 chroma-key background with no shadows, gradients, texture, floor plane, or lighting variation.
```

### 09. Androgynous Traveler

```text
Create a single full-body pixel-art character asset: an androgynous fantasy traveler with layered neutral clothing, hood lowered, small backpack, map case, calm observant expression, balanced slim silhouette, centered idle-animation-ready stance, clear feet contact, transparent background preferred, crisp 32-bit RPG pixel-art rendering, no scenery, no readable text, no logo, no watermark. Keep the entire head, hair, hands, backpack, map case, and feet fully inside the image with comfortable transparent padding around the character. If transparency is unavailable, use a perfectly flat solid #00ff00 chroma-key background with no shadows, gradients, texture, floor plane, or lighting variation.
```

### 10. Small Village Child

```text
Create a single full-body pixel-art character asset: a small village child NPC with simple tunic, short boots, tiny shoulder bag, innocent curious expression, non-combat pose, compact readable silhouette, centered idle-animation-ready stance, clear feet contact, transparent background preferred, crisp 32-bit fantasy RPG pixel-art rendering, no scenery, no readable text, no logo, no watermark. Keep the entire head, hair, hands, shoulder bag, and feet fully inside the image with comfortable transparent padding around the character. If transparency is unavailable, use a perfectly flat solid #00ff00 chroma-key background with no shadows, gradients, texture, floor plane, or lighting variation.
```

### 11. Large Veteran Warrior

```text
Create a single full-body pixel-art character asset: a large veteran warrior with broad shoulders, worn armor plates, heavy gloves, thick boots, short cape, stern protective expression, strong readable silhouette, centered idle-animation-ready stance, clear feet contact, transparent background preferred, crisp 32-bit fantasy RPG pixel-art rendering, no scenery, no readable text, no logo, no watermark. Keep the entire head, armor, hands, cape, boots, and feet fully inside the image with comfortable transparent padding around the character. If transparency is unavailable, use a perfectly flat solid #00ff00 chroma-key background with no shadows, gradients, texture, floor plane, or lighting variation.
```

### 12. Hooded Mysterious Figure

```text
Create a single full-body pixel-art character asset: a hooded mysterious figure with dark layered cloak, subtle glowing charm, hidden face with visible lower jaw only, slim readable silhouette, quiet neutral pose, centered idle-animation-ready stance, clear feet contact, transparent background preferred, crisp 32-bit fantasy RPG pixel-art rendering, no scenery, no readable text, no logo, no watermark. Keep the entire hood, cloak edges, hands, charm, robe hem, and feet fully inside the image with comfortable transparent padding around the character. If transparency is unavailable, use a perfectly flat solid #00ff00 chroma-key background with no shadows, gradients, texture, floor plane, or lighting variation.
```
