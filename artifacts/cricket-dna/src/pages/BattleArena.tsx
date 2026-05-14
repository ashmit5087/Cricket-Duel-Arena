import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { VideoBackground } from "@/components/ui/VideoBackground";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Legend } from "recharts";
import { PLAYERS, BATTLE_RESULTS, ARCHETYPES, RADAR_AXES } from "@/data/mockData";

type BattlePhase = "picker" | "intro" | "fight" | "ko";

function KOAnimation({ winner, loser, onDone }: { winner: string; loser: string; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 5000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="absolute inset-0 bg-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 0.2, delay: 0.8 }}
      />

      <div className="relative flex items-center justify-center w-full overflow-hidden">
        <motion.span
          className="font-serif font-black text-[#c0392b] leading-none select-none"
          style={{ fontSize: "clamp(80px, 20vw, 200px)", textShadow: "0 0 60px #c0392b, 0 0 120px #c0392b80" }}
          initial={{ x: "-100vw", opacity: 0 }}
          animate={{ x: "-10vw", opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.1 }}
        >
          K
        </motion.span>

        <motion.div
          className="absolute inset-0 bg-white pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.1, delay: 0.9 }}
        />

        <motion.span
          className="font-serif font-black text-[#c0392b] leading-none select-none"
          style={{ fontSize: "clamp(80px, 20vw, 200px)", textShadow: "0 0 60px #c0392b, 0 0 120px #c0392b80" }}
          initial={{ x: "100vw", opacity: 0 }}
          animate={{ x: "10vw", opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.1 }}
        >
          O
        </motion.span>
      </div>

      <motion.div
        className="text-[#c0392b] text-xs tracking-[0.5em] uppercase mt-6 font-bold"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2 }}
        style={{ textShadow: "0 0 20px #c0392b" }}
      >
        ◆ &nbsp; K.O. &nbsp; ◆
      </motion.div>

      <motion.div
        className="mt-8 text-center"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.8, type: "spring", stiffness: 120 }}
      >
        <div className="text-xs text-[#555] tracking-widest uppercase mb-2">Winner</div>
        <div className="font-serif text-3xl md:text-5xl text-[#d4a500]">{winner}</div>
      </motion.div>

      <motion.div
        className="mt-4 text-[#333] text-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.4 }}
      >
        {loser} has been defeated.
      </motion.div>

      <motion.button
        className="mt-12 px-8 py-3 border border-white/20 text-[#888] text-sm tracking-widest uppercase hover:border-[#c0392b] hover:text-white transition-colors"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 3 }}
        onClick={onDone}
        data-testid="ko-continue-btn"
      >
        Continue
      </motion.button>
    </motion.div>
  );
}

function FightIntro({ p1Name, p2Name, onDone }: { p1Name: string; p2Name: string; onDone: () => void }) {
  const [phase, setPhase] = useState<"slide" | "vs" | "fight">("slide");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("vs"), 800);
    const t2 = setTimeout(() => setPhase("fight"), 1800);
    const t3 = setTimeout(onDone, 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <motion.div
      className="fixed inset-0 z-40 bg-black flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
    >
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full"
            style={{
              background: i % 2 === 0 ? "#c0392b" : "#d4a500",
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{ opacity: [0, 1, 0], scale: [0, 2, 0] }}
            transition={{ duration: 0.6 + Math.random() * 0.4, delay: Math.random() * 2, repeat: 2 }}
          />
        ))}
      </div>

      <div className="relative z-10 text-center w-full px-8">
        <AnimatePresence mode="wait">
          {phase === "slide" && (
            <motion.div key="slide" className="flex items-center justify-between gap-8" initial={{ opacity: 1 }}>
              <motion.div
                className="text-left"
                initial={{ x: -200, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 150, damping: 18 }}
              >
                <div className="text-xs text-[#c0392b] tracking-widest uppercase mb-2">Player 1</div>
                <div className="font-serif text-3xl md:text-5xl text-white">{p1Name}</div>
              </motion.div>
              <motion.div
                className="text-right"
                initial={{ x: 200, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 150, damping: 18 }}
              >
                <div className="text-xs text-[#d4a500] tracking-widest uppercase mb-2">Player 2</div>
                <div className="font-serif text-3xl md:text-5xl text-white">{p2Name}</div>
              </motion.div>
            </motion.div>
          )}

          {phase === "vs" && (
            <motion.div
              key="vs"
              className="font-serif text-[#c0392b] leading-none"
              style={{ fontSize: "clamp(80px,20vw,200px)", textShadow: "0 0 80px #c0392b" }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
            >
              VS
            </motion.div>
          )}

          {phase === "fight" && (
            <motion.div
              key="fight"
              className="font-serif text-white leading-none"
              style={{ fontSize: "clamp(60px,15vw,160px)", textShadow: "0 0 40px #fff, 0 0 80px #c0392b" }}
              initial={{ y: -200, opacity: 0, rotate: -5 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              FIGHT!
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function StatTable({ p1, p2 }: { p1: typeof PLAYERS[0]; p2: typeof PLAYERS[0] }) {
  const [tab, setTab] = useState<"test" | "odi" | "t20">("odi");
  const tabs = [{ id: "test", label: "Test" }, { id: "odi", label: "ODI" }, { id: "t20", label: "T20I" }] as const;

  const data = {
    test: [
      { label: "Matches", p1: p1.testStats.matches, p2: p2.testStats.matches },
      { label: "Runs", p1: p1.testStats.runs, p2: p2.testStats.runs },
      { label: "Average", p1: p1.testStats.avg, p2: p2.testStats.avg },
      { label: "Strike Rate", p1: p1.testStats.sr, p2: p2.testStats.sr },
      { label: "100s", p1: p1.testStats.hundreds, p2: p2.testStats.hundreds },
      { label: "50s", p1: p1.testStats.fifties, p2: p2.testStats.fifties },
    ],
    odi: [
      { label: "Matches", p1: p1.odiStats.matches, p2: p2.odiStats.matches },
      { label: "Runs", p1: p1.odiStats.runs, p2: p2.odiStats.runs },
      { label: "Average", p1: p1.odiStats.avg, p2: p2.odiStats.avg },
      { label: "Strike Rate", p1: p1.odiStats.sr, p2: p2.odiStats.sr },
      { label: "100s", p1: p1.odiStats.hundreds, p2: p2.odiStats.hundreds },
      { label: "50s", p1: p1.odiStats.fifties, p2: p2.odiStats.fifties },
    ],
    t20: [
      { label: "Matches", p1: p1.t20Stats.matches, p2: p2.t20Stats.matches },
      { label: "Runs", p1: p1.t20Stats.runs, p2: p2.t20Stats.runs },
      { label: "Average", p1: p1.t20Stats.avg, p2: p2.t20Stats.avg },
      { label: "Strike Rate", p1: p1.t20Stats.sr, p2: p2.t20Stats.sr },
      { label: "100s", p1: p1.t20Stats.hundreds, p2: p2.t20Stats.hundreds },
      { label: "50s", p1: p1.t20Stats.fifties, p2: p2.t20Stats.fifties },
    ],
  };

  const rows = data[tab];

  return (
    <div className="mb-8" data-testid="stat-table">
      <div className="flex gap-2 mb-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-xs uppercase tracking-widest border transition-colors ${tab === t.id ? "border-[#c0392b] text-[#c0392b]" : "border-white/10 text-[#666]"}`}
            data-testid={`tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="border border-white/5">
        <div className="grid grid-cols-3 bg-[#111] border-b border-white/5 text-xs uppercase tracking-widest">
          <div className="p-3 text-[#c0392b] truncate">{p1.name}</div>
          <div className="p-3 text-center text-[#555]">Stat</div>
          <div className="p-3 text-right text-[#d4a500] truncate">{p2.name}</div>
        </div>
        {rows.map((row, i) => {
          const p1Wins = Number(row.p1) >= Number(row.p2);
          return (
            <motion.div
              key={row.label}
              className="grid grid-cols-3 border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <div className={`p-3 font-mono text-sm ${p1Wins ? "text-[#c0392b] font-bold" : "text-[#666]"}`}>
                {typeof row.p1 === "number" && row.p1 % 1 !== 0 ? row.p1.toFixed(2) : row.p1}
              </div>
              <div className="p-3 text-center text-xs text-[#555] uppercase tracking-wider">{row.label}</div>
              <div className={`p-3 text-right font-mono text-sm ${!p1Wins ? "text-[#d4a500] font-bold" : "text-[#666]"}`}>
                {typeof row.p2 === "number" && row.p2 % 1 !== 0 ? row.p2.toFixed(2) : row.p2}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function BattleView({ p1Id, p2Id }: { p1Id: string; p2Id: string }) {
  const [phase, setPhase] = useState<BattlePhase>("intro");
  const [showKO, setShowKO] = useState(false);

  const p1 = PLAYERS.find((p) => p.id === p1Id) || PLAYERS[0];
  const p2 = PLAYERS.find((p) => p.id === p2Id) || PLAYERS[1];

  const resultKey = `${p1Id}_${p2Id}`;
  const reverseKey = `${p2Id}_${p1Id}`;
  const result = BATTLE_RESULTS[resultKey] || BATTLE_RESULTS[reverseKey];
  const winner = result ? PLAYERS.find((p) => p.id === result.winner) : p1;
  const loser = winner?.id === p1.id ? p2 : p1;

  const p1Arch = ARCHETYPES.find((a) => a.id === p1.archetypeId);
  const p2Arch = ARCHETYPES.find((a) => a.id === p2.archetypeId);

  const radarData = RADAR_AXES.map((axis, i) => ({
    axis,
    [p1.name]: p1.radarValues[i],
    [p2.name]: p2.radarValues[i],
  }));

  return (
    <>
      <AnimatePresence>
        {phase === "intro" && (
          <FightIntro p1Name={p1.name} p2Name={p2.name} onDone={() => setPhase("fight")} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showKO && winner && loser && (
          <KOAnimation winner={winner.name} loser={loser.name} onDone={() => setShowKO(false)} />
        )}
      </AnimatePresence>

      <div className="relative min-h-screen pt-8 px-4 md:px-8" style={{ background: "#060606" }} data-testid="battle-view">
        <VideoBackground
          src="https://stream.mux.com/01yW6GoUz01OTXk5w1Rt1MHkJWlCGIwj46SUONJZ4DJUE.m3u8"
          opacity={0.38}
          overlayOpacity={0.8}
        />
        <div className="relative z-10 max-w-6xl mx-auto">
          <div className="grid grid-cols-3 items-center mb-8 gap-4">
            <div className="text-left" data-testid="p1-header">
              <div className="text-xs text-[#555] uppercase tracking-widest mb-1">Player 1</div>
              <div className="font-serif text-2xl md:text-3xl text-[#f5f5f5]">{p1.name}</div>
              <div className="text-xs text-[#c0392b] mt-1">{p1.country} {p1.flag}</div>
              <div className="mt-2 h-2 w-full bg-[#1a1a1a] rounded overflow-hidden">
                <motion.div
                  className="h-full bg-[#c0392b] rounded"
                  initial={{ width: 0 }}
                  animate={{ width: `${p1.dnaScore}%` }}
                  transition={{ duration: 1, delay: 0.5 }}
                />
              </div>
            </div>

            <div className="text-center">
              <div className="font-serif text-4xl md:text-6xl text-[#c0392b]" style={{ textShadow: "0 0 30px #c0392b50" }}>
                v/s
              </div>
            </div>

            <div className="text-right" data-testid="p2-header">
              <div className="text-xs text-[#555] uppercase tracking-widest mb-1">Player 2</div>
              <div className="font-serif text-2xl md:text-3xl text-[#f5f5f5]">{p2.name}</div>
              <div className="text-xs text-[#d4a500] mt-1">{p2.country} {p2.flag}</div>
              <div className="mt-2 h-2 w-full bg-[#1a1a1a] rounded overflow-hidden">
                <motion.div
                  className="h-full bg-[#d4a500] rounded ml-auto"
                  initial={{ width: 0 }}
                  animate={{ width: `${p2.dnaScore}%` }}
                  transition={{ duration: 1, delay: 0.5 }}
                  style={{ transformOrigin: "right" }}
                />
              </div>
            </div>
          </div>

          {result && (
            <div className="mb-8 border border-[#c0392b]/30 p-4 bg-[#0d0505] text-sm text-[#888]">
              <span className="text-[#c0392b] font-bold">DNA Similarity: </span>{result.dnaSimilarity}% · {result.reason}
            </div>
          )}

          <StatTable p1={p1} p2={p2} />

          <div className="mb-8">
            <h3 className="font-serif text-xl text-[#f5f5f5] mb-4">DNA Fingerprint Overlay</h3>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#222" />
                <PolarAngleAxis dataKey="axis" tick={{ fill: "#555", fontSize: 10 }} />
                <Radar name={p1.name} dataKey={p1.name} stroke="#c0392b" fill="#c0392b" fillOpacity={0.2} animationDuration={1200} />
                <Radar name={p2.name} dataKey={p2.name} stroke="#d4a500" fill="#d4a500" fillOpacity={0.1} strokeDasharray="4 2" animationDuration={1200} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#888" }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex justify-center pb-16">
            <button
              onClick={() => setShowKO(true)}
              className="px-12 py-4 text-sm font-bold tracking-[0.2em] uppercase bg-[#c0392b] text-white hover:bg-[#a93226] transition-colors"
              data-testid="declare-winner-btn"
            >
              Declare Winner — K/O
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function PlayerPicker({ onSelect }: { onSelect: (id: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const kohli = PLAYERS[0];

  const opponents = PLAYERS.filter((p) => p.id !== "virat-kohli").slice(0, 12);

  return (
    <div className="relative min-h-screen py-16 px-4 md:px-8" style={{ background: "#070707" }} data-testid="player-picker">
      <VideoBackground
        src="https://stream.mux.com/01yW6GoUz01OTXk5w1Rt1MHkJWlCGIwj46SUONJZ4DJUE.m3u8"
        opacity={0.4}
        overlayOpacity={0.78}
      />
      <div className="relative z-10 max-w-6xl mx-auto">
        <h1 className="font-serif text-4xl md:text-6xl text-[#f5f5f5] mb-2">Battle Arena</h1>
        <p className="text-[#555] text-sm mb-12">Select your challenger. Only one DNA survives.</p>

        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <div className="text-xs text-[#c0392b] tracking-widest uppercase mb-4">Player 1 — Locked</div>
            <div className="border-2 border-[#c0392b] p-6 bg-[#0d0505]">
              <div className="text-3xl font-serif text-white mb-2">{kohli.name} {kohli.flag}</div>
              <div className="text-xs text-[#c0392b] uppercase tracking-widest mb-4">{kohli.archetype}</div>
              <div className="grid grid-cols-3 gap-4 text-center border-t border-white/5 pt-4">
                {[
                  { v: kohli.odiStats.hundreds.toString(), l: "100s" },
                  { v: kohli.odiStats.avg.toFixed(1), l: "ODI Avg" },
                  { v: kohli.dnaScore.toString(), l: "DNA Score" },
                ].map((s) => (
                  <div key={s.l}>
                    <div className="text-xl font-bold text-[#d4a500]">{s.v}</div>
                    <div className="text-xs text-[#555] mt-1">{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs text-[#555] tracking-widest uppercase mb-4">Choose Opponent</div>
            <div className="grid grid-cols-2 gap-3">
              {opponents.map((p) => {
                const arch = ARCHETYPES.find((a) => a.id === p.archetypeId);
                const col = arch?.color || "#c0392b";
                const isSelected = selected === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p.id)}
                    className="relative p-4 text-left transition-all duration-200 overflow-hidden group"
                    style={{
                      border: `1px solid ${isSelected ? col : "rgba(255,255,255,0.06)"}`,
                      background: isSelected ? `${col}0d` : "#0c0c0c",
                    }}
                    data-testid={`pick-${p.id}`}
                  >
                    {isSelected && (
                      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg,transparent,${col},transparent)` }} />
                    )}
                    <div className="flex justify-between items-start mb-2">
                      <div className="text-sm text-[#ebebeb] font-medium leading-tight pr-1">{p.name}</div>
                      <span className="text-base leading-none shrink-0">{p.flag}</span>
                    </div>
                    <div className="text-[10px] uppercase tracking-wider mb-2.5" style={{ color: col }}>
                      {arch?.name}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-[#1c1c1c] relative overflow-hidden">
                        <div
                          className="absolute top-0 left-0 h-full transition-all duration-500"
                          style={{ width: isSelected ? `${p.dnaScore}%` : "0%", background: col, opacity: 0.7 }}
                        />
                      </div>
                      <span className="text-[10px] font-mono shrink-0" style={{ color: col }}>{p.dnaScore}</span>
                    </div>
                    {isSelected && (
                      <div className="mt-2.5 text-[9px] uppercase tracking-[0.2em]" style={{ color: col }}>
                        ◆ Selected
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {selected && (
          <motion.div
            className="flex justify-center mt-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <button
              onClick={() => onSelect(selected)}
              className="px-12 py-4 text-sm font-bold tracking-[0.2em] uppercase bg-[#c0392b] text-white hover:bg-[#a93226] transition-colors"
              data-testid="start-battle-btn"
            >
              Start the Battle →
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default function BattleArena() {
  const [location] = useLocation();
  const [p2Id, setP2Id] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p2 = params.get("p2");
    if (p2) setP2Id(p2);
  }, [location]);

  if (!p2Id) {
    return <PlayerPicker onSelect={(id) => setP2Id(id)} />;
  }

  return <BattleView p1Id="virat-kohli" p2Id={p2Id} />;
}
