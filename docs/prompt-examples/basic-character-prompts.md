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
blur, text, watermark, logo, cropped head, cropped hat, cropped feet, cut off body, edge touching, loose pixels near the feet, detached debris, extra limbs, duplicate character, scenery, detailed background, floor shadow, photorealistic, 3d render, vector art
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

### 13. Two-Head Chibi Knight

```text
Create one high-quality isolated full-body pixel-art character asset, not a sheet: a two-head-tall chibi knight with an oversized expressive head, tiny armored body, short limbs, round shield, stubby sword, bright determined expression, compact readable silhouette, centered idle-animation-ready stance, and clear feet contact. Keep the entire head, helmet, hands, shield, sword, and feet fully inside the image. Leave generous padding on all four sides, including at least 15% flat background space above the head and below the feet. Use crisp 32-bit fantasy RPG pixel-art rendering. Transparent background preferred; if transparency is unavailable, use a perfectly flat solid #FF00FF chroma-key background with no shadows, gradients, texture, floor plane, lighting variation, loose pixels near the feet, or debris.
```

### 14. Two-Head Chibi Mage

```text
Create one high-quality isolated full-body pixel-art character asset, not a sheet: a two-head-tall chibi mage with an oversized expressive head, tiny robed body, short limbs, wide starry hat, small wand held close, ribbon charm attached to the outfit, curious magical expression, compact readable silhouette, centered idle-animation-ready stance, and clear feet or robe hem contact. Keep the entire head, hat, hands, wand, robe hem, and feet fully inside the image. Leave generous padding on all four sides, including at least 15% flat background space above the hat and below the feet. Use crisp 32-bit fantasy RPG pixel-art rendering. Transparent background preferred; if transparency is unavailable, use a perfectly flat solid #FF00FF chroma-key background with no shadows, gradients, texture, floor plane, lighting variation, detached sparkles, loose pixels near the feet, or debris.
```

### 15. Two-Head Chibi Archer

```text
Create one high-quality isolated full-body pixel-art character asset, not a sheet: a two-head-tall chibi archer with an oversized expressive head, tiny ranger body, short limbs, compact bow held close to the body, tiny quiver, feathered cap, focused friendly expression, compact readable silhouette, centered idle-animation-ready stance, and clear feet contact. Keep the entire head, cap, hands, bow, quiver, and feet fully inside the image. Leave generous padding on all four sides, including at least 15% flat background space above the cap and below the feet. Use crisp 32-bit fantasy RPG pixel-art rendering. Transparent background preferred; if transparency is unavailable, use a perfectly flat solid #FF00FF chroma-key background with no shadows, gradients, texture, floor plane, lighting variation, loose arrows, loose pixels near the feet, or debris.
```

### 16. Two-Head Chibi Healer

```text
Create one high-quality isolated full-body pixel-art character asset, not a sheet: a two-head-tall chibi healer with an oversized expressive head, tiny white-and-gold robe body, short limbs, small bell staff held close, round medicine pouch, gentle reassuring smile, compact readable silhouette, centered idle-animation-ready stance, and clear feet or robe hem contact. Keep the entire head, hair, hands, staff, pouch, robe hem, and feet fully inside the image. Leave generous padding on all four sides, including at least 15% flat background space above the head and below the feet. Use crisp 32-bit fantasy RPG pixel-art rendering. Transparent background preferred; if transparency is unavailable, use a perfectly flat solid #FF00FF chroma-key background with no shadows, gradients, texture, floor plane, lighting variation, floating sparkles, loose pixels near the feet, or debris.
```

### 17. Two-Head Chibi Ninja

```text
Create one high-quality isolated full-body pixel-art character asset, not a sheet: a two-head-tall chibi ninja with an oversized expressive head, tiny dark shinobi outfit, short limbs, small scarf tails attached close to the body, tiny kunai held close, alert playful expression, compact readable silhouette, centered idle-animation-ready stance, and clear feet contact. Keep the entire head, mask, hands, scarf tails, kunai, and feet fully inside the image. Leave generous padding on all four sides, including at least 15% flat background space above the head and below the feet. Use crisp 32-bit fantasy RPG pixel-art rendering. Transparent background preferred; if transparency is unavailable, use a perfectly flat solid #FF00FF chroma-key background with no shadows, gradients, texture, floor plane, lighting variation, smoke clouds, detached scarf fragments, loose pixels near the feet, or debris.
```

### 18. Two-Head Chibi Alchemist

```text
Create one high-quality isolated full-body pixel-art character asset, not a sheet: a two-head-tall chibi alchemist with an oversized expressive head, tiny apron body, short limbs, round goggles, small potion satchel, one tiny glass flask held close to the body, excited inventor expression, compact readable silhouette, centered idle-animation-ready stance, and clear feet contact. Keep the entire head, goggles, hands, flask, satchel, apron, and feet fully inside the image. Leave generous padding on all four sides, including at least 15% flat background space above the goggles and below the feet. Use crisp 32-bit fantasy RPG pixel-art rendering. Transparent background preferred; if transparency is unavailable, use a perfectly flat solid #FF00FF chroma-key background with no shadows, gradients, texture, floor plane, lighting variation, bubbles, spilled liquid, loose pixels near the feet, or debris.
```

### 19. Two-Head Chibi Pirate

```text
Create one high-quality isolated full-body pixel-art character asset, not a sheet: a two-head-tall chibi pirate with an oversized expressive head, tiny coat body, short limbs, small tricorn hat, round belt buckle, tiny cutlass held close, confident mischievous grin, compact readable silhouette, centered idle-animation-ready stance, and clear boot contact. Keep the entire head, hat, hands, cutlass, coat tails, boots, and feet fully inside the image. Leave generous padding on all four sides, including at least 15% flat background space above the hat and below the feet. Use crisp 32-bit fantasy RPG pixel-art rendering. Transparent background preferred; if transparency is unavailable, use a perfectly flat solid #FF00FF chroma-key background with no shadows, gradients, texture, floor plane, lighting variation, coins, map pieces, loose pixels near the feet, or debris.
```

### 20. Two-Head Chibi Robot

```text
Create one high-quality isolated full-body pixel-art character asset, not a sheet: a two-head-tall chibi robot with an oversized round metal head, tiny mechanical body, short arms and legs, small antenna, glowing chest core, friendly square eyes, compact readable silhouette, centered idle-animation-ready stance, and clear robot feet contact. Keep the entire head, antenna, hands, chest core, legs, and feet fully inside the image. Leave generous padding on all four sides, including at least 15% flat background space above the antenna and below the feet. Use crisp 32-bit fantasy RPG pixel-art rendering. Transparent background preferred; if transparency is unavailable, use a perfectly flat solid #FF00FF chroma-key background with no shadows, gradients, texture, floor plane, lighting variation, sparks, detached bolts, loose pixels near the feet, or debris.
```

### 21. Two-Head Chibi Dragon Tamer

```text
Create one high-quality isolated full-body pixel-art character asset, not a sheet: a two-head-tall chibi dragon tamer with an oversized expressive head, tiny travel outfit, short limbs, small horned cap, little dragon-scale shoulder cape, training whistle charm attached to the outfit, brave cheerful expression, compact readable silhouette, centered idle-animation-ready stance, and clear boot contact. Keep the entire head, horned cap, hands, shoulder cape, whistle charm, boots, and feet fully inside the image. Leave generous padding on all four sides, including at least 15% flat background space above the cap and below the feet. Use crisp 32-bit fantasy RPG pixel-art rendering. Transparent background preferred; if transparency is unavailable, use a perfectly flat solid #FF00FF chroma-key background with no shadows, gradients, texture, floor plane, lighting variation, dragon companion, fire, smoke, loose pixels near the feet, or debris.
```
