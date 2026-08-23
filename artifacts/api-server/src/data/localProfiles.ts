export interface CareerStats {
  matches: number;
  runs: number;
  avg: number;
  sr: number;
  hundreds: number;
  fifties: number;
  hs: number;
  wickets?: number;
  economy?: number;
}

export interface LocalPlayerProfile {
  cricInfoId: string;
  name: string;
  country: string;
  role: string;
  age: number;
  testStats: CareerStats;
  odiStats: CareerStats;
  t20Stats: CareerStats;
  iplStats: { matches: number; runs: number; avg: number; sr: number; sixes: number; fours: number };
  recentForm: { match: string; score: number; date: string }[];
}

export const LOCAL_PLAYER_PROFILES: Record<string, LocalPlayerProfile> = {
  "253802": {
    cricInfoId: "253802",
    name: "Virat Kohli",
    country: "India",
    role: "Batter",
    age: 37,
    testStats: { matches: 123, runs: 9230, avg: 46.85, sr: 55.58, hundreds: 30, fifties: 31, hs: 254 },
    odiStats: { matches: 311, runs: 14797, avg: 58.72, sr: 93.83, hundreds: 54, fifties: 77, hs: 183 },
    t20Stats: { matches: 125, runs: 4188, avg: 48.7, sr: 137.05, hundreds: 1, fifties: 38, hs: 122 },
    iplStats: { matches: 282, runs: 9261, avg: 40.09, sr: 134.53, sixes: 313, fours: 835 },
    recentForm: [],
  },
  "34102": {
    cricInfoId: "34102",
    name: "Rohit Sharma",
    country: "India",
    role: "Batter",
    age: 0,
    testStats: { matches: 67, runs: 4301, avg: 40.58, sr: 57.25, hundreds: 12, fifties: 19, hs: 212 },
    odiStats: { matches: 264, runs: 10709, avg: 48.68, sr: 89.18, hundreds: 31, fifties: 59, hs: 264 },
    t20Stats: { matches: 159, runs: 4231, avg: 32.05, sr: 139.08, hundreds: 5, fifties: 26, hs: 118 },
    iplStats: { matches: 257, runs: 6628, avg: 30.27, sr: 130.73, sixes: 247, fours: 654 },
    recentForm: [],
  },
};

export const KOHLI_CAREER = [
  { year: 2008, test: null, odi: 31.8, t20: 28.5 },
  { year: 2009, test: null, odi: 43.2, t20: 38.0 },
  { year: 2010, test: null, odi: 47.3, t20: 31.0 },
  { year: 2011, test: 44.1, odi: 61.8, t20: 44.5 },
  { year: 2012, test: 47.5, odi: 68.4, t20: 39.2 },
  { year: 2013, test: 52.3, odi: 72.1, t20: 52.0 },
  { year: 2014, test: 44.5, odi: 58.5, t20: 52.6 },
  { year: 2015, test: 58.3, odi: 68.2, t20: 60.5 },
  { year: 2016, test: 65.5, odi: 92.3, t20: 106.8 },
  { year: 2017, test: 75.2, odi: 80.5, t20: 70.4 },
  { year: 2018, test: 55.0, odi: 133.5, t20: 68.2 },
  { year: 2019, test: 64.6, odi: 73.2, t20: 65.8 },
  { year: 2020, test: 53.6, odi: 47.8, t20: 36.4 },
  { year: 2021, test: 28.9, odi: 30.2, t20: 32.5 },
  { year: 2022, test: 26.5, odi: 27.4, t20: 55.7 },
  { year: 2023, test: 55.6, odi: 72.4, t20: 58.9 },
  { year: 2024, test: 46.2, odi: 68.0, t20: null },
];
