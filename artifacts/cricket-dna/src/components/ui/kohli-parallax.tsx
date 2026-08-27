'use client';
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export function KohliParallax() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trigger = ref.current?.querySelector("[data-parallax-layers]");
    if (!trigger) return;

    const tl = gsap.timeline({
      scrollTrigger: { trigger, start: "0% 0%", end: "100% 0%", scrub: 0 },
    });

    const layers = [
      { layer: "1", yPercent: 70 },
      { layer: "2", yPercent: 55 },
      { layer: "3", yPercent: 40 },
      { layer: "4", yPercent: 10 },
    ];

    layers.forEach((l, i) => {
      tl.to(
        trigger.querySelectorAll(`[data-parallax-layer="${l.layer}"]`),
        { yPercent: l.yPercent, ease: "none" },
        i === 0 ? undefined : "<"
      );
    });

    return () => {
      ScrollTrigger.getAll().forEach((st) => st.kill());
      gsap.killTweensOf(trigger);
    };
  }, []);

  return (
    <div className="kohli-parallax" ref={ref}>
      <section className="kohli-parallax__header">
        <div className="kohli-parallax__visuals">
          <div data-parallax-layers className="kohli-parallax__layers">
            <img
              src="/images/parallax-bg-far.jpg"
              data-parallax-layer="1"
              className="kohli-parallax__layer-img"
              alt=""
            />
            <img
              src="/images/parallax-bg-mid.jpg"
              data-parallax-layer="2"
              className="kohli-parallax__layer-img"
              alt=""
            />
            <div data-parallax-layer="3" className="kohli-parallax__title">
              <h2>KOHLI</h2>
            </div>
            <img
              src="/images/kohli-cutout.png"
              data-parallax-layer="4"
              className="kohli-parallax__layer-img kohli-parallax__foreground"
              alt="Virat Kohli"
            />
          </div>
          <div className="kohli-parallax__fade" />
        </div>
      </section>
    </div>
  );
}

