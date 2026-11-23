"use client";

import { Dock } from "@/components/dock";
import { HoldProvider } from "@/components/hold-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <HoldProvider>
      <div className="app">
        {children}
        <Dock />
      </div>
    </HoldProvider>
  );
}
