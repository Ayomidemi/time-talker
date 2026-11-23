"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearProfile, loadProfile, saveProfile, type Profile } from "@/lib/storage";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { stopSpeech } from "@/lib/speech";

const emptyProfile: Profile = { name: "", email: "", welcomeSeen: false, emailPending: false };

export default function ConfirmPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
    if (new URLSearchParams(window.location.search).get("auth") === "error") {
      setMessage("That link didn’t work. Request a new one.");
    }
  }, []);

  async function checkConfirmed() {
    if (!isSupabaseConfigured()) return;
    setLoading(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (data.user?.email) {
        const name =
          (typeof data.user.user_metadata?.name === "string" && data.user.user_metadata.name) ||
          profile.name;
        saveProfile({
          name,
          email: data.user.email,
          welcomeSeen: true,
          emailPending: false,
        });
        router.push("/");
        router.refresh();
        return;
      }
      setMessage("Email not confirmed yet. Open the link we sent, then try again.");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (!profile.email || !isSupabaseConfigured()) return;
    setLoading(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: profile.email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: { name: profile.name },
        },
      });
      setMessage(error ? error.message : "Link sent again. Check your email.");
    } finally {
      setLoading(false);
    }
  }

  async function useDifferentAccount() {
    stopSpeech();
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    clearProfile();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="welcome">
      <p className="brand">Hold</p>
      <h1 className="lede">Confirm your email</h1>
      <p className="sub">
        We sent a link to <strong>{profile.email || "your email"}</strong>. Confirm it before continuing.
      </p>
      {message ? <p className="empty">{message}</p> : null}
      <div className="welcome-form">
        <button type="button" className="primary welcome-submit" onClick={() => void checkConfirmed()} disabled={loading}>
          {loading ? "Checking…" : "I’ve confirmed"}
        </button>
        <button type="button" className="ghost-btn" onClick={() => void resend()} disabled={loading}>
          Resend link
        </button>
        <button type="button" className="text-link" onClick={() => void useDifferentAccount()}>
          Use a different account
        </button>
      </div>
    </div>
  );
}
