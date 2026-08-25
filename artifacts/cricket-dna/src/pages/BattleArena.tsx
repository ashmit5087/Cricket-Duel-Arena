import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { VideoBackground } from "@/components/ui/VideoBackground";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Legend } from "recharts";
import { PLAYERS, BATTLE_RESULTS, ARCHETYPES, RADAR_AXES } from "@/data/mockData";
import type { Player } from "@/data/mockData";
import { useBattle, useStatementMoments, usePrefetchPlayer, useAlgorithms } from "@/hooks/usePlayerData";

type BattlePhase = "picker" | "intro" | "fight" | "ko";

function KOAnimation({ winner, loser, onDone }: { winner: string; loser: string; onDone: () => void }) {
  // Keep the latest callback in a ref: `onDone` is an inline arrow in
  // BattleView and changes identity on every re-render. Depending on it
  // would re-arm the auto-continue timer mid-animation.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    const timer = setTimeout(() => onDoneRef.current(), 5000);
    return () => clearTimeout(timer);
  }, []);

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

function FightIntro({
  p1, p1Arch, p2, p2Arch, onDone,
}: {
  p1: typeof PLAYERS[0];
  p1Arch: typeof ARCHETYPES[0] | undefined;
  p2: typeof PLAYERS[0];
  p2Arch: typeof ARCHETYPES[0] | undefined;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<"screen" | "vs" | "fight">("screen");

  // Keep the latest callback in a ref: `onDone` is an inline arrow in
  // BattleView, so its identity changes on every re-render (e.g. when battle
  // data loads mid-intro). Depending on it used to clear + re-arm these
  // timers, pushing the VS → FIGHT timeline back unpredictably — which is why
  // FIGHT! sometimes never fully appeared before the intro dissolved.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  // Run the timeline exactly once on mount.
  // 0–1500ms split-screen reveal → 1500–2700ms VS → 2700–4400ms FIGHT!
  useEffect(() => {
    const t1 = setTimeout(() => setPhase("vs"), 1500);
    const t2 = setTimeout(() => setPhase("fight"), 2700);
    const t3 = setTimeout(() => onDoneRef.current(), 4400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const p1Col = "#c0392b";
  const p2Col = p2Arch?.color || "#d4a500";

  return (
    <motion.div
      className="fixed inset-0 z-40 overflow-hidden bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.35 } }}
    >
      {/* Split-screen panels */}
      <div className="absolute inset-0 flex">
        {/* P1 LEFT */}
        <motion.div
          className="flex-1 relative overflow-hidden flex items-end pb-16 px-10"
          initial={{ x: "-100%" }}
          animate={{ x: 0 }}
          transition={{ type: "spring", stiffness: 110, damping: 20 }}
          style={{ borderRight: `2px solid ${p1Col}50` }}
        >
          <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse 90% 70% at 80% 65%, ${p1Col}22 0%, #000 75%)` }} />
          {/* Ghost initials */}
          <div
            className="absolute inset-0 flex items-center justify-end select-none pointer-events-none overflow-hidden"
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "min(38vw, 420px)", color: p1Col, opacity: 0.05, lineHeight: 1, paddingRight: 16 }}
          >
            {p1.name.split(" ").map((w: string) => w[0]).join("")}
          </div>
          {/* Scan line reveal */}
          <motion.div
            className="absolute inset-x-0 pointer-events-none"
            style={{ height: 80, background: `linear-gradient(to bottom, transparent, ${p1Col}18, transparent)` }}
            initial={{ top: "-80px" }}
            animate={{ top: "110%" }}
            transition={{ duration: 0.9, delay: 0.15, ease: "easeIn" }}
          />
          {/* Vertical label */}
          <div
            className="absolute left-3 top-1/2 text-[8px] uppercase tracking-[0.4em]"
            style={{ writingMode: "vertical-rl", transform: "translateY(-50%) rotate(180deg)", color: `${p1Col}50` }}
          >
            Player One
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-[0.25em] mb-3" style={{ color: p1Col }}>{p1Arch?.name || "Archetype A"}</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(58px,10vw,120px)", letterSpacing: "0.03em", lineHeight: 1 }} className="text-white">
              {p1.name.split(" ")[0]}
            </div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(58px,10vw,120px)", letterSpacing: "0.03em", lineHeight: 1, WebkitTextStroke: `2px ${p1Col}`, color: "transparent" }}>
              {p1.name.split(" ").slice(1).join(" ")}
            </div>
            <div className="flex items-center gap-2 mt-4">
              <div className="h-px w-6" style={{ background: p1Col }} />
              <span className="text-[9px] uppercase tracking-wider text-[#555]">{p1.country}</span>
              <span className="text-sm">{p1.flag}</span>
            </div>
          </div>
        </motion.div>

        {/* P2 RIGHT */}
        <motion.div
          className="flex-1 relative overflow-hidden flex items-end pb-16 px-10 justify-end"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          transition={{ type: "spring", stiffness: 110, damping: 20 }}
          style={{ borderLeft: `2px solid ${p2Col}50` }}
        >
          <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse 90% 70% at 20% 65%, ${p2Col}18 0%, #000 75%)` }} />
          <div
            className="absolute inset-0 flex items-center justify-start select-none pointer-events-none overflow-hidden"
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "min(38vw, 420px)", color: p2Col, opacity: 0.05, lineHeight: 1, paddingLeft: 16 }}
          >
            {p2.name.split(" ").map((w: string) => w[0]).join("")}
          </div>
          <motion.div
            className="absolute inset-x-0 pointer-events-none"
            style={{ height: 80, background: `linear-gradient(to bottom, transparent, ${p2Col}15, transparent)` }}
            initial={{ top: "-80px" }}
            animate={{ top: "110%" }}
            transition={{ duration: 0.9, delay: 0.35, ease: "easeIn" }}
          />
          <div
            className="absolute right-3 top-1/2 text-[8px] uppercase tracking-[0.4em]"
            style={{ writingMode: "vertical-rl", transform: "translateY(-50%)", color: `${p2Col}50` }}
          >
            Player Two
          </div>
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-[0.25em] mb-3" style={{ color: p2Col }}>{p2Arch?.name || "Archetype B"}</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(58px,10vw,120px)", letterSpacing: "0.03em", lineHeight: 1 }} className="text-white">
              {p2.name.split(" ")[0]}
            </div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(58px,10vw,120px)", letterSpacing: "0.03em", lineHeight: 1, WebkitTextStroke: `2px ${p2Col}`, color: "transparent" }}>
              {p2.name.split(" ").slice(1).join(" ")}
            </div>
            <div className="flex items-center gap-2 mt-4 justify-end">
              <span className="text-sm">{p2.flag}</span>
              <span className="text-[9px] uppercase tracking-wider text-[#555]">{p2.country}</span>
              <div className="h-px w-6" style={{ background: p2Col }} />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Global horizontal scan line */}
      <motion.div
        className="absolute inset-x-0 z-20 pointer-events-none"
        style={{ height: 3, background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.7) 50%, transparent 100%)", boxShadow: "0 0 20px 4px rgba(255,255,255,0.2)" }}
        initial={{ top: "-3px" }}
        animate={{ top: "102%" }}
        transition={{ duration: 1.4, delay: 0.05, ease: "easeIn" }}
      />

      {/* VS / FIGHT overlay — exits use short tweens so the mode="wait"
          handover is deterministic and never eats into FIGHT!'s screen time */}
      <AnimatePresence mode="wait">
        {phase === "vs" && (
          <motion.div
            key="vs"
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, transition: { type: "spring", stiffness: 260, damping: 14 } }}
            exit={{ scale: 1.8, opacity: 0, transition: { duration: 0.18, ease: "easeIn" } }}
          >
            <motion.div className="absolute inset-0 bg-white" initial={{ opacity: 0.8 }} animate={{ opacity: 0 }} transition={{ duration: 0.12 }} />
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(90px,18vw,200px)", letterSpacing: "0.1em", color: "#c0392b", textShadow: "0 0 60px #c0392b, 0 0 120px #c0392b60", lineHeight: 1 }}>
              VS
            </div>
          </motion.div>
        )}
        {phase === "fight" && (
          <motion.div
            key="fight"
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
            initial={{ y: "-25%", opacity: 0, scale: 1.2 }}
            animate={{ y: 0, opacity: 1, scale: 1, transition: { type: "spring", stiffness: 300, damping: 20 } }}
            exit={{ opacity: 0, scale: 1.15, transition: { duration: 0.2, ease: "easeIn" } }}
          >
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(70px,14vw,170px)", letterSpacing: "0.06em", color: "#fff", textShadow: "0 0 40px rgba(255,255,255,0.9), 0 0 90px #c0392b", lineHeight: 1 }}>
              FIGHT!
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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

function BattleView({ p1Id, p2Id, algorithms }: { p1Id: string; p2Id: string; algorithms: string[] }) {
  const [phase, setPhase] = useState<BattlePhase>("intro");
  const [showKO, setShowKO] = useState(false);

  // Picker → result happens on the same route, so the global ScrollToTop
  // (route-based) never fires here. Start the result page at the top instead
  // of inheriting the scroll offset from the "Run the Duel" button.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const p1 = PLAYERS.find((p) => p.id === p1Id) || PLAYERS[0];
  const p2 = PLAYERS.find((p) => p.id === p2Id) || PLAYERS[1];

  const { data: liveResult } = useBattle(p1, p2, algorithms);

  const resultKey = `${p1Id}_${p2Id}`;
  const reverseKey = `${p2Id}_${p1Id}`;
  const mockResult = BATTLE_RESULTS[resultKey] || BATTLE_RESULTS[reverseKey];
  const result: any = liveResult ?? mockResult;

  const winner = mockResult ? PLAYERS.find((p) => p.id === mockResult.winner) : p1;
  const loser = winner?.id === p1.id ? p2 : p1;

  const p1Stats = liveResult?.p1 ? { ...p1, ...liveResult.p1 } : p1;
  const p2Stats = liveResult?.p2 ? { ...p2, ...liveResult.p2 } : p2;

  const { data: moments } = useStatementMoments(p1.cricInfoId, p2.cricInfoId);

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
          <FightIntro p1={p1} p1Arch={p1Arch} p2={p2} p2Arch={p2Arch} onDone={() => setPhase("fight")} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showKO && winner && loser && (
          <KOAnimation winner={winner.name} loser={loser.name} onDone={() => setShowKO(false)} />
        )}
      </AnimatePresence>

      <div className="relative min-h-screen pt-8 px-4 md:px-8" data-testid="battle-view">
        <VideoBackground
          src="/stadium-floodlight.mp4"
          opacity={0.7}
          overlayOpacity={0.28}
        />
        {/* gradient: heavy top/bottom, open middle so stadium floodlights show */}
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, rgba(4,4,8,0.88) 0%, rgba(4,4,8,0.2) 30%, rgba(4,4,8,0.35) 65%, rgba(4,4,8,0.92) 100%)" }}
        />
        <div className="relative z-10 max-w-6xl mx-auto">

          {/* ── Reference-image style split player header ── */}
          <motion.div
            className="relative w-full overflow-hidden flex mb-10"
            style={{ height: 220, border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(8px)", background: "rgba(6,4,4,0.55)" }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* P1 LEFT */}
            <div className="flex-1 relative overflow-hidden flex items-end pb-5 pl-8 pr-4" data-testid="p1-header">
              <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(192,57,43,0.20) 0%, transparent 65%)" }} />
              {/* Ghost initials */}
              <div
                className="absolute top-0 right-[-20px] bottom-0 flex items-center select-none pointer-events-none overflow-hidden"
                style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "min(28vw,300px)", color: "#c0392b", opacity: 0.06, lineHeight: 1 }}
              >
                {p1.name.split(" ").map((w: string) => w[0]).join("")}
              </div>
              {/* Vertical label */}
              <div
                className="absolute left-3 top-1/2 text-[8px] uppercase tracking-[0.4em] text-[#c0392b]/25"
                style={{ writingMode: "vertical-rl", transform: "translateY(-50%) rotate(180deg)" }}
              >
                Player One
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-[0.22em] mb-2 text-[#c0392b]">{p1Arch?.name}</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(28px,4vw,52px)", letterSpacing: "0.04em", lineHeight: 1, textShadow: "0 2px 16px rgba(0,0,0,0.9)" }} className="text-white">
                  {p1.name.split(" ")[0]}
                </div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(28px,4vw,52px)", letterSpacing: "0.04em", lineHeight: 1, WebkitTextStroke: "1.5px rgba(192,57,43,0.75)", color: "transparent" }}>
                  {p1.name.split(" ").slice(1).join(" ")}
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <div className="h-px w-5 bg-[#c0392b]" />
                  <span className="text-[9px] text-[#4a4a4a] uppercase tracking-wider">{p1.country}</span>
                  <span className="text-sm">{p1.flag}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="relative h-[2px] w-24 bg-[#181818] overflow-hidden">
                    <motion.div className="absolute inset-y-0 left-0 bg-[#c0392b]" style={{ boxShadow: "0 0 6px #c0392b" }} initial={{ width: 0 }} animate={{ width: `${p1.dnaScore}%` }} transition={{ duration: 1.1, delay: 0.5 }} />
                  </div>
                  <span className="text-xs font-mono font-bold text-[#c0392b]">{p1.dnaScore}</span>
                </div>
              </div>
            </div>

            {/* CENTER VS */}
            <div className="relative shrink-0 flex flex-col items-center justify-center px-5" style={{ minWidth: 110 }}>
              <div className="absolute inset-y-0 left-0 w-px bg-[#c0392b]/12" />
              <div className="absolute inset-y-0 right-0 w-px" style={{ background: `${p2Arch?.color || "#d4a500"}18` }} />
              <motion.div
                style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(32px,5vw,56px)", letterSpacing: "0.1em", color: "#c0392b", textShadow: "0 0 30px #c0392b70", lineHeight: 1 }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 220, damping: 12, delay: 0.55 }}
              >
                VS
              </motion.div>
              {result && (
                <motion.div className="mt-3 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>
                  <div className="text-[7px] uppercase tracking-[0.2em] text-[#2e2e2e] mb-0.5">DNA</div>
                  <div className="text-base font-bold font-mono text-[#d4a500]">{result.dnaSimilarity}%</div>
                  <div className="text-[7px] text-[#2e2e2e] uppercase tracking-wider">Match</div>
                </motion.div>
              )}
            </div>

            {/* P2 RIGHT */}
            <div className="flex-1 relative overflow-hidden flex items-end pb-5 pr-8 pl-4 justify-end" data-testid="p2-header">
              <div className="absolute inset-0" style={{ background: `linear-gradient(225deg, ${p2Arch?.color || "#d4a500"}16 0%, transparent 65%)` }} />
              <div
                className="absolute top-0 left-[-20px] bottom-0 flex items-center select-none pointer-events-none overflow-hidden"
                style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "min(28vw,300px)", color: p2Arch?.color || "#d4a500", opacity: 0.06, lineHeight: 1 }}
              >
                {p2.name.split(" ").map((w: string) => w[0]).join("")}
              </div>
              <div
                className="absolute right-3 top-1/2 text-[8px] uppercase tracking-[0.4em]"
                style={{ writingMode: "vertical-rl", transform: "translateY(-50%)", color: `${p2Arch?.color || "#d4a500"}30` }}
              >
                Player Two
              </div>
              <div className="text-right">
                <div className="text-[9px] uppercase tracking-[0.22em] mb-2" style={{ color: p2Arch?.color }}>{p2Arch?.name}</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(28px,4vw,52px)", letterSpacing: "0.04em", lineHeight: 1, textShadow: "0 2px 16px rgba(0,0,0,0.9)" }} className="text-white">
                  {p2.name.split(" ")[0]}
                </div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(28px,4vw,52px)", letterSpacing: "0.04em", lineHeight: 1, WebkitTextStroke: `1.5px ${p2Arch?.color || "#d4a500"}70`, color: "transparent" }}>
                  {p2.name.split(" ").slice(1).join(" ")}
                </div>
                <div className="flex items-center gap-2 mt-3 justify-end">
                  <span className="text-sm">{p2.flag}</span>
                  <span className="text-[9px] text-[#4a4a4a] uppercase tracking-wider">{p2.country}</span>
                  <div className="h-px w-5" style={{ background: p2Arch?.color }} />
                </div>
                <div className="mt-3 flex items-center gap-2 justify-end">
                  <span className="text-xs font-mono font-bold" style={{ color: p2Arch?.color }}>{p2.dnaScore}</span>
                  <div className="relative h-[2px] w-24 bg-[#181818] overflow-hidden">
                    <motion.div className="absolute inset-y-0 right-0" style={{ background: p2Arch?.color, boxShadow: `0 0 6px ${p2Arch?.color}` }} initial={{ width: 0 }} animate={{ width: `${p2.dnaScore}%` }} transition={{ duration: 1.1, delay: 0.5 }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Full-width scan line reveal */}
            <motion.div
              className="absolute inset-y-0 w-[2px] pointer-events-none z-20"
              style={{ background: "linear-gradient(to bottom, transparent, rgba(255,255,255,0.7), transparent)", boxShadow: "0 0 20px 6px rgba(255,255,255,0.15)" }}
              initial={{ left: "-2px" }}
              animate={{ left: "102%" }}
              transition={{ duration: 0.9, delay: 0.1, ease: "easeInOut" }}
            />
          </motion.div>

          {result && (
            <div className="mb-6 flex flex-col gap-2">
              <div className="flex items-center gap-4 px-4 py-3" style={{ border: "1px solid rgba(192,57,43,0.2)", background: "rgba(192,57,43,0.04)" }}>
                <div className="h-px flex-1 bg-[#c0392b]/15" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-[#c0392b] font-bold">DNA Similarity: {result.dnaSimilarity}%</span>
                <span className="text-[10px] text-[#444]">
                  {result.statComparison?.reason || result.reason}
                </span>
                <div className="h-px flex-1 bg-[#c0392b]/15" />
              </div>
              
              {result.judge && (
                <div className="flex items-center gap-4 px-4 py-3" style={{ border: "1px solid rgba(212,165,0,0.2)", background: "rgba(212,165,0,0.04)" }}>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[#d4a500] font-bold mb-1">
                      The Judge Speaks ({result.judge.agreement_rate}% Agreement)
                    </span>
                    <span className="text-xs text-[#d0d0d0]">{result.judge.reasoning}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <StatTable p1={p1Stats} p2={p2Stats} />

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

          {moments && moments.length > 0 && (
            <div className="mb-8">
              <h3 className="font-serif text-xl text-[#f5f5f5] mb-4">Statement Moments</h3>
              <div className="flex flex-col gap-3">
                {moments.map((m, i) => (
                  <motion.div
                    key={i}
                    className="border border-white/5 p-4 bg-[#0d0d0d]"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-xs text-[#c0392b] font-medium">{m.playerName}</span>
                      {m.isKnockout && (
                        <span className="text-[9px] uppercase tracking-widest text-[#d4a500] border border-[#d4a500]/30 px-2 py-0.5">
                          Knockout
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-lg font-bold text-white mb-1">{m.score}</div>
                    <div className="text-xs text-[#555]">{m.match} · {m.date}</div>
                    <div className="text-xs text-[#444] mt-2 italic">{m.context}</div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

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

// ─── Player selection: two fighter slots + on-demand roster ─────────────────

type Slot = "p1" | "p2";

const SLOT_COLORS: Record<Slot, string> = { p1: "#c0392b", p2: "#d4a500" };
const SLOT_LABELS: Record<Slot, string> = { p1: "Player 1", p2: "Player 2" };

/**
 * One fighter slot. Shows the currently selected player as a rich card, or an
 * inviting empty state. Clicking opens the shared roster modal.
 */
function SlotCard({
  slot,
  player,
  onOpen,
}: {
  slot: Slot;
  player: Player | undefined;
  onOpen: () => void;
}) {
  const color = SLOT_COLORS[slot];
  const arch = player ? ARCHETYPES.find((a) => a.id === player.archetypeId) : undefined;

  return (
    <button
      onClick={onOpen}
      data-testid={`slot-${slot}`}
      className="relative overflow-hidden text-left p-6 md:p-7 min-h-60 flex flex-col cursor-pointer group transition-all duration-300 hover:-translate-y-1"
      style={{
        border: `1px solid ${player ? `${color}50` : "rgba(255,255,255,0.10)"}`,
        background: "rgba(8,8,10,0.62)",
        backdropFilter: "blur(6px)",
        boxShadow: player ? `0 8px 40px ${color}14` : "none",
      }}
    >
      {/* Accent top line + tint once a player is locked in */}
      {player && (
        <>
          <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
          <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse 130% 90% at 50% 0%, ${color}1c 0%, transparent 62%)` }} />
        </>
      )}

      {/* Header row */}
      <div className="relative flex items-center justify-between mb-6">
        <span className="text-[10px] tracking-[0.3em] uppercase font-bold" style={{ color, textShadow: `0 0 12px ${color}50` }}>
          {SLOT_LABELS[slot]}
        </span>
        <span className="text-[9px] tracking-[0.2em] uppercase text-white/30 group-hover:text-white/70 transition-colors">
          {player ? "Change ↺" : "Select +"}
        </span>
      </div>

      {player ? (
        <div className="relative mt-auto flex items-center gap-5">
          <PlayerAvatar player={player} size={88} imageSize="200" showFlag showRing animate={false} />
          <div className="min-w-0">
            <div
              className="text-white leading-[1.05] truncate"
              style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(28px, 3.2vw, 40px)", letterSpacing: "0.03em", textShadow: "0 2px 14px rgba(0,0,0,0.8)" }}
            >
              {player.name}
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-[10px] uppercase tracking-wider text-white/40">
              <span>{player.flag}</span>
              <span>{player.country}</span>
              <span className="text-white/20">·</span>
              <span>{player.role}</span>
            </div>
            {arch && (
              <div
                className="mt-2.5 inline-flex items-center gap-1.5 text-[8px] uppercase tracking-[0.18em] px-2 py-1"
                style={{ color: arch.color, background: `${arch.color}14`, border: `1px solid ${arch.color}30` }}
              >
                <span className="w-1 h-1 rounded-full" style={{ background: arch.color }} />
                {arch.name}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="relative mt-auto">
          <div className="font-serif italic text-xl md:text-2xl text-white/35 group-hover:text-white/55 transition-colors">
            Choose your challenger
          </div>
          <div className="text-[10px] text-white/25 mt-2 tracking-[0.2em] uppercase">Tap to open the roster</div>
        </div>
      )}
    </button>
  );
}

/**
 * Searchable roster modal. Only one is open at a time — the player already
 * locked in for the opposite slot is excluded to prevent a mirror match.
 */
function RosterModal({
  slot,
  excludedId,
  onPick,
  onClose,
  prefetch,
}: {
  slot: Slot;
  excludedId: string | null;
  onPick: (playerId: string) => void;
  onClose: () => void;
  prefetch: (cricInfoId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const color = SLOT_COLORS[slot];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = search.trim().toLowerCase();
  const roster = PLAYERS.filter(
    (p) =>
      p.id !== excludedId &&
      (!q ||
        p.name.toLowerCase().includes(q) ||
        p.country.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q))
  );

  return (
    <motion.div
      className="fixed inset-0 z-60 flex items-center justify-center p-4 md:p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      data-testid="roster-modal"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <motion.div
        className="relative w-full max-w-3xl flex flex-col max-h-[82vh]"
        style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(10,10,12,0.96)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}
        initial={{ y: 24, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 16, opacity: 0, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div>
            <div className="text-[9px] uppercase tracking-[0.3em] mb-0.5" style={{ color }}>
              Select {SLOT_LABELS[slot]} · {roster.length} available
            </div>
            <div className="font-serif text-lg text-white">Choose a challenger</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close roster"
            className="text-white/40 hover:text-white text-lg leading-none px-2 py-1 cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pt-4 pb-1 shrink-0">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, country or role…"
            data-testid="roster-search"
            className="w-full bg-white/4 border border-white/10 focus:border-white/25 outline-none px-4 py-2.5 text-sm text-white placeholder:text-white/25 transition-colors"
          />
        </div>

        {/* Roster grid */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {roster.length === 0 ? (
            <div className="text-center text-white/30 text-sm py-10">No players match “{search}”</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {roster.map((p) => {
                const arch = ARCHETYPES.find((a) => a.id === p.archetypeId);
                const col = arch?.color || "#888";
                return (
                  <button
                    key={p.id}
                    onClick={() => onPick(p.id)}
                    onMouseEnter={() => prefetch(p.cricInfoId)}
                    className="flex items-center gap-3 p-2.5 text-left border border-white/5 hover:border-white/20 bg-white/2 hover:bg-white/6 transition-colors cursor-pointer"
                  >
                    <PlayerAvatar player={p} size={44} imageSize="100" showFlag={false} showRing={false} animate={false} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-white/90 font-medium truncate">
                        {p.name} <span className="ml-0.5">{p.flag}</span>
                      </div>
                      <div className="text-[9px] uppercase tracking-wider truncate mt-0.5" style={{ color: `${col}cc` }}>
                        {p.role} · {arch?.name}
                      </div>
                    </div>
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: col, boxShadow: `0 0 6px ${col}` }} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function PlayerPicker({ onSelect }: { onSelect: (p1Id: string, p2Id: string, algos: string[]) => void }) {
  const [p1Id, setP1Id] = useState<string>("virat-kohli");
  const [p2Id, setP2Id] = useState<string | null>(null);
  const [selectedAlgos, setSelectedAlgos] = useState<Set<string>>(new Set(["xgboost", "random_forest"]));
  const [openSlot, setOpenSlot] = useState<Slot | null>(null);

  const { data: algorithms = [] } = useAlgorithms();
  const prefetch = usePrefetchPlayer();

  // Lock body scroll while the roster modal is open
  useEffect(() => {
    if (!openSlot) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [openSlot]);

  const handleAlgoToggle = (id: string) => {
    const next = new Set(selectedAlgos);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedAlgos(next);
  };

  const handleStart = () => {
    if (p1Id && p2Id && selectedAlgos.size >= 2) {
      onSelect(p1Id, p2Id, Array.from(selectedAlgos));
    }
  };

  const handlePick = (playerId: string) => {
    if (openSlot === "p1") setP1Id(playerId);
    else if (openSlot === "p2") setP2Id(playerId);
    setOpenSlot(null);
  };

  const p1 = PLAYERS.find((p) => p.id === p1Id);
  const p2 = p2Id ? PLAYERS.find((p) => p.id === p2Id) : undefined;

  return (
    <div className="relative min-h-screen py-16 px-4 md:px-8" data-testid="player-picker">
      <VideoBackground src="/stadium-floodlight.mp4" opacity={0.72} overlayOpacity={0.28} />
      <div className="absolute inset-0 z-0 pointer-events-none" style={{ background: "linear-gradient(to bottom, rgba(4,4,8,0.82) 0%, rgba(4,4,8,0.18) 35%, rgba(4,4,8,0.55) 75%, rgba(4,4,8,0.92) 100%)" }} />

      <div className="relative z-10 max-w-5xl mx-auto pb-20">
        <h1 className="font-serif text-3xl md:text-5xl text-[#f5f5f5] mb-1" style={{ textShadow: "0 2px 20px rgba(0,0,0,0.9)" }}>Battle Arena</h1>
        <p className="text-sm mb-10" style={{ color: "rgba(180,165,155,0.65)", textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}>Select challengers and configure the simulation.</p>

        {/* MATCHUP — two slot cards around a VS emblem */}
        <div className="grid md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-6 items-stretch mb-14">
          <SlotCard slot="p1" player={p1} onOpen={() => setOpenSlot("p1")} />

          <div className="flex items-center justify-center md:px-1">
            <div
              style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(30px, 4vw, 46px)", letterSpacing: "0.1em", color: "#c0392b", textShadow: "0 0 28px rgba(192,57,43,0.5)", lineHeight: 1 }}
            >
              VS
            </div>
          </div>

          <SlotCard slot="p2" player={p2} onOpen={() => setOpenSlot("p2")} />
        </div>

        {/* ALGORITHMS */}
        <div className="mb-12">
          <div className="text-[10px] text-white/50 tracking-widest uppercase mb-3">
            Simulation Engines <span className="text-[#c0392b] ml-2">({selectedAlgos.size} selected, min 2)</span>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            {algorithms.map((algo) => {
              const isSelected = selectedAlgos.has(algo.id);
              return (
                <button
                  key={algo.id}
                  onClick={() => handleAlgoToggle(algo.id)}
                  className="relative p-4 text-left transition-all duration-200 overflow-hidden"
                  style={{
                    border: `1px solid ${isSelected ? "#c0392b" : "rgba(255,255,255,0.07)"}`,
                    background: isSelected ? "rgba(192,57,43,0.08)" : "rgba(8,8,10,0.6)",
                  }}
                >
                  <div className="text-xs text-white font-bold uppercase tracking-wider mb-2">
                    {algo.id.replace("_", " ")}
                  </div>
                  <div className="text-[10px] text-[#888] leading-relaxed">
                    {algo.description}
                  </div>
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#c0392b] shadow-[0_0_8px_#c0392b]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {p1Id && p2Id && (
          <motion.div className="flex justify-center mt-10" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <button
              onClick={handleStart}
              disabled={selectedAlgos.size < 2}
              className={`px-12 py-4 text-sm font-bold tracking-[0.2em] uppercase transition-colors ${
                selectedAlgos.size >= 2
                  ? "bg-[#c0392b] text-white hover:bg-[#a93226]"
                  : "bg-white/10 text-white/30 cursor-not-allowed"
              }`}
            >
              Run the Duel →
            </button>
          </motion.div>
        )}
      </div>

      {/* ROSTER MODAL */}
      <AnimatePresence>
        {openSlot && (
          <RosterModal
            key={openSlot}
            slot={openSlot}
            excludedId={openSlot === "p1" ? p2Id : p1Id}
            onPick={handlePick}
            onClose={() => setOpenSlot(null)}
            prefetch={prefetch}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function BattleArena() {
  const [location] = useLocation();
  const [p1Id, setP1Id] = useState<string | null>(null);
  const [p2Id, setP2Id] = useState<string | null>(null);
  const [algorithms, setAlgorithms] = useState<string[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p1 = params.get("p1");
    const p2 = params.get("p2");
    if (p1 && p2) {
      setP1Id(p1);
      setP2Id(p2);
      setAlgorithms(["xgboost", "random_forest"]);
    }
  }, [location]);

  if (!p1Id || !p2Id || algorithms.length === 0) {
    return <PlayerPicker onSelect={(p1, p2, algos) => { setP1Id(p1); setP2Id(p2); setAlgorithms(algos); }} />;
  }

  return <BattleView p1Id={p1Id} p2Id={p2Id} algorithms={algorithms} />;
}
