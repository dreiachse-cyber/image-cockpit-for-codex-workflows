import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const nodeCommand = process.execPath;
const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const tinyPngBytes = Buffer.from(tinyPng.split(",")[1], "base64");

await runManualHandoffSmoke();
await runMockRunnerGuardSmoke();
await runMockAutorunSmoke();

console.log("Smoke passed.");

async function runManualHandoffSmoke() {
  const port = String(8900 + Math.floor(Math.random() * 400));
  const handoffDir = await mkdtemp(join(tmpdir(), "image-cockpit-smoke-manual-"));
  let server = startServer({
    port,
    handoffDir,
    env: {
      IMAGE_COCKPIT_CODEX_AUTORUN: "0",
      IMAGE_COCKPIT_ARTIFACT_STABLE_MS: "0"
    }
  });

  try {
    await waitForServer(server, port);

    const providers = await getJson(port, "/api/providers");
    assert(Array.isArray(providers.providers), "providers response should include providers");
    assert(providers.providers.some((provider) => provider.id === "local-generator"), "local-generator provider missing");
    assert(providers.providers.some((provider) => provider.id === "codex-handoff"), "codex-handoff provider missing");

    const health = await getJson(port, "/api/health");
    assert(health.app === "image-cockpit", "health response should identify Image Cockpit");
    assert(health.role === "api", "health response should identify the API role");
    assert(health.outboxReadable === true, "health response should confirm outbox readability");

    const runnerPreflight = await getJson(port, "/api/codex/runner");
    assert(runnerPreflight.runner?.state === "disabled", "autorun-off preflight should report disabled runner state");
    assert(runnerPreflight.runner?.autorun === false, "autorun-off preflight should include autorun=false");

    const directionManifestName = "manual-manifest.json";
    await writeFile(join(handoffDir, "outbox", "manual-return.png"), tinyPngBytes);
    await writeFile(join(handoffDir, "outbox", directionManifestName), JSON.stringify({
      schema: "image-cockpit.direction-split-animation.v1",
      directions: ["front", "front three-quarter", "side", "back three-quarter", "back"],
      framesPerDirection: 8
    }, null, 2), "utf8");
    await writeFile(join(handoffDir, "outbox", "manual-notes.txt"), "not an image", "utf8");
    await writeFile(join(handoffDir, "outbox", "manual-qa.json"), JSON.stringify({ status: "pass" }), "utf8");
    await writeFile(join(handoffDir, "outbox", "manual-work-output.png"), tinyPngBytes);
    await writeFile(join(handoffDir, "outbox", ".staging-manual.png"), tinyPngBytes);
    await writeFile(join(handoffDir, "outbox", "manual-candidate-contact.tmp.png"), tinyPngBytes);
    await writeFile(join(handoffDir, "outbox", "manual-candidate-contact.tmp_transparent.png"), tinyPngBytes);
    await writeFile(join(handoffDir, "outbox", "manual-contact-sheet.png"), tinyPngBytes);
    await writeFile(join(handoffDir, "outbox", "manual-grid-qa.png"), tinyPngBytes);
    await writeFile(join(handoffDir, "outbox", "manual-mechanical-qa.png"), tinyPngBytes);
    await writeFile(join(handoffDir, "outbox", "manual-transparent-contact.png"), tinyPngBytes);
    await writeFile(join(handoffDir, "outbox", "manual-debug-preview.png"), tinyPngBytes);
    await writeFile(join(handoffDir, "outbox", "manual-preview-grid.png"), tinyPngBytes);
    await writeFile(join(handoffDir, "outbox", "manual-ab-gallery.png"), tinyPngBytes);
    await writeFile(join(handoffDir, "outbox", "manual-bronze-candidate-front.png"), tinyPngBytes);

    const outboxList = await getJson(port, "/api/codex/results");
    const manualReturn = outboxList.results.find((result) => result.name === "manual-return.png");
    const manualBronze = outboxList.results.find((result) => result.name === "manual-bronze-candidate-front.png");
    assert(manualReturn, "outbox image should be listed");
    assert(manualReturn.qualityGate?.classification === "usable-final", "normal outbox image should be classified usable-final");
    assert(manualBronze, "bronze candidate should be listed for quarantine diagnostics");
    assert(manualBronze.qualityGate?.classification === "quarantined-candidate", "bronze candidate should be quarantined");
    assert(manualBronze.qualityGate?.historyAllowed === false, "bronze candidate should not be history-importable");
    assert(outboxList.results.some((result) => result.name === directionManifestName), "direction split manifest should be listed");
    assert(!outboxList.results.some((result) => result.name === "manual-notes.txt"), "non-image outbox file should be ignored");
    assert(!outboxList.results.some((result) => result.name === "manual-qa.json"), "QA JSON outbox file should be ignored");
    assert(!outboxList.results.some((result) => result.name === "manual-work-output.png"), "work-in-progress outbox image should be ignored");
    assert(!outboxList.results.some((result) => result.name === ".staging-manual.png"), "staging outbox image should be ignored");
    assert(!outboxList.results.some((result) => result.name === "manual-candidate-contact.tmp.png"), "candidate contact temp outbox image should be ignored");
    assert(!outboxList.results.some((result) => result.name === "manual-candidate-contact.tmp_transparent.png"), "tmp transparent derivative outbox image should be ignored");
    assert(!outboxList.results.some((result) => result.name === "manual-contact-sheet.png"), "contact sheet outbox image should be ignored");
    assert(!outboxList.results.some((result) => result.name === "manual-grid-qa.png"), "grid QA outbox image should be ignored");
    assert(!outboxList.results.some((result) => result.name === "manual-mechanical-qa.png"), "mechanical QA outbox image should be ignored");
    assert(!outboxList.results.some((result) => result.name === "manual-transparent-contact.png"), "transparent contact outbox image should be ignored");
    assert(!outboxList.results.some((result) => result.name === "manual-debug-preview.png"), "debug outbox image should be ignored");
    assert(!outboxList.results.some((result) => result.name === "manual-preview-grid.png"), "preview grid outbox image should be ignored");
    assert(!outboxList.results.some((result) => result.name === "manual-ab-gallery.png"), "AB gallery outbox image should be ignored");
    const importedOutbox = await getJson(port, "/api/codex/results/manual-return.png");
    assert(importedOutbox.mimeType === "image/png", "outbox import should preserve image MIME type");
    assert(importedOutbox.dataUrl === tinyPng, "outbox import should return a data URL");
    const importedManifest = await getJson(port, `/api/codex/results/${directionManifestName}`);
    assert(importedManifest.mimeType === "application/json", "direction split manifest import should preserve JSON MIME type");

    const artifactJobId = "codex-job-smoke-artifact-staging-Z";
    const directionSlugs = ["front", "front-three-quarter", "back-three-quarter", "back"];
    await writeFile(join(handoffDir, "outbox", `${artifactJobId}-manifest.json`), JSON.stringify({
      schema: "image-cockpit.direction-split-animation.v1",
      jobId: artifactJobId,
      directionAttempts: {
        front: [{
          attempt: 1,
          status: "accepted",
          startedAt: "2026-07-24T00:00:00.000Z",
          finishedAt: "2026-07-24T00:01:00.000Z",
          artifactPath: `.staging/${artifactJobId}/front/attempt-1/result.png`,
          failureKind: "imagegen_failed"
        }],
        side: [{
          attempt: 1,
          status: "capacity",
          startedAt: "2026-07-24T00:00:00.000Z",
          finishedAt: "2026-07-24T00:00:05.000Z",
          failureKind: "imagegen_capacity",
          artifactPath: `.staging/${artifactJobId}/side/attempt-1/result.png`
        }, {
          attempt: 2,
          status: "accepted",
          startedAt: "2026-07-24T00:01:05.000Z",
          finishedAt: "2026-07-24T00:02:00.000Z",
          artifactPath: `.staging/${artifactJobId}/side/attempt-2/result.png`
        }],
        unexpected: [{ attempt: 1, status: "accepted", artifactPath: ".staging/unexpected/result.png" }]
      },
      files: {
        front: `${artifactJobId}-front.png`,
        "front-three-quarter": `${artifactJobId}-front-three-quarter.png`,
        side: `${artifactJobId}-side.png`,
        "back-three-quarter": `${artifactJobId}-back-three-quarter.png`,
        back: `${artifactJobId}-back.png`
      },
      chromaKey: { name: "green" }
    }, null, 2), "utf8");
    for (const slug of directionSlugs) {
      await writeFile(join(handoffDir, "outbox", `${artifactJobId}-${slug}.png`), tinyPngBytes);
    }
    const incompleteArtifactList = await getJson(port, "/api/codex/results");
    const incompleteArtifact = incompleteArtifactList.results.find((result) => result.name === `${artifactJobId}-manifest.json`)?.artifact;
    assert(incompleteArtifact?.ready === false, "manifest-first direction split should wait while side.png is missing");
    assert(incompleteArtifact?.reason.includes("side"), "manifest-first direction split should report missing side");
    await writeFile(join(handoffDir, "outbox", `${artifactJobId}-side.png`), tinyPngBytes);
    const verifiedArtifactList = await getJson(port, "/api/codex/results");
    const verifiedArtifact = verifiedArtifactList.results.find((result) => result.name === `${artifactJobId}-manifest.json`)?.artifact;
    assert(verifiedArtifact?.ready === true, "complete direction split should become server verified");
    assert(verifiedArtifact?.verified === true, "complete direction split should expose verified=true");
    assert(verifiedArtifact?.qualityGate?.classification === "usable-final", "complete direction split should pass the quality gate");
    assert(verifiedArtifact?.animationQuality === undefined, "legacy manifests without Quality v2 should remain readable");
    const verifiedManifest = await getJson(port, `/api/codex/results/${artifactJobId}-manifest.json`);
    const verifiedManifestText = Buffer.from(verifiedManifest.dataUrl.split(",")[1], "base64").toString("utf8");
    assert(verifiedManifestText.includes('"serverVerified": true'), "server should rewrite the final direction split manifest");
    assert(verifiedManifestText.includes('"classification": "usable-final"'), "server manifest should include the quality gate classification");
    const verifiedManifestObject = JSON.parse(verifiedManifestText);
    assert(verifiedManifestObject.directionAttempts.front[0].artifactPath.includes("/front/attempt-1/"), "server manifest should preserve direction-bound attempt metadata");
    assert(!verifiedManifestObject.directionAttempts.front[0].failureKind, "accepted attempts should retain only artifactPath");
    assert(verifiedManifestObject.directionAttempts.side[0].status === "capacity" && verifiedManifestObject.directionAttempts.side[1].status === "accepted", "server manifest should preserve targeted retry history");
    assert(!verifiedManifestObject.directionAttempts.side[0].artifactPath, "failed attempts should retain only failureKind");
    assert(!verifiedManifestObject.directionAttempts.unexpected, "server manifest should discard attempt metadata for unrequested directions");
    await writeFile(join(handoffDir, "outbox", `${artifactJobId}-manifest.json`), JSON.stringify({
      ...verifiedManifestObject,
      serverVerified: true,
      directionAttempts: {
        front: [
          {
            attempt: 2,
            status: "accepted",
            startedAt: "2026-07-24T00:00:00.000Z",
            finishedAt: "2026-07-24T00:00:01.000Z",
            artifactPath: "file:///C:/private/front/result.png"
          },
          {
            attempt: 3,
            status: "accepted",
            startedAt: "2026-07-24T00:00:00.000Z",
            finishedAt: "2026-07-24T00:00:01.000Z",
            artifactPath: `.staging/codex-job-other/front/attempt-3/result.png`
          },
          {
            attempt: 4,
            status: "accepted",
            startedAt: "2026-07-24T00:00:00.000Z",
            finishedAt: "2026-07-24T00:00:01.000Z",
            artifactPath: `.staging/${artifactJobId}/front/attempt-4/file:///C:/private.png`
          },
          {
            attempt: 5,
            status: "accepted",
            startedAt: "2026-07-24T00:00:00.000Z",
            finishedAt: "2026-07-24T00:00:01.000Z",
            artifactPath: `.staging/${artifactJobId}/front/attempt-999/result.png`
          },
          {
            attempt: 6,
            status: "failed",
            startedAt: "2026-07-24T00:00:00.000Z",
            finishedAt: "2026-07-24T00:00:01.000Z",
            failureKind: "C:\\Users\\private\\failure.txt"
          }
        ]
      }
    }, null, 2), "utf8");
    await getJson(port, "/api/codex/results");
    const resanitizedManifest = await getJson(port, `/api/codex/results/${artifactJobId}-manifest.json`);
    const resanitizedManifestText = Buffer.from(resanitizedManifest.dataUrl.split(",")[1], "base64").toString("utf8");
    assert(!resanitizedManifestText.includes("file:///"), "serverVerified manifests should not bypass absolute URI sanitization");
    assert(!resanitizedManifestText.includes("codex-job-other"), "serverVerified manifests should not retain another job's staging path");
    assert(!resanitizedManifestText.includes("attempt-999"), "attempt artifact paths should match their recorded attempt number");
    assert(!resanitizedManifestText.includes("Users"), "failureKind should not expose a local path");
    const animationQualityReport = {
      metricVersion: "image-cockpit.animation-quality.v2",
      policyVersion: "shadow-v1",
      recordedAt: "2026-07-15T00:00:00.000Z",
      action: "idle",
      actionProfile: "subtle-loop",
      loopExpected: true,
      rawMetrics: { frameCount: 40 },
      normalizedMetrics: { frameCount: 40 },
      normalizationCorrection: { frames: [], adjustedFrameRatio: 0 },
      identityScore: 92,
      paletteScore: 94,
      silhouetteScore: 90,
      footlineScore: 88,
      loopSeamScore: 84,
      phaseScore: 86,
      motionScore: 91,
      dimensionWarnings: [],
      shadowDecision: { mode: "shadow", wouldBlock: false, reasons: [] },
      hardGateUnchanged: true
    };
    await postJson(port, `/api/codex/artifacts/${encodeURIComponent(artifactJobId)}/animation-quality`, {
      report: animationQualityReport
    });
    const qualityV2ArtifactList = await getJson(port, "/api/codex/results");
    const qualityV2Artifact = qualityV2ArtifactList.results.find((result) => result.name === `${artifactJobId}-manifest.json`)?.artifact;
    assert(qualityV2Artifact?.ready === true, "Quality v2 shadow report should not block a usable artifact");
    assert(qualityV2Artifact?.qualityGate?.classification === "usable-final", "Quality v2 shadow report should preserve usable-final classification");
    assert(qualityV2Artifact?.animationQuality?.metricVersion === animationQualityReport.metricVersion, "artifact status should expose the Quality v2 report");
    const qualityV2Manifest = await getJson(port, `/api/codex/results/${artifactJobId}-manifest.json`);
    const qualityV2ManifestText = Buffer.from(qualityV2Manifest.dataUrl.split(",")[1], "base64").toString("utf8");
    assert(qualityV2ManifestText.includes('"animationQuality"'), "Quality v2 report should persist in the manifest");
    assert(qualityV2ManifestText.includes('"classification": "usable-final"'), "Quality v2 persistence should not rewrite the hard gate");
    await postJson(port, `/api/codex/artifacts/${encodeURIComponent(artifactJobId)}/quality-gate`, {
      classification: "quality-failed",
      reason: "Direction split QA failed: front cell 1: Chroma key removal failed",
      code: "chroma-key-removal-failed"
    });
    const qualityFailedArtifactList = await getJson(port, "/api/codex/results");
    const qualityFailedArtifact = qualityFailedArtifactList.results.find((result) => result.name === `${artifactJobId}-manifest.json`)?.artifact;
    assert(qualityFailedArtifact?.ready === false, "client quality gate failure should block the artifact");
    assert(qualityFailedArtifact?.qualityGate?.classification === "quality-failed", "client quality gate failure should persist to the manifest");
    assert(qualityFailedArtifact?.qualityGate?.historyAllowed === false, "client quality gate failure should block history import");
    const qualityFailedManifest = await getJson(port, `/api/codex/results/${artifactJobId}-manifest.json`);
    const qualityFailedManifestText = Buffer.from(qualityFailedManifest.dataUrl.split(",")[1], "base64").toString("utf8");
    assert(qualityFailedManifestText.includes('"classification": "quality-failed"'), "quality-failed manifest should be persisted");
    await new Promise((resolve) => setTimeout(resolve, 120));
    await writeFile(join(handoffDir, "outbox", `${artifactJobId}-side.png`), tinyPngBytes);
    const repairedArtifactList = await getJson(port, "/api/codex/results");
    const repairedArtifact = repairedArtifactList.results.find((result) => result.name === `${artifactJobId}-manifest.json`)?.artifact;
    assert(repairedArtifact?.ready === true, "newer direction candidates should recover a stale client quality gate failure");
    assert(repairedArtifact?.qualityGate?.classification === "usable-final", "repaired direction split should become usable-final again");

    const softGateJobId = "codex-job-smoke-soft-bbox-gate-Z";
    await writeFile(join(handoffDir, "outbox", `${softGateJobId}-manifest.json`), JSON.stringify({
      schema: "image-cockpit.direction-split-animation.v1",
      jobId: softGateJobId,
      files: Object.fromEntries(["front", "front-three-quarter", "side", "back-three-quarter", "back"].map((slug) => [slug, `${softGateJobId}-${slug}.png`]))
    }, null, 2), "utf8");
    for (const slug of ["front", "front-three-quarter", "side", "back-three-quarter", "back"]) {
      await writeFile(join(handoffDir, "outbox", `${softGateJobId}-${slug}.png`), tinyPngBytes);
    }
    const softGateVerifiedList = await getJson(port, "/api/codex/results");
    const softGateVerified = softGateVerifiedList.results.find((result) => result.name === `${softGateJobId}-manifest.json`)?.artifact;
    assert(softGateVerified?.ready === true, "soft gate fixture should start as server verified");
    await postJson(port, `/api/codex/artifacts/${encodeURIComponent(softGateJobId)}/quality-gate`, {
      classification: "quality-failed",
      reason: "Direction split QA failed: back three-quarter: bbox width variation 47%; back: bbox width variation 48%",
      code: "client-quality-gate-failed"
    });
    const softGateRecoveredList = await getJson(port, "/api/codex/results");
    const softGateRecovered = softGateRecoveredList.results.find((result) => result.name === `${softGateJobId}-manifest.json`)?.artifact;
    assert(softGateRecovered?.ready === true, "soft bbox-only client quality gate should be rechecked under current QA policy");
    assert(softGateRecovered?.qualityGate?.classification === "usable-final", "soft bbox-only quality gate should not remain blocked");

    const localImages = await postJson(port, "/api/generate", {
      workflowMode: "image-generate",
      prompt: "Smoke test forest mage local image",
      negativePrompt: "text",
      jobNotes: "transparent background and centered subject",
      seed: "smoke-image",
      size: "512x512",
      count: 2
    });
    assert(localImages.results.length === 2, "local image generation should return requested image count");
    const firstLocalImage = localImages.results[0];
    assert(firstLocalImage.mimeType === "image/png", "local image generation should return PNG");
    assertPngDimensions(firstLocalImage.dataUrl, 512, 512, "local generated image dimensions");
    await stat(firstLocalImage.path);

    const localSpriteSheet = await postJson(port, "/api/generate", {
      workflowMode: "sprite-generate",
      prompt: "Smoke test local sprite sheet",
      negativePrompt: "text",
      jobNotes: "4x2 idle sheet",
      seed: "smoke-sprite",
      grid: { columns: 4, rows: 2, gutter: 0 },
      cell: { width: 64, height: 48 },
      action: "idle",
      frames: 8
    });
    assert(localSpriteSheet.results.length === 1, "local sprite generation should return one sheet");
    assert(localSpriteSheet.results[0].mimeType === "image/png", "local sprite generation should return PNG");
    assertPngDimensions(localSpriteSheet.results[0].dataUrl, 256, 96, "local generated sprite sheet dimensions");
    await stat(localSpriteSheet.results[0].path);

    const job = await postJson(port, "/api/codex/jobs", {
      workflowMode: "image-edit",
      prompt: "Smoke test edit",
      negativePrompt: "text",
      jobNotes: "Preserve silhouette and check annotations.",
      selectedImageName: "tiny.png",
      selectedImageSize: "1x1",
      selectedImageSource: "import",
      selectedImageDataUrl: tinyPng,
      annotations: [{
        id: "ann-1",
        tool: "rect",
        color: "#ff0000",
        number: 1,
        comment: "Add the text X here",
        points: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
        displayedImageRect: { x: 200, y: 44, width: 520, height: 432 },
        imageRectNormalized: { x: 0.12, y: 0.25, width: 0.2, height: 0.16 },
        imageRectPixels: { x: 0.12, y: 0.25, width: 0.2, height: 0.16 },
        sourceImageNaturalSize: { width: 1, height: 1 },
        imageRectClamped: false
      }],
      grid: { columns: 8, rows: 4, gutter: 0 },
      action: "idle",
      frames: 8
    });

    assert(job.runner?.state === "disabled", "autorun-off job should record disabled runner state");
    const jobJson = JSON.parse(await readFile(job.path, "utf8"));
    assert(jobJson.workflowMode === "image-edit", "job should include workflowMode");
    assert(jobJson.jobNotes.includes("Preserve silhouette"), "job should include edit notes");
    assert(jobJson.annotationContext.annotationCount === 1, "job should include annotation count");
    assert(jobJson.annotationContext.annotations[0].number === 1, "job should include numbered edit annotations");
    assert(jobJson.annotationContext.annotations[0].comment.includes("text X"), "job should include numbered edit comments");
    assert(jobJson.annotationContext.annotations[0].imageRectNormalized.width === 0.2, "job should preserve normalized source image edit coordinates");
    assert(jobJson.annotationContext.annotations[0].imageRectPixels.height === 0.16, "job should preserve pixel source image edit coordinates");
    assert(jobJson.annotationContext.coordinateSpace.includes("source image normalized"), "job should describe source image coordinate metadata");
    assert(jobJson.notes.some((note) => note.includes("Do not zoom in, crop, or reframe")), "job should include full-body no-crop edit instructions");
    assert(jobJson.selectedImage.assetPath, "job should include selected image asset path");
    await stat(jobJson.selectedImage.assetPath);

    const generateJob = await postJson(port, "/api/codex/jobs", {
      workflowMode: "image-generate",
      prompt: "Smoke test generation",
      negativePrompt: "text",
      jobNotes: "Transparent background and centered subject.",
      selectedImageName: "tiny.png",
      selectedImageSize: "1x1",
      selectedImageSource: "sample",
      selectedImageDataUrl: tinyPng,
      annotations: [{ id: "ann-ignored", tool: "rect", color: "#ff0000", points: [{ x: 0, y: 0 }] }],
      grid: { columns: 8, rows: 4, gutter: 0 },
      action: "idle",
      frames: 8
    });
    const generateJobJson = JSON.parse(await readFile(generateJob.path, "utf8"));
    assert(generateJobJson.workflowMode === "image-generate", "generation job should include workflowMode");
    assert(generateJobJson.intent.includes("imagegen"), "generation job should include imagegen generation intent");
    assert(!generateJobJson.selectedImage.assetPath, "generation job should not attach the current selected image");
    assert(generateJobJson.annotationContext.annotationCount === 0, "generation job should not carry edit annotations");
    assert(generateJobJson.spriteContext.frames === 0, "generation job should not carry sprite context");

    const persistentTournamentId = "smoke-persistent-balanced-tournament";
    const tournamentRegistration = {
      tournamentId: persistentTournamentId,
      idempotencyKey: "smoke:persistent:balanced:v1",
      sourceFingerprint: "smoke-source-fingerprint-v1",
      motionRecipeId: "walk",
      presetId: "walk-cycle",
      generationProfile: "balanced",
      requestedDirections: ["front", "side", "back"],
      maximumCandidateCount: 3,
      initialCandidateCount: 2,
      clientContext: {
        label: "Smoke persistent tournament",
        workflowMode: "sprite-generate",
        actionName: "walk",
        sourceImageId: "hist-smoke-source",
        sourceImageName: "tiny.png",
        batchMatrixRunId: "batch-matrix-smoke",
        batchMatrixCellKey: "hist-smoke-source:walk-cycle"
      },
      jobTemplate: {
        workflowMode: "sprite-generate",
        prompt: "Smoke test persistent balanced tournament",
        selectedImageName: "tiny.png",
        selectedImageSize: "1x1",
        selectedImageSource: "import",
        selectedImageDataUrl: tinyPng,
        grid: { columns: 8, rows: 3, gutter: 0 },
        action: "walk",
        frames: 24,
        cell: { width: 256, height: 256 },
        chromaKey: "green",
        spriteVariant: "standard",
        directions: ["front", "side", "back"]
      }
    };
    const canonicalSingleDirections = ["front", "front three-quarter", "side", "back three-quarter", "back"];
    const singleDirection = "back three-quarter";
    const singleDirectionSlug = "back-three-quarter";
    const singleDirectionTournamentId = "smoke-single-back-three-quarter-tournament";
    const singleDirectionRegistration = {
      ...tournamentRegistration,
      tournamentId: singleDirectionTournamentId,
      idempotencyKey: "smoke:single-back-three-quarter:v1",
      generationProfile: "fast",
      requestedDirections: [singleDirection],
      maximumCandidateCount: 1,
      initialCandidateCount: 1,
      clientContext: { ...tournamentRegistration.clientContext, label: "Smoke selected single-direction tournament" },
      jobTemplate: {
        ...tournamentRegistration.jobTemplate,
        prompt: "Smoke test selected single-direction tournament",
        grid: { columns: 20, rows: 1, gutter: 0 },
        frames: 20,
        framesPerDirection: 20,
        directions: [singleDirection],
        motionRecipe: {
          id: "walk-cycle",
          version: 1,
          compilerVersion: "1.2.0",
          qualityProfile: "grounded-soft",
          bodyTopology: "biped",
          frameCount: 20
        }
      }
    };
    const singleDirectionRegistered = await postJson(port, "/api/codex/tournaments", singleDirectionRegistration);
    assert(singleDirectionRegistered.tournament.requestedDirections.join(",") === singleDirection, "single-direction tournament should persist exactly the selected non-side direction");
    assert(singleDirectionRegistered.tournament.pilotMode === false, "single-direction tournament should use the standard non-Pilot path");

    for (const direction of canonicalSingleDirections) {
      if (direction === singleDirection) continue;
      const slug = direction.replaceAll(" ", "-");
      const registeredChoice = await postJson(port, "/api/codex/tournaments", {
        ...singleDirectionRegistration,
        tournamentId: `smoke-single-direction-${slug}`,
        idempotencyKey: `smoke:single-direction:${slug}:v1`,
        requestedDirections: [direction],
        jobTemplate: { ...singleDirectionRegistration.jobTemplate, directions: [direction] }
      });
      assert(
        registeredChoice.tournament.requestedDirections.join(",") === direction,
        `single-direction registration should accept the canonical ${direction} choice`
      );
    }

    const singleDirectionCandidate = await postJson(port, "/api/codex/tournaments/" + singleDirectionTournamentId + "/candidates", { candidateIndex: 0 });
    const singleDirectionJobJson = JSON.parse(await readFile(singleDirectionCandidate.job.path, "utf8"));
    assert(singleDirectionJobJson.spriteContext.directions.join(",") === singleDirection, "single-direction candidate should request only the selected non-side direction");
    assert(singleDirectionJobJson.spriteContext.grid.columns === 20 && singleDirectionJobJson.spriteContext.grid.rows === 1 && singleDirectionJobJson.spriteContext.frames === 20, "single-direction candidate should keep a 20x1 / 20-frame final sheet contract");
    assert(singleDirectionJobJson.spriteContext.framesPerDirection === 20 && singleDirectionJobJson.spriteContext.motionRecipe.frameCount === 20, "single-direction candidate should preserve the experimental 20f metadata");
    assert(singleDirectionJobJson.notes.some((note) => note.includes("complete requested direction set")), "runner notes should describe the requested set instead of forcing five directions");
    await writeFile(join(singleDirectionCandidate.job.outboxPath, singleDirectionCandidate.job.id + `-${singleDirectionSlug}.png`), tinyPngBytes);
    await writeFile(join(singleDirectionCandidate.job.outboxPath, singleDirectionCandidate.job.id + "-manifest.json"), JSON.stringify({
      schema: "image-cockpit.direction-split-animation.v1",
      jobId: singleDirectionCandidate.job.id,
      action: "walk",
      directions: [singleDirection],
      framesPerDirection: 20,
      grid: { columns: 4, rows: 5, gutter: 0 },
      cell: { width: 256, height: 256 },
      files: { [singleDirectionSlug]: singleDirectionCandidate.job.id + `-${singleDirectionSlug}.png` },
      qualityGate: {
        classification: "usable-final",
        reason: "server verified",
        historyAllowed: true,
        downloadAllowed: true,
        retryable: false
      },
      animationQuality: animationQualityReport
    }, null, 2), "utf8");
    await getJson(port, "/api/codex/jobs/" + singleDirectionCandidate.job.id + "/results");
    await postJson(port, "/api/codex/tournaments/" + singleDirectionTournamentId + "/evaluation", {
      jobId: singleDirectionCandidate.job.id,
      ready: true,
      score: 3300,
      warningCount: 0,
      qualityReportRef: singleDirectionCandidate.job.id + "-manifest.json#animationQuality"
    });
    const acceptedSingleDirection = await postJson(port, "/api/codex/tournaments/" + singleDirectionTournamentId + "/winner", { jobId: singleDirectionCandidate.job.id });
    assert(acceptedSingleDirection.tournament.state === "accepted", "single-direction winner should reach the accepted state");
    const publishedSingleDirectionManifest = JSON.parse(await readFile(join(handoffDir, "outbox", singleDirectionCandidate.job.id + "-manifest.json"), "utf8"));
    assert(publishedSingleDirectionManifest.directions.join(",") === singleDirection, "published single-direction manifest should contain only the selected non-side direction");
    assert(Object.keys(publishedSingleDirectionManifest.files).join(",") === singleDirection, "published single-direction manifest should expose only the selected non-side file");
    assert(publishedSingleDirectionManifest.framesPerDirection === 20, "published single-direction manifest should preserve 20 frames per direction");
    assert(publishedSingleDirectionManifest.grid.columns === 4 && publishedSingleDirectionManifest.grid.rows === 5, "published single-direction manifest should preserve the 4x5 raw direction grid");
    assert(publishedSingleDirectionManifest.motionRecipe.frameCount === 20, "published single-direction manifest should preserve the 20f Motion Recipe metadata");

    const rejectedSingleDirectionPilot = await fetch("http://127.0.0.1:" + port + "/api/codex/tournaments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...singleDirectionRegistration,
        tournamentId: "smoke-single-direction-pilot-rejected",
        idempotencyKey: "smoke:single-direction:pilot-rejected:v1",
        pilotMode: true,
        pilotDirection: singleDirection
      })
    });
    const rejectedSingleDirectionPilotText = await rejectedSingleDirectionPilot.text();
    assert(
      rejectedSingleDirectionPilot.status === 500 && rejectedSingleDirectionPilotText.includes("Motion Pilot requires more than one requested direction"),
      "server should reject Motion Pilot for any single-direction tournament"
    );

    const rejectedNonCanonicalDirection = await fetch("http://127.0.0.1:" + port + "/api/codex/tournaments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...singleDirectionRegistration,
        tournamentId: "smoke-non-canonical-direction-rejected",
        idempotencyKey: "smoke:non-canonical-direction:rejected:v1",
        requestedDirections: ["left"],
        jobTemplate: { ...singleDirectionRegistration.jobTemplate, directions: ["left"] }
      })
    });
    const rejectedNonCanonicalDirectionText = await rejectedNonCanonicalDirection.text();
    assert(
      rejectedNonCanonicalDirection.status === 500 && rejectedNonCanonicalDirectionText.includes("Animation tournaments require 1, 3, or 5 directions"),
      "server should reject single-direction values outside the five canonical choices"
    );

    const registeredTournament = await postJson(port, "/api/codex/tournaments", tournamentRegistration);
    assert(registeredTournament.created === true, "first tournament registration should create the persistent manifest");
    assert(registeredTournament.tournament.generationProfile === "balanced", "tournament manifest should persist the generation profile");
    assert(registeredTournament.tournament.candidates.length === 3, "Balanced should persist a 2+1 candidate plan");
    assert(registeredTournament.tournament.clientContext.batchMatrixRunId === "batch-matrix-smoke", "Batch Matrix run identity should persist across reloads");
    assert(registeredTournament.tournament.clientContext.batchMatrixCellKey === "hist-smoke-source:walk-cycle", "Batch Matrix cells should keep an exact persistent lookup key");
    const duplicateRegistration = await postJson(port, "/api/codex/tournaments", tournamentRegistration);
    assert(duplicateRegistration.created === false, "same tournament idempotency key should reuse the manifest");
    const candidateA = await postJson(port, `/api/codex/tournaments/${persistentTournamentId}/candidates`, { candidateIndex: 0 });
    const duplicateCandidateA = await postJson(port, `/api/codex/tournaments/${persistentTournamentId}/candidates`, { candidateIndex: 0 });
    assert(candidateA.job.id === duplicateCandidateA.job.id, "duplicate tournament candidate POST should not start another job");
    assert(duplicateCandidateA.reused === true, "duplicate tournament candidate POST should report reused=true");
    const candidateC = await postJson(port, `/api/codex/tournaments/${persistentTournamentId}/candidates`, {
      candidateIndex: 2,
      reason: "one initial candidate failed"
    });
    assert(candidateC.tournament.thirdCandidateReason === "one initial candidate failed", "adaptive candidate reason should persist in the manifest");
    const failedCandidateEvaluation = await postJson(port, `/api/codex/tournaments/${persistentTournamentId}/evaluation`, {
      jobId: candidateC.job.id,
      ready: false,
      warningCount: Number.MAX_SAFE_INTEGER,
      reason: "smoke terminal failure"
    });
    assert(failedCandidateEvaluation.tournament.candidates[2].warningCount === 0, "failed evaluations should not persist the client warning sentinel");
    const savedHumanReview = await postJson(port, `/api/codex/tournaments/${persistentTournamentId}/review`, {
      review: {
        manualWinnerJobId: candidateA.job.id,
        decisions: [
          { jobId: candidateA.job.id, decision: "winner", reasonTags: [], note: "best silhouette" },
          { jobId: candidateC.job.id, decision: "reject", reasonTags: ["loop-seam", "loop-seam"], note: "visible seam" }
        ]
      }
    });
    assert(savedHumanReview.tournament.humanReview.manualWinnerJobId === candidateA.job.id, "human review should persist the manual winner separately from auto acceptance");
    assert(savedHumanReview.tournament.humanReview.decisions[1].reasonTags.length === 1, "human review reason tags should be normalized and deduplicated");
    const templateJson = JSON.parse(await readFile(join(handoffDir, "outbox", ".tournaments", persistentTournamentId, "template.json"), "utf8"));
    assert(templateJson.selectedImageDataUrl === "", "persistent tournament template should not duplicate the source Data URL");
    assert(templateJson.selectedImageAssetPath, "persistent tournament template should use a content-addressed source asset reference");
    const candidateAJson = JSON.parse(await readFile(candidateA.job.path, "utf8"));
    const candidateCJson = JSON.parse(await readFile(candidateC.job.path, "utf8"));
    assert(candidateAJson.selectedImage.assetPath === candidateCJson.selectedImage.assetPath, "tournament candidates should share one content-addressed source asset");

    const motionPilotId = "smoke-motion-pilot-tournament";
    const motionPilotRegistration = await postJson(port, "/api/codex/tournaments", {
      ...tournamentRegistration,
      tournamentId: motionPilotId,
      idempotencyKey: "smoke:motion-pilot:v1",
      generationProfile: "best",
      maximumCandidateCount: 3,
      initialCandidateCount: 3,
      pilotMode: true,
      pilotDirection: "side",
      clientContext: { ...tournamentRegistration.clientContext, label: "Smoke Motion Pilot" }
    });
    assert(motionPilotRegistration.tournament.pilotMode === true, "Motion Pilot should persist as an explicit experimental mode");
    assert(motionPilotRegistration.tournament.pilotDirection === "side", "Motion Pilot should persist the representative direction");
    const pilotCandidates = [];
    for (let index = 0; index < 3; index += 1) {
      const candidate = await postJson(port, `/api/codex/tournaments/${motionPilotId}/candidates`, { candidateIndex: index });
      pilotCandidates.push(candidate);
      const candidateJob = JSON.parse(await readFile(candidate.job.path, "utf8"));
      assert(candidateJob.spriteContext.directions.join(",") === "side", "pilot candidates should generate only the representative direction");
      assert(candidateJob.spriteContext.grid.rows === 1, "pilot candidate grid should have one direction row");
    }
    for (let index = 0; index < pilotCandidates.length; index += 1) {
      const candidate = pilotCandidates[index];
      await writeFile(join(candidate.job.outboxPath, `${candidate.job.id}-side.png`), tinyPngBytes);
      await writeFile(join(candidate.job.outboxPath, `${candidate.job.id}-manifest.json`), JSON.stringify({
        schema: "image-cockpit.direction-split-animation.v1",
        jobId: candidate.job.id,
        action: "walk",
        directions: ["side"],
        files: { side: `${candidate.job.id}-side.png` },
        chromaKey: { name: "green" },
        animationQuality: animationQualityReport
      }, null, 2), "utf8");
      const evaluated = await postJson(port, `/api/codex/tournaments/${motionPilotId}/evaluation`, {
        jobId: candidate.job.id,
        ready: true,
        score: 3300 - index * 100,
        warningCount: 0,
        qualityReportRef: `${candidate.job.id}-manifest.json#animationQuality`
      });
      if (index === 2) {
        assert(evaluated.tournament.state === "pilot-review", "three evaluated pilot candidates should stop at the human review gate");
        assert(evaluated.tournament.directionOutputCount === 3, "pilot review should report its three completed representative-direction outputs");
        assert(evaluated.tournament.totalCandidateJobs === 3, "pilot review should report all three initial candidate jobs");
      }
    }
    await postJson(port, `/api/codex/tournaments/${motionPilotId}/review`, {
      review: {
        manualWinnerJobId: pilotCandidates[0].job.id,
        decisions: [{ jobId: pilotCandidates[0].job.id, decision: "winner", reasonTags: ["motion-readability"], note: "smoke pilot winner" }]
      }
    });
    const pilotExpansion = await postJson(port, `/api/codex/tournaments/${motionPilotId}/pilot/expand`, { jobId: pilotCandidates[0].job.id });
    assert(pilotExpansion.tournament.state === "pilot-expanding", "adopting a pilot should start remaining-direction expansion without publishing a partial winner");
    assert(pilotExpansion.tournament.expansionDirectionIds.join(",") === "front,back", "pilot expansion should exclude the accepted representative direction");
    const expansionJobJson = JSON.parse(await readFile(pilotExpansion.job.path, "utf8"));
    assert(expansionJobJson.spriteContext.directions.join(",") === "front,back", "pilot expansion should generate only remaining directions");
    for (const slug of ["front", "back"]) {
      await writeFile(join(pilotExpansion.job.outboxPath, `${pilotExpansion.job.id}-${slug}.png`), tinyPngBytes);
    }
    await writeFile(join(pilotExpansion.job.outboxPath, `${pilotExpansion.job.id}-manifest.json`), JSON.stringify({
      schema: "image-cockpit.direction-split-animation.v1",
      jobId: pilotExpansion.job.id,
      action: "walk",
      directions: ["front", "back"],
      files: {
        front: `${pilotExpansion.job.id}-front.png`,
        back: `${pilotExpansion.job.id}-back.png`
      },
      chromaKey: { name: "green" },
      animationQuality: animationQualityReport
    }, null, 2), "utf8");
    await postJson(port, `/api/codex/tournaments/${motionPilotId}/evaluation`, {
      jobId: pilotExpansion.job.id,
      ready: true,
      score: 3200,
      warningCount: 0,
      qualityReportRef: `${pilotExpansion.job.id}-manifest.json#animationQuality`
    });
    const acceptedPilotExpansion = await postJson(port, `/api/codex/tournaments/${motionPilotId}/repairs/accept`, { jobId: pilotExpansion.job.id });
    assert(acceptedPilotExpansion.tournament.state === "accepted", "verified Motion Pilot expansion should publish one complete accepted winner");
    assert(acceptedPilotExpansion.tournament.pilotState === "completed", "Motion Pilot should persist its completed phase");
    assert(acceptedPilotExpansion.tournament.directionOutputCount === 5, "three pilot outputs plus two expansion directions should record five outputs for a 3-direction run");
    assert(acceptedPilotExpansion.tournament.totalCandidateJobs === 4, "Motion Pilot should record three pilot jobs plus one expansion job");
    const revalidatedPilotQuality = { ...animationQualityReport, identityScore: 97.5, recordedAt: new Date().toISOString() };
    await postJson(port, `/api/codex/artifacts/${pilotCandidates[0].job.id}/animation-quality`, { report: revalidatedPilotQuality });
    const publishedPilotManifest = JSON.parse(await readFile(join(handoffDir, "outbox", `${pilotCandidates[0].job.id}-manifest.json`), "utf8"));
    assert(publishedPilotManifest.animationQuality?.identityScore === 97.5, "accepted Pilot final revalidation should update the published root manifest, not only tournament work files");

    const motionPilotFallbackId = "smoke-motion-pilot-fallback";
    await postJson(port, "/api/codex/tournaments", {
      ...tournamentRegistration,
      tournamentId: motionPilotFallbackId,
      idempotencyKey: "smoke:motion-pilot:fallback:v1",
      generationProfile: "best",
      maximumCandidateCount: 3,
      initialCandidateCount: 3,
      pilotMode: true,
      pilotDirection: "side"
    });
    for (let index = 0; index < 3; index += 1) {
      const candidate = await postJson(port, `/api/codex/tournaments/${motionPilotFallbackId}/candidates`, { candidateIndex: index });
      await postJson(port, `/api/codex/tournaments/${motionPilotFallbackId}/evaluation`, { jobId: candidate.job.id, ready: true, score: 3000 - index, warningCount: 0 });
    }
    const pilotFallback = await postJson(port, `/api/codex/tournaments/${motionPilotFallbackId}/pilot/fallback`, { reason: "scores too close to call" });
    assert(pilotFallback.tournament.pilotState === "fallback", "Motion Pilot should persist the fallback reason and phase");
    assert(pilotFallback.fallbackTournament.generationProfile === "balanced", "Motion Pilot fallback should register the existing Balanced regime");
    assert(pilotFallback.fallbackTournament.pilotMode === false, "fallback tournament should use the standard full-direction path");
    assert(pilotFallback.fallbackTournament.requestedDirections.join(",") === "front,side,back", "fallback should restore every requested direction");
    await stopServer(server);
    server = startServer({
      port,
      handoffDir,
      env: {
        IMAGE_COCKPIT_CODEX_AUTORUN: "0",
        IMAGE_COCKPIT_ARTIFACT_STABLE_MS: "0"
      }
    });
    await waitForServer(server, port);
    const restoredTournament = await getJson(port, `/api/codex/tournaments/${persistentTournamentId}`);
    assert(restoredTournament.tournament.candidates[0].jobId === candidateA.job.id, "API restart should restore candidate A from disk manifest");
    assert(restoredTournament.tournament.candidates[2].jobId === candidateC.job.id, "API restart should restore adaptive candidate C without duplication");
    assert(restoredTournament.tournament.humanReview.decisions[0].note === "best silhouette", "API restart should restore human review notes from the tournament manifest");
    for (const slug of ["front", "side", "back"]) {
      await writeFile(join(candidateA.job.outboxPath, `${candidateA.job.id}-${slug}.png`), tinyPngBytes);
    }
    await writeFile(join(candidateA.job.outboxPath, `${candidateA.job.id}-manifest.json`), JSON.stringify({
      schema: "image-cockpit.direction-split-animation.v1",
      jobId: candidateA.job.id,
      action: "walk",
      directions: ["front", "side", "back"],
      files: {
        front: `${candidateA.job.id}-front.png`,
        side: `${candidateA.job.id}-side.png`,
        back: `${candidateA.job.id}-back.png`
      },
      chromaKey: { name: "green" }
    }, null, 2), "utf8");
    await getJson(port, `/api/codex/jobs/${candidateA.job.id}/results`);
    const evaluatedCandidate = await postJson(port, `/api/codex/tournaments/${persistentTournamentId}/evaluation`, {
      jobId: candidateA.job.id,
      ready: true,
      score: 3210,
      warningCount: 2,
      qualityReportRef: `${candidateA.job.id}-manifest.json#animationQuality`,
      reason: "smoke verified"
    });
    assert(evaluatedCandidate.tournament.candidates[0].state === "quality-evaluated", "verified tournament evaluation should persist");
    const transientRegression = await postJson(port, `/api/codex/tournaments/${persistentTournamentId}/evaluation`, {
      jobId: candidateA.job.id,
      ready: false,
      score: null,
      warningCount: Number.MAX_SAFE_INTEGER,
      reason: "transient stability read"
    });
    assert(transientRegression.tournament.candidates[0].state === "quality-evaluated", "transient reread should not downgrade an immutable evaluated candidate");
    assert(transientRegression.tournament.candidates[0].score === 3210, "transient reread should preserve the evaluated candidate score");
    assert(transientRegression.tournament.candidates[0].warningCount === 2, "transient reread should preserve the evaluated warning count");
    const acceptedWinner = await postJson(port, `/api/codex/tournaments/${persistentTournamentId}/winner`, { jobId: candidateA.job.id });
    assert(acceptedWinner.tournament.state === "accepted", "verified candidate should become the persistent tournament winner");
    const repeatedAcceptedWinner = await postJson(port, `/api/codex/tournaments/${persistentTournamentId}/winner`, { jobId: candidateA.job.id });
    assert(repeatedAcceptedWinner.reused === true, "same accepted winner should be idempotent");
    const rejectedDifferentWinner = await fetch(`http://127.0.0.1:${port}/api/codex/tournaments/${persistentTournamentId}/winner`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: candidateC.job.id })
    });
    assert(rejectedDifferentWinner.status === 409, "different winner should require an explicit saved manual override");
    const lateWinnerEvaluation = await postJson(port, `/api/codex/tournaments/${persistentTournamentId}/evaluation`, {
      jobId: candidateA.job.id,
      ready: true,
      score: 3200,
      warningCount: 9,
      reason: "late client evaluation after winner publish"
    });
    assert(lateWinnerEvaluation.tournament.state === "accepted", "late winner evaluation should preserve the accepted tournament state");
    assert(lateWinnerEvaluation.tournament.candidates[0].state === "accepted", "late winner evaluation should not regress the accepted candidate state");
    assert(Object.values(lateWinnerEvaluation.tournament.directionStates).every((direction) => direction.state === "accepted"), "late winner evaluation should preserve accepted direction states");
    const failedRepair = await postJson(port, `/api/codex/tournaments/${persistentTournamentId}/repairs`, { directions: ["side"] });
    await postJson(port, `/api/codex/tournaments/${persistentTournamentId}/evaluation`, {
      jobId: failedRepair.job.id,
      ready: false,
      score: null,
      warningCount: 0,
      reason: "simulated transient client race"
    });
    const recoveredAfterRepairFailure = await getJson(port, `/api/codex/tournaments/${persistentTournamentId}`);
    assert(recoveredAfterRepairFailure.tournament.state === "accepted", "failed Direction Repair should restore the accepted winner state");
    assert(Object.values(recoveredAfterRepairFailure.tournament.directionStates).every((direction) => direction.state === "accepted"), "failed Direction Repair should restore every winner direction state");
    const repair = await postJson(port, `/api/codex/tournaments/${persistentTournamentId}/repairs`, { directions: ["side"] });
    assert(repair.job.id !== failedRepair.job.id, "failed Direction Repair should allow one bounded retry with a new job id");
    await writeFile(join(repair.job.outboxPath, `${repair.job.id}-side.png`), tinyPngBytes);
    await writeFile(join(repair.job.outboxPath, `${repair.job.id}-manifest.json`), JSON.stringify({
      schema: "image-cockpit.direction-split-animation.v1",
      jobId: repair.job.id,
      action: "walk",
      directions: ["side"],
      files: { side: `${repair.job.id}-side.png` },
      chromaKey: { name: "green" },
      quality: "gold",
      qualityGate: {
        classification: "usable-final",
        reason: "server verified repair",
        historyAllowed: true,
        downloadAllowed: true,
        retryable: false
      }
    }, null, 2), "utf8");
    await getJson(port, `/api/codex/jobs/${repair.job.id}/results`);
    await postJson(port, `/api/codex/artifacts/${repair.job.id}/animation-quality`, { report: animationQualityReport });
    const acceptedRepair = await postJson(port, `/api/codex/tournaments/${persistentTournamentId}/repairs/accept`, { jobId: repair.job.id });
    assert(acceptedRepair.tournament.state === "accepted", "verified Direction Repair should return the tournament to accepted");
    assert(acceptedRepair.repairedDirections.join(",") === "side", "Direction Repair should replace only the requested direction");
    assert(acceptedRepair.beforeHashes.front === acceptedRepair.afterHashes.front, "Direction Repair should preserve the front hash");
    assert(acceptedRepair.beforeHashes.back === acceptedRepair.afterHashes.back, "Direction Repair should preserve the back hash");
    assert(acceptedRepair.tournament.directionStates.side.jobId === repair.job.id, "accepted Direction Repair should attribute the repaired direction to the repair job");
    assert(acceptedRepair.tournament.directionStates.front.jobId === candidateA.job.id, "accepted Direction Repair should attribute untargeted directions to the preserved winner");
    for (const slug of ["front", "side", "back"]) {
      await writeFile(join(candidateC.job.outboxPath, `${candidateC.job.id}-${slug}.png`), tinyPngBytes);
    }
    await writeFile(join(candidateC.job.outboxPath, `${candidateC.job.id}-manifest.json`), JSON.stringify({
      schema: "image-cockpit.direction-split-animation.v1",
      jobId: candidateC.job.id,
      action: "walk",
      directions: ["front", "side", "back"],
      files: {
        front: `${candidateC.job.id}-front.png`,
        side: `${candidateC.job.id}-side.png`,
        back: `${candidateC.job.id}-back.png`
      },
      chromaKey: { name: "green" }
    }, null, 2), "utf8");
    await getJson(port, `/api/codex/jobs/${candidateC.job.id}/results`);
    await postJson(port, `/api/codex/tournaments/${persistentTournamentId}/review`, {
      review: {
        manualWinnerJobId: candidateC.job.id,
        decisions: [
          { jobId: candidateA.job.id, decision: "reject", reasonTags: ["manual-override"], note: "replaced after review" },
          { jobId: candidateC.job.id, decision: "winner", reasonTags: ["manual-override"], note: "explicit replacement" }
        ]
      }
    });
    const manualWinnerOverride = await postJson(
      port,
      `/api/codex/tournaments/${persistentTournamentId}/winner`,
      { jobId: candidateC.job.id }
    );
    assert(manualWinnerOverride.tournament.winnerCandidateId === candidateC.job.id, "saved human review should still allow an explicit manual winner override");
    const cancelledTournament = await postJson(port, `/api/codex/tournaments/${persistentTournamentId}/cancel`, {});
    assert(cancelledTournament.tournament.state === "cancelled", "tournament cancel should persist a terminal cancelled state");

    const delayedRecoveryTournamentId = "smoke-delayed-artifact-recovery";
    await postJson(port, "/api/codex/tournaments", {
      ...tournamentRegistration,
      tournamentId: delayedRecoveryTournamentId,
      idempotencyKey: "smoke:delayed-artifact-recovery:v1",
      generationProfile: "fast",
      maximumCandidateCount: 1,
      initialCandidateCount: 1,
      clientContext: { ...tournamentRegistration.clientContext, label: "Smoke delayed artifact recovery" }
    });
    const delayedRecoveryCandidate = await postJson(port, `/api/codex/tournaments/${delayedRecoveryTournamentId}/candidates`, { candidateIndex: 0 });
    await postJson(port, `/api/codex/tournaments/${delayedRecoveryTournamentId}/evaluation`, {
      jobId: delayedRecoveryCandidate.job.id,
      ready: false,
      warningCount: 0,
      reason: "transient client fetch failure"
    });
    const failedDelayedRecovery = await getJson(port, `/api/codex/tournaments/${delayedRecoveryTournamentId}`);
    assert(failedDelayedRecovery.tournament.state === "failed", "a sole failed candidate should move the tournament to failed");
    const recoveredDelayedEvaluation = await postJson(port, `/api/codex/tournaments/${delayedRecoveryTournamentId}/evaluation`, {
      jobId: delayedRecoveryCandidate.job.id,
      ready: true,
      score: 3300,
      warningCount: 4,
      reason: "verified artifacts arrived after the transient failure"
    });
    assert(recoveredDelayedEvaluation.tournament.state === "running", "a delayed verified artifact evaluation should recover a failed tournament");
    assert(recoveredDelayedEvaluation.tournament.candidates[0].state === "quality-evaluated", "delayed verified artifacts should restore the candidate evaluation");

    const tournamentJob = await postJson(port, "/api/codex/jobs", {
      workflowMode: "sprite-generate",
      prompt: "Smoke test hidden tournament Quality v2 persistence",
      selectedImageName: "tiny.png",
      selectedImageSize: "1x1",
      selectedImageSource: "import",
      selectedImageDataUrl: tinyPng,
      grid: { columns: 8, rows: 3, gutter: 0 },
      action: "walk",
      frames: 24,
      cell: { width: 256, height: 256 },
      chromaKey: "green",
      spriteVariant: "standard",
      directions: ["front", "side", "back"],
      tournamentId: "smoke-quality-v2-tournament",
      tournamentCandidateIndex: 0,
      tournamentCandidateCount: 1
    });
    const hiddenManifestPath = join(tournamentJob.outboxPath, `${tournamentJob.id}-manifest.json`);
    await writeFile(hiddenManifestPath, JSON.stringify({
      schema: "image-cockpit.direction-split-animation.v1",
      jobId: tournamentJob.id,
      quality: "gold",
      qualityGate: {
        classification: "usable-final",
        reason: "server verified",
        historyAllowed: true,
        downloadAllowed: true,
        retryable: false
      }
    }, null, 2), "utf8");
    await postJson(port, `/api/codex/artifacts/${encodeURIComponent(tournamentJob.id)}/animation-quality`, {
      report: animationQualityReport
    });
    const hiddenManifest = JSON.parse(await readFile(hiddenManifestPath, "utf8"));
    assert(hiddenManifest.animationQuality?.metricVersion === animationQualityReport.metricVersion, "Quality v2 should persist beside a hidden tournament candidate");
    assert(hiddenManifest.qualityGate?.classification === "usable-final", "hidden tournament Quality v2 persistence should preserve the hard gate");
    const unexpectedRootTournamentManifest = await stat(join(handoffDir, "outbox", `${tournamentJob.id}-manifest.json`)).then(() => true, () => false);
    assert(unexpectedRootTournamentManifest === false, "report-only persistence should not leak a hidden tournament manifest into root outbox");
    assert(
      generateJobJson.notes.some((note) => note.includes("built-in image generation path")),
      "generation job should instruct Codex to use the imagegen built-in image generation path"
    );
    assert(
      generateJobJson.notes.some((note) => note.includes("Do not create a procedural placeholder")),
      "generation job should forbid procedural placeholder images"
    );

    const spriteGenerateJob = await postJson(port, "/api/codex/jobs", {
      workflowMode: "sprite-generate",
      prompt: "Smoke test sprite sheet generation",
      negativePrompt: "text",
      jobNotes: "Create a 4x3 12-frame dash sheet per requested direction with transparent background.",
      selectedImageName: "tiny.png",
      selectedImageSize: "1x1",
      selectedImageSource: "sample",
      selectedImageDataUrl: tinyPng,
      annotations: [{ id: "ann-sprite-ignored", tool: "rect", color: "#00ff00", points: [{ x: 0, y: 0 }] }],
      grid: { columns: 12, rows: 5, gutter: 0 },
      action: "dash",
      frames: 60,
      framesPerDirection: 12,
      cell: { width: 512, height: 512 },
      chromaKey: "green",
      spriteVariant: "standard",
      directions: ["front", "front three-quarter", "side", "back three-quarter", "back"],
      motionRecipe: {
        id: "dash",
        version: 1,
        compilerVersion: "1.1.0",
        qualityProfile: "airborne-or-exempt",
        bodyTopology: "quadruped",
        frameCount: 12,
        modifiers: {
          intensity: "strong",
          tempo: "fast",
          weight: "heavy",
          exaggeration: "high",
          handedness: "inherit",
          weaponClass: "none",
          travelAmount: "short",
          secondaryMotionLevel: "high",
          vfxAmount: "low"
        },
        experimental: true
      }
    });
    const spriteGenerateJobJson = JSON.parse(await readFile(spriteGenerateJob.path, "utf8"));
    assert(spriteGenerateJobJson.workflowMode === "sprite-generate", "sprite generation job should include workflowMode");
    assert(spriteGenerateJobJson.intent.includes("chroma-key animation sprite sheet"), "sprite generation job should include sprite intent");
    assert(spriteGenerateJobJson.spriteContext.frames === 60, "sprite generation job should include total sprite frame count");
    assert(spriteGenerateJobJson.spriteContext.framesPerDirection === 12, "sprite generation job should preserve the selected frame budget");
    assert(spriteGenerateJobJson.spriteContext.grid.columns === 12, "sprite generation job should preserve the final sheet grid columns");
    assert(spriteGenerateJobJson.spriteContext.action === "dash", "sprite generation job should include action");
    assert(spriteGenerateJobJson.spriteContext.cell.width === 512, "sprite generation job should include cell size");
    assert(spriteGenerateJobJson.spriteContext.chromaKey === "green", "sprite generation job should include chroma key");
    assert(spriteGenerateJobJson.spriteContext.variant === "standard", "sprite generation job should include the standard variant");
    assert(spriteGenerateJobJson.spriteContext.directions.length === 5, "sprite generation job should include five direction rows");
    assert(spriteGenerateJobJson.spriteContext.motionRecipe.bodyTopology === "quadruped", "sprite generation job should preserve topology metadata");
    assert(spriteGenerateJobJson.spriteContext.motionRecipe.modifiers.weight === "heavy", "sprite generation job should preserve structured modifiers");
    assert(spriteGenerateJobJson.selectedImage.assetPath, "sprite generation job should attach the source image");
    assert(spriteGenerateJobJson.annotationContext.annotationCount === 0, "sprite generation job should not carry edit annotations");
    assert(
      spriteGenerateJobJson.notes.some((note) => note.includes("built-in image_gen")),
      "sprite generation job should instruct Codex to use built-in image generation"
    );
    const duplicateDirectionJob = await postJson(port, "/api/codex/jobs", {
      workflowMode: "sprite-generate",
      prompt: "Smoke test canonical direction normalization",
      spriteVariant: "standard",
      framesPerDirection: 8,
      directions: [...Array(20).fill("front"), "unknown-direction"]
    });
    const duplicateDirectionJobJson = JSON.parse(await readFile(duplicateDirectionJob.path, "utf8"));
    assert(
      duplicateDirectionJobJson.spriteContext.directions.join(",") === "front",
      "standard sprite jobs should canonicalize and deduplicate directions before the runner sees them"
    );
    const invalidDirectionCountResponse = await fetch(`http://127.0.0.1:${port}/api/codex/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workflowMode: "sprite-generate",
        prompt: "Smoke test invalid two-direction initial request",
        spriteVariant: "standard",
        framesPerDirection: 8,
        directions: ["front", "side"]
      })
    });
    assert(invalidDirectionCountResponse.status === 400, "normal standard sprite jobs should reject a two-direction initial request");

    const effectAnimationJob = await postJson(port, "/api/codex/jobs", {
      workflowMode: "effect-animation",
      prompt: "Smoke test transparent slash effect animation sheet",
      negativePrompt: "text, watermark, checkerboard background",
      jobNotes: "Return an 8-frame transparent effect sheet.",
      selectedImageName: "tiny.png",
      selectedImageSize: "1x1",
      selectedImageSource: "sample",
      selectedImageDataUrl: tinyPng,
      grid: { columns: 4, rows: 2, gutter: 0 },
      action: "slash-arc-crescent-8f",
      frames: 8,
      cell: { width: 128, height: 128 },
      effectContext: {
        kind: "effect-animation",
        name: "slash-arc-crescent-8f",
        category: "slash-arc",
        type: "crescent",
        style: "pixel-clean",
        colorPalette: "cyan-white",
        frameCount: 8,
        frameSize: { width: 128, height: 128 },
        layout: { id: "grid-4x2", columns: 4, rows: 2 },
        loopMode: "one-shot",
        fps: 12,
        anchor: { x: 64, y: 64, mode: "center" },
        blendMode: "additive",
        background: "transparent",
        alphaPremultiplied: false,
        qualityRank: "blocked",
        warnings: [],
        recipe: {
          id: "effect-recipe:slash-arc",
          version: 1,
          category: "slash-arc",
          frameCount: 8,
          canvasSize: 128,
          loopMode: "one-shot",
          anchorMode: "center",
          blendMode: "additive",
          energyEnvelope: "burst"
        },
        sheetSize: { width: 512, height: 256 },
        promptContract: ["transparent PNG sheet", "no checkerboard"],
        negativePrompt: "text, watermark, checkerboard background"
      }
    });
    const effectAnimationJobJson = JSON.parse(await readFile(effectAnimationJob.path, "utf8"));
    assert(effectAnimationJobJson.workflowMode === "effect-animation", "effect animation job should include workflowMode");
    assert(effectAnimationJobJson.intent.includes("transparent game VFX animation sheet"), "effect animation job should include VFX intent");
    assert(!effectAnimationJobJson.selectedImage.assetPath, "effect animation job should not attach the current selected image");
    assert(effectAnimationJobJson.spriteContext.frames === 8, "effect animation job should include frame count in sprite context");
    assert(effectAnimationJobJson.spriteContext.grid.columns === 4, "effect animation job should include sheet columns");
    assert(effectAnimationJobJson.spriteContext.cell.width === 128, "effect animation job should include effect cell size");
    assert(effectAnimationJobJson.effectContext.category === "slash-arc", "effect animation job should preserve effect category");
    assert(effectAnimationJobJson.effectContext.layout.rows === 2, "effect animation job should preserve effect layout");
    assert(effectAnimationJobJson.effectContext.recipe.energyEnvelope === "burst", "effect animation job should preserve the VFX recipe envelope");
    assert(
      effectAnimationJobJson.notes.some((note) => note.includes("real alpha transparency")),
      "effect animation job should require real alpha transparency"
    );
    assert(
      effectAnimationJobJson.notes.some((note) => note.includes("Do not bake checkerboard")),
      "effect animation job should forbid baked checkerboard backgrounds"
    );

    const hatchPetJob = await postJson(port, "/api/codex/jobs", {
      workflowMode: "sprite-generate",
      prompt: "Smoke test hatch-pet atlas generation with a canonical base identity",
      negativePrompt: "text, logo, shadows",
      jobNotes: "Experimental hatch-pet sprite workflow. Expected atlas: 8 columns x 9 rows, 192x208 per cell, 1536x1872 total.",
      selectedImageName: "tiny.png",
      selectedImageSize: "1x1",
      selectedImageSource: "sample",
      selectedImageDataUrl: tinyPng,
      grid: { columns: 8, rows: 9, gutter: 0 },
      action: "hatch-pet-atlas",
      frames: 72,
      cell: { width: 192, height: 208 },
      chromaKey: "magenta",
      spriteVariant: "hatch-pet",
      directions: ["idle", "running-right", "running-left", "waving", "jumping", "failed", "waiting", "running", "review"]
    });
    const hatchPetJobJson = JSON.parse(await readFile(hatchPetJob.path, "utf8"));
    assert(hatchPetJobJson.workflowMode === "sprite-generate", "hatch-pet job should still use sprite generation workflow");
    assert(hatchPetJobJson.spriteContext.variant === "hatch-pet", "hatch-pet job should include hatch-pet variant");
    assert(hatchPetJobJson.spriteContext.frames === 72, "hatch-pet job should include 72 atlas cells");
    assert(hatchPetJobJson.spriteContext.cell.width === 192, "hatch-pet job should include 192px cell width");
    assert(hatchPetJobJson.spriteContext.cell.height === 208, "hatch-pet job should include 208px cell height");
    assert(hatchPetJobJson.spriteContext.grid.rows === 9, "hatch-pet job should include 9 state rows");
    assert(hatchPetJobJson.spriteContext.directions.includes("review"), "hatch-pet job should include Codex pet state rows");
    assert(
      hatchPetJobJson.jobNotes.includes("hatch-pet"),
      "hatch-pet job should instruct Codex to use the hatch-pet workflow"
    );

    const directionalHatchPetJob = await postJson(port, "/api/codex/jobs", {
      workflowMode: "sprite-generate",
      prompt: "Smoke test 5-direction hatch-pet atlas set generation",
      negativePrompt: "text, logo, shadows",
      jobNotes: "Directional hatch-pet workflow. Return exactly five final spritesheet images to the outbox with the job id filename prefix and direction suffixes.",
      selectedImageName: "tiny.png",
      selectedImageSize: "1x1",
      selectedImageSource: "sample",
      selectedImageDataUrl: tinyPng,
      grid: { columns: 8, rows: 45, gutter: 0 },
      action: "5-direction-hatch-pet-atlas",
      frames: 360,
      cell: { width: 192, height: 208 },
      chromaKey: "green",
      spriteVariant: "directional-hatch-pet",
      directions: ["front", "front three-quarter", "side", "back three-quarter", "back"]
    });
    const directionalHatchPetJobJson = JSON.parse(await readFile(directionalHatchPetJob.path, "utf8"));
    assert(directionalHatchPetJobJson.workflowMode === "sprite-generate", "directional hatch-pet job should use sprite generation workflow");
    assert(directionalHatchPetJobJson.spriteContext.variant === "directional-hatch-pet", "directional hatch-pet job should include the directional hatch-pet variant");
    assert(directionalHatchPetJobJson.spriteContext.frames === 360, "directional hatch-pet job should include 360 atlas cells");
    assert(directionalHatchPetJobJson.spriteContext.grid.rows === 45, "directional hatch-pet job should combine five 9-row atlases internally");
    assert(directionalHatchPetJobJson.spriteContext.cell.width === 192, "directional hatch-pet job should include 192px cell width");
    assert(directionalHatchPetJobJson.spriteContext.directions.length === 5, "directional hatch-pet job should include five directions");
    assert(
      directionalHatchPetJobJson.jobNotes.includes("five separate hatch-pet atlases") ||
        directionalHatchPetJobJson.jobNotes.includes("exactly five final spritesheet images"),
      "directional hatch-pet job should instruct Codex to return five atlas images"
    );

    const spriteEditJob = await postJson(port, "/api/codex/jobs", {
      workflowMode: "sprite-edit",
      prompt: "Smoke test sprite sheet editing",
      negativePrompt: "text",
      jobNotes: "Normalize anchors and clean magenta key color.",
      selectedImageName: "tiny.png",
      selectedImageSize: "1x1",
      selectedImageSource: "sample",
      selectedImageDataUrl: tinyPng,
      annotations: [{ id: "ann-sprite-edit-ignored", tool: "rect", color: "#0000ff", points: [{ x: 0, y: 0 }] }],
      grid: { columns: 8, rows: 4, gutter: 0 },
      action: "walk",
      frames: 32
    });
    const spriteEditJobJson = JSON.parse(await readFile(spriteEditJob.path, "utf8"));
    assert(spriteEditJobJson.workflowMode === "sprite-edit", "sprite edit job should include workflowMode");
    assert(spriteEditJobJson.intent.includes("revise sprite-sheet frames"), "sprite edit job should include sprite edit intent");
    assert(spriteEditJobJson.spriteContext.frames === 32, "sprite edit job should include sprite frame count");
    assert(spriteEditJobJson.spriteContext.grid.rows === 4, "sprite edit job should include sprite grid rows");
    assert(spriteEditJobJson.spriteContext.action === "walk", "sprite edit job should include action");
    assert(!spriteEditJobJson.selectedImage.assetPath, "sprite edit job should not attach the current selected image");
    assert(spriteEditJobJson.annotationContext.annotationCount === 0, "sprite edit job should not carry edit annotations");

    const status = await getJson(port, `/api/codex/jobs/${encodeURIComponent(job.id)}/status`);
    assert(status.status.state === "disabled", "status endpoint should return disabled runner state");
  } finally {
    await stopServer(server);
    await rm(handoffDir, { recursive: true, force: true });
  }
}

async function runMockRunnerGuardSmoke() {
  const port = String(9300 + Math.floor(Math.random() * 400));
  const handoffDir = await mkdtemp(join(tmpdir(), "image-cockpit-smoke-mock-guard-"));
  const mockRunnerPath = join(handoffDir, "mock-codex-runner.mjs");
  await writeFile(mockRunnerPath, mockRunnerSource(), "utf8");

  let server = startServer({
    port,
    handoffDir,
    env: {
      IMAGE_COCKPIT_CODEX_AUTORUN: "1",
      IMAGE_COCKPIT_CODEX_COMMAND: nodeCommand,
      IMAGE_COCKPIT_CODEX_HELP_ARGS_JSON: JSON.stringify([mockRunnerPath, "--help"]),
      IMAGE_COCKPIT_CODEX_EXEC_ARGS_JSON: JSON.stringify([mockRunnerPath]),
      IMAGE_COCKPIT_ARTIFACT_STABLE_MS: "0"
    }
  });

  try {
    await waitForServer(server, port);

    const runnerPreflight = await getJson(port, "/api/codex/runner");
    assert(runnerPreflight.runner?.state === "unavailable", "unapproved mock runner should not report ready");
    assert(runnerPreflight.runner?.mode === "mock", "unapproved mock runner should report mock mode");
    assert(runnerPreflight.runner?.mockRunnerAllowed === false, "unapproved mock runner should expose mockRunnerAllowed=false");
    assert(runnerPreflight.runner?.errorCode === "mock_runner", "unapproved mock runner should report mock_runner error");

    const health = await getJson(port, "/api/health");
    assert(health.runner?.state === "unavailable", "health should not report unapproved mock runner as ready");
    assert(health.runner?.mode === "mock", "health should expose mock runner mode");

    const job = await postJson(port, "/api/codex/jobs", {
      workflowMode: "image-generate",
      prompt: "Smoke test unapproved mock runner guard",
      negativePrompt: "text",
      jobNotes: "This should not spawn the mock runner.",
      annotations: [],
      grid: { columns: 1, rows: 1, gutter: 0 },
      action: "",
      frames: 0
    });
    assert(job.runner?.state === "unavailable", "unapproved mock runner job should not start running");
    assert(job.runner?.diagnostic?.kind === "runner_failed", "unapproved mock runner should return a runner diagnostic");
    const status = await getJson(port, `/api/codex/jobs/${encodeURIComponent(job.id)}/status`);
    assert(status.status.state === "unavailable", "status endpoint should keep unapproved mock runner unavailable");
    const outboxList = await getJson(port, "/api/codex/results");
    assert(!outboxList.results.some((result) => result.name.startsWith(job.id)), "unapproved mock runner should not create fake images");
  } finally {
    await stopServer(server);
    await rm(handoffDir, { recursive: true, force: true });
  }
}

async function runMockAutorunSmoke() {
  const port = String(9300 + Math.floor(Math.random() * 400));
  const handoffDir = await mkdtemp(join(tmpdir(), "image-cockpit-smoke-autorun-"));
  const mockRunnerPath = join(handoffDir, "mock-codex-runner.mjs");
  await writeFile(mockRunnerPath, mockRunnerSource(), "utf8");

  const autorunEnv = {
    IMAGE_COCKPIT_CODEX_AUTORUN: "1",
    IMAGE_COCKPIT_ALLOW_MOCK_RUNNER: "1",
    IMAGE_COCKPIT_CODEX_COMMAND: nodeCommand,
    IMAGE_COCKPIT_CODEX_HELP_ARGS_JSON: JSON.stringify([mockRunnerPath, "--help"]),
    IMAGE_COCKPIT_CODEX_EXEC_ARGS_JSON: JSON.stringify([
      mockRunnerPath,
      "exec",
      "-c",
      'approval_policy="never"',
      "--sandbox",
      "workspace-write",
      "-"
    ]),
    IMAGE_COCKPIT_ARTIFACT_STABLE_MS: "0"
  };
  let server = startServer({
    port,
    handoffDir,
    env: autorunEnv
  });
  let simulatedOrphanRunner = null;

  try {
    await waitForServer(server, port);

    const runnerPreflight = await getJson(port, "/api/codex/runner");
    assert(runnerPreflight.runner?.state === "ready", "mock autorun preflight should report ready");
    assert(runnerPreflight.runner?.autorun === true, "mock autorun preflight should include autorun=true");
    assert(
      runnerPreflight.runner?.resolvedCommandPaths?.some((path) => path === nodeCommand),
      "mock autorun preflight should expose resolved command path"
    );

    const resumableJob = await postJson(port, "/api/codex/jobs", {
      workflowMode: "image-generate",
      prompt: "Smoke test API restart resume",
      negativePrompt: "text",
      jobNotes: "Delay completion so the API can restart.",
      annotations: [],
      grid: { columns: 1, rows: 1, gutter: 0 },
      action: "",
      frames: 0
    });
    assert(resumableJob.runner?.state === "running", "restart-resume fixture should start in running state");
    const originalStartedAt = resumableJob.runner.startedAt;
    await stopServer(server);
    server = startServer({ port, handoffDir, env: autorunEnv });
    await waitForServer(server, port);
    const resumedStatus = await waitForJobState(port, resumableJob.id, "completed");
    assert(resumedStatus.status.resumeCount === 1, "API restart should resume an untracked running job once");
    assert(resumedStatus.status.initialStartedAt === originalStartedAt, "resumed runner should preserve the initial start time");
    assert(resumedStatus.status.resumedAt, "resumed runner should record resumedAt");

    const capacityHoldTemplate = {
      workflowMode: "sprite-generate",
      prompt: "Smoke test capacity hold",
      negativePrompt: "text",
      jobNotes: "Keep three runner slots occupied for the tournament admission guard.",
      annotations: [],
      directions: ["front", "front three-quarter", "side", "back three-quarter", "back"],
      grid: { columns: 8, rows: 5, gutter: 0 },
      action: "idle",
      frames: 40,
      framesPerDirection: 8
    };
    const capacityJobs = [];
    for (let index = 0; index < 3; index += 1) capacityJobs.push(await postJson(port, "/api/codex/jobs", capacityHoldTemplate));
    assert(capacityJobs.every((item) => item.runner?.state === "running"), "capacity fixture should occupy all three runner slots");
    const capacityTournamentId = "smoke-runner-cap-tournament";
    await postJson(port, "/api/codex/tournaments", {
      tournamentId: capacityTournamentId,
      idempotencyKey: "smoke:runner-cap:v1",
      sourceFingerprint: "smoke-runner-cap-source",
      motionRecipeId: "idle-breathing",
      motionRecipeVersion: 1,
      motionRecipeCompilerVersion: "1.1.0",
      presetId: "idle",
      generationProfile: "fast",
      requestedDirections: capacityHoldTemplate.directions,
      maximumCandidateCount: 1,
      initialCandidateCount: 1,
      jobTemplate: capacityHoldTemplate
    });
    const capacityResponse = await fetch(`http://127.0.0.1:${port}/api/codex/tournaments/${capacityTournamentId}/candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateIndex: 0 })
    });
    const capacityText = await capacityResponse.text();
    assert(capacityResponse.status === 500 && capacityText.includes("runner slots are full (3/3)"), `fourth tournament runner should be rejected before manifest mutation: ${capacityResponse.status} ${capacityText}`);
    await Promise.all(capacityJobs.map((item) => waitForJobState(port, item.id, "completed")));

    const smartRaceTournamentId = "smoke-smart-race-cancellation";
    const smartRaceRegistration = await postJson(port, "/api/codex/tournaments", {
      tournamentId: smartRaceTournamentId,
      idempotencyKey: "smoke:smart-race:cancellation:v1",
      sourceFingerprint: "smoke-smart-race-source",
      motionRecipeId: "walk-cycle",
      motionRecipeVersion: 1,
      motionRecipeCompilerVersion: "1.2.0",
      presetId: "walk-cycle",
      generationProfile: "best",
      requestedDirections: ["front", "side", "back"],
      maximumCandidateCount: 3,
      initialCandidateCount: 3,
      jobTemplate: {
        workflowMode: "sprite-generate",
        prompt: "Smart Race cancellation fixture",
        negativePrompt: "text",
        jobNotes: "Candidate A stays active while B and C finish.",
        selectedImageName: "tiny.png",
        selectedImageSize: "1x1",
        selectedImageSource: "import",
        selectedImageDataUrl: tinyPng,
        grid: { columns: 8, rows: 3, gutter: 0 },
        action: "walk",
        frames: 24,
        framesPerDirection: 8,
        cell: { width: 256, height: 256 },
        chromaKey: "green",
        spriteVariant: "standard",
        directions: ["front", "side", "back"]
      }
    });
    assert(smartRaceRegistration.tournament.selectionPolicy === "smart-race", "new non-Pilot Best tournaments should persist Smart Race");
    const smartRaceCandidates = [];
    for (let index = 0; index < 3; index += 1) {
      smartRaceCandidates.push(await postJson(port, `/api/codex/tournaments/${smartRaceTournamentId}/candidates`, { candidateIndex: index }));
    }
    const smartRaceA = smartRaceCandidates[0];
    const smartRaceB = smartRaceCandidates[1];
    const smartRaceC = smartRaceCandidates[2];
    for (const slug of ["front", "side", "back"]) {
      await writeFile(join(smartRaceC.job.outboxPath, `${smartRaceC.job.id}-${slug}.png`), tinyPngBytes);
    }
    await writeFile(join(smartRaceC.job.outboxPath, `${smartRaceC.job.id}-manifest.json`), JSON.stringify({
      schema: "image-cockpit.direction-split-animation.v1",
      jobId: smartRaceC.job.id,
      action: "walk",
      directions: ["front", "side", "back"],
      framesPerDirection: 8,
      files: {
        front: `${smartRaceC.job.id}-front.png`,
        side: `${smartRaceC.job.id}-side.png`,
        back: `${smartRaceC.job.id}-back.png`
      },
      chromaKey: { name: "green" }
    }, null, 2), "utf8");
    await Promise.all([
      waitForJobState(port, smartRaceB.job.id, "completed"),
      waitForJobState(port, smartRaceC.job.id, "completed")
    ]);
    const smartRaceAStatus = await getJson(port, `/api/codex/jobs/${smartRaceA.job.id}/status`);
    assert(smartRaceAStatus.status.state === "running", "Smart Race fixture should keep candidate A active");
    await postJson(port, `/api/codex/tournaments/${smartRaceTournamentId}/evaluation`, {
      jobId: smartRaceB.job.id,
      ready: true,
      score: 3275,
      warningCount: 5,
      identityScore: 82.04,
      shadowWouldBlock: true,
      reason: "measured B fixture"
    });
    await postJson(port, `/api/codex/tournaments/${smartRaceTournamentId}/evaluation`, {
      jobId: smartRaceC.job.id,
      ready: true,
      score: 3325,
      warningCount: 3,
      identityScore: 83.96,
      shadowWouldBlock: false,
      reason: "measured C fixture"
    });
    const smartRaceWinnerRequest = {
      jobId: smartRaceC.job.id,
      decision: {
        mode: "early-accept",
        reason: "two ready Best candidates have a clear Smart Race winner",
        comparedJobIds: [smartRaceB.job.id, smartRaceC.job.id],
        scoreGap: 50
      }
    };
    const acceptedSmartRace = await postJson(
      port,
      `/api/codex/tournaments/${smartRaceTournamentId}/winner`,
      smartRaceWinnerRequest
    );
    assert(acceptedSmartRace.tournament.state === "accepted", "Smart Race winner should be durably accepted");
    assert(acceptedSmartRace.tournament.smartRaceDecision.winnerJobId === smartRaceC.job.id, "Smart Race decision should persist candidate C");
    assert(acceptedSmartRace.tournament.smartRaceDecision.scoreGap === 50, "Smart Race should persist the server-calculated score gap");
    assert(acceptedSmartRace.tournament.candidates[0].state === "cancelled", "unfinished candidate A should be marked cancelled");
    assert(
      acceptedSmartRace.cancellationResults.some((result) => result.jobId === smartRaceA.job.id && result.ok),
      "winner response should include the server-side candidate A cancellation"
    );
    const cancelledSmartRaceA = await getJson(port, `/api/codex/jobs/${smartRaceA.job.id}/status`);
    assert(cancelledSmartRaceA.status.state === "failed" && cancelledSmartRaceA.status.message.includes("cancelled"), "candidate A runner should stop inside winner acceptance");
    const completedSmartRaceB = await getJson(port, `/api/codex/jobs/${smartRaceB.job.id}/status`);
    assert(completedSmartRaceB.status.state === "completed", "candidate B should be terminal before crash-window simulation");
    const firstDecisionTimestamp = acceptedSmartRace.tournament.smartRaceDecision.decidedAt;
    const repeatedSmartRaceWinner = await postJson(
      port,
      `/api/codex/tournaments/${smartRaceTournamentId}/winner`,
      smartRaceWinnerRequest
    );
    assert(repeatedSmartRaceWinner.reused === true, "same Smart Race winner POST should reuse the published result");
    assert(repeatedSmartRaceWinner.tournament.smartRaceDecision.decidedAt === firstDecisionTimestamp, "same winner POST should preserve the first decision");
    const rejectedDifferentSmartRaceWinner = await fetch(
      `http://127.0.0.1:${port}/api/codex/tournaments/${smartRaceTournamentId}/winner`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...smartRaceWinnerRequest, jobId: smartRaceB.job.id })
      }
    );
    assert(rejectedDifferentSmartRaceWinner.status === 409, "a different automatic winner should be rejected after acceptance");
    await stopServer(server);
    const simulatedOrphanStartedAt = new Date().toISOString();
    simulatedOrphanRunner = spawn(nodeCommand, ["-e", "setTimeout(() => {}, 60000)"], {
      stdio: "ignore",
      windowsHide: true
    });
    const simulatedOrphanPid = simulatedOrphanRunner.pid;
    assert(typeof simulatedOrphanPid === "number", "crash-window fixture should start a simulated orphan runner");
    await Promise.all([
      writeFile(cancelledSmartRaceA.status.statusPath, JSON.stringify({
        ...cancelledSmartRaceA.status,
        state: "running",
        message: "Simulate API crash after accepted manifest persistence but before loser cancellation.",
        command: nodeCommand,
        processId: simulatedOrphanPid,
        startedAt: "2000-01-01T00:00:00.000Z",
        finishedAt: undefined,
        exitCode: undefined,
        signal: undefined,
        diagnostic: undefined
      }, null, 2), "utf8"),
      writeFile(completedSmartRaceB.status.statusPath, JSON.stringify({
        ...completedSmartRaceB.status,
        state: "running",
        message: "Simulate stale terminal candidate status after accepted manifest persistence.",
        finishedAt: undefined,
        exitCode: undefined,
        signal: undefined,
        diagnostic: undefined
      }, null, 2), "utf8")
    ]);
    server = startServer({ port, handoffDir, env: autorunEnv });
    await waitForServer(server, port);
    const restoredSmartRace = await getJson(port, `/api/codex/tournaments/${smartRaceTournamentId}`);
    assert(restoredSmartRace.tournament.selectionPolicy === "smart-race", "Smart Race policy should survive API restart");
    assert(restoredSmartRace.tournament.candidates[1].identityScore === 82.04, "runner-up identity should survive API restart");
    assert(restoredSmartRace.tournament.candidates[1].shadowWouldBlock === true, "runner-up shadow result should survive API restart");
    assert(restoredSmartRace.tournament.candidates[2].identityScore === 83.96, "winner identity should survive API restart");
    assert(restoredSmartRace.tournament.candidates[2].shadowWouldBlock === false, "winner shadow result should survive API restart");
    assert(restoredSmartRace.tournament.smartRaceDecision.decidedAt === firstDecisionTimestamp, "Smart Race decision should survive API restart");
    const restoredSmartRaceBStatus = await getJson(port, `/api/codex/jobs/${smartRaceB.job.id}/status`);
    assert(restoredSmartRaceBStatus.status.state === "failed", "accepted terminal loser should be recovered as cancelled instead of resuming");
    assert(
      restoredSmartRaceBStatus.status.message.includes("recovered"),
      `accepted loser guard should explain recovered cancellation: ${restoredSmartRaceBStatus.status.message}`
    );
    assert((restoredSmartRaceBStatus.status.resumeCount ?? 0) === (completedSmartRaceB.status.resumeCount ?? 0), "accepted terminal loser resume count should remain unchanged");
    const unconfirmedSmartRaceWinner = await postJson(
      port,
      `/api/codex/tournaments/${smartRaceTournamentId}/winner`,
      { jobId: smartRaceC.job.id }
    );
    assert(
      unconfirmedSmartRaceWinner.cancellationResults.some((result) => result.jobId === smartRaceA.job.id && !result.ok),
      `mismatched orphan identity should remain unconfirmed: ${JSON.stringify(unconfirmedSmartRaceWinner.cancellationResults)}`
    );
    const pendingSmartRaceAStatus = await getJson(port, `/api/codex/jobs/${smartRaceA.job.id}/status`);
    assert(pendingSmartRaceAStatus.status.cancellationPending === true, "unconfirmed orphan cancellation should remain idempotently retryable");
    assert(!(await waitForProcessExit(simulatedOrphanPid, 250)), "identity mismatch must not terminate the simulated orphan runner");
    await stopServer(server);
    await writeFile(pendingSmartRaceAStatus.status.statusPath, JSON.stringify({
      ...pendingSmartRaceAStatus.status,
      command: nodeCommand,
      processId: simulatedOrphanPid,
      startedAt: simulatedOrphanStartedAt,
      cancellationPending: true,
      finishedAt: undefined,
      exitCode: undefined,
      signal: undefined,
      diagnostic: undefined
    }, null, 2), "utf8");
    server = startServer({ port, handoffDir, env: autorunEnv });
    await waitForServer(server, port);
    const reconciledSmartRaceWinner = await postJson(
      port,
      `/api/codex/tournaments/${smartRaceTournamentId}/winner`,
      { jobId: smartRaceC.job.id }
    );
    assert(
      reconciledSmartRaceWinner.cancellationResults.some((result) => result.jobId === smartRaceA.job.id && result.ok),
      `same-winner recovery retry should reconcile a verified orphan: ${JSON.stringify(reconciledSmartRaceWinner.cancellationResults)}`
    );
    assert(await waitForProcessExit(simulatedOrphanPid), "same-winner recovery POST should terminate the verified orphan runner process tree");
    const restoredSmartRaceAStatus = await getJson(port, `/api/codex/jobs/${smartRaceA.job.id}/status`);
    assert(restoredSmartRaceAStatus.status.state === "failed", "accepted loser should not resume after API restart");
    assert(!restoredSmartRaceAStatus.status.cancellationPending, "confirmed orphan cancellation should clear the pending retry flag");
    assert((restoredSmartRaceAStatus.status.resumeCount ?? 0) === (cancelledSmartRaceA.status.resumeCount ?? 0), "accepted loser resume count should remain unchanged");

    const job = await postJson(port, "/api/codex/jobs", {
      workflowMode: "image-generate",
      prompt: "Smoke test mock autorun generation",
      negativePrompt: "text",
      jobNotes: "Return a tiny PNG for smoke verification.",
      selectedImageName: "",
      selectedImageSize: "",
      selectedImageSource: "",
      selectedImageDataUrl: "",
      annotations: [],
      grid: { columns: 1, rows: 1, gutter: 0 },
      action: "",
      frames: 0
    });

    assert(job.runner?.state === "running", "mock autorun job should start in running state");

    const completedStatus = await waitForJobState(port, job.id, "completed");
    assert(completedStatus.status.logPath, "completed mock autorun status should include log path");
    assert(!completedStatus.status.diagnostic, "mock autorun exact job-id result should not create a diagnostic");
    await stat(completedStatus.status.logPath);
    const completedLog = await getJson(port, `/api/codex/jobs/${encodeURIComponent(job.id)}/log?bytes=4096`);
    assert(completedLog.jobId === job.id, "job log endpoint should return the matching job id");
    assert(completedLog.exists === true, "job log endpoint should report an existing log");
    assert(completedLog.text.includes("mock completed"), "job log endpoint should expose runner output");
    assert(typeof completedLog.readAt === "string", "job log endpoint should include readAt");

    const outboxList = await getJson(port, "/api/codex/results");
    const resultName = `${job.id}.png`;
    assert(outboxList.results.some((result) => result.name === resultName), "mock autorun result image should be listed");
    const importedResult = await getJson(port, `/api/codex/results/${encodeURIComponent(resultName)}`);
    assert(importedResult.dataUrl === tinyPng, "mock autorun result should import as expected PNG data URL");

    const blockedJob = await postJson(port, "/api/codex/jobs", {
      workflowMode: "image-generate",
      prompt: "Smoke test policy blocked sidecar",
      negativePrompt: "text",
      jobNotes: "Trigger policy_or_safety diagnostic.",
      annotations: [],
      grid: { columns: 1, rows: 1, gutter: 0 },
      action: "",
      frames: 0
    });
    const blockedStatus = await waitForJobDiagnostic(port, blockedJob.id, "policy_or_safety");
    assert(blockedStatus.status.state === "completed", "policy sidecar job should complete without a placeholder image");
    assert(blockedStatus.status.diagnostic?.kind === "policy_or_safety", "blocked sidecar should return policy_or_safety diagnostic");
    const blockedOutbox = await getJson(port, "/api/codex/results");
    assert(!blockedOutbox.results.some((result) => result.name.startsWith(`${blockedJob.id}-`)), "blocked sidecar should not create a fake image");

    const unavailableJob = await postJson(port, "/api/codex/jobs", {
      workflowMode: "image-generate",
      prompt: "Smoke test imagegen unavailable sidecar",
      negativePrompt: "text",
      jobNotes: "Trigger imagegen_unavailable diagnostic.",
      annotations: [],
      grid: { columns: 1, rows: 1, gutter: 0 },
      action: "",
      frames: 0
    });
    const unavailableStatus = await waitForJobDiagnostic(port, unavailableJob.id, "imagegen_unavailable");
    assert(unavailableStatus.status.state === "completed", "imagegen unavailable sidecar should complete without a placeholder image");
    assert(unavailableStatus.status.diagnostic?.kind === "imagegen_unavailable", "blocked sidecar should return imagegen_unavailable diagnostic");
    const unavailableOutbox = await getJson(port, "/api/codex/results");
    assert(!unavailableOutbox.results.some((result) => result.name.startsWith(`${unavailableJob.id}-`)), "imagegen unavailable sidecar should not create a fake image");

    const failedJob = await postJson(port, "/api/codex/jobs", {
      workflowMode: "image-generate",
      prompt: "Smoke test policy runner failed",
      negativePrompt: "text",
      jobNotes: "Trigger failed runner diagnostic.",
      annotations: [],
      grid: { columns: 1, rows: 1, gutter: 0 },
      action: "",
      frames: 0
    });
    const failedStatus = await waitForJobDiagnostic(port, failedJob.id, "policy_or_safety");
    assert(failedStatus.status.state === "failed", "policy stderr job should fail runner");
    assert(failedStatus.status.diagnostic?.kind === "policy_or_safety", "policy stderr should return policy_or_safety diagnostic");

    const modelCapacityJob = await postJson(port, "/api/codex/jobs", {
      workflowMode: "image-generate",
      prompt: "Smoke test model at capacity runner failed",
      negativePrompt: "text",
      jobNotes: "Trigger transient model capacity diagnostic.",
      annotations: [],
      grid: { columns: 1, rows: 1, gutter: 0 },
      action: "",
      frames: 0
    });
    const modelCapacityStatus = await waitForJobDiagnostic(port, modelCapacityJob.id, "runner_failed");
    assert(modelCapacityStatus.status.state === "failed", "model capacity stderr should fail the runner");
    assert(modelCapacityStatus.status.diagnostic?.kind === "runner_failed", "model capacity should not be misclassified from echoed prompt instructions");

    const noImageJob = await postJson(port, "/api/codex/jobs", {
      workflowMode: "image-generate",
      prompt: "Smoke test no image returned",
      negativePrompt: "text",
      jobNotes: "Trigger no_image_returned diagnostic.",
      annotations: [],
      grid: { columns: 1, rows: 1, gutter: 0 },
      action: "",
      frames: 0
    });
    const noImageStatus = await waitForJobDiagnostic(port, noImageJob.id, "no_image_returned");
    assert(noImageStatus.status.state === "completed", "no-image job should complete");
    assert(noImageStatus.status.diagnostic?.kind === "no_image_returned", "no-image job should return no_image_returned diagnostic");
  } finally {
    await stopServer(server);
    if (simulatedOrphanRunner?.exitCode === null) simulatedOrphanRunner.kill("SIGTERM");
    await rm(handoffDir, { recursive: true, force: true });
  }
}

function startServer({ port, handoffDir, env }) {
  const server = spawn(nodeCommand, ["node_modules/tsx/dist/cli.mjs", "server/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
      IMAGE_COCKPIT_API_PORT: port,
      IMAGE_COCKPIT_HANDOFF_DIR: handoffDir
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  server.output = "";
  server.stdout.on("data", (chunk) => {
    server.output += chunk;
  });
  server.stderr.on("data", (chunk) => {
    server.output += chunk;
  });
  return server;
}

async function stopServer(server) {
  if (server.exitCode !== null || server.killed) return;
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 1000);
    server.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function waitForProcessExit(processId, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(processId, 0);
    } catch {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

async function waitForServer(server, apiPort) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      await getJson(apiPort, "/api/providers");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`API server did not become ready.\n${server.output}`);
}

async function waitForJobState(apiPort, jobId, expectedState) {
  const deadline = Date.now() + 8000;
  let lastStatus;
  while (Date.now() < deadline) {
    lastStatus = await getJson(apiPort, `/api/codex/jobs/${encodeURIComponent(jobId)}/status`);
    if (lastStatus.status?.state === expectedState) return lastStatus;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Job ${jobId} did not reach ${expectedState}. Last status: ${JSON.stringify(lastStatus)}`);
}

async function getJson(apiPort, path) {
  const response = await fetch(`http://127.0.0.1:${apiPort}${path}`);
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function postJson(apiPort, path, body) {
  const response = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
  return response.json();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForJobDiagnostic(apiPort, jobId, expectedKind) {
  const deadline = Date.now() + 8000;
  let lastStatus;
  while (Date.now() < deadline) {
    lastStatus = await getJson(apiPort, `/api/codex/jobs/${encodeURIComponent(jobId)}/status`);
    if (lastStatus.status?.diagnostic?.kind === expectedKind) return lastStatus;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Job ${jobId} did not return diagnostic ${expectedKind}. Last status: ${JSON.stringify(lastStatus)}`);
}

function assertPngDimensions(dataUrl, width, height, label) {
  const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
  assert(bytes.subarray(1, 4).toString("ascii") === "PNG", `${label} should be PNG data`);
  assert(bytes.readUInt32BE(16) === width, `${label} expected width ${width}, got ${bytes.readUInt32BE(16)}`);
  assert(bytes.readUInt32BE(20) === height, `${label} expected height ${height}, got ${bytes.readUInt32BE(20)}`);
}

function mockRunnerSource() {
  return `import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const tinyPng = "${tinyPng}";

if (process.argv.includes("--help")) {
  console.log("mock codex runner");
  process.exit(0);
}

let stdin = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) {
  stdin += chunk;
}

if (!stdin.includes("Image Cockpit for Codex Workflows")) {
  console.error("missing Image Cockpit prompt");
  process.exit(2);
}

if (!stdin.includes("built-in imagegen / image_gen") || !stdin.includes("procedural, SVG, canvas, diagram, geometric, or placeholder image")) {
  console.error("missing imagegen runner instructions");
  process.exit(5);
}

const standardDirectionContract = [
  "five requested directions means five concurrent image_gen calls inside this one candidate",
  "Capture the exact path returned by that call and bind it one-to-one to that direction",
  "directionAttempts keyed by canonical direction slug",
  "Never submit image_gen for it again",
  "regenerating the complete requested direction set because one direction failed is prohibited",
  "Direction Repair or Motion Pilot expansion may request any 1-5 direction subset",
  "Track a concurrency ceiling separately from the actual wave size",
  "each actual wave size is min(concurrency ceiling, pending direction count)",
  "reduce ceiling 5 or 4 to 3",
  "must not create more Codex jobs",
  "Do not create direction child-job UI, partial direction previews, or cross-job generation caches"
];
if (!standardDirectionContract.every((marker) => stdin.includes(marker))) {
  console.error("missing standard direction parallel runner contract");
  process.exit(6);
}

const jobId = process.env.IMAGE_COCKPIT_JOB_ID;
const jobPath = process.env.IMAGE_COCKPIT_JOB_PATH;
const outboxDir = process.env.IMAGE_COCKPIT_OUTBOX_DIR;
if (!jobId || !jobPath || !outboxDir) {
  console.error("missing Image Cockpit runner environment");
  process.exit(3);
}

const job = JSON.parse(await readFile(jobPath, "utf8"));
if (job.id !== jobId) {
  console.error("job id mismatch");
  process.exit(4);
}

if (job.prompt.includes("API restart resume")) {
  await new Promise((resolve) => setTimeout(resolve, 1500));
}

if (job.prompt.includes("capacity hold")) {
  await new Promise((resolve) => setTimeout(resolve, 1800));
}

if (job.prompt.includes("Smart Race cancellation fixture")) {
  await new Promise((resolve) => setTimeout(resolve, job.tournament?.candidateIndex === 0 ? 6000 : 250));
}

if (job.prompt.includes("policy blocked sidecar")) {
  await writeFile(join(outboxDir, \`\${jobId}-blocked.json\`), JSON.stringify({
    status: "blocked",
    reasonKind: "policy_or_safety",
    userMessage: "The image could not be generated.",
    suggestion: "Revise the prompt and try again."
  }, null, 2), "utf8");
  console.log(\`mock blocked sidecar \${jobId}\`);
  process.exit(0);
}

if (job.prompt.includes("imagegen unavailable sidecar")) {
  await writeFile(join(outboxDir, \`\${jobId}-blocked.json\`), JSON.stringify({
    status: "blocked",
    reasonKind: "imagegen_unavailable",
    userMessage: "Image generation is not available in this Codex environment.",
    suggestion: "Use manual handoff or another provider."
  }, null, 2), "utf8");
  console.log(\`mock imagegen unavailable sidecar \${jobId}\`);
  process.exit(0);
}

if (job.prompt.includes("policy runner failed")) {
  console.error("content policy safety blocked by image generation");
  process.exit(12);
}

if (job.prompt.includes("model at capacity runner failed")) {
  console.error("ERROR: Selected model is at capacity. Please try a different model.");
  process.exit(13);
}

if (job.prompt.includes("no image returned")) {
  console.log(\`mock completed without image \${jobId}\`);
  process.exit(0);
}

await writeFile(join(outboxDir, \`\${jobId}.png\`), Buffer.from(tinyPng.split(",")[1], "base64"));
await writeFile(join(outboxDir, \`\${jobId}.meta.json\`), JSON.stringify({
  status: "succeeded",
  imageGenUsed: true
}, null, 2), "utf8");
console.log(\`mock completed \${jobId}\`);
`;
}
