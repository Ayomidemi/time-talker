"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { saveProfile } from "@/lib/storage";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const nextEmail = email.trim().toLowerCase();
    if (!nextEmail.includes("@")) {
      setError("Enter a valid email.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: nextEmail }),
      });
      const body = (await response.json()) as {
        exists?: boolean;
        name?: string;
        confirmed?: boolean;
        error?: string;
      };
      if (!response.ok) {
        setError(body.error || "Couldn’t check that email.");
        return;
      }

      if (body.exists) {
        const known = Boolean(body.confirmed);
        saveProfile({
          name: body.name?.trim() || nextEmail.split("@")[0],
          email: nextEmail,
          welcomeSeen: true,
          emailPending: !known,
        });
        router.push(known ? "/" : "/confirm");
        router.refresh();
        return;
      }

      router.push(`/signup?email=${encodeURIComponent(nextEmail)}`);
    } catch {
      setError("Couldn’t check that email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="welcome">
      <p className="brand">Hold</p>
      <h1 className="lede">What’s your email?</h1>
      <form className="welcome-form" onSubmit={(event) => void onSubmit(event)}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@email.com"
            maxLength={120}
            required
            autoFocus
            disabled={loading}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" className="primary welcome-submit" disabled={loading || !email.trim()}>
          {loading ? "Loading…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
