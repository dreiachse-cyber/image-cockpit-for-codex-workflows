import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const qaDir = resolve(process.env.IMAGE_COCKPIT_ANIMATION_DELIVERY_QA_DIR || join("docs", "qa", "animation-delivery-reliability"));
const runnerMode = (process.env.IMAGE_COCKPIT_ANIMATION_DELIVERY_ROLLUP_RUNNER || "real").toLowerCase();
const minRate = Number(process.env.IMAGE_COCKPIT_ANIMATION_DELIVERY_ROLLUP_MIN_RATE ?? "0.9");
const minTrials = Math.max(1, Number(process.env.IMAGE_COCKPIT_ANIMATION_DELIVERY_ROLLUP_MIN_TRIALS ?? (runnerMode === "real" ? "10" : "1")));
const writeReports = process.env.IMAGE_COCKPIT_ANIMATION_DELIVERY_ROLLUP_WRITE !== "0";
const outputPrefix = process.env.IMAGE_COCKPIT_ANIMATION_DELIVERY_ROLLUP_OUTPUT_PREFIX || `delivery-rollup-${runnerMode}`;
const createdAtFrom = parseOptionalDate(process.env.IMAGE_COCKPIT_ANIMATION_DELIVERY_ROLLUP_CREATED_AT_FROM);

const baselines = await readBaselines();
const summary = summarize(baselines);
const markdown = reportMarkdown(summary);

if (writeReports) {
  await writeFile(join(qaDir, `${outputPrefix}.json`), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(join(qaDir, `${outputPrefix}.md`), markdown, "utf8");
}

console.log(markdown);

if (summary.totalTrials < minTrials) {
  console.error(`Animation delivery rollup has ${summary.totalTrials}/${minTrials} required ${runnerMode} trial(s).`);
  process.exitCode = 1;
} else if (summary.browserDeliveryRate < minRate) {
  console.error(`Animation delivery rollup below minimum rate ${minRate}.`);
  process.exitCode = 1;
}

async function readBaselines() {
  const entries = await readdir(qaDir, { withFileTypes: true });
  const baselineDirs = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("baseline-"))
    .map((entry) => join(qaDir, entry.name))
    .sort();

  const records = [];
  for (const baselineDir of baselineDirs) {
    const summary = await readJson(join(baselineDir, "delivery-rate-summary.json")).catch(() => null);
    if (!summary || (runnerMode !== "all" && String(summary.runnerMode || "").toLowerCase() !== runnerMode)) continue;
    if (createdAtFrom && !isAtOrAfter(summary.createdAt, createdAtFrom)) continue;
    const trials = await readJson(join(baselineDir, "browser-trials.json")).catch(() => []);
    records.push({
      baselineDir: toReportPath(baselineDir),
      createdAt: summary.createdAt || "",
      runnerMode: summary.runnerMode || "unknown",
      summary,
      trials: Array.isArray(trials) ? trials : []
    });
  }
  return records;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function summarize(records) {
  const trials = records.flatMap((record) =>
    record.trials.map((trial) => ({
      ...trial,
      baselineDir: record.baselineDir,
      baselineCreatedAt: record.createdAt,
      runnerMode: record.runnerMode
    }))
  );
  const totalTrials = trials.length;
  const passedTrials = trials.filter((trial) => trial.resultStatus === "pass").length;
  const falseSuccessCount = trials.filter((trial) => trial.falseSuccess).length;
  const stuckRunningCount = trials.filter((trial) => trial.stuckRunning).length;
  const failedTrials = trials.filter((trial) => trial.resultStatus !== "pass");
  const failureClasses = classifyFailures(failedTrials);
  const browserDeliveryRate = totalTrials > 0 ? passedTrials / totalTrials : 0;
  const gateStatus =
    totalTrials < minTrials ? "insufficient_trials" :
    browserDeliveryRate < minRate ? "below_rate" :
    falseSuccessCount > 0 ? "false_success_detected" :
    stuckRunningCount > 0 ? "stuck_running_detected" :
    "pass";

  return {
    schema: "image-cockpit.animation-delivery-rollup.v1",
    createdAt: new Date().toISOString(),
    qaDir: toReportPath(qaDir),
    runnerMode,
    filters: {
      createdAtFrom: createdAtFrom?.toISOString() ?? null
    },
    minRate,
    minTrials,
    gateStatus,
    baselineCount: records.length,
    totalTrials,
    passedTrials,
    failedTrials: failedTrials.length,
    browserDeliveryRate,
    falseSuccessCount,
    stuckRunningCount,
    baselines: records.map((record) => ({
      baselineDir: record.baselineDir,
      createdAt: record.createdAt,
      runnerMode: record.runnerMode,
      totalTrials: record.summary.totalTrials ?? record.trials.length,
      passedTrials: record.summary.passedTrials ?? record.trials.filter((trial) => trial.resultStatus === "pass").length,
      browserDeliveryRate: record.summary.browserDeliveryRate ?? null,
      falseSuccessCount: record.summary.falseSuccessCount ?? null,
      stuckRunningCount: record.summary.stuckRunningCount ?? null
    })),
    failureClasses,
    failures: failedTrials.map((trial) => ({
      id: trial.id,
      baselineTrialId: trial.baselineTrialId,
      baselineDir: trial.baselineDir,
      failureCodes: trial.failureCodes || [],
      failureReason: trial.failureReason || "unknown failure",
      uiFailureText: trial.uiFailureText || ""
    }))
  };
}

function classifyFailures(failedTrials) {
  const counts = new Map();
  for (const trial of failedTrials) {
    const codes = Array.isArray(trial.failureCodes) && trial.failureCodes.length > 0
      ? trial.failureCodes
      : [classifyFailureReason(trial.failureReason || trial.uiFailureText || "unknown")];
    for (const code of codes) counts.set(code, (counts.get(code) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([code, count]) => ({ code, count }));
}

function parseOptionalDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    console.error(`Ignoring invalid IMAGE_COCKPIT_ANIMATION_DELIVERY_ROLLUP_CREATED_AT_FROM: ${value}`);
    return null;
  }
  return date;
}

function isAtOrAfter(value, threshold) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() >= threshold.getTime();
}

function classifyFailureReason(reason) {
  const text = String(reason).toLowerCase();
  if (text.includes("usage limit")) return "usage_limit";
  if (text.includes("imagegen") || text.includes("image generation")) return "imagegen_unavailable";
  if (text.includes("policy") || text.includes("safety")) return "policy_or_safety";
  if (text.includes("timeout") || text.includes("timed out")) return "timeout";
  if (text.includes("outbox")) return "outbox_final_missing";
  if (text.includes("preview")) return "not_delivered_to_preview";
  if (text.includes("history")) return "not_delivered_to_history";
  if (text.includes("download")) return "not_downloadable_final";
  return "unknown";
}

function reportMarkdown(summary) {
  const baselineLines = summary.baselines.length > 0
    ? summary.baselines.map((baseline) => `- ${baseline.baselineDir}: ${baseline.passedTrials}/${baseline.totalTrials}, rate=${baseline.browserDeliveryRate}`).join("\n")
    : "- none";
  const failureClassLines = summary.failureClasses.length > 0
    ? summary.failureClasses.map((failureClass) => `- ${failureClass.code}: ${failureClass.count}`).join("\n")
    : "- none";
  return `# Animation Delivery Rollup

Created: ${summary.createdAt}

## Gate

- runnerMode: ${summary.runnerMode}
- filters.createdAtFrom: ${summary.filters.createdAtFrom ?? "none"}
- gateStatus: ${summary.gateStatus}
- minTrials: ${summary.minTrials}
- minRate: ${summary.minRate}
- totalTrials: ${summary.totalTrials}
- passedTrials: ${summary.passedTrials}
- failedTrials: ${summary.failedTrials}
- browserDeliveryRate: ${summary.browserDeliveryRate}
- falseSuccessCount: ${summary.falseSuccessCount}
- stuckRunningCount: ${summary.stuckRunningCount}

## Baselines

${baselineLines}

## Failure Classes

${failureClassLines}
`;
}

function toReportPath(value) {
  if (typeof value !== "string") return value;
  const relativePath = relative(process.cwd(), value);
  if (relativePath && !relativePath.startsWith("..") && !relativePath.includes(":")) {
    return relativePath.replace(/\\/g, "/");
  }
  return "<local-path>";
}
