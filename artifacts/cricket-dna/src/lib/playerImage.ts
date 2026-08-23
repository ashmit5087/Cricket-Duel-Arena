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

/**
 * Returns the ESPN Cricinfo headshot URL for a given player ID.
 * If cricInfoId is empty/undefined, returns null — component should show initials.
 */
export function getPlayerImageUrl(cricInfoId: string | undefined, size: ImageSize = '200'): string | null {
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
