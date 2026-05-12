import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { motion, useInView, animate, AnimatePresence } from "framer-motion";
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
  useEffect(() => {
    let cleanup: () => void = () => {};
    (async () => {
      const gsap = (await import("gsap")).default;
      gsap.from(".kohli-word", {
        yPercent: 110,
        duration: 1.2,
        stagger: 0.15,
        ease: "power4.out",
        delay: 0.2,
      });
    })();
    return () => cleanup();
  }, []);

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden" data-testid="kohli-hero">
      {/* GIF background */}
      <div className="absolute inset-0 z-0" aria-hidden>
        <img
          src="/kohli-bg.gif"
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
          style={{ opacity: 0.55 }}
        />
        {/* Hard vignette — darkens edges, keeps centre readable */}
        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse 80% 70% at 50% 40%, rgba(10,10,10,0.15) 0%, rgba(10,10,10,0.55) 50%, rgba(10,10,10,0.92) 100%)",
          }}
        />
        {/* Bottom-to-top fade so text section is crisp */}
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to bottom, rgba(10,10,10,0.3) 0%, rgba(10,10,10,0.6) 55%, rgba(10,10,10,1) 100%)",
          }}
        />
        {/* Frosted-glass blur layer that intensifies near the text */}
        <div
          className="absolute inset-0"
          style={{
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 55%, transparent 30%, black 100%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 55%, transparent 30%, black 100%)",
          }}
        />
      </div>

      <div className="relative z-10 text-center px-4">
        {["VIRAT", "KOHLI"].map((word, lineIdx) => (
          <div key={word} className="overflow-hidden leading-none">
            <div
              className="kohli-word inline-block font-serif text-[#f5f5f5]"
              style={{ fontSize: "clamp(72px,15vw,180px)", fontWeight: 900, letterSpacing: "-0.02em" }}
            >
              {word}
            </div>
          </div>
        ))}

        <motion.div
          className="mx-auto my-6"
          initial={{ width: 0 }}
          animate={{ width: 120 }}
          transition={{ duration: 0.8, delay: 1.4 }}
          style={{ height: 1, background: "#d4a500" }}
        />

        <motion.div
          className="text-xs tracking-[0.25em] uppercase font-medium text-[#c0392b] mb-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6 }}
        >
          ◆ The Pressure Architect — Archetype A
        </motion.div>

        <motion.p
          className="text-[#555] text-sm tracking-widest uppercase mt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.8 }}
        >
          A Monument in Numbers
        </motion.p>
      </div>

      <div className="absolute bottom-10 w-full flex justify-center z-10">
        <motion.div
          className="w-px h-12 bg-gradient-to-b from-[#c0392b] to-transparent"
          animate={{ scaleY: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 2 }}
        />
      </div>
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
        setTimeout(() => setSpinnerDone((p) => ({ ...p, [i]: true })), 800 + i * 100);
      });
    }
  }, [inView]);

  const stats = [
    { value: 80, label: "Centuries across Test and ODI cricket" },
    { value: 82.7, label: "Batting average in successful ODI chases — highest ever" },
    { value: 500, suffix: "+", label: "International appearances across all formats" },
    { value: 12040, suffix: "+", label: "Test runs — still climbing" },
    { value: 0, label: "ICC tournaments where he failed to perform" },
    { value: 1, label: "Cluster — he sits alone at the intersection" },
  ];

  return (
    <section ref={ref} className="py-32 px-8 md:px-16 bg-[#080808]" data-testid="stat-wall">
      <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-3 gap-0 border border-white/5">
        {stats.map((s, i) => (
          <motion.div
            key={i}
            className="p-8 border-b border-r border-white/5 relative"
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ delay: i * 0.1 }}
            data-testid={`stat-block-${i}`}
          >
            <AnimatePresence>
              {!spinnerDone[i] && (
                <motion.div
                  className="absolute inset-0 flex items-center justify-center"
                  exit={{ opacity: 0 }}
                >
                  <motion.div
                    className="w-6 h-6 border border-[#c0392b]"
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <div className={`transition-opacity duration-500 ${spinnerDone[i] ? "opacity-100" : "opacity-0"}`}>
              <div className="text-4xl md:text-5xl font-bold text-[#d4a500] mb-3 font-mono">
                <CountUpStat value={s.value} suffix={s.suffix} />
              </div>
              <div className="text-xs text-[#555] leading-relaxed">{s.label}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function ConstellationSpot() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [showTooltip, setShowTooltip] = useState(false);

  const dots = [
    { x: 50, y: 50, r: 3, color: "#444", name: "Player" },
    { x: 120, y: 80, r: 3, color: "#444" },
    { x: 180, y: 45, r: 3, color: "#444" },
    { x: 90, y: 130, r: 3, color: "#444" },
    { x: 200, y: 120, r: 3, color: "#444" },
    { x: 250, y: 60, r: 3, color: "#444" },
    { x: 300, y: 90, r: 3, color: "#444" },
    { x: 350, y: 50, r: 3, color: "#444" },
    { x: 160, y: 170, r: 3, color: "#444" },
    { x: 280, y: 150, r: 3, color: "#444" },
    { x: 380, y: 110, r: 3, color: "#444" },
    { x: 400, y: 170, r: 3, color: "#444" },
    { x: 430, y: 80, r: 3, color: "#444" },
    { x: 460, y: 140, r: 3, color: "#444" },
    { x: 490, y: 65, r: 3, color: "#444" },
    { x: 510, y: 130, r: 3, color: "#444" },
    { x: 70, y: 200, r: 3, color: "#444" },
    { x: 130, y: 250, r: 3, color: "#444" },
    { x: 220, y: 220, r: 3, color: "#444" },
    { x: 330, y: 210, r: 3, color: "#444" },
    { x: 440, y: 220, r: 3, color: "#444" },
    { x: 540, y: 200, r: 3, color: "#444" },
    { x: 580, y: 100, r: 3, color: "#444" },
    { x: 560, y: 170, r: 3, color: "#444" },
    { x: 600, y: 200, r: 3, color: "#444" },
    { x: 620, y: 140, r: 3, color: "#444" },
    { x: 640, y: 80, r: 3, color: "#444" },
    { x: 660, y: 160, r: 3, color: "#444" },
    { x: 30, y: 280, r: 3, color: "#444" },
    { x: 100, y: 310, r: 3, color: "#444" },
    { x: 310, y: 260, r: 4, color: "#6b7280", name: "K.S. Williamson" },
    { x: 290, y: 240, r: 4, color: "#6b7280", name: "Sachin Tendulkar" },
    { x: 320, y: 140, r: 20, color: "#c0392b", name: "Virat Kohli", isKohli: true },
  ];

  return (
    <section ref={ref} className="py-32 px-8 md:px-16 bg-[#050505]" data-testid="constellation-spot">
      <div className="max-w-5xl mx-auto">
        <motion.h2
          className="font-serif text-3xl md:text-4xl text-[#f5f5f5] mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
        >
          DNA Constellation
        </motion.h2>
        <p className="text-[#555] text-sm mb-10">He doesn't just lead the cluster. He defines it.</p>

        <div className="relative w-full overflow-x-auto">
          <svg width="700" height="350" viewBox="0 0 700 350" className="w-full" style={{ maxWidth: 700 }}>
            {dots.map((dot, i) => (
              <g key={i}>
                {dot.isKohli ? (
                  <>
                    <motion.g
                      style={{ transformOrigin: `${dot.x}px ${dot.y}px` }}
                      animate={{ scale: [1, 1.6, 1], opacity: [0.5, 0.15, 0.5] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      <circle cx={dot.x} cy={dot.y} r={dot.r + 6} fill="none" stroke="#c0392b" strokeWidth="1" />
                    </motion.g>
                    <circle
                      cx={dot.x} cy={dot.y} r={dot.r}
                      fill={dot.color}
                      className="cursor-pointer"
                      onMouseEnter={() => setShowTooltip(true)}
                      onMouseLeave={() => setShowTooltip(false)}
                    />
                    {showTooltip && (
                      <foreignObject x={dot.x + 15} y={dot.y - 40} width="200" height="80">
                        <div className="bg-[#1a1a1a] border border-[#c0392b]/40 px-3 py-2 text-xs">
                          <div className="text-white font-bold">Virat Kohli</div>
                          <div className="text-[#888]">Pressure Architect</div>
                          <div className="text-[#d4a500]">Nearest twin: K.S. Williamson</div>
                        </div>
                      </foreignObject>
                    )}
                  </>
                ) : (
                  <circle
                    cx={dot.x} cy={dot.y} r={dot.r}
                    fill={dot.color}
                    opacity={dot.name ? 0.8 : 0.4}
                  />
                )}
              </g>
            ))}
          </svg>
        </div>

        <div className="flex gap-6 mt-6 text-xs text-[#555]">
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#c0392b] inline-block" /> Virat Kohli (Archetype A)</span>
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#6b7280] inline-block" /> DNA Twins</span>
          <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#444] inline-block" /> Other players</span>
        </div>
      </div>
    </section>
  );
}

function CareerArc() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="py-32 px-8 md:px-16 bg-[#080808]" data-testid="career-arc">
      <div className="max-w-5xl mx-auto">
        <h2 className="font-serif text-3xl md:text-4xl text-[#f5f5f5] mb-2">Consistency Machine</h2>
        <p className="text-[#555] text-sm mb-10">Career batting averages across formats (2008–2024)</p>

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
    <section ref={ref} className="py-32 px-8 md:px-16 bg-[#0d0808]" data-testid="mcg-moment">
      <div className="max-w-5xl mx-auto">
        <motion.h2
          className="font-serif text-3xl md:text-5xl text-[#f5f5f5] mb-3"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
        >
          82* · Melbourne · October 23, 2022
        </motion.h2>
        <p className="text-[#888] text-sm mb-12">
          Pakistan needed one wicket. India needed 16 off 6. He was still there.
        </p>

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
    { value: "82.7", label: "ODI Chase Average", context: "The next highest ever recorded is 58.3. The gap is not a difference. It's a different sport." },
    { value: "80", label: "International Centuries", context: "Sachin held this record for decades. Kohli is still playing." },
    { value: "973", label: "T20I Runs in 2016", context: "In a format where 40 is a good score. He averaged 106 that year." },
    { value: "50+", label: "Average across ALL three formats simultaneously", context: "No other batter in history has done this. Not one." },
    { value: "0", label: "Times averaging below 45 in a calendar year since 2011", context: "Every year. Every format. The same answer." },
    { value: "28", label: "Consecutive Test innings averaging 50+ (2016-17)", context: "Statisticians stopped looking for comparisons. There weren't any." },
  ];

  return (
    <section ref={ref} className="py-32 px-8 md:px-16 bg-[#050505]" data-testid="record-wall">
      <div className="max-w-5xl mx-auto">
        <h2 className="font-serif text-3xl md:text-4xl text-[#f5f5f5] mb-12">The Record Wall</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {records.map((r, i) => (
            <motion.div
              key={i}
              className="p-6 border border-white/5 hover:border-[#d4a500]/40 hover:-translate-y-1 transition-all duration-200"
              style={{ background: "#0d0d0d" }}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.12 }}
              data-testid={`record-card-${i}`}
            >
              <div className="text-4xl font-bold text-[#d4a500] mb-2">{r.value}</div>
              <div className="text-[#f5f5f5] text-sm font-medium mb-3">{r.label}</div>
              <div className="text-[#555] text-xs leading-relaxed border-t border-white/5 pt-3">{r.context}</div>
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
    <section ref={ref} className="py-32 px-8 md:px-16 bg-[#080808]" data-testid="dna-radar">
      <div className="max-w-5xl mx-auto">
        <h2 className="font-serif text-3xl md:text-4xl text-[#f5f5f5] mb-4">DNA Radar</h2>
        <p className="text-[#555] text-sm mb-8">8-dimensional performance fingerprint</p>

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
    { id: "rohit-sharma", label: "Rohit Sharma" },
    { id: "sachin-tendulkar", label: "Sachin Tendulkar" },
    { id: "babar-azam", label: "Babar Azam" },
    { id: "joe-root", label: "Joe Root" },
  ];

  return (
    <section ref={ref} className="py-32 px-8 md:px-16 bg-[#050505]" data-testid="challenge-cta">
      <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <div>
          <div className="border border-[#c0392b]/30 p-8" style={{ background: "#0d0505" }}>
            <div className="text-xs text-[#c0392b] tracking-widest uppercase mb-4">Virat Kohli · India 🇮🇳</div>
            <div className="font-serif text-3xl text-[#f5f5f5] mb-6">The Pressure Architect</div>
            <div className="grid grid-cols-3 gap-4 text-center border-t border-white/5 pt-6">
              {[
                { v: kohli.odiStats.runs.toLocaleString(), l: "ODI Runs" },
                { v: kohli.odiStats.avg.toFixed(2), l: "Avg" },
                { v: kohli.odiStats.hundreds.toString(), l: "100s" },
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
          <div className="border border-white/10 p-8 relative" style={{ background: "#0d0d0d" }}>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-7xl text-[#333] font-bold select-none">?</span>
            </div>
            <div className="relative z-10">
              <div className="text-xs text-[#555] tracking-widest uppercase mb-2">Think someone can match him?</div>
              <div className="flex flex-wrap gap-2 mb-6 mt-4">
                {challengers.map((c) => (
                  <Link key={c.id} href={`/battle?p2=${c.id}`}>
                    <button
                      className="px-3 py-1.5 text-xs border border-white/10 text-[#888] hover:border-[#c0392b] hover:text-[#c0392b] transition-colors"
                      data-testid={`challenger-${c.id}`}
                    >
                      {c.label}
                    </button>
                  </Link>
                ))}
              </div>
              <Link href="/battle">
                <button className="w-full py-3 text-sm font-semibold tracking-widest uppercase border-2 border-[#c0392b] text-white hover:bg-[#c0392b] transition-colors" data-testid="choose-challenger-btn">
                  Choose Your Challenger →
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function KohliShrine() {
  return (
    <div className="bg-[#0a0a0a]" data-testid="kohli-shrine">
      <HeroSection />
      <StatWall />
      <ConstellationSpot />
      <CareerArc />
      <MCGMoment />
      <RecordWall />
      <DNARadarSection />
      <ChallengeCTA />
    </div>
  );
}
