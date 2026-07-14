# Resumable Adaptive Animation Tournament QA

実施日: 2026-07-15
branch: `codex/animation-uplift-sequence`
対象: Phase 2 / Fast・Balanced・Best、永続manifest、再開、冪等化

## 結論

Animation Generationを単発jobの寄せ集めではなく、server側のversioned tournament manifestを正本にする構成へ変更した。画面再読込やAPI再起動の後も、同じ候補job IDを追跡し、完了候補を重複生成しない。

## プロファイル

| profile | 初期候補 | 最大候補 | 終了条件 |
|---|---:|---:|---|
| Fast | 1 | 1 | 候補Aが終端になったら評価。自動fallbackは行わない |
| Balanced | 2 | 3 | A/Bを先に比較し、失敗・warning・identity低下・僅差の場合だけCを追加 |
| Best | 3 | 3 | A/B/Cの全開始候補が終端になるまでwinnerを確定しない |

既定値はBest。全profileで元画像fingerprint、motion recipe、方向数、候補indexを冪等keyへ含める。

## 永続manifest

- schema: `image-cockpit.animation-tournament.v1`
- version: `1`
- 保存対象: profile、source fingerprint、motion/preset、要求方向、候補状態、job ID、Quality v2参照、winner、採用方向hash、retry回数、client context。
- 元画像Data URLはmanifest/templateへ埋め込まず、SHA-256 content-addressed assetとして一度だけ保存する。
- JSONは一時ファイルからatomic renameする。
- candidate startとevaluation updateはtournament単位のlockで直列化し、並列POSTによるjob ID消失を防ぐ。
- 同一candidate startを再POSTしても既存jobを返す。
- API起動時、runner状態がrunningのままでも検証済みartifactが存在すればcompletedへ回復できる。

## 自動QA

- Fastが1候補、Balancedが2+1、Bestが3候補であること。
- Balancedのclean A/BはCを開始しないこと。
- failure、Quality warning、identity低下、score僅差ではCを開始すること。
- Bestは全開始候補を待つこと。
- registrationとcandidate POSTが冪等であること。
- tournament templateからData URLが除去され、候補が同じcontent-addressed source assetを使うこと。
- API再起動後もA/Cのjob IDが同じmanifestから復元されること。
- failed/cancelled候補をUIがrunningとして復元しないこと。
- 3候補同時POSTでもserver lockにより全job IDが残ること。

## 実ブラウザtrial

URL: `http://127.0.0.1:5181/`
API: `http://127.0.0.1:8794/`
source: `codex-job-2026-07-14T20-06-26-382Z-x2piif-forest-knight.png`
source fingerprint: `339deb1bb0db25b2...`

| profile | tournament | candidate jobs | 実測結果 |
|---|---|---|---|
| Fast | `anim-tournament_dzn0hv_mrl35958` | A `codex-job-2026-07-14T20-10-06-919Z-rir18c` | Aを採用。score 3300 / warning 4。候補は1本だけで、自動fallbackなし |
| Balanced | `anim-tournament_7yqxef_mrl3626e` | A `codex-job-2026-07-14T20-12-21-069Z-a9gh5q` / B `codex-job-2026-07-14T20-12-21-395Z-asvsjx` / C `codex-job-2026-07-14T20-42-48-253Z-lsll68` | A/Bのwarningを理由にCを追加。Bを採用。B/Cともscore 3300 / warning 4 |
| Best | `anim-tournament_6mwa5d_mrl3fj52` | A `codex-job-2026-07-14T20-27-25-520Z-zv23zk` / B `codex-job-2026-07-14T20-34-05-373Z-6uwi9a` / C `codex-job-2026-07-14T20-40-06-947Z-649zd3` | 3候補すべてのQuality評価を待ってAを採用。各score 3250 / warning 6 |

### 実行中再開

Fast候補Aの実行中にAPI PID `63880`を停止し、dev supervisorのrepairでPID `42540`を起動した。復帰後も次が維持された。

- tournament: `anim-tournament_dzn0hv_mrl35958`
- candidate job ID: `codex-job-2026-07-14T20-10-06-919Z-rir18c`
- runner state: `running`
- startedAt: `2026-07-14T20:10:06.928Z`
- resumedAt: `2026-07-14T20:23:34.658Z`
- resumeCount: `1`

続けて画面をreloadし、job shelfがFast AとBalanced A/Bの3本を同じjob IDで表示すること、server側で重複candidateが増えないことを確認した。

Balanced候補BもAPI再起動後に同じjob IDで自動再開し、`resumeCount: 1`を記録した。さらにartifact生成後のAPI再起動でも、永続manifestから評価済み候補、Quality参照、winner選択を復元し、candidateの重複生成がないことを確認した。

## 検証コマンド

```text
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run
node scripts/smoke.mjs
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build
node scripts/release-audit.mjs
node scripts/ui-smoke.mjs
```

2026-07-15時点の最終自動結果はdoctor、型検査、全82テスト、server smoke、production build、release audit、UI smoke（264.6秒）が成功した。buildには既存のchunk size warningだけが残る。
