"use client";

import { statusLabel } from "@/lib/prompts";
import { useHold } from "@/components/hold-provider";

export function TodayScreen() {
  const hold = useHold();
  if (!hold.hydrated) return <div className="boot">Hold</div>;

  return (
    <section className="screen" aria-label="Today">
      <header className="screen-head">
        <p className="eyebrow">Today</p>
        <h1 className="screen-title">What are you holding?</h1>
      </header>

      {hold.commitmentsLoading ? <p className="empty" role="status">Loading commitments…</p> : null}
      {hold.commitmentsSaving ? <p className="empty" role="status">Saving…</p> : null}
      {hold.commitmentsError ? (
        <div role="alert">
          <p className="error">{hold.commitmentsError}</p>
          <button type="button" className="text-link" disabled={hold.commitmentsSaving} onClick={hold.retryCommitments}>Reload commitments</button>
        </div>
      ) : null}
      <ul className="commitment-list">
        {hold.commitments.map((item) => (
          <li key={item.id} className={item.done ? "done" : ""}>
            <button type="button" className="check" disabled={hold.commitmentsLoading || hold.commitmentsSaving} onClick={() => hold.toggleDone(item.id)} aria-label="Toggle done">
              <span />
            </button>
            <div className="title">
              <span>{item.title}</span>
              {item.dueAt ? <small className="commitment-deadline">Due {new Date(item.dueAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</small> : null}
            </div>
            <button type="button" className="ghost" disabled={hold.commitmentsLoading || hold.commitmentsSaving} onClick={() => hold.removeCommitment(item.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>

      {!hold.commitmentsLoading && !hold.commitmentsError && hold.commitments.length === 0 ? <p className="empty">No commitments yet. Add an outcome below.</p> : null}

        <form className="stack-form" onSubmit={(event) => void hold.addCommitment(event)}>
          <input
            disabled={hold.commitmentsLoading || hold.commitmentsSaving || Boolean(hold.commitmentsError)}
            value={hold.draft}
            onChange={(event) => hold.setDraft(event.target.value)}
            aria-label="Commitment"
            placeholder="Write one clear outcome"
            maxLength={120}
          />
          <label className="field">
            <span>Deadline (optional)</span>
            <input
              type="datetime-local"
              value={hold.deadlineDraft}
              onChange={(event) => hold.setDeadlineDraft(event.target.value)}
              disabled={hold.commitmentsLoading || hold.commitmentsSaving || Boolean(hold.commitmentsError)}
            />
          </label>
          <button type="submit" className="primary compact add-btn" disabled={hold.commitmentsLoading || hold.commitmentsSaving || Boolean(hold.commitmentsError) || !hold.draft.trim()}>
            Add
          </button>
        </form>

      <div className="history-block">
        <p className="eyebrow">Recent honesty</p>
        {hold.checkIns.length === 0 ? (
          <p className="empty">No check-ins yet.</p>
        ) : (
          <ul className="history">
            {hold.checkIns.slice(0, 6).map((item) => (
              <li key={item.id}>
                <span className={`tag ${item.status}`}>{statusLabel(item.status)}</span>
                <span>
                  {new Date(item.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  {item.note ? ` · ${item.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
