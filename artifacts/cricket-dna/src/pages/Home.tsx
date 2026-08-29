import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { motion, useScroll, useTransform, useInView, animate } from "framer-motion";
import { ARCHETYPES, PLAYERS, RADAR_AXES } from "@/data/mockData";
import { useKohliShrine, useLiveTicker } from "@/hooks/usePlayerData";

// The scraper only has a URL slug for each live match (e.g.
// "india-vs-australia-3rd-odi"), not a clean display name — turn it into
// "India Vs Australia 3rd Odi" for the ticker.
function formatMatchSlug(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function HeroSection() {
  const heroRef = useRef<HTMLDivElement>(null);
  const [currentWord, setCurrentWord] = useState(0);
  const [flipping, setFlipping] = useState(false);
  const words = ["Precision", "Obsession", "Consistency", "Dominance", "Legacy"];

  // Live data hookups — the hero copy and stat strip both fall through to
  // the mock if the API hasn't responded yet, so the page never looks empty.
  const { data: shrine } = useKohliShrine();
  const { data: ticker } = useLiveTicker();

  // Derived from the live Kohli snapshot. Total international matches =
  // TEST + ODI + T20I, the only place this exact sum is meaningful.
  const kohliMock = PLAYERS.find((p) => p.id === "virat-kohli")!;
  const liveOdiHundreds = shrine?.currentStats?.hundreds;
  const liveOdiAvg      = shrine?.currentStats?.avg;
  const liveOdiMatches  = shrine?.currentStats?.matches;
  const liveTestMatches = kohliMock.testStats.matches;
  const liveT20Matches  = kohliMock.t20Stats.matches;
  const liveIntlTotal =
    (liveOdiMatches  ?? 0) +
    (liveTestMatches ?? 0) +
    (liveT20Matches  ?? 0);
  const liveMatchCount = ticker?.count ?? 0;

  useEffect(() => {
    let gsap: typeof import("gsap").default;
    let ScrollTrigger: typeof import("gsap/ScrollTrigger").ScrollTrigger;
    (async () => {
      gsap = (await import("gsap")).default;
      const st = await import("gsap/ScrollTrigger");
      ScrollTrigger = st.ScrollTrigger;
      gsap.registerPlugin(ScrollTrigger);

      gsap.from(".hero-word", {
        yPercent: 110,
        duration: 1.1,
        stagger: 0.08,
        ease: "power4.out",
        delay: 0.3,
      });
    })();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setFlipping(true);
      setTimeout(() => {
        setCurrentWord((prev) => (prev + 1) % words.length);
        setFlipping(false);
      }, 350);
    }, 2200);
    return () => clearInterval(interval);
  }, [words.length]);

  return (
    <section
      ref={heroRef}
      className="relative overflow-hidden flex flex-col items-start justify-end min-h-screen px-8 md:px-16 lg:px-24 pb-20"
      data-testid="hero-section"
    >
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden>
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: 0.82 }}
        >
          <source src="/stadium-hero.mp4" type="video/mp4" />
        </video>
        {/* top vignette – keeps sky legible; heavy bottom block anchors the text */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(4,6,10,0.55) 0%, rgba(4,6,10,0.15) 38%, rgba(4,6,10,0.55) 65%, rgba(4,6,10,0.92) 100%)" }} />
      </div>

      {/* large ghosted number – pushed toward top so it reads against the stadium sky */}
      <div className="absolute top-0 inset-x-0 flex items-start justify-end z-0 pointer-events-none select-none overflow-hidden pr-16 pt-8" aria-hidden>
        <span style={{ fontSize: "clamp(160px,22vw,360px)", color: "rgba(255,255,255,0.03)", fontFamily: "Playfair Display, Georgia, serif", fontWeight: 900, lineHeight: 1, userSelect: "none" }}>18</span>
      </div>

      <div className="relative z-10 max-w-5xl w-full">
        <div className="mb-4">
          <span
            className="text-xs tracking-[0.3em] uppercase font-semibold"
            style={{
              color: "#e8b84b",
              textShadow: "0 0 18px rgba(232,184,75,0.55), 0 1px 3px rgba(0,0,0,0.8)",
            }}
          >
            AI Cricket Intelligence Platform
          </span>
        </div>

        <h1
          className="font-serif mb-5 leading-none"
          style={{
            fontSize: "clamp(38px,7.5vw,105px)",
            color: "#f0ede6",
            textShadow: "0 2px 24px rgba(0,0,0,0.85), 0 1px 4px rgba(0,0,0,0.9)",
          }}
          data-testid="hero-headline"
        >
          {["Not", "a", "batter.", "Not", "a", "captain.", "A", "standard."].map((word, i) => (
            <span key={i} className="inline-block overflow-hidden mr-[0.25em] last:mr-0">
              <span className="hero-word inline-block">{word}</span>
            </span>
          ))}
        </h1>

        <div
          className="flex items-center gap-3 mb-5 text-lg md:text-2xl"
          style={{ perspective: "1000px", color: "rgba(220,210,190,0.75)", textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}
        >
          <span>Cricket DNA measures</span>
          <span
            className="inline-block font-semibold"
            style={{
              color: "#e8b84b",
              textShadow: "0 0 14px rgba(232,184,75,0.45), 0 1px 4px rgba(0,0,0,0.9)",
              transformStyle: "preserve-3d",
              transform: flipping ? "rotateX(-90deg)" : "rotateX(0deg)",
              transition: "transform 0.35s ease",
              minWidth: "180px",
            }}
          >
            {words[currentWord]}
          </span>
        </div>

        <p className="text-sm md:text-base mb-10 max-w-xl leading-relaxed" style={{ color: "rgba(190,180,160,0.72)", textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}>
          {liveOdiHundreds != null
            ? `${liveOdiHundreds} ODI centuries. ${liveIntlTotal.toLocaleString()} international matches. One archetype: The Pressure Architect.`
            : `80 international centuries. 500+ matches. One archetype: The Pressure Architect.`}
        </p>

        <div className="flex gap-4 flex-wrap mb-14">
          <Link href="/constellation">
            <button
              className="px-7 py-3 text-sm font-semibold tracking-widest uppercase text-white transition-all"
              style={{ background: "#c0392b", boxShadow: "0 0 20px rgba(192,57,43,0.45)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#a93226")}
              onMouseLeave={e => (e.currentTarget.style.background = "#c0392b")}
              data-testid="cta-constellation"
            >
              Explore Constellation →
            </button>
          </Link>
          <Link href="/kohli">
            <button
              className="px-7 py-3 text-sm font-semibold tracking-widest uppercase transition-all"
              style={{ border: "1px solid #e8b84b", color: "#e8b84b", boxShadow: "0 0 16px rgba(232,184,75,0.2)", background: "transparent" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(232,184,75,0.1)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              data-testid="cta-shrine"
            >
              Enter the Shrine ↗
            </button>
          </Link>
        </div>

        <div
          className="flex gap-8 text-center pt-6 border-t"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
          {[
            { value: liveOdiHundreds != null ? String(liveOdiHundreds) : "—", label: "ODI Centuries" },
            { value: liveOdiAvg      != null ? liveOdiAvg.toFixed(1)      : "—", label: "ODI Average" },
            { value: liveIntlTotal > 0 ? liveIntlTotal.toString() : "500+", label: "Int'l Matches" },
            { value: liveMatchCount > 0 ? String(liveMatchCount) : "—", label: "Live Now" },
          ].map((s) => (
            <div key={s.label} data-testid={`stat-${s.label}`}>
              <div
                className="text-2xl md:text-3xl font-bold"
                style={{ color: "#e8b84b", textShadow: "0 0 12px rgba(232,184,75,0.5)" }}
              >
                {s.value}
              </div>
              <div className="text-xs tracking-widest uppercase mt-1" style={{ color: "rgba(180,170,150,0.65)" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Live match ticker — the count above only told you SOMETHING is
            live; this makes the actual scraped matches visible and
            clickable, straight from the free Cricbuzz scraper. */}
        {ticker?.matches && ticker.matches.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-wrap gap-2 pt-1"
            data-testid="live-match-ticker"
          >
            {ticker.matches.slice(0, 4).map((m: { matchId: string; match: string; url: string }) => (
              <a
                key={m.matchId}
                href={m.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] tracking-wide border transition-colors"
                style={{ borderColor: "rgba(192,57,43,0.35)", background: "rgba(192,57,43,0.08)", color: "#f0e6d8" }}
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[#c0392b] opacity-75 animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#c0392b]" />
                </span>
                {formatMatchSlug(m.match)}
              </a>
            ))}
          </motion.div>
        )}
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
        <motion.div
          className="w-1 h-6 bg-[#c0392b] rounded-full mx-auto"
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        />
        <div className="text-[10px] text-[#555] tracking-widest uppercase mt-2 text-center">Scroll</div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-white/5 z-10" />
    </section>
  );
}

function CountUpNumber({ target, suffix = "" }: { target: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  useEffect(() => {
    if (!inView || !ref.current) return;
    const controls = animate(0, target, {
      duration: 1.8,
      ease: "easeOut",
      onUpdate(v) {
        if (ref.current) ref.current.textContent = (target % 1 !== 0 ? v.toFixed(1) : Math.round(v).toString()) + suffix;
      },
    });
    return () => controls.stop();
  }, [inView, target, suffix]);

  return <span ref={ref}>0</span>;
}

function StatsWall() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const { data: shrine } = useKohliShrine();

  // Total international hundreds = ODI + T20I from the live snapshot;
  // TEST is on the mock (shrine returns ODI only). Falls back to the previous
  // hardcoded values while the API is loading.
  const kohliMock = PLAYERS.find((p) => p.id === "virat-kohli")!;
  const odiHundreds = shrine?.currentStats?.hundreds ?? 80;
  const testHundreds = kohliMock.testStats.hundreds;
  const t20Hundreds  = kohliMock.t20Stats.hundreds;
  const totalHundreds = (shrine ? odiHundreds + testHundreds + t20Hundreds : 80);

  const odiAvg = shrine?.currentStats?.avg ?? 82.7;

  const odiMatches  = shrine?.currentStats?.matches ?? 0;
  const testMatches = kohliMock.testStats.matches;
  const t20Matches  = kohliMock.t20Stats.matches;
  const intlTotal = odiMatches + testMatches + t20Matches;

  const stats = [
    { value: totalHundreds, suffix: "", label: "Test & ODI Centuries Combined" },
    { value: odiAvg,        suffix: "", label: "Batting Average in Successful ODI Chases" },
    { value: intlTotal,     suffix: "", label: "International Matches Across Formats" },
    { value: 2016,          suffix: "", label: "The Year He Scored 973 T20I Runs" },
    { value: 28,            suffix: "", label: "Consecutive Test Innings Averaging 50+ (2016-17)" },
    { value: 1,             suffix: "", label: "The Archetype No Algorithm Predicted" },
  ];

  return (
    <section className="py-32 px-8 md:px-16 lg:px-24 bg-[#050505]" ref={ref} data-testid="stats-wall">
      <div className="max-w-5xl mx-auto">
        <div className="overflow-hidden mb-16">
          <motion.h2
            className="font-serif text-4xl md:text-6xl text-[#f5f5f5]"
            initial={{ y: "110%" }}
            animate={inView ? { y: 0 } : {}}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          >
            The Weight of 18
          </motion.h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              className="border border-white/5 p-6 hover:border-[#c0392b]/30 transition-colors"
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              data-testid={`stat-card-${i}`}
            >
              <div className="text-4xl md:text-5xl font-bold text-[#d4a500] mb-2">
                <CountUpNumber target={s.value} suffix={s.suffix} />
              </div>
              <div className="text-xs text-[#666] leading-relaxed">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StackingCards() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activeCard, setActiveCard] = useState(0);

  const cards = [
    { accent: "#c0392b", title: "Every cricketer reduced to 20 numbers", sub: "Dot ball %, yorker frequency, chasing average, pressure index..." },
    { accent: "#d4a500", title: "Clusters form naturally — no labels applied", sub: "The algorithm doesn't know Kohli is a batter. It just knows the numbers." },
    { accent: "#f5f5f5", title: "Archetypes emerge: The Pressure Architect", sub: "Players who perform identically despite different teams, eras, nations." },
    { accent: "#888", title: "Cross-era DNA twins discovered", sub: "Is Jasprit Bumrah the same bowler as Lasith Malinga? The data says yes." },
  ];

  useEffect(() => {
    let cleanup: () => void = () => {};
    (async () => {
      const gsap = (await import("gsap")).default;
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);

      const section = sectionRef.current;
      if (!section) return;

      // Pin the ENTIRE section as one unit with pinSpacing: true so it
      // cleanly adds its own scroll-length and releases before the next section.
      ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: `+=${cards.length * 150}vh`,
        pin: true,
        pinSpacing: true,
        scrub: 1.5,
        anticipatePin: 1,
        onUpdate(self) {
          const idx = Math.min(
            cards.length - 1,
            Math.floor(self.progress * cards.length)
          );
          setActiveCard((prev) => (prev === idx ? prev : idx));
        },
      });

      cleanup = () => ScrollTrigger.getAll().forEach((t) => t.kill());
    })();
    return () => cleanup();
  }, [cards.length]);

  return (
    <div
      ref={sectionRef}
      className="relative flex items-center justify-center min-h-screen bg-[#0a0a0a]"
      data-testid="stacking-cards"
    >
      {/* Progress dots */}
      <div className="absolute right-8 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-20">
        {cards.map((_, i) => (
          <div
            key={i}
            className="w-1.5 rounded-full transition-all duration-300"
            style={{
              height: activeCard === i ? 24 : 8,
              background: activeCard === i ? cards[i].accent : "rgba(255,255,255,0.12)",
            }}
          />
        ))}
      </div>

      {/* Card stack — all cards occupy the same space; active one is visible */}
      <div className="relative w-full max-w-3xl px-8">
        {cards.map((card, i) => (
          <motion.div
            key={i}
            className="stack-card absolute left-8 right-8"
            style={{ top: "50%", zIndex: i + 1 }}
            animate={{
              y: activeCard === i ? "-50%" : activeCard > i ? "-58%" : "-38%",
              opacity: activeCard === i ? 1 : activeCard > i ? 0 : 0,
              scale: activeCard === i ? 1 : 0.96,
            }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <div
              className="w-full p-12 md:p-16 border"
              style={{ background: "#0f0f0f", borderColor: `${card.accent}35` }}
            >
              <div className="w-8 h-px mb-8" style={{ background: card.accent }} />
              <div className="font-serif text-3xl md:text-5xl text-[#f5f5f5] mb-4 leading-tight">
                {card.title}
              </div>
              <div className="text-[#888] text-base md:text-lg leading-relaxed">{card.sub}</div>
              <div className="text-xs text-[#444] mt-8 uppercase tracking-widest">
                {String(i + 1).padStart(2, "0")} / {String(cards.length).padStart(2, "0")}
              </div>
            </div>
          </motion.div>
        ))}

        {/* Placeholder height so the absolute cards don't collapse the container */}
        <div className="invisible p-12 md:p-16 border" aria-hidden>
          <div className="w-8 h-px mb-8" />
          <div className="font-serif text-3xl md:text-5xl mb-4 leading-tight">{cards[0].title}</div>
          <div className="text-base md:text-lg leading-relaxed">{cards[0].sub}</div>
          <div className="text-xs mt-8" />
        </div>
      </div>
    </div>
  );
}

function ArchetypesSection() {
  const [activeIdx, setActiveIdx] = useState(0);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cleanup: () => void = () => {};
    (async () => {
      const gsap = (await import("gsap")).default;
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);
      const items = sectionRef.current?.querySelectorAll(".archetype-item");
      if (!items) return;
      items.forEach((el, i) => {
        ScrollTrigger.create({
          trigger: el as Element,
          start: "top center",
          onEnter: () => setActiveIdx(i),
          onEnterBack: () => setActiveIdx(i),
        });
      });
      cleanup = () => ScrollTrigger.getAll().forEach((t) => t.kill());
    })();
    return () => cleanup();
  }, []);

  return (
    <section className="py-32 bg-[#080808]" data-testid="archetypes-section">
      <div className="flex max-w-7xl mx-auto px-8 md:px-16 gap-16">
        <div className="hidden md:block w-72 shrink-0">
          <div className="sticky top-24">
            <div className="h-full w-px bg-[#c0392b] absolute -left-4 top-0" style={{ height: "100vh" }} />
            <div className="text-xs tracking-widest uppercase text-[#c0392b] mb-3">AI Clustering</div>
            <h2 className="font-serif text-3xl text-[#f5f5f5] mb-4">The Eight Archetypes</h2>
            <motion.p
              key={activeIdx}
              className="text-[#888] text-sm leading-relaxed"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              {ARCHETYPES[activeIdx]?.description}
            </motion.p>
            <motion.div
              key={`badge-${activeIdx}`}
              className="mt-6 inline-block px-3 py-1 text-xs font-bold uppercase tracking-widest border-l-2"
              style={{ borderColor: ARCHETYPES[activeIdx]?.color, color: ARCHETYPES[activeIdx]?.color, background: `${ARCHETYPES[activeIdx]?.color}15` }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              Archetype {ARCHETYPES[activeIdx]?.id}
            </motion.div>
          </div>
        </div>

        <div ref={sectionRef} className="flex-1 space-y-4">
          {ARCHETYPES.map((arch, i) => (
            <div
              key={arch.id}
              className="archetype-item p-6 md:p-8 border transition-colors duration-300"
              style={{
                borderColor: activeIdx === i ? `${arch.color}60` : "rgba(255,255,255,0.06)",
                background: activeIdx === i ? `${arch.color}08` : "transparent",
              }}
              data-testid={`archetype-${arch.id}`}
            >
              <div className="flex items-start gap-4">
                <div className="text-2xl font-bold" style={{ color: arch.color, fontFamily: "Playfair Display, serif" }}>
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div>
                  <div className="text-[#f5f5f5] font-semibold text-lg mb-1">{arch.name}</div>
                  <div className="text-[#666] text-sm mb-3">{arch.description}</div>
                  <div className="flex gap-2 flex-wrap">
                    {arch.examplePlayers.map((p) => (
                      <span key={p} className="text-xs px-2 py-0.5 border border-white/10 text-[#888]">{p}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HorizontalGallery() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const showcasePlayers = PLAYERS.slice(0, 6);

  useEffect(() => {
    let cleanup: () => void = () => {};
    (async () => {
      const gsap = (await import("gsap")).default;
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);
      const track = trackRef.current;
      const section = sectionRef.current;
      if (!track || !section) return;

      const tl = gsap.to(track, {
        x: () => -(track.scrollWidth - window.innerWidth + 128),
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: () => "+=" + (track.scrollWidth - window.innerWidth + 128),
          scrub: 1.2,
          pin: true,
          anticipatePin: 1,
          fastScrollEnd: true,
          invalidateOnRefresh: true,
        },
      });

      cleanup = () => {
        tl.scrollTrigger?.kill();
        tl.kill();
      };
    })();
    return () => cleanup();
  }, []);

  return (
    <section ref={sectionRef} className="gallery-section relative overflow-hidden" style={{ height: "100vh" }} data-testid="gallery-section">
      <div className="absolute top-16 left-8 md:left-16 z-10">
        <div className="text-xs tracking-widest uppercase text-[#666] mb-2">DNA Fingerprints</div>
        <h2 className="font-serif text-2xl text-[#f5f5f5]">Player Profiles</h2>
      </div>

      <div ref={trackRef} className="gallery-track absolute top-0 left-0 flex items-center h-full gap-5 px-16 pt-20" style={{ willChange: "transform" }}>
        {showcasePlayers.map((player) => {
          const archetype = ARCHETYPES.find((a) => a.id === player.archetypeId);
          const col = archetype?.color || "#c0392b";
          const initials = player.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
          return (
            <div
              key={player.id}
              className="shrink-0 relative overflow-hidden"
              style={{ width: 300, height: 420, background: "linear-gradient(145deg,#0d0d0d 0%,#131313 100%)", border: `1px solid ${col}28` }}
              data-testid={`gallery-card-${player.id}`}
            >
              {/* top accent line */}
              <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg,transparent,${col},transparent)` }} />
              {/* corner glow */}
              <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full blur-2xl" style={{ background: col, opacity: 0.08 }} />

              <div className="relative p-6 flex flex-col h-full">
                {/* header row */}
                <div className="flex items-start justify-between mb-5">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.18em] mb-1.5 font-medium" style={{ color: col }}>
                      {archetype?.name || "Unknown"}
                    </div>
                    <div className="font-serif text-xl text-[#f0f0f0] leading-snug">{player.name}</div>
                    <div className="text-[11px] text-[#444] mt-1 tracking-wider">{player.country} {player.flag}</div>
                  </div>
                  <div
                    className="shrink-0 w-9 h-9 flex items-center justify-center text-xs font-bold border ml-3"
                    style={{ borderColor: `${col}50`, color: col, background: `${col}10`, fontFamily: "Inter, sans-serif", letterSpacing: "0.06em" }}
                  >
                    {initials}
                  </div>
                </div>

                {/* DNA score */}
                <div className="mb-5">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[9px] uppercase tracking-[0.18em] text-[#444]">DNA Score</span>
                    <span className="text-sm font-bold font-mono" style={{ color: col }}>{player.dnaScore}</span>
                  </div>
                  <div className="h-px bg-[#1a1a1a] relative">
                    <motion.div
                      className="absolute top-0 left-0 h-full"
                      style={{ background: col, boxShadow: `0 0 6px ${col}80` }}
                      initial={{ width: 0 }}
                      animate={{ width: `${player.dnaScore}%` }}
                      transition={{ duration: 1.2, delay: 0.2, ease: "easeOut" }}
                    />
                  </div>
                </div>

                {/* stat bars */}
                <div className="flex-1 space-y-2.5">
                  {RADAR_AXES.slice(0, 6).map((axis, i) => {
                    const val = player.radarValues[i] ?? 0;
                    return (
                      <div key={axis} className="flex items-center gap-2.5">
                        <div className="text-[9px] text-[#3a3a3a] uppercase tracking-wide shrink-0" style={{ width: 72 }}>
                          {axis}
                        </div>
                        <div className="flex-1 h-px bg-[#181818] relative">
                          <div
                            className="absolute top-0 left-0 h-full transition-all duration-700"
                            style={{ width: `${val}%`, background: col, opacity: 0.65 }}
                          />
                        </div>
                        <div className="text-[9px] text-[#3a3a3a] font-mono w-5 text-right">{val}</div>
                      </div>
                    );
                  })}
                </div>

                {/* footer */}
                <div
                  className="mt-4 pt-4 flex justify-between items-center border-t"
                  style={{ borderColor: "rgba(255,255,255,0.04)" }}
                >
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: col }} />
                    <span className="text-[9px] uppercase tracking-[0.15em] text-[#2e2e2e]">Archetype {player.archetypeId}</span>
                  </div>
                  <span className="text-[9px] uppercase tracking-[0.15em] text-[#2e2e2e]">→ Match</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TickerText() {
  const ref = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cleanup: () => void = () => {};
    (async () => {
      const gsap = (await import("gsap")).default;
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);
      const track = trackRef.current;
      const section = ref.current;
      if (!track || !section) return;

      const tl = gsap.to(track, {
        x: () => -(track.scrollWidth / 2),
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top bottom",
          end: "bottom top",
          scrub: 0.6,
          fastScrollEnd: true,
        },
      });

      cleanup = () => { tl.scrollTrigger?.kill(); tl.kill(); };
    })();
    return () => cleanup();
  }, []);

  const text = "In every delivery, discover the undeniable data of Cricket DNA — where Bumrah meets Malinga ◆ and Kohli meets Tendulkar ◆ across eras that never shared a field ◆ ";

  return (
    <section ref={ref} className="overflow-hidden py-16 border-y border-white/5 bg-[#050505]" data-testid="ticker-section">
      <div ref={trackRef} className="flex whitespace-nowrap" style={{ willChange: "transform" }}>
        {[text, text].map((t, outer) => (
          <div key={outer} className="flex items-center shrink-0">
            {t.split("◆").map((chunk, i) => (
              <span key={i} className="inline-flex items-center">
                <span className="text-lg md:text-2xl text-[#333] font-light tracking-wide px-4">{chunk}</span>
                {i < t.split("◆").length - 1 && (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mx-2">
                    <circle cx="8" cy="8" r="6" stroke="#c0392b" strokeWidth="1.5" />
                    <circle cx="8" cy="8" r="2" fill="#c0392b" />
                  </svg>
                )}
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function ShrineCTA() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="py-40 px-8 md:px-16 text-center relative overflow-hidden" style={{ background: "#0a0202" }} data-testid="shrine-cta">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none" aria-hidden>
        <span style={{ fontSize: "40vw", color: "rgba(192,57,43,0.04)", fontFamily: "Playfair Display, serif", fontWeight: 900, lineHeight: 1 }}>18</span>
      </div>

      <div className="relative z-10 max-w-3xl mx-auto">
        <motion.h2
          className="font-serif text-4xl md:text-6xl text-[#f5f5f5] mb-4 leading-tight"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
        >
          He didn't just chase totals.
        </motion.h2>
        <motion.h2
          className="font-serif text-4xl md:text-6xl text-[#c0392b] mb-12 leading-tight"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.15 }}
        >
          He redefined what pressure looks like.
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 text-left">
          {[
            "82* vs Pakistan · 2022 T20 World Cup",
            "Highest ICC ranking ever achieved by an Indian batter",
            "The only player to average 50+ across all three formats simultaneously",
          ].map((stat, i) => (
            <motion.div
              key={i}
              className="border-l-2 border-[#c0392b] pl-4 text-sm text-[#888]"
              initial={{ opacity: 0, x: -20 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.3 + i * 0.1 }}
            >
              {stat}
            </motion.div>
          ))}
        </div>

        <Link href="/kohli">
          <motion.button
            className="group px-10 py-4 text-sm font-semibold tracking-widest uppercase border-2 border-[#c0392b] text-white hover:bg-[#c0392b] transition-colors relative overflow-hidden"
            whileHover={{ scale: 1.02 }}
            data-testid="enter-shrine-btn"
          >
            <span className="group-hover:translate-x-1 transition-transform inline-block">
              Enter the Virat Kohli Shrine →
            </span>
          </motion.button>
        </Link>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <div className="bg-[#0a0a0a]" data-testid="home-page">
      <HeroSection />
      <StatsWall />
      <StackingCards />
      <ArchetypesSection />
      <HorizontalGallery />
      <TickerText />
      <ShrineCTA />
    </div>
  );
}
