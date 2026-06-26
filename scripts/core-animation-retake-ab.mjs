import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";
import gifenc from "gifenc";

const { GIFEncoder, applyPalette, quantize } = gifenc;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const outRoot = path.join(repoRoot, "docs", "qa", "core-animation-quality-uplift");
const retakeRoot = path.join(outRoot, "retakes");
const generatedAt = "2026-06-27T02:14:00+09:00";
const cellSize = 256;
const frameCount = 8;
const sheetWidth = cellSize * frameCount;
const sheetHeight = cellSize * 5;
const chroma = [255, 0, 255, 255];

const directions = [
  { id: "front", label: "front", row: 1 },
  { id: "front-three-quarter", label: "front three-quarter", row: 2 },
  { id: "side", label: "side", row: 3 },
  { id: "back-three-quarter", label: "back three-quarter", row: 4 },
  { id: "back", label: "back", row: 5 }
];

const candidates = [
  {
    presetId: "jump-hop",
    title: "Jump / Hop",
    candidateId: "candidate-001",
    sourceJobId: "codex-job-2026-06-25T21-33-50-977Z",
    currentSheet: "public/samples/jump-hop-sheet.png",
    rawSheet: "docs/qa/core-animation-quality-uplift/retakes/jump-hop/candidate-001/source/imagegen-raw-sheet.png",
    sourceReference: "docs/qa/core-animation-quality-uplift/retakes/jump-hop/candidate-001/source/source-reference.png",
    imagegenPrompt: `Create a production-quality pixel-art game sprite sheet candidate for the same girl adventurer character shown in the provided source reference. Use the current jump/hop sheet only as a structural baseline to improve, not as a tracing target.

Animation: jump / hop loop, 8 frames per direction, 5 directions. The motion should read clearly: anticipation crouch, upward lift, apex hang, descent, landing squash, recover. Improve the current baseline by keeping the character scale more consistent between frames, leaving safe padding at the jump apex, and avoiding feet/hair/weapon cropping.

Canvas and grid contract: one single rectangular sprite sheet, exact layout 2048x1280 if possible, 8 columns x 5 rows, each cell 256x256. Rows top-to-bottom: front, front-right diagonal, right side, back-right diagonal, back. Columns left-to-right: frames 1 through 8. Do not draw grid lines, labels, numbers, UI, captions, borders, or watermarks.

Character identity: keep the same young adventurer girl: brown ponytail with red ribbon, green cape, cream blouse, blue skirt, brown boots, small sword/dagger. Pixel art style should match a polished JRPG sprite, crisp edges, readable silhouette, no photorealism.

Background: solid chroma key magenta #ff00ff behind every sprite, completely flat and uniform. No shadows, effects, gradients, transparency, outlines outside the sprite, or colored floor marks.

Quality requirements: every frame must be centered inside its 256x256 cell, no cropped body parts, consistent proportions across all frames, five directions must be distinct and coherent, and the back rows must show the cape and ponytail from behind. This is an AB-test candidate; prioritize clean animation readability over extra decoration.`,
    abDecision: {
      outcome: "hold-current-candidate-needs-rework",
      officialReplacement: false,
      summary: "Candidate B has nice visual consistency, but AB fails the sheet-safety bar: the raw canvas was the wrong size and the normalized sheet has multiple frames touching cell edges. Keep current A and rework before any replacement review.",
      wins: [
        "The midair poses are visually clean and keep the source character identity.",
        "Less extreme frame-to-frame size change than the current official sheet.",
        "All five directions remain readable and keep the source character identity."
      ],
      risks: [
        "The generated raw canvas was 1586x992, not the requested 2048x1280.",
        "The raw background was magenta with mild gradient noise, so cleanup was required.",
        "After normalization, many frames have below-16px padding and some touch the cell edge.",
        "The current official sheet still has a stronger squash/landing accent in some views."
      ]
    },
    promptExperiment: {
      status: "not-adopted-useful-learning",
      baselinePromptAssessment: "The current jump/hop prompt remains a better official prompt for now because the generated candidate did not preserve sheet safety.",
      changeIntent: [
        "Improve scale consistency between frames.",
        "Create safer top padding at the jump apex.",
        "Keep all five directions readable while preserving the girl adventurer identity."
      ],
      successLog: [
        "The candidate preserved character identity and produced readable midair poses.",
        "The candidate reduced some extreme frame-to-frame size changes.",
        "Direction rows stayed coherent enough to inspect as an animation idea."
      ],
      failureLog: [
        "The image model returned 1586x992 instead of the requested 2048x1280 contract.",
        "The raw magenta background had gradient/noise and required cleanup.",
        "After normalization, many frames touched cell edges or fell below the 16px safety padding target.",
        "The landing squash was not clearly better than the current official sample."
      ],
      nextPromptNotes: [
        "Ask for a smaller sprite inside each cell, with an explicit 24px empty safe border.",
        "Prefer 'do not let hair, weapon, boots, cape, or effects enter the outer 24px of any cell' over generic 'safe padding'.",
        "State that exact canvas/grid compliance is more important than adding visual polish.",
        "Keep the current prompt as baseline until a candidate passes mechanical padding and edge checks."
      ]
    }
  },
  {
    presetId: "basic-attack",
    title: "Basic Attack",
    candidateId: "candidate-001",
    sourceJobId: "codex-job-2026-06-25T21-02-07-575Z",
    currentSheet: "public/samples/basic-attack-sheet.png",
    rawSheet: "docs/qa/core-animation-quality-uplift/retakes/basic-attack/candidate-001/source/imagegen-raw-sheet.png",
    sourceReference: "docs/qa/core-animation-quality-uplift/retakes/basic-attack/candidate-001/source/source-reference.png",
    imagegenPrompt: `Create a production-quality pixel-art game sprite sheet candidate for the same young male hero character shown in the provided source reference. Use the current basic attack sheet only as an AB baseline to improve; do not simply copy it.

Animation: basic sword attack loop, 8 frames per direction, 5 directions. The motion should read clearly as: ready stance, wind-up, slash start, slash follow-through, impact accent, recovery, return to idle. Improve the baseline by keeping the body scale and head size consistent, keeping the sword attached to the hand, avoiding stretched arms, and keeping slash effects clean but not oversized.

Canvas and grid contract: one single rectangular sprite sheet, exact layout 2048x1280 if possible, 8 columns x 5 rows, each cell 256x256. Rows top-to-bottom: front, front-right diagonal, right side, back-right diagonal, back. Columns left-to-right: frames 1 through 8. Do not draw grid lines, labels, numbers, UI, captions, borders, or watermarks.

Character identity: keep the same anime JRPG young male hero: brown spiky hair, blue scarf and blue tunic, white trousers, brown boots and gloves, silver shoulder armor, blue cape, sword. Pixel-art style should match a polished JRPG sprite, crisp edges, readable silhouette, no photorealism.

Background: solid chroma key magenta #ff00ff behind every sprite, completely flat and uniform. No shadows, floor marks, gradients, transparency, UI, or decorative background.

Quality requirements: every frame must be centered inside its 256x256 cell, no cropped sword/body/cape, consistent proportions across all frames, five directions must be distinct and coherent, and attack effects should stay within the cell with at least 12 px safe padding. This is an AB-test candidate; prioritize body consistency and animation readability over flashy effects.`,
    abDecision: {
      outcome: "hold-current-candidate-needs-rework",
      officialReplacement: false,
      summary: "Candidate B improves body/sword consistency, but AB does not clear the mechanical bar because several frames touch cell edges after normalization. Keep current A for now and rework B with stricter padding.",
      wins: [
        "Body scale and head size stay steadier across attack frames.",
        "Sword remains more consistently attached to the hand.",
        "Slash effects are less oversized than the current official sheet."
      ],
      risks: [
        "The generated raw canvas was 1586x992, not the requested 2048x1280.",
        "The raw background needed magenta flood-fill cleanup.",
        "After normalization, more frames fall below the 16px safety padding target than the current official sheet.",
        "The current official sheet has a punchier hit effect, so gameplay readability should be judged in motion."
      ]
    },
    promptExperiment: {
      status: "not-adopted-useful-learning",
      baselinePromptAssessment: "The current basic attack prompt remains the official baseline; the retake showed useful body/sword wording but failed padding safety.",
      changeIntent: [
        "Improve body scale and head size consistency.",
        "Keep the sword visibly attached to the hand throughout the slash.",
        "Reduce oversized slash effects without losing the attack read."
      ],
      successLog: [
        "The candidate improved body and sword relationship in several frames.",
        "Effects were more contained than the current official sheet.",
        "The five direction rows remained readable enough for motion review."
      ],
      failureLog: [
        "The image model returned 1586x992 instead of the requested 2048x1280 contract.",
        "The raw background needed magenta flood-fill cleanup.",
        "The normalized candidate produced more below-16px padding frames than current A.",
        "The current official sheet still has a stronger hit accent for gameplay readability."
      ],
      nextPromptNotes: [
        "Keep the body/sword consistency wording.",
        "Add a hard inner-frame rule: all body, sword, cape, and effects must stay inside a 208x208 safe area centered in each 256x256 cell.",
        "Constrain attack flashes to short-lived compact accents and forbid full-cell sweeps.",
        "Do not adopt a prompt update unless it beats current A on padding and visible hit timing together."
      ]
    }
  },
  {
    presetId: "ranged-attack",
    title: "Ranged Attack",
    candidateId: "candidate-001",
    sourceJobId: "codex-job-2026-06-26T04-20-29-885Z",
    currentSheet: "public/samples/ranged-attack-sheet.png",
    rawSheet: "docs/qa/core-animation-quality-uplift/retakes/ranged-attack/candidate-001/source/imagegen-raw-sheet.png",
    sourceReference: "docs/qa/core-animation-quality-uplift/retakes/ranged-attack/candidate-001/source/source-reference.png",
    imagegenPrompt: `Create a production-quality pixel-art game sprite sheet candidate for the same androgynous traveler / ranged attacker character shown in the provided source reference. Use the current ranged attack sheet only as an AB baseline to improve; do not simply copy it.

Animation: ranged attack loop with a small hand crossbow or compact magical launcher, 8 frames per direction, 5 directions. The motion should read clearly as: idle ready, raise/aim, aim hold, fire flash/projectile start, recoil, lower weapon, recover, return to idle. Improve the baseline only if possible by keeping the character identity and proportions extremely consistent, keeping the weapon connected to the hands, and making the firing moment clearer without big distracting effects.

Canvas and grid contract: one single rectangular sprite sheet, exact layout 2048x1280 if possible, 8 columns x 5 rows, each cell 256x256. Rows top-to-bottom: front, front-right diagonal, right side, back-right diagonal, back. Columns left-to-right: frames 1 through 8. Do not draw grid lines, labels, numbers, UI, captions, borders, or watermarks.

Character identity: keep the same traveler: short dark gray hair, soft androgynous face, tan-beige long coat with worn hem, dark scarf, brown backpack, belt pouches, brown boots, muted practical fantasy palette. Pixel-art style should match a polished JRPG sprite, crisp edges, readable silhouette, no photorealism.

Background: solid chroma key magenta #ff00ff behind every sprite, completely flat and uniform. No shadows, floor marks, gradients, transparency, UI, or decorative background.

Quality requirements: every frame must be centered inside its 256x256 cell, no cropped hands/weapon/projectile/backpack, consistent proportions across all frames, five directions must be distinct and coherent, and firing spark/projectile should remain small and inside the cell with safe padding. This is an AB-test candidate; if improvements conflict with character fidelity, prioritize fidelity and clean layout.`,
    abDecision: {
      outcome: "reject-candidate-keep-current",
      officialReplacement: false,
      summary: "Candidate B is mechanically usable after cleanup, but it does not beat the current official ranged sheet on character fidelity or attack readability. Keep current.",
      wins: [
        "Candidate B has tidy spacing and a readable projectile moment.",
        "The five direction rows remain coherent after normalization."
      ],
      risks: [
        "The candidate simplifies the traveler silhouette and loses some of the official sheet's source-character fidelity.",
        "The firing motion has less pose contrast than the current official sheet.",
        "The generated raw canvas and background both needed normalization, with no clear quality win to justify replacement."
      ]
    },
    promptExperiment: {
      status: "not-adopted-rejected",
      baselinePromptAssessment: "The current ranged attack prompt is stronger. The retake prompt made a cleaner but less faithful and less dynamic candidate.",
      changeIntent: [
        "Preserve the traveler identity while clarifying the firing moment.",
        "Keep the projectile small and inside the cell.",
        "Improve weapon/hand connection without distracting effects."
      ],
      successLog: [
        "The candidate kept a tidy projectile moment.",
        "Direction rows stayed coherent after normalization.",
        "The small-effect instruction prevented oversized visual noise."
      ],
      failureLog: [
        "The candidate simplified the traveler silhouette and lost source-character fidelity.",
        "The firing motion had less pose contrast than the current official sheet.",
        "The raw image again missed the exact 2048x1280 sheet contract.",
        "There was no quality win large enough to justify replacing the current prompt."
      ],
      nextPromptNotes: [
        "Keep current ranged prompt unless future tests can preserve the backpack, coat silhouette, and pose contrast.",
        "Add stronger source-fidelity wording before asking for cleaner projectile timing.",
        "Require a clear aim-fire-recoil-return sequence with visible shoulder/arm change, not only a projectile flash.",
        "Reject cleaner-looking candidates that reduce character identity."
      ]
    }
  }
];

main();

function main() {
  mkdirSync(retakeRoot, { recursive: true });
  const results = candidates.map(processCandidate);
  writeJson(path.join(retakeRoot, "phase-b-ab-summary.json"), {
    generatedAt,
    phase: "B",
    officialReplacement: false,
    note: "Generated retake candidates were AB-reviewed against current official samples. No public sample, prompt contract, or UI adoption path was replaced.",
    results
  });
  writeJson(path.join(retakeRoot, "phase-b-prompt-experiment-log.json"), buildPromptExperimentLog(results));
  writeFileSync(path.join(retakeRoot, "phase-b-ab-summary.md"), buildSummaryMarkdown(results), "utf8");
  writeFileSync(path.join(retakeRoot, "phase-b-ab-gallery.html"), buildGalleryHtml(results), "utf8");
  updateRetakeLog(results);
  console.log(`Core animation retake AB artifacts written for ${results.length} candidates.`);
}

function processCandidate(candidate) {
  const candidateDir = path.join(retakeRoot, candidate.presetId, candidate.candidateId);
  const outputs = {
    candidateDir,
    normalizedChroma: path.join(candidateDir, `${candidate.presetId}-${candidate.candidateId}-sheet-chroma.png`),
    transparentSheet: path.join(candidateDir, `${candidate.presetId}-${candidate.candidateId}-sheet.png`),
    gridQa: path.join(candidateDir, `${candidate.presetId}-${candidate.candidateId}-grid-qa.png`),
    transparentContact: path.join(candidateDir, `${candidate.presetId}-${candidate.candidateId}-transparent-contact.png`),
    mechanicalQa: path.join(candidateDir, `${candidate.presetId}-${candidate.candidateId}-mechanical-qa.json`),
    manifest: path.join(candidateDir, `${candidate.presetId}-${candidate.candidateId}-manifest.json`),
    prompt: path.join(candidateDir, `${candidate.presetId}-${candidate.candidateId}-prompt.md`),
    promptExperiment: path.join(candidateDir, `${candidate.presetId}-${candidate.candidateId}-prompt-experiment.json`),
    review: path.join(candidateDir, `${candidate.presetId}-${candidate.candidateId}-ab-review.md`),
    directionsDir: path.join(candidateDir, "directions"),
    chromaDirectionsDir: path.join(candidateDir, "directions-chroma"),
    gifsDir: path.join(candidateDir, "gifs")
  };

  mkdirSync(outputs.directionsDir, { recursive: true });
  mkdirSync(outputs.chromaDirectionsDir, { recursive: true });
  mkdirSync(outputs.gifsDir, { recursive: true });

  const rawPath = path.join(repoRoot, candidate.rawSheet);
  const currentPath = path.join(repoRoot, candidate.currentSheet);
  assertFile(rawPath);
  assertFile(currentPath);

  const raw = decodePng(rawPath);
  const resized = resizeNearest(raw, sheetWidth, sheetHeight);
  const cleaned = cleanupMagentaBackground(resized);
  writePng(outputs.normalizedChroma, cleaned.chromaImage);
  writePng(outputs.transparentSheet, cleaned.transparentImage);

  const candidateAnalysis = analyzeSheet(cleaned.transparentImage);
  const currentAnalysis = analyzeSheet(decodePng(currentPath));
  const directionRecords = [];
  const gifRecords = [];

  for (const direction of directions) {
    const rowY = (direction.row - 1) * cellSize;
    const transparentRow = crop(cleaned.transparentImage, 0, rowY, sheetWidth, cellSize);
    const chromaRow = crop(cleaned.chromaImage, 0, rowY, sheetWidth, cellSize);
    const transparentPath = path.join(outputs.directionsDir, `${candidate.presetId}-${candidate.candidateId}-${direction.id}.png`);
    const chromaPath = path.join(outputs.chromaDirectionsDir, `${candidate.presetId}-${candidate.candidateId}-${direction.id}-chroma.png`);
    const gifPath = path.join(outputs.gifsDir, `${candidate.presetId}-${candidate.candidateId}-${direction.id}.gif`);
    writePng(transparentPath, transparentRow);
    writePng(chromaPath, chromaRow);
    writeGif(gifPath, cleaned.transparentImage, direction.row);
    directionRecords.push({
      direction: direction.id,
      transparentPath: rel(transparentPath),
      chromaPath: rel(chromaPath)
    });
    gifRecords.push({
      direction: direction.id,
      path: rel(gifPath)
    });
  }

  writePng(outputs.gridQa, makeGridQa(cleaned.transparentImage));
  writePng(outputs.transparentContact, makeTransparentContact(cleaned.transparentImage, candidateAnalysis));

  const comparison = compareMechanical(currentAnalysis, candidateAnalysis);
  const result = {
    presetId: candidate.presetId,
    title: candidate.title,
    candidateId: candidate.candidateId,
    generatedAt,
    sourceJobId: candidate.sourceJobId,
    rawInput: {
      path: candidate.rawSheet,
      width: raw.width,
      height: raw.height
    },
    sourceReference: candidate.sourceReference,
    currentSheet: candidate.currentSheet,
    candidateSheet: rel(outputs.transparentSheet),
    candidateChromaSheet: rel(outputs.normalizedChroma),
    gridQa: rel(outputs.gridQa),
    transparentContact: rel(outputs.transparentContact),
    mechanicalQa: rel(outputs.mechanicalQa),
    manifest: rel(outputs.manifest),
    prompt: rel(outputs.prompt),
    promptExperimentLog: rel(outputs.promptExperiment),
    review: rel(outputs.review),
    directions: directionRecords,
    gifs: gifRecords,
    cleanup: {
      magentaBackgroundPixels: cleaned.backgroundPixels,
      magentaBackgroundRatio: round(cleaned.backgroundPixels / (sheetWidth * sheetHeight), 6),
      normalizedFrom: [raw.width, raw.height],
      normalizedTo: [sheetWidth, sheetHeight]
    },
    currentMechanical: summarizeMechanical(currentAnalysis),
    candidateMechanical: summarizeMechanical(candidateAnalysis),
    comparison,
    abDecision: candidate.abDecision,
    promptExperiment: candidate.promptExperiment,
    officialReplacement: false
  };

  writeJson(outputs.mechanicalQa, {
    generatedAt,
    presetId: candidate.presetId,
    current: currentAnalysis,
    candidate: candidateAnalysis,
    comparison
  });
  writeJson(outputs.manifest, {
    generatedAt,
    presetId: candidate.presetId,
    title: candidate.title,
    candidateId: candidate.candidateId,
    sourceJobId: candidate.sourceJobId,
    sourceReference: candidate.sourceReference,
    rawSheet: candidate.rawSheet,
    rawGeneratedDimensions: [raw.width, raw.height],
    normalizedDimensions: [sheetWidth, sheetHeight],
    currentSheet: candidate.currentSheet,
    candidateSheet: rel(outputs.transparentSheet),
    candidateChromaSheet: rel(outputs.normalizedChroma),
    directions: directionRecords,
    gifs: gifRecords,
    gridQa: rel(outputs.gridQa),
    transparentContact: rel(outputs.transparentContact),
    mechanicalQa: rel(outputs.mechanicalQa),
    officialReplacement: false,
    abDecision: candidate.abDecision,
    promptExperiment: candidate.promptExperiment
  });
  writeJson(outputs.promptExperiment, {
    generatedAt,
    presetId: candidate.presetId,
    title: candidate.title,
    candidateId: candidate.candidateId,
    currentSheet: candidate.currentSheet,
    candidateSheet: rel(outputs.transparentSheet),
    prompt: rel(outputs.prompt),
    abDecision: candidate.abDecision.outcome,
    officialReplacement: false,
    ...candidate.promptExperiment
  });
  writeFileSync(outputs.prompt, buildPromptMarkdown(candidate), "utf8");
  writeFileSync(outputs.review, buildReviewMarkdown(result), "utf8");
  return result;
}

function buildPromptMarkdown(candidate) {
  return `# ${candidate.title} ${candidate.candidateId} prompt

- Generated at: ${generatedAt}
- Generated with: built-in image_gen
- Source job id: ${candidate.sourceJobId}
- Official replacement: false
- Source reference: \`${candidate.sourceReference}\`
- Current AB baseline: \`${candidate.currentSheet}\`

## Candidate prompt

\`\`\`text
${candidate.imagegenPrompt}
\`\`\`
`;
}

function buildReviewMarkdown(result) {
  const rows = [
    metricRow("Size", result.currentMechanical.size, result.candidateMechanical.size),
    metricRow("Alpha zero ratio", result.currentMechanical.alphaZeroRatio, result.candidateMechanical.alphaZeroRatio),
    metricRow("Min frame padding", result.currentMechanical.minFramePadding, result.candidateMechanical.minFramePadding),
    metricRow("Frames below 16px padding", result.currentMechanical.framesBelow16pxPadding, result.candidateMechanical.framesBelow16pxPadding),
    metricRow("Max center drift", result.currentMechanical.maxCenterDrift, result.candidateMechanical.maxCenterDrift),
    metricRow("Max bottom drift", result.currentMechanical.maxBottomDrift, result.candidateMechanical.maxBottomDrift),
    metricRow("Max height ratio", result.currentMechanical.maxHeightRatio, result.candidateMechanical.maxHeightRatio),
    metricRow("Max width ratio", result.currentMechanical.maxWidthRatio, result.candidateMechanical.maxWidthRatio),
    metricRow("Max detached components", result.currentMechanical.maxDetachedComponents, result.candidateMechanical.maxDetachedComponents)
  ].join("\n");

  return `# ${result.title} AB review

- Candidate: \`${result.candidateId}\`
- Current A: \`${result.currentSheet}\`
- Candidate B: \`${result.candidateSheet}\`
- Raw candidate input: \`${result.rawInput.path}\` (${result.rawInput.width}x${result.rawInput.height})
- Official replacement: false
- Decision: ${result.abDecision.outcome}

## Decision

${result.abDecision.summary}

## Mechanical comparison

| Metric | Current A | Candidate B |
| --- | ---: | ---: |
${rows}

## Candidate wins

${result.abDecision.wins.map((item) => `- ${item}`).join("\n")}

## Candidate risks

${result.abDecision.risks.map((item) => `- ${item}`).join("\n")}

## QA artifacts

- Manifest: \`${result.manifest}\`
- Mechanical QA: \`${result.mechanicalQa}\`
- Grid QA: \`${result.gridQa}\`
- Transparency/contact QA: \`${result.transparentContact}\`
- Direction GIFs: ${result.gifs.map((gif) => `\`${gif.path}\``).join(", ")}
`;
}

function buildSummaryMarkdown(results) {
  const rows = results.map((result) => (
    `| ${result.title} | ${result.abDecision.outcome} | false | ${result.currentMechanical.minFramePadding} | ${result.candidateMechanical.minFramePadding} | ${result.currentMechanical.framesBelow16pxPadding} | ${result.candidateMechanical.framesBelow16pxPadding} | \`${result.review}\` |`
  )).join("\n");

  return `# Core Animation Retake AB Summary

- Generated at: ${generatedAt}
- Phase: B
- Official replacement: false
- Scope: jump-hop, basic-attack, ranged-attack

No \`public/samples/*-sheet.png\`, prompt contract, or Animation modal adoption path was changed.

| Preset | AB decision | Official replacement | A min padding | B min padding | A frames <16px | B frames <16px | Review |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
${rows}

## Notes

- \`jump-hop\` and \`basic-attack\` have useful visual ideas, but candidate B did not beat current A on sheet-safety metrics.
- \`ranged-attack\` candidate B is rejected for now; keep current A.
- All candidates were generated as 1586x992 raw sheets and normalized to the 2048x1280 sheet contract for AB review.
`;
}

function buildPromptExperimentLog(results) {
  return {
    generatedAt,
    phase: "B",
    scope: results.map((result) => result.presetId),
    officialReplacement: false,
    visibility: "committed-knowledge-only",
    note: "Prompt update success/failure knowledge from Phase B retakes. This log is not wired into UI or adoption tables.",
    adoptionRule: "A prompt update is not adopted unless the candidate beats current A on mechanical sheet safety and visual/gameplay readability.",
    experiments: results.map((result) => ({
      presetId: result.presetId,
      title: result.title,
      candidateId: result.candidateId,
      status: result.promptExperiment.status,
      officialReplacement: false,
      currentSheet: result.currentSheet,
      candidateSheet: result.candidateSheet,
      prompt: result.prompt,
      promptExperimentLog: result.promptExperimentLog,
      abDecision: result.abDecision.outcome,
      baselinePromptAssessment: result.promptExperiment.baselinePromptAssessment,
      changeIntent: result.promptExperiment.changeIntent,
      successLog: result.promptExperiment.successLog,
      failureLog: result.promptExperiment.failureLog,
      nextPromptNotes: result.promptExperiment.nextPromptNotes
    }))
  };
}

function buildGalleryHtml(results) {
  const cards = results.map((result) => {
    const current = toPosix(path.relative(retakeRoot, path.join(repoRoot, result.currentSheet)));
    const candidateSheet = toPosix(path.relative(retakeRoot, path.join(repoRoot, result.candidateSheet)));
    const grid = toPosix(path.relative(retakeRoot, path.join(repoRoot, result.gridQa)));
    const contact = toPosix(path.relative(retakeRoot, path.join(repoRoot, result.transparentContact)));
    const gifs = result.gifs.map((gif) => {
      const gifRel = toPosix(path.relative(retakeRoot, path.join(repoRoot, gif.path)));
      return `<figure><img src="${escapeHtml(gifRel)}" alt="${escapeHtml(`${result.title} ${gif.direction}`)}"><figcaption>${escapeHtml(gif.direction)}</figcaption></figure>`;
    }).join("");
    return `<section class="card">
      <div class="heading">
        <div>
          <h2>${escapeHtml(result.title)}</h2>
          <p>${escapeHtml(result.abDecision.outcome)}</p>
        </div>
        <strong>official replacement: false</strong>
      </div>
      <p>${escapeHtml(result.abDecision.summary)}</p>
      <div class="compare">
        <figure><img src="${escapeHtml(current)}" alt="${escapeHtml(`${result.title} current`)}"><figcaption>A current</figcaption></figure>
        <figure><img src="${escapeHtml(candidateSheet)}" alt="${escapeHtml(`${result.title} candidate`)}"><figcaption>B candidate</figcaption></figure>
      </div>
      <h3>Motion GIFs</h3>
      <div class="gifs">${gifs}</div>
      <h3>QA overlays</h3>
      <div class="compare small">
        <figure><img src="${escapeHtml(grid)}" alt="${escapeHtml(`${result.title} grid QA`)}"><figcaption>grid QA</figcaption></figure>
        <figure><img src="${escapeHtml(contact)}" alt="${escapeHtml(`${result.title} contact QA`)}"><figcaption>transparent/contact QA</figcaption></figure>
      </div>
    </section>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Core Animation Retake AB Gallery</title>
  <style>
    :root { color-scheme: dark; --bg: #101216; --panel: #181d24; --text: #f1f5f9; --muted: #aab3c2; --line: #2b3442; --accent: #8fd0ff; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
    main { width: min(1440px, calc(100vw - 32px)); margin: 0 auto; padding: 28px 0 44px; }
    header { margin-bottom: 20px; }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 24px; }
    h2 { font-size: 20px; }
    h3 { margin-top: 18px; color: var(--accent); font-size: 15px; }
    p { color: var(--muted); line-height: 1.55; margin-top: 8px; }
    .card { border: 1px solid var(--line); background: var(--panel); border-radius: 8px; padding: 18px; margin-top: 18px; }
    .heading { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    strong { color: var(--accent); font-size: 13px; text-transform: uppercase; letter-spacing: .04em; }
    .compare { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 14px; }
    .small img { image-rendering: auto; }
    .gifs { display: grid; grid-template-columns: repeat(auto-fit, minmax(156px, 1fr)); gap: 12px; margin-top: 12px; }
    figure { margin: 0; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: #080a0d; }
    img { display: block; width: 100%; height: auto; image-rendering: pixelated; }
    figcaption { padding: 8px 10px; color: var(--muted); font-size: 12px; border-top: 1px solid var(--line); }
    @media (max-width: 760px) { .compare { grid-template-columns: 1fr; } .heading { display: block; } strong { display: block; margin-top: 10px; } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Core Animation Retake AB Gallery</h1>
      <p>Generated at ${escapeHtml(generatedAt)}. No official sample replacement was made.</p>
    </header>
    ${cards}
  </main>
</body>
</html>
`;
}

function updateRetakeLog(results) {
  const logPath = path.join(outRoot, "retake-log.json");
  if (!existsSync(logPath)) return;
  const log = JSON.parse(readFileSync(logPath, "utf8"));
  log.phase = "B";
  log.status = "candidate-ab-reviewed";
  log.generatedAt = generatedAt;
  log.officialReplacement = false;
  log.note = "Phase B generated top-priority candidates, ran AB review artifacts, and kept official replacements disabled pending owner confirmation.";
  log.phaseB = {
    generatedAt,
    officialReplacement: false,
    summary: results.map((result) => ({
      presetId: result.presetId,
      candidateId: result.candidateId,
      outcome: result.abDecision.outcome,
      review: result.review,
      candidateSheet: result.candidateSheet
    }))
  };
  const byId = new Map(results.map((result) => [result.presetId, result]));
  log.items = (log.items ?? []).map((item) => {
    const result = byId.get(item.presetId);
    if (!result) return item;
    const keepCurrent = result.abDecision.outcome === "reject-candidate-keep-current" || result.abDecision.outcome.startsWith("hold-current");
    return {
      ...item,
      decision: keepCurrent ? "keep-current-after-ab" : "candidate-generated-owner-review",
      runStatus: "phase-b-candidate-generated-ab-reviewed",
      officialReplacement: false,
      phaseB: {
        generatedAt,
        candidateId: result.candidateId,
        generatedWith: "built-in image_gen",
        rawInput: result.rawInput,
        candidateSheet: result.candidateSheet,
        candidateChromaSheet: result.candidateChromaSheet,
        manifest: result.manifest,
        mechanicalQa: result.mechanicalQa,
        gridQa: result.gridQa,
        transparentContact: result.transparentContact,
        review: result.review,
        outcome: result.abDecision.outcome,
        officialReplacement: false,
        summary: result.abDecision.summary
      }
    };
  });
  writeJson(logPath, log);
}

function compareMechanical(current, candidate) {
  const currentSummary = summarizeMechanical(current);
  const candidateSummary = summarizeMechanical(candidate);
  return {
    minFramePaddingDelta: candidateSummary.minFramePadding - currentSummary.minFramePadding,
    framesBelow16pxPaddingDelta: candidateSummary.framesBelow16pxPadding - currentSummary.framesBelow16pxPadding,
    maxCenterDriftDelta: candidateSummary.maxCenterDrift - currentSummary.maxCenterDrift,
    maxBottomDriftDelta: candidateSummary.maxBottomDrift - currentSummary.maxBottomDrift,
    maxHeightRatioDelta: round(candidateSummary.maxHeightRatio - currentSummary.maxHeightRatio, 3),
    maxWidthRatioDelta: round(candidateSummary.maxWidthRatio - currentSummary.maxWidthRatio, 3)
  };
}

function summarizeMechanical(analysis) {
  return {
    size: `${analysis.width}x${analysis.height}`,
    sizeMatchesContract: analysis.sizeMatchesContract,
    alphaZeroRatio: analysis.alphaZeroRatio,
    minFramePadding: analysis.summary.minFramePadding,
    maxCenterDrift: analysis.summary.maxCenterDrift,
    maxBottomDrift: analysis.summary.maxBottomDrift,
    maxHeightRatio: analysis.summary.maxHeightRatio,
    maxWidthRatio: analysis.summary.maxWidthRatio,
    maxDetachedComponents: analysis.summary.maxDetachedComponents,
    framesBelow16pxPadding: analysis.summary.framesBelow16pxPadding,
    framesBelow24pxPadding: analysis.summary.framesBelow24pxPadding
  };
}

function analyzeSheet(image) {
  const frames = [];
  let alphaZeroCount = 0;
  for (let index = 0; index < image.width * image.height; index += 1) {
    if (image.data[index * 4 + 3] === 0) alphaZeroCount += 1;
  }
  for (const direction of directions) {
    for (let frame = 1; frame <= frameCount; frame += 1) {
      frames.push(analyzeCell(image, (frame - 1) * cellSize, (direction.row - 1) * cellSize, direction.id, frame));
    }
  }
  const rowSummaries = directions.map((direction) => {
    const rowFrames = frames.filter((frame) => frame.direction === direction.id);
    const centers = rowFrames.map((frame) => frame.centerX);
    const bottoms = rowFrames.map((frame) => frame.bottom);
    const heights = rowFrames.map((frame) => Math.max(1, frame.height));
    const widths = rowFrames.map((frame) => Math.max(1, frame.width));
    return {
      direction: direction.id,
      minPadding: Math.min(...rowFrames.map((frame) => frame.minPadding)),
      minTopMargin: Math.min(...rowFrames.map((frame) => frame.margins.top)),
      minBottomMargin: Math.min(...rowFrames.map((frame) => frame.margins.bottom)),
      centerDrift: Math.round(Math.max(...centers) - Math.min(...centers)),
      bottomDrift: Math.round(Math.max(...bottoms) - Math.min(...bottoms)),
      heightRatio: round(Math.max(...heights) / Math.min(...heights), 3),
      widthRatio: round(Math.max(...widths) / Math.min(...widths), 3),
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
    width: image.width,
    height: image.height,
    alphaZeroRatio: round(alphaZeroCount / (image.width * image.height), 6),
    frameCount: frames.length,
    expectedSize: [sheetWidth, sheetHeight],
    sizeMatchesContract: image.width === sheetWidth && image.height === sheetHeight,
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

function analyzeCell(image, x0, y0, direction, frame) {
  const threshold = 8;
  let minX = cellSize;
  let minY = cellSize;
  let maxX = -1;
  let maxY = -1;
  let pixels = 0;
  for (let y = 0; y < cellSize; y += 1) {
    for (let x = 0; x < cellSize; x += 1) {
      const alpha = image.data[((y0 + y) * image.width + x0 + x) * 4 + 3];
      if (alpha > threshold) {
        pixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
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
      pixels: 0,
      detachedComponents: 0
    };
  }
  const components = countComponents(image, x0, y0, threshold).filter((component) => component.area >= 96);
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
    detachedComponents: Math.max(0, components.length - 1)
  };
}

function countComponents(image, x0, y0, threshold) {
  const visited = new Uint8Array(cellSize * cellSize);
  const queue = new Int32Array(cellSize * cellSize);
  const components = [];
  for (let y = 0; y < cellSize; y += 1) {
    for (let x = 0; x < cellSize; x += 1) {
      const localIndex = y * cellSize + x;
      if (visited[localIndex] || image.data[((y0 + y) * image.width + x0 + x) * 4 + 3] <= threshold) continue;
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
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        const neighbors = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1]
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= cellSize || ny < 0 || ny >= cellSize) continue;
          const nextIndex = ny * cellSize + nx;
          if (visited[nextIndex]) continue;
          if (image.data[((y0 + ny) * image.width + x0 + nx) * 4 + 3] <= threshold) continue;
          visited[nextIndex] = 1;
          queue[tail++] = nextIndex;
        }
      }
      components.push({ area, box: [minX, minY, maxX, maxY] });
    }
  }
  return components.sort((a, b) => b.area - a.area);
}

function cleanupMagentaBackground(image) {
  const bg = floodFillBackground(image);
  const transparent = makeImage(image.width, image.height);
  const chromaImage = makeImage(image.width, image.height);
  let backgroundPixels = 0;
  for (let index = 0; index < image.width * image.height; index += 1) {
    const source = index * 4;
    if (bg[index]) {
      backgroundPixels += 1;
      chromaImage.data[source] = chroma[0];
      chromaImage.data[source + 1] = chroma[1];
      chromaImage.data[source + 2] = chroma[2];
      chromaImage.data[source + 3] = chroma[3];
      transparent.data[source] = 0;
      transparent.data[source + 1] = 0;
      transparent.data[source + 2] = 0;
      transparent.data[source + 3] = 0;
      continue;
    }
    transparent.data[source] = image.data[source];
    transparent.data[source + 1] = image.data[source + 1];
    transparent.data[source + 2] = image.data[source + 2];
    transparent.data[source + 3] = 255;
    chromaImage.data[source] = image.data[source];
    chromaImage.data[source + 1] = image.data[source + 1];
    chromaImage.data[source + 2] = image.data[source + 2];
    chromaImage.data[source + 3] = 255;
  }
  return {
    transparentImage: transparent,
    chromaImage,
    backgroundPixels
  };
}

function floodFillBackground(image) {
  const total = image.width * image.height;
  const bg = new Uint8Array(total);
  const queued = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const push = (x, y) => {
    if (x < 0 || x >= image.width || y < 0 || y >= image.height) return;
    const index = y * image.width + x;
    if (queued[index] || !isLikelyMagenta(image.data, index * 4)) return;
    queued[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < image.width; x += 1) {
    push(x, 0);
    push(x, image.height - 1);
  }
  for (let y = 0; y < image.height; y += 1) {
    push(0, y);
    push(image.width - 1, y);
  }

  while (head < tail) {
    const index = queue[head++];
    bg[index] = 1;
    const x = index % image.width;
    const y = Math.floor(index / image.width);
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }
  return bg;
}

function isLikelyMagenta(data, offset) {
  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  return r >= 160 && b >= 145 && g <= 130 && r - g >= 60 && b - g >= 45;
}

function makeGridQa(image) {
  const out = makeImage(image.width, image.height);
  drawChecker(out);
  composite(out, image);
  for (let x = 0; x <= image.width; x += cellSize) drawVLine(out, Math.min(x, image.width - 1), [82, 178, 255, 255]);
  for (let y = 0; y <= image.height; y += cellSize) drawHLine(out, Math.min(y, image.height - 1), [82, 178, 255, 255]);
  return out;
}

function makeTransparentContact(image, analysis) {
  const out = makeImage(image.width, image.height);
  drawChecker(out);
  composite(out, image);
  for (const row of analysis.rowSummaries) {
    for (const frame of row.frames) {
      const x0 = (frame.frame - 1) * cellSize;
      const y0 = (directions.find((direction) => direction.id === row.direction).row - 1) * cellSize;
      const color = frame.minPadding < 16 ? [255, 92, 92, 255] : [85, 220, 151, 255];
      const left = x0 + frame.margins.left;
      const top = y0 + frame.margins.top;
      const right = x0 + cellSize - 1 - frame.margins.right;
      const bottom = y0 + frame.bottom;
      drawRect(out, left, top, right, bottom, color);
      drawHLineSegment(out, x0 + 8, y0 + frame.bottom, x0 + cellSize - 9, [255, 224, 102, 255]);
    }
  }
  return out;
}

function drawChecker(image) {
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const bright = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 0 ? 42 : 30;
      setPixel(image, x, y, [bright, bright + 4, bright + 10, 255]);
    }
  }
}

function composite(target, source) {
  for (let index = 0; index < source.width * source.height; index += 1) {
    const offset = index * 4;
    const alpha = source.data[offset + 3] / 255;
    if (alpha <= 0) continue;
    target.data[offset] = Math.round(source.data[offset] * alpha + target.data[offset] * (1 - alpha));
    target.data[offset + 1] = Math.round(source.data[offset + 1] * alpha + target.data[offset + 1] * (1 - alpha));
    target.data[offset + 2] = Math.round(source.data[offset + 2] * alpha + target.data[offset + 2] * (1 - alpha));
    target.data[offset + 3] = 255;
  }
}

function drawVLine(image, x, color) {
  for (let y = 0; y < image.height; y += 1) setPixel(image, x, y, color);
}

function drawHLine(image, y, color) {
  for (let x = 0; x < image.width; x += 1) setPixel(image, x, y, color);
}

function drawHLineSegment(image, x0, y, x1, color) {
  for (let x = Math.max(0, x0); x <= Math.min(image.width - 1, x1); x += 1) setPixel(image, x, y, color);
}

function drawRect(image, left, top, right, bottom, color) {
  for (let x = left; x <= right; x += 1) {
    setPixel(image, x, top, color);
    setPixel(image, x, bottom, color);
  }
  for (let y = top; y <= bottom; y += 1) {
    setPixel(image, left, y, color);
    setPixel(image, right, y, color);
  }
}

function setPixel(image, x, y, color) {
  if (x < 0 || x >= image.width || y < 0 || y >= image.height) return;
  const offset = (y * image.width + x) * 4;
  image.data[offset] = color[0];
  image.data[offset + 1] = color[1];
  image.data[offset + 2] = color[2];
  image.data[offset + 3] = color[3];
}

function writeGif(filePath, sheet, row) {
  const encoder = GIFEncoder();
  const y0 = (row - 1) * cellSize;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const image = crop(sheet, frame * cellSize, y0, cellSize, cellSize);
    const palette = quantize(image.data, 255, { format: "rgba4444", oneBitAlpha: true });
    const transparentIndex = palette.findIndex((color) => color[3] === 0);
    const index = applyPalette(image.data, palette, "rgba4444");
    encoder.writeFrame(index, cellSize, cellSize, {
      palette,
      delay: 120,
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(0, transparentIndex),
      repeat: 0
    });
  }
  encoder.finish();
  writeFileSync(filePath, Buffer.from(encoder.bytes()));
}

function crop(image, x0, y0, width, height) {
  const out = makeImage(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = ((y0 + y) * image.width + x0 + x) * 4;
      const target = (y * width + x) * 4;
      out.data[target] = image.data[source];
      out.data[target + 1] = image.data[source + 1];
      out.data[target + 2] = image.data[source + 2];
      out.data[target + 3] = image.data[source + 3];
    }
  }
  return out;
}

function resizeNearest(image, width, height) {
  const out = makeImage(width, height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.floor((y + 0.5) * image.height / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor((x + 0.5) * image.width / width));
      const source = (sourceY * image.width + sourceX) * 4;
      const target = (y * width + x) * 4;
      out.data[target] = image.data[source];
      out.data[target + 1] = image.data[source + 1];
      out.data[target + 2] = image.data[source + 2];
      out.data[target + 3] = image.data[source + 3];
    }
  }
  return out;
}

function decodePng(filePath) {
  const buffer = readFileSync(filePath);
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
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
  if (bitDepth !== 8 || interlace !== 0) {
    throw new Error(`${filePath} must be a non-interlaced 8-bit PNG`);
  }
  const channels = channelsForColorType(colorType);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const recon = Buffer.alloc(height * stride);
  let rawOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset++];
    const row = recon.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? recon.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[rawOffset++];
      const left = x >= channels ? row[x - channels] : 0;
      const up = prev ? prev[x] : 0;
      const upLeft = prev && x >= channels ? prev[x - channels] : 0;
      row[x] = (value + unfilter(filter, left, up, upLeft)) & 0xff;
    }
  }
  return rgbaFromRecon(filePath, recon, width, height, colorType, palette, transparency);
}

function channelsForColorType(colorType) {
  if (colorType === 6) return 4;
  if (colorType === 2) return 3;
  if (colorType === 3) return 1;
  if (colorType === 0) return 1;
  throw new Error(`Unsupported PNG color type: ${colorType}`);
}

function unfilter(filter, left, up, upLeft) {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return Math.floor((left + up) / 2);
  if (filter === 4) return paeth(left, up, upLeft);
  throw new Error(`Unsupported PNG filter: ${filter}`);
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

function rgbaFromRecon(filePath, recon, width, height, colorType, palette, transparency) {
  const image = makeImage(width, height);
  if (colorType === 6) {
    image.data.set(recon);
    return image;
  }
  if (colorType === 2) {
    for (let index = 0; index < width * height; index += 1) {
      const source = index * 3;
      const target = index * 4;
      image.data[target] = recon[source];
      image.data[target + 1] = recon[source + 1];
      image.data[target + 2] = recon[source + 2];
      image.data[target + 3] = 255;
    }
    return image;
  }
  if (colorType === 3) {
    if (!palette) throw new Error(`${filePath} is indexed PNG without a palette`);
    for (let index = 0; index < width * height; index += 1) {
      const paletteIndex = recon[index];
      const source = paletteIndex * 3;
      const target = index * 4;
      image.data[target] = palette[source] ?? 0;
      image.data[target + 1] = palette[source + 1] ?? 0;
      image.data[target + 2] = palette[source + 2] ?? 0;
      image.data[target + 3] = transparency && paletteIndex < transparency.length ? transparency[paletteIndex] : 255;
    }
    return image;
  }
  if (colorType === 0) {
    for (let index = 0; index < width * height; index += 1) {
      const value = recon[index];
      const target = index * 4;
      image.data[target] = value;
      image.data[target + 1] = value;
      image.data[target + 2] = value;
      image.data[target + 3] = 255;
    }
    return image;
  }
  throw new Error(`Unsupported PNG color type: ${colorType}`);
}

function writePng(filePath, image) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const bytesPerPixel = 4;
  const stride = image.width * bytesPerPixel + 1;
  const raw = Buffer.alloc(image.height * stride);
  for (let y = 0; y < image.height; y += 1) {
    const rowOffset = y * stride;
    raw[rowOffset] = 0;
    const sourceStart = y * image.width * bytesPerPixel;
    image.data.copy(raw, rowOffset + 1, sourceStart, sourceStart + image.width * bytesPerPixel);
  }
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", Buffer.concat([u32(image.width), u32(image.height), Buffer.from([8, 6, 0, 0, 0])])),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
  writeFileSync(filePath, png);
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  return Buffer.concat([u32(data.length), typeBytes, data, u32(crc32(Buffer.concat([typeBytes, data])))]);
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeImage(width, height) {
  return { width, height, data: Buffer.alloc(width * height * 4) };
}

function metricRow(label, current, candidate) {
  return `| ${label} | ${current} | ${candidate} |`;
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertFile(filePath) {
  if (!existsSync(filePath)) throw new Error(`Missing required file: ${filePath}`);
}

function rel(filePath) {
  return toPosix(path.relative(repoRoot, filePath));
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}
