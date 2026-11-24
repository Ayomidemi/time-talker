"use client";

import { useHold } from "@/components/hold-provider";
import type { Cadence, Intensity } from "@/lib/types";

export function YouScreen() {
  const hold = useHold();
  if (!hold.hydrated) return <div className="boot">Hold</div>;

  return (
    <section className="screen" aria-label="You">
      <header className="screen-head">
        <p className="eyebrow">You</p>
        <h1 className="screen-title">{hold.greetingName || "Your Hold"}</h1>
      </header>

      <form className="stack-form" onSubmit={(event) => void hold.saveAccountDetails(event)}>
      <label className="field">
        <span>Name</span>
        <input
          value={hold.nameDraft}
          onChange={(event) => hold.setNameDraft(event.target.value)}
          disabled={hold.authLoading}
          placeholder="Your name"
          maxLength={40}
          required
        />
      </label>

      <label className="field">
        <span>Email</span>
        <input
          type="email"
          value={hold.lockedEmail ? hold.userEmail || hold.profile.email : hold.emailDraft}
          onChange={(event) => hold.setEmailDraft(event.target.value)}
          placeholder="Optional"
          maxLength={254}
          disabled={hold.lockedEmail || hold.authLoading}
        />
      </label>
      {hold.showSaveAccount ? (
          <button type="submit" className="primary" disabled={hold.authLoading}>
            {hold.authLoading ? "Saving…" : "Save account details"}
          </button>
      ) : null}
      </form>
      {hold.authMessage ? <p className="empty">{hold.authMessage}</p> : null}

      {hold.settingsError ? (
        <div role="alert">
          <p className="error">{hold.settingsError}</p>
          <button type="button" className="text-link" onClick={hold.retrySettings}>Reload preferences</button>
        </div>
      ) : hold.settingsBusy ? <p className="empty" role="status">Loading or saving preferences…</p> : null}
      <div className="stack">
        <div className="row">
          <div>
            <p className="row-title">Spoken cadence</p>
            <p className="row-help">Hold speaks on a schedule.</p>
          </div>
          <button
            type="button"
            className="switch"
            disabled={hold.settingsBusy}
            role="switch"
            aria-checked={hold.settings.enabled}
            aria-label="Spoken cadence"
            onClick={() => hold.updateSettings({ enabled: !hold.settings.enabled })}
          >
            <span className="knob" />
          </button>
        </div>

        <label className="field">
          <span>How often</span>
          <select
            disabled={hold.settingsBusy}
            value={hold.settings.cadence}
            onChange={(event) => hold.updateSettings({ cadence: event.target.value as Cadence })}
          >
            <option value="half">Every half hour</option>
            <option value="quarter">Every quarter hour</option>
            <option value="off">Only when I ask</option>
          </select>
        </label>

        <label className="field">
          <span>Intensity</span>
          <select
            disabled={hold.settingsBusy}
            value={hold.settings.intensity}
            onChange={(event) => {
              const value = event.target.value as Intensity;
              if (value === "annoying") void hold.enableAnnoyingExtras();
              else hold.updateSettings({ intensity: value });
            }}
          >
            <option value="gentle">Gentle</option>
            <option value="annoying">Annoying</option>
          </select>
        </label>

        <label className="check-line">
          <input
            type="checkbox"
            disabled={hold.settingsBusy}
            checked={hold.settings.includePeriod}
            onChange={(event) => hold.updateSettings({ includePeriod: event.target.checked })}
          />
          <span>Say morning / afternoon / evening / night</span>
        </label>
      </div>

      <button type="button" className="text-link" disabled={hold.authLoading} onClick={() => void hold.logout()}>
        Logout
      </button>
    </section>
  );
}
