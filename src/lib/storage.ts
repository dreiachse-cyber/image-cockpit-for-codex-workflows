import type { AnimationLibraryItem, HistoryItem, SpriteAction, SpriteFrame } from "../types";

const HISTORY_KEY = "image-cockpit.v3.history";
const FRAMES_KEY = "image-cockpit.v3.frames";
const HISTORY_SUMMARY_KEY = "image-cockpit.v3.history.summary";
const FRAMES_SUMMARY_KEY = "image-cockpit.v3.frames.summary";
const ACTIONS_KEY = "image-cockpit.v3.actions";
const ANIMATION_LIBRARY_KEY = "image-cockpit.v3.animation-library";
export const MAX_USER_ANIMATION_LIBRARY_ITEMS = 30;
const DB_NAME = "image-cockpit-local-state";
const DB_VERSION = 1;
const STORE_NAME = "state";

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Could not persist ${key}`, error);
  }
}

export function loadHistory() {
  return loadJson<HistoryItem[]>(HISTORY_KEY, []);
}

export async function loadPersistedState(fallbackActions: SpriteAction[]) {
  const [history, frames, actions, animationLibrary] = await Promise.all([
    loadIndexedJson<HistoryItem[]>(HISTORY_KEY, loadHistory()),
    loadIndexedJson<SpriteFrame[]>(FRAMES_KEY, loadFrames()),
    loadIndexedJson<SpriteAction[]>(ACTIONS_KEY, loadActions(fallbackActions)),
    loadIndexedJson<AnimationLibraryItem[]>(ANIMATION_LIBRARY_KEY, loadUserAnimationLibrary())
  ]);
  return { history, frames, actions, animationLibrary };
}

export function saveHistory(history: HistoryItem[]) {
  void saveLargeState(HISTORY_KEY, HISTORY_SUMMARY_KEY, history, history.length);
}

export function loadFrames() {
  return loadJson<SpriteFrame[]>(FRAMES_KEY, []);
}

export function saveFrames(frames: SpriteFrame[]) {
  void saveLargeState(FRAMES_KEY, FRAMES_SUMMARY_KEY, frames, frames.length);
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

async function loadIndexedJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const db = await openStateDb();
    if (!db) return fallback;
    return await new Promise<T>((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve((request.result as T | undefined) ?? fallback);
      request.onerror = () => resolve(fallback);
    });
  } catch {
    return fallback;
  }
}

async function saveLargeState<T>(key: string, summaryKey: string, value: T, count: number) {
  const saved = await saveIndexedJson(key, value);
  if (!saved) {
    saveJson(summaryKey, {
      storedIn: "indexedDB-unavailable",
      count,
      updatedAt: new Date().toISOString()
    });
    return;
  }

  removeJson(key);
  saveJson(summaryKey, {
    storedIn: "indexedDB",
    count,
    updatedAt: new Date().toISOString()
  });
}

function removeJson(key: string) {
  try {
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
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    return true;
  } catch (error) {
    console.warn(`Could not persist ${key} to IndexedDB`, error);
    return false;
  }
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
