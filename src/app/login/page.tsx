"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { enterAccount } from "@/lib/account-client";
import { saveProfile } from "@/lib/storage";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "name">("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const nextEmail = email.trim().toLowerCase();
    if (step === "email" && !nextEmail) {
      setError(null);
      setStep("name");
      return;
    }
    if (step === "name" && !name.trim()) {
      setError("Name is required.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await enterAccount({
        email: nextEmail,
        ...(step === "name" ? { name: name.trim() } : {}),
      });
      if (result.needsName) {
        setStep("name");
        return;
      }
      saveProfile({
        name: result.name,
        email: result.email,
        welcomeSeen: true,
        emailPending: false,
      });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t continue just now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="welcome">
      <p className="brand">Hold</p>
      <h1 className="lede">{step === "email" ? "Welcome to Hold" : "What should we call you?"}</h1>
      <p className="sub">
        {step === "email"
          ? "Enter your email to find your account, or skip to get started."
          : email.trim()
            ? "Add your name to create your account."
            : ""}
      </p>
      <form className="welcome-form" onSubmit={(event) => void onSubmit(event)}>
        {step === "email" ? (
          <label className="field" key="email">
            <span>Email (optional)</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              maxLength={254}
              autoFocus
              disabled={loading}
            />
          </label>
        ) : (
          <label className="field" key="name">
            <span>Name</span>
            <input
              autoComplete="given-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              maxLength={40}
              required
              autoFocus
              disabled={loading}
            />
          </label>
        )}
        {error ? <p className="error" role="alert">{error}</p> : null}
        <button type="submit" className="primary welcome-submit" disabled={loading || (step === "name" && !name.trim())}>
          {loading ? "Loading…" : "Continue"}
        </button>
        {step === "email" ? (
          <button type="button" className="text-link" disabled={loading} onClick={() => {
            setEmail("");
            setError(null);
            setStep("name");
          }}>
            Skip for now
          </button>
        ) : (
          <button type="button" className="text-link" disabled={loading} onClick={() => {
            setError(null);
            setStep("email");
          }}>
            Back
          </button>
        )}
      </form>
    </div>
  );
}
