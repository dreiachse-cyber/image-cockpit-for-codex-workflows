# Animation Uplift Final Benchmark

実施日: 2026-07-15
branch: `codex/animation-uplift-sequence`
baseline: `a69fc9f`
対象: Phase 8 Motion Pilot Tournament / 最終回帰

## 判定条件

- standard real browser trials: 10件以上を最終branchで新規実施する。
- Motion Pilot A/B: 通常方式との比較を3組以上実施する。
- false success 0、stuck 0を必須とする。
- 5方向は通常最大15方向出力に対してPilot最大7、3方向は通常最大9に対してPilot最大5を理論値とし、実測値を別に記録する。
- identity、direction consistency、usable final到達時間を悪化させる場合、既定OFFのまま凍結する。

## 実装regime

Motion Pilot Tournamentは`Experimental · Best only · default OFF`である。side-only A/B/CをQuality Gate v2と人間Reviewへ渡し、採用winnerのidentity、palette、motion phase、accepted framesを固定参照して残り方向を1 expansion jobで生成する。失敗、警告、僅差、identity低下では既存Balancedへfallbackできる。

Fast／Balancedでは候補数がA/B/Cにならないため、実験toggleを無効化し、別profileへ変更すると自動でOFFへ戻す。

## Baselineの扱い

- rollback / code baselineは`a69fc9f`。
- 既存current-regime delivery baselineはreal browser 10/10、false success 0、stuck 0だが、新実装の成功件数には流用しない。
- Phase 8では別に4 source × 3 motionの12 tournamentを実ブラウザから新規投入し、usable final、公開outbox、Quality Gate v2まで到達したものだけを成功へ数える。
- sourceは盾・メイスの通常体型、floating fire、small slime、斧を持つ大型体型。motionはsubtle idle、high-motion basic attack、airborne jump-hop。全件5方向、Fastで固定し、Best／Balanced、3方向、新規Experimental topologyは同branch上の既存checkpoint trialを補助coverageとして分離記録する。

## Trial記録

trial別job ID、候補数、方向出力数、runner開始からusable finalまでの時間、runner retry、Direction Repair、quality、人間評価、manual action数は`animation-uplift-final-benchmark.json`へ記録する。direction consistencyはpalette scoreとsilhouette scoreの平均、motion readabilityはphase score、contactはfootline scoreを用い、代表sheetは実画像で目視する。

### 標準real browser 12件

| trial | source / motion | terminal | elapsed | identity | direction | phase | contact | dimension |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| STD-01 | knight / idle | accepted | 22.39m | 86.73 | 86.54 | 80.29 | 95.29 | 87.21 |
| STD-02 | knight / attack | failed | 43.78m | — | — | — | — | — |
| STD-03 | knight / jump | accepted | 15.65m | 84.75 | 84.18 | 75.27 | 100.00 | 86.05 |
| STD-04 | floating fire / idle | accepted | 18.96m | 92.72 | 93.00 | 89.97 | 95.29 | 92.74 |
| STD-05 | floating fire / attack | accepted | 24.34m | 90.17 | 90.05 | 75.62 | 62.58 | 79.60 |
| STD-06 | floating fire / jump | accepted | 29.56m | 90.88 | 90.72 | 89.31 | 100.00 | 92.73 |
| STD-07 | small slime / idle | accepted | 34.62m | 39.10 | 41.84 | 88.67 | 2.25 | 42.96 |
| STD-08 | small slime / attack | accepted | 28.64m | 39.49 | 42.00 | 80.78 | 0.00 | 40.57 |
| STD-09 | small slime / jump | accepted | 33.12m | 42.34 | 44.38 | 86.89 | 100.00 | 68.40 |
| STD-10 | axe wielder / idle | accepted | 17.04m | 88.61 | 87.64 | 88.55 | 55.00 | 79.95 |
| STD-11 | axe wielder / attack | accepted | 31.01m | 83.17 | 81.70 | 84.54 | 14.63 | 66.01 |
| STD-12 | axe wielder / jump | accepted | 16.60m | 85.08 | 83.54 | 86.87 | 100.00 | 88.87 |

accepted 11件の平均usable final到達時間は24.72分、identity 74.82、direction consistency 75.05、phase 84.25、contact 65.91、dimension 75.01である。STD-02は外部ImageGenのHTTP 520再試行後に`imagegen_unavailable`でterminal failureとなり、partial publishはなかった。false success 0、stuck 0は維持した。

legacy rankはaccepted 11件すべてGOLDだったが、Quality Gate v2は全件`shadowWouldBlock=true`である。特にsmall slime 3件のidentity 39.10–42.34、direction 41.84–44.38は、legacy rankだけでの自動採用が危険であることを示す。したがってQuality Gate v2のhard化とMotion Pilotの既定ONは行わず、topology別calibrationを次の判断点とする。

### 実ブラウザで追加検出した不具合

最初のPilot採用時、別PilotのA/B/Cが3 runnerを使用中なのに残方向展開が即時開始され、UIが一時的に`4 animation job(s) active`を表示した。サーバーのcandidate／expansion開始前slot assertion、Review Cockpitの採用disable理由、代表方向sideの初期表示を追加した。fallback登録は従来どおりqueueへ留まり、空きslotでのみ開始する。最終回帰では3/3表示とサーバー拒否を再確認する。

加えて、Pilot Reviewが未生成方向をQC pass表示する、展開候補DをReview対象から除外する、採用後の公開manifestがside-only qualityを保持する問題を実画面で検出した。Review方向を実在artifactへ限定し、A/B/C/D比較を許可し、公開5方向を再合成してQuality Gate v2を再記録する自動処理と`Revalidate Pilot Final`を追加した。

### Motion Pilot A/B 3組

| pair | same-source control | Pilot判断 | Pilot段階 | 現在の最終経路 |
| --- | --- | --- | ---: | --- |
| PILOT-01 knight idle | STD-01 Fast / 5 outputs / 22.39m | A採用 | 7 outputs / 4 jobs / 49.64m | 5方向完全版accepted、公開final再検証pass |
| PILOT-02 small slime jump | STD-09 Fast / 5 outputs / 33.12m | A/B/C reject | 18 outputs / 6 jobs / 94.78m | Balanced B accepted、27 warnings、shadow block相当 |
| PILOT-03 floating fire attack | STD-05 Fast / 5 outputs / 24.34m | C hold後fallback | 18 outputs / 6 jobs / 80.19m | Balanced B accepted、11 warnings、shadow block相当 |

PILOT-01はBest通常理論15 outputsに対し7 outputsへ53.3%削減したが、同source Fast controlより2.22倍遅く、Fast 1-candidateの5 outputsより多い。patched API再起動後に実ブラウザの`Revalidate Pilot Final`を実行し、公開root manifestはside-only 1方向から5方向へ更新され、identity 90.50、direction 90.14、phase 81.55、contact 100、loop 52.93、dimension warning 1、shadow blockなしを記録した。PILOT-02ではside単体identity 85.89–87.63でもF1/F4のscale変動と12–17 warningsがあり、同source通常5方向identity 42.34が示す方向展開リスクをsideだけでは判定できなかった。fallback込みではPILOT-02がFast比2.86倍、PILOT-03が3.30倍、どちらも合計18方向出力となり、通常Best理論15方向出力より多い。fallback winnerはPILOT-02がidentity 80.67 / direction 80.72 / 27 warnings、PILOT-03がidentity 88.54 / direction 88.15 / 11 warningsで、双方ともQuality Gate v2はshadow block相当だった。3組は同source／Recipeの比較だが、PilotがBest専用でcontrolがFastのため、時間の絶対比較にはprofile差が含まれる。Best通常3-candidateは理論15 outputsと既存checkpointを別に使う。

## 最終回帰

Fast / Balanced / Best、3 / 5方向、Experimental motion、reload復帰、Direction Repair、Batch Matrix、Timeline / Pack v2、engine metadata、Effect既存5カテゴリ、Composite代表3組、desktop / mobile / keyboard / reduced motionを対象とする。

最終再実行結果: doctor pass、typecheck pass、184 unit tests pass（Motion Pilot 5 testsを含む）、build pass、server smoke pass、release audit pass、full UI smoke pass（368.5秒）。full UI smokeはdesktop / mobile / keyboard / reduced motion、既存5 Effectカテゴリ、Composite、Phase 8 UIを含めて完走した。

## 最終判断

Motion Pilotは`Experimental · Best only · default OFF`のまま凍結する。3組中、side-only A/B/Cからそのまま展開できたのは1組だけで、その1組もFast control比2.22倍だった。残る2組は人間Reviewでfallbackし、最終到達時間がFast比2.86–3.30倍、方向出力が各18まで増え、公開winnerもshadow block相当だった。既定ONの再検討条件は、topology別identity calibration、sideから残方向へ展開する際のscale保証、fallback込みusable-final時間の短縮、3組以上の再benchmarkでFast/Balanced比の非劣化を満たすこととする。
