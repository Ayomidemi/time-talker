"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { checkInPrompt, statusLabel } from "@/lib/prompts";
import { ensureNotificationPermission, notify, speak } from "@/lib/speech";
import {
  appendCheckIn,
  loadCheckIns,
  loadCommitments,
  loadSettings,
  newId,
  saveCommitmentsForDay,
  saveSettings,
} from "@/lib/storage";
import { isSupabaseConfigured, createClient } from "@/lib/supabase/client";
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

export function HoldApp() {
  const [now, setNow] = useState<Date | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [draft, setDraft] = useState("");
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
    setCommitments(loadCommitments());
    setCheckIns(loadCheckIns());
    setSettings(loadSettings());
    setNow(new Date());
    setHydrated(true);
    const id = window.setInterval(() => setNow(new Date()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!supabaseReady) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
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

  const cadence: Cadence = settings.enabled ? settings.cadence : "off";
  const next = useMemo(
    () => (now ? nextAnnouncement(now, cadence === "off" ? "half" : cadence) : null),
    [now, cadence],
  );
  const progress = now ? intervalProgress(now, cadence === "off" ? "half" : cadence) : 0;
  const clock = now ? formatClock(now) : { hm: "–:––", sec: "––", ap: "––" };
  const openCommitments = commitments.filter((item) => !item.done);
  const awaitingCheckIn = Boolean(pendingSlot);

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
    const prompt = checkInPrompt(commitments, settings.intensity);
    const text = `${timeLine} ${prompt}`;
    notify("Hold", prompt);
    await announce(text);
  }

  useEffect(() => {
    if (!hydrated || !now || !settings.enabled || settings.cadence === "off") return;

    const boundary = lastBoundary(now, settings.cadence);
    if (boundary) {
      const late = now.getTime() - boundary.getTime();
      if (late >= 0 && late < 45_000) {
        void fireSlot(boundary);
      }
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

  function addCommitment(event: FormEvent) {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    const item: Commitment = {
      id: newId(),
      title,
      done: false,
      day: todayKey(),
      dueAt: null,
      createdAt: new Date().toISOString(),
    };
    setCommitments((prev) => [...prev, item]);
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
      slot: pendingSlot ? new Date().toISOString() : new Date().toISOString(),
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
    await announce(`${text} ${prompt}`);
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!supabaseReady) {
      setAuthMessage("Add Supabase keys in .env.local to enable sync.");
      return;
    }
    setAuthMessage("Sending magic link…");
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setAuthMessage(authError ? authError.message : "Check your email for a magic link.");
  }

  async function signOut() {
    if (!supabaseReady) return;
    const supabase = createClient();
    await supabase.auth.signOut();
    setUserEmail(null);
  }

  async function enableAnnoyingExtras() {
    const ok = await ensureNotificationPermission();
    if (!ok) setError("Allow notifications so Hold can nudge you when the tab is in the background.");
    updateSettings({ intensity: "annoying" });
  }

  const untilLabel =
    !settings.enabled || settings.cadence === "off"
      ? "Announcements are off"
      : next && now
        ? `${formatWait(next.getTime() - now.getTime())} until ${formatWhen(next)}`
        : "Starting the clock…";

  const preview =
    next && settings.enabled && settings.cadence !== "off"
      ? phraseFor(next, { includePeriod: settings.includePeriod })
      : "Turn on a cadence to schedule the next hold.";

  return (
    <div className="hold-shell">
      <header className="hero">
        <p className="brand">Hold</p>
        <h1 className="lede">Keep what you said you would do.</h1>
        <p className="sub">
          Spoken check-ins on the clock — gentle when you need space, annoying when you need a push.
        </p>
      </header>

      <section className="clock-card" aria-label="Clock">
        <div className="clock">
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
      </section>

      <section className="status-block">
        <p className="until">{speaking ? "Speaking now" : awaitingCheckIn ? "Waiting for your check-in" : untilLabel}</p>
        <p className="phrase">{lastPhrase || preview}</p>
        {error ? <p className="error">{error}</p> : null}
      </section>

      {awaitingCheckIn ? (
        <section className="checkin panel" aria-label="Check in">
          <p className="panel-title">How are you holding?</p>
          <div className="checkin-row">
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
        </section>
      ) : null}

      <section className="panel" aria-label="Today’s commitments">
        <p className="panel-title">Today’s hold</p>
        <p className="panel-help">Up to three things you intend to finish.</p>
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
        {commitments.length < 3 ? (
          <form className="add-form" onSubmit={addCommitment}>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Add a commitment"
              maxLength={120}
            />
            <button type="submit" className="say compact">
              Add
            </button>
          </form>
        ) : null}
      </section>

      <section className="panel" aria-label="Cadence settings">
        <div className="row">
          <div>
            <p className="row-title">Spoken cadence</p>
            <p className="row-help">Hold speaks on the schedule you choose.</p>
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
            <option value="off">Time only when I ask</option>
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
          <span>Say the time of day, such as “in the afternoon.”</span>
        </label>

        <button type="button" className="say" onClick={() => void speakNow()} disabled={speaking}>
          {speaking ? "Speaking…" : "Say the time now"}
        </button>
      </section>

      <section className="panel" aria-label="Recent check-ins">
        <p className="panel-title">Recent honesty</p>
        {checkIns.length === 0 ? (
          <p className="panel-help">No check-ins yet. The first cadence will ask.</p>
        ) : (
          <ul className="history">
            {checkIns.slice(0, 8).map((item) => (
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
      </section>

      <section className="panel" aria-label="Account">
        <p className="panel-title">Sync with Supabase</p>
        {userEmail ? (
          <>
            <p className="panel-help">Signed in as {userEmail}</p>
            <button type="button" className="say compact" onClick={() => void signOut()}>
              Sign out
            </button>
          </>
        ) : (
          <form className="add-form" onSubmit={signIn}>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@email.com"
              required
            />
            <button type="submit" className="say compact">
              Magic link
            </button>
          </form>
        )}
        {authMessage ? <p className="panel-help">{authMessage}</p> : null}
        {!supabaseReady ? (
          <p className="panel-help">
            Local mode is on. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to sync across devices.
          </p>
        ) : null}
      </section>

      <p className="footnote">
        Keep this tab open for spoken holds. Annoying mode also uses browser notifications when allowed.
      </p>
    </div>
  );
}
