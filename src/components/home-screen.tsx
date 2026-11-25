"use client";

import Link from "next/link";
import { RADIUS, useHold } from "@/components/hold-provider";

export function HomeScreen() {
  const hold = useHold();
  if (!hold.hydrated) return <div className="boot">Hold</div>;

  return (
    <section className="stage" aria-label="Hold">
      <header className="stage-top">
        <p className="brand">Hold</p>
        <p className="hello">{hold.greetingName ? `Hey ${hold.greetingName}` : "Keep what you said."}</p>
      </header>

      <div className="clock-plane" aria-label="Clock">
        <svg className="ring" viewBox="0 0 120 120" aria-hidden="true">
          <circle className="track" cx="60" cy="60" r={RADIUS} />
          <circle
            className={`progress ${hold.settings.intensity === "annoying" ? "hot" : ""}`}
            cx="60"
            cy="60"
            r={RADIUS}
            style={{
              strokeDasharray: String(hold.circumference),
              strokeDashoffset: String(hold.circumference * (1 - (hold.settings.enabled ? hold.progress : 0))),
            }}
          />
        </svg>
        <div className="face">
          <p className="time">
            <span>{hold.clock.hm}</span>
            <span className="sec">{hold.clock.sec}</span>
          </p>
          <p className="ampm">{hold.clock.ap}</p>
        </div>
      </div>

      <div className="stage-bottom">
        <p className="until">
          {hold.speaking ? "Speaking…" : hold.awaitingCheckIn ? "Check in to continue" : hold.untilLabel}
        </p>
        <p className="phrase">
          {hold.awaitingCheckIn
            ? "How are you holding?"
            : hold.lastPhrase || hold.openCommitments[0]?.title || "Add what you’re holding today."}
        </p>
        {hold.settingsError ? <p className="error">{hold.settingsError} <button type="button" className="text-link" onClick={hold.retrySettings}>Reload preferences</button></p> : null}
        {hold.error ? <p className="error">{hold.error}</p> : null}

        <div className={`checkin-row ${hold.awaitingCheckIn ? "urgent" : ""}`} aria-label="Check in">
          <button
            type="button"
            className={`pill good ${hold.lastCheckIn === "on_track" ? "selected" : ""}`}
            onClick={() => hold.recordCheckIn("on_track")}
          >
            On track
          </button>
          <button
            type="button"
            className={`pill warn ${hold.lastCheckIn === "slacking" ? "selected" : ""}`}
            onClick={() => hold.recordCheckIn("slacking")}
          >
            Slacking
          </button>
          <button
            type="button"
            className={`pill mute ${hold.lastCheckIn === "break" ? "selected" : ""}`}
            onClick={() => hold.recordCheckIn("break")}
          >
            Break
          </button>
        </div>

        <div className="cta-row">
          <button type="button" className="primary" onClick={() => void hold.speakNow()} disabled={hold.speaking}>
            {hold.speaking ? "Speaking…" : "Say the time"}
          </button>
          <Link href="/today" className="ghost-btn">
            Today
          </Link>
        </div>
      </div>
    </section>
  );
}
