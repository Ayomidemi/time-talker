import type { CheckInStatus, Commitment, Intensity } from "./types";

export function checkInPrompt(commitments: Commitment[], intensity: Intensity) {
  const open = commitments.filter((item) => !item.done);
  const focus = open[0]?.title;

  if (intensity === "annoying") {
    if (focus) {
      return `Check in now. Are you still holding ${focus}? Tap on track, slacking, or break.`;
    }
    return "Check in now. Are you on track, slacking, or on a break?";
  }

  if (focus) {
    return `Quick check. Still on ${focus}?`;
  }
  return "Quick check. How are you holding?";
}

export function statusLabel(status: CheckInStatus) {
  if (status === "on_track") return "On track";
  if (status === "slacking") return "Slacking";
  return "Break";
}
