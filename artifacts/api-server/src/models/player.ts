// src/models/player.ts
// ─────────────────────────────────────────────────────────────────────────────
// Internal normalised player model.
// ALL frontend pages use this shape — never raw Cricbuzz responses.
// ─────────────────────────────────────────────────────────────────────────────

export interface CareerStats {
  matches:  number;
  innings:  number;
  runs:     number;
  avg:      number;
  sr:       number;
  hundreds: number;
  fifties:  number;
  highest:  string;
  wickets:  number;
  economy:  number;
  bestBowl: string;
}

export interface MomentumMetrics {
  score:        number;   // 0-100
  trend:        "rising" | "falling" | "stable";
  phase:        string;   // powerplay | middle | death
  hotStreak:    boolean;
  clutchScore:  number;   // 0-100 performance under pressure
}

export interface AuraMetrics {
  label:  string;   // "Ice Cold" | "Inferno Mode" | "Chase Beast" | "Death God" etc.
  score:  number;   // 0-100
  color:  string;   // hex color for UI
  reason: string;   // what caused current aura
}

export interface BattleMetrics {
  eloRating:     number;
  wins:          number;
  losses:        number;
  winRate:       number;
  currentStreak: number;
  streakType:    "win" | "loss" | "none";
}

export interface RivalryData {
  opponentId:    string;
  opponentName:  string;
  battlesTotal:  number;
  playerWins:    number;
  dominance:     number;   // 0-100
  heatScore:     number;   // 0-100
}

export interface NormalisedPlayer {
  // ── Identity
  internalId:       string;          // "virat-kohli"
  cricbuzzPlayerId: string;          // "253802" (Cricbuzz ID)
  name:             string;
  fullName?:        string;
  country:          string;
  flag:             string;
  role:             string;          // Batter | Bowler | All-Rounder | Wicket-Keeper
  battingStyle?:    string;
  bowlingStyle?:    string;

  // ── Archetype (from ML pipeline)
  archetypeId:   string;            // A-H
  archetypeName: string;

  // ── Career stats (from Cricbuzz)
  testStats: CareerStats;
  odiStats:  CareerStats;
  t20Stats:  CareerStats;
  iplStats:  CareerStats;

  // ── ML-computed metrics
  dnaScore:       number;           // 0-100 overall DNA rating
  radarValues:    number[];         // 8-dim vector for radar chart
  momentum:       MomentumMetrics;
  aura:           AuraMetrics;
  battle:         BattleMetrics;
  topRivalries:   RivalryData[];

  // ── Image
  imageUrl: string;                 // Cricbuzz CDN image URL

  // ── Timestamps
  lastSynced: string;               // ISO timestamp
}

// ── Empty/default factories ────────────────────────────────────────────────────

export function emptyCareerStats(): CareerStats {
  return { matches:0, innings:0, runs:0, avg:0, sr:0, hundreds:0, fifties:0, highest:"0", wickets:0, economy:0, bestBowl:"-" };
}

export function defaultMomentum(): MomentumMetrics {
  return { score:50, trend:"stable", phase:"middle", hotStreak:false, clutchScore:50 };
}

export function defaultAura(): AuraMetrics {
  return { label:"Rising", score:50, color:"#888888", reason:"Awaiting live data" };
}

export function defaultBattle(): BattleMetrics {
  return { eloRating:1500, wins:0, losses:0, winRate:0, currentStreak:0, streakType:"none" };
}

// ── Aura label config ─────────────────────────────────────────────────────────

export const AURA_LABELS: Record<string, { color: string; minScore: number }> = {
  "Death God":    { color: "#c0392b", minScore: 90 },
  "Inferno Mode": { color: "#e74c3c", minScore: 80 },
  "Chase Beast":  { color: "#d4a500", minScore: 70 },
  "Ice Cold":     { color: "#185fa5", minScore: 65 },
  "In The Zone":  { color: "#0f6e56", minScore: 55 },
  "Rising":       { color: "#8b5cf6", minScore: 40 },
  "Under Pressure":{ color: "#f97316", minScore: 25 },
  "Cold Streak":  { color: "#6b7280", minScore: 0  },
};

export function computeAuraLabel(score: number): AuraMetrics["label"] {
  for (const [label, cfg] of Object.entries(AURA_LABELS)) {
    if (score >= cfg.minScore) return label;
  }
  return "Cold Streak";
}

// ── Cricbuzz image URL ────────────────────────────────────────────────────────

export function getCricbuzzImageUrl(cricbuzzPlayerId: string): string {
  return `https://www.cricbuzz.com/a/img/v1/152x152/i1/c${cricbuzzPlayerId}/i.jpg`;
}

// ── Static player roster (Cricbuzz IDs mapped) ────────────────────────────────
// cricbuzz player IDs differ from ESPN — this is the correct mapping

// IDs verified against Cricbuzz's public mobile API on 2026-08-27
// (the IDs in the SPA HTML are a different numbering; these are the
// canonical Cricbuzz player IDs that the /m/stats/v1/player/{id} endpoints accept)
export const PLAYER_ROSTER: Pick<NormalisedPlayer,
  "internalId" | "cricbuzzPlayerId" | "name" | "country" | "flag" | "role" | "archetypeId" | "archetypeName"
>[] = [
  { internalId:"virat-kohli",          cricbuzzPlayerId:"1413",    name:"Virat Kohli",           country:"India",        flag:"🇮🇳", role:"Batter",        archetypeId:"A", archetypeName:"The Pressure Architect"    },
  { internalId:"rohit-sharma",         cricbuzzPlayerId:"576",     name:"Rohit Sharma",          country:"India",        flag:"🇮🇳", role:"Batter",        archetypeId:"G", archetypeName:"The Powerplay Destroyer"   },
  { internalId:"jasprit-bumrah",       cricbuzzPlayerId:"9311",    name:"Jasprit Bumrah",        country:"India",        flag:"🇮🇳", role:"Bowler",        archetypeId:"B", archetypeName:"The Precision Missile"     },
  { internalId:"ms-dhoni",             cricbuzzPlayerId:"265",     name:"MS Dhoni",              country:"India",        flag:"🇮🇳", role:"Wicket-Keeper", archetypeId:"H", archetypeName:"The DBSCAN Wildcard"       },
  { internalId:"sachin-tendulkar",     cricbuzzPlayerId:"25",      name:"Sachin Tendulkar",      country:"India",        flag:"🇮🇳", role:"Batter",        archetypeId:"A", archetypeName:"The Pressure Architect"    },
  { internalId:"rahul-dravid",         cricbuzzPlayerId:"27",      name:"Rahul Dravid",          country:"India",        flag:"🇮🇳", role:"Batter",        archetypeId:"D", archetypeName:"The Build-Up Orchestrator" },
  { internalId:"anil-kumble",          cricbuzzPlayerId:"98",      name:"Anil Kumble",           country:"India",        flag:"🇮🇳", role:"Bowler",        archetypeId:"E", archetypeName:"The Spin Wizard"           },
  { internalId:"joe-root",             cricbuzzPlayerId:"8019",    name:"Joe Root",              country:"England",      flag:"🏴", role:"Batter",        archetypeId:"A", archetypeName:"The Pressure Architect"    },
  { internalId:"kane-williamson",      cricbuzzPlayerId:"6326",    name:"Kane Williamson",       country:"New Zealand",  flag:"🇳🇿", role:"Batter",        archetypeId:"A", archetypeName:"The Pressure Architect"    },
  { internalId:"babar-azam",           cricbuzzPlayerId:"8359",    name:"Babar Azam",            country:"Pakistan",     flag:"🇵🇰", role:"Batter",        archetypeId:"A", archetypeName:"The Pressure Architect"    },
  { internalId:"ab-de-villiers",       cricbuzzPlayerId:"370",     name:"AB de Villiers",        country:"South Africa", flag:"🇿🇦", role:"Batter",        archetypeId:"C", archetypeName:"The Chaos Agent"           },
  { internalId:"david-warner",         cricbuzzPlayerId:"1739",    name:"David Warner",          country:"Australia",    flag:"🇦🇺", role:"Batter",        archetypeId:"G", archetypeName:"The Powerplay Destroyer"   },
  { internalId:"ricky-ponting",        cricbuzzPlayerId:"38",      name:"Ricky Ponting",         country:"Australia",    flag:"🇦🇺", role:"Batter",        archetypeId:"A", archetypeName:"The Pressure Architect"    },
  { internalId:"pat-cummins",          cricbuzzPlayerId:"8095",    name:"Pat Cummins",           country:"Australia",    flag:"🇦🇺", role:"Bowler",        archetypeId:"B", archetypeName:"The Precision Missile"     },
  { internalId:"mitchell-starc",       cricbuzzPlayerId:"7710",    name:"Mitchell Starc",        country:"Australia",    flag:"🇦🇺", role:"Bowler",        archetypeId:"B", archetypeName:"The Precision Missile"     },
  { internalId:"ben-stokes",           cricbuzzPlayerId:"6557",    name:"Ben Stokes",            country:"England",      flag:"🏴", role:"All-Rounder",   archetypeId:"F", archetypeName:"The Dual-Threat Engine"    },
  { internalId:"lasith-malinga",       cricbuzzPlayerId:"111",     name:"Lasith Malinga",        country:"Sri Lanka",    flag:"🇱🇰", role:"Bowler",        archetypeId:"B", archetypeName:"The Precision Missile"     },
  { internalId:"kumar-sangakkara",     cricbuzzPlayerId:"104",     name:"Kumar Sangakkara",      country:"Sri Lanka",    flag:"🇱🇰", role:"Wicket-Keeper", archetypeId:"D", archetypeName:"The Build-Up Orchestrator" },
  { internalId:"shane-warne",          cricbuzzPlayerId:"135",     name:"Shane Warne",           country:"Australia",    flag:"🇦🇺", role:"Bowler",        archetypeId:"E", archetypeName:"The Spin Wizard"           },
  { internalId:"brian-lara",           cricbuzzPlayerId:"240",     name:"Brian Lara",            country:"West Indies",  flag:"🇹🇹", role:"Batter",        archetypeId:"C", archetypeName:"The Chaos Agent"           },
  { internalId:"chris-gayle",          cricbuzzPlayerId:"247",     name:"Chris Gayle",           country:"West Indies",  flag:"🇯🇲", role:"Batter",        archetypeId:"G", archetypeName:"The Powerplay Destroyer"   },
  { internalId:"ravichandran-ashwin",  cricbuzzPlayerId:"1593",    name:"R. Ashwin",             country:"India",        flag:"🇮🇳", role:"Bowler",        archetypeId:"E", archetypeName:"The Spin Wizard"           },
  { internalId:"ravindra-jadeja",      cricbuzzPlayerId:"587",     name:"Ravindra Jadeja",       country:"India",        flag:"🇮🇳", role:"All-Rounder",   archetypeId:"F", archetypeName:"The Dual-Threat Engine"    },
  { internalId:"rishabh-pant",         cricbuzzPlayerId:"10744",   name:"Rishabh Pant",          country:"India",        flag:"🇮🇳", role:"Wicket-Keeper", archetypeId:"C", archetypeName:"The Chaos Agent"           },
  { internalId:"shubman-gill",         cricbuzzPlayerId:"11808",   name:"Shubman Gill",          country:"India",        flag:"🇮🇳", role:"Batter",        archetypeId:"D", archetypeName:"The Build-Up Orchestrator" },
  { internalId:"haris-rauf",           cricbuzzPlayerId:"14561",   name:"Haris Rauf",            country:"Pakistan",     flag:"🇵🇰", role:"Bowler",        archetypeId:"B", archetypeName:"The Precision Missile"     },
  { internalId:"naseem-shah",          cricbuzzPlayerId:"14247",   name:"Naseem Shah",           country:"Pakistan",     flag:"🇵🇰", role:"Bowler",        archetypeId:"B", archetypeName:"The Precision Missile"     },
  { internalId:"glen-maxwell",         cricbuzzPlayerId:"7662",    name:"Glenn Maxwell",         country:"Australia",    flag:"🇦🇺", role:"All-Rounder",   archetypeId:"C", archetypeName:"The Chaos Agent"           },
  { internalId:"surya-kumar-yadav",    cricbuzzPlayerId:"7915",    name:"Suryakumar Yadav",      country:"India",        flag:"🇮🇳", role:"Batter",        archetypeId:"C", archetypeName:"The Chaos Agent"           },
  { internalId:"travis-head",          cricbuzzPlayerId:"8497",    name:"Travis Head",           country:"Australia",    flag:"🇦🇺", role:"Batter",        archetypeId:"G", archetypeName:"The Powerplay Destroyer"   },
];
