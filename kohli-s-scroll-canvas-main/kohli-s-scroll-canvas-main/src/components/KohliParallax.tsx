import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

import stadiumBase from "@/assets/stadium-base.png.asset.json";
import bgFar from "@/assets/bg-far.png.asset.json";
import bgMid from "@/assets/bg-mid.png.asset.json";
import kohli from "@/assets/kohli.png.asset.json";

gsap.registerPlugin(ScrollTrigger);

export function KohliParallax() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const lenis = new Lenis();
    lenis.on("scroll", ScrollTrigger.update);
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    const ctx = gsap.context(() => {
      const trigger = rootRef.current?.querySelector("[data-parallax-layers]");
      if (!trigger) return;

      const tl = gsap.timeline({
        scrollTrigger: { trigger, start: "0% 0%", end: "100% 0%", scrub: 0.6 },
      });

      // Phase 1 (0 → 0.65): the upper layers (far bg, mid bg, KOHLI title)
      // travel fully down and off-screen, revealing the base stadium image.
      // Kohli stays completely stationary and visible the whole time.
      const exitLayers = [
        { layer: "1", yPercent: 135 },
        { layer: "2", yPercent: 128 },
        { layer: "3", yPercent: 122 },
      ];

      exitLayers.forEach((l) => {
        tl.to(
          trigger.querySelectorAll(`[data-parallax-layer="${l.layer}"]`),
          { yPercent: l.yPercent, ease: "none", duration: 0.65 },
          0,
        );
      });

      // Base layer: a very subtle drift while it is being revealed.
      tl.to(
        trigger.querySelectorAll('[data-parallax-layer="0"]'),
        { yPercent: 3, ease: "none", duration: 0.65 },
        0,
      );

      // Phase 2 (0.65 → 1): base image is fully in frame; Kohli and the base
      // drift together, slowly, as the section eases out.
      tl.to(
        trigger.querySelectorAll(
          '[data-parallax-layer="0"], [data-parallax-layer="4"]',
        ),
        { yPercent: 12, ease: "power1.out", duration: 0.35 },
        0.65,
      );

    }, rootRef);

    return () => {
      ctx.revert();
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, []);

  return (
    <div ref={rootRef} className="parallax">
      <section className="parallax__header">
        <div className="parallax__visuals">
          <div className="parallax__black-line-overflow" />
          <div data-parallax-layers className="parallax__layers">
            <img
              src={stadiumBase.url}
              loading="eager"
              alt="High definition cricket stadium base"
              data-parallax-layer="0"
              className="parallax__layer-img"
            />
            <img
              src={bgFar.url}
              loading="eager"
              alt="Stadium at dusk, far background"
              data-parallax-layer="1"
              className="parallax__layer-img"
            />
            <img
              src={bgMid.url}
              loading="eager"
              alt="Cricket stadium floodlights"
              data-parallax-layer="2"
              className="parallax__layer-img"
            />
            <div data-parallax-layer="3" className="parallax__layer-title">
              <h1 className="parallax__title">KOHLI</h1>
            </div>
            <img
              src={kohli.url}
              loading="eager"
              alt="Virat Kohli raising his bat"
              data-parallax-layer="4"
              className="parallax__layer-img parallax__foreground"
            />
          </div>
          <div className="parallax__fade" />
        </div>
      </section>
    </div>
  );
}
