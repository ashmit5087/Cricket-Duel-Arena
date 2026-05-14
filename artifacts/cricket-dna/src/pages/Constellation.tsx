import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from "recharts";
import { PLAYERS, ARCHETYPES, RADAR_AXES } from "@/data/mockData";
import { VideoBackground } from "@/components/ui/VideoBackground";

type Era = "all" | "pre2000" | "2000-2015" | "2015+";
type Format = "all" | "test" | "odi" | "t20";

const ERA_FILTERS: { id: Era; label: string }[] = [
  { id: "all", label: "All Eras" },
  { id: "pre2000", label: "Pre-2000" },
  { id: "2000-2015", label: "2000–2015" },
  { id: "2015+", label: "2015–Present" },
];

const FORMAT_FILTERS: { id: Format; label: string }[] = [
  { id: "all", label: "All" },
  { id: "test", label: "Test" },
  { id: "odi", label: "ODI" },
  { id: "t20", label: "T20" },
];

const ERA_MAP: Record<string, Era[]> = {
  "virat-kohli": ["2015+", "2000-2015"],
  "sachin-tendulkar": ["pre2000", "2000-2015"],
  "rahul-dravid": ["pre2000", "2000-2015"],
  "ms-dhoni": ["2000-2015", "2015+"],
  "ricky-ponting": ["pre2000", "2000-2015"],
  "shane-warne": ["pre2000", "2000-2015"],
  "adam-gilchrist": ["pre2000", "2000-2015"],
  "anil-kumble": ["pre2000", "2000-2015"],
  "brian-lara": ["pre2000", "2000-2015"],
  "sourav-ganguly": ["pre2000", "2000-2015"],
  "virender-sehwag": ["2000-2015"],
  "kumar-sangakkara": ["2000-2015"],
  "muttiah-muralitharan": ["pre2000", "2000-2015"],
  "mahela-jayawardene": ["2000-2015"],
  "imran-khan": ["pre2000"],
  "wasim-akram": ["pre2000"],
  "younis-khan": ["2000-2015"],
};

function getEra(playerId: string): Era[] {
  return ERA_MAP[playerId] || ["2015+"];
}

function getFormat(player: typeof PLAYERS[0]): Format[] {
  const fmts: Format[] = [];
  if (player.testStats.matches > 10) fmts.push("test");
  if (player.odiStats.matches > 10) fmts.push("odi");
  if (player.t20Stats.matches > 10) fmts.push("t20");
  return fmts.length ? fmts : ["test", "odi"];
}

export default function Constellation() {
  const [search, setSearch] = useState("");
  const [era, setEra] = useState<Era>("all");
  const [format, setFormat] = useState<Format>("all");
  const [selected, setSelected] = useState<typeof PLAYERS[0] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const SVG_W = 720;
  const SVG_H = 440;

  const filtered = PLAYERS.filter((p) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchEra = era === "all" || getEra(p.id).includes(era);
    const matchFormat = format === "all" || getFormat(p).includes(format);
    return matchSearch && matchEra && matchFormat;
  });

  const filteredIds = new Set(filtered.map((p) => p.id));

  const radarData = selected ? RADAR_AXES.map((axis, i) => ({
    axis,
    [selected.name]: selected.radarValues[i],
  })) : [];

  return (
    <div className="relative min-h-screen bg-[#070707] py-16 px-4 md:px-8" data-testid="constellation-page">
      <VideoBackground
        src="https://stream.mux.com/Aa02T7oM1wH5Mk5EEVDYhbZ1ChcdhRsS2m1NYyx4Ua1g.m3u8"
        opacity={0.38}
        overlayOpacity={0.72}
      />
      <div className="relative z-10 max-w-6xl mx-auto">
        <h1 className="font-serif text-4xl md:text-5xl text-[#f5f5f5] mb-2">DNA Constellation</h1>
        <p className="text-[#555] text-sm mb-10">60 cricketers mapped by performance DNA. Clusters emerge naturally.</p>

        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <input
            type="search"
            placeholder="Search player..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-[#111] border border-white/10 text-[#f5f5f5] text-sm px-4 py-2 outline-none focus:border-[#c0392b] transition-colors w-full md:w-64 placeholder-[#444]"
            data-testid="search-input"
          />

          <div className="flex gap-2 flex-wrap">
            {ERA_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setEra(f.id)}
                className={`px-3 py-1.5 text-xs uppercase tracking-widest border transition-colors ${era === f.id ? "border-[#c0392b] text-[#c0392b]" : "border-white/10 text-[#555] hover:border-white/20"}`}
                data-testid={`era-${f.id}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap">
            {FORMAT_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className={`px-3 py-1.5 text-xs uppercase tracking-widest border transition-colors ${format === f.id ? "border-[#d4a500] text-[#d4a500]" : "border-white/10 text-[#555] hover:border-white/20"}`}
                data-testid={`format-${f.id}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 mb-6 flex-wrap">
          {ARCHETYPES.map((a) => (
            <span key={a.id} className="flex items-center gap-1.5 text-xs text-[#555]">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: a.color }} />
              {a.name}
            </span>
          ))}
        </div>

        <div className="relative flex flex-col lg:flex-row gap-6">
          <div className="flex-1 border border-white/5 bg-[#070707] overflow-auto">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="w-full"
              style={{ minWidth: 400, cursor: "crosshair" }}
            >
              {PLAYERS.map((player) => {
                const arch = ARCHETYPES.find((a) => a.id === player.archetypeId);
                const isKohli = player.id === "virat-kohli";
                const isVisible = filteredIds.has(player.id);
                const isSelected = selected?.id === player.id;
                const baseR = isKohli ? 9 : 5;
                const color = arch?.color || "#444";

                const nx = (player.x / 700) * (SVG_W - 80) + 40;
                const ny = (player.y / 440) * (SVG_H - 60) + 30;

                return (
                  <g
                    key={player.id}
                    onClick={() => setSelected(isSelected ? null : player)}
                    className="cursor-pointer"
                    data-testid={`dot-${player.id}`}
                  >
                    {isKohli && (
                      <motion.g
                        style={{ transformOrigin: `${nx}px ${ny}px` }}
                        animate={{ scale: [1, 1.7, 1], opacity: [0.5, 0.15, 0.5] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                      >
                        <circle cx={nx} cy={ny} r={baseR + 8} fill="none" stroke="#c0392b" strokeWidth="1.5" />
                      </motion.g>
                    )}
                    {isSelected && (
                      <circle cx={nx} cy={ny} r={baseR + 5} fill="none" stroke="#fff" strokeWidth="1.5" opacity={0.6} />
                    )}
                    <circle
                      cx={nx} cy={ny} r={baseR}
                      fill={color}
                      opacity={isVisible ? (isKohli ? 1 : 0.75) : 0.08}
                    />
                    {(isKohli || isSelected || (isVisible && search && player.name.toLowerCase().includes(search.toLowerCase()))) && (
                      <text
                        x={nx + baseR + 4} y={ny + 4}
                        fontSize="9" fill={isKohli ? "#c0392b" : "#888"}
                        fontFamily="Inter, sans-serif"
                      >
                        {player.name}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          <AnimatePresence>
            {selected && (
              <motion.div
                className="lg:w-80 border border-white/10 bg-[#0d0d0d] p-6 shrink-0"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 30 }}
                data-testid="player-panel"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="font-serif text-xl text-[#f5f5f5]">{selected.name}</div>
                    <div className="text-xs text-[#555] mt-1">{selected.country} · {selected.role}</div>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="text-[#555] hover:text-white text-xl"
                    data-testid="close-panel"
                  >
                    ×
                  </button>
                </div>

                {(() => {
                  const arch = ARCHETYPES.find((a) => a.id === selected.archetypeId);
                  return (
                    <div className="inline-block px-2 py-0.5 text-xs border-l-2 mb-4" style={{ borderColor: arch?.color, color: arch?.color, background: `${arch?.color}15` }}>
                      {arch?.name}
                    </div>
                  );
                })()}

                <div className="mb-4">
                  <ResponsiveContainer width="100%" height={180}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="#1a1a1a" />
                      <PolarAngleAxis dataKey="axis" tick={{ fill: "#444", fontSize: 8 }} />
                      <Radar dataKey={selected.name} stroke={ARCHETYPES.find((a) => a.id === selected.archetypeId)?.color || "#c0392b"} fill={ARCHETYPES.find((a) => a.id === selected.archetypeId)?.color || "#c0392b"} fillOpacity={0.2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-[#111] p-2">
                    <div className="text-[#555] mb-1">Test Avg</div>
                    <div className="text-[#d4a500] font-bold">{selected.testStats.avg}</div>
                  </div>
                  <div className="bg-[#111] p-2">
                    <div className="text-[#555] mb-1">ODI Avg</div>
                    <div className="text-[#d4a500] font-bold">{selected.odiStats.avg}</div>
                  </div>
                  <div className="bg-[#111] p-2">
                    <div className="text-[#555] mb-1">DNA Score</div>
                    <div className="text-[#c0392b] font-bold">{selected.dnaScore}</div>
                  </div>
                  <div className="bg-[#111] p-2">
                    <div className="text-[#555] mb-1">100s</div>
                    <div className="text-[#f5f5f5] font-bold">{selected.odiStats.hundreds + selected.testStats.hundreds}</div>
                  </div>
                </div>

                {selected.dnaTwins.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <div className="text-xs text-[#555] uppercase tracking-widest mb-2">DNA Twins</div>
                    {selected.dnaTwins.map((twinId) => {
                      const twin = PLAYERS.find((p) => p.id === twinId);
                      return twin ? (
                        <div key={twinId} className="text-xs text-[#888] py-1 border-b border-white/5">{twin.name}</div>
                      ) : null;
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
