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

      <ul className="commitment-list">
        {hold.commitments.map((item) => (
          <li key={item.id} className={item.done ? "done" : ""}>
            <button type="button" className="check" onClick={() => hold.toggleDone(item.id)} aria-label="Toggle done">
              <span />
            </button>
            <span className="title">{item.title}</span>
            <button type="button" className="ghost" onClick={() => hold.removeCommitment(item.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>

      {hold.commitments.length === 0 ? <p className="empty">No commitments yet. Add up to three.</p> : null}

      {hold.commitments.length < 3 ? (
        <form className="inline-form" onSubmit={hold.addCommitment}>
          <input
            value={hold.draft}
            onChange={(event) => hold.setDraft(event.target.value)}
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
