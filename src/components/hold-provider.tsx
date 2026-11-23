"use client";

import { FormEvent, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createContext, useContext } from "react";
import { enterAccount, logoutAccount } from "@/lib/account-client";
import { broadcastLogout, clearBrowserData, LOGOUT_CHANNEL } from "@/lib/logout";
import { checkInPrompt } from "@/lib/prompts";
import { ensureNotificationPermission, notify, speak, stopSpeech } from "@/lib/speech";
import {
  appendCheckIn,
  loadCheckIns,
  loadCommitments,
  loadProfile,
  loadSettings,
  newId,
  saveCommitmentsForDay,
  saveProfile,
  saveSettings,
  type Profile,
} from "@/lib/storage";
import {
  formatClock,
  formatWait,
  formatWhen,
  intervalProgress,
  lastBoundary,
  nextAnnouncement,
  phraseFor,
  slotKey,
  todayKey,
} from "@/lib/time";
import {
  DEFAULT_SETTINGS,
  type Cadence,
  type CheckIn,
  type CheckInStatus,
  type Commitment,
  type Settings,
} from "@/lib/types";

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GENTLE_NUDGE_MS = 30 * 60 * 1000;
const ANNOYING_NUDGE_MS = 10 * 60 * 1000;

type HoldContextValue = {
  now: Date | null;
  settings: Settings;
  profile: Profile;
  commitments: Commitment[];
  checkIns: CheckIn[];
  draft: string;
  setDraft: (value: string) => void;
  nameDraft: string;
  setNameDraft: (value: string) => void;
  emailDraft: string;
  setEmailDraft: (value: string) => void;
  authMessage: string | null;
  authLoading: boolean;
  userEmail: string | null;
  pendingSlot: string | null;
  lastCheckIn: CheckInStatus | null;
  lastPhrase: string | null;
  speaking: boolean;
  error: string | null;
  hydrated: boolean;
  clock: { hm: string; sec: string; ap: string };
  progress: number;
  circumference: number;
  untilLabel: string;
  awaitingCheckIn: boolean;
  greetingName: string;
  openCommitments: Commitment[];
  lockedEmail: boolean;
  showSaveEmail: boolean;
  updateSettings: (partial: Partial<Settings>) => void;
  addCommitment: (event: FormEvent) => void;
  toggleDone: (id: string) => void;
  removeCommitment: (id: string) => void;
  recordCheckIn: (status: CheckInStatus) => void;
  speakNow: () => Promise<void>;
  saveAccountEmail: (event: FormEvent) => Promise<void>;
  enableAnnoyingExtras: () => Promise<void>;
  logout: () => Promise<void>;
  saveName: () => void;
};

const HoldContext = createContext<HoldContextValue | null>(null);

export function useHold() {
  const value = useContext(HoldContext);
  if (!value) throw new Error("useHold must be used inside HoldProvider");
  return value;
}

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function HoldProvider({ children }: { children: React.ReactNode }) {
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  // Keep the route children in the server tree so Next can validate them.
  // The client instance initializes browser data once hydration is complete.
  return <LocalHoldProvider key={hydrated ? "client" : "server"} hydrated={hydrated}>{children}</LocalHoldProvider>;
}

function LocalHoldProvider({ children, hydrated }: { children: React.ReactNode; hydrated: boolean }) {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(() => hydrated ? new Date() : null);
  const [settings, setSettings] = useState<Settings>(() => hydrated ? loadSettings() : DEFAULT_SETTINGS);
  const [profile, setProfile] = useState<Profile>(() => hydrated ? loadProfile() : { name: "", email: "", welcomeSeen: false, emailPending: false });
  const [commitmentDay, setCommitmentDay] = useState(() => hydrated ? todayKey() : "");
  const [commitments, setCommitments] = useState<Commitment[]>(() => hydrated ? loadCommitments() : []);
  const [checkIns, setCheckIns] = useState<CheckIn[]>(() => hydrated ? loadCheckIns() : []);
  const [draft, setDraft] = useState("");
  const [nameDraft, setNameDraft] = useState(profile.name);
  const [emailDraft, setEmailDraft] = useState(profile.email);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const userEmail = profile.email || null;
  const [pendingSlot, setPendingSlot] = useState<string | null>(null);
  const [lastCheckIn, setLastCheckIn] = useState<CheckInStatus | null>(checkIns[0]?.status ?? null);
  const [lastPhrase, setLastPhrase] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [loggingOut, setLoggingOut] = useState(false);
  const loggingOutRef = useRef(false);
  const clockTimerRef = useRef<number | null>(null);
  const announcedRef = useRef("");
  const lastNudgeRef = useRef(0);

  useEffect(() => {
    if (hydrated && !loggingOutRef.current) saveSettings(settings);
  }, [settings, hydrated]);

  useEffect(() => {
    if (hydrated && !loggingOutRef.current) saveCommitmentsForDay(commitmentDay, commitments);
  }, [commitmentDay, commitments, hydrated]);

  useEffect(() => {
    if (hydrated && !loggingOutRef.current) saveProfile(profile);
  }, [profile, hydrated]);

  const cadence: Cadence = settings.enabled ? settings.cadence : "off";
  const next = useMemo(
    () => (now ? nextAnnouncement(now, cadence === "off" ? "half" : cadence) : null),
    [now, cadence],
  );
  const progress = now ? intervalProgress(now, cadence === "off" ? "half" : cadence) : 0;
  const clock = now ? formatClock(now) : { hm: "–:––", sec: "––", ap: "––" };
  const openCommitments = commitments.filter((item) => !item.done);
  const awaitingCheckIn = Boolean(pendingSlot);
  const greetingName = profile.name.trim();

  async function announce(text: string) {
    if (loggingOutRef.current) return;
    setSpeaking(true);
    setLastPhrase(text);
    setError(null);
    try {
      await speak(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t speak just now.");
    } finally {
      setSpeaking(false);
    }
  }

  async function fireSlot(slotDate: Date) {
    const key = slotKey(slotDate);
    if (announcedRef.current === key) return;
    announcedRef.current = key;
    setPendingSlot(key);
    lastNudgeRef.current = Date.now();
    const timeLine = phraseFor(slotDate, { includePeriod: settings.includePeriod });
    const text = greetingName ? `${greetingName}. ${timeLine}` : timeLine;
    notify("Hold", checkInPrompt(commitments, settings.intensity));
    await announce(text);
  }

  const onClockTick = useEffectEvent(() => {
    if (loggingOutRef.current) return;
    const current = new Date();
    setNow(current);
    const day = todayKey(current);
    if (day !== commitmentDay) {
      setCommitmentDay(day);
      setCommitments(loadCommitments(day));
    }
    if (!settings.enabled || settings.cadence === "off") return;
    const boundary = lastBoundary(current, settings.cadence);
    if (boundary) {
      const late = current.getTime() - boundary.getTime();
      if (late >= 0 && late < 45_000) void fireSlot(boundary);
    }
    if (!pendingSlot) return;
    const gap = settings.intensity === "annoying" ? ANNOYING_NUDGE_MS : GENTLE_NUDGE_MS;
    if (Date.now() - lastNudgeRef.current < gap) return;
    lastNudgeRef.current = Date.now();
    const prompt = checkInPrompt(commitments, settings.intensity);
    if (settings.intensity === "annoying") {
      notify("Hold — still waiting", prompt);
      void announce("Check in now.");
    } else {
      notify("Hold", prompt);
    }
  });

  useEffect(() => {
    if (!hydrated) return;
    const id = window.setInterval(() => onClockTick(), 250);
    clockTimerRef.current = id;
    return () => {
      window.clearInterval(id);
      clockTimerRef.current = null;
      stopSpeech();
    };
  }, [hydrated]);

  function updateSettings(partial: Partial<Settings>) {
    if (loggingOutRef.current) return;
    setSettings((prev) => ({ ...prev, ...partial }));
  }

  async function logout(broadcast = true) {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    setLoggingOut(true);
    if (clockTimerRef.current !== null) window.clearInterval(clockTimerRef.current);
    stopSpeech();
    setAuthLoading(true);
    if (broadcast) broadcastLogout();
    // Neither a failed request nor unavailable browser storage should keep
    // the clock running or leave the user on their previous profile.
    let timeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled([logoutAccount(), clearBrowserData()]),
      new Promise<void>((resolve) => { timeout = setTimeout(resolve, 5000); }),
    ]);
    clearTimeout(timeout);
    window.location.replace("/login");
  }

  const onOtherTabLogout = useEffectEvent(() => { void logout(false); });
  useEffect(() => {
    if (!hydrated) return;
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(LOGOUT_CHANNEL);
    if (channel) channel.onmessage = () => onOtherTabLogout();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null && event.storageArea === window.localStorage) onOtherTabLogout();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      channel?.close();
      window.removeEventListener("storage", onStorage);
    };
  }, [hydrated]);

  function addCommitment(event: FormEvent) {
    event.preventDefault();
    if (loggingOutRef.current) return;
    const title = draft.trim();
    if (!title) return;
    setCommitments((prev) => [
      ...prev,
      {
        id: newId(),
        title,
        done: false,
        day: todayKey(),
        dueAt: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    setDraft("");
  }

  function toggleDone(id: string) {
    setCommitments((prev) => prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
  }

  function removeCommitment(id: string) {
    setCommitments((prev) => prev.filter((item) => item.id !== id));
  }

  function recordCheckIn(status: CheckInStatus) {
    if (loggingOutRef.current) return;
    const entry: CheckIn = {
      id: newId(),
      slot: new Date().toISOString(),
      status,
      note: openCommitments[0]?.title ?? null,
      createdAt: new Date().toISOString(),
    };
    appendCheckIn(entry);
    setCheckIns((prev) => [entry, ...prev].slice(0, 40));
    setLastCheckIn(status);
    setPendingSlot(null);
  }

  async function speakNow() {
    const text = phraseFor(new Date(), { includePeriod: settings.includePeriod });
    const lead = greetingName ? `${greetingName}. ` : "";
    await announce(`${lead}${text}`);
  }

  async function saveAccountEmail(event: FormEvent) {
    event.preventDefault();
    if (loggingOutRef.current) return;
    const name = nameDraft.trim() || profile.name.trim();
    const email = emailDraft.trim();
    if (!name || !email) return;
    setAuthLoading(true);
    setAuthMessage(null);
    try {
      const result = await enterAccount({ name, email });
      if (loggingOutRef.current) return;
      if (result.needsName) throw new Error("Name is required.");
      const next = { name: result.name, email: result.email, welcomeSeen: true, emailPending: false };
      setNameDraft(result.name);
      setEmailDraft(result.email);
      setProfile(next);
      saveProfile(next);
      router.push(result.next);
    } catch (err) {
      setAuthMessage(err instanceof Error ? err.message : "Couldn’t save that email.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function enableAnnoyingExtras() {
    const ok = await ensureNotificationPermission();
    if (loggingOutRef.current) return;
    if (!ok) setError("Allow notifications so Hold can nudge you in the background.");
    updateSettings({ intensity: "annoying" });
  }

  function saveName() {
    if (loggingOutRef.current) return;
    const name = nameDraft.trim();
    if (!name) {
      setAuthMessage("Name is required.");
      setNameDraft(profile.name);
      return;
    }
    setAuthMessage(null);
    setProfile((prev) => ({ ...prev, name, welcomeSeen: true }));
  }

  const untilLabel =
    !settings.enabled || settings.cadence === "off"
      ? "Cadence is off"
      : next && now
        ? `${formatWait(next.getTime() - now.getTime())} to ${formatWhen(next)}`
        : "Starting…";

  const lockedEmail = Boolean(userEmail || (profile.email.trim() && !profile.emailPending));
  const showSaveEmail = !lockedEmail && emailDraft.trim().length > 0 && emailDraft.trim() !== profile.email.trim();

  const value: HoldContextValue = {
    now,
    settings,
    profile,
    commitments,
    checkIns,
    draft,
    setDraft,
    nameDraft,
    setNameDraft,
    emailDraft,
    setEmailDraft,
    authMessage,
    authLoading,
    userEmail,
    pendingSlot,
    lastCheckIn,
    lastPhrase,
    speaking,
    error,
    hydrated,
    clock,
    progress,
    circumference: CIRCUMFERENCE,
    untilLabel,
    awaitingCheckIn,
    greetingName,
    openCommitments,
    lockedEmail,
    showSaveEmail,
    updateSettings,
    addCommitment,
    toggleDone,
    removeCommitment,
    recordCheckIn,
    speakNow,
    saveAccountEmail,
    enableAnnoyingExtras,
    logout,
    saveName,
  };

  return <HoldContext.Provider value={value}>{loggingOut ? <div className="boot">Signing out…</div> : children}</HoldContext.Provider>;
}

export { RADIUS };
