import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const outDir = path.join(repoRoot, "docs", "qa", "core-animation-quality-uplift");
const promptsDir = path.join(outDir, "prompts");
const generatedAt = "2026-06-27T01:23:00+09:00";

const cellSize = 256;
const frameCount = 8;
const directions = [
  { id: "front", label: "front", row: 1 },
  { id: "front-three-quarter", label: "front three-quarter", row: 2 },
  { id: "side", label: "side", row: 3 },
  { id: "back-three-quarter", label: "back three-quarter", row: 4 },
  { id: "back", label: "back", row: 5 }
];

const scoringCriteria = [
  { id: "identityStyle", label: "Identity / style consistency", max: 15 },
  { id: "directionCorrectness", label: "Direction correctness", max: 15 },
  { id: "motionReadability", label: "Motion readability", max: 20 },
  { id: "frameContinuity", label: "Frame continuity / timing", max: 15 },
  { id: "cellSafety", label: "Cell safety / anchor / scale", max: 15 },
  { id: "transparencyCleanup", label: "Transparency / cleanup", max: 10 },
  { id: "gameplayReadability", label: "Gameplay readability at 1x/2x", max: 10 }
];

const requiredArtifacts = [
  "sampleSheet",
  "qaDir",
  "frontGif",
  "frontThreeQuarterGif",
  "sideGif",
  "backThreeQuarterGif",
  "backGif",
  "gridQa",
  "mechanicalQa",
  "transparentContact"
];

const presets = [
  {
    id: "idle-breathing",
    title: "Idle Breathing",
    titleJa: "待機呼吸ループ",
    action: "idle",
    category: "Core",
    focus: "足固定、呼吸だけで読めるか、ループ継ぎ目",
    playback: "normal loop",
    sourceJobId: "019ef1ff-b668-7400-8bf3-d8ffcff8f989",
    currentPrompt: "idle breathing ready stance with planted feet, subtle inhale and exhale, tiny shoulder and chest rise, delayed hair, hood, clothing, and backpack follow-through, stable center, stable foot baseline, no walking, no stepping, no hopping",
    framePlan: "1 neutral ready, 2 inhale, 3 secondary motion follows, 4 top of breath, 5 exhale, 6 settle, 7 return, 8 bridge to frame 1",
    motionRisk: 1,
    gameplayRisk: 0,
    priorityWeight: 6
  },
  {
    id: "walk-cycle",
    title: "Walk Cycle",
    titleJa: "歩行ループ",
    action: "walk",
    category: "Move",
    focus: "接地、通過pose、足滑り、横方向の歩行感",
    playback: "normal loop",
    sourceJobId: "pilot-official-walk-cycle",
    currentPrompt: "8-frame walk cycle with alternating left and right foot contact, clear passing poses under the body, modest stride length, stable ground contact, opposite arm swing, subtle torso bob, full-body side-readable motion",
    framePlan: "1 left contact, 2 down, 3 passing, 4 right reach, 5 right contact, 6 down, 7 passing, 8 left reach into loop",
    motionRisk: 1,
    gameplayRisk: 0,
    priorityWeight: 8
  },
  {
    id: "run-cycle",
    title: "Run Cycle",
    titleJa: "走行ループ",
    action: "run",
    category: "Move",
    focus: "空中beat、強い腕振り、走りと歩きの差",
    playback: "ping-pong reverse loop",
    sourceJobId: "pilot-official-run-cycle",
    currentPrompt: "run cycle half-cycle with the left foot traveling from back to front and the right foot traveling from front to back, legs far apart then approaching, feet-together passing moment, legs separating into the opposite stride, forward torso lean, strong opposite arm drive, full-body side-readable motion",
    framePlan: "8 source frames are one half-cycle: extended stride, narrow, feet together, separate, opposite stride, then app ping-pong playback",
    motionRisk: 2,
    gameplayRisk: 1,
    priorityWeight: 9
  },
  {
    id: "basic-attack",
    title: "Basic Attack",
    titleJa: "基本攻撃",
    action: "attack",
    category: "Combat",
    focus: "構え、溜め、打撃、戻り、effectの小ささ",
    playback: "normal non-loop",
    sourceJobId: "codex-job-2026-06-25T21-02-07-575Z",
    currentPrompt: "basic forward attack with ready pose, anticipation, wind-up, strike, clear impact pose, follow-through, recovery, small contained weapon or hand motion, readable attack direction, no large effects",
    framePlan: "1 ready, 2 anticipation, 3 wind-up, 4 strike, 5 impact, 6 follow-through, 7 recover, 8 ready-ish end",
    motionRisk: 3,
    gameplayRisk: 1,
    priorityWeight: 10
  },
  {
    id: "hurt-reaction",
    title: "Hurt Reaction",
    titleJa: "被弾リアクション",
    action: "hurt",
    category: "Combat",
    focus: "のけぞり、踏ん張り、復帰、非ゴア",
    playback: "normal non-loop",
    sourceJobId: "codex-job-2026-06-25T21-19-09-228Z",
    currentPrompt: "hurt reaction with small hit spark, upper body recoil, head jolt, body bending back, staggered foot brace, regain balance, settle back to ready, no gore",
    framePlan: "1 ready, 2 hit spark/recoil, 3 bend back, 4 peak recoil, 5 brace, 6 regain, 7 settle, 8 ready",
    motionRisk: 1,
    gameplayRisk: 0,
    priorityWeight: 5
  },
  {
    id: "death-downed",
    title: "Death / Downed",
    titleJa: "ダウン",
    action: "death",
    category: "Combat",
    focus: "倒れ込み、最終pose、cell内収まり、非ゴア",
    playback: "normal non-loop",
    sourceJobId: "codex-job-2026-06-25T21-33-50-902Z",
    currentPrompt: "non-gory defeated downed animation with hit, collapse, falling or kneeling, contact, downed pose, settle, final still, final still, compact body inside cell",
    framePlan: "1 hit/loss of balance, 2 collapse starts, 3 fall/kneel, 4 contact, 5 downed pose, 6 settle, 7 final still, 8 final still",
    motionRisk: 2,
    gameplayRisk: 1,
    priorityWeight: 8
  },
  {
    id: "spell-cast",
    title: "Spell Cast",
    titleJa: "詠唱 / 発動",
    action: "cast",
    category: "Magic / Skill",
    focus: "同一術者、手元/杖先effect、方向別identity維持",
    playback: "normal non-loop",
    sourceJobId: "codex-job-2026-06-26T04-21-32-475Z",
    currentPrompt: "spell cast animation with ready stance, raise hand or staff, magic charge, brighter charge, compact release, follow-through, settle, return ready, small contained effect",
    framePlan: "1 ready, 2 raise hand/staff, 3 compact charge, 4 brighter charge, 5 release, 6 follow-through, 7 settle, 8 ready",
    motionRisk: 2,
    identityRisk: 1,
    gameplayRisk: 1,
    priorityWeight: 8
  },
  {
    id: "jump-hop",
    title: "Jump / Hop",
    titleJa: "ジャンプ",
    action: "jump",
    category: "Move",
    focus: "頭上余白、踏み切り、頂点、着地、足元baseline",
    playback: "normal non-loop",
    sourceJobId: "codex-job-2026-06-25T21-33-50-977Z",
    currentPrompt: "small in-place jump hop with crouch, push-off, rising, apex, falling, landing, squash settle, ready pose, stable landing baseline, generous top padding",
    framePlan: "1 ready, 2 crouch, 3 push-off, 4 rising, 5 apex, 6 falling, 7 landing squash, 8 settle",
    motionRisk: 2,
    gameplayRisk: 0,
    priorityWeight: 8
  },
  {
    id: "guard-block",
    title: "Guard / Block",
    titleJa: "ガード",
    action: "guard",
    category: "Combat",
    focus: "防御に見えるか、顔や胴体を隠しすぎないか",
    playback: "normal non-loop",
    sourceJobId: "codex-job-2026-06-25T21-54-18-523Z",
    currentPrompt: "guard block animation with ready pose, raise guard, brace, hold, absorb impact, slight recoil, recover, guard or ready end, arms weapon shield or body stance reads as defense",
    framePlan: "1 ready, 2 raise guard, 3 brace, 4 hold, 5 absorb, 6 recoil, 7 recover, 8 guard/ready",
    motionRisk: 1,
    gameplayRisk: 0,
    priorityWeight: 5
  },
  {
    id: "victory-cheer",
    title: "Victory Cheer",
    titleJa: "勝利ポーズ",
    action: "cheer",
    category: "Emotion / Social",
    focus: "jumpとの差別化、腕/表情/小bounce、ループ",
    playback: "normal loop",
    sourceJobId: "codex-job-2026-06-25T21-54-18-553Z",
    currentPrompt: "victory cheer loop with ready pose, arm raises, cheerful peak, small bounce, wave or held pose, settle, smile pose, loop bridge, no big jump",
    framePlan: "1 ready, 2 arm rises, 3 cheer peak, 4 small bounce, 5 wave/hold, 6 settle, 7 proud pose, 8 loop bridge",
    motionRisk: 1,
    gameplayRisk: 0,
    priorityWeight: 4
  },
  {
    id: "interact-pickup",
    title: "Interact / Pickup",
    titleJa: "調べる / 拾う",
    action: "interact",
    category: "Utility",
    focus: "手の動き、拾う/調べる意図、潰れすぎないシルエット",
    playback: "normal non-loop",
    sourceJobId: "codex-job-2026-06-25T22-10-11-861Z",
    currentPrompt: "interact pickup animation with ready pose, look down or forward, reach, bend or pickup, hold or inspect small item, return, settle, ready pose, compact readable hands",
    framePlan: "1 ready, 2 look, 3 reach, 4 bend/pickup, 5 hold/inspect, 6 return, 7 settle, 8 ready",
    motionRisk: 1,
    gameplayRisk: 0,
    priorityWeight: 4
  },
  {
    id: "ranged-attack",
    title: "Ranged Attack",
    titleJa: "遠距離攻撃",
    action: "ranged",
    category: "Combat",
    focus: "狙い、発射、小projectile、同一prop、effect過多防止",
    playback: "normal non-loop",
    sourceJobId: "codex-job-2026-06-26T04-20-29-885Z",
    currentPrompt: "ranged attack animation with ready pose, aim, draw or charge, release, tiny projectile or spark close to the hand or weapon tip, follow-through, recover, ready pose, compact forward shot",
    framePlan: "1 ready, 2 aim, 3 draw/charge, 4 release, 5 tiny projectile, 6 follow-through, 7 recover, 8 ready",
    motionRisk: 3,
    identityRisk: 1,
    gameplayRisk: 1,
    priorityWeight: 10
  },
  {
    id: "skill-release",
    title: "Skill Release",
    titleJa: "スキル発動",
    action: "skill",
    category: "Magic / Skill",
    focus: "spell/rangedとの差別化、発動瞬間、compact burst",
    playback: "normal non-loop",
    sourceJobId: "codex-job-2026-06-25T23-05-13-732Z",
    currentPrompt: "skill release animation with ready pose, focus, energy gathers near the hand or staff, compact release burst, peak effect, recoil or follow-through, settle, ready pose, no arrows, bullets, guns, bows, or thrown weapons",
    framePlan: "1 ready, 2 focus, 3 energy compresses, 4 release burst, 5 peak effect, 6 recoil/follow-through, 7 settle, 8 ready",
    motionRisk: 3,
    gameplayRisk: 1,
    priorityWeight: 9
  },
  {
    id: "knockback",
    title: "Knockback",
    titleJa: "ノックバック",
    action: "knockback",
    category: "Combat",
    focus: "hurtより大きい反応、後退、cell外にはみ出さないこと",
    playback: "normal non-loop",
    sourceJobId: "codex-job-2026-06-25T23-05-13-783Z",
    currentPrompt: "non-gory knockback animation with neutral pose, impact recoil, lifted lean back, backward slide peak, stumble, regain footing, settle, ready pose",
    framePlan: "1 ready, 2 impact starts, 3 lean back, 4 backward slide peak, 5 stumble, 6 regain footing, 7 settle, 8 ready",
    motionRisk: 3,
    gameplayRisk: 1,
    priorityWeight: 9
  },
  {
    id: "item-use",
    title: "Item Use",
    titleJa: "アイテム使用",
    action: "item",
    category: "Utility",
    focus: "小物を出す、使う、戻す、地面pickupと混ざらないこと",
    playback: "normal non-loop",
    sourceJobId: "codex-job-2026-06-25T23-15-35-242Z",
    currentPrompt: "item use animation with ready pose, draw small item, lift or use item near hand, tiny effect or read beat, finish, put item away, settle, ready pose",
    framePlan: "1 ready, 2 draw item, 3 lift/present, 4 use/read/drink, 5 tiny effect/read beat, 6 put away, 7 settle, 8 ready",
    motionRisk: 2,
    gameplayRisk: 0,
    priorityWeight: 5
  },
  {
    id: "talk",
    title: "Talk / NPC Reaction",
    titleJa: "会話 / NPCリアクション",
    action: "talk",
    category: "Emotion / Social",
    focus: "手振り、うなずき、肩、会話感、控えめなloop",
    playback: "normal loop",
    sourceJobId: "codex-job-2026-06-25T23-18-46-956Z",
    currentPrompt: "talking npc reaction loop with neutral pose, small mouth or hand gesture, small nod, gesture peak, blink or settle, second gesture, return, loop bridge",
    framePlan: "1 neutral, 2 small gesture begins, 3 nod, 4 gesture peak, 5 blink/settle, 6 second gesture, 7 return, 8 loop bridge",
    motionRisk: 1,
    gameplayRisk: 0,
    priorityWeight: 4
  }
];

mkdirSync(outDir, { recursive: true });
mkdirSync(promptsDir, { recursive: true });

const transparencyAudit = readJsonIfExists(path.join(repoRoot, "docs", "qa", "official-animation-transparency-audit.json")) ?? { results: [] };
const transparencyByPreset = new Map((transparencyAudit.results ?? []).map((result) => [result.preset, result]));

const inventory = [];
const issues = [];
const scoreItems = [];

for (const preset of presets) {
  const analysis = analyzePreset(preset);
  inventory.push(buildInventoryItem(preset, analysis));
  const presetIssues = buildIssues(preset, analysis);
  issues.push(...presetIssues);
  const score = buildScoreItem(preset, analysis, presetIssues);
  scoreItems.push(score);
}

const retakeItems = scoreItems
  .map((scoreItem) => {
    const preset = presets.find((item) => item.id === scoreItem.presetId);
    const scorePressure = Math.max(0, 92 - scoreItem.totalScore);
    const majorPressure = scoreItem.issueCounts.blocker * 20 + scoreItem.issueCounts.major * 10 + scoreItem.issueCounts.minor * 2;
    const priorityScore = scorePressure + majorPressure + preset.priorityWeight;
    return {
      presetId: scoreItem.presetId,
      title: scoreItem.title,
      priorityScore,
      decision: scoreItem.decision,
      runStatus: "not-run-phase-a",
      reason: scoreItem.retakeReason,
      officialReplacement: false,
      replacementGate: "ご主人確認前に公式sample / prompt contract / Animation選択モーダル採用版を置換しない",
      requiredArtifactsForFutureRetake: [
        "raw direction PNG x5",
        "direction split manifest",
        "candidate final sheet",
        "five direction GIF preview",
        "mechanical QA JSON",
        "grid QA image",
        "transparency / contact audit",
        "before / after comparison"
      ]
    };
  })
  .sort((a, b) => b.priorityScore - a.priorityScore);

writeJson("core-animation-inventory.json", {
  generatedAt,
  scope: "core animation official preset phase-a inventory",
  officialReplacement: false,
  presetCount: inventory.length,
  requiredArtifacts,
  items: inventory
});

writeJson("core-animation-issues.json", {
  generatedAt,
  scope: "core animation issue labels from structural audit, existing QA notes, and phase-a desk review",
  officialReplacement: false,
  labelSet: [
    "identity_drift",
    "direction_mismatch",
    "back_face_leak",
    "motion_unclear",
    "frame_pop",
    "foot_slide",
    "anchor_drift",
    "scale_drift",
    "cropped_body",
    "edge_contact",
    "alpha_residue",
    "effect_overpower",
    "prop_mismatch",
    "loop_seam_bad",
    "action_structure_bad",
    "game_readability_low"
  ],
  issues
});

writeJson("core-animation-scorecard.json", {
  generatedAt,
  scope: "phase-a current official sample scorecard",
  officialReplacement: false,
  criteria: scoringCriteria,
  passRules: {
    mechanicalBlockerCount: 0,
    blockerIssueCount: 0,
    minimumScore: 85,
    excellentScore: 92,
    promptFailureRateTarget: "5% or lower after future multi-run retake loop"
  },
  stabilityGate: {
    status: "pending",
    note: "Current official samples are real generations, but the full 5-attempt prompt stability gate has not been run in this phase."
  },
  items: scoreItems
});

writeJson("retake-log.json", {
  generatedAt,
  phase: "A",
  status: "audit-only",
  officialReplacement: false,
  note: "No new retake generation was run by this script. Future generated candidates must record job id, outbox path, manifest, QA, comparison, and adoption decision here.",
  items: retakeItems
});

writeMarkdown("index.md", renderIndex(inventory, scoreItems, retakeItems));
writeMarkdown("issues-by-preset.md", renderIssuesByPreset(scoreItems, issues));
writeMarkdown("scorecard.md", renderScorecard(scoreItems));
writeMarkdown("visual-review.md", renderVisualReview(scoreItems, issues));
writeHtml("before-after-gallery.html", renderGallery(scoreItems));

for (const preset of presets) {
  const score = scoreItems.find((item) => item.presetId === preset.id);
  const presetIssues = issues.filter((issue) => issue.presetId === preset.id);
  writeMarkdown(path.join("prompts", `${preset.id}.md`), renderPromptContract(preset, score, presetIssues));
}

console.log(`Core animation audit wrote ${inventory.length} inventory rows, ${issues.length} issues, ${scoreItems.length} score rows.`);

function analyzePreset(preset) {
  const samplePath = path.join(repoRoot, "public", "samples", `${preset.id}-sheet.png`);
  const qaDir = path.join(repoRoot, "docs", "qa", `official-${preset.id}`);
  const mechanicalPath = path.join(qaDir, `${preset.id}-mechanical-qa.json`);
  const mechanical = readJsonIfExists(mechanicalPath) ?? {};
  const transparency = transparencyByPreset.get(preset.id) ?? null;
  const artifacts = {
    sampleSheet: fileRecord(samplePath),
    qaDir: dirRecord(qaDir),
    frontGif: fileRecord(path.join(qaDir, `${preset.id}-front.gif`)),
    frontThreeQuarterGif: fileRecord(path.join(qaDir, `${preset.id}-front-three-quarter.gif`)),
    sideGif: fileRecord(path.join(qaDir, `${preset.id}-side.gif`)),
    backThreeQuarterGif: fileRecord(path.join(qaDir, `${preset.id}-back-three-quarter.gif`)),
    backGif: fileRecord(path.join(qaDir, `${preset.id}-back.gif`)),
    gridQa: fileRecord(path.join(qaDir, `${preset.id}-grid-qa.png`)),
    mechanicalQa: fileRecord(mechanicalPath),
    transparentContact: fileRecord(path.join(qaDir, `${preset.id}-transparent-contact.png`))
  };

  const sheet = artifacts.sampleSheet.exists ? analyzeSheet(samplePath) : null;
  const mechanicalErrors = [
    ...(mechanical.mechanicalErrors ?? []),
    ...(mechanical.failures ?? [])
  ];
  const mechanicalWarnings = [
    ...(mechanical.mechanicalWarnings ?? []),
    ...(mechanical.warnings ?? [])
  ];

  return {
    artifacts,
    sheet,
    mechanical,
    mechanicalPath: toRepoPath(mechanicalPath),
    mechanicalErrors,
    mechanicalWarnings,
    transparency
  };
}

function buildInventoryItem(preset, analysis) {
  const missingArtifacts = Object.entries(analysis.artifacts)
    .filter(([, record]) => !record.exists)
    .map(([key]) => key);
  const gifRecords = directions.map((direction) => {
    const gifPath = `docs/qa/official-${preset.id}/${preset.id}-${direction.id}.gif`;
    const transparencyGif = analysis.transparency?.gifs?.find((gif) => gif.path === gifPath) ?? null;
    return {
      direction: direction.id,
      path: gifPath,
      exists: existsSync(path.join(repoRoot, gifPath)),
      frameCount: transparencyGif?.frameCount ?? null,
      hasTransparencyIndex: transparencyGif?.hasTransparencyIndex ?? null,
      hasTransparentPixels: transparencyGif?.hasTransparentPixels ?? null,
      opaqueBackgroundFrames: transparencyGif?.opaqueBackgroundFrames ?? []
    };
  });

  return {
    presetId: preset.id,
    title: preset.title,
    titleJa: preset.titleJa,
    action: preset.action,
    category: preset.category,
    focus: preset.focus,
    playback: preset.playback,
    sourceJobId: analysis.mechanical.jobId ?? analysis.mechanical.sourceJobId ?? preset.sourceJobId,
    sample: `public/samples/${preset.id}-sheet.png`,
    qaDir: `docs/qa/official-${preset.id}`,
    artifacts: analysis.artifacts,
    missingArtifacts,
    imageSize: analysis.sheet ? [analysis.sheet.width, analysis.sheet.height] : null,
    alphaZeroRatio: analysis.sheet?.alphaZeroRatio ?? analysis.transparency?.sample?.alphaZeroRatio ?? null,
    mechanical: {
      path: analysis.mechanicalPath,
      errors: analysis.mechanicalErrors,
      warnings: analysis.mechanicalWarnings,
      framesChecked: analysis.mechanical.framesChecked ?? analysis.sheet?.frameCount ?? null,
      result: analysis.mechanical.mechanicalResult ?? (analysis.mechanicalErrors.length === 0 ? "pass" : "fail")
    },
    structuralMetrics: analysis.sheet?.summary ?? null,
    rowSummaries: analysis.sheet?.rowSummaries ?? [],
    gifPreviews: gifRecords,
    transparency: {
      sampleHasTransparentPixels: analysis.transparency?.sample?.hasTransparentPixels ?? null,
      sampleCornerAlpha: analysis.transparency?.sample?.cornerAlpha ?? null,
      gifFailures: gifRecords.flatMap((gif) => gif.opaqueBackgroundFrames.map((frame) => `${gif.direction}:${frame}`))
    }
  };
}

function buildIssues(preset, analysis) {
  const result = [];
  const sheet = analysis.sheet;
  if (!sheet) {
    result.push(issue(preset.id, "cropped_body", "blocker", "all", [], "Sample sheet missing or unreadable.", "artifact inventory"));
    return result;
  }

  for (const [key, record] of Object.entries(analysis.artifacts)) {
    if (!record.exists) {
      result.push(issue(preset.id, "cropped_body", "blocker", "all", [], `Missing required artifact: ${key}.`, "artifact inventory"));
    }
  }

  for (const error of analysis.mechanicalErrors) {
    result.push(issue(preset.id, classifyMechanicalMessage(error), "blocker", parseDirectionFromMessage(error), parseFramesFromMessage(error), String(error), "existing mechanical QA"));
  }

  for (const row of sheet.rowSummaries) {
    const tightFrames = row.frames.filter((frame) => frame.minPadding < 16).map((frame) => frame.frame);
    const polishFrames = row.frames.filter((frame) => frame.minPadding >= 16 && frame.minPadding < 24).map((frame) => frame.frame);
    if (tightFrames.length > 0) {
      result.push(issue(preset.id, "edge_contact", "minor", row.direction, tightFrames, `Minimum padding below 16px in ${row.direction}; min=${row.minPadding}px.`, "sheet structural audit"));
    } else if (polishFrames.length > 0) {
      result.push(issue(preset.id, "edge_contact", "polish", row.direction, polishFrames, `Padding below preferred 24px in ${row.direction}; min=${row.minPadding}px.`, "sheet structural audit"));
    }

    const topTight = row.frames.filter((frame) => frame.margins.top < 18).map((frame) => frame.frame);
    if (topTight.length > 0) {
      result.push(issue(preset.id, "cropped_body", "minor", row.direction, topTight, `Top margin is tight in ${row.direction}; minTop=${row.minTopMargin}px.`, "sheet structural audit"));
    }

    const centerSeverity = centerDriftSeverity(preset, row.centerDrift);
    if (centerSeverity) {
      result.push(issue(preset.id, "anchor_drift", centerSeverity, row.direction, row.frames.map((frame) => frame.frame), `Center drift is ${row.centerDrift}px in ${row.direction}.`, "sheet structural audit"));
    }

    const bottomSeverity = bottomDriftSeverity(preset, row.bottomDrift);
    if (bottomSeverity) {
      result.push(issue(preset.id, preset.action === "walk" || preset.action === "run" ? "foot_slide" : "anchor_drift", bottomSeverity, row.direction, row.frames.map((frame) => frame.frame), `Bottom anchor drift is ${row.bottomDrift}px in ${row.direction}.`, "sheet structural audit"));
    }

    const scaleSeverity = scaleDriftSeverity(preset, row.heightRatio);
    if (scaleSeverity) {
      result.push(issue(preset.id, "scale_drift", scaleSeverity, row.direction, row.frames.map((frame) => frame.frame), `Height ratio is ${round(row.heightRatio, 3)} in ${row.direction}.`, "sheet structural audit"));
    }
  }

  if (analysis.transparency?.failures?.length > 0 || analysis.transparency?.gifs?.some((gif) => gif.opaqueBackgroundFrames?.length > 0)) {
    result.push(issue(preset.id, "alpha_residue", "blocker", "all", [], "Transparency audit reported GIF or sheet failures.", "transparency audit"));
  }

  for (const warning of analysis.mechanicalWarnings) {
    const label = classifyMechanicalMessage(warning);
    const direction = parseDirectionFromMessage(warning);
    const frames = parseFramesFromMessage(warning);
    const duplicate = result.some((item) => item.label === label && item.direction === direction && intersects(item.frames, frames));
    if (!duplicate) {
      result.push(issue(preset.id, label, "polish", direction, frames, String(warning), "existing mechanical QA"));
    }
  }

  if (preset.motionRisk >= 3) {
    result.push(issue(preset.id, "action_structure_bad", "polish", "all", [1, 2, 3, 4, 5, 6, 7, 8], "High-structure action should be first in the multi-run stability retake queue even when the current sample passes structural QA.", "phase-a review"));
  }

  return result.map((item, index) => ({
    id: `${preset.id}-${String(index + 1).padStart(2, "0")}`,
    ...item
  }));
}

function buildScoreItem(preset, analysis, presetIssues) {
  const issueCounts = {
    blocker: presetIssues.filter((item) => item.severity === "blocker").length,
    major: presetIssues.filter((item) => item.severity === "major").length,
    minor: presetIssues.filter((item) => item.severity === "minor").length,
    polish: presetIssues.filter((item) => item.severity === "polish").length
  };
  const sheet = analysis.sheet;
  const minPadding = sheet?.summary.minFramePadding ?? 0;
  const maxCenterDrift = sheet?.summary.maxCenterDrift ?? 0;
  const maxBottomDrift = sheet?.summary.maxBottomDrift ?? 0;
  const maxHeightRatio = sheet?.summary.maxHeightRatio ?? 1;

  const scores = {
    identityStyle: 15 - (preset.identityRisk ?? 0) - scaleDriftDeduction(preset, maxHeightRatio),
    directionCorrectness: 15,
    motionReadability: 20 - (preset.motionRisk ?? 0),
    frameContinuity: 15 - centerDriftDeduction(preset, maxCenterDrift) - bottomDriftDeduction(preset, maxBottomDrift),
    cellSafety: 15 - (minPadding < 8 ? 6 : minPadding < 16 ? 4 : minPadding < 24 ? 2 : minPadding < 30 ? 1 : 0),
    transparencyCleanup: 10 - (analysis.transparency?.failures?.length > 0 ? 10 : 0),
    gameplayReadability: 10 - (preset.gameplayRisk ?? 0)
  };

  for (const key of Object.keys(scores)) {
    scores[key] = Math.max(0, scores[key]);
  }

  const totalScore = Object.values(scores).reduce((sum, value) => sum + value, 0)
    - issueCounts.blocker * 12
    - issueCounts.major * 5
    - Math.min(4, issueCounts.minor);
  const normalizedScore = Math.max(0, Math.round(totalScore));
  const hasBlockingIssue = issueCounts.blocker > 0 || issueCounts.major > 0;
  const decision = hasBlockingIssue || normalizedScore < 85
    ? "needs-retake"
    : normalizedScore >= 92 && preset.priorityWeight < 8
      ? "keep-current"
      : "needs-retake";

  return {
    presetId: preset.id,
    title: preset.title,
    titleJa: preset.titleJa,
    category: preset.category,
    focus: preset.focus,
    sourceJobId: analysis.mechanical.jobId ?? analysis.mechanical.sourceJobId ?? preset.sourceJobId,
    scoreBreakdown: scores,
    totalScore: normalizedScore,
    rating: normalizedScore >= 92 ? "excellent" : normalizedScore >= 85 ? "pass-with-retake-priority" : "retake-required",
    issueCounts,
    mechanicalBlockers: analysis.mechanicalErrors.length,
    promptStability: {
      status: "pending",
      acceptedRuns: 1,
      requiredRuns: 5,
      note: "Current sample is real generation evidence; prompt reproducibility is not proven until future multi-run loop."
    },
    decision,
    retakeReason: buildRetakeReason(preset, normalizedScore, issueCounts, analysis.sheet?.summary),
    replacementGate: "official replacement not performed in this branch"
  };
}

function buildRetakeReason(preset, score, issueCounts, summary) {
  if (issueCounts.blocker > 0 || issueCounts.major > 0) {
    return "blocking or major issue exists in phase-a audit";
  }
  if (score < 85) {
    return "score below 85 acceptance threshold";
  }
  if (preset.priorityWeight >= 8 && (summary?.minFramePadding ?? 999) < 24) {
    return "high-value/high-risk core action should get early multi-run stability retake; current sample also has padding polish below the preferred 24px contract";
  }
  if (preset.priorityWeight >= 8) {
    return "high-value/high-risk core action should get early multi-run stability retake";
  }
  if ((summary?.minFramePadding ?? 999) < 24) {
    return "current sample passes but has padding polish below the preferred 24px contract";
  }
  return "keep current for now; run stability gate after higher-risk presets";
}

function centerDriftSeverity(preset, drift) {
  if (["idle", "walk", "run", "cheer", "talk"].includes(preset.action)) {
    if (drift > 40) return "major";
    if (drift > 28) return "minor";
    if (drift > 20) return "polish";
    return null;
  }
  if (["death", "jump", "knockback"].includes(preset.action)) {
    if (drift > 112) return "major";
    if (drift > 88) return "minor";
    if (drift > 72) return "polish";
    return null;
  }
  if (drift > 96) return "major";
  if (drift > 72) return "minor";
  if (drift > 56) return "polish";
  return null;
}

function bottomDriftSeverity(preset, drift) {
  if (["idle", "walk", "run", "cheer", "talk"].includes(preset.action)) {
    if (drift > 28) return "major";
    if (drift > 16) return "minor";
    if (drift > 10) return "polish";
    return null;
  }
  if (["jump", "death", "knockback"].includes(preset.action)) {
    if (drift > 96) return "major";
    if (drift > 76) return "minor";
    if (drift > 56) return "polish";
    return null;
  }
  if (drift > 64) return "major";
  if (drift > 44) return "minor";
  if (drift > 28) return "polish";
  return null;
}

function scaleDriftSeverity(preset, ratio) {
  if (["death", "jump", "interact", "hurt", "knockback"].includes(preset.action)) {
    if (ratio > 2.2) return "minor";
    if (ratio > 1.7) return "polish";
    return null;
  }
  if (["attack", "ranged", "skill", "item", "guard"].includes(preset.action)) {
    if (ratio > 1.55) return "major";
    if (ratio > 1.35) return "minor";
    if (ratio > 1.2) return "polish";
    return null;
  }
  if (ratio > 1.3) return "major";
  if (ratio > 1.18) return "minor";
  if (ratio > 1.1) return "polish";
  return null;
}

function centerDriftDeduction(preset, drift) {
  const severity = centerDriftSeverity(preset, drift);
  return severity === "major" ? 4 : severity === "minor" ? 2 : severity === "polish" ? 1 : 0;
}

function bottomDriftDeduction(preset, drift) {
  const severity = bottomDriftSeverity(preset, drift);
  return severity === "major" ? 4 : severity === "minor" ? 2 : severity === "polish" ? 1 : 0;
}

function scaleDriftDeduction(preset, ratio) {
  const severity = scaleDriftSeverity(preset, ratio);
  return severity === "major" ? 3 : severity === "minor" ? 2 : severity === "polish" ? 1 : 0;
}

function analyzeSheet(samplePath) {
  const png = decodePngAlpha(samplePath);
  const expectedWidth = cellSize * frameCount;
  const expectedHeight = cellSize * directions.length;
  const frames = [];
  let alphaZeroCount = 0;
  for (const alpha of png.alpha) {
    if (alpha === 0) alphaZeroCount += 1;
  }

  for (const direction of directions) {
    for (let frame = 1; frame <= frameCount; frame += 1) {
      frames.push(analyzeCell(png, (frame - 1) * cellSize, (direction.row - 1) * cellSize, direction.id, frame));
    }
  }

  const rowSummaries = directions.map((direction) => {
    const rowFrames = frames.filter((frame) => frame.direction === direction.id);
    const centers = rowFrames.map((frame) => frame.centerX);
    const bottoms = rowFrames.map((frame) => frame.bottom);
    const heights = rowFrames.map((frame) => Math.max(1, frame.height));
    const widths = rowFrames.map((frame) => Math.max(1, frame.width));
    const minHeight = Math.min(...heights);
    const maxHeight = Math.max(...heights);
    const minWidth = Math.min(...widths);
    const maxWidth = Math.max(...widths);
    return {
      direction: direction.id,
      minPadding: Math.min(...rowFrames.map((frame) => frame.minPadding)),
      minTopMargin: Math.min(...rowFrames.map((frame) => frame.margins.top)),
      minBottomMargin: Math.min(...rowFrames.map((frame) => frame.margins.bottom)),
      centerDrift: Math.round(Math.max(...centers) - Math.min(...centers)),
      bottomDrift: Math.round(Math.max(...bottoms) - Math.min(...bottoms)),
      heightRatio: round(maxHeight / minHeight, 3),
      widthRatio: round(maxWidth / minWidth, 3),
      maxDetachedComponents: Math.max(...rowFrames.map((frame) => frame.detachedComponents)),
      frames: rowFrames.map((frame) => ({
        frame: frame.frame,
        margins: frame.margins,
        minPadding: frame.minPadding,
        centerX: round(frame.centerX, 1),
        bottom: frame.bottom,
        width: frame.width,
        height: frame.height,
        detachedComponents: frame.detachedComponents
      }))
    };
  });

  return {
    width: png.width,
    height: png.height,
    alphaZeroRatio: round(alphaZeroCount / png.alpha.length, 6),
    frameCount: frames.length,
    expectedSize: [expectedWidth, expectedHeight],
    sizeMatchesContract: png.width === expectedWidth && png.height === expectedHeight,
    summary: {
      minFramePadding: Math.min(...frames.map((frame) => frame.minPadding)),
      maxCenterDrift: Math.max(...rowSummaries.map((row) => row.centerDrift)),
      maxBottomDrift: Math.max(...rowSummaries.map((row) => row.bottomDrift)),
      maxHeightRatio: Math.max(...rowSummaries.map((row) => row.heightRatio)),
      maxWidthRatio: Math.max(...rowSummaries.map((row) => row.widthRatio)),
      maxDetachedComponents: Math.max(...rowSummaries.map((row) => row.maxDetachedComponents)),
      framesBelow16pxPadding: frames.filter((frame) => frame.minPadding < 16).length,
      framesBelow24pxPadding: frames.filter((frame) => frame.minPadding < 24).length
    },
    rowSummaries
  };
}

function analyzeCell(png, x0, y0, direction, frame) {
  const threshold = 8;
  let minX = cellSize;
  let minY = cellSize;
  let maxX = -1;
  let maxY = -1;
  let pixels = 0;

  for (let y = 0; y < cellSize; y += 1) {
    const sourceY = y0 + y;
    for (let x = 0; x < cellSize; x += 1) {
      const sourceX = x0 + x;
      const alpha = png.alpha[sourceY * png.width + sourceX];
      if (alpha > threshold) {
        pixels += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (pixels === 0) {
    return {
      direction,
      frame,
      empty: true,
      margins: { left: 0, top: 0, right: 0, bottom: 0 },
      minPadding: 0,
      centerX: 0,
      bottom: 0,
      width: 0,
      height: 0,
      detachedComponents: 0
    };
  }

  const components = countComponents(png, x0, y0, threshold);
  const significantComponents = components.filter((component) => component.area >= 96);
  return {
    direction,
    frame,
    empty: false,
    margins: {
      left: minX,
      top: minY,
      right: cellSize - 1 - maxX,
      bottom: cellSize - 1 - maxY
    },
    minPadding: Math.min(minX, minY, cellSize - 1 - maxX, cellSize - 1 - maxY),
    centerX: (minX + maxX) / 2,
    bottom: maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    pixels,
    detachedComponents: Math.max(0, significantComponents.length - 1)
  };
}

function countComponents(png, x0, y0, threshold) {
  const visited = new Uint8Array(cellSize * cellSize);
  const queue = new Int32Array(cellSize * cellSize);
  const components = [];

  for (let y = 0; y < cellSize; y += 1) {
    for (let x = 0; x < cellSize; x += 1) {
      const localIndex = y * cellSize + x;
      if (visited[localIndex] || png.alpha[(y0 + y) * png.width + x0 + x] <= threshold) {
        continue;
      }
      let head = 0;
      let tail = 0;
      let area = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      visited[localIndex] = 1;
      queue[tail++] = localIndex;
      while (head < tail) {
        const current = queue[head++];
        const cx = current % cellSize;
        const cy = Math.floor(current / cellSize);
        area += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        const neighbors = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1]
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= cellSize || ny < 0 || ny >= cellSize) {
            continue;
          }
          const nextIndex = ny * cellSize + nx;
          if (visited[nextIndex]) {
            continue;
          }
          if (png.alpha[(y0 + ny) * png.width + x0 + nx] <= threshold) {
            continue;
          }
          visited[nextIndex] = 1;
          queue[tail++] = nextIndex;
        }
      }
      components.push({ area, box: [minX, minY, maxX, maxY] });
    }
  }

  return components.sort((a, b) => b.area - a.area);
}

function decodePngAlpha(filePath) {
  const buffer = readFileSync(filePath);
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    throw new Error(`${filePath} is not a PNG`);
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  let palette = null;
  let transparency = null;

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    offset += 4;
    const type = buffer.subarray(offset, offset + 4).toString("ascii");
    offset += 4;
    const chunk = buffer.subarray(offset, offset + length);
    offset += length + 4;
    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
      interlace = chunk[12];
    } else if (type === "PLTE") {
      palette = chunk;
    } else if (type === "tRNS") {
      transparency = chunk;
    } else if (type === "IDAT") {
      idat.push(chunk);
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8) {
    throw new Error(`${filePath} uses unsupported PNG bit depth ${bitDepth}`);
  }
  if (interlace !== 0) {
    throw new Error(`${filePath} uses unsupported interlaced PNG`);
  }

  const samples = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!samples) {
    throw new Error(`${filePath} uses unsupported PNG color type ${colorType}`);
  }

  const inflated = inflateSync(Buffer.concat(idat));
  const rowBytes = width * samples;
  const alpha = new Uint8Array(width * height);
  const previous = Buffer.alloc(rowBytes);
  const current = Buffer.alloc(rowBytes);
  let source = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[source++];
    const raw = inflated.subarray(source, source + rowBytes);
    source += rowBytes;
    for (let i = 0; i < rowBytes; i += 1) {
      const left = i >= samples ? current[i - samples] : 0;
      const up = previous[i];
      const upLeft = i >= samples ? previous[i - samples] : 0;
      let value = raw[i];
      if (filter === 1) {
        value = (value + left) & 255;
      } else if (filter === 2) {
        value = (value + up) & 255;
      } else if (filter === 3) {
        value = (value + Math.floor((left + up) / 2)) & 255;
      } else if (filter === 4) {
        value = (value + paeth(left, up, upLeft)) & 255;
      } else if (filter !== 0) {
        throw new Error(`${filePath} uses unsupported PNG filter ${filter}`);
      }
      current[i] = value;
    }

    for (let x = 0; x < width; x += 1) {
      const pixel = x * samples;
      if (colorType === 6) {
        alpha[y * width + x] = current[pixel + 3];
      } else if (colorType === 4) {
        alpha[y * width + x] = current[pixel + 1];
      } else if (colorType === 3) {
        const paletteIndex = current[pixel];
        if (palette && transparency) {
          alpha[y * width + x] = transparency[paletteIndex] ?? 255;
        } else {
          alpha[y * width + x] = 255;
        }
      } else {
        alpha[y * width + x] = 255;
      }
    }
    previous.set(current);
  }

  return { width, height, alpha };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function issue(presetId, label, severity, direction, frames, evidence, source) {
  return {
    presetId,
    label,
    severity,
    direction,
    frames,
    evidence,
    source,
    adoptionImpact: severity === "blocker" ? "official adoption blocked" : severity === "major" ? "retake before replacement" : "retake or polish candidate"
  };
}

function classifyMechanicalMessage(message) {
  const text = String(message).toLowerCase();
  if (text.includes("transparent") || text.includes("alpha") || text.includes("background")) return "alpha_residue";
  if (text.includes("padding") || text.includes("edge")) return "edge_contact";
  if (text.includes("drift") || text.includes("center") || text.includes("anchor")) return "anchor_drift";
  if (text.includes("scale") || text.includes("size")) return "scale_drift";
  if (text.includes("crop") || text.includes("cut")) return "cropped_body";
  return "frame_pop";
}

function parseDirectionFromMessage(message) {
  const match = String(message).match(/row\s+(\d+)/i);
  if (!match) return "all";
  const row = Number(match[1]);
  return directions[row - 1]?.id ?? "all";
}

function parseFramesFromMessage(message) {
  const match = String(message).match(/frame\s+(\d+)/i);
  return match ? [Number(match[1])] : [];
}

function renderIndex(items, scores, retakes) {
  const passing = scores.filter((item) => item.totalScore >= 85 && item.issueCounts.blocker === 0).length;
  const blockerCount = scores.reduce((sum, item) => sum + item.issueCounts.blocker, 0);
  const majorCount = scores.reduce((sum, item) => sum + item.issueCounts.major, 0);
  const activeRetakes = retakes.filter((item) => item.decision === "needs-retake");
  return `# Core Animation Quality Uplift - Phase A Audit

Generated: ${generatedAt}

This folder is the first quality uplift loop for the 16 official core animation presets. It does not replace official sample PNG/GIF files, prompt contracts in \`src/App.tsx\`, or the Animation selection modal.

## Summary

- Presets inventoried: ${items.length}
- Current official sample replacements in this branch: 0
- Scores >= 85 with no blocker: ${passing} / ${scores.length}
- Blocker issues: ${blockerCount}
- Major issues: ${majorCount}
- Prompt stability gate: pending for every preset. Current samples are real generations, but this phase did not run the required 5-attempt stability loop.

## Generated Files

- \`core-animation-inventory.json\`
- \`core-animation-issues.json\`
- \`issues-by-preset.md\`
- \`core-animation-scorecard.json\`
- \`scorecard.md\`
- \`retake-log.json\`
- \`before-after-gallery.html\`
- \`visual-review.md\`
- \`prompts/<preset-id>.md\`

## Retake Priority

| rank | preset | score | decision | reason |
| ---: | --- | ---: | --- | --- |
${activeRetakes.slice(0, 8).map((item, index) => `| ${index + 1} | \`${item.presetId}\` | ${scores.find((score) => score.presetId === item.presetId)?.totalScore ?? ""} | ${item.decision} | ${item.reason} |`).join("\n")}

## Gate

This is confirmation-gated work. Future changes that replace \`public/samples/*-sheet.png\`, official prompt contracts, or the UI-selected official animation assets must return to ご主人 before main merge.
`;
}

function renderIssuesByPreset(scores, issueItems) {
  const sections = scores.map((score) => {
    const presetIssues = issueItems.filter((issueItem) => issueItem.presetId === score.presetId);
    const rows = presetIssues.length === 0
      ? "| none | - | - | - | No issue labels from phase-a audit. |\n"
      : presetIssues.map((issueItem) => `| ${issueItem.severity} | ${issueItem.label} | ${issueItem.direction} | ${issueItem.frames.length > 0 ? issueItem.frames.join(", ") : "all"} | ${escapePipes(issueItem.evidence)} |`).join("\n");
    return `## ${score.title} (\`${score.presetId}\`)

Score: ${score.totalScore} / 100

Decision: ${score.decision}

| severity | label | direction | frames | evidence |
| --- | --- | --- | --- | --- |
${rows}
`;
  });
  return `# Core Animation Issues By Preset

Generated: ${generatedAt}

Severity follows the 018 handoff: blocker, major, minor, polish.

${sections.join("\n").trimEnd()}
`;
}

function renderScorecard(scores) {
  return `# Core Animation Scorecard

Generated: ${generatedAt}

Scores are phase-a current-sample scores. The prompt stability gate is still pending, so a high current score is not the same as a fully stable prompt contract.

| preset | category | score | rating | blockers | majors | decision |
| --- | --- | ---: | --- | ---: | ---: | --- |
${scores.map((item) => `| \`${item.presetId}\` | ${item.category} | ${item.totalScore} | ${item.rating} | ${item.issueCounts.blocker} | ${item.issueCounts.major} | ${item.decision} |`).join("\n")}

## Criteria

| criterion | max |
| --- | ---: |
${scoringCriteria.map((criterion) => `| ${criterion.label} | ${criterion.max} |`).join("\n")}
`;
}

function renderVisualReview(scores, issueItems) {
  return `# Core Animation Visual Review

Generated: ${generatedAt}

This phase builds a review surface from the existing real-generation official assets. It does not include new retake generations.

## Review Method

- Checked required official sample sheets and QA folders for all 16 presets.
- Re-read existing mechanical QA and transparency audit.
- Decoded each \`public/samples/*-sheet.png\` to measure alpha, frame bbox, padding, center drift, bottom anchor drift, and scale drift.
- Built \`before-after-gallery.html\` for side-by-side future retake comparison. In Phase A the after column is intentionally pending.

## Findings

| preset | score | visual review status | next action |
| --- | ---: | --- | --- |
${scores.map((score) => {
    const count = issueItems.filter((issueItem) => issueItem.presetId === score.presetId).length;
    return `| \`${score.presetId}\` | ${score.totalScore} | ${count} label(s), blockers ${score.issueCounts.blocker}, majors ${score.issueCounts.major} | ${score.retakeReason} |`;
  }).join("\n")}

## Human Review Checklist

- Open \`before-after-gallery.html\`.
- Watch five GIFs per preset at normal size.
- Check the sheet at 1x / 2x / 4x.
- For loops, compare frame 8 back to frame 1.
- For non-loops, confirm anticipation, impact or peak, follow-through, and recovery.
- Before any official replacement, add the retake candidate and rerun this script so the scorecard and gallery show both current and candidate assets.
`;
}

function renderGallery(scores) {
  const cards = scores.map((score) => {
    const sample = `../../../public/samples/${score.presetId}-sheet.png`;
    const qaBase = `../official-${score.presetId}`;
    const gifs = directions.map((direction) => `
          <figure>
            <img src="${qaBase}/${score.presetId}-${direction.id}.gif" alt="${score.presetId} ${direction.id} preview">
            <figcaption>${direction.label}</figcaption>
          </figure>`).join("");
    return `
      <section class="card">
        <header>
          <h2>${score.title} <code>${score.presetId}</code></h2>
          <p>Score ${score.totalScore}/100 · ${score.rating} · ${score.decision}</p>
        </header>
        <div class="comparison">
          <div>
            <h3>Current official</h3>
            <img class="sheet" src="${sample}" alt="${score.presetId} current official sheet">
          </div>
          <div>
            <h3>Retake candidate</h3>
            <div class="pending">Pending future real generation</div>
          </div>
        </div>
        <div class="gifs">${gifs}</div>
      </section>`;
  }).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Core Animation Quality Uplift Gallery</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #f6f7f9; color: #17191f; }
    header.page { padding: 24px; background: #20242d; color: white; }
    main { display: grid; gap: 18px; padding: 18px; }
    .card { background: white; border: 1px solid #d7dbe3; border-radius: 8px; padding: 16px; }
    h1, h2, h3, p { margin: 0; }
    h2 { font-size: 20px; margin-bottom: 6px; }
    h3 { font-size: 14px; margin-bottom: 8px; }
    code { font-size: 0.85em; }
    .comparison { display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 0.45fr); gap: 12px; margin-top: 12px; }
    .sheet { width: 100%; image-rendering: pixelated; background: repeating-conic-gradient(#e9ecf2 0% 25%, #ffffff 0% 50%) 50% / 24px 24px; border: 1px solid #d7dbe3; }
    .pending { min-height: 160px; display: grid; place-items: center; border: 1px dashed #aab1bf; color: #5a6270; background: #fafbfc; }
    .gifs { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); gap: 10px; margin-top: 12px; }
    figure { margin: 0; border: 1px solid #d7dbe3; padding: 8px; background: #fbfcfd; }
    figure img { width: 100%; image-rendering: pixelated; background: repeating-conic-gradient(#e9ecf2 0% 25%, #ffffff 0% 50%) 50% / 16px 16px; }
    figcaption { font-size: 12px; color: #4b5260; margin-top: 4px; }
    @media (max-width: 760px) { .comparison { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header class="page">
    <h1>Core Animation Quality Uplift Gallery</h1>
    <p>Phase A baseline review. Retake candidates are pending future real generation.</p>
  </header>
  <main>${cards}
  </main>
</body>
</html>
`;
}

function renderPromptContract(preset, score, presetIssues) {
  const issueList = presetIssues.length > 0
    ? presetIssues.map((item) => `- ${item.severity} / ${item.label} / ${item.direction} / frames ${item.frames.length > 0 ? item.frames.join(", ") : "all"}: ${item.evidence}`).join("\n")
    : "- No phase-a issue labels.";
  return `# ${preset.title} Prompt Contract

Generated: ${generatedAt}

Status: Phase A proposal. No official sample replacement has been performed.

## Current Official Source

- Preset id: \`${preset.id}\`
- Current sample: \`public/samples/${preset.id}-sheet.png\`
- QA folder: \`docs/qa/official-${preset.id}/\`
- Source job / evidence id: \`${preset.sourceJobId}\`
- Current score: ${score.totalScore} / 100
- Decision: ${score.decision}

## Uplift Prompt Contract

${preset.currentPrompt}

Frame plan: ${preset.framePlan}.

Sheet contract: 5 direction rows x 8 frame columns, exactly 256 x 256 px per cell, final sheet 2048 x 1280 px. Direction rows are front, front-three-quarter, side, back-three-quarter, back.

Direction contract: front faces camera; front-three-quarter is diagonal-front; side is strict profile; back-three-quarter is diagonal-back; back is true straight rear view with no eyes, nose, mouth, cheek, or looking-over-shoulder pose.

Cell contract: keep the full head, hair silhouette, hands, props, effects, and both feet inside each cell with 24 px padding whenever possible. Keep feet on a stable visual ground line and keep the character centered across frames.

Effect / prop contract: projectiles, shields, weapons, hand items, and magic effects must stay compact and inside their own cell. They must not hide the face, torso, feet, or action silhouette.

Negative constraints: no cropped head, missing feet, duplicated heads, body fragments, non-flat background, opaque background, guide residue, cell bleed, identity drift, direction mismatch, gore, readable text, UI symbols, labels, speech bubbles, or oversized effects.

## Phase A Issues

${issueList}

## Future Retake Fields

- Seed: TBD by real generation job.
- Job id: TBD.
- Outbox path: TBD.
- Direction manifest: TBD.
- Raw direction PNG x5: TBD.
- Candidate sheet: TBD.
- Candidate QA: TBD.
- Before / after result: TBD.
- Adoption decision: not run in Phase A.

Official replacement remains gated by ご主人 confirmation before main merge.
`;
}

function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function fileRecord(filePath) {
  const exists = existsSync(filePath);
  return {
    exists,
    path: toRepoPath(filePath),
    bytes: exists ? statSync(filePath).size : 0
  };
}

function dirRecord(dirPath) {
  const exists = existsSync(dirPath);
  return {
    exists,
    path: toRepoPath(dirPath),
    files: exists ? readdirSync(dirPath).length : 0
  };
}

function writeJson(name, value) {
  writeFileSync(path.join(outDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeMarkdown(name, value) {
  writeFileSync(path.join(outDir, name), value, "utf8");
}

function writeHtml(name, value) {
  writeFileSync(path.join(outDir, name), value, "utf8");
}

function toRepoPath(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function escapePipes(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function intersects(a, b) {
  if (a.length === 0 || b.length === 0) return false;
  return a.some((value) => b.includes(value));
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
