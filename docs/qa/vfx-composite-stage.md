# VFX Composite Stage QA

実施日: 2026-07-15
対象ブランチ: `codex/animation-uplift-sequence`
対象Phase: 7 / Effect Animation Phase 2

## 実装到達点

- character animation resultとGold / Silver effect resultを通常historyへ複製せず、別layerとして同期previewする。
- `hand`、`weapon-tip`、`feet`、`body-center`、`projectile-origin`、`impact-point`の6 socketと、`startup`、`charge`、`active`、`impact`、`recovery`の5 eventを扱う。
- Animation Pack v2に指定socketがない場合はpivot、anchor、推定座標の順でfallbackし、preview上へestimated表示を出す。
- front / back、Normal / Additive / Screen、offset X / Y、scale、rotation、opacity、start frame、peak frame、time scaleを数値編集する。
- checkerboard / light / dark / game背景、safe area、clipping、hitbox、hurtbox、effect boundsを切り替える。
- Undo / Redo / Reset、未保存表示、設定保存、keyboard frame step、Escape close、focus return、mobile advanced折り畳みを実装する。
- Combined GIF / APNG / sheet、character / effect layer sheet、composite manifest、Generic / Godot / Phaser JSONを含むComposite Pack ZIPをexportし、Packを再importできる。
- 既存5カテゴリを維持したままTelegraph / AOE、Aura / Status、Heal / Buff、Barrier / Shield、Spawn / Portal、Movement Trail / LandingをRecipe、prompt、UIへ追加する。
- Effect Quality v2はloop seam、alpha continuity、energy centroid、brightness envelope、clipping / overdraw、palette consistency、peak-event deltaをshadow warningとして記録し、既存hard gateを変更しない。

## 代表browser trial

結果は `docs/qa/vfx-composite-stage-matrix.json` にjob ID、socket、event、blend、export、目視評価を記録した。

1. melee attack × slash / impact
2. cast × magic / aura / heal
3. projectile attack × projectile / impact

実ブラウザでは次の実生成結果を組み合わせ、既存デザインシステムの同一viewportで目視確認した。

- heavy attack `codex-job-2026-07-14T23-39-48-498Z-kpq8rt` × slash `codex-job-2026-07-15T02-12-58-835Z-s2kptm`
- idle / cast proxy `codex-job-2026-07-15T01-24-45-782Z-az43nk` × magic cast `codex-job-2026-07-15T02-13-15-836Z-jawtdx`
- dash / projectile proxy `codex-job-2026-07-14T23-18-06-166Z-9ibt7n` × projectile `codex-job-2026-07-15T02-19-45-202Z-jslhox` / impact `codex-job-2026-07-15T02-20-05-697Z-pgbfcf`

比較画像:

- `docs/qa/screenshots/vfx-composite-stage-audit/01-before-effect-workspace.png`
- `docs/qa/screenshots/vfx-composite-stage-audit/02-after-melee-slash.png`
- `docs/qa/screenshots/vfx-composite-stage-audit/03-cast-magic.png`
- `docs/qa/screenshots/vfx-composite-stage-audit/04-dash-projectile.png`
- `docs/qa/screenshots/vfx-composite-stage-audit/05-projectile-impact.png`

legacy Animation Packは専用socketを持たないため、pivot / estimated fallback表示が出ることと、offset / scaleで非破壊補正できることを確認した。実PackのLayer Sheets、Manifest、Combined GIF、Combined APNG、Composite Sheet、Composite Pack ZIPはWindows Downloadsへ正常保存できた。Pack再取り込みはfull UI smokeで書き出した同一ZIPを再入力し、character / effectの別layerとmanifest参照を復元できた。

## 回帰範囲

- 既存Effect Animation 5カテゴリのdeterministic UI matrix、transparent sheet、GIF、APNG、metadata、Effect Pack export。
- 旧Effect PackのQuality v2未較正表示と、旧Animation Packのpivot / anchor fallback。
- loop character × loop VFX、one-shot × one-shot、projectile × impactのserialize / round-trip。
- bronze / failed / blocked effectを通常Composite候補へ含めない。
- desktop / 390×844 mobile、checker / light / dark / game、reduced motion。

## separate-layer export確認

Composite Packは`layers/character.png`と`layers/effect.png`を別ファイルで保持し、`composite.json`とengine JSONからゲーム側で再構成できることを検証対象とする。

## 検証記録

- TypeScript typecheck: pass
- focused Vitest: Effect Quality v2 / VFX Composite / Pack v2 pass
- production build: pass（既存のchunk size warningのみ）
- full Vitest: 11 files / 179 tests pass
- server smoke: pass
- release audit: pass
- Effect-only UI smoke: pass（既存5カテゴリ）
- VFX Composite-only UI smoke: pass（desktop / 390×844 / reduced motion / export / reimport / focus return）
- full UI smoke: pass（318.6秒）
- real runner: 既存5カテゴリ全件completed、全件Gold、PNG / GIF / metadataあり
- real browser: 5 effect候補、代表3系統、checker / dark / game、socket / event / blend / timing / offset / scaleを確認
- `git diff --check`: pass（既存のLF/CRLF warningのみ）
