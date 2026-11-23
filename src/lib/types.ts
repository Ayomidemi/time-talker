export type Cadence = "off" | "half" | "quarter";
export type Intensity = "gentle" | "annoying";
export type CheckInStatus = "on_track" | "slacking" | "break";

export type Settings = {
  cadence: Cadence;
  intensity: Intensity;
  includePeriod: boolean;
  enabled: boolean;
};

export type Commitment = {
  id: string;
  title: string;
  done: boolean;
  day: string;
  dueAt: string | null;
  createdAt: string;
};

export type CheckIn = {
  id: string;
  slot: string;
  status: CheckInStatus;
  note: string | null;
  createdAt: string;
};

export const DEFAULT_SETTINGS: Settings = {
  cadence: "half",
  intensity: "gentle",
  includePeriod: true,
  enabled: true,
};
