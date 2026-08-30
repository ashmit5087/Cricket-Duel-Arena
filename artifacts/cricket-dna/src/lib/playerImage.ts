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
  "virat-kohli": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Virat_Kohli_during_the_India_vs_Aus_4th_Test_match_at_Narendra_Modi_Stadium_on_09_March_2023.jpg/500px-Virat_Kohli_during_the_India_vs_Aus_4th_Test_match_at_Narendra_Modi_Stadium_on_09_March_2023.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "rohit-sharma": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Prime_Minister_Of_Bharat_Shri_Narendra_Damodardas_Modi_with_Shri_Rohit_Gurunath_Sharma_%28Cropped%29.jpg/500px-Prime_Minister_Of_Bharat_Shri_Narendra_Damodardas_Modi_with_Shri_Rohit_Gurunath_Sharma_%28Cropped%29.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "jasprit-bumrah": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Jasprit_Bumrah_in_PMO_New_Delhi.jpg/500px-Jasprit_Bumrah_in_PMO_New_Delhi.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "sachin-tendulkar": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/The_cricket_legend_Sachin_Tendulkar_at_the_Oval_Maidan_in_Mumbai_During_the_Duke_and_Duchess_of_Cambridge_Visit%2826271019082%29.jpg/500px-The_cricket_legend_Sachin_Tendulkar_at_the_Oval_Maidan_in_Mumbai_During_the_Duke_and_Duchess_of_Cambridge_Visit%2826271019082%29.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "rahul-dravid": "https://upload.wikimedia.org/wikipedia/commons/1/17/Rahul_Dravid_in_2024.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail_unscaled",
  "anil-kumble": "https://upload.wikimedia.org/wikipedia/commons/d/de/Anil_Kumble_%281%29.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail_unscaled",
  "joe-root": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/2_05_Root_hundred.jpg/500px-2_05_Root_hundred.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "kane-williamson": "https://upload.wikimedia.org/wikipedia/commons/2/2a/Kane_Williamson_in_2019.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail_unscaled",
  "babar-azam": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Babar_azam_2023.jpg/500px-Babar_azam_2023.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "ms-dhoni": "https://upload.wikimedia.org/wikipedia/commons/7/70/Mahendra_Singh_Dhoni_January_2016_%28cropped%29.jpg"
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
