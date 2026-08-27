import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "wouter";
import { motion, useInView, AnimatePresence } from "framer-motion";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  ResponsiveContainer,
} from "recharts";
import { ARCHETYPES, PLAYERS, RADAR_AXES } from "@/data/mockData";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { useClusters, useKNNTwins } from "@/hooks/usePlayerData";

// ─── Types ────────────────────────────────────────────────────────────────────

type Archetype = typeof ARCHETYPES[0];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Slide a block of text up from behind a mask — same pattern as Home.tsx */
function CinematicLine({ text, delay = 0, className = "" }: { text: string; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <div ref={ref} className={`overflow-hidden ${className}`}>
      <motion.div
        initial={{ y: "110%" }}
        animate={inView ? { y: 0 } : { y: "110%" }}
        transition={{ duration: 1.0, delay, ease: [0.16, 1, 0.3, 1] }}
      >
        {text}
      </motion.div>
    </div>
  );
}

/** Small radar chart showing centroid (average DNA) of a cluster */
function CentroidRadar({ values, color }: { values: number[]; color: string }) {
  const data = RADAR_AXES.map((axis, i) => ({ axis, value: values[i] }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <RadarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
        <PolarGrid stroke="rgba(255,255,255,0.06)" />
        <PolarAngleAxis dataKey="axis" tick={{ fill: "#444", fontSize: 9, fontFamily: "var(--font-mono)" }} />
        <Radar dataKey="value" stroke={color} fill={color} fillOpacity={0.18} animationDuration={900} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ─── Section 1 — Hero ─────────────────────────────────────────────────────────

function Hero() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    (async () => {
      const gsap = (await import("gsap")).default;
      gsap.from(".arch-hero-word", {
        yPercent: 110,
        duration: 1.1,
        stagger: 0.07,
        ease: "power4.out",
        delay: 0.2,
      });
    })();
  }, []);

  return (
    <section
      ref={ref}
      className="relative min-h-screen flex flex-col justify-end px-8 md:px-16 lg:px-24 pb-20 overflow-hidden"
    >
      {/* ── Video background ── */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden>
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: 0.78, objectPosition: "75% center" }}
        >
          <source src="/cricket-ball-macro.mp4" type="video/mp4" />
        </video>

        {/* Gradient: open in the centre, dark at edges so text is always readable */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, rgba(4,2,2,0.97) 0%, rgba(4,2,2,0.55) 38%, rgba(4,2,2,0.05) 60%, rgba(4,2,2,0.05) 100%), linear-gradient(to bottom, rgba(4,2,2,0.65) 0%, rgba(4,2,2,0.05) 35%, rgba(4,2,2,0.4) 68%, rgba(4,2,2,0.95) 100%)",
          }}
        />

        {/* ── Veo watermark eraser (bottom-right corner) ── */}
        <div
          className="absolute bottom-0 right-0"
          style={{
            width: 220,
            height: 72,
            background:
              "radial-gradient(ellipse at 100% 100%, rgba(4,2,2,1) 30%, rgba(4,2,2,0.85) 60%, transparent 100%)",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Ambient "8" watermark – sits against the dark top area */}
      <div
        className="absolute right-0 top-0 bottom-0 flex items-center select-none pointer-events-none overflow-hidden"
        aria-hidden
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: "min(70vw, 800px)",
          color: "#c0392b",
          opacity: 0.04,
          lineHeight: 1,
        }}
      >
        8
      </div>

      {/* ── Content ── */}
      <div className="relative z-10">
        {/* Tag */}
        <motion.div
          className="flex items-center gap-3 mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.8 }}
        >
          <div className="h-px w-8" style={{ background: "#c0392b", boxShadow: "0 0 8px rgba(192,57,43,0.6)" }} />
          <span
            className="text-[10px] uppercase tracking-[0.3em] font-semibold"
            style={{
              color: "#e05540",
              textShadow: "0 0 12px rgba(224,85,64,0.5), 0 1px 4px rgba(0,0,0,0.9)",
            }}
          >
            K-Means · DBSCAN · t-SNE
          </span>
        </motion.div>

        {/* Headline */}
        <h1
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: "clamp(64px, 13vw, 160px)",
            letterSpacing: "0.04em",
            lineHeight: 0.92,
            textShadow: "0 4px 32px rgba(0,0,0,0.9), 0 1px 6px rgba(0,0,0,1)",
          }}
        >
          {"THE 8".split("").map((ch, i) => (
            <span key={i} className="inline-block overflow-hidden" style={{ marginRight: ch === " " ? "0.25em" : 0 }}>
              <span className="arch-hero-word block" style={{ color: "#f2ece8" }}>{ch === " " ? "\u00A0" : ch}</span>
            </span>
          ))}
          <br />
          {"TRIBES".split("").map((ch, i) => (
            <span key={i} className="inline-block overflow-hidden">
              <span
                className="arch-hero-word block"
                style={{ WebkitTextStroke: "1.5px rgba(224,85,64,0.85)", color: "transparent" }}
              >
                {ch}
              </span>
            </span>
          ))}
        </h1>

        {/* Subtext */}
        <div className="mt-8 overflow-hidden">
          <motion.p
            className="text-sm md:text-base max-w-xl leading-relaxed"
            style={{ color: "rgba(200,185,175,0.7)", textShadow: "0 1px 6px rgba(0,0,0,0.95)" }}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            K-Means clustering on 20 performance dimensions found these groups.
            No labels were applied. No positions were considered.
            <span style={{ color: "rgba(220,200,190,0.85)" }}> Only the data.</span>
          </motion.p>
        </div>

        {/* Archetype color strip */}
        <motion.div
          className="flex gap-1 mt-10"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1, duration: 0.7 }}
        >
          {ARCHETYPES.map((a) => (
            <div
              key={a.id}
              className="h-1 flex-1 rounded-full"
              style={{ background: a.color, opacity: 0.8 }}
              title={a.name}
            />
          ))}
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6 }}
      >
        <span
          className="text-[9px] uppercase tracking-[0.3em]"
          style={{ color: "rgba(200,180,170,0.5)", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}
        >
          Scroll
        </span>
        <motion.div
          className="w-px h-10 bg-gradient-to-b from-[#e05540] to-transparent"
          animate={{ scaleY: [1, 0.4, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>
    </section>
  );
}

// ─── Section 2 — Stacking Intro Cards ────────────────────────────────────────

const INTRO_CARDS = [
  {
    num: "01",
    accent: "#c0392b",
    title: "Every cricketer becomes 20 numbers",
    body: "Dot ball %, yorker frequency, chasing average, phase-wise strike rate, knockout performance differential — 20 dimensions that describe exactly how someone plays, not what position they wear.",
  },
  {
    num: "02",
    accent: "#d4a500",
    title: "Clusters form without labels",
    body: "The algorithm doesn't know Kohli is a batter. It doesn't know Bumrah is Indian. It sees vectors. It finds proximity. The clusters that emerge are earned by the numbers alone.",
  },
  {
    num: "03",
    accent: "#8b5cf6",
    title: "Archetypes are discovered, not invented",
    body: "We didn't define \"The Pressure Architect\" before running the model. The centroid of Cluster A — high chase avg, elite pressure score, peak big-match differential — told us what to call it.",
  },
  {
    num: "04",
    accent: "#0f6e56",
    title: "Cross-era twins appear naturally",
    body: "Jasprit Bumrah and Lasith Malinga share 91% DNA similarity. They never played in the same era. The data found what the eye already suspected.",
  },
];

function StackingCards() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    (async () => {
      const gsap = (await import("gsap")).default;
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);

      const cards = sectionRef.current?.querySelectorAll<HTMLElement>(".stack-card");
      if (!cards?.length) return;

      cards.forEach((card, i) => {
        ScrollTrigger.create({
          trigger: card,
          start: `top ${72 + i * 10}px`,
          endTrigger: sectionRef.current!,
          end: "bottom 80px",
          pin: true,
          pinSpacing: false,
        });
      });

      cleanup = () => ScrollTrigger.getAll().forEach((t) => t.kill());
    })();
    return () => cleanup?.();
  }, []);

  return (
    <div ref={sectionRef} className="relative px-8 md:px-16 lg:px-24 pb-16" style={{ background: "#0a0a0a" }}>
      <div className="max-w-3xl mx-auto">
        <CinematicLine
          text="How the algorithm works"
          className="font-serif text-2xl md:text-3xl text-[#f5f5f5] mb-12"
        />
        {INTRO_CARDS.map((card, i) => (
          <div
            key={card.num}
            className="stack-card will-change-transform"
            style={{ marginBottom: 80 }}
          >
            <div
              className="border p-8 md:p-10"
              style={{
                background: "#0d0d0d",
                borderColor: `${card.accent}22`,
                boxShadow: `0 0 0 1px ${card.accent}08`,
              }}
            >
              <div className="flex items-start justify-between mb-6">
                <span
                  className="font-mono text-xs tracking-[0.2em] opacity-40"
                  style={{ color: card.accent }}
                >
                  {card.num}
                </span>
                <div className="h-px flex-1 mx-6 mt-2" style={{ background: `${card.accent}20` }} />
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: card.accent }} />
              </div>
              <h3
                className="font-serif text-xl md:text-2xl text-[#f0f0f0] mb-4 leading-snug"
              >
                {card.title}
              </h3>
              <p className="text-[#555] text-sm leading-relaxed">{card.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section 3 — Sticky Archetype Explorer ────────────────────────────────────

function ArchetypeRow({ archetype }: { archetype: Archetype }) {
  const members = PLAYERS.filter((p) => p.archetypeId === archetype.id);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: "-35% 0px -35% 0px" });

  return (
    <div
      ref={ref}
      data-archetype-id={archetype.id}
      className="min-h-[70vh] flex flex-col justify-center py-16 border-b"
      style={{ borderColor: "rgba(255,255,255,0.04)" }}
    >
      {/* Mobile-only name (hidden on desktop where sticky panel shows it) */}
      <div className="lg:hidden mb-6">
        <div
          className="text-[10px] uppercase tracking-[0.2em] font-medium mb-1"
          style={{ color: archetype.color }}
        >
          Archetype {archetype.id}
        </div>
        <h2 className="font-serif text-2xl text-white">{archetype.name}</h2>
      </div>

      <motion.div
        initial={{ opacity: 0, x: 24 }}
        animate={inView ? { opacity: 1, x: 0 } : { opacity: 0.3, x: 24 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Description */}
        <p className="text-[#666] text-sm leading-relaxed mb-8 max-w-md">
          {archetype.description}
        </p>

        {/* Centroid radar */}
        <div className="mb-8" style={{ border: "1px solid rgba(255,255,255,0.04)", background: "#0d0d0d" }}>
          <div className="pt-4 px-4">
            <span className="text-[9px] uppercase tracking-[0.2em] text-[#333]">DNA Centroid — average of all cluster members</span>
          </div>
          <CentroidRadar values={archetype.centroidValues} color={archetype.color} />
        </div>

        {/* Player pills */}
        <div className="mb-6">
          <div className="text-[9px] uppercase tracking-[0.2em] text-[#333] mb-3">Members</div>
          <div className="flex flex-wrap gap-3">
            {members.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <PlayerAvatar
                  player={p}
                  size={36}
                  imageSize="100"
                  showFlag={false}
                  showRing={false}
                  animate={false}
                />
                <div>
                  <div className="text-xs text-[#ccc] leading-none">{p.name}</div>
                  <div className="text-[10px] text-[#444] mt-0.5">{p.flag} {p.country}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Key DNA stat highlight */}
        <div
          className="inline-flex items-center gap-3 px-4 py-2 text-xs"
          style={{ border: `1px solid ${archetype.color}30`, background: `${archetype.color}08` }}
        >
          <div className="w-1 h-1 rounded-full" style={{ background: archetype.color }} />
          <span style={{ color: archetype.color }}>
            {archetype.id === "A" && "Chase avg > 55 · Big-match differential +12"}
            {archetype.id === "B" && "Death economy < 7.5 · Dot ball % > 38"}
            {archetype.id === "C" && "Boundary % > 18 in T20 · SR spikes in overs 16–20"}
            {archetype.id === "D" && "Team-win correlation > 0.72 · Control % > 85"}
            {archetype.id === "E" && "Economy < 2.8 in Tests · 5-fers in knockouts"}
            {archetype.id === "F" && "Bat + bowl contribute in same match wins > 65%"}
            {archetype.id === "G" && "PP boundary % > 22 · First 6 overs SR > 100"}
            {archetype.id === "H" && "DBSCAN label: noise — no cluster could contain him"}
          </span>
        </div>
      </motion.div>
    </div>
  );
}

function StickyExplorer() {
  const [activeId, setActiveId] = useState("A");
  const { data: clusters } = useClusters();
  const archetypes = clusters?.length ? clusters : ARCHETYPES;
  const activeArch = archetypes.find((a) => a.id === activeId) || archetypes[0];
  const rightRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver watches each archetype section, updates left panel
  useEffect(() => {
    const sections = rightRef.current?.querySelectorAll("[data-archetype-id]");
    if (!sections?.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = (entry.target as HTMLElement).dataset.archetypeId;
            if (id) setActiveId(id);
          }
        });
      },
      { threshold: 0.35 }
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  return (
    <section
      className="relative px-8 md:px-16 lg:px-24 py-16"
      style={{ background: "#080808" }}
    >
      {/* Section label */}
      <div className="flex items-center gap-4 mb-16">
        <div className="h-px w-8 bg-[#c0392b]" />
        <span className="text-[#c0392b] text-[10px] uppercase tracking-[0.3em]">Archetype Explorer</span>
      </div>

      <div className="flex gap-12 lg:gap-20 relative max-w-6xl mx-auto">

        {/* ── LEFT — sticky panel ── */}
        <div className="hidden lg:block w-[340px] shrink-0">
          <div className="sticky" style={{ top: 72 }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeId}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Archetype ID large */}
                <div
                  className="font-serif leading-none mb-1"
                  style={{ fontSize: "clamp(72px, 10vw, 120px)", color: activeArch.color, opacity: 0.15 }}
                >
                  {activeId}
                </div>

                {/* Small label */}
                <div
                  className="text-[10px] uppercase tracking-[0.25em] font-medium mb-3 -mt-8"
                  style={{ color: activeArch.color }}
                >
                  Archetype {activeId}
                </div>

                {/* Name */}
                <h2 className="font-serif text-2xl text-[#f0f0f0] mb-4 leading-snug">
                  {activeArch.name}
                </h2>

                {/* Thin colour bar */}
                <motion.div
                  className="h-px mb-6"
                  style={{ background: `linear-gradient(to right, ${activeArch.color}, transparent)` }}
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 0.5 }}
                />

                {/* Example players */}
                <div className="mb-6">
                  <div className="text-[9px] uppercase tracking-[0.2em] text-[#333] mb-3">Defining members</div>
                  <div className="flex flex-col gap-2">
                    {activeArch.examplePlayers.map((name) => {
                      const player = PLAYERS.find((p) => p.name === name);
                      return (
                        <div key={name} className="flex items-center gap-3">
                          {player ? (
                            <PlayerAvatar player={player} size={32} imageSize="100" showFlag={false} showRing={false} animate={false} />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[#1a1a1a]" />
                          )}
                          <span className="text-[#888] text-xs">{name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Archetype progress dots */}
                <div className="flex items-center gap-2 mt-8">
                  {archetypes.map((a) => (
                    <div
                      key={a.id}
                      className="h-1 flex-1 rounded-full transition-all duration-300"
                      style={{
                        background: a.id === activeId ? a.color : "rgba(255,255,255,0.05)",
                        opacity: a.id === activeId ? 1 : 0.4,
                      }}
                    />
                  ))}
                </div>
                <div className="text-[9px] text-[#333] uppercase tracking-wider mt-2">
                  {archetypes.findIndex((a) => a.id === activeId) + 1} of {archetypes.length}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* ── RIGHT — scrolling archetype sections ── */}
        <div ref={rightRef} className="flex-1 min-w-0">
          {archetypes.filter((a) => a.id !== "H").map((arch) => (
            <ArchetypeRow key={arch.id} archetype={arch} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section 4 — Dhoni Wildcard ───────────────────────────────────────────────

function DhoniWildcard() {
  const dhoni = PLAYERS.find((p) => p.id === "ms-dhoni")!;
  const arch = ARCHETYPES.find((a) => a.id === "H")!;
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section
      ref={ref}
      className="relative py-24 px-8 md:px-16 lg:px-24 overflow-hidden"
      style={{ background: "#0a0505" }}
      data-archetype-id="H"
    >
      {/* Ambient H watermark */}
      <div
        className="absolute right-0 top-0 bottom-0 flex items-center select-none pointer-events-none"
        aria-hidden
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: "min(60vw, 700px)",
          color: "#6b7280",
          opacity: 0.04,
          lineHeight: 1,
        }}
      >
        H
      </div>

      <div className="relative max-w-5xl mx-auto">
        {/* Label */}
        <motion.div
          className="flex items-center gap-3 mb-10"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 0.2 }}
        >
          <div className="h-px w-8 bg-[#6b7280]" />
          <span className="text-[#6b7280] text-[10px] uppercase tracking-[0.3em]">Archetype H · DBSCAN Wildcard</span>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left — text */}
          <div>
            <CinematicLine
              text="The algorithm"
              className="font-serif text-4xl md:text-6xl text-[#f5f5f5] leading-none"
              delay={0.1}
            />
            <CinematicLine
              text="gave up."
              className="font-serif text-4xl md:text-6xl leading-none mb-8"
              delay={0.25}
            />
            <div
              className="h-px w-24 mb-8"
              style={{ background: "linear-gradient(to right, #6b7280, transparent)" }}
            />
            <motion.p
              className="text-[#555] text-sm leading-relaxed mb-6"
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ delay: 0.6 }}
            >
              DBSCAN — Density-Based Spatial Clustering — doesn't just group players.
              It also identifies <span className="text-[#888]">outliers</span>: points so unlike any cluster
              that they exist outside all categories.
            </motion.p>
            <motion.p
              className="text-[#444] text-sm leading-relaxed mb-8"
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ delay: 0.75 }}
            >
              MS Dhoni was labeled <span className="font-mono text-[#6b7280]">noise</span>.
              Not because his data was wrong. Because captaincy impact, keeping reflexes,
              death-batting genius, and finishing instinct combine in a vector space
              no other human occupies.
            </motion.p>

            {/* Quote */}
            <motion.div
              className="border-l-2 border-[#6b7280] pl-6 py-2"
              initial={{ opacity: 0, x: -12 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.9 }}
            >
              <p className="text-[#666] text-sm italic leading-relaxed">
                "The algorithm ran 10,000 iterations. It calculated distance matrices
                across 20 dimensions. Then it looked at MS Dhoni and simply
                <span className="text-[#888] not-italic"> refused to place him anywhere.</span>"
              </p>
            </motion.div>

            {/* Dhoni stats row */}
            <motion.div
              className="grid grid-cols-3 gap-4 mt-10"
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 1.1 }}
            >
              {[
                { v: "91.02", l: "Finishing avg (last 10 balls)" },
                { v: "250+", l: "Games won as captain" },
                { v: "0", l: "Clusters that could hold him" },
              ].map((s) => (
                <div key={s.l} className="border border-[#6b7280]/15 p-4" style={{ background: "#0d0808" }}>
                  <div className="text-xl font-mono font-bold text-[#6b7280] mb-1">{s.v}</div>
                  <div className="text-[10px] text-[#333] leading-tight uppercase tracking-wide">{s.l}</div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right — Dhoni avatar + radar */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.4, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center gap-8"
          >
            {dhoni && (
              <PlayerAvatar
                player={dhoni}
                size={160}
                imageSize="340"
                showFlag={true}
                showRing={true}
                animate={false}
              />
            )}

            {/* His radar — near-perfect across all axes */}
            <div
              className="w-full"
              style={{ border: "1px solid rgba(107,114,128,0.15)", background: "#0d0808" }}
            >
              <div className="px-4 pt-3">
                <span className="text-[9px] uppercase tracking-[0.2em] text-[#333]">
                  DNA Fingerprint — why no cluster could contain him
                </span>
              </div>
              <CentroidRadar values={arch.centroidValues} color="#6b7280" />
            </div>

            <p className="text-[10px] text-[#2a2a2a] text-center uppercase tracking-wider">
              Every axis above 78. No archetype centroid looks like this.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ─── Section 5 — Viral Findings ───────────────────────────────────────────────
// ─── Section 5 — Viral Findings ───────────────────────────────────────────────────────────────

const VIRAL_PAIRS = [
  {
    p1: "jasprit-bumrah",
    p2: "lasith-malinga",
    similarity: 91,
    finding: "Different arms. Different decades. Different countries. The algorithm sees one bowler.",
    color: "#185fa5",
  },
  {
    p1: "virat-kohli",
    p2: "sachin-tendulkar",
    similarity: 82,
    finding: "Kohli's era, Sachin's numbers. Two players. One archetype. The Pressure Architect claims both.",
    color: "#c0392b",
  },
  {
    p1: "rahul-dravid",
    p2: "kumar-sangakkara",
    similarity: 88,
    finding: "India's Wall meets Sri Lanka's greatest. Their construction instinct is indistinguishable from the data's perspective.",
    color: "#0f6e56",
  },
  {
    p1: "rohit-sharma",
    p2: "chris-gayle",
    similarity: 79,
    finding: "Power vs elegance is a myth the stats refuse to respect. Both are Powerplay Destroyers at 99th percentile.",
    color: "#ec4899",
  },
];

// One card in the Viral Findings grid. Resolves the live similarity by
// asking the KNN endpoint for p1's top twins and looking up p2 — if the
// partner is in the returned list, the live similarity is used; otherwise
// the hardcoded value from VIRAL_PAIRS stands in.
function ViralPairCard({
  pair,
  index,
  inView,
}: {
  pair: typeof VIRAL_PAIRS[number];
  index: number;
  inView: boolean;
}) {
  const p1 = PLAYERS.find((p) => p.id === pair.p1);
  const p2 = PLAYERS.find((p) => p.id === pair.p2);
  // Live KNN for p1. The hook uses p1's cricInfoId as the enabled-gate.
  const { data: knn } = useKNNTwins(pair.p1, p1?.cricInfoId);
  const liveTwin = knn?.twins?.find((t) => t.id === pair.p2);
  const similarity = liveTwin?.similarity ?? pair.similarity;

  if (!p1 || !p2) return null;

  return (
    <motion.div
      className="border p-6"
      style={{
        borderColor: `${pair.color}18`,
        background: "#0b0b0b",
      }}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: 0.15 * index, duration: 0.6 }}
    >
      {/* Players row */}
      <div className="flex items-center gap-4 mb-5">
        <PlayerAvatar player={p1} size={48} imageSize="100" showFlag={true} showRing={false} animate={false} />
        <div className="flex flex-col items-center gap-1 flex-1">
          <div
            className="text-xs font-mono font-bold"
            style={{ color: pair.color }}
          >
            {similarity}%
          </div>
          <div className="w-full h-px" style={{ background: `linear-gradient(to right, transparent, ${pair.color}60, transparent)` }} />
          <div className="text-[9px] text-[#333] uppercase tracking-wider">DNA match</div>
        </div>
        <PlayerAvatar player={p2} size={48} imageSize="100" showFlag={true} showRing={false} animate={false} />
      </div>

      {/* Names */}
      <div className="flex justify-between mb-4">
        <span className="text-xs text-[#888]">{p1.name}</span>
        <span className="text-xs text-[#888]">{p2.name}</span>
      </div>

      {/* Finding text */}
      <p className="text-[#555] text-xs leading-relaxed border-t border-white/4 pt-4">
        {pair.finding}
      </p>
    </motion.div>
  );
}

function ViralFindings() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section
      ref={ref}
      className="py-20 px-8 md:px-16 lg:px-24"
      style={{ background: "#080808" }}
    >
      <div className="max-w-6xl mx-auto">
        <CinematicLine
          text="The findings that go viral"
          className="font-serif text-2xl md:text-4xl text-[#f5f5f5] mb-3"
        />
        <motion.p
          className="text-[#444] text-sm mb-14 max-w-lg"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 0.4 }}
        >
          These cross-era pairings weren't designed. They fell out of the model.
        </motion.p>

        <div className="grid md:grid-cols-2 gap-5">
          {VIRAL_PAIRS.map((pair, i) => (
            <ViralPairCard key={i} pair={pair} index={i} inView={inView} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section 6 — CTA ─────────────────────────────────────────────────────────

function CTASection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section
      ref={ref}
      className="py-28 px-8 md:px-16 lg:px-24 text-center"
      style={{ background: "#0a0a0a", borderTop: "1px solid rgba(255,255,255,0.04)" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="text-[10px] uppercase tracking-[0.3em] text-[#c0392b] mb-6">
          Find your player
        </div>
        <h2 className="font-serif text-3xl md:text-5xl text-[#f5f5f5] mb-4">
          Which tribe does your player belong to?
        </h2>
        <p className="text-[#444] text-sm mb-12 max-w-md mx-auto">
          Enter any cricketer in the DNA Search engine and find their archetype, their nearest twins, and who they've never played against but are statistically identical to.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link href="/search">
            <motion.button
              className="px-10 py-4 text-sm font-bold tracking-[0.2em] uppercase text-white"
              style={{ background: "#c0392b" }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              Open DNA Search →
            </motion.button>
          </Link>
          <Link href="/constellation">
            <motion.button
              className="px-10 py-4 text-sm tracking-[0.2em] uppercase text-[#555] border border-white/8 hover:border-white/20 hover:text-[#888] transition-colors"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              View Constellation
            </motion.button>
          </Link>
        </div>
      </motion.div>
    </section>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────

export default function Archetypes() {
  return (
    <div style={{ background: "#0a0a0a" }}>
      <Hero />
      <StackingCards />
      <StickyExplorer />
      <DhoniWildcard />
      <ViralFindings />
      <CTASection />
    </div>
  );
}
