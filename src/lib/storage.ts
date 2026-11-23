import { DEFAULT_SETTINGS, type CheckIn, type Commitment, type Settings } from "./types";
import { todayKey } from "./time";

const SETTINGS_KEY = "hold.settings";
const COMMITMENTS_KEY = "hold.commitments";
const CHECKINS_KEY = "hold.checkins";
const PROFILE_KEY = "hold.profile";

export type Profile = {
  name: string;
  welcomeSeen: boolean;
};

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>(SETTINGS_KEY, {}) };
}

export function saveSettings(settings: Settings) {
  writeJson(SETTINGS_KEY, settings);
}

export function loadCommitments(day = todayKey()): Commitment[] {
  const all = readJson<Commitment[]>(COMMITMENTS_KEY, []);
  return all.filter((item) => item.day === day);
}

export function saveCommitmentsForDay(day: string, items: Commitment[]) {
  const others = readJson<Commitment[]>(COMMITMENTS_KEY, []).filter((item) => item.day !== day);
  writeJson(COMMITMENTS_KEY, [...others, ...items]);
}

export function loadCheckIns(limit = 40): CheckIn[] {
  return readJson<CheckIn[]>(CHECKINS_KEY, [])
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function appendCheckIn(entry: CheckIn) {
  const all = readJson<CheckIn[]>(CHECKINS_KEY, []);
  writeJson(CHECKINS_KEY, [entry, ...all].slice(0, 200));
}

export function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function loadProfile(): Profile {
  return {
    name: "",
    welcomeSeen: false,
    ...readJson<Partial<Profile>>(PROFILE_KEY, {}),
  };
}

export function saveProfile(profile: Profile) {
  writeJson(PROFILE_KEY, profile);
}
