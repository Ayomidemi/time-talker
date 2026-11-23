"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createContext, useContext } from "react";
import { checkInPrompt } from "@/lib/prompts";
import { ensureNotificationPermission, notify, speak, stopSpeech } from "@/lib/speech";
import {
  appendCheckIn,
  clearProfile,
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
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
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
  type Intensity,
  type Settings,
} from "@/lib/types";

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GENTLE_NUDGE_MS = 12 * 60 * 1000;
const ANNOYING_NUDGE_MS = 2 * 60 * 1000;

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

export function HoldProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [profile, setProfile] = useState<Profile>({
    name: "",
    email: "",
    welcomeSeen: false,
    emailPending: false,
  });
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [draft, setDraft] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [pendingSlot, setPendingSlot] = useState<string | null>(null);
  const [lastCheckIn, setLastCheckIn] = useState<CheckInStatus | null>(null);
  const [lastPhrase, setLastPhrase] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const announcedRef = useRef("");
  const lastNudgeRef = useRef(0);
  const supabaseReady = isSupabaseConfigured();

  useEffect(() => {
    const savedProfile = loadProfile();
    const loadedCheckIns = loadCheckIns();
    setProfile(savedProfile);
    setNameDraft(savedProfile.name);
    setEmailDraft(savedProfile.email);
    setCommitments(loadCommitments());
    setCheckIns(loadedCheckIns);
    if (loadedCheckIns[0]) setLastCheckIn(loadedCheckIns[0].status);
    setSettings(loadSettings());
    setNow(new Date());
    setHydrated(true);
    const id = window.setInterval(() => setNow(new Date()), 250);
    return () => {
      window.clearInterval(id);
      stopSpeech();
    };
  }, []);

  useEffect(() => {
    if (!supabaseReady) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? null;
      setUserEmail(email);
      if (!email) return;
      const metaName = data.user?.user_metadata?.name;
      setProfile((prev) => {
        const next = {
          ...prev,
          name: typeof metaName === "string" && metaName.trim() ? metaName.trim() : prev.name,
          email,
          welcomeSeen: true,
          emailPending: false,
        };
        saveProfile(next);
        return next;
      });
      if (typeof metaName === "string" && metaName.trim()) setNameDraft(metaName.trim());
      setEmailDraft(email);
    });
  }, [supabaseReady]);

  useEffect(() => {
    if (!hydrated) return;
    saveSettings(settings);
  }, [settings, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveCommitmentsForDay(todayKey(), commitments);
  }, [commitments, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveProfile(profile);
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

  useEffect(() => {
    if (!hydrated || !now || !settings.enabled || settings.cadence === "off") return;
    const boundary = lastBoundary(now, settings.cadence);
    if (boundary) {
      const late = now.getTime() - boundary.getTime();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, hydrated, settings.enabled, settings.cadence, settings.intensity, pendingSlot, commitments]);

  function updateSettings(partial: Partial<Settings>) {
    setSettings((prev) => ({ ...prev, ...partial }));
  }

  async function logout() {
    stopSpeech();
    announcedRef.current = "";
    lastNudgeRef.current = 0;
    setSpeaking(false);
    setPendingSlot(null);
    setLastPhrase(null);
    setError(null);
    clearProfile();
    setProfile({ name: "", email: "", welcomeSeen: false, emailPending: false });
    setNameDraft("");
    setEmailDraft("");
    setAuthMessage(null);
    setAuthLoading(false);
    setUserEmail(null);
    setLastCheckIn(null);
    if (supabaseReady) {
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    router.push("/login");
    router.refresh();
  }

  function addCommitment(event: FormEvent) {
    event.preventDefault();
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
    const name = nameDraft.trim() || profile.name.trim();
    const email = emailDraft.trim();
    if (!name || !email) return;
    setAuthLoading(true);
    setAuthMessage(null);
    try {
      const next = { name, email, welcomeSeen: true, emailPending: supabaseReady };
      setProfile(next);
      saveProfile(next);
      if (!supabaseReady) {
        setAuthMessage("Email saved on this device.");
        return;
      }
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: { name },
          shouldCreateUser: true,
        },
      });
      if (authError) {
        setAuthMessage(authError.message);
        return;
      }
      router.push("/confirm");
    } finally {
      setAuthLoading(false);
    }
  }

  async function enableAnnoyingExtras() {
    const ok = await ensureNotificationPermission();
    if (!ok) setError("Allow notifications so Hold can nudge you in the background.");
    updateSettings({ intensity: "annoying" });
  }

  function saveName() {
    const name = nameDraft.trim();
    if (!name) {
      setAuthMessage("Name is required.");
      setNameDraft(profile.name);
      return;
    }
    setProfile((prev) => {
      const next = { ...prev, name, welcomeSeen: true };
      saveProfile(next);
      return next;
    });
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

  return <HoldContext.Provider value={value}>{children}</HoldContext.Provider>;
}

export { RADIUS };
