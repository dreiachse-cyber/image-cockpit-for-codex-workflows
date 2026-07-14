# Direction Repair and Batch Matrix QA

実施日: 2026-07-15
branch: `codex/animation-uplift-sequence`
対象: Phase 2 / 方向限定再生成、2元画像×2motion一括生成

## Direction Repair

採用済みtournamentを対象に、問題方向だけを別candidateとして再生成できるようにした。

- Repair開始条件はaccepted tournamentであること。
- 最大retryは2回。
- 元画像、motion recipe、cell/grid、chroma keyは採用時と同じtemplateを再利用する。
- promptへ採用済み方向hashを含め、対象外方向を変更禁止として伝える。
- Repair候補は通常候補と同じartifact検証とQuality Gate v2評価を通す。
- reviewでAccept Repairを押すまでは採用artifactを上書きしない。
- Accept時は対象方向だけをhidden winner artifactへコピーし、対象外方向のbefore/after SHA-256が完全一致することをserverで検証してから公開する。
- UIは方向ごとの状態、repair job、warning、accept操作をTournament Monitorへ表示する。

## Batch Matrix

Animation Generation内にcharacters × motionsのmatrix投入UIを追加した。

- 元画像は最大4件、motionは最大4件を選択できる。
- 最小投入は2元画像×2motion。
- profileごとの初期候補数と最大候補数を確認dialogに表示する。
- 各cellは独立tournamentとして永続化する。
- 生成開始は既存global queueを使い、同時runner数は最大3。
- matrixはcellごとのstate、開始job数、終端数、warning数を表示する。
- accepted artifactは一括投入で上書きしない。

## 自動QA

server smokeで次を確認した。

1. 3方向winnerをacceptedにする。
2. `side`だけのRepairを開始する。
3. 1回目を失敗させ、accepted winnerと全direction stateが復旧することを確認する。
4. bounded retryが別job IDで開始されることを確認する。
5. Repair候補にQuality v2 reportを保存する。
6. Repairをacceptする。
7. `front`と`back`のhashがaccept前後で一致する。
8. 修復方向はrepair job、対象外方向はwinner jobへ帰属する。
9. tournament retry回数とdirection stateが永続化される。
10. tournament cancelが終端状態として保存される。

UI smokeはBest既定値、Fast/Balanced/Best切替、永続候補の復帰、job shelf解放、元画像往復を含め264.6秒で成功した。

## 実ブラウザtrial

| 項目 | tournament / jobs | 結果 |
|---|---|---|
| 5方向artifactの1方向Repair | Best `anim-tournament_6mwa5d_mrl3fj52` / `side` | 1回目 `codex-job-2026-07-14T21-00-14-691Z-dx04dg` でartifact安定化競合を実測して修正。2回目 `codex-job-2026-07-14T21-34-07-481Z-hu0x5s` をQuality評価し、score 3375 / warning 1で画面からaccept |
| forest knight / idle | `anim-tournament_gvjd9n_mrl55mn1` / `codex-job-2026-07-14T21-06-23-899Z-z9od6r` | accepted、score 3350、warning 2 |
| forest knight / walk | `anim-tournament_j9o7o6_mrl55mrj` / `codex-job-2026-07-14T21-06-24-098Z-lbags6` | model capacityでfailed。再読込後diagnosticは`runner_failed`、Fastの自動fallbackなし |
| second source / idle | `anim-tournament_4b38ne_mrl55n18` / `codex-job-2026-07-14T21-11-36-363Z-ts0pqx` | 3方向QA合格後にrunner終端が5分以上停止したため通常cancelでfailed終端 |
| second source / walk | `anim-tournament_1et3rq_mrl55nci` / `codex-job-2026-07-14T21-10-10-525Z-zz5uaf` | accepted、score 3400、warning 0 |
| preview / export / logs | accepted 2件 / failed 2件 | accepted winnerだけhistoryへ追加し、最新winnerがSprite Sheet previewとdownloadへ反映。失敗セルとrunner logを保持 |

Matrix投入直後はRepair 1本とMatrix 2本が同時実行され、1枠解放ごとに残りcellを開始した。観測したglobal runnerは最大`3/3`で、4cell終端後は`0/3`へ戻った。再読込後に過去の同一source/motion tournamentを混ぜないよう、各manifestへ`batchMatrixRunId`と`batchMatrixCellKey`を保存する復元ガードも追加した。

### Direction Repair hash比較

| direction | accept前 | accept後 | 判定 |
|---|---|---|---|
| front | `304112080e57d80a40e493c1ffa4221c9c875c56b42740063fd6dd3def924029` | 同左 | 一致 |
| front three-quarter | `5a86a76a22bcca9afbddc4527d8acff5348cd9a73fe76fcb6146311180b3fd8f` | 同左 | 一致 |
| side | `376cdd321b07098a6b6e2ea1e91e2440ecd479962acad0d66e6355b60714b89e` | `b14b9cedc95cf111987d37c1a46ddf68b5214905f7e854d828bd209d9d0f6eb9` | 対象方向だけ変更 |
| back three-quarter | `0c31c6bdff02aed3d608507e3cdc1512da2b54ee8dcd903c21128939ff4f742f` | 同左 | 一致 |
| back | `47e5f664aec2147c873b660ce3b42a66a05aae3ef679607508a62f0982645794` | 同左 | 一致 |

受理後、5方向previewと2048×1280 Sprite Sheet、download対象、history先頭が同じwinner artifactへ更新された。job shelfは`0/3`へ戻り、sideのdirection stateだけrepair job、対象外4方向は元winner jobを保持した。

## 合格条件

- Repair対象外の方向hashが1件でも変化した場合は不合格。
- Repair候補がhard gateまたはserver artifact検証を通らない場合はaccept不可。
- Batch Matrixで同一cellのcandidateがreload後に重複しない。
- 同時runner数が3を超えない。
- 全cell終端後にjob shelfが0へ戻る。
- historyへ採用winnerだけが登録され、hidden candidateが直接表示されない。
