import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { motion, useScroll, useTransform, useInView, animate } from "framer-motion";
import { ARCHETYPES, PLAYERS } from "@/data/mockData";

function HeroSection() {
  const heroRef = useRef<HTMLDivElement>(null);
  const [currentWord, setCurrentWord] = useState(0);
  const [flipping, setFlipping] = useState(false);
  const words = ["Precision", "Obsession", "Consistency", "Dominance", "Legacy"];

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
      className="relative overflow-hidden flex flex-col items-start justify-center min-h-screen px-8 md:px-16 lg:px-24"
      data-testid="hero-section"
    >
      <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden>
        <iframe
          src="https://www.youtube.com/embed/videoseries?list=PLsEbSbMCbxS3o0FqnBV5IUVR7cEFQ_bnP&autoplay=1&mute=1&loop=1&controls=0&disablekb=1&modestbranding=1&playsinline=1&iv_load_policy=3"
          title="Virat Kohli highlights"
          frameBorder="0"
          allow="autoplay; encrypted-media"
          className="absolute"
          style={{ top: "-20%", left: "-20%", width: "140%", height: "140%", opacity: 0.35, pointerEvents: "none" }}
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(10,10,10,0.65) 0%, rgba(10,10,10,0.8) 50%, rgba(10,10,10,1) 100%)" }} />
      </div>

      <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none select-none overflow-hidden" aria-hidden>
        <span style={{ fontSize: "clamp(200px,30vw,450px)", color: "rgba(255,255,255,0.025)", fontFamily: "Playfair Display, Georgia, serif", fontWeight: 900, lineHeight: 1, userSelect: "none" }}>18</span>
      </div>

      <div className="relative z-10 max-w-5xl">
        <div className="mb-3">
          <span className="text-xs tracking-[0.25em] text-[#c0392b] uppercase font-medium">AI Cricket Intelligence Platform</span>
        </div>

        <h1 className="font-serif mb-6 leading-none" style={{ fontSize: "clamp(40px,8vw,110px)", color: "#f5f5f5" }} data-testid="hero-headline">
          {["Not", "a", "batter.", "Not", "a", "captain.", "A", "standard."].map((word, i) => (
            <span key={i} className="inline-block overflow-hidden mr-[0.25em] last:mr-0">
              <span className="hero-word inline-block">{word}</span>
            </span>
          ))}
        </h1>

        <div className="flex items-center gap-3 mb-5 text-lg md:text-2xl text-[#888]" style={{ perspective: "1000px" }}>
          <span>Cricket DNA measures</span>
          <span
            className="inline-block font-medium text-[#f5f5f5] transition-all duration-300"
            style={{
              transformStyle: "preserve-3d",
              transform: flipping ? "rotateX(-90deg)" : "rotateX(0deg)",
              transition: "transform 0.35s ease",
              minWidth: "180px",
            }}
          >
            {words[currentWord]}
          </span>
        </div>

        <p className="text-sm md:text-base text-[#666] mb-10 max-w-xl leading-relaxed">
          80 international centuries. 500+ matches. One archetype: The Pressure Architect.
        </p>

        <div className="flex gap-4 flex-wrap mb-14">
          <Link href="/constellation">
            <button className="px-7 py-3 text-sm font-semibold tracking-widest uppercase bg-[#c0392b] text-white hover:bg-[#a93226] transition-colors" data-testid="cta-constellation">
              Explore Constellation →
            </button>
          </Link>
          <Link href="/kohli">
            <button className="px-7 py-3 text-sm font-semibold tracking-widest uppercase border border-[#d4a500] text-[#d4a500] hover:bg-[#d4a500]/10 transition-colors" data-testid="cta-shrine">
              Enter the Shrine ↗
            </button>
          </Link>
        </div>

        <div className="flex gap-8 text-center">
          {[
            { value: "80", label: "Centuries" },
            { value: "82.7", label: "ODI Chase Avg" },
            { value: "500+", label: "Int'l Matches" },
            { value: "1", label: "GOAT" },
          ].map((s) => (
            <div key={s.label} data-testid={`stat-${s.label}`}>
              <div className="text-2xl md:text-3xl font-bold text-[#c0392b]">{s.value}</div>
              <div className="text-xs text-[#666] tracking-widest uppercase mt-1">{s.label}</div>
            </div>
          ))}
        </div>
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
  const stats = [
    { value: 80, suffix: "", label: "Test & ODI Centuries Combined" },
    { value: 82.7, suffix: "", label: "Batting Average in Successful ODI Chases" },
    { value: 500, suffix: "+", label: "International Matches Across Formats" },
    { value: 2016, suffix: "", label: "The Year He Scored 973 T20I Runs" },
    { value: 28, suffix: "", label: "Consecutive Test Innings Averaging 50+ (2016-17)" },
    { value: 1, suffix: "", label: "The Archetype No Algorithm Predicted" },
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
        end: `+=${cards.length * 100}vh`,
        pin: true,
        pinSpacing: true,
        scrub: 1,
        onUpdate(self) {
          const idx = Math.min(
            cards.length - 1,
            Math.floor(self.progress * cards.length)
          );
          setActiveCard(idx);
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
          scrub: 1,
          pin: true,
          anticipatePin: 1,
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

      <div ref={trackRef} className="gallery-track absolute top-0 left-0 flex items-center h-full gap-6 px-16 pt-20" style={{ willChange: "transform" }}>
        {showcasePlayers.map((player) => {
          const archetype = ARCHETYPES.find((a) => a.id === player.archetypeId);
          return (
            <div
              key={player.id}
              className="shrink-0 w-72 h-96 border border-white/8 p-6 flex flex-col justify-between"
              style={{ background: "#111" }}
              data-testid={`gallery-card-${player.id}`}
            >
              <div>
                <div className="text-xs mb-1 uppercase tracking-widest" style={{ color: archetype?.color || "#888" }}>
                  Archetype {player.archetypeId}
                </div>
                <div className="font-serif text-2xl text-[#f5f5f5] mb-1">{player.name}</div>
                <div className="text-xs text-[#555] mb-4">{player.country}</div>
                <div className="inline-block text-xs px-2 py-0.5 border-l-2 border text-[#888] border-white/8" style={{ borderLeftColor: archetype?.color }}>
                  {archetype?.name}
                </div>
              </div>
              <div>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {player.radarValues.slice(0, 8).map((v, i) => (
                    <div key={i} className="text-center">
                      <div className="h-12 flex items-end justify-center mb-1">
                        <div
                          className="w-5 rounded-sm"
                          style={{ height: `${(v / 100) * 48}px`, background: archetype?.color || "#c0392b", opacity: 0.7 }}
                        />
                      </div>
                      <div className="text-[10px] text-[#555]">{v}</div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-[#555]">
                  <span>DNA Score</span>
                  <span className="text-[#d4a500] font-bold">{player.dnaScore}</span>
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
          scrub: 2,
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
