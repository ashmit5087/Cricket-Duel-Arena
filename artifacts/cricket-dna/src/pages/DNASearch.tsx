import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PLAYERS, ARCHETYPES } from "@/data/mockData";

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

function DNA_TWINS_MAP(): Record<string, string[]> {
  return {
    "virat-kohli": ["kane-williamson", "babar-azam", "joe-root", "sachin-tendulkar", "ricky-ponting"],
    "jasprit-bumrah": ["lasith-malinga", "glenn-mcgrath", "mitchell-starc", "pat-cummins", "dale-steyn"],
    "ms-dhoni": ["adam-gilchrist", "brendon-mccullum", "jonny-bairstow", "ab-de-villiers", "brendon-mccullum"],
    "sachin-tendulkar": ["virat-kohli", "ricky-ponting", "brian-lara", "joe-root", "kane-williamson"],
    "rohit-sharma": ["chris-gayle", "david-warner", "adam-gilchrist", "brendon-mccullum", "jason-roy"],
    "rahul-dravid": ["joe-root", "kane-williamson", "kumar-sangakkara", "younis-khan", "hashim-amla"],
    "ab-de-villiers": ["brian-lara", "ms-dhoni", "rishabh-pant", "brendon-mccullum", "shahid-afridi"],
    "shane-warne": ["muttiah-muralitharan", "anil-kumble", "ravichandran-ashwin", "harbhajan-singh", "imran-tahir"],
  };
}

const SIMILARITY_SCORES: Record<string, Record<string, number>> = {
  "virat-kohli": { "kane-williamson": 91, "babar-azam": 88, "joe-root": 85, "sachin-tendulkar": 82, "ricky-ponting": 78 },
  "jasprit-bumrah": { "lasith-malinga": 87, "glenn-mcgrath": 84, "mitchell-starc": 82, "pat-cummins": 80, "dale-steyn": 78 },
  "ms-dhoni": { "adam-gilchrist": 75, "brendon-mccullum": 72, "jonny-bairstow": 68, "ab-de-villiers": 65, "rishabh-pant": 62 },
  "sachin-tendulkar": { "virat-kohli": 84, "ricky-ponting": 78, "brian-lara": 76, "joe-root": 74, "kane-williamson": 72 },
  "rohit-sharma": { "chris-gayle": 80, "david-warner": 78, "adam-gilchrist": 73, "brendon-mccullum": 70, "jason-roy": 68 },
  "rahul-dravid": { "joe-root": 82, "kane-williamson": 79, "kumar-sangakkara": 76, "younis-khan": 72, "hashim-amla": 70 },
  "ab-de-villiers": { "brian-lara": 78, "ms-dhoni": 74, "rishabh-pant": 70, "brendon-mccullum": 68, "shahid-afridi": 62 },
  "shane-warne": { "muttiah-muralitharan": 85, "anil-kumble": 80, "ravichandran-ashwin": 72, "harbhajan-singh": 68, "ravindra-jadeja": 58 },
};

export default function DNASearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<typeof PLAYERS[0] | null>(null);
  const [showCard, setShowCard] = useState(false);

  const TWINS_MAP = DNA_TWINS_MAP();

  const handleSearch = (q: string) => {
    const found = PLAYERS.find((p) => p.name.toLowerCase().includes(q.toLowerCase()));
    if (found) {
      setResults(found);
      setShowCard(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && query) handleSearch(query);
  };

  const seededPlayers = [
    "Virat Kohli", "Jasprit Bumrah", "MS Dhoni", "Sachin Tendulkar", "Rohit Sharma", "AB de Villiers",
  ];

  const twinIds = results ? (TWINS_MAP[results.id] || results.dnaTwins) : [];
  const twinPlayers = twinIds.map((id) => PLAYERS.find((p) => p.id === id)).filter(Boolean) as typeof PLAYERS;
  const similarities = results ? (SIMILARITY_SCORES[results.id] || {}) : {};

  const resultArch = results ? ARCHETYPES.find((a) => a.id === results.archetypeId) : null;

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
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent py-4 text-[#f5f5f5] text-lg outline-none"
              data-testid="player-search-input"
            />
            {!query && (
              <div className="absolute left-12 top-1/2 -translate-y-1/2 pointer-events-none text-lg">
                <RolodexPlaceholder />
              </div>
            )}
            <button
              onClick={() => query && handleSearch(query)}
              className="px-6 py-4 text-sm font-bold tracking-widest uppercase bg-[#c0392b] text-white hover:bg-[#a93226] transition-colors shrink-0"
              data-testid="search-btn"
            >
              Search →
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-center mb-12">
          {seededPlayers.map((name) => (
            <button
              key={name}
              onClick={() => { setQuery(name); handleSearch(name); }}
              className="px-3 py-1.5 text-xs border border-white/10 text-[#666] hover:border-[#c0392b] hover:text-[#c0392b] transition-colors"
              data-testid={`seed-${name.replace(/ /g, "-").toLowerCase()}`}
            >
              {name}
            </button>
          ))}
        </div>

        <AnimatePresence>
          {showCard && results && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              data-testid="search-results"
            >
              <div className="border border-[#c0392b]/30 p-6 mb-8" style={{ background: "#0d0505" }}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="font-serif text-3xl text-[#f5f5f5] mb-1">{results.name}</div>
                    <div className="text-xs text-[#555]">{results.country} · {results.role}</div>
                  </div>
                  <span className="text-2xl">{results.flag}</span>
                </div>

                {resultArch && (
                  <div className="inline-block px-3 py-1 text-xs border-l-2 mb-4" style={{ borderColor: resultArch.color, color: resultArch.color, background: `${resultArch.color}15` }}>
                    {resultArch.name}
                  </div>
                )}

                <div className="grid grid-cols-4 gap-4 text-center border-t border-white/5 pt-4">
                  {[
                    { v: results.odiStats.hundreds, l: "ODI 100s" },
                    { v: results.odiStats.avg.toFixed(1), l: "ODI Avg" },
                    { v: results.dnaScore, l: "DNA Score" },
                    { v: results.odiStats.runs.toLocaleString(), l: "ODI Runs" },
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
                {twinPlayers.slice(0, 5).map((twin, i) => {
                  const sim = similarities[twin.id] || (85 - i * 6);
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
                              animate={{ width: `${sim}%` }}
                              transition={{ duration: 0.8, delay: i * 0.1 }}
                            />
                          </div>
                          <span className="text-xs font-bold text-[#d4a500] shrink-0">{sim}%</span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <div className="border border-white/10 p-6 bg-[#0d0d0d]" data-testid="share-card">
                <div className="text-xs text-[#555] uppercase tracking-widest mb-4">DNA Match Card</div>
                <div className="border border-[#c0392b]/20 p-4 bg-black text-center">
                  <div className="text-xs text-[#c0392b] tracking-widest uppercase mb-2">◆ CRICKET DNA</div>
                  <div className="font-serif text-2xl text-white mb-2">{results.name}</div>
                  <div className="text-xs text-[#666] mb-3">Archetype: {resultArch?.name}</div>
                  <div className="text-xs text-[#888]">Nearest DNA Twin:</div>
                  <div className="font-serif text-xl text-[#d4a500] mt-1">{twinPlayers[0]?.name}</div>
                  <div className="text-xs text-[#555] mt-2">Similarity: {Object.values(similarities)[0] || 85}%</div>
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
