import type { AnimationLibraryItem, HistoryItem, SpriteAction, SpriteFrame } from "../types";

export const HISTORY_KEY = "image-cockpit.v3.history";
export const FRAMES_KEY = "image-cockpit.v3.frames";
export const HISTORY_SUMMARY_KEY = "image-cockpit.v3.history.summary";
export const FRAMES_SUMMARY_KEY = "image-cockpit.v3.frames.summary";
const ACTIONS_KEY = "image-cockpit.v3.actions";
const ANIMATION_LIBRARY_KEY = "image-cockpit.v3.animation-library";
export const PENDING_CODEX_JOB_STORAGE_KEY = "image-cockpit.pendingCodexJob";
export const MAX_USER_ANIMATION_LIBRARY_ITEMS = 30;
export const HISTORY_RETENTION_LIMIT = 30;
export const FRAME_RETENTION_LIMIT = 240;
export const STORAGE_WARNING_BYTES = 200 * 1024 * 1024;
export const STORAGE_AUTO_SAFE_BYTES = 500 * 1024 * 1024;
export const STORAGE_HARD_BLOCK_BYTES = 1024 * 1024 * 1024;
export const DB_NAME = "image-cockpit-local-state";
const DB_VERSION = 1;
const STORE_NAME = "state";

export const IMAGE_COCKPIT_LOCAL_STATE_KEYS = [
  HISTORY_KEY,
  FRAMES_KEY,
  HISTORY_SUMMARY_KEY,
  FRAMES_SUMMARY_KEY,
  ACTIONS_KEY,
  ANIMATION_LIBRARY_KEY,
  PENDING_CODEX_JOB_STORAGE_KEY
] as const;

export type LocalStateStoragePressure = "normal" | "warning" | "auto-safe" | "hard-block";
export type LocalStateResetScope = "all" | "history" | "frames" | "actions" | "animation-library";

export interface LocalStateSummary {
  schemaVersion: 2;
  storedIn: "indexedDB" | "indexedDB-unavailable";
  count: number;
  persistedCount: number;
  droppedCount: number;
  approxBytes: number;
  largestItemBytes: number;
  updatedAt: string;
  retentionPolicy: string;
}

export interface LocalStateStoragePreflight {
  pressure: LocalStateStoragePressure;
  estimate: StorageEstimate | null;
  safeModeRequested: boolean;
  resetRequested: boolean;
  shouldSkipLargeState: boolean;
  hardBlocked: boolean;
  reason:
    | "safe-url"
    | "reset-url"
    | "storage-ok"
    | "storage-warning"
    | "storage-auto-safe"
    | "storage-hard-block"
    | "storage-estimate-unavailable";
}

interface SaveLargeStateOptions<T> {
  retainedValue: T;
  persistedCount: number;
  droppedCount: number;
  retentionPolicy: string;
}

interface LoadPersistedStateOptions {
  skipLargeState?: boolean;
}

export function loadJson<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === "undefined") return fallback;
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson<T>(key: string, value: T) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Could not persist ${key}`, error);
  }
}

export function loadHistory() {
  return loadJson<HistoryItem[]>(HISTORY_KEY, []);
}

export async function loadPersistedState(fallbackActions: SpriteAction[], options: LoadPersistedStateOptions = {}) {
  if (options.skipLargeState) {
    return {
      history: [],
      frames: [],
      actions: loadActions(fallbackActions),
      animationLibrary: []
    };
  }

  const [history, frames, actions, animationLibrary] = await Promise.all([
    loadIndexedJson<HistoryItem[]>(HISTORY_KEY, []),
    loadIndexedJson<SpriteFrame[]>(FRAMES_KEY, []),
    loadIndexedJson<SpriteAction[]>(ACTIONS_KEY, loadActions(fallbackActions)),
    loadIndexedJson<AnimationLibraryItem[]>(ANIMATION_LIBRARY_KEY, [])
  ]);
  return { history, frames, actions, animationLibrary };
}

export function saveHistory(history: HistoryItem[], selectedId = "") {
  const retained = applyHistoryRetention(history, { selectedId });
  void saveLargeState(HISTORY_KEY, HISTORY_SUMMARY_KEY, history.length, {
    retainedValue: retained,
    persistedCount: retained.length,
    droppedCount: Math.max(0, history.length - retained.length),
    retentionPolicy: `latest ${HISTORY_RETENTION_LIMIT} results plus adopted/selected results`
  });
}

export function loadFrames() {
  return loadJson<SpriteFrame[]>(FRAMES_KEY, []);
}

export function saveFrames(frames: SpriteFrame[], protectedFrameIds: Iterable<string> = []) {
  const retained = applyFrameRetention(frames, { protectedFrameIds });
  void saveLargeState(FRAMES_KEY, FRAMES_SUMMARY_KEY, frames.length, {
    retainedValue: retained,
    persistedCount: retained.length,
    droppedCount: Math.max(0, frames.length - retained.length),
    retentionPolicy: `latest ${FRAME_RETENTION_LIMIT} frames plus selected/action frames`
  });
}

export function loadActions(fallback: SpriteAction[]) {
  return loadJson<SpriteAction[]>(ACTIONS_KEY, fallback);
}

export function saveActions(actions: SpriteAction[]) {
  saveJson(ACTIONS_KEY, actions);
  void saveIndexedJson(ACTIONS_KEY, actions);
}

export function loadUserAnimationLibrary() {
  return loadJson<AnimationLibraryItem[]>(ANIMATION_LIBRARY_KEY, []);
}

export function saveUserAnimationLibrary(items: AnimationLibraryItem[]) {
  const capped = items.slice(0, MAX_USER_ANIMATION_LIBRARY_ITEMS);
  saveJson(ANIMATION_LIBRARY_KEY, capped);
  void saveIndexedJson(ANIMATION_LIBRARY_KEY, capped);
}

export function isStorageSafeModeSearch(search = currentSearch()) {
  const params = new URLSearchParams(search);
  return isEnabledParam(params.get("safe")) || isEnabledParam(params.get("skipStorage"));
}

export function isStorageResetSearch(search = currentSearch()) {
  return isEnabledParam(new URLSearchParams(search).get("reset"));
}

export function classifyStorageUsageBytes(usage: number | undefined | null): LocalStateStoragePressure {
  if (typeof usage !== "number" || !Number.isFinite(usage) || usage < 0) return "normal";
  if (usage >= STORAGE_HARD_BLOCK_BYTES) return "hard-block";
  if (usage >= STORAGE_AUTO_SAFE_BYTES) return "auto-safe";
  if (usage >= STORAGE_WARNING_BYTES) return "warning";
  return "normal";
}

export async function preflightLocalStateStorage(search = currentSearch()): Promise<LocalStateStoragePreflight> {
  const safeModeRequested = isStorageSafeModeSearch(search);
  const resetRequested = isStorageResetSearch(search);
  const estimate = await estimateLocalStateStorage();
  const pressure = classifyStorageUsageBytes(estimate?.usage);
  const shouldSkipLargeState = safeModeRequested || resetRequested || pressure === "auto-safe" || pressure === "hard-block";
  const hardBlocked = pressure === "hard-block";

  if (resetRequested) {
    return { pressure, estimate, safeModeRequested, resetRequested, shouldSkipLargeState, hardBlocked, reason: "reset-url" };
  }
  if (safeModeRequested) {
    return { pressure, estimate, safeModeRequested, resetRequested, shouldSkipLargeState, hardBlocked, reason: "safe-url" };
  }
  if (!estimate) {
    return {
      pressure,
      estimate,
      safeModeRequested,
      resetRequested,
      shouldSkipLargeState,
      hardBlocked,
      reason: "storage-estimate-unavailable"
    };
  }
  if (pressure === "hard-block") {
    return { pressure, estimate, safeModeRequested, resetRequested, shouldSkipLargeState, hardBlocked, reason: "storage-hard-block" };
  }
  if (pressure === "auto-safe") {
    return { pressure, estimate, safeModeRequested, resetRequested, shouldSkipLargeState, hardBlocked, reason: "storage-auto-safe" };
  }
  if (pressure === "warning") {
    return { pressure, estimate, safeModeRequested, resetRequested, shouldSkipLargeState, hardBlocked, reason: "storage-warning" };
  }
  return { pressure, estimate, safeModeRequested, resetRequested, shouldSkipLargeState, hardBlocked, reason: "storage-ok" };
}

export async function estimateLocalStateStorage() {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
    return await navigator.storage.estimate();
  } catch {
    return null;
  }
}

export function readLocalStateSummaries() {
  return {
    history: loadJson<LocalStateSummary | null>(HISTORY_SUMMARY_KEY, null),
    frames: loadJson<LocalStateSummary | null>(FRAMES_SUMMARY_KEY, null)
  };
}

export function applyHistoryRetention(
  history: HistoryItem[],
  options: { selectedId?: string; limit?: number } = {}
) {
  const limit = Math.max(0, options.limit ?? HISTORY_RETENTION_LIMIT);
  const selectedId = options.selectedId ?? "";
  const protectedIds = new Set(
    history
      .filter((item) => item.adopted || item.id === selectedId)
      .map((item) => item.id)
  );
  const retainedIds = new Set<string>(protectedIds);

  for (const item of history) {
    if (retainedIds.size >= limit && !protectedIds.has(item.id)) continue;
    retainedIds.add(item.id);
  }

  return history.filter((item) => retainedIds.has(item.id));
}

export function applyFrameRetention(
  frames: SpriteFrame[],
  options: { protectedFrameIds?: Iterable<string>; limit?: number } = {}
) {
  const limit = Math.max(0, options.limit ?? FRAME_RETENTION_LIMIT);
  const protectedIds = new Set(options.protectedFrameIds ?? []);
  const retainedIds = new Set<string>(protectedIds);

  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index];
    if (!frame) continue;
    if (retainedIds.size >= limit && !protectedIds.has(frame.id)) continue;
    retainedIds.add(frame.id);
  }

  return frames.filter((frame) => retainedIds.has(frame.id));
}

export function approximateJsonBytes(value: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return 0;
  }
}

export function formatStorageBytes(bytes: number | undefined | null) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "unknown";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export async function clearImageCockpitLocalState(scope: LocalStateResetScope = "all") {
  const keys = localStorageKeysForResetScope(scope);
  keys.forEach(removeJson);

  if (scope === "all") {
    return await deleteStateDb();
  }
  return await deleteIndexedKeys(indexedKeysForResetScope(scope));
}

function currentSearch() {
  try {
    return typeof window === "undefined" ? "" : window.location.search;
  } catch {
    return "";
  }
}

function isEnabledParam(value: string | null) {
  if (value === null) return false;
  return value === "" || ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

async function loadIndexedJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const db = await openStateDb();
    if (!db) return fallback;
    return await new Promise<T>((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => {
        const result = (request.result as T | undefined) ?? fallback;
        db.close();
        resolve(result);
      };
      request.onerror = () => {
        db.close();
        resolve(fallback);
      };
      transaction.onabort = () => {
        db.close();
        resolve(fallback);
      };
    });
  } catch {
    return fallback;
  }
}

async function saveLargeState<T>(
  key: string,
  summaryKey: string,
  count: number,
  options: SaveLargeStateOptions<T>
) {
  const saved = await saveIndexedJson(key, options.retainedValue);
  const summary: LocalStateSummary = {
    schemaVersion: 2,
    storedIn: saved ? "indexedDB" : "indexedDB-unavailable",
    count,
    persistedCount: options.persistedCount,
    droppedCount: options.droppedCount,
    approxBytes: approximateJsonBytes(options.retainedValue),
    largestItemBytes: largestJsonItemBytes(options.retainedValue),
    updatedAt: new Date().toISOString(),
    retentionPolicy: options.retentionPolicy
  };

  if (saved) removeJson(key);
  saveJson(summaryKey, summary);

  if (!saved) {
    saveJson(key, options.retainedValue);
  }
}

function largestJsonItemBytes<T>(value: T) {
  if (!Array.isArray(value)) return approximateJsonBytes(value);
  return value.reduce((largest, item) => Math.max(largest, approximateJsonBytes(item)), 0);
}

function removeJson(key: string) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(key);
  } catch (error) {
    console.warn(`Could not clear ${key} localStorage mirror`, error);
  }
}

async function saveIndexedJson<T>(key: string, value: T) {
  try {
    const db = await openStateDb();
    if (!db) return false;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(value, key);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error);
      };
    });
    return true;
  } catch (error) {
    console.warn(`Could not persist ${key} to IndexedDB`, error);
    return false;
  }
}

function localStorageKeysForResetScope(scope: LocalStateResetScope) {
  if (scope === "all") return [...IMAGE_COCKPIT_LOCAL_STATE_KEYS];
  if (scope === "history") return [HISTORY_KEY, HISTORY_SUMMARY_KEY];
  if (scope === "frames") return [FRAMES_KEY, FRAMES_SUMMARY_KEY];
  if (scope === "actions") return [ACTIONS_KEY];
  return [ANIMATION_LIBRARY_KEY];
}

function indexedKeysForResetScope(scope: LocalStateResetScope) {
  if (scope === "history") return [HISTORY_KEY];
  if (scope === "frames") return [FRAMES_KEY];
  if (scope === "actions") return [ACTIONS_KEY];
  if (scope === "animation-library") return [ANIMATION_LIBRARY_KEY];
  return [HISTORY_KEY, FRAMES_KEY, ACTIONS_KEY, ANIMATION_LIBRARY_KEY];
}

async function deleteIndexedKeys(keys: string[]) {
  try {
    const db = await openStateDb();
    if (!db) return false;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      keys.forEach((key) => store.delete(key));
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error);
      };
    });
    return true;
  } catch {
    return false;
  }
}

async function deleteStateDb() {
  if (typeof indexedDB === "undefined") return false;

  return await new Promise<boolean>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
    request.onblocked = () => resolve(false);
  });
}

function openStateDb() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  return new Promise<IDBDatabase | null>((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}
