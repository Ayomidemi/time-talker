import { Suspense } from "react";
import { HoldApp } from "@/components/hold-app";

export default function Home() {
  return (
    <main className="flex-1">
      <Suspense fallback={<div className="hold-shell">Loading Hold…</div>}>
        <HoldApp />
      </Suspense>
    </main>
  );
}
