import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Download,
  Eye,
  EyeOff,
  Pause,
  Play,
  Save,
  StepBack,
  StepForward,
  Wrench,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { AnimationQualityReportV2 } from "./types";
import {
  animationReviewAutomaticReason,
  animationReviewDimensionScores,
  animationReviewQcMatrix,
  animationReviewReasonTags,
  buildAnimationCalibrationExport,
  emptyAnimationHumanReview,
  upsertAnimationHumanReviewDecision
} from "./lib/animationReview";
import type {
  AnimationHumanReview,
  AnimationReviewDecision,
  AnimationReviewHeatMode,
  AnimationReviewQcCell
} from "./lib/animationReview";
import { downloadBlob } from "./lib/image";

export interface AnimationReviewCandidateView {
  jobId: string;
  label: string;
  state: string;
  score?: number;
  warningCount?: number;
  reason?: string;
  error?: string;
  sheets: Record<string, string | undefined>;
  quality?: AnimationQualityReportV2;
  repairDirections?: string[];
}

export interface AnimationReviewManifestView {
  tournamentId: string;
  sourceFingerprint: string;
  generationProfile: string;
  requestedDirections: string[];
  winnerCandidateId?: string;
  thirdCandidateReason?: string;
  state: string;
}

interface AnimationReviewCockpitProps {
  language: "ja" | "en";
  manifest: AnimationReviewManifestView;
  candidates: AnimationReviewCandidateView[];
  frameCount: number;
  sourceDataUrl?: string;
  initialReview?: AnimationHumanReview;
  loading?: boolean;
  onClose: () => void;
  onSaveReview: (review: AnimationHumanReview) => Promise<void>;
  onAdopt: (jobId: string) => Promise<void>;
  onRepairDirection: (direction: string) => Promise<void>;
}

const heatModes: Array<{ id: AnimationReviewHeatMode; ja: string; en: string }> = [
  { id: "foot-drift", ja: "接地ずれ", en: "Foot drift" },
  { id: "bbox", ja: "BBox変動", en: "BBox" },
  { id: "identity", ja: "同一性", en: "Identity" },
  { id: "loop-seam", ja: "ループ継ぎ目", en: "Loop seam" },
  { id: "static-copy", ja: "静止コピー", en: "Static copy" },
  { id: "clipping", ja: "クリップ", en: "Clipping" }
];

const speedOptions = [0.5, 1, 1.5, 2];

function statusIcon(status: "pass" | "warning" | "fail") {
  if (status === "pass") return <CheckCircle2 size={14} aria-hidden="true" />;
  if (status === "warning") return <AlertTriangle size={14} aria-hidden="true" />;
  return <CircleX size={14} aria-hidden="true" />;
}

function frameSheetStyle(frameIndex: number, frameCount: number, correction?: { scale: number; translateX: number; translateY: number }): CSSProperties {
  const safeCount = Math.max(1, frameCount);
  const columns = safeCount <= 4 ? safeCount : safeCount === 6 ? 3 : 4;
  const rows = Math.ceil(safeCount / columns);
  const column = frameIndex % columns;
  const row = Math.floor(frameIndex / columns);
  return {
    width: `${columns * 100}%`,
    height: `${rows * 100}%`,
    maxWidth: "none",
    maxHeight: "none",
    transform: `translate(${-column * (100 / columns)}%, ${-row * (100 / rows)}%)${correction ? ` translate(${correction.translateX}px, ${correction.translateY}px) scale(${correction.scale})` : ""}`,
    transformOrigin: `${((column + 0.5) / columns) * 100}% ${((row + 0.5) / rows) * 100}%`
  };
}

function CandidateFrame({
  candidate,
  direction,
  frameIndex,
  frameCount,
  normalized,
  sourceDataUrl,
  sourceOpacity,
  showOnion,
  showDiff,
  showGround,
  showPivot,
  showSocket,
  showHitbox,
  showHurtbox,
  background
}: {
  candidate: AnimationReviewCandidateView;
  direction: string;
  frameIndex: number;
  frameCount: number;
  normalized: boolean;
  sourceDataUrl?: string;
  sourceOpacity: number;
  showOnion?: boolean;
  showDiff?: boolean;
  showGround?: boolean;
  showPivot?: boolean;
  showSocket?: boolean;
  showHitbox?: boolean;
  showHurtbox?: boolean;
  background?: "checker" | "light" | "dark";
}) {
  const sheet = candidate.sheets[direction];
  const correction = candidate.quality?.normalizationCorrection.frames.find((entry) => entry.direction === direction && entry.frameIndex === frameIndex);
  const previousIndex = (frameIndex - 1 + Math.max(1, frameCount)) % Math.max(1, frameCount);
  return (
    <div className={`review-frame-stage background-${background ?? "checker"}`}>
      {sheet ? (
        <>
          {showOnion ? (
            <div className="review-frame-layer review-frame-onion" aria-hidden="true">
              <img src={sheet} alt="" style={frameSheetStyle(previousIndex, frameCount)} />
            </div>
          ) : null}
          {showDiff ? (
            <div className="review-frame-layer review-frame-diff" aria-hidden="true">
              <img src={sheet} alt="" style={frameSheetStyle(previousIndex, frameCount)} />
            </div>
          ) : null}
          <div className="review-frame-layer">
            <img
              src={sheet}
              alt={`${candidate.label} ${direction} frame ${frameIndex + 1}`}
              style={frameSheetStyle(frameIndex, frameCount, normalized ? correction : undefined)}
            />
          </div>
        </>
      ) : (
        <div className="review-frame-missing"><CircleX size={20} aria-hidden="true" /><span>No artifact</span></div>
      )}
      {sourceDataUrl && sourceOpacity > 0 ? <img className="review-source-overlay" src={sourceDataUrl} alt="" style={{ opacity: sourceOpacity }} aria-hidden="true" /> : null}
      {showGround ? <span className="review-ground-line" aria-label="Ground line" /> : null}
      {showPivot ? <span className="review-pivot-marker" aria-label="Pivot marker">P</span> : null}
      {showSocket ? <span className="review-socket-marker" aria-label="Socket marker">S</span> : null}
      {showHitbox ? <span className="review-hitbox" aria-label="Hitbox overlay">Hit</span> : null}
      {showHurtbox ? <span className="review-hurtbox" aria-label="Hurtbox overlay">Hurt</span> : null}
    </div>
  );
}

export function AnimationReviewCockpit({
  language,
  manifest,
  candidates,
  frameCount,
  sourceDataUrl,
  initialReview,
  loading,
  onClose,
  onSaveReview,
  onAdopt,
  onRepairDirection
}: AnimationReviewCockpitProps) {
  const ja = language === "ja";
  const dialogRef = useRef<HTMLElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);
  const [directionIndex, setDirectionIndex] = useState(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [normalized, setNormalized] = useState(true);
  const [sourceOpacity, setSourceOpacity] = useState(0);
  const [activeCandidateId, setActiveCandidateId] = useState(candidates[0]?.jobId ?? "");
  const [heatMode, setHeatMode] = useState<AnimationReviewHeatMode>("foot-drift");
  const [selectedCell, setSelectedCell] = useState<AnimationReviewQcCell>();
  const [review, setReview] = useState<AnimationHumanReview>(initialReview ?? emptyAnimationHumanReview(new Date().toISOString()));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [actionState, setActionState] = useState<"idle" | "adopting" | "repairing">("idle");
  const [actionError, setActionError] = useState("");
  const [showOnion, setShowOnion] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showGround, setShowGround] = useState(true);
  const [showPivot, setShowPivot] = useState(false);
  const [showSocket, setShowSocket] = useState(false);
  const [showHitbox, setShowHitbox] = useState(false);
  const [showHurtbox, setShowHurtbox] = useState(false);
  const [background, setBackground] = useState<"checker" | "light" | "dark">("checker");
  const [reducedMotion, setReducedMotion] = useState(false);
  const directions = manifest.requestedDirections.length > 0 ? manifest.requestedDirections : ["front"];
  const direction = directions[Math.min(directionIndex, directions.length - 1)];
  const activeCandidate = candidates.find((candidate) => candidate.jobId === activeCandidateId) ?? candidates[0];
  const activeDecision = review.decisions.find((entry) => entry.jobId === activeCandidate?.jobId);
  const qcCells = useMemo(
    () => animationReviewQcMatrix(activeCandidate?.quality, directions, frameCount, heatMode),
    [activeCandidate?.quality, directions, frameCount, heatMode]
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReducedMotion(media.matches);
      if (media.matches) setPlaying(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!playing || reducedMotion) return;
    const timer = window.setInterval(() => setFrameIndex((current) => (current + 1) % Math.max(1, frameCount)), Math.max(45, 125 / speed));
    return () => window.clearInterval(timer);
  }, [frameCount, playing, reducedMotion, speed]);

  useEffect(() => {
    firstFocusRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setFrameIndex((current) => (current - 1 + Math.max(1, frameCount)) % Math.max(1, frameCount));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setFrameIndex((current) => (current + 1) % Math.max(1, frameCount));
      } else if (event.key === " " && !/INPUT|TEXTAREA|SELECT|BUTTON/.test((event.target as HTMLElement).tagName)) {
        event.preventDefault();
        setPlaying((current) => !current);
      } else if (event.key === "Tab") {
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [frameCount]);

  function updateDecision(decision: AnimationReviewDecision) {
    if (!activeCandidate) return;
    setReview((current) => upsertAnimationHumanReviewDecision(current, {
      jobId: activeCandidate.jobId,
      decision,
      reasonTags: activeDecision?.reasonTags ?? [],
      note: activeDecision?.note ?? ""
    }));
    setSaveState("idle");
  }

  function updateDecisionDetail(patch: { reasonTags?: string[]; note?: string }) {
    if (!activeCandidate) return;
    setReview((current) => upsertAnimationHumanReviewDecision(current, {
      jobId: activeCandidate.jobId,
      decision: activeDecision?.decision ?? "hold",
      reasonTags: patch.reasonTags ?? activeDecision?.reasonTags ?? [],
      note: patch.note ?? activeDecision?.note ?? ""
    }));
    setSaveState("idle");
  }

  async function saveReview() {
    setSaveState("saving");
    try {
      await onSaveReview(review);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  async function adoptWinner() {
    const winnerId = review.manualWinnerJobId ?? activeCandidate?.jobId;
    if (!winnerId) return;
    setActionState("adopting");
    setActionError("");
    try {
      await onSaveReview(review.manualWinnerJobId ? review : upsertAnimationHumanReviewDecision(review, { jobId: winnerId, decision: "winner", reasonTags: [], note: "" }));
      await onAdopt(winnerId);
      onClose();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Candidate adoption failed.");
    } finally {
      setActionState("idle");
    }
  }

  function exportCalibration() {
    const data = buildAnimationCalibrationExport({
      tournamentId: manifest.tournamentId,
      sourceFingerprint: manifest.sourceFingerprint,
      winnerJobId: manifest.winnerCandidateId,
      review,
      reports: Object.fromEntries(candidates.map((candidate) => [candidate.jobId, candidate.quality]))
    });
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `${manifest.tournamentId}-calibration.json`);
  }

  async function repairDirection() {
    setActionState("repairing");
    setActionError("");
    try {
      await onRepairDirection(selectedCell?.direction ?? direction);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Direction Repair could not start.");
    } finally {
      setActionState("idle");
    }
  }

  const correction = selectedCell?.correction;
  return (
    <div className="animation-review-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="animation-review-cockpit"
        role="dialog"
        aria-modal="true"
        aria-labelledby="animation-review-title"
        aria-describedby="animation-review-summary"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="animation-review-header">
          <div>
            <span className="eyebrow">Animation Review Cockpit</span>
            <h2 id="animation-review-title">{ja ? "候補比較・QC・採用レビュー" : "Candidate compare, QC and adoption"}</h2>
            <p id="animation-review-summary">{manifest.generationProfile} · {directions.length} directions · {frameCount} frames · {manifest.state}</p>
          </div>
          <div className="animation-review-header-actions">
            <button ref={firstFocusRef} type="button" className="secondary-button" onClick={exportCalibration}><Download size={15} aria-hidden="true" />Calibration JSON</button>
            <button type="button" className="icon-button" aria-label={ja ? "レビューを閉じる" : "Close review"} onClick={onClose}><X size={18} aria-hidden="true" /></button>
          </div>
        </header>

        <div className="animation-review-toolbar" aria-label={ja ? "同期再生コントロール" : "Synchronized playback controls"}>
          <button type="button" className="icon-button" aria-label={playing ? "Pause" : "Play"} aria-pressed={playing} disabled={reducedMotion} onClick={() => setPlaying((current) => !current)}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
          <button type="button" className="icon-button" aria-label="Previous frame" onClick={() => setFrameIndex((current) => (current - 1 + frameCount) % frameCount)}><StepBack size={16} /></button>
          <strong>F {frameIndex + 1}/{frameCount}</strong>
          <button type="button" className="icon-button" aria-label="Next frame" onClick={() => setFrameIndex((current) => (current + 1) % frameCount)}><StepForward size={16} /></button>
          <label><span>Speed</span><select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>{speedOptions.map((value) => <option key={value} value={value}>{value}x</option>)}</select></label>
          <div className="segmented-control compact" aria-label="Direction">
            <button type="button" className="icon-button" aria-label="Previous direction" onClick={() => setDirectionIndex((current) => (current - 1 + directions.length) % directions.length)}><ChevronLeft size={15} /></button>
            <strong>{direction}</strong>
            <button type="button" className="icon-button" aria-label="Next direction" onClick={() => setDirectionIndex((current) => (current + 1) % directions.length)}><ChevronRight size={15} /></button>
          </div>
          <button type="button" className={normalized ? "active" : ""} aria-pressed={normalized} onClick={() => setNormalized((current) => !current)}>{normalized ? "Normalized" : "Raw"}</button>
          <label className="source-opacity-control"><span>{ja ? "原画重ね" : "Source"} {Math.round(sourceOpacity * 100)}%</span><input type="range" min="0" max="1" step="0.1" value={sourceOpacity} disabled={!sourceDataUrl} onChange={(event) => setSourceOpacity(Number(event.target.value))} /></label>
          {reducedMotion ? <small className="reduced-motion-note"><Pause size={13} />{ja ? "視差軽減設定により自動再生停止" : "Autoplay paused by reduced motion"}</small> : null}
        </div>

        <main className="animation-review-scroll">
          <section className="review-section" aria-labelledby="candidate-compare-title">
            <div className="review-section-heading">
              <div><span className="step-number">1</span><h3 id="candidate-compare-title">Candidate A/B/C · Sync Compare</h3></div>
              <p>{ja ? "全候補を同じ方向・フレーム・速度で比較するニャ" : "Compare every candidate at the same direction, frame and speed."}</p>
            </div>
            {loading ? <div className="review-loading" role="status">Loading candidate artifacts…</div> : null}
            <div className={`candidate-compare-grid candidate-count-${Math.min(candidates.length, 3)}`}>
              {candidates.map((candidate) => {
                const selected = candidate.jobId === activeCandidate?.jobId;
                const decision = review.decisions.find((entry) => entry.jobId === candidate.jobId);
                const scores = animationReviewDimensionScores(candidate.quality);
                return (
                  <article key={candidate.jobId} className={`review-candidate-card${selected ? " selected" : ""}${candidate.error ? " failed" : ""}`}>
                    <button type="button" className="candidate-card-select" aria-pressed={selected} onClick={() => setActiveCandidateId(candidate.jobId)}>
                      <span><strong>{candidate.label}</strong><small>{candidate.state} · {candidate.jobId.slice(-8)}</small></span>
                      <span className={`status-badge status-${candidate.error ? "fail" : candidate.warningCount ? "warning" : "pass"}`}>{candidate.error ? <CircleX size={13} /> : candidate.warningCount ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}{candidate.error ? "Failed" : `${candidate.warningCount ?? 0} warnings`}</span>
                    </button>
                    <CandidateFrame candidate={candidate} direction={direction} frameIndex={frameIndex} frameCount={frameCount} normalized={normalized} sourceDataUrl={sourceDataUrl} sourceOpacity={sourceOpacity} background={background} />
                    <div className="candidate-dimension-grid">
                      {scores.map((score) => <span key={score.id} className={`dimension-score status-${score.status}`}>{statusIcon(score.status)}<b>{score.label}</b><em>{score.score ?? "—"}</em></span>)}
                    </div>
                    <p className="candidate-auto-reason">{candidate.error ?? candidate.reason ?? animationReviewAutomaticReason(candidate.quality)}</p>
                    {candidate.repairDirections?.length ? <p className="candidate-repair-note"><Wrench size={13} />Repair: {candidate.repairDirections.join(", ")}</p> : null}
                    {decision ? <span className={`manual-decision decision-${decision.decision}`}>{decision.decision === "winner" ? <Check size={13} /> : decision.decision === "reject" ? <CircleX size={13} /> : <Eye size={13} />}{decision.decision}</span> : null}
                  </article>
                );
              })}
            </div>
            {manifest.thirdCandidateReason ? <p className="review-callout"><AlertTriangle size={15} />Candidate C: {manifest.thirdCandidateReason}</p> : null}
          </section>

          <section className="review-section review-workbench" aria-labelledby="review-workbench-title">
            <div className="review-section-heading">
              <div><span className="step-number">2</span><h3 id="review-workbench-title">Human Review</h3></div>
              <p>{ja ? "自動スコアを上書きせず、人の判断を別レイヤーで保存するニャ" : "Store human judgment as a separate calibration layer."}</p>
            </div>
            {activeCandidate ? (
              <div className="human-review-grid">
                <fieldset>
                  <legend>{activeCandidate.label}</legend>
                  <div className="segmented-control decision-control">
                    {(["winner", "hold", "reject"] as AnimationReviewDecision[]).map((decision) => <button key={decision} type="button" className={activeDecision?.decision === decision ? "active" : ""} aria-pressed={activeDecision?.decision === decision} onClick={() => updateDecision(decision)}>{decision}</button>)}
                  </div>
                  <div className="reason-tag-grid" aria-label="Reject reason tags">
                    {animationReviewReasonTags.map((tag) => {
                      const checked = activeDecision?.reasonTags.includes(tag) ?? false;
                      return <label key={tag} className={checked ? "checked" : ""}><input type="checkbox" checked={checked} onChange={() => updateDecisionDetail({ reasonTags: checked ? activeDecision?.reasonTags.filter((item) => item !== tag) : [...(activeDecision?.reasonTags ?? []), tag] })} />{tag}</label>;
                    })}
                  </div>
                </fieldset>
                <label className="review-note"><span>{ja ? "レビュー・メモ" : "Review note"}</span><textarea value={activeDecision?.note ?? ""} maxLength={1000} placeholder={ja ? "目視判断、採用理由、再生成条件" : "Visual judgment, adoption reason, regeneration condition"} onChange={(event) => updateDecisionDetail({ note: event.target.value })} /><small>{(activeDecision?.note ?? "").length}/1000</small></label>
                <div className="review-save-panel" aria-live="polite">
                  <button type="button" className="secondary-button" disabled={saveState === "saving"} onClick={() => void saveReview()}><Save size={15} />{saveState === "saving" ? "Saving…" : ja ? "判断を保存" : "Save review"}</button>
                  <span className={`save-state save-${saveState}`}>{saveState === "saved" ? (ja ? "保存済み" : "Saved") : saveState === "error" ? (ja ? "保存失敗" : "Save failed") : ""}</span>
                </div>
              </div>
            ) : null}
          </section>

          <section className="review-section" aria-labelledby="qc-matrix-title">
            <div className="review-section-heading">
              <div><span className="step-number">3</span><h3 id="qc-matrix-title">Direction × Frame QC Matrix</h3></div>
              <div className="qc-legend"><span className="status-pass"><CheckCircle2 size={13} />Pass</span><span className="status-warning"><AlertTriangle size={13} />Warning</span><span className="status-fail"><CircleX size={13} />Fail</span></div>
            </div>
            <div className="qc-mode-tabs" role="tablist" aria-label="QC heatmap">
              {heatModes.map((mode) => <button key={mode.id} type="button" role="tab" aria-selected={heatMode === mode.id} className={heatMode === mode.id ? "active" : ""} onClick={() => setHeatMode(mode.id)}>{ja ? mode.ja : mode.en}</button>)}
            </div>
            <div className="qc-matrix-scroll">
              <table className="qc-matrix">
                <thead><tr><th>Direction</th>{Array.from({ length: frameCount }, (_, index) => <th key={index}>F{index + 1}</th>)}</tr></thead>
                <tbody>{directions.map((itemDirection) => <tr key={itemDirection}><th>{itemDirection}</th>{qcCells.filter((cell) => cell.direction === itemDirection).map((cell) => <td key={cell.frameIndex}><button type="button" className={`qc-cell status-${cell.status}${selectedCell?.direction === cell.direction && selectedCell.frameIndex === cell.frameIndex ? " selected" : ""}`} aria-label={cell.label} title={cell.label} onClick={() => { setSelectedCell(cell); setDirectionIndex(directions.indexOf(cell.direction)); setFrameIndex(cell.frameIndex); }}>{statusIcon(cell.status)}<span>{cell.value}</span></button></td>)}</tr>)}</tbody>
              </table>
            </div>
            {selectedCell && activeCandidate ? (
              <div className="qc-cell-inspector">
                <div><strong>{selectedCell.direction} · F{selectedCell.frameIndex + 1}</strong><span className={`status-badge status-${selectedCell.status}`}>{statusIcon(selectedCell.status)}{selectedCell.status} · {selectedCell.value}</span></div>
                <div className="qc-frame-comparison">
                  <figure><CandidateFrame candidate={activeCandidate} direction={selectedCell.direction} frameIndex={selectedCell.frameIndex} frameCount={frameCount} normalized={false} sourceOpacity={0} background={background} /><figcaption>Raw</figcaption></figure>
                  <figure><CandidateFrame candidate={activeCandidate} direction={selectedCell.direction} frameIndex={selectedCell.frameIndex} frameCount={frameCount} normalized sourceOpacity={0} background={background} /><figcaption>Normalized</figcaption></figure>
                  <figure><CandidateFrame candidate={activeCandidate} direction={selectedCell.direction} frameIndex={selectedCell.frameIndex} frameCount={frameCount} normalized sourceOpacity={0} showDiff background="dark" /><figcaption>Adjacent diff</figcaption></figure>
                </div>
                <dl className="correction-facts"><div><dt>Scale</dt><dd>{correction?.scale.toFixed(3) ?? "—"}</dd></div><div><dt>Translate X</dt><dd>{correction?.translateX.toFixed(1) ?? "—"}</dd></div><div><dt>Translate Y</dt><dd>{correction?.translateY.toFixed(1) ?? "—"}</dd></div></dl>
                <div className="repair-actions"><button type="button" className="secondary-button" disabled={actionState !== "idle"} onClick={() => void repairDirection()}><Wrench size={15} />{actionState === "repairing" ? "Starting…" : `${selectedCell.direction} Direction Repair`}</button><button type="button" disabled title={ja ? "部分フレーム修復は生成器がフレーム範囲固定を保証できないため未対応" : "Frame-range repair is disabled because the generator cannot yet preserve the untouched frame range."}>Frame-range Repair</button><small>{ja ? "フレーム範囲修復は未変更フレーム保証がないため無効" : "Disabled until untouched-frame preservation can be verified."}</small></div>
              </div>
            ) : null}
          </section>

          <section className="review-section" aria-labelledby="preview-studio-title">
            <div className="review-section-heading"><div><span className="step-number">4</span><h3 id="preview-studio-title">Preview Studio</h3></div><p>{ja ? "ゲーム座標とループ継ぎ目を同時確認するニャ" : "Inspect game coordinates and the loop seam together."}</p></div>
            <div className="preview-studio-grid">
              <div className="preview-studio-stage">
                {activeCandidate ? <CandidateFrame candidate={activeCandidate} direction={direction} frameIndex={frameIndex} frameCount={frameCount} normalized={normalized} sourceDataUrl={sourceDataUrl} sourceOpacity={sourceOpacity} showOnion={showOnion} showDiff={showDiff} showGround={showGround} showPivot={showPivot} showSocket={showSocket} showHitbox={showHitbox} showHurtbox={showHurtbox} background={background} /> : null}
                <div className="loop-seam-strip"><span>Loop seam</span><b>F{frameCount}</b><ChevronRight size={14} /><b>F1</b><em>{activeCandidate?.quality?.loopSeamScore ?? "—"}</em></div>
              </div>
              <div className="preview-overlay-controls">
                {[{ label: "Onion", value: showOnion, set: setShowOnion }, { label: "Prev/next diff", value: showDiff, set: setShowDiff }, { label: "Ground", value: showGround, set: setShowGround }, { label: "Pivot", value: showPivot, set: setShowPivot }, { label: "Socket", value: showSocket, set: setShowSocket }, { label: "Hitbox", value: showHitbox, set: setShowHitbox }, { label: "Hurtbox", value: showHurtbox, set: setShowHurtbox }].map((control) => <button key={control.label} type="button" className={control.value ? "active" : ""} aria-pressed={control.value} onClick={() => control.set(!control.value)}>{control.value ? <Eye size={14} /> : <EyeOff size={14} />}{control.label}</button>)}
                <label><span>Background</span><select value={background} onChange={(event) => setBackground(event.target.value as typeof background)}><option value="checker">Checker</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
              </div>
            </div>
          </section>
        </main>

        <footer className="animation-review-footer">
          <div aria-live="polite"><strong>{review.manualWinnerJobId ? `${candidates.find((candidate) => candidate.jobId === review.manualWinnerJobId)?.label ?? "Candidate"} selected` : ja ? "採用候補を選択してください" : "Select an adoption candidate"}</strong><small className={actionError ? "review-action-error" : ""}>{actionError || (ja ? "自動採用理由と警告を確認してから確定" : "Confirm automatic reasons and warnings before adoption.")}</small></div>
          <button type="button" className="secondary-button" onClick={onClose}>{ja ? "閉じる" : "Close"}</button>
          <button type="button" className="primary-button" disabled={!review.manualWinnerJobId || actionState !== "idle"} onClick={() => void adoptWinner()}><Check size={16} />{actionState === "adopting" ? "Adopting…" : ja ? "選択候補を採用" : "Adopt selected candidate"}</button>
        </footer>
      </section>
    </div>
  );
}
