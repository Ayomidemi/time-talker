import { lastBoundary } from "./time";
import type { Cadence } from "./types";

// Track boundary crossings rather than requiring the timer to run in a short window.
export class AnnouncementSchedule {
  private cadence: Cadence = "off";
  private boundary: number | null = null;
  private pending: number | null = null;
  private busy = false;
  private retryAt = 0;

  due(now: Date, cadence: Cadence): Date | null {
    if (cadence === "off") {
      this.cadence = cadence;
      this.boundary = this.pending = null;
      return null;
    }
    const boundary = lastBoundary(now, cadence)!.getTime();
    if (this.cadence !== cadence || this.boundary === null) {
      this.cadence = cadence;
      this.boundary = boundary;
      this.pending = now.getTime() - boundary < 45_000 ? boundary : null;
      this.retryAt = 0;
    } else if (boundary !== this.boundary) {
      this.boundary = boundary;
      this.pending = boundary;
      this.retryAt = 0;
    }
    if (this.busy || this.pending === null || now.getTime() < this.retryAt) return null;
    this.busy = true;
    return new Date(this.pending);
  }

  settled(boundary: Date, succeeded: boolean, now: number) {
    this.busy = false;
    if (this.pending !== boundary.getTime()) return;
    if (succeeded) this.pending = null;
    else this.retryAt = now + 15_000;
  }
}
