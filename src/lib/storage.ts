import { clearCookie, EMAIL_COOKIE, NAME_COOKIE, PENDING_COOKIE, readCookie, writeCookie } from "./cookies";
import { DEFAULT_SETTINGS, type CheckIn, type Commitment, type Settings } from "./types";

const SETTINGS_KEY = "hold.settings";
const COMMITMENTS_KEY = "hold.commitments";
const CHECKINS_KEY = "hold.checkins";
const PROFILE_KEY = "hold.profile";

export type Profile = {
  name: string;
  email: string;
  welcomeSeen: boolean;
  emailPending: boolean;
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

export function loadCommitments(day?: string): Commitment[] {
  const all = readJson<Commitment[]>(COMMITMENTS_KEY, []);
  return day ? all.filter((item) => item.day === day) : all;
}

export function saveCommitments(items: Commitment[]) {
  writeJson(COMMITMENTS_KEY, items);
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
  const legacy = readJson<Partial<Profile>>(PROFILE_KEY, {});
  const name = readCookie(NAME_COOKIE) || legacy.name || "";
  const email = readCookie(EMAIL_COOKIE) || legacy.email || "";
  return {
    name,
    email,
    welcomeSeen: Boolean(name) || Boolean(legacy.welcomeSeen),
    emailPending: readCookie(PENDING_COOKIE) === "1" || Boolean(legacy.emailPending),
  };
}

export function saveProfile(profile: Profile) {
  writeJson(PROFILE_KEY, profile);
  if (profile.name.trim()) writeCookie(NAME_COOKIE, profile.name.trim());
  else clearCookie(NAME_COOKIE);
  if (profile.email.trim()) writeCookie(EMAIL_COOKIE, profile.email.trim());
  else clearCookie(EMAIL_COOKIE);
  if (profile.emailPending) writeCookie(PENDING_COOKIE, "1");
  else clearCookie(PENDING_COOKIE);
}

export function clearProfile() {
  writeJson(PROFILE_KEY, { name: "", email: "", welcomeSeen: false, emailPending: false });
  clearCookie(NAME_COOKIE);
  clearCookie(EMAIL_COOKIE);
  clearCookie(PENDING_COOKIE);
}
