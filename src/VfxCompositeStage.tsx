import {
  AlertTriangle,
  Download,
  Layers3,
  Link2,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Save,
  Undo2,
  Upload,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { EffectAnimationMetadata, HistoryItem, SpriteFrame } from "./types";
import { dataUrlToBlob, downloadBlob } from "./lib/image";
import {
  createCompositeSheetBlob,
  createVfxCompositeArtifacts,
  createVfxCompositeManifest,
  importVfxCompositePack,
  mapCompositeEffectFrame,
  parseVfxCompositeManifest,
  resolveEventFrame,
  resolveVfxAttachmentPoint,
  retimeVfxToEvent,
  serializeVfxCompositeManifest,
  validateVfxCompositeManifest,
  VFX_COMPOSITE_EVENTS,
  VFX_COMPOSITE_SOCKETS
} from "./lib/vfxComposite";
import type {
  VfxCompositeBlendMode,
  VfxCompositeEvent,
  VfxCompositeManifest,
  VfxCompositeSocket,
  VfxCompositeSyncMode
} from "./lib/vfxComposite";

type Language = "ja" | string;
type EffectHistoryItem = HistoryItem & { effectAnimation: EffectAnimationMetadata };

interface VfxCompositeStageProps {
  language: Language;
  characters: HistoryItem[];
  effects: EffectHistoryItem[];
  frames: SpriteFrame[];
  initialCharacterId?: string;
  initialEffectId?: string;
  onClose: () => void;
  onOpenHistoryResult: (id: string) => void;
  onStatus?: (message: string) => void;
}

export function VfxCompositeStage({
  language,
  characters,
  effects,
  frames,
  initialCharacterId,
  initialEffectId,
  onClose,
  onOpenHistoryResult,
  onStatus
}: VfxCompositeStageProps) {
  const isJa = language === "ja";
  const initialCharacter = characters.find((item) => item.id === initialCharacterId) ?? characters[0]!;
  const initialEffect = effects.find((item) => item.id === initialEffectId) ?? effects[0]!;
  const [characterId, setCharacterId] = useState(initialCharacter.id);
  const [effectId, setEffectId] = useState(initialEffect.id);
  const [draft, setDraft] = useState(() => createVfxCompositeManifest({ character: initialCharacter, effect: initialEffect }));
  const [past, setPast] = useState<VfxCompositeManifest[]>([]);
  const [future, setFuture] = useState<VfxCompositeManifest[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState(() => serializeVfxCompositeManifest(draft));
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const character = characters.find((item) => item.id === characterId) ?? characters[0]!;
  const effect = effects.find((item) => item.id === effectId) ?? effects[0]!;
  const characterDirections = character.animationPackV2?.directions
    ?? character.animationDirections
    ?? [draft.character.direction || "front"];
  const directionIndex = Math.max(0, characterDirections.indexOf(draft.character.direction));
  const allCharacterFrames = useMemo(
    () => frames.filter((frame) => frame.sourceId === character.id).sort((left, right) => left.index - right.index),
    [character.id, frames]
  );
  const frameCount = character.animationPackV2?.frameOrder.length
    ?? character.motionRecipe?.frameCount
    ?? Math.max(1, Math.floor(allCharacterFrames.length / Math.max(1, characterDirections.length)));
  const characterFrames = useMemo(
    () => allCharacterFrames.slice(directionIndex * frameCount, directionIndex * frameCount + frameCount),
    [allCharacterFrames, directionIndex, frameCount]
  );
  const effectFrames = useMemo(
    () => frames.filter((frame) => frame.sourceId === effect.id).sort((left, right) => left.index - right.index),
    [effect.id, frames]
  );
  const currentCharacterFrame = characterFrames[Math.min(frameIndex, Math.max(0, characterFrames.length - 1))];
  const currentEffectIndex = mapCompositeEffectFrame(frameIndex, draft.timing, effectFrames.length, effect.effectAnimation.loopMode);
  const currentEffectFrame = currentEffectIndex === null ? undefined : effectFrames[currentEffectIndex];
  const attachmentPoint = resolveVfxAttachmentPoint(character.animationPackV2, draft.attachment.socket, frameIndex, draft.character.direction);
  const eventFrame = resolveEventFrame(character.animationPackV2, draft.attachment.event, draft.character.direction);
  const dirty = serializeVfxCompositeManifest(draft) !== savedSnapshot;
  const effectAnchorX = effect.effectAnimation.anchor.x / Math.max(1, effect.effectAnimation.frameSize.width) * 100;
  const effectAnchorY = effect.effectAnimation.anchor.y / Math.max(1, effect.effectAnimation.frameSize.height) * 100;
  const stageStyle = {
    "--vfx-socket-x": `${attachmentPoint.x * 100}%`,
    "--vfx-socket-y": `${attachmentPoint.y * 100}%`,
    "--vfx-anchor-x": `${effectAnchorX}%`,
    "--vfx-anchor-y": `${effectAnchorY}%`,
    "--vfx-offset-x": `${draft.transform.offsetX}px`,
    "--vfx-offset-y": `${draft.transform.offsetY}px`,
    "--vfx-scale": draft.transform.scale,
    "--vfx-rotation": `${draft.transform.rotation}deg`,
    "--vfx-opacity": draft.transform.opacity,
    "--vfx-blend": draft.blendMode === "additive" ? "screen" : draft.blendMode
  } as CSSProperties;

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) setPlaying(false);
  }, []);

  useEffect(() => {
    if (!playing || characterFrames.length <= 1) return;
    const duration = character.animationPackV2?.frameDurations[frameIndex] ?? Math.round(1000 / 12);
    const timer = window.setTimeout(() => setFrameIndex((current) => (current + 1) % characterFrames.length), Math.max(40, duration));
    return () => window.clearTimeout(timer);
  }, [character.animationPackV2?.frameDurations, characterFrames.length, frameIndex, playing]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const first = dialog.querySelector<HTMLElement>("select, button, input");
    first?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowRight" && event.target instanceof HTMLElement && !event.target.matches("input, select, textarea")) {
        event.preventDefault();
        setFrameIndex((current) => Math.min(characterFrames.length - 1, current + 1));
      }
      if (event.key === "ArrowLeft" && event.target instanceof HTMLElement && !event.target.matches("input, select, textarea")) {
        event.preventDefault();
        setFrameIndex((current) => Math.max(0, current - 1));
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled), input:not(:disabled), summary, [tabindex]:not([tabindex='-1'])"));
      if (focusable.length === 0) return;
      const firstFocusable = focusable[0];
      const lastFocusable = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };
    dialog.addEventListener("keydown", onKeyDown);
    return () => dialog.removeEventListener("keydown", onKeyDown);
  }, [characterFrames.length, onClose]);

  function commit(next: VfxCompositeManifest) {
    setPast((current) => [...current.slice(-39), draft]);
    setDraft(validateVfxCompositeManifest(next));
    setFuture([]);
  }

  function patch(next: Partial<VfxCompositeManifest>) {
    commit({ ...draft, ...next });
  }

  function updateCharacter(nextId: string) {
    const nextCharacter = characters.find((item) => item.id === nextId);
    if (!nextCharacter) return;
    setCharacterId(nextId);
    const next = createVfxCompositeManifest({ character: nextCharacter, effect });
    setDraft(next);
    setPast([]);
    setFuture([]);
    setSavedSnapshot(serializeVfxCompositeManifest(next));
    setFrameIndex(0);
  }

  function updateEffect(nextId: string) {
    const nextEffect = effects.find((item) => item.id === nextId);
    if (!nextEffect) return;
    setEffectId(nextId);
    const next = createVfxCompositeManifest({ character, effect: nextEffect, direction: draft.character.direction });
    setDraft(next);
    setPast([]);
    setFuture([]);
    setSavedSnapshot(serializeVfxCompositeManifest(next));
    setFrameIndex(0);
  }

  function undo() {
    const previous = past.at(-1);
    if (!previous) return;
    setPast((current) => current.slice(0, -1));
    setFuture((current) => [draft, ...current].slice(0, 40));
    setDraft(previous);
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setFuture((current) => current.slice(1));
    setPast((current) => [...current, draft].slice(-40));
    setDraft(next);
  }

  function reset() {
    commit(createVfxCompositeManifest({ character, effect, direction: draft.character.direction }));
  }

  function updateTiming(event: VfxCompositeEvent, syncMode: VfxCompositeSyncMode) {
    commit(retimeVfxToEvent(draft, character.animationPackV2, event, syncMode));
  }

  function updateDirection(direction: string) {
    const next = { ...draft, character: { ...draft.character, direction } };
    const retimed = retimeVfxToEvent(next, character.animationPackV2, draft.attachment.event, draft.attachment.syncMode);
    commit(retimed);
    setFrameIndex(0);
  }

  function saveSetup() {
    const serialized = serializeVfxCompositeManifest(draft);
    localStorage.setItem("image-cockpit.vfx-composite.last", serialized);
    setSavedSnapshot(serialized);
    setMessage(isJa ? "Composite設定を保存した" : "Composite setup saved");
  }

  async function exportArtifacts(kind: "gif" | "apng" | "pack" | "sheet") {
    setBusy(true);
    setMessage(isJa ? "Compositeを書き出し中" : "Exporting composite");
    try {
      const artifacts = await createVfxCompositeArtifacts({
        manifest: draft,
        animationPack: character.animationPackV2,
        effectMetadata: effect.effectAnimation,
        characterFrames,
        effectFrames,
        characterSheet: character.dataUrl,
        effectSheet: effect.dataUrl
      });
      const base = safeName(draft.title);
      if (kind === "gif") downloadBlob(artifacts.previewGif, `${base}.composite.gif`);
      if (kind === "apng") downloadBlob(artifacts.previewApng, `${base}.composite.apng`);
      if (kind === "pack") downloadBlob(artifacts.pack, `${base}.image-cockpit-vfx-composite.zip`);
      if (kind === "sheet") downloadBlob(await createCompositeSheetBlob(artifacts.frames), `${base}.composite-sheet.png`);
      setSavedSnapshot(serializeVfxCompositeManifest(draft));
      setMessage(isJa ? "Composite export完了" : "Composite export complete");
      onStatus?.(`VFX Composite export: ${kind} / ${draft.title}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Composite export failed");
    } finally {
      setBusy(false);
    }
  }

  function exportManifest() {
    downloadBlob(new Blob([serializeVfxCompositeManifest(draft)], { type: "application/json" }), `${safeName(draft.title)}.composite.json`);
    setSavedSnapshot(serializeVfxCompositeManifest(draft));
  }

  function exportLayers() {
    const base = safeName(draft.title);
    downloadBlob(dataUrlToBlob(character.dataUrl), `${base}.character-layer.png`);
    downloadBlob(dataUrlToBlob(effect.dataUrl), `${base}.effect-layer.png`);
  }

  async function importComposite(file: File) {
    try {
      const imported = file.name.toLowerCase().endsWith(".json")
        ? parseVfxCompositeManifest(await file.text())
        : await importVfxCompositePack(file);
      const importedCharacter = characters.find((item) => item.id === imported.character.historyId);
      const importedEffect = effects.find((item) => item.id === imported.effect.historyId);
      if (!importedCharacter || !importedEffect) throw new Error("Referenced character or effect result is not available in local history.");
      setCharacterId(importedCharacter.id);
      setEffectId(importedEffect.id);
      setDraft(imported);
      setPast([]);
      setFuture([]);
      setSavedSnapshot(serializeVfxCompositeManifest(imported));
      setFrameIndex(0);
      setMessage(isJa ? "Composite Packを再読込した" : "Composite Pack reimported");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Composite import failed");
    }
  }

  return (
    <div className="modal-backdrop vfx-composite-backdrop" role="presentation">
      <div className="vfx-composite-dialog" role="dialog" aria-modal="true" aria-label="VFX Composite Stage" ref={dialogRef}>
        <header className="vfx-composite-header">
          <div>
            <span className="step-kicker">Phase 7 / non-destructive layers</span>
            <h2>VFX Composite Stage</h2>
            <p>{isJa ? "CharacterとEffectを別layerのままsocket・event同期する" : "Sync separate character and effect layers by socket and event."}</p>
          </div>
          <div className="vfx-header-actions">
            <span className={`vfx-save-state ${dirty ? "dirty" : "saved"}`}>{dirty ? (isJa ? "未保存" : "Unsaved") : (isJa ? "保存済み" : "Saved")}</span>
            <button className="icon-button" type="button" aria-label="Close VFX Composite Stage" onClick={onClose}><X size={18} aria-hidden="true" /></button>
          </div>
        </header>

        <div className="vfx-composite-source-grid">
          <label className="field">
            <span>{isJa ? "Character animation result" : "Character animation result"}</span>
            <select value={characterId} onChange={(event) => updateCharacter(event.target.value)}>
              {characters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{isJa ? "Effect animation result" : "Effect animation result"}</span>
            <select value={effectId} onChange={(event) => updateEffect(event.target.value)}>
              {effects.map((item) => <option key={item.id} value={item.id}>{item.effectAnimation.name} · {item.effectAnimation.qualityRank}</option>)}
            </select>
          </label>
          <button type="button" className="secondary-button mini" onClick={() => onOpenHistoryResult(character.id)}>{isJa ? "Character resultへ" : "Open character result"}</button>
          <button type="button" className="secondary-button mini" onClick={() => onOpenHistoryResult(effect.id)}>{isJa ? "Effect resultへ" : "Open effect result"}</button>
        </div>

        <div className="vfx-composite-body">
          <section className="vfx-preview-panel">
            <div className="vfx-attachment-strip">
              <span><Link2 size={14} aria-hidden="true" /> {draft.attachment.socket}</span>
              <span>{draft.attachment.event} f{eventFrame.frameIndex + 1}</span>
              <span>{draft.attachment.syncMode === "peak" ? "peak sync" : "start sync"}</span>
              <span>{draft.layer} / {draft.blendMode}</span>
              {(attachmentPoint.estimated || eventFrame.estimated) && <em><AlertTriangle size={13} aria-hidden="true" /> estimated {attachmentPoint.source} fallback</em>}
            </div>

            <div className={`vfx-preview-stage bg-${draft.preview.background}`} style={stageStyle} data-testid="vfx-composite-preview">
              {draft.preview.overlays.safeArea && <span className="vfx-safe-area" aria-label="Safe area" />}
              {draft.layer === "back" && currentEffectFrame && <EffectLayer frame={currentEffectFrame} />}
              {currentCharacterFrame && <img className="vfx-character-layer" src={currentCharacterFrame.dataUrl} alt="" />}
              {draft.layer === "front" && currentEffectFrame && <EffectLayer frame={currentEffectFrame} />}
              <span className="vfx-socket-marker" aria-label={`${draft.attachment.socket} ${attachmentPoint.source}`} />
              {draft.preview.overlays.effectBounds && currentEffectFrame && <span className="vfx-effect-bounds" aria-label="Effect bounds" />}
              {draft.preview.overlays.hitbox && character.animationPackV2?.hitboxes.filter((item) => item.frameIndex === frameIndex).map((rect) => <OverlayRect key={rect.id} rect={rect} kind="hitbox" />)}
              {draft.preview.overlays.hurtbox && character.animationPackV2?.hurtboxes.filter((item) => item.frameIndex === frameIndex).map((rect) => <OverlayRect key={rect.id} rect={rect} kind="hurtbox" />)}
              {draft.preview.overlays.clipping && <span className="vfx-clipping-guide" aria-label="Clipping guide" />}
              {!currentCharacterFrame && <p>{isJa ? "Character frameがない" : "No character frame"}</p>}
            </div>

            <div className="vfx-scrubber">
              <button className="icon-button" type="button" aria-label={playing ? "Pause composite" : "Play composite"} onClick={() => setPlaying((current) => !current)}>
                {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              </button>
              <input type="range" min={0} max={Math.max(0, characterFrames.length - 1)} value={Math.min(frameIndex, Math.max(0, characterFrames.length - 1))} onChange={(event) => { setPlaying(false); setFrameIndex(Number(event.target.value)); }} aria-label="Composite frame scrubber" />
              <strong>Character {frameIndex + 1}/{characterFrames.length}</strong>
              <span>Effect {currentEffectIndex === null ? "off" : `${currentEffectIndex + 1}/${effectFrames.length}`}</span>
            </div>

            <div className="vfx-direction-row" aria-label="Composite direction">
              {characterDirections.map((direction) => <button key={direction} type="button" className={draft.character.direction === direction ? "selected" : ""} aria-pressed={draft.character.direction === direction} onClick={() => updateDirection(direction)}>{direction}</button>)}
            </div>

            <div className="vfx-quality-strip">
              <strong>VFX Quality v2 · shadow</strong>
              {effect.effectAnimation.qualityV2 ? (
                <>
                  <span>Loop {formatScore(effect.effectAnimation.qualityV2.loopSeamScore)}</span>
                  <span>Alpha {formatScore(effect.effectAnimation.qualityV2.alphaContinuityScore)}</span>
                  <span>Centroid {formatScore(effect.effectAnimation.qualityV2.energyCentroidScore)}</span>
                  <span>Palette {formatScore(effect.effectAnimation.qualityV2.paletteConsistencyScore)}</span>
                  <em>{effect.effectAnimation.qualityV2.shadowWarnings.length ? `${effect.effectAnimation.qualityV2.shadowWarnings.length} warning` : "clear"}</em>
                </>
              ) : <em>{isJa ? "旧Effect Pack / 未較正" : "Legacy Effect Pack / uncalibrated"}</em>}
            </div>
          </section>

          <aside className="vfx-controls-panel">
            <div className="vfx-operation-row">
              <button type="button" onClick={undo} disabled={past.length === 0}><Undo2 size={14} aria-hidden="true" /> Undo</button>
              <button type="button" onClick={redo} disabled={future.length === 0}><Redo2 size={14} aria-hidden="true" /> Redo</button>
              <button type="button" onClick={reset}><RotateCcw size={14} aria-hidden="true" /> Reset</button>
              <button type="button" onClick={saveSetup}><Save size={14} aria-hidden="true" /> Save setup</button>
            </div>

            <section className="vfx-control-section">
              <div className="timeline-section-heading"><strong>Socket / Event</strong><small>{attachmentPoint.label}</small></div>
              <div className="field-row">
                <label className="field"><span>Socket</span><select value={draft.attachment.socket} onChange={(event) => patch({ attachment: { ...draft.attachment, socket: event.target.value as VfxCompositeSocket } })}>{VFX_COMPOSITE_SOCKETS.map((socket) => <option key={socket}>{socket}</option>)}</select></label>
                <label className="field"><span>Event</span><select value={draft.attachment.event} onChange={(event) => updateTiming(event.target.value as VfxCompositeEvent, draft.attachment.syncMode)}>{VFX_COMPOSITE_EVENTS.map((event) => <option key={event}>{event}</option>)}</select></label>
              </div>
              <div className="segmented-control two" aria-label="Effect event sync mode">
                {(["start", "peak"] as const).map((mode) => <button key={mode} type="button" className={draft.attachment.syncMode === mode ? "active" : ""} aria-pressed={draft.attachment.syncMode === mode} onClick={() => updateTiming(draft.attachment.event, mode)}>{mode} sync</button>)}
              </div>
            </section>

            <section className="vfx-control-section">
              <div className="timeline-section-heading"><strong>Basic offset</strong><small>{draft.transform.offsetX}, {draft.transform.offsetY}</small></div>
              <div className="field-row">
                <NumberInput label="Offset X" value={draft.transform.offsetX} min={-512} max={512} step={1} onChange={(value) => patch({ transform: { ...draft.transform, offsetX: value } })} />
                <NumberInput label="Offset Y" value={draft.transform.offsetY} min={-512} max={512} step={1} onChange={(value) => patch({ transform: { ...draft.transform, offsetY: value } })} />
              </div>
              <div className="field-row">
                <label className="field"><span>Layer</span><select value={draft.layer} onChange={(event) => patch({ layer: event.target.value as VfxCompositeManifest["layer"] })}><option value="front">Front</option><option value="back">Back</option></select></label>
                <label className="field"><span>Blend</span><select value={draft.blendMode} onChange={(event) => patch({ blendMode: event.target.value as VfxCompositeBlendMode })}><option value="normal">Normal</option><option value="additive">Additive</option><option value="screen">Screen</option></select></label>
              </div>
            </section>

            <details className="vfx-advanced">
              <summary>{isJa ? "高度な調整" : "Advanced adjustments"}</summary>
              <div className="vfx-control-section">
                <div className="field-row">
                  <NumberInput label="Scale" value={draft.transform.scale} min={0.05} max={8} step={0.05} onChange={(value) => patch({ transform: { ...draft.transform, scale: value } })} />
                  <NumberInput label="Rotation" value={draft.transform.rotation} min={-360} max={360} step={1} onChange={(value) => patch({ transform: { ...draft.transform, rotation: value } })} />
                </div>
                <div className="field-row">
                  <NumberInput label="Opacity" value={draft.transform.opacity} min={0} max={1} step={0.05} onChange={(value) => patch({ transform: { ...draft.transform, opacity: value } })} />
                  <NumberInput label="Time scale" value={draft.timing.timeScale} min={0.05} max={8} step={0.05} onChange={(value) => patch({ timing: { ...draft.timing, timeScale: value } })} />
                </div>
                <div className="field-row">
                  <NumberInput label="Start frame" value={draft.timing.startFrame} min={-32} max={64} step={1} onChange={(value) => patch({ timing: { ...draft.timing, startFrame: Math.round(value) } })} />
                  <NumberInput label="Peak frame" value={draft.timing.peakFrame} min={0} max={64} step={1} onChange={(value) => patch({ timing: { ...draft.timing, peakFrame: Math.round(value) } })} />
                </div>
              </div>
            </details>

            <section className="vfx-control-section">
              <div className="timeline-section-heading"><strong>Preview</strong><small>non-destructive</small></div>
              <div className="effect-background-switch">
                {(["checkerboard", "light", "dark", "game"] as const).map((background) => <button key={background} type="button" className={draft.preview.background === background ? "active" : ""} onClick={() => patch({ preview: { ...draft.preview, background } })}>{background}</button>)}
              </div>
              <div className="vfx-overlay-grid">
                {Object.entries(draft.preview.overlays).map(([key, enabled]) => <label key={key}><input type="checkbox" checked={enabled} onChange={(event) => patch({ preview: { ...draft.preview, overlays: { ...draft.preview.overlays, [key]: event.target.checked } } })} />{overlayLabel(key)}</label>)}
              </div>
            </section>
          </aside>
        </div>

        <footer className="vfx-composite-footer">
          <div className="vfx-export-status"><Layers3 size={15} aria-hidden="true" /><span>{message || (isJa ? "別layerのままゲーム側へ再構成可能" : "Separate layers remain reconstructable in-engine")}</span></div>
          <div className="vfx-export-actions">
            <button type="button" onClick={exportLayers}><Download size={14} aria-hidden="true" /> Layer Sheets</button>
            <button type="button" onClick={exportManifest}><Download size={14} aria-hidden="true" /> Manifest JSON</button>
            <button type="button" onClick={() => fileInputRef.current?.click()}><Upload size={14} aria-hidden="true" /> Reimport Pack</button>
            <button type="button" onClick={() => void exportArtifacts("gif")} disabled={busy}>Combined GIF</button>
            <button type="button" onClick={() => void exportArtifacts("apng")} disabled={busy}>Combined APNG</button>
            <button type="button" onClick={() => void exportArtifacts("sheet")} disabled={busy}>Composite Sheet</button>
            <button className="primary-button" type="button" onClick={() => void exportArtifacts("pack")} disabled={busy}>{busy ? "Exporting…" : "Composite Pack ZIP"}</button>
          </div>
          <input ref={fileInputRef} type="file" accept=".json,.zip,application/json,application/zip" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importComposite(file); event.currentTarget.value = ""; }} />
        </footer>
      </div>
    </div>
  );
}

function EffectLayer({ frame }: { frame: SpriteFrame }) {
  return <img className="vfx-effect-layer" src={frame.dataUrl} alt="" />;
}

function OverlayRect({ rect, kind }: { rect: { x: number; y: number; width: number; height: number }; kind: "hitbox" | "hurtbox" }) {
  return <span className={`vfx-game-rect ${kind}`} style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }} aria-label={kind} />;
}

function NumberInput({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <label className="field"><span>{label}</span><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function overlayLabel(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (match) => match.toUpperCase());
}

function formatScore(value: number | null) {
  return value === null ? "n/a" : Math.round(value);
}

function safeName(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "vfx-composite";
}
