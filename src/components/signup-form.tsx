"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { saveProfile } from "@/lib/storage";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email")?.trim().toLowerCase() ?? "";
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const nextName = name.trim();
    if (!email) {
      router.push("/login");
      return;
    }
    if (!nextName) {
      setError("Name is required.");
      return;
    }
    if (!isSupabaseConfigured()) {
      setError("Supabase is not configured.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      saveProfile({ name: nextName, email, welcomeSeen: true, emailPending: true });
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: { name: nextName },
        },
      });
      if (authError) {
        setError(authError.message);
        return;
      }
      router.push("/confirm");
      router.refresh();
    } catch {
      setError("Couldn’t create that account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="welcome">
      <p className="brand">Hold</p>
      <h1 className="lede">What should we call you?</h1>
      <p className="sub">This email is new. Add your name to create the account.</p>
      <form className="welcome-form" onSubmit={(event) => void onSubmit(event)}>
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} disabled />
        </label>
        <label className="field">
          <span>Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            maxLength={40}
            required
            autoFocus
            disabled={loading}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" className="primary welcome-submit" disabled={loading || !name.trim()}>
          {loading ? "Loading…" : "Create account"}
        </button>
      </form>
    </div>
  );
}
