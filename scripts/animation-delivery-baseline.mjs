import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const nodeCommand = process.execPath;
const runnerMode = (process.env.IMAGE_COCKPIT_ANIMATION_DELIVERY_RUNNER || "mock").toLowerCase();
const trialCount = Math.max(1, Number(process.env.IMAGE_COCKPIT_ANIMATION_DELIVERY_TRIALS ?? "3"));
const minRate = Number(process.env.IMAGE_COCKPIT_ANIMATION_DELIVERY_MIN_RATE ?? (runnerMode === "mock" ? "1" : "0"));
const keepRuntimeHandoff = process.env.IMAGE_COCKPIT_ANIMATION_DELIVERY_KEEP_HANDOFF === "1";
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const baselineDir = resolve(
  process.env.IMAGE_COCKPIT_ANIMATION_DELIVERY_BASELINE_DIR ||
    join("docs", "qa", "animation-delivery-reliability", `baseline-${timestamp}`)
);

await mkdir(baselineDir, { recursive: true });

const trials = [];
const childRuns = [];

for (let index = 0; index < trialCount; index += 1) {
  const trialId = `trial-${String(index + 1).padStart(3, "0")}`;
  const trialDir = join(baselineDir, trialId);
  await mkdir(trialDir, { recursive: true });
  const startedAt = new Date().toISOString();
  const child = await runTrial(trialDir);
  const finishedAt = new Date().toISOString();
  await writeFile(join(trialDir, "child-output.log"), child.output, "utf8");
  const parsedTrials = await readTrialJson(trialDir);
  if (!keepRuntimeHandoff) await pruneRuntimeHandoff(trialDir);
  const normalizedTrials = parsedTrials.length > 0
    ? parsedTrials.map((trial) => ({
        ...trial,
        baselineTrialId: trialId,
        childExitCode: child.exitCode,
        childStartedAt: startedAt,
        childFinishedAt: finishedAt,
        childOutputPath: toReportPath(join(trialDir, "child-output.log"))
      }))
    : [{
        id: `browser-delivery-${trialId}`,
        baselineTrialId: trialId,
        resultStatus: "fail",
        failureReason: `child process did not write browser-trials.json; exitCode=${child.exitCode}`,
        childExitCode: child.exitCode,
        childStartedAt: startedAt,
        childFinishedAt: finishedAt,
        childOutputPath: toReportPath(join(trialDir, "child-output.log"))
      }];
  trials.push(...normalizedTrials);
  childRuns.push({
    trialId,
    reportDir: toReportPath(trialDir),
    exitCode: child.exitCode,
    runtimeHandoffKept: keepRuntimeHandoff,
    startedAt,
    finishedAt
  });
}

const summary = summarizeTrials(trials, childRuns);
await writeFile(join(baselineDir, "browser-trials.json"), `${JSON.stringify(trials, null, 2)}\n`, "utf8");
await writeFile(join(baselineDir, "delivery-rate-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
await writeFile(join(baselineDir, "report.md"), reportMarkdown(summary, childRuns), "utf8");

console.log("Animation delivery baseline complete.");
console.log(`baselineDir=${baselineDir}`);
console.log(`browserDeliveryRate=${summary.browserDeliveryRate}`);
console.log(`passedTrials=${summary.passedTrials}/${summary.totalTrials}`);
if (summary.browserDeliveryRate < minRate) {
  console.error(`Animation delivery baseline below minimum rate ${minRate}.`);
  process.exitCode = 1;
}

function runTrial(reportDir) {
  return new Promise((resolve) => {
    const child = spawn(nodeCommand, ["scripts/animation-delivery-browser-smoke.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        IMAGE_COCKPIT_ANIMATION_DELIVERY_REPORT_DIR: reportDir
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString("utf8");
      process.stderr.write(chunk);
    });
    child.on("error", (error) => {
      output += `\n${error.stack || error.message}`;
    });
    child.on("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, output });
    });
  });
}

async function readTrialJson(trialDir) {
  try {
    return JSON.parse(await readFile(join(trialDir, "browser-trials.json"), "utf8"));
  } catch {
    return [];
  }
}

async function pruneRuntimeHandoff(trialDir) {
  await rm(join(trialDir, "handoff"), { recursive: true, force: true });
}

function summarizeTrials(allTrials, runs) {
  const totalTrials = allTrials.length;
  const passedTrials = allTrials.filter((trial) => trial.resultStatus === "pass").length;
  const falseSuccessCount = allTrials.filter((trial) => trial.falseSuccess).length;
  const stuckRunningCount = allTrials.filter((trial) => trial.stuckRunning).length;
  return {
    schema: "image-cockpit.animation-delivery-rate-summary.v1",
    createdAt: new Date().toISOString(),
    runnerMode,
    baselineDir: toReportPath(baselineDir),
    totalTrials,
    passedTrials,
    browserDeliveryRate: totalTrials > 0 ? passedTrials / totalTrials : 0,
    falseSuccessCount,
    stuckRunningCount,
    failedChildRuns: runs.filter((run) => run.exitCode !== 0).length,
    runtimeHandoffKept: keepRuntimeHandoff,
    minRate,
    failures: allTrials
      .filter((trial) => trial.resultStatus !== "pass")
      .map((trial) => ({
        id: trial.id,
        baselineTrialId: trial.baselineTrialId,
        reason: trial.failureReason || "unknown failure",
        childExitCode: trial.childExitCode
      }))
  };
}

function reportMarkdown(summary, runs) {
  const runLines = runs
    .map((run) => `- ${run.trialId}: exitCode=${run.exitCode}, reportDir=${run.reportDir}`)
    .join("\n");
  const failureLines = summary.failures.length > 0
    ? summary.failures.map((failure) => `- ${failure.baselineTrialId}: ${failure.reason}`).join("\n")
    : "- none";
  return `# Animation Delivery Baseline

Created: ${summary.createdAt}

## Summary

- runnerMode: ${summary.runnerMode}
- totalTrials: ${summary.totalTrials}
- passedTrials: ${summary.passedTrials}
- browserDeliveryRate: ${summary.browserDeliveryRate}
- falseSuccessCount: ${summary.falseSuccessCount}
- stuckRunningCount: ${summary.stuckRunningCount}
- failedChildRuns: ${summary.failedChildRuns}
- runtimeHandoffKept: ${summary.runtimeHandoffKept}
- minRate: ${summary.minRate}

## Runs

${runLines}

## Failures

${failureLines}
`;
}

function toReportPath(value) {
  if (typeof value !== "string" || !/^[A-Za-z]:[\\/]/.test(value)) return value;
  const relativePath = relative(process.cwd(), value);
  if (relativePath && !relativePath.startsWith("..") && !relativePath.includes(":")) {
    return relativePath.replace(/\\/g, "/");
  }
  return "<local-path>";
}
