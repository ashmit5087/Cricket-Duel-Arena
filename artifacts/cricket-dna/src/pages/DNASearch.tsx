import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PLAYERS, ARCHETYPES } from "@/data/mockData";
import { usePlayerSearch, useKNNTwins, usePrefetchPlayer } from "@/hooks/usePlayerData";
import type { SearchResult } from "@/lib/api";

const PLACEHOLDER_WORDS = ["Jasprit Bumrah...", "Virat Kohli...", "MS Dhoni...", "Sachin Tendulkar...", "Rohit Sharma..."];

function RolodexPlaceholder() {
  const [idx, setIdx] = useState(0);
  const [flip, setFlip] = useState(false);
  const [word, setWord] = useState(PLACEHOLDER_WORDS[0]);

  useEffect(() => {
    const interval = setInterval(() => {
      setFlip(true);
      setTimeout(() => {
        setIdx((prev) => (prev + 1) % PLACEHOLDER_WORDS.length);
        setWord(PLACEHOLDER_WORDS[(idx + 1) % PLACEHOLDER_WORDS.length]);
        setFlip(false);
      }, 300);
    }, 2000);
    return () => clearInterval(interval);
  }, [idx]);

  return (
    <span
      className="text-[#444] transition-all duration-300 inline-block"
      style={{
        transform: flip ? "rotateX(-90deg)" : "rotateX(0deg)",
        transformStyle: "preserve-3d",
        perspective: "600px",
      }}
    >
      {word}
    </span>
  );
}

export default function DNASearch() {
  const [query, setQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<SearchResult | null>(null);

  const { data: searchResults, isFetching: searching } = usePlayerSearch(query);
  const { data: knnResult, isLoading: twinsLoading } = useKNNTwins(
    selectedPlayer?.internalId,
    selectedPlayer?.cricbuzzPlayerId
  );
  const prefetch = usePrefetchPlayer();

  const seededPlayers = [
    "Virat Kohli", "Jasprit Bumrah", "MS Dhoni", "Sachin Tendulkar", "Rohit Sharma", "AB de Villiers",
  ];

  const selectedMock = selectedPlayer ? PLAYERS.find((p) => p.id === selectedPlayer.internalId) : null;
  const resultArch = selectedPlayer ? ARCHETYPES.find((a) => a.id === selectedPlayer.archetypeId) : null;
  const twins = knnResult?.twins ?? [];
  const topTwin = twins[0];

  return (
    <div className="min-h-screen bg-[#0a0a0a] py-24 px-4 md:px-8 flex flex-col items-center" data-testid="dna-search">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-12">
          <div className="text-xs text-[#c0392b] tracking-[0.3em] uppercase mb-4">AI Cricket Intelligence</div>
          <h1 className="font-serif text-4xl md:text-6xl text-[#f5f5f5] mb-6">Find a Player's DNA Twin</h1>
          <p className="text-[#555] text-sm">Enter a player's name to discover who shares their performance fingerprint.</p>
        </div>

        <div className="relative mb-6">
          <div
            className="flex items-center border border-white/10 bg-[#111] focus-within:border-[#c0392b] transition-colors"
            data-testid="search-bar"
          >
            <svg className="ml-4 mr-3 shrink-0" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="6.5" cy="6.5" r="5.5" stroke="#555" strokeWidth="1.5" />
              <path d="M11 11l3.5 3.5" stroke="#555" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedPlayer(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchResults && searchResults.length > 0) {
                  setSelectedPlayer(searchResults[0]);
                  setQuery(searchResults[0].name);
                }
              }}
              className="flex-1 bg-transparent py-4 text-[#f5f5f5] text-lg outline-none"
              data-testid="player-search-input"
            />
            {!query && (
              <div className="absolute left-12 top-1/2 -translate-y-1/2 pointer-events-none text-lg">
                <RolodexPlaceholder />
              </div>
            )}
            <button
              onClick={() => {
                if (searchResults && searchResults.length > 0) {
                  setSelectedPlayer(searchResults[0]);
                  setQuery(searchResults[0].name);
                }
              }}
              className="px-6 py-4 text-sm font-bold tracking-widest uppercase bg-[#c0392b] text-white hover:bg-[#a93226] transition-colors shrink-0"
              data-testid="search-btn"
            >
              Search →
            </button>
          </div>
        </div>

        {searchResults && searchResults.length > 0 && !selectedPlayer && (
          <div className="border border-white/8 bg-[#111] mt-1">
            {searchResults.map((result) => (
              <button
                key={result.internalId}
                onMouseEnter={() => prefetch(result.cricbuzzPlayerId)}
                onClick={() => {
                  setSelectedPlayer(result);
                  setQuery(result.name);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/4 text-left"
              >
                <span className="text-sm text-white">{result.name}</span>
                <span className="text-xs text-[#555]">{result.flag} {result.country}</span>
                <span className="text-[10px] ml-auto" style={{ color: "#888" }}>
                  {result.archetypeName || result.archetypeId}
                </span>
              </button>
            ))}
          </div>
        )}

        {searching && query.trim().length >= 2 && !selectedPlayer && (
          <div className="mt-2 text-[#444] text-xs tracking-widest uppercase animate-pulse">
            Searching...
          </div>
        )}

        <div className="flex flex-wrap gap-2 justify-center mb-12">
          {seededPlayers.map((name) => (
            <button
              key={name}
              onClick={() => { setQuery(name); setSelectedPlayer(null); }}
              className="px-3 py-1.5 text-xs border border-white/10 text-[#666] hover:border-[#c0392b] hover:text-[#c0392b] transition-colors"
              data-testid={`seed-${name.replace(/ /g, "-").toLowerCase()}`}
            >
              {name}
            </button>
          ))}
        </div>

        <AnimatePresence>
          {selectedPlayer && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              data-testid="search-results"
            >
              <div className="border border-[#c0392b]/30 p-6 mb-8" style={{ background: "#0d0505" }}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="font-serif text-3xl text-[#f5f5f5] mb-1">{selectedPlayer.name}</div>
                    <div className="text-xs text-[#555]">{selectedPlayer.country} · {selectedPlayer.role}</div>
                  </div>
                  <span className="text-2xl">{selectedPlayer.flag}</span>
                </div>

                {resultArch && (
                  <div className="inline-block px-3 py-1 text-xs border-l-2 mb-4" style={{ borderColor: resultArch.color, color: resultArch.color, background: `${resultArch.color}15` }}>
                    {resultArch.name}
                  </div>
                )}

                <div className="grid grid-cols-4 gap-4 text-center border-t border-white/5 pt-4">
                  {[
                    { v: selectedMock?.odiStats?.hundreds ?? "-", l: "ODI 100s" },
                    { v: selectedMock?.odiStats?.avg?.toFixed(1) ?? "-", l: "ODI Avg" },
                    { v: selectedMock?.dnaScore ?? "-", l: "DNA Score" },
                    { v: selectedMock?.odiStats?.runs?.toLocaleString() ?? "-", l: "ODI Runs" },
                  ].map((s) => (
                    <div key={s.l}>
                      <div className="text-xl font-bold text-[#d4a500]">{s.v}</div>
                      <div className="text-xs text-[#555] mt-1">{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>

              <h2 className="font-serif text-2xl text-[#f5f5f5] mb-6">Top DNA Twins</h2>

              <div className="space-y-3 mb-8">
                {twins.map((twin, i) => {
                  const arch = ARCHETYPES.find((a) => a.id === twin.archetypeId);
                  return (
                    <motion.div
                      key={twin.id}
                      className="border border-white/5 p-4 flex items-center gap-4 bg-[#0d0d0d] hover:border-white/15 transition-colors"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      data-testid={`twin-card-${twin.id}`}
                    >
                      <div className="text-2xl font-bold text-[#1a1a1a] w-8 shrink-0 text-center">{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-[#f5f5f5] text-sm">{twin.name}</span>
                          <span className="text-sm">{twin.flag}</span>
                        </div>
                        {arch && (
                          <div className="text-xs mb-2" style={{ color: arch.color }}>{arch.name}</div>
                        )}
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-1.5 bg-[#1a1a1a] rounded overflow-hidden">
                            <motion.div
                              className="h-full rounded"
                              style={{ background: arch?.color || "#d4a500" }}
                              initial={{ width: 0 }}
                              animate={{ width: `${twin.similarity}%` }}
                              transition={{ duration: 0.8, delay: i * 0.1 }}
                            />
                          </div>
                          <span className="text-xs font-bold text-[#d4a500] shrink-0">{twin.similarity}%</span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {twinsLoading && (
                <div className="text-[#444] text-xs tracking-widest uppercase animate-pulse">
                  Calculating DNA similarity...
                </div>
              )}

              <div className="border border-white/10 p-6 bg-[#0d0d0d]" data-testid="share-card">
                <div className="text-xs text-[#555] uppercase tracking-widest mb-4">DNA Match Card</div>
                <div className="border border-[#c0392b]/20 p-4 bg-black text-center">
                  <div className="text-xs text-[#c0392b] tracking-widest uppercase mb-2">◆ CRICKET DNA</div>
                  <div className="font-serif text-2xl text-white mb-2">{selectedPlayer.name}</div>
                  <div className="text-xs text-[#666] mb-3">Archetype: {resultArch?.name}</div>
                  <div className="text-xs text-[#888]">Nearest DNA Twin:</div>
                  <div className="font-serif text-xl text-[#d4a500] mt-1">{topTwin?.name || "—"}</div>
                  <div className="text-xs text-[#555] mt-2">Similarity: {topTwin?.similarity ?? "—"}%</div>
                  <div className="text-xs text-[#333] mt-4">cricketdna.app</div>
                </div>
                <button
                  className="mt-4 w-full py-2 border border-white/10 text-[#666] text-xs uppercase tracking-widest hover:border-[#c0392b] hover:text-[#c0392b] transition-colors"
                  onClick={() => alert("Screenshot this card to share!")}
                  data-testid="share-btn"
                >
                  Share this DNA Match
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
