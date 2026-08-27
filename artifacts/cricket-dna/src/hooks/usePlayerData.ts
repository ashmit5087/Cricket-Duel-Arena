// src/hooks/usePlayerData.ts
// ─────────────────────────────────────────────────────────────────────────────
// React Query hooks for every data shape in the app.
//
// MIGRATION STRATEGY — zero flicker:
//   Every hook accepts optional `placeholder` data from mockData.ts.
//   The component renders instantly with mock data, then React Query
//   silently replaces it with live data in the background.
//   Users never see a loading spinner on first render.
//
// USAGE EXAMPLE:
//   import { PLAYERS } from "@/data/mockData";
//   import { usePlayerStats } from "@/hooks/usePlayerData";
//
//   const mockPlayer = PLAYERS.find(p => p.id === "virat-kohli")!;
//   const { data: player } = usePlayerStats(mockPlayer.cricInfoId, mockPlayer);
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useCallback } from "react";
import {
  fetchPlayerStats,
  fetchPlayers,
  searchPlayers,
  fetchKNNTwins,
  fetchConstellation,
  fetchClusters,
  fetchBattle,
  fetchStatementMoments,
  fetchKohliShrine,
  type LivePlayerProfile,
  type LiveCareerStats,
  type SearchResult,
  fetchQuiz,
  submitQuiz,
  fetchQuizLeaderboard,
  fetchAlgorithms,
} from "@/lib/api";
import { PLAYERS, ARCHETYPES, KOHLI_CAREER } from "@/data/mockData";

// ─── Cache times ──────────────────────────────────────────────────────────────

const STALE = {
  careerStats: 1000 * 60 * 60 * 24,   // 24h — career stats don't change daily
  recentForm:  1000 * 60 * 60,         // 1h  — recent innings update more often
  ml:          1000 * 60 * 60 * 24,    // 24h — ML output changes only on rerun
  search:      1000 * 60 * 5,          // 5m  — search index is stable
  battle:      1000 * 60 * 60,         // 1h  — battle data = career stats + moments
};

// ─── Player stats ─────────────────────────────────────────────────────────────

/**
 * Full career stats for one player.
 * Pass the corresponding mockData player as `placeholder` for instant render.
 *
 * @param cricInfoId  ESPN Cricinfo player ID e.g. "253802"
 * @param placeholder Mock player from mockData.ts — shown while fetching
 */
export function usePlayerStats(
  cricInfoId: string | undefined,
  placeholder?: typeof PLAYERS[0]
) {
  return useQuery({
    queryKey: ["player", "stats", cricInfoId],
    queryFn: () => fetchPlayerStats(cricInfoId!),
    enabled: !!cricInfoId,
    staleTime: STALE.careerStats,
    placeholderData: placeholder
      ? {
          cricInfoId: placeholder.cricInfoId,
          name: placeholder.name,
          country: placeholder.country,
          role: placeholder.role,
          age: 0,
          testStats: placeholder.testStats,
          odiStats: placeholder.odiStats,
          t20Stats: placeholder.t20Stats,
          iplStats: placeholder.iplStats,
          recentForm: [],
        } as LivePlayerProfile
      : undefined,
  });
}

// ─── Player list ──────────────────────────────────────────────────────────────

/**
 * Filtered player list. Falls back to filtered mockData while loading.
 */
export function usePlayerList(params?: {
  format?: "test" | "odi" | "t20";
  cluster?: string;
  search?: string;
}) {
  const mockFallback = useMemo<SearchResult[]>(() => {
    let list = PLAYERS;
    if (params?.cluster) list = list.filter((p) => p.archetypeId === params.cluster);
    if (params?.search) {
      const q = params.search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list.map((p) => ({
      internalId: p.id,
      name: p.name,
      cricbuzzPlayerId: p.cricInfoId,
      country: p.country,
      flag: p.flag,
      role: p.role,
      archetypeId: p.archetypeId,
      archetypeName: p.archetype,
    }));
  }, [params?.format, params?.cluster, params?.search]);

  return useQuery({
    queryKey: ["players", "list", params],
    queryFn: () => fetchPlayers(params),
    staleTime: STALE.search,
    placeholderData: mockFallback,
  });
}

// ─── Player search ────────────────────────────────────────────────────────────

/**
 * Debounce-friendly search hook.
 * Only fires when query.length >= 2 to avoid hammering the API.
 *
 * @param query  Raw search string from input
 */
export function usePlayerSearch(query: string) {
  const trimmed = query.trim();
  const enabled = trimmed.length >= 2;

  const mockResults = useMemo<SearchResult[]>(() => {
    if (!enabled) return [];
    const q = trimmed.toLowerCase();
    return PLAYERS
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map((p) => ({
        internalId: p.id,
        name: p.name,
        cricbuzzPlayerId: p.cricInfoId,
        country: p.country,
        flag: p.flag,
        role: p.role,
        archetypeId: p.archetypeId,
        archetypeName: p.archetype,
      }));
  }, [trimmed, enabled]);

  return useQuery({
    queryKey: ["players", "search", trimmed],
    queryFn: () => searchPlayers(trimmed),
    enabled,
    staleTime: STALE.search,
    placeholderData: mockResults,
  });
}

// ─── Quiz & Algorithms ────────────────────────────────────────────────────────

/**
 * Lazy quiz hook. Pass `enabled: true` only after the user explicitly starts a session.
 * This avoids burning Gemini API calls just from visiting the page.
 */
export function useQuiz(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["quiz", "kohli-fanboy"],
    queryFn: fetchQuiz,
    enabled: opts?.enabled ?? false,
    staleTime: 0, // Always fetch fresh LLM quiz
    gcTime: 1000 * 60 * 5, // Keep last result for 5 min for the result-screen recap
    refetchOnWindowFocus: false,
    retry: 1, // One retry for transient Gemini errors
  });
}

export function useSubmitQuiz() {
  return useMutation({
    mutationFn: ({ token, answers }: { token: string; answers: { questionId: string; selectedIndex: number }[] }) =>
      submitQuiz(token, answers),
  });
}

export function useQuizLeaderboard() {
  return useQuery({
    queryKey: ["quiz", "leaderboard"],
    queryFn: fetchQuizLeaderboard,
    staleTime: 1000 * 60, // 1 min
  });
}

export function useAlgorithms() {
  return useQuery({
    queryKey: ["algorithms"],
    queryFn: fetchAlgorithms,
    staleTime: Infinity,
  });
}

// ─── KNN twins ────────────────────────────────────────────────────────────────

/**
 * DNA twin search for a player.
 * Falls back to mockData's dnaTwins array while the ML service responds.
 *
 * @param playerId    Player id from mockData e.g. "virat-kohli"
 * @param cricInfoId  ESPN Cricinfo ID for the ML service lookup
 */
export function useKNNTwins(
  playerId: string | undefined,
  cricInfoId: string | undefined
) {
  const mockPlayer = PLAYERS.find((p) => p.id === playerId);

  const mockFallback = useMemo(() => {
    if (!mockPlayer) return undefined;
    const twins = mockPlayer.dnaTwins
      .map((twinId) => PLAYERS.find((p) => p.id === twinId))
      .filter(Boolean) as typeof PLAYERS;
    return {
      player: {
        id: mockPlayer.id,
        name: mockPlayer.name,
        archetypeId: mockPlayer.archetypeId,
        archetype: mockPlayer.archetype,
      },
      twins: twins.map((t, i) => ({
        id: t.id,
        name: t.name,
        cricInfoId: t.cricInfoId,
        similarity: 85 - i * 4,      // mock similarity scores
        archetypeId: t.archetypeId,
        archetype: t.archetype,
        country: t.country,
        flag: t.flag,
      })),
    };
  }, [playerId]);

  return useQuery({
    queryKey: ["knn", playerId],
    queryFn: () => fetchKNNTwins(playerId!, 5),
    enabled: !!playerId && !!cricInfoId,
    staleTime: STALE.ml,
    placeholderData: mockFallback,
  });
}

// ─── Constellation ────────────────────────────────────────────────────────────

/**
 * All players with real t-SNE coordinates.
 * Falls back to mockData x,y values (hand-placed) until the API responds.
 */
export function useConstellation() {
  const mockFallback = useMemo(
    () =>
      PLAYERS.map((p) => ({
        id: p.id,
        name: p.name,
        cricInfoId: p.cricInfoId,
        archetypeId: p.archetypeId,
        x: p.x,
        y: p.y,
        dnaScore: p.dnaScore,
        flag: p.flag,
      })),
    []
  );

  return useQuery({
    queryKey: ["constellation"],
    queryFn: fetchConstellation,
    staleTime: STALE.ml,
    placeholderData: mockFallback,
  });
}

// ─── Archetypes ───────────────────────────────────────────────────────────────

/**
 * Cluster definitions with real centroid values from K-Means.
 * Falls back to ARCHETYPES from mockData.
 */
export function useClusters() {
  return useQuery({
    queryKey: ["clusters"],
    queryFn: fetchClusters,
    staleTime: STALE.ml,
    placeholderData: ARCHETYPES.map((a) => ({
      id: a.id,
      name: a.name,
      color: a.color,
      description: a.description,
      memberCount: PLAYERS.filter((p) => p.archetypeId === a.id).length,
      centroidValues: a.centroidValues,
      examplePlayers: a.examplePlayers,
    })),
  });
}

// ─── Battle Arena ─────────────────────────────────────────────────────────────

/**
 * Full battle data for two players.
 * Uses cricInfoIds to fetch from the Cricinfo proxy.
 * Falls back to mockData stats + BATTLE_RESULTS while fetching.
 *
 * @param p1  Player object from mockData (has cricInfoId)
 * @param p2  Player object from mockData (has cricInfoId)
 */
export function useBattle(
  p1: typeof PLAYERS[0] | undefined,
  p2: typeof PLAYERS[0] | undefined,
  algorithms: string[] = ["xgboost", "random_forest"]
) {
  const enabled = !!p1?.cricInfoId && !!p2?.cricInfoId && algorithms.length >= 2;

  return useQuery({
    queryKey: ["battle", p1?.cricInfoId, p2?.cricInfoId, algorithms.join(",")],
    queryFn: () => fetchBattle(p1!.cricInfoId, p2!.cricInfoId, algorithms),
    enabled,
    staleTime: STALE.battle,
    // No placeholderData here — BattleView already renders with the
    // mock PLAYERS data directly, and upgrades when this resolves.
  });
}

/**
 * Statement moments only — cheaper than full battle fetch.
 * Use when rendering just the moments tab to avoid over-fetching.
 */
export function useStatementMoments(
  p1CricInfoId: string | undefined,
  p2CricInfoId: string | undefined
) {
  return useQuery({
    queryKey: ["battle", "moments", p1CricInfoId, p2CricInfoId],
    queryFn: () => fetchStatementMoments(p1CricInfoId!, p2CricInfoId!),
    enabled: !!p1CricInfoId && !!p2CricInfoId,
    staleTime: STALE.battle,
  });
}

// ─── Kohli Shrine ─────────────────────────────────────────────────────────────

/**
 * Kohli-specific shrine data — career arc, records, current stats.
 * Falls back to KOHLI_CAREER from mockData for the line chart.
 */
export function useKohliShrine() {
  return useQuery({
    queryKey: ["kohli", "shrine"],
    queryFn: fetchKohliShrine,
    staleTime: STALE.careerStats,
    placeholderData: {
      careerArc: KOHLI_CAREER,
      records: [],
      currentStats: {} as LiveCareerStats,
    },
  });
}

// ─── Budget status ───────────────────────────────────────────────────────────



// ─── Prefetch helpers ─────────────────────────────────────────────────────────

/**
 * Call this on hover over a player card to prefetch their stats.
 * By the time the user clicks, data is already in cache.
 *
 * Usage:
 *   const prefetch = usePrefetchPlayer();
 *   <div onMouseEnter={() => prefetch(player.cricInfoId)}>
 */
export function usePrefetchPlayer() {
  const queryClient = useQueryClient();
  return useCallback(
    (cricInfoId: string) => {
      queryClient.prefetchQuery({
        queryKey: ["player", "stats", cricInfoId],
        queryFn: () => fetchPlayerStats(cricInfoId),
        staleTime: STALE.careerStats,
      });
    },
    [queryClient]
  );
}
