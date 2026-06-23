import type { HistoryItem, SpriteAction, SpriteFrame } from "../types";

const HISTORY_KEY = "image-cockpit.v3.history";
const FRAMES_KEY = "image-cockpit.v3.frames";
const ACTIONS_KEY = "image-cockpit.v3.actions";

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

export function saveHistory(history: HistoryItem[]) {
  saveJson(HISTORY_KEY, history);
}

export function loadFrames() {
  return loadJson<SpriteFrame[]>(FRAMES_KEY, []);
}

export function saveFrames(frames: SpriteFrame[]) {
  saveJson(FRAMES_KEY, frames);
}

export function loadActions(fallback: SpriteAction[]) {
  return loadJson<SpriteAction[]>(ACTIONS_KEY, fallback);
}

export function saveActions(actions: SpriteAction[]) {
  saveJson(ACTIONS_KEY, actions);
}
