import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { motion, useInView, animate, AnimatePresence } from "framer-motion";
import { VideoBackground } from "@/components/ui/VideoBackground";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, Legend } from "recharts";
import { KOHLI_CAREER, KOHLI_2022_KNOCK, PLAYERS, RADAR_AXES } from "@/data/mockData";

function CountUpStat({ value, suffix = "", prefix = "" }: { value: number; suffix?: string; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  useEffect(() => {
    if (!inView || !ref.current) return;
    const controls = animate(0, value, {
      duration: 2,
      ease: "easeOut",
      onUpdate(v) {
        if (ref.current) {
          const display = value % 1 !== 0 ? v.toFixed(1) : Math.round(v).toString();
          ref.current.textContent = prefix + display + suffix;
        }
      },
    });
    return () => controls.stop();
  }, [inView, value, suffix, prefix]);

  return <span ref={ref}>{prefix}0{suffix}</span>;
}

function HeroSection() {
  return (
    <section className="relative min-h-screen overflow-hidden" data-testid="kohli-hero">
      {/* GIF — full bleed, barely touched */}
      <div className="absolute inset-0 z-0" aria-hidden>
        <img
          src="/kohli-bg.gif"
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-top"
          style={{ opacity: 0.9 }}
        />
        {/* Only darken the left edge where text sits + the very bottom */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, rgba(8,8,8,0.88) 0%, rgba(8,8,8,0.55) 30%, rgba(8,8,8,0.08) 60%, transparent 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(8,8,8,0.35) 0%, transparent 20%, transparent 70%, rgba(8,8,8,0.97) 100%)",
          }}
        />
      </div>

      {/* Vertical side label */}
      <motion.div
        className="absolute left-8 top-1/2 z-10 -translate-y-1/2 flex flex-col items-center gap-3"
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 2, duration: 0.8, ease: "easeOut" }}
      >
        <div className="h-16 w-px bg-gradient-to-b from-transparent via-[#c0392b] to-transparent" />
        <span
          className="text-[#c0392b] text-[9px] uppercase tracking-[0.35em] font-medium"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          Archetype A
        </span>
        <div className="h-16 w-px bg-gradient-to-b from-transparent via-[#c0392b] to-transparent" />
      </motion.div>

      {/* Main text — anchored bottom-left, leaving the right for the image */}
      <div className="absolute bottom-0 left-0 z-10 px-10 md:px-16 pb-14 max-w-[55%]">
        {/* Label row */}
        <motion.div
          className="flex items-center gap-3 mb-5"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="h-px w-8 bg-[#c0392b]" />
          <span className="text-[#c0392b] text-[10px] uppercase tracking-[0.28em] font-medium">
            The Pressure Architect
          </span>
        </motion.div>

        {/* Name — clipped reveal per word */}
        <div className="overflow-hidden mb-1">
          <motion.div
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            transition={{ delay: 0.55, duration: 1, ease: [0.16, 1, 0.3, 1] }}
          >
            <span
              className="block leading-none text-white uppercase"
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: "clamp(52px, 10vw, 118px)",
                letterSpacing: "0.04em",
              }}
            >
              Virat
            </span>
          </motion.div>
        </div>
        <div className="overflow-hidden mb-6">
          <motion.div
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            transition={{ delay: 0.72, duration: 1, ease: [0.16, 1, 0.3, 1] }}
          >
            <span
              className="block leading-none uppercase"
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: "clamp(52px, 10vw, 118px)",
                letterSpacing: "0.04em",
                color: "transparent",
                WebkitTextStroke: "1.5px rgba(245,245,245,0.85)",
              }}
            >
              Kohli
            </span>
          </motion.div>
        </div>

        {/* Gold rule + subtitle */}
        <motion.div
          className="flex items-center gap-4 mb-4"
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1.1, duration: 0.8, ease: "easeOut" }}
        >
          <div className="h-px flex-1 max-w-[64px] bg-[#d4a500]" />
          <span className="text-[#6a6a6a] text-[10px] uppercase tracking-[0.22em]">
            A Monument in Numbers
          </span>
        </motion.div>

        {/* Stat pills */}
        <motion.div
          className="flex gap-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.35, duration: 0.7, ease: "easeOut" }}
        >
          {[
            { v: "80", l: "Centuries" },
            { v: "82.7", l: "Chase Avg" },
            { v: "99", l: "DNA Score" },
          ].map((s) => (
            <div key={s.l} className="flex flex-col">
              <span className="text-base font-bold font-mono text-[#d4a500] leading-none">{s.v}</span>
              <span className="text-[9px] uppercase tracking-[0.18em] text-[#444] mt-0.5">{s.l}</span>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Scroll cue — bottom right so it doesn't obscure image centre */}
      <motion.div
        className="absolute bottom-10 right-10 z-10 flex flex-col items-center gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8 }}
      >
        <span className="text-[9px] uppercase tracking-[0.25em] text-[#333]">Scroll</span>
        <motion.div
          className="w-px h-10 bg-gradient-to-b from-[#c0392b] to-transparent"
          animate={{ scaleY: [0.4, 1, 0.4], opacity: [0.4, 1, 0.4] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        />
      </motion.div>
    </section>
  );
}

function StatWall() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [spinnerDone, setSpinnerDone] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (inView) {
      [0, 1, 2, 3, 4, 5].forEach((i) => {
        setTimeout(() => setSpinnerDone((p) => ({ ...p, [i]: true })), 600 + i * 120);
      });
    }
  }, [inView]);

  const stats = [
    { value: 80, suffix: "", label: "International Centuries", accent: "#c0392b" },
    { value: 82.7, suffix: "", label: "ODI Chase Average — Highest Ever", accent: "#d4a500" },
    { value: 500, suffix: "+", label: "International Appearances", accent: "#c0392b" },
    { value: 12040, suffix: "+", label: "Test Runs — Still Climbing", accent: "#d4a500" },
    { value: 0, suffix: "", label: "ICC Tournaments Without Impact", accent: "#c0392b" },
    { value: 1, suffix: "", label: "DNA Cluster — He Stands Alone", accent: "#d4a500" },
  ];

  return (
    <section ref={ref} className="relative py-0" style={{ background: "rgba(4,4,4,0.90)" }} data-testid="stat-wall">
      {/* Ghost KOHLI background */}
      <div className="absolute inset-0 overflow-hidden select-none pointer-events-none flex items-center justify-center">
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "min(55vw,520px)", color: "#c0392b", opacity: 0.022, letterSpacing: "-0.02em", lineHeight: 1 }}>
          KOHLI
        </span>
      </div>

      {/* Top label strip */}
      <div className="relative flex items-center px-8 md:px-16 py-6 border-b border-white/4">
        <div className="h-px w-5 bg-[#c0392b] mr-3" />
        <span className="text-[8px] uppercase tracking-[0.4em] text-[#c0392b]">The Numbers Don't Lie</span>
        <div className="h-px flex-1 ml-4 bg-white/4" />
        <span className="text-[8px] uppercase tracking-[0.3em] text-[#262626] ml-4">Virat Kohli · India 🇮🇳</span>
      </div>

      <div className="relative grid grid-cols-2 md:grid-cols-3">
        {stats.map((s, i) => (
          <motion.div
            key={i}
            className="relative py-12 px-8 md:px-10"
            style={{ borderRight: i % 3 !== 2 ? "1px solid rgba(255,255,255,0.04)" : "none", borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            data-testid={`stat-block-${i}`}
          >
            {/* Left glow bar */}
            <div className="absolute left-0 top-8 bottom-8 w-[3px]" style={{ background: s.accent, boxShadow: `0 0 12px ${s.accent}55` }} />

            <AnimatePresence>
              {!spinnerDone[i] && (
                <motion.div className="absolute inset-0 flex items-center justify-center" exit={{ opacity: 0 }}>
                  <motion.div className="w-5 h-5 border" style={{ borderColor: s.accent }} animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }} />
                </motion.div>
              )}
            </AnimatePresence>

            <div className={`transition-opacity duration-500 ${spinnerDone[i] ? "opacity-100" : "opacity-0"}`}>
              <div
                style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(48px,6.5vw,76px)", letterSpacing: "0.03em", lineHeight: 1, color: s.accent, textShadow: `0 0 28px ${s.accent}35` }}
              >
                <CountUpStat value={s.value} suffix={s.suffix} />
              </div>
              <div className="text-[9px] text-[#3c3c3c] uppercase tracking-[0.2em] leading-relaxed mt-3 max-w-[180px]">{s.label}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function QuoteStrip() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <div ref={ref} className="relative py-16 px-8 md:px-16 overflow-hidden" style={{ background: "rgba(7,2,2,0.94)", borderTop: "1px solid rgba(192,57,43,0.15)", borderBottom: "1px solid rgba(192,57,43,0.15)" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(192,57,43,0.06) 0%, transparent 40%, transparent 60%, rgba(192,57,43,0.06) 100%)" }} />
      <div className="relative max-w-5xl mx-auto">
        <motion.div
          className="flex items-start gap-5"
          initial={{ opacity: 0, x: -20 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 100, color: "#c0392b", lineHeight: 0.7, opacity: 0.4, flexShrink: 0 }}>"</div>
          <div>
            <p
              style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(22px,4vw,46px)", letterSpacing: "0.04em", lineHeight: 1.15 }}
              className="text-white mb-5"
            >
              Self-belief and hard work will always earn you success.
            </p>
            <div className="flex items-center gap-3">
              <div className="h-px w-8 bg-[#c0392b]" />
              <span className="text-[9px] uppercase tracking-[0.35em] text-[#c0392b]">Virat Kohli</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

const ARCH_COLORS: Record<string, string> = {
  A: "#c0392b", B: "#4a90e2", C: "#e67e22", D: "#27ae60",
  E: "#9b59b6", F: "#1abc9c", G: "#d4a500", H: "#ff6b6b",
};
const ARCH_NAMES: Record<string, string> = {
  A: "Pressure Architect", B: "Precision Missile", C: "Chaos Agent",
  D: "Build-Up Orchestrator", E: "Spin Wizard", F: "Dual-Threat Engine",
  G: "Powerplay Destroyer", H: "DBSCAN Wildcard",
};

function ConstellationSpot() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [hovered, setHovered] = useState<string | null>(null);
  const [scanDone, setScanDone] = useState(false);

  useEffect(() => {
    if (inView) setTimeout(() => setScanDone(true), 1000);
  }, [inView]);

  const W = 680, H = 360;
  const padL = 56, padR = 20, padT = 24, padB = 52;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const batters = PLAYERS.filter((p) => p.odiStats.avg > 15 && p.odiStats.sr > 50);
  const minAvg = 30, maxAvg = 62, minSR = 68, maxSR = 106;

  const toX = (avg: number) => padL + Math.max(0, Math.min(1, (avg - minAvg) / (maxAvg - minAvg))) * plotW;
  const toY = (sr: number) => padT + plotH - Math.max(0, Math.min(1, (sr - minSR) / (maxSR - minSR))) * plotH;

  const kohli = PLAYERS.find((p) => p.id === "virat-kohli")!;
  const kX = toX(kohli.odiStats.avg);
  const kY = toY(kohli.odiStats.sr);
  const twins = kohli.dnaTwins || [];

  const hovP = batters.find((p) => p.id === hovered);
  const avgTicks = [35, 40, 45, 50, 55, 60];
  const srTicks = [75, 85, 95, 105];

  return (
    <section ref={ref} className="relative py-20 px-8 md:px-16" style={{ background: "rgba(3,3,3,0.88)" }} data-testid="constellation-spot">
      <div className="max-w-5xl mx-auto">

        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="h-px w-5 bg-[#c0392b]" />
            <span className="text-[8px] uppercase tracking-[0.35em] text-[#c0392b]">DNA Mapping · ODI Average vs Strike Rate</span>
          </div>
          <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(38px,6vw,64px)", letterSpacing: "0.04em", lineHeight: 1 }} className="text-white mb-3">
            DNA Constellation
          </h2>
          <p className="text-[#2e2e2e] text-[10px] uppercase tracking-[0.22em]">He doesn't cluster. He isolates himself at the top.</p>
        </motion.div>

        {/* Chart */}
        <div className="relative" style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(4,4,4,0.97)" }}>

          {/* Hover info panel */}
          <AnimatePresence>
            {hovP && (
              <motion.div
                className="absolute top-3 right-3 z-20 px-4 py-3 pointer-events-none"
                style={{ background: "#0c0c0c", border: `1px solid ${ARCH_COLORS[hovP.archetypeId] || "#333"}40`, minWidth: 186 }}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <div className="text-[7px] uppercase tracking-[0.28em] mb-1.5" style={{ color: ARCH_COLORS[hovP.archetypeId] || "#888" }}>
                  {ARCH_NAMES[hovP.archetypeId]}
                </div>
                <div className="text-sm font-bold text-white mb-2">{hovP.name} {hovP.flag}</div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { l: "AVG", v: hovP.odiStats.avg.toFixed(1) },
                    { l: "SR", v: hovP.odiStats.sr.toFixed(1) },
                    { l: "DNA", v: hovP.dnaScore.toString() },
                  ].map((s) => (
                    <div key={s.l}>
                      <div className="text-[7px] text-[#2a2a2a] uppercase tracking-wider">{s.l}</div>
                      <div className="text-[11px] font-bold" style={{ color: ARCH_COLORS[hovP.archetypeId] || "#d4a500" }}>{s.v}</div>
                    </div>
                  ))}
                </div>
                {twins.includes(hovP.id) && (
                  <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <span className="text-[7px] uppercase tracking-[0.2em] text-[#c0392b]">◆ DNA Twin of Kohli</span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>

            {/* Grid lines */}
            {avgTicks.map((v) => (
              <g key={`gx-${v}`}>
                <line x1={toX(v)} y1={padT} x2={toX(v)} y2={padT + plotH} stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="3 6" />
                <text x={toX(v)} y={H - 6} textAnchor="middle" fill="rgba(255,255,255,0.18)" fontSize="8" fontFamily="monospace">{v}</text>
              </g>
            ))}
            {srTicks.map((v) => (
              <g key={`gy-${v}`}>
                <line x1={padL} y1={toY(v)} x2={padL + plotW} y2={toY(v)} stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="3 6" />
                <text x={padL - 5} y={toY(v) + 3} textAnchor="end" fill="rgba(255,255,255,0.18)" fontSize="8" fontFamily="monospace">{v}</text>
              </g>
            ))}

            {/* Axes */}
            <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
            <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />

            {/* Axis labels */}
            <text x={padL + plotW / 2} y={H - 1} textAnchor="middle" fill="rgba(255,255,255,0.18)" fontSize="7.5" fontFamily="monospace" letterSpacing="2">ODI AVERAGE →</text>
            <text x={10} y={padT + plotH / 2} textAnchor="middle" fill="rgba(255,255,255,0.18)" fontSize="7.5" fontFamily="monospace" letterSpacing="2" transform={`rotate(-90,10,${padT + plotH / 2})`}>STRIKE RATE ↑</text>

            {/* Kohli zone highlight */}
            <rect x={toX(54)} y={padT} width={toX(64) - toX(54)} height={plotH} fill="rgba(192,57,43,0.04)" />
            <text x={toX(54) + 4} y={padT + 13} fill="rgba(192,57,43,0.2)" fontSize="7" fontFamily="monospace" letterSpacing="1">THE KOHLI ZONE</text>

            {/* DNA twin connection lines */}
            {scanDone && twins.map((tid: string, i: number) => {
              const tp = batters.find((p) => p.id === tid);
              if (!tp) return null;
              return (
                <motion.line
                  key={tid}
                  x1={kX} y1={kY}
                  x2={toX(tp.odiStats.avg)} y2={toY(tp.odiStats.sr)}
                  stroke="#c0392b"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.28 }}
                  transition={{ delay: i * 0.18, duration: 0.5 }}
                />
              );
            })}

            {/* Player dots */}
            {batters.map((p, i) => {
              if (p.id === kohli.id) return null;
              const col = ARCH_COLORS[p.archetypeId] || "#555";
              const r = 3 + (p.dnaScore / 100) * 3.5;
              const x = toX(p.odiStats.avg);
              const y = toY(p.odiStats.sr);
              const isHov = hovered === p.id;
              const isTwin = twins.includes(p.id);
              return (
                <motion.g
                  key={p.id}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={scanDone ? { opacity: 1, scale: 1 } : {}}
                  transition={{ delay: 0.1 + i * 0.05, type: "spring", stiffness: 220, damping: 16 }}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHovered(p.id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {isHov && <circle cx={x} cy={y} r={r + 8} fill="none" stroke={col} strokeWidth="1" opacity={0.35} />}
                  {isTwin && !isHov && (
                    <motion.g
                      style={{ transformOrigin: `${x}px ${y}px` }}
                      animate={{ scale: [1, 1.9, 1], opacity: [0.3, 0.04, 0.3] }}
                      transition={{ repeat: Infinity, duration: 2.8 }}
                    >
                      <circle cx={x} cy={y} r={r + 5} fill="none" stroke={col} strokeWidth="0.5" />
                    </motion.g>
                  )}
                  <circle cx={x} cy={y} r={r} fill={col} opacity={isHov ? 1 : isTwin ? 0.85 : 0.5} />
                  {(isTwin || isHov) && (
                    <text x={x + r + 4} y={y + 3} fill={col} fontSize="8" fontFamily="monospace" opacity={0.75}>
                      {p.name.split(" ").pop()}
                    </text>
                  )}
                </motion.g>
              );
            })}

            {/* Kohli */}
            {scanDone && (
              <motion.g
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 140, damping: 12, delay: 0.2 }}
                onMouseEnter={() => setHovered("virat-kohli")}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              >
                {[18, 27, 38].map((r, i) => (
                  <motion.g
                    key={r}
                    style={{ transformOrigin: `${kX}px ${kY}px` }}
                    animate={{ scale: [1, 1.45, 1], opacity: [0.35, 0.04, 0.35] }}
                    transition={{ repeat: Infinity, duration: 3, delay: i * 0.65 }}
                  >
                    <circle cx={kX} cy={kY} r={r} fill="none" stroke="#c0392b" strokeWidth="1" />
                  </motion.g>
                ))}
                <circle cx={kX} cy={kY} r={9} fill="#c0392b" style={{ filter: "drop-shadow(0 0 10px rgba(192,57,43,0.9))" }} />
                <circle cx={kX} cy={kY} r={3.5} fill="white" opacity={0.65} />
                <text x={kX + 14} y={kY - 8} fill="white" fontSize="10" fontFamily="'Bebas Neue',sans-serif" letterSpacing="1.5">KOHLI</text>
                <text x={kX + 14} y={kY + 6} fill="#c0392b" fontSize="7.5" fontFamily="monospace">
                  {kohli.odiStats.avg.toFixed(1)} avg · {kohli.odiStats.sr.toFixed(1)} sr
                </text>
              </motion.g>
            )}
          </svg>

          {/* Scan line overlay */}
          {inView && !scanDone && (
            <motion.div
              className="absolute inset-y-0 w-[2px] pointer-events-none"
              style={{ background: "linear-gradient(to bottom,transparent,rgba(255,255,255,0.85),transparent)", boxShadow: "0 0 18px 6px rgba(255,255,255,0.25)" }}
              initial={{ left: 0 }}
              animate={{ left: "100%" }}
              transition={{ duration: 0.9, ease: "easeInOut" }}
            />
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-5">
          {Object.entries(ARCH_NAMES).map(([id, name]) => (
            <div key={id} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ARCH_COLORS[id] }} />
              <span className="text-[7.5px] uppercase tracking-[0.18em] text-[#252525]">{name}</span>
            </div>
          ))}
        </div>

        {/* Insight callouts */}
        <div className="grid grid-cols-3 gap-0 mt-5" style={{ border: "1px solid rgba(255,255,255,0.05)" }}>
          {[
            { label: "ODI Average", value: kohli.odiStats.avg.toFixed(2), note: "Highest avg among batters charted", accent: "#c0392b" },
            { label: "DNA Score", value: String(kohli.dnaScore), note: "Outlier across all 8 dimensions", accent: "#d4a500" },
            { label: "DNA Twins", value: String(kohli.dnaTwins.length), note: "Root · Williamson · Babar", accent: "#c0392b" },
          ].map((c, i) => (
            <div key={c.label} className="px-6 py-5 relative" style={{ borderRight: i < 2 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
              <div className="absolute left-0 top-4 bottom-4 w-[2px]" style={{ background: c.accent, boxShadow: `0 0 6px ${c.accent}50` }} />
              <div className="text-[7px] uppercase tracking-[0.25em] text-[#222] mb-1">{c.label}</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, color: c.accent, lineHeight: 1 }} className="mb-1">{c.value}</div>
              <div className="text-[7px] text-[#1c1c1c] uppercase tracking-wider">{c.note}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CareerArc() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="relative py-32 px-8 md:px-16" style={{ background: "rgba(5,5,5,0.82)" }} data-testid="career-arc">
      <div className="max-w-5xl mx-auto">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-px w-5 bg-[#d4a500]" />
            <span className="text-[8px] uppercase tracking-[0.35em] text-[#d4a500]">Career Arc · 2008–2024</span>
          </div>
          <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(38px,6vw,64px)", letterSpacing: "0.04em", lineHeight: 1 }} className="text-white mb-3">
            Consistency Is His Weapon
          </h2>
          <p className="text-[#2e2e2e] text-[10px] uppercase tracking-[0.22em]">Every year. Every format. The same answer.</p>
        </div>

        {inView && (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={KOHLI_CAREER} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
              <XAxis dataKey="year" stroke="#444" tick={{ fontSize: 11, fill: "#555" }} />
              <YAxis stroke="#444" tick={{ fontSize: 11, fill: "#555" }} />
              <Tooltip
                contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 0, color: "#f5f5f5", fontSize: 12 }}
                labelStyle={{ color: "#888" }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "#888" }} />
              <ReferenceArea x1={2021} x2={2022} fill="#c0392b" fillOpacity={0.08} label={{ value: "Media declared him finished", fill: "#c0392b", fontSize: 10 }} />
              <ReferenceLine x={2011} stroke="#d4a500" strokeDasharray="3 3" label={{ value: "World Cup Win", fill: "#d4a500", fontSize: 9 }} />
              <ReferenceLine x={2016} stroke="#c0392b" strokeDasharray="3 3" label={{ value: "973 T20I runs", fill: "#c0392b", fontSize: 9 }} />
              <ReferenceLine x={2023} stroke="#d4a500" strokeDasharray="3 3" label={{ value: "Century drought ends", fill: "#d4a500", fontSize: 9 }} />
              <Line type="monotone" dataKey="test" stroke="#2b82c0" strokeWidth={2} dot={false} name="Test Avg" connectNulls animationDuration={2000} />
              <Line type="monotone" dataKey="odi" stroke="#d4a500" strokeWidth={2} dot={false} name="ODI Avg" connectNulls animationDuration={2000} />
              <Line type="monotone" dataKey="t20" stroke="#c0392b" strokeWidth={2} dot={false} name="T20 Avg" connectNulls animationDuration={2000} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function MCGMoment() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (inView) setTimeout(() => setAnimated(true), 400);
  }, [inView]);

  const ballColor: Record<string, string> = {
    dot: "#1a1a1a",
    single: "#2a2a2a",
    two: "#333",
    three: "#3a3a3a",
    four: "#185fa5",
    six: "#c0392b",
    wicket: "#666",
  };

  const isMoment = (ball: typeof KOHLI_2022_KNOCK[0]) =>
    ball.over === 18 && (ball.ball === 5 || ball.ball === 6);

  return (
    <section ref={ref} className="relative py-32 px-8 md:px-16" style={{ background: "rgba(8,4,4,0.85)" }} data-testid="mcg-moment">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="mb-12"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px w-5 bg-[#c0392b]" />
            <span className="text-[8px] uppercase tracking-[0.35em] text-[#c0392b]">The Defining Moment</span>
          </div>
          <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(32px,5.5vw,64px)", letterSpacing: "0.04em", lineHeight: 1.05 }} className="text-white mb-4">
            82* · Melbourne<br />October 23, 2022
          </h2>
          <p className="text-[#2e2e2e] text-[10px] uppercase tracking-[0.2em] max-w-lg">
            Pakistan needed one wicket. India needed 16 off 6. He was still there.
          </p>
        </motion.div>

        <div className="flex flex-wrap gap-2 mb-8">
          {KOHLI_2022_KNOCK.map((ball, i) => {
            const highlight = isMoment(ball);
            return (
              <motion.div
                key={i}
                title={ball.desc}
                className="relative group cursor-pointer"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={animated ? { opacity: 1, scale: 1 } : {}}
                transition={{ delay: i * 0.025 }}
                whileHover={{ scale: 1.2 }}
                data-testid={`ball-${i}`}
              >
                {highlight && (
                  <motion.div
                    className="absolute -inset-1 rounded"
                    style={{ background: "#c0392b", opacity: 0.3 }}
                    animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                  />
                )}
                <div
                  className="relative w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold"
                  style={{
                    background: ballColor[ball.type],
                    color: ball.type === "six" ? "#fff" : ball.type === "four" ? "#fff" : "#666",
                    border: highlight ? "1px solid #c0392b" : "1px solid transparent",
                  }}
                >
                  {ball.type === "six" ? "6" : ball.type === "four" ? "4" : ball.type === "wicket" ? "W" : ball.runs || "·"}
                </div>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-[#1a1a1a] border border-white/10 px-2 py-1 text-xs text-[#888] hidden group-hover:block z-20 text-center">
                  {ball.desc}
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-[#555]">
          {[
            { color: "#1a1a1a", label: "Dot" },
            { color: "#2a2a2a", label: "Single" },
            { color: "#185fa5", label: "Four" },
            { color: "#c0392b", label: "Six" },
            { color: "#666", label: "Wicket" },
          ].map((l) => (
            <span key={l.label} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded inline-block" style={{ background: l.color, border: "1px solid #333" }} />
              {l.label}
            </span>
          ))}
        </div>

        <div className="mt-6 p-4 border border-[#c0392b]/30 bg-[#c0392b]/5">
          <div className="text-[#c0392b] text-xs uppercase tracking-widest mb-1">The Moment</div>
          <div className="text-[#f5f5f5] text-sm">
            Over 18, Ball 5 — Haris Rauf. Back of a length. 100mph. Kohli flicks it straight back over the bowler's head for six. MCG erupts. The required rate collapses.
          </div>
        </div>
      </div>
    </section>
  );
}

function RecordWall() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  const records = [
    {
      value: "82.7",
      label: "ODI Chase Average",
      badge: "Unmatched",
      sub: "Next best ever: 58.3",
      color: "#c0392b",
      context: "The next best ever is 58.3. That's not a gap. That's a different sport.",
    },
    {
      value: "80",
      label: "International Centuries",
      badge: "Still Growing",
      sub: "Sachin retired at 100",
      color: "#d4a500",
      context: "Sachin retired. Kohli is still playing. The number keeps climbing.",
    },
    {
      value: "973",
      label: "T20I Runs in 2016",
      badge: "Unrepeated",
      sub: "Avg 106 that year",
      color: "#c0392b",
      context: "One calendar year. A format where 40 is a good score.",
    },
    {
      value: "50+",
      label: "Avg across ALL formats simultaneously",
      badge: "Unprecedented",
      sub: "Only player in history",
      color: "#d4a500",
      context: "Test. ODI. T20. All three. Same time. No one else has done this.",
    },
    {
      value: "0",
      label: "ICC tournaments without impact",
      badge: "Flawless",
      sub: "2011 / 2013 / 2022",
      color: "#c0392b",
      context: "In the games that define legacies, he showed up every single time.",
    },
    {
      value: "28",
      label: "Consecutive Test innings avg 50+",
      badge: "2016-17 Season",
      sub: "Statisticians gave up",
      color: "#d4a500",
      context: "Analysts stopped searching for comparisons. There weren't any.",
    },
  ];

  return (
    <section ref={ref} className="relative py-32 px-8 md:px-16" style={{ background: "rgba(3,3,3,0.82)" }} data-testid="record-wall">
      <div className="max-w-5xl mx-auto">
        <div className="mb-12">
          <div className="flex items-center gap-4 mb-3">
            <div className="h-px flex-1 max-w-[32px] bg-[#c0392b]" />
            <span className="text-[9px] uppercase tracking-[0.3em] text-[#c0392b]">Virat Kohli</span>
          </div>
          <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.04em", fontSize: "clamp(40px,7vw,72px)", lineHeight: 1 }} className="text-white mb-2">
            The Record Wall
          </h2>
          <p className="text-[#383838] text-xs uppercase tracking-[0.2em]">Numbers that rewrote what was possible</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border border-white/5">
          {records.map((r, i) => (
            <motion.div
              key={i}
              className="relative overflow-hidden group cursor-default border-b border-r border-white/5"
              style={{ background: "#080808" }}
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              data-testid={`record-card-${i}`}
            >
              {/* Left color accent bar */}
              <div className="absolute top-0 left-0 bottom-0 w-[3px]" style={{ background: r.color, boxShadow: `0 0 12px ${r.color}60` }} />
              {/* Aggressive diagonal pattern */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-400" style={{ background: `linear-gradient(135deg, ${r.color}08 0%, transparent 50%)` }} />
              <div className="p-6 pl-8">
                {/* Badge */}
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="text-[8px] uppercase tracking-[0.25em] px-2 py-0.5 font-bold"
                    style={{ color: r.color, border: `1px solid ${r.color}40`, background: `${r.color}10` }}
                  >
                    {r.badge}
                  </span>
                  <span className="text-[8px] uppercase tracking-[0.15em] text-[#2a2a2a]">{r.sub}</span>
                </div>
                {/* Big number */}
                <div
                  className="leading-none mb-2"
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: "clamp(52px,7vw,76px)",
                    letterSpacing: "0.02em",
                    color: r.color,
                    textShadow: `0 0 30px ${r.color}40`,
                  }}
                >
                  {r.value}
                </div>
                {/* Label */}
                <div className="text-[#b0b0b0] text-[11px] font-medium uppercase tracking-wider leading-tight mb-4">{r.label}</div>
                <div className="h-px mb-3" style={{ background: `${r.color}20` }} />
                {/* Context */}
                <div className="text-[#484848] text-[11px] leading-relaxed italic">"{r.context}"</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DNARadarSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [selected, setSelected] = useState<string | null>(null);

  const kohli = PLAYERS.find((p) => p.id === "virat-kohli")!;
  const comparison = selected ? PLAYERS.find((p) => p.id === selected) : null;

  const radarData = RADAR_AXES.map((axis, i) => ({
    axis,
    Kohli: kohli.radarValues[i],
    ...(comparison ? { [comparison.name]: comparison.radarValues[i] } : {}),
  }));

  const compareOptions = [
    { id: "sachin-tendulkar", name: "Sachin Tendulkar" },
    { id: "joe-root", name: "Joe Root" },
    { id: "kane-williamson", name: "Kane Williamson" },
    { id: "babar-azam", name: "Babar Azam" },
    { id: "steve-smith", name: "Steve Smith" },
  ];

  return (
    <section ref={ref} className="relative py-32 px-8 md:px-16" style={{ background: "rgba(5,5,5,0.82)" }} data-testid="dna-radar">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-px w-5 bg-[#c0392b]" />
            <span className="text-[8px] uppercase tracking-[0.35em] text-[#c0392b]">Performance Fingerprint</span>
          </div>
          <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(38px,6vw,64px)", letterSpacing: "0.04em", lineHeight: 1 }} className="text-white mb-3">
            8 Dimensions. 1 Outlier.
          </h2>
          <p className="text-[#2e2e2e] text-[10px] uppercase tracking-[0.22em]">Put anyone against him. See what happens.</p>
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          <button
            className={`px-4 py-2 text-xs uppercase tracking-widest border transition-colors ${selected === null ? "border-[#c0392b] text-[#c0392b]" : "border-white/10 text-[#666] hover:border-white/20"}`}
            onClick={() => setSelected(null)}
            data-testid="radar-kohli-only"
          >
            Kohli Only
          </button>
          {compareOptions.map((opt) => (
            <button
              key={opt.id}
              className={`px-4 py-2 text-xs uppercase tracking-widest border transition-colors ${selected === opt.id ? "border-[#d4a500] text-[#d4a500]" : "border-white/10 text-[#666] hover:border-white/20"}`}
              onClick={() => setSelected(opt.id)}
              data-testid={`radar-compare-${opt.id}`}
            >
              + {opt.name}
            </button>
          ))}
        </div>

        {inView && (
          <ResponsiveContainer width="100%" height={380}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#222" />
              <PolarAngleAxis dataKey="axis" tick={{ fill: "#555", fontSize: 10 }} />
              <Radar name="Virat Kohli" dataKey="Kohli" stroke="#c0392b" fill="#c0392b" fillOpacity={0.2} animationDuration={1200} />
              {comparison && (
                <Radar name={comparison.name} dataKey={comparison.name} stroke="#d4a500" fill="#d4a500" fillOpacity={0.1} strokeDasharray="4 2" animationDuration={1200} />
              )}
              <Legend wrapperStyle={{ fontSize: 11, color: "#888" }} />
            </RadarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function ChallengeCTA() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const kohli = PLAYERS.find((p) => p.id === "virat-kohli")!;

  const challengers = [
    { id: "rohit-sharma", label: "Rohit Sharma", country: "India" },
    { id: "sachin-tendulkar", label: "Sachin Tendulkar", country: "India" },
    { id: "babar-azam", label: "Babar Azam", country: "Pakistan" },
    { id: "joe-root", label: "Joe Root", country: "England" },
    { id: "steve-smith", label: "Steve Smith", country: "Australia" },
    { id: "kane-williamson", label: "Kane Williamson", country: "New Zealand" },
  ];

  return (
    <section ref={ref} className="relative" style={{ background: "rgba(3,3,3,0.88)" }} data-testid="challenge-cta">
      {/* Fight poster top banner */}
      <div
        className="relative px-8 md:px-16 py-7 flex items-center justify-between"
        style={{ borderTop: "1px solid rgba(192,57,43,0.25)", borderBottom: "1px solid rgba(192,57,43,0.12)", background: "rgba(192,57,43,0.05)" }}
      >
        <div className="flex items-center gap-4">
          <div className="h-px w-5 bg-[#c0392b]" />
          <span
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(20px,4vw,40px)", letterSpacing: "0.06em" }}
            className="text-[#c0392b]"
          >
            DNA Battle Arena
          </span>
        </div>
        <span className="text-[8px] uppercase tracking-[0.35em] text-[#2a2a2a]">Kohli vs The World</span>
      </div>

      {/* Fight poster body */}
      <div className="relative overflow-hidden" style={{ minHeight: 520 }}>
        {/* Ghost "FIGHT" background text */}
        <div className="absolute inset-0 flex items-center justify-center select-none pointer-events-none">
          <span
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "min(55vw,580px)", color: "#c0392b", opacity: 0.025, letterSpacing: "-0.02em", lineHeight: 1 }}
          >
            FIGHT
          </span>
        </div>

        <div className="relative max-w-5xl mx-auto px-8 md:px-16 py-16 grid md:grid-cols-[1fr,100px,1fr] gap-0 items-center">
          {/* Kohli card */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.15, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="p-8"
            style={{ border: "1px solid rgba(192,57,43,0.28)", background: "rgba(6,2,2,0.95)" }}
          >
            <div className="flex items-center gap-2 mb-5">
              <div className="h-px w-4 bg-[#c0392b]" />
              <span className="text-[7px] uppercase tracking-[0.4em] text-[#c0392b]">Locked In · Player 1</span>
            </div>

            <div
              style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(38px,5.5vw,64px)", letterSpacing: "0.04em", lineHeight: 1 }}
              className="text-white"
            >
              Virat
            </div>
            <div
              style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(38px,5.5vw,64px)", letterSpacing: "0.04em", lineHeight: 1, WebkitTextStroke: "1.5px rgba(192,57,43,0.8)", color: "transparent" }}
              className="mb-6"
            >
              Kohli
            </div>

            <div className="text-[8px] uppercase tracking-[0.2em] text-[#2a2a2a] mb-1">The Pressure Architect</div>
            <div className="h-px bg-white/5 mb-5" />

            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { v: kohli.odiStats.runs.toLocaleString(), l: "ODI Runs" },
                { v: kohli.odiStats.avg.toFixed(1), l: "Average" },
                { v: kohli.odiStats.hundreds.toString(), l: "Centuries" },
              ].map((s) => (
                <div key={s.l}>
                  <div
                    style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(20px,3vw,28px)", letterSpacing: "0.03em" }}
                    className="text-[#d4a500] leading-none mb-1"
                  >
                    {s.v}
                  </div>
                  <div className="text-[7px] text-[#333] uppercase tracking-[0.18em]">{s.l}</div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* VS */}
          <motion.div
            className="flex items-center justify-center py-8"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.35, type: "spring", stiffness: 220, damping: 14 }}
          >
            <div
              style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(32px,5vw,60px)", letterSpacing: "0.12em", color: "#c0392b", textShadow: "0 0 40px rgba(192,57,43,0.55)", lineHeight: 1 }}
            >
              VS
            </div>
          </motion.div>

          {/* Challenger slot */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.15, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="p-8"
            style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(10,10,10,0.9)" }}
          >
            <div className="text-[7px] uppercase tracking-[0.4em] text-[#2a2a2a] mb-5">Choose Your Fighter</div>

            <div className="space-y-2 mb-6">
              {challengers.map((c) => (
                <Link key={c.id} href={`/battle?p2=${c.id}`}>
                  <motion.div
                    className="flex items-center justify-between px-4 py-3 group cursor-pointer"
                    style={{ border: "1px solid rgba(255,255,255,0.05)", background: "rgba(14,14,14,0.9)" }}
                    whileHover={{ borderColor: "rgba(192,57,43,0.35)", x: 3 }}
                    transition={{ duration: 0.12 }}
                    data-testid={`challenger-${c.id}`}
                  >
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.15em] text-[#666] group-hover:text-white transition-colors duration-150">{c.label}</div>
                      <div className="text-[8px] text-[#2a2a2a] uppercase tracking-wider mt-0.5">{c.country}</div>
                    </div>
                    <span className="text-[#c0392b] opacity-0 group-hover:opacity-100 transition-opacity text-sm">→</span>
                  </motion.div>
                </Link>
              ))}
            </div>

            <Link href="/battle">
              <motion.button
                className="w-full py-4 text-[10px] font-bold tracking-[0.3em] uppercase text-white"
                style={{ background: "#c0392b" }}
                whileHover={{ background: "#a93226" }}
                transition={{ duration: 0.15 }}
                data-testid="choose-challenger-btn"
              >
                Enter Battle Arena →
              </motion.button>
            </Link>
          </motion.div>
        </div>
      </div>

      {/* Bottom signature strip */}
      <div
        className="px-8 md:px-16 py-5 flex items-center gap-4"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
      >
        <span className="text-[7px] uppercase tracking-[0.4em] text-[#1c1c1c]">Cricket DNA · Powered by DNA Scoring</span>
        <div className="h-px flex-1 bg-white/3" />
        <span className="text-[7px] uppercase tracking-[0.4em] text-[#1c1c1c]">Only one survives</span>
      </div>
    </section>
  );
}

function CareerTimeline() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  const knocks = [
    {
      year: "2011", runs: 107, balls: 100, notOut: false,
      vs: "Sri Lanka", format: "ODI", venue: "Delhi", event: "Asia Cup",
      sr: 107.0, fours: 10, sixes: 1,
      tagline: "THE ARRIVAL",
      context: "The innings that told the world — this is a different kind of Indian batter. Calculated. Fearless. Mature beyond his years.",
      color: "#d4a500",
    },
    {
      year: "2012", runs: 183, balls: 148, notOut: false,
      vs: "Pakistan", format: "ODI", venue: "Mirpur", event: "Asia Cup",
      sr: 123.6, fours: 22, sixes: 1,
      tagline: "THE STATEMENT",
      context: "India chased 330. He walked out at 0/1 and didn't leave until he had 183. First he made it easy. Then he made it art.",
      color: "#c0392b",
    },
    {
      year: "2019", runs: 254, balls: 336, notOut: true,
      vs: "South Africa", format: "Test", venue: "Pune", event: "Freedom Series",
      sr: 75.6, fours: 33, sixes: 1,
      tagline: "THE CROWN JEWEL",
      context: "His highest Test score. 10 hours at the crease. South Africa had no answer. Nobody did. Pure, undiluted Kohli.",
      color: "#d4a500",
    },
    {
      year: "2022", runs: 82, balls: 53, notOut: true,
      vs: "Pakistan", format: "T20I", venue: "Melbourne", event: "T20 World Cup",
      sr: 154.7, fours: 4, sixes: 6,
      tagline: "THE MCG MIRACLE",
      context: "16 needed off Haris Rauf's last over. He ended it in 4 balls. A six off the penultimate delivery. A six off the last.",
      color: "#c0392b",
    },
    {
      year: "2023", runs: 166, balls: 110, notOut: false,
      vs: "New Zealand", format: "ODI", venue: "Shrinagar", event: "ODI Series",
      sr: 150.9, fours: 13, sixes: 7,
      tagline: "THE COMEBACK",
      context: "After years of drought, he walked in and dismantled New Zealand as if he'd never left. The king returned.",
      color: "#d4a500",
    },
  ];

  return (
    <section ref={ref} className="relative" style={{ background: "rgba(2,2,2,0.92)" }} data-testid="career-timeline">
      <div className="px-8 md:px-16 pt-20 pb-4 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-px w-5 bg-[#d4a500]" />
          <span className="text-[8px] uppercase tracking-[0.35em] text-[#d4a500]">Biggest Knocks · 2011–2023</span>
        </div>
        <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(38px,6vw,64px)", letterSpacing: "0.04em", lineHeight: 1 }} className="text-white mb-3">
          When It Mattered Most
        </h2>
        <p className="text-[#282828] text-[10px] uppercase tracking-[0.22em] mb-2">Five innings that redefined what was possible</p>
      </div>

      {/* Horizontal scroll rail */}
      <div
        className="overflow-x-auto"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
      >
        <div className="flex pb-12 px-8 md:px-16" style={{ width: "max-content" }}>
          {knocks.map((k, i) => (
            <motion.div
              key={i}
              className="relative flex-shrink-0 group"
              style={{ width: 276, borderRight: "1px solid rgba(255,255,255,0.05)" }}
              initial={{ opacity: 0, y: 24 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.1, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Top color bar */}
              <div className="h-[3px]" style={{ background: k.color, boxShadow: `0 0 12px ${k.color}55` }} />

              <div className="p-7">
                {/* Year ghost + format pill */}
                <div className="flex items-start justify-between mb-3">
                  <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 52, color: k.color, opacity: 0.11, lineHeight: 1, userSelect: "none" }}>
                    {k.year}
                  </span>
                  <span
                    className="text-[7px] uppercase tracking-[0.2em] px-2 py-0.5 mt-1.5 flex-shrink-0"
                    style={{ border: `1px solid ${k.color}45`, color: k.color, background: `${k.color}09` }}
                  >
                    {k.format}
                  </span>
                </div>

                {/* Score — the hero number */}
                <div
                  style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(76px,9vw,100px)", letterSpacing: "0.01em", lineHeight: 0.88, color: k.color, textShadow: `0 0 40px ${k.color}22` }}
                  className="mb-2"
                >
                  {k.runs}{k.notOut ? "*" : ""}
                </div>
                <div className="text-[8.5px] text-[#242424] uppercase tracking-[0.2em] mb-4">
                  {k.balls} balls · SR {k.sr}
                </div>

                {/* Opposition */}
                <div className="text-[11px] text-[#525252] mb-0.5">vs {k.vs}</div>
                <div className="text-[8px] text-[#282828] uppercase tracking-wider mb-5">{k.event} · {k.venue}</div>

                {/* Stats row */}
                <div className="flex items-end gap-5 py-3.5" style={{ borderTop: "1px solid rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  {[
                    { l: "4s", v: k.fours },
                    { l: "6s", v: k.sixes },
                  ].map((s) => (
                    <div key={s.l}>
                      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: k.color, lineHeight: 1 }}>{s.v}</div>
                      <div className="text-[7px] text-[#222] uppercase tracking-wider mt-0.5">{s.l}</div>
                    </div>
                  ))}
                  <div className="ml-auto text-right">
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 10, letterSpacing: "0.14em", color: "rgba(255,255,255,0.22)", lineHeight: 1.4 }}>
                      {k.tagline}
                    </div>
                  </div>
                </div>

                {/* Context quote */}
                <p className="text-[9.5px] text-[#252525] leading-relaxed italic mt-4">
                  "{k.context}"
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Scroll hint */}
      <div className="flex items-center gap-3 px-8 md:px-16 pb-10 -mt-2">
        <div className="h-px w-4" style={{ background: "rgba(255,255,255,0.06)" }} />
        <span className="text-[7px] uppercase tracking-[0.35em] text-[#161616]">Scroll to explore all five knocks →</span>
      </div>
    </section>
  );
}

export default function KohliShrine() {
  return (
    <div className="bg-[#0a0a0a]" data-testid="kohli-shrine">
      <HeroSection />
      {/* All sections below hero share a live video background */}
      <div className="relative">
        <VideoBackground
          src="https://stream.mux.com/01yW6GoUz01OTXk5w1Rt1MHkJWlCGIwj46SUONJZ4DJUE.m3u8"
          opacity={0.32}
          overlayOpacity={0.82}
        />
        <StatWall />
        <QuoteStrip />
        <ConstellationSpot />
        <CareerArc />
        <MCGMoment />
        <CareerTimeline />
        <RecordWall />
        <DNARadarSection />
        <ChallengeCTA />
      </div>
    </div>
  );
}
