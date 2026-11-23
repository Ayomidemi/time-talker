"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { checkInPrompt, statusLabel } from "@/lib/prompts";
import { ensureNotificationPermission, notify, speak } from "@/lib/speech";
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

type View = "welcome" | "home" | "today" | "you";

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GENTLE_NUDGE_MS = 12 * 60 * 1000;
const ANNOYING_NUDGE_MS = 2 * 60 * 1000;

export function HoldApp() {
  const [view, setView] = useState<View>("home");
  const [now, setNow] = useState<Date | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [profile, setProfile] = useState<Profile>({ name: "", welcomeSeen: false });
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [draft, setDraft] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [pendingSlot, setPendingSlot] = useState<string | null>(null);
  const [lastPhrase, setLastPhrase] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const announcedRef = useRef<string>("");
  const lastNudgeRef = useRef(0);
  const supabaseReady = isSupabaseConfigured();

  useEffect(() => {
    const savedProfile = loadProfile();
    setProfile(savedProfile);
    setNameDraft(savedProfile.name);
    setCommitments(loadCommitments());
    setCheckIns(loadCheckIns());
    setSettings(loadSettings());
    setNow(new Date());
    setView(savedProfile.welcomeSeen ? "home" : "welcome");
    setHydrated(true);
    const id = window.setInterval(() => setNow(new Date()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!supabaseReady) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
      const metaName = data.user?.user_metadata?.name;
      if (typeof metaName === "string" && metaName.trim()) {
        setProfile((prev) => {
          const next = { ...prev, name: metaName.trim(), welcomeSeen: true };
          saveProfile(next);
          return next;
        });
        setNameDraft(metaName.trim());
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
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
    setView("home");
    lastNudgeRef.current = Date.now();

    const timeLine = phraseFor(slotDate, { includePeriod: settings.includePeriod });
    const prompt = checkInPrompt(commitments, settings.intensity);
    const text = greetingName ? `${greetingName}. ${timeLine} ${prompt}` : `${timeLine} ${prompt}`;
    notify("Hold", prompt);
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
      void announce(prompt);
    } else {
      notify("Hold", prompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, hydrated, settings.enabled, settings.cadence, settings.intensity, pendingSlot, commitments]);

  function updateSettings(partial: Partial<Settings>) {
    setSettings((prev) => ({ ...prev, ...partial }));
  }

  function finishWelcome(event?: FormEvent) {
    event?.preventDefault();
    const name = nameDraft.trim();
    setProfile({ name, welcomeSeen: true });
    setView("home");
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
    setCommitments((prev) =>
      prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
    );
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
    setPendingSlot(null);
    if (settings.intensity === "annoying") {
      void announce(`Logged ${statusLabel(status)}. Back to it.`);
    }
  }

  async function speakNow() {
    const text = phraseFor(new Date(), { includePeriod: settings.includePeriod });
    const prompt = checkInPrompt(commitments, settings.intensity);
    const lead = greetingName ? `${greetingName}. ` : "";
    await announce(`${lead}${text} ${prompt}`);
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    const name = nameDraft.trim();
    if (!name) {
      setAuthMessage("Add your name first.");
      return;
    }
    setProfile((prev) => ({ ...prev, name, welcomeSeen: true }));

    if (!supabaseReady) {
      setAuthMessage("Sign-in needs Supabase keys in .env.local. Your name is saved on this device.");
      return;
    }

    setAuthMessage("Sending a sign-in link…");
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { name },
      },
    });
    setAuthMessage(authError ? authError.message : "Check your email for a sign-in link.");
  }

  async function signOut() {
    if (!supabaseReady) return;
    const supabase = createClient();
    await supabase.auth.signOut();
    setUserEmail(null);
  }

  async function enableAnnoyingExtras() {
    const ok = await ensureNotificationPermission();
    if (!ok) setError("Allow notifications so Hold can nudge you in the background.");
    updateSettings({ intensity: "annoying" });
  }

  const untilLabel =
    !settings.enabled || settings.cadence === "off"
      ? "Cadence is off"
      : next && now
        ? `${formatWait(next.getTime() - now.getTime())} to ${formatWhen(next)}`
        : "Starting…";

  if (!hydrated) {
    return <div className="boot">Hold</div>;
  }

  if (view === "welcome") {
    return (
      <div className="welcome">
        <p className="brand">Hold</p>
        <h1 className="lede">What should we call you?</h1>
        <p className="sub">Optional — Hold can greet you by name when it checks in.</p>
        <form className="welcome-form" onSubmit={finishWelcome}>
          <input
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            placeholder="Your name"
            maxLength={40}
            autoFocus
          />
          <button type="submit" className="primary">
            Continue
          </button>
        </form>
        <button type="button" className="text-link" onClick={() => finishWelcome()}>
          Skip for now
        </button>
      </div>
    );
  }

  return (
    <div className={`app ${view}`}>
      {view === "home" ? (
        <section className="stage" aria-label="Hold">
          <header className="stage-top">
            <p className="brand">Hold</p>
            <p className="hello">{greetingName ? `Hey ${greetingName}` : "Keep what you said."}</p>
          </header>

          <div className="clock-plane" aria-label="Clock">
            <svg className="ring" viewBox="0 0 120 120" aria-hidden="true">
              <circle className="track" cx="60" cy="60" r={RADIUS} />
              <circle
                className={`progress ${settings.intensity === "annoying" ? "hot" : ""}`}
                cx="60"
                cy="60"
                r={RADIUS}
                style={{
                  strokeDasharray: String(CIRCUMFERENCE),
                  strokeDashoffset: String(CIRCUMFERENCE * (1 - (settings.enabled ? progress : 0))),
                }}
              />
            </svg>
            <div className="face">
              <p className="time">
                <span>{clock.hm}</span>
                <span className="sec">{clock.sec}</span>
              </p>
              <p className="ampm">{clock.ap}</p>
            </div>
          </div>

          <div className="stage-bottom">
            <p className="until">
              {speaking ? "Speaking…" : awaitingCheckIn ? "Check in to continue" : untilLabel}
            </p>
            <p className="phrase">
              {awaitingCheckIn
                ? "How are you holding?"
                : lastPhrase || openCommitments[0]?.title || "Add what you’re holding today."}
            </p>
            {error ? <p className="error">{error}</p> : null}

            {awaitingCheckIn ? (
              <div className="checkin-row" aria-label="Check in">
                <button type="button" className="pill good" onClick={() => recordCheckIn("on_track")}>
                  On track
                </button>
                <button type="button" className="pill warn" onClick={() => recordCheckIn("slacking")}>
                  Slacking
                </button>
                <button type="button" className="pill mute" onClick={() => recordCheckIn("break")}>
                  Break
                </button>
              </div>
            ) : (
              <div className="cta-row">
                <button type="button" className="primary" onClick={() => void speakNow()} disabled={speaking}>
                  {speaking ? "Speaking…" : "Say the time"}
                </button>
                <button type="button" className="ghost-btn" onClick={() => setView("today")}>
                  Today
                </button>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {view === "today" ? (
        <section className="screen" aria-label="Today">
          <header className="screen-head">
            <p className="eyebrow">Today</p>
            <h1 className="screen-title">What are you holding?</h1>
          </header>

          <ul className="commitment-list">
            {commitments.map((item) => (
              <li key={item.id} className={item.done ? "done" : ""}>
                <button type="button" className="check" onClick={() => toggleDone(item.id)} aria-label="Toggle done">
                  <span />
                </button>
                <span className="title">{item.title}</span>
                <button type="button" className="ghost" onClick={() => removeCommitment(item.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>

          {commitments.length === 0 ? <p className="empty">No commitments yet. Add up to three.</p> : null}

          {commitments.length < 3 ? (
            <form className="inline-form" onSubmit={addCommitment}>
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Write one clear outcome"
                maxLength={120}
              />
              <button type="submit" className="primary compact">
                Add
              </button>
            </form>
          ) : null}

          <div className="history-block">
            <p className="eyebrow">Recent honesty</p>
            {checkIns.length === 0 ? (
              <p className="empty">No check-ins yet.</p>
            ) : (
              <ul className="history">
                {checkIns.slice(0, 6).map((item) => (
                  <li key={item.id}>
                    <span className={`tag ${item.status}`}>{statusLabel(item.status)}</span>
                    <span>
                      {new Date(item.createdAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {item.note ? ` · ${item.note}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {view === "you" ? (
        <section className="screen" aria-label="You">
          <header className="screen-head">
            <p className="eyebrow">You</p>
            <h1 className="screen-title">{greetingName || "Your Hold"}</h1>
          </header>

          <label className="field">
            <span>Name</span>
            <input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={() => setProfile((prev) => ({ ...prev, name: nameDraft.trim() }))}
              placeholder="Your name"
              maxLength={40}
            />
          </label>

          <div className="stack">
            <div className="row">
              <div>
                <p className="row-title">Spoken cadence</p>
                <p className="row-help">Hold speaks on a schedule.</p>
              </div>
              <button
                type="button"
                className="switch"
                role="switch"
                aria-checked={settings.enabled}
                aria-label="Spoken cadence"
                onClick={() => updateSettings({ enabled: !settings.enabled })}
              >
                <span className="knob" />
              </button>
            </div>

            <label className="field">
              <span>How often</span>
              <select
                value={settings.cadence}
                onChange={(event) => updateSettings({ cadence: event.target.value as Cadence })}
              >
                <option value="half">Every half hour</option>
                <option value="quarter">Every quarter hour</option>
                <option value="off">Only when I ask</option>
              </select>
            </label>

            <label className="field">
              <span>Intensity</span>
              <select
                value={settings.intensity}
                onChange={(event) => {
                  const value = event.target.value as Intensity;
                  if (value === "annoying") void enableAnnoyingExtras();
                  else updateSettings({ intensity: value });
                }}
              >
                <option value="gentle">Gentle</option>
                <option value="annoying">Annoying</option>
              </select>
            </label>

            <label className="check-line">
              <input
                type="checkbox"
                checked={settings.includePeriod}
                onChange={(event) => updateSettings({ includePeriod: event.target.checked })}
              />
              <span>Say morning / afternoon / evening / night</span>
            </label>
          </div>

          <div className="account-block">
            <p className="eyebrow">Sign in</p>
            <p className="empty">Optional. Use your name and email when you want an account.</p>
            {userEmail ? (
              <div className="signed-in">
                <p className="empty">Signed in as {userEmail}</p>
                <button type="button" className="ghost-btn" onClick={() => void signOut()}>
                  Sign out
                </button>
              </div>
            ) : (
              <form className="stack-form" onSubmit={signIn}>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email"
                  required
                />
                <button type="submit" className="primary">
                  Email me a sign-in link
                </button>
              </form>
            )}
            {authMessage ? <p className="empty">{authMessage}</p> : null}
          </div>

          <button type="button" className="text-link" onClick={() => setView("welcome")}>
            Show welcome screen again
          </button>
        </section>
      ) : null}

      <nav className="dock" aria-label="Main">
        <button type="button" className={view === "home" ? "active" : ""} onClick={() => setView("home")}>
          Hold
        </button>
        <button type="button" className={view === "today" ? "active" : ""} onClick={() => setView("today")}>
          Today
        </button>
        <button type="button" className={view === "you" ? "active" : ""} onClick={() => setView("you")}>
          You
        </button>
      </nav>
    </div>
  );
}
