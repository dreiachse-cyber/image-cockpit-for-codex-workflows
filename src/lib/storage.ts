import type { HistoryItem, SpriteAction, SpriteFrame } from "../types";

const HISTORY_KEY = "image-cockpit.v3.history";
const FRAMES_KEY = "image-cockpit.v3.frames";
const ACTIONS_KEY = "image-cockpit.v3.actions";
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
  const [history, frames, actions] = await Promise.all([
    loadIndexedJson<HistoryItem[]>(HISTORY_KEY, loadHistory()),
    loadIndexedJson<SpriteFrame[]>(FRAMES_KEY, loadFrames()),
    loadIndexedJson<SpriteAction[]>(ACTIONS_KEY, loadActions(fallbackActions))
  ]);
  return { history, frames, actions };
}

export function saveHistory(history: HistoryItem[]) {
  saveJson(HISTORY_KEY, history);
  void saveIndexedJson(HISTORY_KEY, history);
}

export function loadFrames() {
  return loadJson<SpriteFrame[]>(FRAMES_KEY, []);
}

export function saveFrames(frames: SpriteFrame[]) {
  saveJson(FRAMES_KEY, frames);
  void saveIndexedJson(FRAMES_KEY, frames);
}

export function loadActions(fallback: SpriteAction[]) {
  return loadJson<SpriteAction[]>(ACTIONS_KEY, fallback);
}

export function saveActions(actions: SpriteAction[]) {
  saveJson(ACTIONS_KEY, actions);
  void saveIndexedJson(ACTIONS_KEY, actions);
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

async function saveIndexedJson<T>(key: string, value: T) {
  try {
    const db = await openStateDb();
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.warn(`Could not persist ${key} to IndexedDB`, error);
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
