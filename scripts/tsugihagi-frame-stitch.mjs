import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import gifenc from "gifenc";

const { applyPalette, GIFEncoder, quantize } = gifenc;

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = buildCrcTable();
const frameCount = 8;
const targetCell = { width: 256, height: 256 };
const defaultColumns = 4;
const defaultRows = 2;
const alphaThreshold = 24;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.inputDir || !args.outputDir) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  const inputDir = args.inputDir;
  const outputDir = args.outputDir;
  const columns = Number(args.columns ?? defaultColumns);
  const rows = Number(args.rows ?? defaultRows);
  const chroma = chromaKeyFor(args.chroma ?? "magenta");
  const action = args.action ?? "run-cycle";
  const direction = args.direction ?? "side";
  const candidatesDir = join(outputDir, "candidates");
  const framesDir = join(outputDir, "frames");

  await mkdir(outputDir, { recursive: true });
  await mkdir(framesDir, { recursive: true });

  const files = (await readdir(inputDir))
    .filter((name) => /\.png$/i.test(name))
    .sort((left, right) => left.localeCompare(right, "en"))
    .map((name) => join(inputDir, name));
  if (files.length < 2) throw new Error(`Need at least 2 candidate PNGs in ${inputDir}; found ${files.length}.`);

  const candidates = [];
  const frames = [];

  for (const [candidateIndex, filePath] of files.entries()) {
    const candidateId = `candidate-${String(candidateIndex + 1).padStart(2, "0")}`;
    const image = decodePng(await readFile(filePath));
    const cellBounds = gridBounds(image.width, image.height, columns, rows).slice(0, frameCount);
    const candidateFrames = [];

    for (const [frameIndex, bounds] of cellBounds.entries()) {
      const sourceCell = cropImage(image, bounds.x, bounds.y, bounds.width, bounds.height);
      const cleaned = cleanFrameCell(sourceCell, chroma);
      const metrics = inspectFrame(cleaned);
      const frame = {
        candidateId,
        candidateIndex,
        frameIndex,
        sourcePath: filePath,
        sourceName: basename(filePath),
        sourceSheet: { width: image.width, height: image.height },
        sourceCell: bounds,
        cleaned,
        metrics,
        warnings: [],
        failures: []
      };
      frame.hash = hashFrame(cleaned);
      candidateFrames.push(frame);
      frames.push(frame);
    }

    candidates.push({
      candidateId,
      sourcePath: filePath,
      sourceName: basename(filePath),
      width: image.width,
      height: image.height,
      grid: { columns, rows },
      cellSizeApprox: {
        width: Math.round(image.width / columns),
        height: Math.round(image.height / rows)
      },
      frames: candidateFrames
    });
  }

  const targetHeight = chooseTargetHeight(frames);
  for (const frame of frames) {
    frame.normalized = normalizeFrame(frame.cleaned, frame.metrics.bounds, targetCell, targetHeight);
    frame.normalizedMetrics = inspectFrame(frame.normalized);
    frame.alphaSignature = alphaSignature(frame.normalized, 32, 32);
    frame.meanColor = frame.metrics.meanColor ?? [0, 0, 0];
  }

  scoreFrames(frames);
  const selected = selectBestSequence(frames);
  const baseline = selectBestSingleCandidate(candidates);

  for (const frame of frames) {
    const framePath = join(framesDir, `${frame.candidateId}-frame-${String(frame.frameIndex + 1).padStart(2, "0")}.png`);
    await writeFile(framePath, encodePng(frame.normalized));
    frame.outputFramePath = framePath;
  }

  const selectedFrames = selected.path;
  const baselineFrames = baseline.frames;
  const selectedSheet = composeStrip(selectedFrames.map((frame) => frame.normalized), targetCell);
  const baselineSheet = composeStrip(baselineFrames.map((frame) => frame.normalized), targetCell);
  const selectedSheetPath = join(outputDir, "tsugihagi-run-cycle-side-sheet.png");
  const baselineSheetPath = join(outputDir, "best-single-baseline-sheet.png");
  const selectedGifPath = join(outputDir, "tsugihagi-run-cycle-side.gif");
  const baselineGifPath = join(outputDir, "best-single-baseline.gif");
  await writeFile(selectedSheetPath, encodePng(selectedSheet));
  await writeFile(baselineSheetPath, encodePng(baselineSheet));
  await writeGif(selectedFrames.map((frame) => frame.normalized), targetCell.width, targetCell.height, selectedGifPath, 20);
  await writeGif(baselineFrames.map((frame) => frame.normalized), targetCell.width, targetCell.height, baselineGifPath, 20);

  const scoreJson = buildScoreJson({ candidates, frames, selected, baseline, targetHeight, chroma, action, direction });
  const sequenceJson = buildSequenceJson({ selected, baseline, outputDir });
  await writeJson(join(outputDir, "candidate-manifest.json"), buildCandidateManifest({ candidates, action, direction, inputDir, outputDir, columns, rows, chroma }));
  await writeJson(join(outputDir, "frame-scores.json"), scoreJson);
  await writeJson(join(outputDir, "selected-sequence.json"), sequenceJson);
  await writeFile(join(outputDir, "index.html"), buildHtmlReport({ candidates, selected, baseline, outputDir, action, direction }), "utf8");
  await writeFile(join(outputDir, "report.md"), buildMarkdownReport({ candidates, selected, baseline, targetHeight, outputDir }), "utf8");

  console.log("Tsugihagi frame stitch complete.");
  console.log(`candidates=${candidates.length}`);
  console.log(`selectedScore=${selected.totalScore.toFixed(2)}`);
  console.log(`bestSingle=${baseline.candidateId} score=${baseline.totalScore.toFixed(2)}`);
  console.log(`outputDir=${outputDir}`);
  if (existsSync(candidatesDir)) console.log(`candidatesDir=${candidatesDir}`);
}

function parseArgs(values) {
  const args = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--help" || value === "-h") {
      args.help = true;
      continue;
    }
    if (!value.startsWith("--")) continue;
    const key = value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function printUsage() {
  console.log(`Usage:
node scripts/tsugihagi-frame-stitch.mjs --input-dir <candidate png dir> --output-dir <qa output dir> [--action run-cycle] [--direction side] [--columns 4] [--rows 2] [--chroma magenta|green]
`);
}

function buildCandidateManifest({ candidates, action, direction, inputDir, outputDir, columns, rows, chroma }) {
  return {
    schema: "image-cockpit.tsugihagi-candidate-manifest.v1",
    generatedAt: new Date().toISOString(),
    action,
    direction,
    inputDir,
    outputDir,
    candidateCount: candidates.length,
    sourceGrid: { columns, rows, frames: frameCount },
    targetCell,
    chromaKey: chroma.name,
    candidates: candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      sourceName: candidate.sourceName,
      sourcePath: candidate.sourcePath,
      width: candidate.width,
      height: candidate.height,
      cellSizeApprox: candidate.cellSizeApprox,
      frameCount: candidate.frames.length
    }))
  };
}

function buildScoreJson({ candidates, frames, selected, baseline, targetHeight, chroma, action, direction }) {
  return {
    schema: "image-cockpit.tsugihagi-frame-scores.v1",
    generatedAt: new Date().toISOString(),
    action,
    direction,
    scoring: {
      method: "frame quality + Viterbi-style transition search",
      targetCell,
      targetHeight,
      chromaKey: chroma.name,
      frameSwitchPenalty: 4,
      cycleClosePenaltyIncluded: true
    },
    summary: {
      candidates: candidates.length,
      frames: frames.length,
      selectedScore: round2(selected.totalScore),
      bestSingleCandidate: baseline.candidateId,
      bestSingleScore: round2(baseline.totalScore),
      improvement: round2(selected.totalScore - baseline.totalScore),
      selectedCandidateSwitches: countSwitches(selected.path)
    },
    candidates: candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      totalScore: round2(candidate.totalScore ?? -9999),
      selectedAsBaseline: candidate.candidateId === baseline.candidateId,
      frames: candidate.frames.map(frameScoreSummary)
    })),
    framesByIndex: Array.from({ length: frameCount }, (_, frameIndex) => frames
      .filter((frame) => frame.frameIndex === frameIndex)
      .sort((left, right) => right.qualityScore - left.qualityScore)
      .map(frameScoreSummary)),
    selectedTransitions: selected.transitions
  };
}

function buildSequenceJson({ selected, baseline, outputDir }) {
  return {
    schema: "image-cockpit.tsugihagi-selected-sequence.v1",
    generatedAt: new Date().toISOString(),
    outputDir,
    selectedScore: round2(selected.totalScore),
    bestSingleScore: round2(baseline.totalScore),
    bestSingleCandidate: baseline.candidateId,
    improvement: round2(selected.totalScore - baseline.totalScore),
    selectedCandidateSwitches: countSwitches(selected.path),
    selectedFrames: selected.path.map((frame) => ({
      candidateId: frame.candidateId,
      frameIndex: frame.frameIndex,
      sourceName: frame.sourceName,
      qualityScore: round2(frame.qualityScore),
      normalizedFramePath: toPosix(relative(outputDir, frame.outputFramePath ?? "")),
      warnings: frame.warnings,
      failures: frame.failures,
      bbox: frame.metrics.bounds,
      normalizedBbox: frame.normalizedMetrics.bounds
    })),
    baselineFrames: baseline.frames.map((frame) => ({
      candidateId: frame.candidateId,
      frameIndex: frame.frameIndex,
      sourceName: frame.sourceName,
      qualityScore: round2(frame.qualityScore),
      normalizedFramePath: toPosix(relative(outputDir, frame.outputFramePath ?? "")),
      warnings: frame.warnings,
      failures: frame.failures,
      bbox: frame.metrics.bounds,
      normalizedBbox: frame.normalizedMetrics.bounds
    }))
  };
}

function frameScoreSummary(frame) {
  return {
    candidateId: frame.candidateId,
    frameIndex: frame.frameIndex,
    qualityScore: round2(frame.qualityScore),
    sourceName: frame.sourceName,
    bbox: frame.metrics.bounds,
    normalizedBbox: frame.normalizedMetrics.bounds,
    edgeTouches: frame.metrics.edgeTouches,
    opaquePixels: frame.metrics.opaquePixels,
    warnings: frame.warnings,
    failures: frame.failures
  };
}

function buildMarkdownReport({ candidates, selected, baseline, targetHeight, outputDir }) {
  const improvement = selected.totalScore - baseline.totalScore;
  const conclusion =
    improvement >= 10 && countSwitches(selected.path) > 0
      ? "promising, but needs more real-generation repeats before adoption"
      : "not adopted; keep the best single candidate / existing method";
  return `# Tsugihagi Animation Frame Stitch Prototype

Date: ${new Date().toISOString()}

Scope: one-direction run-cycle experiment, 10 imagegen candidate sheets, 8 frames each.

## Result

- Conclusion: ${conclusion}
- Selected score: ${round2(selected.totalScore)}
- Best single baseline: ${baseline.candidateId} / ${round2(baseline.totalScore)}
- Improvement: ${round2(improvement)}
- Selected candidate switches: ${countSwitches(selected.path)}
- Target normalized cell: ${targetCell.width}x${targetCell.height}
- Target character height: ${targetHeight}px

This is a first-pass one-direction experiment. It must not replace official animation presets or be merged to main without owner review.

## Artifacts

- Candidate manifest: \`candidate-manifest.json\`
- Frame scores: \`frame-scores.json\`
- Selected sequence: \`selected-sequence.json\`
- Tsugihagi sheet: \`tsugihagi-run-cycle-side-sheet.png\`
- Tsugihagi GIF: \`tsugihagi-run-cycle-side.gif\`
- Best single baseline sheet: \`best-single-baseline-sheet.png\`
- Best single baseline GIF: \`best-single-baseline.gif\`
- Browser comparison page: \`index.html\`

## Selected Sequence

| Frame | Candidate | Quality | Warnings |
| --- | --- | ---: | --- |
${selected.path.map((frame) => `| ${frame.frameIndex + 1} | ${frame.candidateId} | ${round2(frame.qualityScore)} | ${frame.warnings.join("; ") || "-"} |`).join("\n")}

## Baseline

Best single candidate: ${baseline.candidateId}

| Frame | Quality | Warnings |
| --- | ---: | --- |
${baseline.frames.map((frame) => `| ${frame.frameIndex + 1} | ${round2(frame.qualityScore)} | ${frame.warnings.join("; ") || "-"} |`).join("\n")}

## Notes

- Input candidate count: ${candidates.length}
- Output directory: \`${outputDir}\`
- The scoring model favors frame quality, stable bbox/footline, color continuity, silhouette continuity, and fewer sheet switches.
- A single successful run is treated as evidence only, not official preset adoption.
`;
}

function buildHtmlReport({ candidates, selected, baseline, outputDir, action, direction }) {
  const sequenceRows = selected.path.map((frame) => `
        <tr>
          <td>${frame.frameIndex + 1}</td>
          <td>${frame.candidateId}</td>
          <td>${round2(frame.qualityScore)}</td>
          <td><img src="${toPosix(relative(outputDir, frame.outputFramePath ?? ""))}" alt="${frame.candidateId} frame ${frame.frameIndex + 1}"></td>
          <td>${escapeHtml(frame.warnings.join("; ") || "-")}</td>
        </tr>`).join("");
  const candidatesHtml = candidates.map((candidate) => `
        <figure>
          <img src="candidates/${escapeHtml(candidate.sourceName)}" alt="${candidate.candidateId}">
          <figcaption>${candidate.candidateId}<br>${candidate.width}x${candidate.height}</figcaption>
        </figure>`).join("");
  const improvement = selected.totalScore - baseline.totalScore;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tsugihagi Frame Stitch QA</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, Segoe UI, sans-serif; color: #17202a; background: #f7f8f3; }
    body { margin: 0; padding: 24px; }
    main { max-width: 1280px; margin: 0 auto; }
    h1, h2 { margin: 0 0 12px; }
    section { margin: 0 0 28px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; margin: 16px 0; }
    .metric { border: 1px solid #cbd5d1; background: #ffffff; border-radius: 6px; padding: 10px 12px; }
    .metric strong { display: block; font-size: 13px; color: #59635f; }
    .compare { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; align-items: start; }
    .panel { border: 1px solid #cbd5d1; background: #ffffff; border-radius: 6px; padding: 12px; }
    .panel img { image-rendering: pixelated; max-width: 100%; background: linear-gradient(45deg, #d9ddd9 25%, transparent 25%), linear-gradient(-45deg, #d9ddd9 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d9ddd9 75%), linear-gradient(-45deg, transparent 75%, #d9ddd9 75%); background-size: 16px 16px; background-position: 0 0, 0 8px, 8px -8px, -8px 0; }
    .candidate-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    figure { margin: 0; border: 1px solid #cbd5d1; background: #ffffff; border-radius: 6px; padding: 8px; }
    figure img { max-width: 100%; display: block; }
    figcaption { font-size: 12px; color: #59635f; margin-top: 6px; }
    table { width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #cbd5d1; }
    th, td { border-bottom: 1px solid #dfe5e2; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #e7ece8; }
    td img { width: 96px; height: 96px; object-fit: contain; image-rendering: pixelated; background: #eef1ee; }
    code { background: #e7ece8; padding: 2px 4px; border-radius: 4px; }
  </style>
</head>
<body>
<main>
  <h1>Tsugihagi Frame Stitch QA</h1>
  <section class="summary">
    <div class="metric"><strong>Action</strong>${escapeHtml(action)} / ${escapeHtml(direction)}</div>
    <div class="metric"><strong>Candidates</strong>${candidates.length}</div>
    <div class="metric"><strong>Selected score</strong>${round2(selected.totalScore)}</div>
    <div class="metric"><strong>Best single</strong>${baseline.candidateId} / ${round2(baseline.totalScore)}</div>
    <div class="metric"><strong>Improvement</strong>${round2(improvement)}</div>
    <div class="metric"><strong>Switches</strong>${countSwitches(selected.path)}</div>
  </section>

  <section class="compare">
    <div class="panel">
      <h2>Tsugihagi GIF</h2>
      <img src="tsugihagi-run-cycle-side.gif" alt="Tsugihagi GIF">
      <p><code>tsugihagi-run-cycle-side-sheet.png</code></p>
      <img src="tsugihagi-run-cycle-side-sheet.png" alt="Tsugihagi sheet">
    </div>
    <div class="panel">
      <h2>Best Single Baseline</h2>
      <img src="best-single-baseline.gif" alt="Best single baseline GIF">
      <p><code>best-single-baseline-sheet.png</code></p>
      <img src="best-single-baseline-sheet.png" alt="Best single baseline sheet">
    </div>
  </section>

  <section>
    <h2>Selected Sequence</h2>
    <table>
      <thead><tr><th>Frame</th><th>Candidate</th><th>Quality</th><th>Frame</th><th>Warnings</th></tr></thead>
      <tbody>${sequenceRows}</tbody>
    </table>
  </section>

  <section>
    <h2>Candidate Sheets</h2>
    <div class="candidate-grid">${candidatesHtml}</div>
  </section>
</main>
</body>
</html>`;
}

function decodePng(bytes) {
  if (!Buffer.from(bytes.subarray(0, 8)).equals(pngSignature)) throw new Error("Not a PNG file.");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatParts = [];

  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idatParts.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth ${bitDepth}; only 8-bit PNG is supported.`);
  if (interlace !== 0) throw new Error("Interlaced PNG is not supported.");
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 0 ? 1 : 0;
  if (channels === 0) throw new Error(`Unsupported PNG color type ${colorType}; expected RGBA/RGB/grayscale.`);

  const inflated = inflateSync(Buffer.concat(idatParts));
  const stride = width * channels;
  const rgba = new Uint8Array(width * height * 4);
  const previous = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);
  let inputOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    inflated.copy(current, 0, inputOffset, inputOffset + stride);
    inputOffset += stride;
    unfilterScanline(current, previous, channels, filter);

    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      if (colorType === 6) {
        rgba[target] = current[source];
        rgba[target + 1] = current[source + 1];
        rgba[target + 2] = current[source + 2];
        rgba[target + 3] = current[source + 3];
      } else if (colorType === 2) {
        rgba[target] = current[source];
        rgba[target + 1] = current[source + 1];
        rgba[target + 2] = current[source + 2];
        rgba[target + 3] = 255;
      } else if (colorType === 4) {
        rgba[target] = current[source];
        rgba[target + 1] = current[source];
        rgba[target + 2] = current[source];
        rgba[target + 3] = current[source + 1];
      } else {
        rgba[target] = current[source];
        rgba[target + 1] = current[source];
        rgba[target + 2] = current[source];
        rgba[target + 3] = 255;
      }
    }

    current.copy(previous);
  }

  return { width, height, data: rgba };
}

function unfilterScanline(current, previous, bpp, filter) {
  if (filter === 0) return;
  for (let index = 0; index < current.length; index += 1) {
    const left = index >= bpp ? current[index - bpp] : 0;
    const up = previous[index] ?? 0;
    const upLeft = index >= bpp ? previous[index - bpp] : 0;
    if (filter === 1) current[index] = (current[index] + left) & 0xff;
    else if (filter === 2) current[index] = (current[index] + up) & 0xff;
    else if (filter === 3) current[index] = (current[index] + Math.floor((left + up) / 2)) & 0xff;
    else if (filter === 4) current[index] = (current[index] + paeth(left, up, upLeft)) & 0xff;
    else throw new Error(`Unsupported PNG filter ${filter}.`);
  }
}

function paeth(left, up, upLeft) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  return pb <= pc ? up : upLeft;
}

function encodePng(image) {
  const stride = image.width * 4;
  const raw = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const rowOffset = y * (stride + 1);
    raw[rowOffset] = 0;
    Buffer.from(image.data.buffer, image.data.byteOffset + y * stride, stride).copy(raw, rowOffset + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    pngSignature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[i] = value >>> 0;
  }
  return table;
}

function gridBounds(width, height, columns, rows) {
  const bounds = [];
  for (let row = 0; row < rows; row += 1) {
    const y = Math.round((row * height) / rows);
    const bottom = Math.round(((row + 1) * height) / rows);
    for (let column = 0; column < columns; column += 1) {
      const x = Math.round((column * width) / columns);
      const right = Math.round(((column + 1) * width) / columns);
      bounds.push({ x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y), column, row });
    }
  }
  return bounds;
}

function cropImage(image, x, y, width, height) {
  const data = new Uint8Array(width * height * 4);
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const sx = clampInteger(x + px, 0, image.width - 1);
      const sy = clampInteger(y + py, 0, image.height - 1);
      const source = (sy * image.width + sx) * 4;
      const target = (py * width + px) * 4;
      data[target] = image.data[source];
      data[target + 1] = image.data[source + 1];
      data[target + 2] = image.data[source + 2];
      data[target + 3] = image.data[source + 3];
    }
  }
  return { width, height, data };
}

function cleanFrameCell(image, chroma) {
  const data = new Uint8Array(image.data);
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] <= 8 || isChroma(data, index, chroma) || isCyanGuide(data, index)) clearPixel(data, index);
  }

  const labels = new Int32Array(image.width * image.height).fill(-1);
  const components = labelComponents({ width: image.width, height: image.height, data }, labels);
  if (components.length === 0) return { width: image.width, height: image.height, data };

  const primary = components
    .slice()
    .sort((left, right) => {
      const countDiff = right.count - left.count;
      if (countDiff !== 0) return countDiff;
      return Math.abs(left.centerX - image.width / 2) - Math.abs(right.centerX - image.width / 2);
    })[0];
  const keep = new Uint8Array(components.length);
  const maxDistance = Math.max(image.width, image.height) * 0.42;
  for (const component of components) {
    const distance = Math.hypot(component.centerX - primary.centerX, component.centerY - primary.centerY);
    const overlapsExpanded =
      component.maxX >= primary.minX - image.width * 0.18 &&
      component.minX <= primary.maxX + image.width * 0.18 &&
      component.maxY >= primary.minY - image.height * 0.18 &&
      component.minY <= primary.maxY + image.height * 0.18;
    if (component.id === primary.id || (component.count >= 24 && (distance <= maxDistance || overlapsExpanded))) {
      keep[component.id] = 1;
    }
  }

  for (let pixel = 0; pixel < labels.length; pixel += 1) {
    const componentId = labels[pixel];
    if (componentId < 0 || keep[componentId] !== 1) clearPixel(data, pixel * 4);
  }

  zeroTransparentRgb(data);
  return { width: image.width, height: image.height, data };
}

function labelComponents(image, labels) {
  const components = [];
  const stack = [];
  const width = image.width;
  const height = image.height;
  for (let index = 0; index < labels.length; index += 1) {
    if (labels[index] >= 0 || image.data[index * 4 + 3] <= alphaThreshold) continue;
    const id = components.length;
    labels[index] = id;
    stack.push(index);
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    while (stack.length > 0) {
      const current = stack.pop();
      const x = current % width;
      const y = Math.floor(current / width);
      count += 1;
      sumX += x;
      sumY += y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const neighbors = [current - 1, current + 1, current - width, current + width];
      for (const next of neighbors) {
        if (next < 0 || next >= labels.length || labels[next] >= 0) continue;
        if ((next === current - 1 && x === 0) || (next === current + 1 && x === width - 1)) continue;
        if (image.data[next * 4 + 3] <= alphaThreshold) continue;
        labels[next] = id;
        stack.push(next);
      }
    }

    components.push({
      id,
      count,
      minX,
      minY,
      maxX,
      maxY,
      centerX: sumX / Math.max(1, count),
      centerY: sumY / Math.max(1, count)
    });
  }
  return components;
}

function inspectFrame(image) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  let opaquePixels = 0;
  let edgeTouches = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  const edgePadding = Math.max(3, Math.round(Math.min(image.width, image.height) * 0.015));

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (image.data[offset + 3] <= alphaThreshold) continue;
      opaquePixels += 1;
      sumR += image.data[offset];
      sumG += image.data[offset + 1];
      sumB += image.data[offset + 2];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (x < edgePadding || y < edgePadding || x >= image.width - edgePadding || y >= image.height - edgePadding) {
        edgeTouches += 1;
      }
    }
  }

  if (opaquePixels === 0) {
    return {
      bounds: null,
      opaquePixels: 0,
      edgeTouches: 0,
      coverage: 0,
      widthRatio: 0,
      heightRatio: 0,
      centerXRatio: 0,
      centerYRatio: 0,
      bottomRatio: 0,
      topMarginRatio: 0,
      meanColor: null
    };
  }

  const bounds = { minX, minY, maxX, maxY, count: opaquePixels };
  const boxWidth = maxX - minX + 1;
  const boxHeight = maxY - minY + 1;
  return {
    bounds,
    opaquePixels,
    edgeTouches,
    coverage: opaquePixels / (image.width * image.height),
    widthRatio: boxWidth / image.width,
    heightRatio: boxHeight / image.height,
    centerXRatio: ((minX + maxX) / 2) / image.width,
    centerYRatio: ((minY + maxY) / 2) / image.height,
    bottomRatio: maxY / image.height,
    topMarginRatio: minY / image.height,
    meanColor: [sumR / opaquePixels, sumG / opaquePixels, sumB / opaquePixels]
  };
}

function chooseTargetHeight(frames) {
  const ratios = frames
    .map((frame) => frame.metrics.heightRatio)
    .filter((value) => Number.isFinite(value) && value > 0.1 && value < 0.96);
  return clampInteger(Math.round(median(ratios) * targetCell.height), 118, 222);
}

function normalizeFrame(source, bounds, cell, targetHeight) {
  const output = { width: cell.width, height: cell.height, data: new Uint8Array(cell.width * cell.height * 4) };
  if (!bounds) return output;
  const cropWidth = bounds.maxX - bounds.minX + 1;
  const cropHeight = bounds.maxY - bounds.minY + 1;
  const scale = Math.min(
    targetHeight / Math.max(1, cropHeight),
    (cell.width * 0.88) / Math.max(1, cropWidth),
    (cell.height * 0.88) / Math.max(1, cropHeight)
  );
  const drawWidth = Math.max(1, Math.round(cropWidth * scale));
  const drawHeight = Math.max(1, Math.round(cropHeight * scale));
  const targetX = clampInteger(Math.round(cell.width / 2 - drawWidth / 2), 0, Math.max(0, cell.width - drawWidth));
  const targetY = clampInteger(Math.round(cell.height * 0.91 - drawHeight), 0, Math.max(0, cell.height - drawHeight));
  drawNearest(output, source, bounds.minX, bounds.minY, cropWidth, cropHeight, targetX, targetY, drawWidth, drawHeight);
  zeroTransparentRgb(output.data);
  return output;
}

function drawNearest(target, source, sourceX, sourceY, sourceWidth, sourceHeight, targetX, targetY, targetWidth, targetHeight) {
  for (let y = 0; y < targetHeight; y += 1) {
    const sy = clampInteger(sourceY + Math.floor((y / targetHeight) * sourceHeight), 0, source.height - 1);
    const ty = targetY + y;
    if (ty < 0 || ty >= target.height) continue;
    for (let x = 0; x < targetWidth; x += 1) {
      const sx = clampInteger(sourceX + Math.floor((x / targetWidth) * sourceWidth), 0, source.width - 1);
      const tx = targetX + x;
      if (tx < 0 || tx >= target.width) continue;
      const sourceOffset = (sy * source.width + sx) * 4;
      const targetOffset = (ty * target.width + tx) * 4;
      target.data[targetOffset] = source.data[sourceOffset];
      target.data[targetOffset + 1] = source.data[sourceOffset + 1];
      target.data[targetOffset + 2] = source.data[sourceOffset + 2];
      target.data[targetOffset + 3] = source.data[sourceOffset + 3];
    }
  }
}

function scoreFrames(frames) {
  const medians = Array.from({ length: frameCount }, (_, frameIndex) => {
    const group = frames.filter((frame) => frame.frameIndex === frameIndex && frame.metrics.bounds);
    return {
      widthRatio: median(group.map((frame) => frame.metrics.widthRatio)),
      heightRatio: median(group.map((frame) => frame.metrics.heightRatio)),
      centerXRatio: median(group.map((frame) => frame.metrics.centerXRatio)),
      bottomRatio: median(group.map((frame) => frame.metrics.bottomRatio)),
      coverage: median(group.map((frame) => frame.metrics.coverage))
    };
  });

  for (const frame of frames) {
    const warnings = [];
    const failures = [];
    let score = 100;
    const metrics = frame.metrics;
    const normalizedMetrics = frame.normalizedMetrics;
    const target = medians[frame.frameIndex];

    if (!metrics.bounds) {
      failures.push("blank frame after chroma cleanup");
      score = -1000;
    } else {
      if (metrics.edgeTouches > 0) {
        warnings.push(`source edge contact ${metrics.edgeTouches}px`);
        score -= Math.min(30, metrics.edgeTouches / 50);
      }
      if (normalizedMetrics.edgeTouches > 0) {
        warnings.push(`normalized edge contact ${normalizedMetrics.edgeTouches}px`);
        score -= Math.min(35, normalizedMetrics.edgeTouches / 20);
      }
      if (metrics.coverage < 0.008) {
        warnings.push("very small opaque coverage");
        score -= 25;
      }
      if (metrics.coverage > 0.55) {
        warnings.push("large opaque coverage after cleanup");
        score -= 30;
      }
      if (metrics.topMarginRatio < 0.01) {
        warnings.push("low top padding");
        score -= 14;
      }
      if (metrics.bottomRatio > 0.99) {
        warnings.push("feet/bottom touch source cell");
        score -= 18;
      }
      score -= Math.abs(metrics.widthRatio - target.widthRatio) * 45;
      score -= Math.abs(metrics.heightRatio - target.heightRatio) * 50;
      score -= Math.abs(metrics.centerXRatio - target.centerXRatio) * 35;
      score -= Math.abs(metrics.bottomRatio - target.bottomRatio) * 65;
      score -= Math.abs(metrics.coverage - target.coverage) * 80;
    }

    frame.qualityScore = score;
    frame.warnings = warnings;
    frame.failures = failures;
  }
}

function selectBestSequence(frames) {
  const byIndex = Array.from({ length: frameCount }, (_, frameIndex) =>
    frames.filter((frame) => frame.frameIndex === frameIndex).sort((left, right) => left.candidateIndex - right.candidateIndex)
  );
  const startNodes = byIndex[0];
  let best = null;

  for (const start of startNodes) {
    const dp = byIndex.map((nodes) => nodes.map(() => ({ score: -Infinity, previous: -1, transition: null })));
    dp[0][byIndex[0].indexOf(start)] = { score: start.qualityScore, previous: -1, transition: null };

    for (let frameIndex = 1; frameIndex < frameCount; frameIndex += 1) {
      for (let nodeIndex = 0; nodeIndex < byIndex[frameIndex].length; nodeIndex += 1) {
        const node = byIndex[frameIndex][nodeIndex];
        let nodeBest = { score: -Infinity, previous: -1, transition: null };
        for (let prevIndex = 0; prevIndex < byIndex[frameIndex - 1].length; prevIndex += 1) {
          const previousState = dp[frameIndex - 1][prevIndex];
          if (!Number.isFinite(previousState.score)) continue;
          const previousNode = byIndex[frameIndex - 1][prevIndex];
          const transition = transitionPenalty(previousNode, node);
          const total = previousState.score + node.qualityScore - transition.total;
          if (total > nodeBest.score) {
            nodeBest = { score: total, previous: prevIndex, transition };
          }
        }
        dp[frameIndex][nodeIndex] = nodeBest;
      }
    }

    for (let endIndex = 0; endIndex < byIndex[frameCount - 1].length; endIndex += 1) {
      const endState = dp[frameCount - 1][endIndex];
      if (!Number.isFinite(endState.score)) continue;
      const endNode = byIndex[frameCount - 1][endIndex];
      const closing = transitionPenalty(endNode, start, { closing: true });
      const totalScore = endState.score - closing.total;
      if (!best || totalScore > best.totalScore) {
        const path = [];
        const transitions = [{ fromFrame: frameCount, toFrame: 1, closing: true, ...simplifyTransition(closing, endNode, start) }];
        let cursor = endIndex;
        for (let frameIndex = frameCount - 1; frameIndex >= 0; frameIndex -= 1) {
          const node = byIndex[frameIndex][cursor];
          path.unshift(node);
          const state = dp[frameIndex][cursor];
          if (state.transition) {
            transitions.unshift({
              fromFrame: frameIndex,
              toFrame: frameIndex + 1,
              closing: false,
              ...simplifyTransition(state.transition, byIndex[frameIndex - 1][state.previous], node)
            });
          }
          cursor = state.previous;
          if (cursor < 0 && frameIndex > 0) break;
        }
        best = { totalScore, path, transitions };
      }
    }
  }

  return best;
}

function selectBestSingleCandidate(candidates) {
  let best = null;
  for (const candidate of candidates) {
    const frames = candidate.frames.slice().sort((left, right) => left.frameIndex - right.frameIndex);
    let total = frames.reduce((sum, frame) => sum + frame.qualityScore, 0);
    const transitions = [];
    for (let index = 1; index < frames.length; index += 1) {
      const transition = transitionPenalty(frames[index - 1], frames[index], { noSwitchPenalty: true });
      total -= transition.total;
      transitions.push(transition);
    }
    const closing = transitionPenalty(frames[frames.length - 1], frames[0], { noSwitchPenalty: true, closing: true });
    total -= closing.total;
    candidate.totalScore = total;
    if (!best || total > best.totalScore) best = { candidateId: candidate.candidateId, totalScore: total, frames, transitions: [...transitions, closing] };
  }
  return best;
}

function transitionPenalty(left, right, options = {}) {
  const baseline = Math.abs(left.normalizedMetrics.bottomRatio - right.normalizedMetrics.bottomRatio) * 90;
  const center = Math.abs(left.normalizedMetrics.centerXRatio - right.normalizedMetrics.centerXRatio) * 35;
  const width = Math.abs(left.normalizedMetrics.widthRatio - right.normalizedMetrics.widthRatio) * 35;
  const height = Math.abs(left.normalizedMetrics.heightRatio - right.normalizedMetrics.heightRatio) * 35;
  const color = colorDistance(left.meanColor, right.meanColor) / 12;
  const silhouette = alphaDistance(left.alphaSignature, right.alphaSignature) * (options.closing ? 12 : 18);
  const switchPenalty = !options.noSwitchPenalty && left.candidateId !== right.candidateId ? 4 : 0;
  const blankPenalty = (!left.metrics.bounds || !right.metrics.bounds) ? 80 : 0;
  return {
    total: baseline + center + width + height + color + silhouette + switchPenalty + blankPenalty,
    baseline: round2(baseline),
    center: round2(center),
    width: round2(width),
    height: round2(height),
    color: round2(color),
    silhouette: round2(silhouette),
    switchPenalty,
    blankPenalty
  };
}

function simplifyTransition(transition, left, right) {
  return {
    fromCandidate: left.candidateId,
    toCandidate: right.candidateId,
    totalPenalty: round2(transition.total),
    baseline: transition.baseline,
    center: transition.center,
    width: transition.width,
    height: transition.height,
    color: transition.color,
    silhouette: transition.silhouette,
    switchPenalty: transition.switchPenalty,
    blankPenalty: transition.blankPenalty
  };
}

function composeStrip(images, cell) {
  const output = { width: cell.width * images.length, height: cell.height, data: new Uint8Array(cell.width * cell.height * images.length * 4) };
  for (let index = 0; index < images.length; index += 1) {
    pasteImage(output, images[index], index * cell.width, 0);
  }
  return output;
}

function pasteImage(target, source, targetX, targetY) {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const tx = targetX + x;
      const ty = targetY + y;
      if (tx < 0 || ty < 0 || tx >= target.width || ty >= target.height) continue;
      const sourceOffset = (y * source.width + x) * 4;
      const targetOffset = (ty * target.width + tx) * 4;
      target.data[targetOffset] = source.data[sourceOffset];
      target.data[targetOffset + 1] = source.data[sourceOffset + 1];
      target.data[targetOffset + 2] = source.data[sourceOffset + 2];
      target.data[targetOffset + 3] = source.data[sourceOffset + 3];
    }
  }
}

async function writeGif(images, width, height, filePath, fps) {
  const encoder = GIFEncoder();
  for (const image of images) {
    const data = new Uint8ClampedArray(image.data);
    const palette = quantize(data, 255, { format: "rgba4444", oneBitAlpha: true });
    let transparentIndex = palette.findIndex((color) => color[3] === 0);
    if (transparentIndex < 0) transparentIndex = 0;
    const indexed = applyPalette(data, palette, "rgba4444");
    encoder.writeFrame(indexed, width, height, {
      palette,
      delay: Math.round(1000 / fps),
      transparent: true,
      transparentIndex,
      repeat: 0
    });
  }
  encoder.finish();
  await writeFile(filePath, Buffer.from(encoder.bytes()));
}

function alphaSignature(image, width, height) {
  const signature = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const sy0 = Math.floor((y * image.height) / height);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * image.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sx0 = Math.floor((x * image.width) / width);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * image.width) / width));
      let total = 0;
      let count = 0;
      for (let sy = sy0; sy < Math.min(image.height, sy1); sy += 1) {
        for (let sx = sx0; sx < Math.min(image.width, sx1); sx += 1) {
          total += image.data[(sy * image.width + sx) * 4 + 3] > alphaThreshold ? 1 : 0;
          count += 1;
        }
      }
      signature[y * width + x] = total / Math.max(1, count);
    }
  }
  return signature;
}

function alphaDistance(left, right) {
  if (!left || !right || left.length !== right.length) return 1;
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index] - right[index]);
  return total / left.length;
}

function colorDistance(left, right) {
  if (!left || !right) return 255;
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function countSwitches(path) {
  let switches = 0;
  for (let index = 1; index < path.length; index += 1) {
    if (path[index].candidateId !== path[index - 1].candidateId) switches += 1;
  }
  return switches;
}

function hashFrame(image) {
  return createHash("sha1").update(image.data).digest("hex");
}

function chromaKeyFor(name) {
  if (name === "green") return { name: "green", r: 0, g: 255, b: 0, tolerance: 115 };
  return { name: "magenta", r: 255, g: 0, b: 255, tolerance: 125 };
}

function isChroma(data, index, chroma) {
  const distance = Math.hypot(data[index] - chroma.r, data[index + 1] - chroma.g, data[index + 2] - chroma.b);
  return distance <= chroma.tolerance;
}

function isCyanGuide(data, index) {
  return data[index] < 20 && data[index + 1] > 220 && data[index + 2] > 220;
}

function clearPixel(data, index) {
  data[index] = 0;
  data[index + 1] = 0;
  data[index + 2] = 0;
  data[index + 3] = 0;
}

function zeroTransparentRgb(data) {
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] <= alphaThreshold) {
      data[index] = 0;
      data[index + 1] = 0;
      data[index + 2] = 0;
    }
  }
}

function median(values) {
  const filtered = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (filtered.length === 0) return 0;
  const middle = Math.floor(filtered.length / 2);
  return filtered.length % 2 === 0 ? (filtered[middle - 1] + filtered[middle]) / 2 : filtered[middle];
}

function clampInteger(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function toPosix(value) {
  return value.replace(/\\/g, "/");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
