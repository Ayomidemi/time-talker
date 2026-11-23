"use client";

import { FormEvent, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createContext, useContext } from "react";
import { logoutAccount, saveAccountChanges } from "@/lib/account-client";
import { accountCommitments, type CommitmentChange } from "@/lib/commitments-client";
import { broadcastLogout, clearBrowserData, LOGOUT_CHANNEL } from "@/lib/logout";
import { checkInPrompt, spokenCheckInPrompt } from "@/lib/prompts";
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
  intervalMinutes,
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
const SLOT_ANNOUNCE_WINDOW_MS = 45_000;

function nudgeGapMs(intensity: Settings["intensity"], cadence: Cadence) {
  const configured = intensity === "annoying" ? ANNOYING_NUDGE_MS : GENTLE_NUDGE_MS;
  if (cadence === "off") return configured;
  // Keep at least one spoken reminder inside the current cadence window.
  const beforeNextSlot = intervalMinutes(cadence) * 60_000 - 60_000;
  return Math.max(60_000, Math.min(configured, beforeNextSlot));
}

type HoldContextValue = {
  now: Date | null;
  settings: Settings;
  profile: Profile;
  commitments: Commitment[];
  commitmentsLoading: boolean;
  commitmentsSaving: boolean;
  commitmentsError: string | null;
  retryCommitments: () => void;
  checkIns: CheckIn[];
  draft: string;
  setDraft: (value: string) => void;
  deadlineDraft: string;
  setDeadlineDraft: (value: string) => void;
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
  showSaveAccount: boolean;
  updateSettings: (partial: Partial<Settings>) => void;
  addCommitment: (event: FormEvent) => void;
  toggleDone: (id: string) => void;
  removeCommitment: (id: string) => void;
  recordCheckIn: (status: CheckInStatus) => void;
  speakNow: () => Promise<void>;
  saveAccountDetails: (event: FormEvent) => Promise<void>;
  enableAnnoyingExtras: () => Promise<void>;
  logout: () => Promise<void>;
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
  const [now, setNow] = useState<Date | null>(() => hydrated ? new Date() : null);
  const [settings, setSettings] = useState<Settings>(() => hydrated ? loadSettings() : DEFAULT_SETTINGS);
  const [profile, setProfile] = useState<Profile>(() => hydrated ? loadProfile() : { name: "", email: "", welcomeSeen: false, emailPending: false });
  const [commitmentDay, setCommitmentDay] = useState(() => hydrated ? todayKey() : "");
  const commitmentScope = `${profile.email}|${commitmentDay}`;
  const [commitmentView, setCommitmentView] = useState<{ scope: string; items: Commitment[]; ready: boolean; saving: boolean; error: string | null }>(() => ({
    scope: commitmentScope, items: hydrated && !profile.email ? loadCommitments() : [],
    ready: hydrated && !profile.email, saving: false, error: null,
  }));
  const [reloadCommitments, setReloadCommitments] = useState(0);
  const commitments = commitmentView.scope === commitmentScope ? commitmentView.items : [];
  const commitmentsError = commitmentView.scope === commitmentScope ? commitmentView.error : null;
  const commitmentsLoading = commitmentView.scope !== commitmentScope || (!commitmentView.ready && !commitmentsError);
  const commitmentsSaving = commitmentView.scope === commitmentScope && commitmentView.saving;
  const commitmentsRequestRef = useRef<AbortController | null>(null);
  const commitmentMutationRef = useRef(false);
  const nameRequestRef = useRef<AbortController | null>(null);
  const [checkIns, setCheckIns] = useState<CheckIn[]>(() => hydrated ? loadCheckIns() : []);
  const [draft, setDraft] = useState("");
  const [deadlineDraft, setDeadlineDraft] = useState("");
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
    if (!hydrated) return;
    const controller = new AbortController();
    commitmentsRequestRef.current = controller;
    commitmentMutationRef.current = false;
    Promise.resolve().then(async () => {
      const items = profile.email
        ? await accountCommitments(commitmentDay, controller.signal)
        : loadCommitments(commitmentDay);
      if (!controller.signal.aborted && !loggingOutRef.current) {
        setCommitmentView({ scope: commitmentScope, items, ready: true, saving: false, error: null });
      }
    }).catch((err) => {
      if (!controller.signal.aborted && !loggingOutRef.current) {
        setCommitmentView({ scope: commitmentScope, items: [], ready: false, saving: false,
          error: err instanceof Error ? err.message : "Couldn’t load commitments." });
      }
    });
    return () => controller.abort();
  }, [hydrated, profile.email, commitmentDay, commitmentScope, reloadCommitments]);

  useEffect(() => () => { nameRequestRef.current?.abort(); }, []);

  function retryCommitments() {
    if (commitmentMutationRef.current || loggingOutRef.current) return;
    setCommitmentView((prev) => ({ ...prev, ready: false, error: null }));
    setReloadCommitments((value) => value + 1);
  }

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

  function beginPendingSlot(boundary: Date) {
    const key = slotKey(boundary);
    if (announcedRef.current === key || pendingSlot === key) return;
    announcedRef.current = key;
    setPendingSlot(key);
    // Start the nudge clock so the first reminder can arrive inside this interval.
    lastNudgeRef.current = Date.now() - nudgeGapMs(settings.intensity, settings.cadence) + 15_000;
  }

  const onClockTick = useEffectEvent(() => {
    if (loggingOutRef.current) return;
    const current = new Date();
    setNow(current);
    const day = todayKey(current);
    if (day !== commitmentDay) {
      setCommitmentDay(day);
    }
    if (!settings.enabled || settings.cadence === "off") return;
    const boundary = lastBoundary(current, settings.cadence);
    if (boundary) {
      const late = current.getTime() - boundary.getTime();
      const intervalMs = intervalMinutes(settings.cadence) * 60_000;
      if (late >= 0 && late < SLOT_ANNOUNCE_WINDOW_MS) {
        void fireSlot(boundary);
      } else if (late >= SLOT_ANNOUNCE_WINDOW_MS && late < intervalMs) {
        // Arrived mid-interval: still open the check-in window without replaying the time.
        beginPendingSlot(boundary);
      }
    }
    if (!pendingSlot) return;
    const gap = nudgeGapMs(settings.intensity, settings.cadence);
    if (Date.now() - lastNudgeRef.current < gap) return;
    lastNudgeRef.current = Date.now();
    const prompt = checkInPrompt(commitments, settings.intensity);
    const spoken = spokenCheckInPrompt(commitments, settings.intensity);
    notify(settings.intensity === "annoying" ? "Hold — still waiting" : "Hold", prompt);
    void announce(spoken);
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
    commitmentsRequestRef.current?.abort();
    nameRequestRef.current?.abort();
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

  async function changeCommitment(change: CommitmentChange) {
    const controller = commitmentsRequestRef.current;
    if (loggingOutRef.current || !controller || controller.signal.aborted || commitmentMutationRef.current
      || !commitmentView.ready || commitmentView.scope !== commitmentScope) return false;
    commitmentMutationRef.current = true;
    setCommitmentView((prev) => ({ ...prev, saving: true, error: null }));
    try {
      let items: Commitment[];
      if (profile.email) {
        items = await accountCommitments(commitmentDay, controller.signal, change);
      } else {
        items = commitments;
        if (change.operation === "add") {
          items = [...items, { id: change.id, title: change.title!, done: false, day: commitmentDay, dueAt: change.dueAt ?? null, createdAt: new Date().toISOString() }];
        } else if (change.operation === "update") {
          items = items.map((item) => item.id === change.id ? { ...item, done: change.done! } : item);
        } else {
          items = items.filter((item) => item.id !== change.id);
        }
        saveCommitmentsForDay(commitmentDay, items);
      }
      if (controller.signal.aborted || loggingOutRef.current) return false;
      setCommitmentView({ scope: commitmentScope, items, ready: true, saving: false, error: null });
      return true;
    } catch (err) {
      if (!controller.signal.aborted && !loggingOutRef.current) {
        setCommitmentView((prev) => ({ ...prev, saving: false, error: err instanceof Error ? err.message : "Couldn’t save commitment." }));
      }
      return false;
    } finally {
      if (!controller.signal.aborted) commitmentMutationRef.current = false;
    }
  }

  async function addCommitment(event: FormEvent) {
    event.preventDefault();
    const title = draft.trim();
    if (!title || title.length > 120 || loggingOutRef.current) return;
    const deadline = deadlineDraft ? new Date(deadlineDraft) : null;
    if (deadline && Number.isNaN(deadline.getTime())) return;
    if (await changeCommitment({ operation: "add", id: newId(), title, dueAt: deadline?.toISOString() ?? null })) {
      setDraft("");
      setDeadlineDraft("");
    }
  }

  function toggleDone(id: string) {
    const item = commitments.find((item) => item.id === id);
    if (item) void changeCommitment({ operation: "update", id, done: !item.done });
  }

  function removeCommitment(id: string) {
    void changeCommitment({ operation: "delete", id });
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

  async function saveAccountDetails(event: FormEvent) {
    event.preventDefault();
    if (loggingOutRef.current || authLoading) return;
    nameRequestRef.current?.abort();
    const controller = new AbortController();
    nameRequestRef.current = controller;
    setAuthLoading(true);
    setAuthMessage(null);
    try {
      const saved = await saveAccountChanges(profile, { name: nameDraft, email: emailDraft }, controller.signal);
      if (controller.signal.aborted || loggingOutRef.current) return;
      const next = { ...saved, welcomeSeen: true, emailPending: false };
      setNameDraft(saved.name);
      setEmailDraft(saved.email);
      setProfile(next);
      saveProfile(next);
      setAuthMessage("Account details saved.");
    } catch (err) {
      if (!controller.signal.aborted && !loggingOutRef.current) setAuthMessage(err instanceof Error ? err.message : "Couldn’t save account details.");
    } finally {
      if (!controller.signal.aborted && !loggingOutRef.current) setAuthLoading(false);
    }
  }

  async function enableAnnoyingExtras() {
    const ok = await ensureNotificationPermission();
    if (loggingOutRef.current) return;
    if (!ok) setError("Allow notifications so Hold can nudge you in the background.");
    updateSettings({ intensity: "annoying" });
  }

  const untilLabel =
    !settings.enabled || settings.cadence === "off"
      ? "Cadence is off"
      : next && now
        ? `${formatWait(next.getTime() - now.getTime())} to ${formatWhen(next)}`
        : "Starting…";

  const lockedEmail = Boolean(userEmail || (profile.email.trim() && !profile.emailPending));
  const showSaveAccount = nameDraft.trim() !== profile.name || (!lockedEmail && emailDraft.trim().toLowerCase() !== profile.email);

  const value: HoldContextValue = {
    now,
    settings,
    profile,
    commitments,
    commitmentsLoading,
    commitmentsSaving,
    commitmentsError,
    retryCommitments,
    checkIns,
    draft,
    setDraft,
    deadlineDraft,
    setDeadlineDraft,
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
    showSaveAccount,
    updateSettings,
    addCommitment,
    toggleDone,
    removeCommitment,
    recordCheckIn,
    speakNow,
    saveAccountDetails,
    enableAnnoyingExtras,
    logout,
  };

  return <HoldContext.Provider value={value}>{loggingOut ? <div className="boot">Signing out…</div> : children}</HoldContext.Provider>;
}

export { RADIUS };
