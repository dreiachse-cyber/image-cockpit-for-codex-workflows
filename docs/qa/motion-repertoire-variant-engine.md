# Motion Repertoire / Variant Engine QA

実施日: 2026-07-15
branch: `codex/animation-uplift-sequence`
対象: Phase 4 / topology、structured modifier、Experimental Recipe、可変フレーム数

## 結論

Motion Recipe Compilerを`1.1.0`へ更新し、既存16 Recipeを保ったままExperimental 6 Recipeを追加した。生成条件は自由文ではなく、Recipe、body topology、4/6/8/12 frame budget、9種類のstructured modifierから組み立て、prompt、Quality v2、履歴、direction manifest、preview、import/exportへ同じmetadataを渡す。

UIは22 Recipeを検索・絞り込み・最近使用・お気に入りで選べる。選択中Recipeが許可したmodifierだけを表示し、変更内容の自然文要約とprompt diffを生成前に確認できる。新規6 Recipeには`Experimental`を表示し、既存16 Recipeは`Verified`として区別する。

## Body topology契約

| ID | 表示 | anchor / root | 接地・支持QA | footline |
|---|---|---|---|---|
| `biped` | 二足 | 両足間のbottom-centerとpelvis | `footline` | 適用 |
| `quadruped` | 四足 | paw/hoof support polygon中心 | `paw-contact` | 非適用 |
| `serpentine-or-body-contact` | 蛇行 / 胴体接地 | body-contact arc中心 | `body-contact` | 非適用 |
| `floating` | 浮遊 | hover centerとsource baselineからの高度 | `hover-height` | 非適用 |
| `winged-flying` | 有翼飛行 | chest/body mass center | `wing-beat` | 非適用 |
| `multi-leg` | 多脚 | active support polygon中心 | `multi-contact` | 非適用 |

各profileは、ground contact parts、anchor policy、bounding-box expectation、root-motion policy、secondary motion、方向別silhouette注意事項を保持する。Compilerは選択topologyのidentity/contact指示をpromptへ追加し、Quality v2はhumanoid footlineを全キャラクターへ強制せず、topology固有dimensionを記録する。

## Structured modifier

| key | 値 |
|---|---|
| `intensity` | `subtle` / `normal` / `strong` |
| `tempo` | `slow` / `normal` / `fast` |
| `weight` | `light` / `normal` / `heavy` |
| `exaggeration` | `low` / `normal` / `high` |
| `handedness` | `inherit` / `left` / `right` / `ambidextrous` |
| `weaponClass` | `none` / `unarmed` / `sword` / `heavy-weapon` / `polearm` / `bow` / `firearm` / `staff` / `shield` |
| `travelAmount` | `in-place` / `short` / `medium` / `long` |
| `secondaryMotionLevel` | `low` / `normal` / `high` |
| `vfxAmount` | `none` / `low` / `normal` / `high` |

Recipeごとに`allowedModifiers`を持つ。Compilerは既定値との差分だけを決定論的なpromptへ追加し、適用modifierと除外modifierをdiagnosticsへ残す。handednessにはheld weaponを要求し、非bipedとweapon class、loop Recipeとlong travel、VFX allowlistのないRecipeとVFX指定などの不正組合せは生成前validationで止める。

## Experimental Recipe

| Recipe | topology | 目的 |
|---|---|---|
| `dash` | 全6種 | 圧縮、発進、移動、制動、再接地を一度きりのburstとして描く |
| `dodge-roll` | biped / quadruped / body-contact / floating / multi-leg | topologyに合うroll、backstep、coil、hop、hover-shiftを選ぶ |
| `charge-heavy-attack` | biped / quadruped / multi-leg | 溜め、重い一撃、follow-through、復帰をprop identity付きで描く |
| `combo-attack` | biped / quadruped / multi-leg | 2〜3打、link、finisher、復帰をhandedness固定で描く |
| `stun` | 全6種 | topology固有の支持喪失、unstable hold、部分回復を描く |
| `get-up` | biped / quadruped / body-contact / multi-leg | downed poseから支持を戻しreadyへ復帰する |

## Frame budget契約

| frames / direction | raw direction grid | 3方向final sheet |
|---:|---|---|
| 4 | `4x1` | `4x3` |
| 6 | `3x2` | `6x3` |
| 8 | `4x2` | `8x3` |
| 12 | `4x3` | `12x3` |

frame phaseはRecipeの8-phase原本から選択budgetへ再配分し、同一セルに重なるphaseは順序を保って結合する。フレーム数はprompt、runner request、raw file検証、normalization、preview/timeline、history、manifest、animation pack import/export、downloadまで一貫して保持する。旧metadataがフレーム数を持たない場合だけ8-frame既定値を利用する。

## UI確認

- 22/22 Recipe、`Experimental` 6件、`Verified` 16件を表示した。
- topology、loop、weapon、movement、frame budgetで絞り込みできた。
- search、最近使用、お気に入りを組み合わせてRecipeを再発見できた。
- weapon対応Recipeだけ`handedness` / `weaponClass`を表示し、それ以外のmodifierもRecipe allowlistに従った。
- modifier変更直後に自然文summaryとprompt diffが更新された。
- 4/6/8/12を切り替えるとraw/final grid、phase表示、prompt内の寸法が同期した。
- quadrupedは`paw-contact`、floatingは`hover-height`を表示し、humanoid footlineを要求しなかった。
- 3 runner枠使用中の追加trialは`キューに追加`として保存され、空き枠へ自動昇格した。

## 実ブラウザ生成trial

URL: `http://127.0.0.1:5181/`
API: `http://127.0.0.1:8794/`
profile: Fast / 1 candidate / front・side・back

| # | motion | topology | frames | modifier contrast | tournament | 記録時状態 |
|---:|---|---|---:|---|---|---|
| 1 | Dash | biped | 4 | fast / light / low / short / secondary low | `anim-tournament_dwwhfz_mrl9v03i` | accepted / 3400 / warning 0 |
| 2 | Dash | biped | 12 | strong / slow / heavy / high / long / secondary high / VFX low | `anim-tournament_4e5quh_mrl9vtc2` | accepted / 3175 / warning 9 |
| 3 | Dodge Roll / Backstep | biped | 6 | fast / light / short | `anim-tournament_ha2wka_mrl9xfnb` | accepted / 3325 / warning 3 |
| 4 | Charge / Heavy Attack | biped | 12 | strong / slow / heavy / right sword / VFX low | `anim-tournament_4weti4_mrl9zc8n` | accepted / 3325 / warning 3 |
| 5 | Combo Attack | biped | 8 | strong / fast / right sword / secondary high / VFX low | `anim-tournament_x2fys9_mrla0oku` | failed/quarantined / 3300 / warning 4 |
| 6 | Stun | quadruped | 8 | strong / heavy / high / in-place / VFX low | `anim-tournament_llxn7w_mrla7gqq` | accepted / 3175 / warning 9 |
| 7 | Get Up | quadruped | 12 | slow / heavy / in-place / secondary high | `anim-tournament_ru01jl_mrla8zb4` | accepted / 3225 / warning 7 |
| 8 | Stun | floating | 6 | subtle / slow / light / low / hover / VFX low | `anim-tournament_aoftqu_mrlaaob2` | accepted / 1750 / warning 66 |

8 trialすべてのfront・side・back成果物を目視した。4-frame Dashは少数フレームでもcompression、travel、replantが読め、12-frame Dashは長いtravel、空中silhouette、brake VFX、settleを増やしてmodifier contrastが明確だった。Dodge Roll / Backstepは完全なsomersaultより安全なlean/backstepとして読めた。Heavy Attackは深い溜め、ground impact、broad follow-through、ready復帰をright swordとshield identityを保って描いた。Comboは2段以上のslash arcとfinisher、復帰が明確だったが、成果物生成後の`Failed to fetch`でclient quality gateがquarantinedになったため、目視良好でもwinnerへ昇格させずfailedのまま保持した。

quadruped Stunは三つ首と四足支持を維持し、表情、paw brace、小さなstun accentで状態変化が読めた。quadruped Get Upはdowned、前足支持、腰上げ、四足readyまでを12 frameでつないだ。floating Stunは足線を作らずhover gap、wisps、表情・傾きでsubtleな制御喪失を描いた。floating trialのwarning 66はroot/normalization補正へのshadow metric反応で、目視ではhover identityが保たれている。この差はPhase 1のshadow-only方針どおり記録し、自動でhard blockへ昇格させていない。最終結果と全trialの目視メモは`motion-repertoire-review-index.json`を正本とする。

実trialのwinner公開で可変フレーム数引数の欠落と、accepted後の遅延Quality通知がcandidate状態を戻す競合を発見した。前者は公開関数へ`framesPerDirection`を正しく渡し、後者はwinner/cancelledの終端状態をDirection Repair以外の遅延通知から保護した。さらに、failed後にverified評価が遅れて到着した場合はtournamentをrunningへ戻せるようにし、server smokeへ両ケースを追加した。

実生成成果物はgit管理対象外の`codex-handoff/outbox/.tournaments/`へ保存し、公式sample assetは置き換えない。

## 自動QA

- 全22 Recipeのschema validation、既存16 IDの順序互換、Experimental 6件のsnapshot。
- 6 topologyのcontact/anchor/footline契約と、不正topology組合せのvalidation。
- 9 modifierのprompt差分、allowed modifier、handedness/weapon、VFX、loop travelのvalidation。
- 4/6/8/12 budgetのphase、raw direction grid、3方向final grid、preview slicing。
- animation packで全4 budgetとRecipe/topology/modifier metadataをround-trip。
- unit tests 148件、server型検査、production build、server smoke、UI smoke（283.4秒）、doctor、release auditを通過した。

`git diff --check`を含む最終checkpoint後にcommit/pushし、Phase 5へ進む。
