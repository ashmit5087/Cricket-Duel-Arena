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
//
// espnId is the matching ESPN Cricinfo ID — used for the ML service
// (cluster, knn, similarity). The ML pipeline's player_index is keyed
// on ESPN IDs, not Cricbuzz IDs, so this field is required for any
// ML-backed endpoint to resolve. Players without an ESPN mapping will
// fall back to mock DNA scores.
type RosterEntry = Pick<NormalisedPlayer,
  "internalId" | "cricbuzzPlayerId" | "name" | "country" | "flag" | "role" | "archetypeId" | "archetypeName"
> & { espnId: string | null };

export const PLAYER_ROSTER: RosterEntry[] = [
  { internalId:"virat-kohli",          cricbuzzPlayerId:"1413",    espnId:"253802", name:"Virat Kohli",           country:"India",        flag:"🇮🇳", role:"Batter",        archetypeId:"A", archetypeName:"The Pressure Architect"    },
  { internalId:"rohit-sharma",         cricbuzzPlayerId:"576",     espnId:"34102",  name:"Rohit Sharma",          country:"India",        flag:"🇮🇳", role:"Batter",        archetypeId:"G", archetypeName:"The Powerplay Destroyer"   },
  { internalId:"jasprit-bumrah",       cricbuzzPlayerId:"9311",    espnId:"625371", name:"Jasprit Bumrah",        country:"India",        flag:"🇮🇳", role:"Bowler",        archetypeId:"B", archetypeName:"The Precision Missile"     },
  { internalId:"ms-dhoni",             cricbuzzPlayerId:"265",     espnId:"28081",  name:"MS Dhoni",              country:"India",        flag:"🇮🇳", role:"Wicket-Keeper", archetypeId:"H", archetypeName:"The DBSCAN Wildcard"       },
  { internalId:"sachin-tendulkar",     cricbuzzPlayerId:"25",      espnId:"35320",  name:"Sachin Tendulkar",      country:"India",        flag:"🇮🇳", role:"Batter",        archetypeId:"A", archetypeName:"The Pressure Architect"    },
  { internalId:"rahul-dravid",         cricbuzzPlayerId:"27",      espnId:"28114",  name:"Rahul Dravid",          country:"India",        flag:"🇮🇳", role:"Batter",        archetypeId:"D", archetypeName:"The Build-Up Orchestrator" },
  { internalId:"anil-kumble",          cricbuzzPlayerId:"98",      espnId:"30176",  name:"Anil Kumble",           country:"India",        flag:"🇮🇳", role:"Bowler",        archetypeId:"E", archetypeName:"The Spin Wizard"           },
  { internalId:"joe-root",             cricbuzzPlayerId:"8019",    espnId:"303669", name:"Joe Root",              country:"England",      flag:"🏴", role:"Batter",        archetypeId:"A", archetypeName:"The Pressure Architect"    },
  { internalId:"kane-williamson",      cricbuzzPlayerId:"6326",    espnId:"277906", name:"Kane Williamson",       country:"New Zealand",  flag:"🇳🇿", role:"Batter",        archetypeId:"A", archetypeName:"The Pressure Architect"    },
  { internalId:"babar-azam",           cricbuzzPlayerId:"8359",    espnId:"348144", name:"Babar Azam",            country:"Pakistan",     flag:"🇵🇰", role:"Batter",        archetypeId:"A", archetypeName:"The Pressure Architect"    },
  { internalId:"ab-de-villiers",       cricbuzzPlayerId:"370",     espnId:"44936",  name:"AB de Villiers",        country:"South Africa", flag:"🇿🇦", role:"Batter",        archetypeId:"C", archetypeName:"The Chaos Agent"           },
  { internalId:"david-warner",         cricbuzzPlayerId:"1739",    espnId:"219889", name:"David Warner",          country:"Australia",    flag:"🇦🇺", role:"Batter",        archetypeId:"G", archetypeName:"The Powerplay Destroyer"   },
  { internalId:"ricky-ponting",        cricbuzzPlayerId:"38",      espnId:"7133",   name:"Ricky Ponting",         country:"Australia",    flag:"🇦🇺", role:"Batter",        archetypeId:"A", archetypeName:"The Pressure Architect"    },
  { internalId:"pat-cummins",          cricbuzzPlayerId:"8095",    espnId:"324418", name:"Pat Cummins",           country:"Australia",    flag:"🇦🇺", role:"Bowler",        archetypeId:"B", archetypeName:"The Precision Missile"     },
  { internalId:"mitchell-starc",       cricbuzzPlayerId:"7710",    espnId:"311631", name:"Mitchell Starc",        country:"Australia",    flag:"🇦🇺", role:"Bowler",        archetypeId:"B", archetypeName:"The Precision Missile"     },
  { internalId:"ben-stokes",           cricbuzzPlayerId:"6557",    espnId:"311158", name:"Ben Stokes",            country:"England",      flag:"🏴", role:"All-Rounder",   archetypeId:"F", archetypeName:"The Dual-Threat Engine"    },
  { internalId:"lasith-malinga",       cricbuzzPlayerId:"111",     espnId:"49536",  name:"Lasith Malinga",        country:"Sri Lanka",    flag:"🇱🇰", role:"Bowler",        archetypeId:"B", archetypeName:"The Precision Missile"     },
  { internalId:"kumar-sangakkara",     cricbuzzPlayerId:"104",     espnId:"50710",  name:"Kumar Sangakkara",      country:"Sri Lanka",    flag:"🇱🇰", role:"Wicket-Keeper", archetypeId:"D", archetypeName:"The Build-Up Orchestrator" },
  { internalId:"shane-warne",          cricbuzzPlayerId:"135",     espnId:"13552",  name:"Shane Warne",           country:"Australia",    flag:"🇦🇺", role:"Bowler",        archetypeId:"E", archetypeName:"The Spin Wizard"           },
  { internalId:"brian-lara",           cricbuzzPlayerId:"240",     espnId:"52337",  name:"Brian Lara",            country:"West Indies",  flag:"🇹🇹", role:"Batter",        archetypeId:"C", archetypeName:"The Chaos Agent"           },
  { internalId:"chris-gayle",          cricbuzzPlayerId:"247",     espnId:"51880",  name:"Chris Gayle",           country:"West Indies",  flag:"🇯🇲", role:"Batter",        archetypeId:"G", archetypeName:"The Powerplay Destroyer"   },
  { internalId:"ravichandran-ashwin",  cricbuzzPlayerId:"1593",    espnId:"49428",  name:"R. Ashwin",             country:"India",        flag:"🇮🇳", role:"Bowler",        archetypeId:"E", archetypeName:"The Spin Wizard"           },
  { internalId:"ravindra-jadeja",      cricbuzzPlayerId:"587",     espnId:"234675", name:"Ravindra Jadeja",       country:"India",        flag:"🇮🇳", role:"All-Rounder",   archetypeId:"F", archetypeName:"The Dual-Threat Engine"    },
  { internalId:"rishabh-pant",         cricbuzzPlayerId:"10744",   espnId:"931581", name:"Rishabh Pant",          country:"India",        flag:"🇮🇳", role:"Wicket-Keeper", archetypeId:"C", archetypeName:"The Chaos Agent"           },
  { internalId:"shubman-gill",         cricbuzzPlayerId:"11808",   espnId:"1125619",name:"Shubman Gill",          country:"India",        flag:"🇮🇳", role:"Batter",        archetypeId:"D", archetypeName:"The Build-Up Orchestrator" },
  { internalId:"haris-rauf",           cricbuzzPlayerId:"14561",   espnId:"1175515",name:"Haris Rauf",            country:"Pakistan",     flag:"🇵🇰", role:"Bowler",        archetypeId:"B", archetypeName:"The Precision Missile"     },
  { internalId:"naseem-shah",          cricbuzzPlayerId:"14247",   espnId:"1233557",name:"Naseem Shah",           country:"Pakistan",     flag:"🇵🇰", role:"Bowler",        archetypeId:"B", archetypeName:"The Precision Missile"     },
  { internalId:"glen-maxwell",         cricbuzzPlayerId:"7662",    espnId:"420889", name:"Glenn Maxwell",         country:"Australia",    flag:"🇦🇺", role:"All-Rounder",   archetypeId:"C", archetypeName:"The Chaos Agent"           },
  { internalId:"surya-kumar-yadav",    cricbuzzPlayerId:"7915",    espnId:null,     name:"Suryakumar Yadav",      country:"India",        flag:"🇮🇳", role:"Batter",        archetypeId:"C", archetypeName:"The Chaos Agent"           },
  { internalId:"travis-head",          cricbuzzPlayerId:"8497",    espnId:null,     name:"Travis Head",           country:"Australia",    flag:"🇦🇺", role:"Batter",        archetypeId:"G", archetypeName:"The Powerplay Destroyer"   },
];
