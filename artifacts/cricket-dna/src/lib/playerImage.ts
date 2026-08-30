// ─── Player Image Utility ───────────────────────────────────────────────────
// Builds ESPN Cricinfo headshot URLs. Falls back to Wikipedia, then initials.
//
// USAGE:
//   import { getPlayerImageUrl, getInitials, ARCHETYPE_COLORS } from '@/lib/playerImage'
//
// URL PATTERN:
//   https://img1.hscicdn.com/image/upload/f_auto,t_h_{size}_2x/lsci/db/PICTURES/CMS/{cricInfoId}/bound.png
//
// SIZES available: 100, 200, 340 (use 200 for cards, 340 for hero)
// ────────────────────────────────────────────────────────────────────────────

export type ImageSize = '100' | '200' | '340';

const FALLBACK_IMAGES: Record<string, string> = {
  "virat-kohli": "https://upload.wikimedia.org/wikipedia/commons/7/7e/Virat_Kohli.jpg",
  "rohit-sharma": "https://upload.wikimedia.org/wikipedia/commons/f/f7/Rohit_Sharma_November_2016_%28cropped%29.jpg",
  "jasprit-bumrah": "https://upload.wikimedia.org/wikipedia/commons/5/52/Jasprit_Bumrah_in_PMO_New_Delhi.jpg",
  "ms-dhoni": "https://upload.wikimedia.org/wikipedia/commons/7/70/Mahendra_Singh_Dhoni_January_2016_%28cropped%29.jpg",
  "sachin-tendulkar": "https://upload.wikimedia.org/wikipedia/commons/2/25/Sachin_Tendulkar_at_MRF_Pace_Foundation_16_%28cropped%29.jpg",
  "rahul-dravid": "https://upload.wikimedia.org/wikipedia/commons/a/ab/Rahul_Dravid_at_an_event_2023_%28cropped%29.jpg",
  "anil-kumble": "https://upload.wikimedia.org/wikipedia/commons/a/af/Anil_Kumble_in_2016.jpg",
  "joe-root": "https://upload.wikimedia.org/wikipedia/commons/8/87/Joe_Root_%284%29_%28cropped%29.jpg",
  "kane-williamson": "https://upload.wikimedia.org/wikipedia/commons/5/52/Kane_Williamson_in_2019_%28cropped%29.jpg",
  "babar-azam": "https://upload.wikimedia.org/wikipedia/commons/5/50/Babar_Azam_in_2023.jpg",
  "ab-de-villiers": "https://upload.wikimedia.org/wikipedia/commons/5/55/AB_de_Villiers.jpg",
  "david-warner": "https://upload.wikimedia.org/wikipedia/commons/0/03/David_Warner_-_The_Ashes_%282023%29.jpg",
  "ricky-ponting": "https://upload.wikimedia.org/wikipedia/commons/4/4c/Ricky_Ponting_in_2009.jpg",
  "glenn-mcgrath": "https://upload.wikimedia.org/wikipedia/commons/0/07/Glenn_McGrath_in_2013_%28cropped%29.jpg",
  "shane-warne": "https://upload.wikimedia.org/wikipedia/commons/f/fb/Shane_Warne_2016_%28cropped%29.jpg",
  "adam-gilchrist": "https://upload.wikimedia.org/wikipedia/commons/7/73/Adam_Gilchrist_in_2008.jpg",
  "joe-anderson": "https://upload.wikimedia.org/wikipedia/commons/7/7a/James_Anderson_-_England_%281%29_%28cropped%29.jpg",
  "ben-stokes": "https://upload.wikimedia.org/wikipedia/commons/5/59/Ben_Stokes_2022.jpg",
  "kumar-sangakkara": "https://upload.wikimedia.org/wikipedia/commons/5/50/Kumar_Sangakkara_in_2012_%28cropped%29.jpg",
  "muttiah-muralitharan": "https://upload.wikimedia.org/wikipedia/commons/c/c5/Muttiah_Muralitharan_in_2010.jpg",
  "lasith-malinga": "https://upload.wikimedia.org/wikipedia/commons/9/90/Lasith_Malinga_in_2016.jpg",
  "brian-lara": "https://upload.wikimedia.org/wikipedia/commons/b/bc/Brian_Lara_in_2010.jpg",
  "chris-gayle": "https://upload.wikimedia.org/wikipedia/commons/6/6f/Chris_Gayle_%28cropped%29.jpg",
  "pat-cummins": "https://upload.wikimedia.org/wikipedia/commons/b/b3/Pat_Cummins_in_2023.jpg",
  "mitchell-starc": "https://upload.wikimedia.org/wikipedia/commons/6/69/Mitchell_Starc_2015.jpg",
  "jacques-kallis": "https://upload.wikimedia.org/wikipedia/commons/4/4e/Jacques_Kallis_%284%29_%28cropped%29.jpg",
  "rohit-sharma-2": "https://upload.wikimedia.org/wikipedia/commons/c/c5/Sourav_Ganguly.jpg",
  "virender-sehwag": "https://upload.wikimedia.org/wikipedia/commons/5/5b/Virender_Sehwag_at_an_event_in_2016.jpg",
  "harbhajan-singh": "https://upload.wikimedia.org/wikipedia/commons/1/14/Harbhajan_Singh.jpg",
};

/**
 * Returns the ESPN Cricinfo headshot URL for a given player ID, 
 * or a Wikipedia fallback image.
 * If cricInfoId is empty/undefined, returns null — component should show initials.
 */
export function getPlayerImageUrl(cricInfoId: string | undefined, size: ImageSize = '200', playerId?: string): string | null {
  if (playerId && FALLBACK_IMAGES[playerId]) {
    return FALLBACK_IMAGES[playerId];
  }
  if (!cricInfoId) return null;
  return `https://img1.hscicdn.com/image/upload/f_auto,t_h_${size}_2x/lsci/db/PICTURES/CMS/${cricInfoId}/bound.png`;
}

/**
 * Extracts initials from a player name for the fallback avatar.
 * "Virat Kohli"       → "VK"
 * "AB de Villiers"    → "AV"
 * "R. Ashwin"         → "RA"
 * "Muttiah Muralitharan" → "MM"
 */
export function getInitials(name: string): string {
  const parts = name
    .replace(/\./g, ' ')   // expand "R." → "R "
    .split(' ')
    .filter(Boolean);

  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  // Take first letter of first word + first letter of last word
  const first = parts[0][0];
  const last = parts[parts.length - 1][0];
  return `${first}${last}`.toUpperCase();
}

/**
 * Background + text color pairs for the initials avatar,
 * keyed by archetypeId so each cluster has a consistent colour.
 */
export const ARCHETYPE_AVATAR_COLORS: Record<string, { bg: string; text: string }> = {
  A: { bg: '#3b0a0a', text: '#c0392b' },  // red — Pressure Architect
  B: { bg: '#0a1a2e', text: '#185fa5' },  // blue — Precision Missile
  C: { bg: '#2e2000', text: '#d4a500' },  // gold — Chaos Agent
  D: { bg: '#011a13', text: '#0f6e56' },  // green — Build-Up Orchestrator
  E: { bg: '#1a0a2e', text: '#8b5cf6' },  // purple — Spin Wizard
  F: { bg: '#2e1000', text: '#f97316' },  // orange — Dual-Threat Engine
  G: { bg: '#2e0018', text: '#ec4899' },  // pink — Powerplay Destroyer
  H: { bg: '#1a1a1a', text: '#6b7280' },  // gray — DBSCAN Wildcard
};
