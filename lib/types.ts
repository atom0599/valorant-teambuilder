export type Region = "kr" | "ap" | "na" | "eu" | "latam" | "br";

export interface Player {
  id: string;
  riotName: string; // "Name" part
  riotTag: string; // "Tag" part
  region: Region;
  status: "pending" | "ok" | "error";
  error?: string;
  peakTierValue: number | null; // numeric tier id, higher = better
  peakTierLabel: string | null; // e.g. "Immortal 3"
  currentTierLabel: string | null;
  team: 1 | 2 | null;
}

export interface MapInfo {
  id: string;
  name: string;
  defaultRotation: boolean;
}

export type VetoActionType = "ban" | "pick" | "decider";

export interface VetoStep {
  index: number;
  team: 1 | 2 | "auto";
  action: VetoActionType;
  sideChooser: 1 | 2 | null; // which team picks side for this map (null for ban)
  // filled in once resolved:
  mapId: string | null;
  side: "attack" | "defense" | null;
  resolved: boolean;
}

export interface VetoState {
  format: "bo3" | "bo5";
  pool: string[]; // map ids available at start (must be length 7)
  steps: VetoStep[];
  currentStep: number;
  finished: boolean;
}

export interface RoomState {
  id: string;
  createdAt: number;
  players: Player[];
  team1: string[]; // player ids
  team2: string[];
  balanced: boolean;
  captain1Claimed: boolean;
  captain2Claimed: boolean;
  captain1Token: string | null;
  captain2Token: string | null;
  veto: VetoState | null;
}
