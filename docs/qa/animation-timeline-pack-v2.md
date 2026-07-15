# Animation Timeline / Pack v2 QA

実施日: 2026-07-15
branch: `codex/animation-uplift-sequence`
対象: Phase 5 / metadata-only timeline editor、Animation Pack v2、engine handoff

## 結論

生成済みPNGを再生成せず、フレーム参照とゲーム用metadataだけを編集する`Animation Timeline Review / Edit`を追加した。通常の生成画面には詳細操作を並べず、結果の`Download`モーダルから専用編集モーダルを開く。

タイムラインはplay/pause、前後step、0.5x/1x/1.5x/2x、フレーム別duration、Hold、Duplicate、Reverse、Loop、One-shot、Ping-pongを扱う。DuplicateとReverseはPNGを複製せず`frameOrder`のsource frame参照を再利用する。duration変更とHoldも`frameDurations`だけを更新する。

## Pack v2契約

schemaは`image-cockpit.animation.v2`、`schemaVersion`は`2`とする。必須情報は次のとおり。

- `actionId`、`recipeId`、`recipeVersion`、`compilerVersion`
- `sourceFingerprint`、`directions`、物理`frames`、論理`frameOrder`、`frameDurations`
- `defaultFps`、`loopMode`
- `events`、`pivots`、`anchors`、`sockets`、`hitboxes`、`hurtboxes`、`trimRects`
- `qualitySummary`、`generationProfile`、`provenance`
- `grid`、`cell`、sheet/metadata/engine file references

`events`はstartup、active、impact、recovery、loop-pointをRecipe初期値として持ち、Recipe由来かUser編集かを`origin`で区別する。イベント移動、座標変更、追加したPivot/Anchor/Socket/Hitbox/HurtboxはUser由来へ更新する。座標は0〜1の正規化値で保持する。

## 編集と方向同期

共通`frameOrder`、`frameDurations`、`events`は全方向へ同期する。方向別に例外が必要な場合だけ`directionOverrides`へ明示し、UIは方向名とoverride対象をwarningとして表示する。3方向と5方向の両方をschema、pure logic、実画面で確認した。

Undo/Redoは最大50履歴を保持する。`Recipe defaults`は生成時のRecipe/FPS/loop設定へ戻し、保存前は`Unsaved`、保存後は`Saved`を表示する。Spaceでplay/pause、左右Arrowでstep、`[`/`]`でimpact markerを移動できる。first/last frameを並べるLoop seam previewも常時表示する。

## 後方互換

- Pack v1はimport時にPack v2へ移行し、duration未指定frameは既定12fpsから等間隔を生成する。
- v1の`ping-pong-reverse`はv2の`ping-pong`へ移行する。
- legacy action名がidle/walk/run/talk/loop/victoryならloop、それ以外はone-shotへ移行する。
- v2はserialize/import後にsemantic equalityを要求する。
- 未知schemaはschema名を含む明示errorでrejectする。
- v2を旧library表示へ渡す場合だけv1-compatible manifestを生成する。v1 export導線は既存の`Export Animation Pack`として残し、v2 exportは専用editorから明示する。

## Engine handoff

Pack v2 ZIPには`manifest.json`、`sheet.png`、`animation.json`と次の5ファイルを格納する。

| file | 内容 |
|---|---|
| `engine/generic.json` | atlas rect、方向別frame参照、duration、loop、event、全game metadata |
| `engine/godot-spriteframes.json` | Godot SpriteFrames相当のanimation/frame/duration情報 |
| `engine/phaser.json` | texture/frame name、animation config、duration、repeat、yoyo |
| `engine/aseprite.json` | frame duration、frame tag、slice/pivot相当情報 |
| `engine/unity-common.json` | 共通JSON/atlasのみ。Unity packageを生成しないことを明記 |

全engine出力が実在するsheet frame名を参照することを自動テストした。ZIP内file referenceはportableな`/`のみを許可し、Windows separator、absolute path、path traversalをrejectする。Unicode titleとtransparent frame flagもround-tripする。

## 実ブラウザ確認

URL: `http://127.0.0.1:5181/`

| trial | frames x directions | playback | 確認 |
|---:|---:|---|---|
| 1 | 12 x 3 | Ping-pong | duration 175ms、play/pause、Hold、Duplicateで13論理frame、Reverse、impact移動、Pivot/Anchor/Socket/Hitbox/Hurtbox、Pack v2一致 |
| 2 | 6 x 3 | One-shot | duration 210ms、one-shot切替、Pack v2一致 |
| 3 | 4 x 3 | Loop | 4 frame表示、play/pause、方向selectorとpreview一致 |

Trial 1ではduration変更前後のpreview画像数と全`src`参照が同一で、PNG再生成がないことを確認した。Duplicate後も物理`frames`は不変で、論理timelineだけ12から13へ増えた。Pack v2 ZIPをメモリ上で再importし、serialize結果が完全一致した。

全UI smokeでは生成済み5方向animationでも同じ操作を自動実行した。さらにChrome device metricsを390x844へ変更し、modalがviewport内へ収まり、document横overflowがなく、timeline stripだけが横scrollでき、save/export actionが残ることを確認した。1280x720へ戻した後も操作できた。

## 自動QA

- 4/6/8/12 frameでduration、Hold、Duplicate、Reverse、Ping-pongをmetadata-onlyで検証。
- Loop/One-shot、3/5 direction、direction override warningを検証。
- event、pivot、anchor、socket、hitbox、hurtbox、trim rectのserializeを検証。
- v1 migration、v2 exact round-trip、unknown schema rejectを検証。
- Generic/Godot/Phaser/Aseprite/Unity commonのframe referenceを検証。
- Unicode title、portable path、transparent frameを検証。
- unit tests 167件、TypeScript型検査を通過した。
- 全UI smokeは268.2秒で通過し、既存の生成、回復、queue、effect workflowも回帰なしだった。

最終checkpointではdoctor、production build、server smoke、release audit、`git diff --check`を追加確認する。
