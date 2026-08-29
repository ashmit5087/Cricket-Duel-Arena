# Kohli's Scroll Canvas

can you just build the animation such that explained in the master guide i just want the parrallax animation nothing more i thing the build will end in not more than 2 to 3 frames in the parrallax scroll effect i want to get the files of this animation to use in my website  # Kohli Parallax Scroll — Implementation Plan

**Goal:** integrate a 4-layer GSAP/ScrollTrigger parallax effect into the Kohli Shrine page, with the uploaded Kohli cutout as the foreground subject (replacing the "boy" in the original Osmo template), two generated background layers behind him, and a text title layer.

**Grounded against your actual codebase:** `artifacts/cricket-dna` already has shadcn (`components.json` confirmed, `new-york` style, aliases set to `@/components/ui` etc.), Tailwind, TypeScript, GSAP `^3.15.0`, and Framer Motion. The only new dependency needed is Lenis. This plan corrects three real issues found in the raw template before integration — see Section 2.

---

## 0. Assets to prepare before touching code

| Asset | Source | Action needed |
|---|---|---|
| Layer 1 (far background) | Generate via image tool | Prompt: *"Wide cinematic photo of an empty cricket stadium interior, extremely soft focus and slightly overexposed, deep red and gold ambient light bleeding across blurred stands, floodlights as soft glowing orbs, almost abstract — heavy bokeh, very low detail, dusk atmosphere, no visible people, no text, no logos."* |
| Layer 2 (mid background) | Generate via image tool | Prompt: *"Cinematic photo of empty cricket stadium floodlight towers and upper tier stands, moderate detail, dramatic backlighting in amber and deep red, slight haze/atmosphere, sharper than a distant blur but still clearly a background plate — no crowd, no players, no text, no logos."* |
| Layer 3 (title) | No image — plain text | Use existing Bebas Neue type system, no asset needed |
| Layer 4 (foreground subject) | Your uploaded Kohli photo | **Verify true alpha transparency first** — the uploaded PNG has a plain white canvas, not confirmed transparent. Run through remove.bg or a manual mask in Photoshop/GIMP if it isn't already alpha-transparent, or you'll get a visible white box over the background layers. |

Once ready, save all three image assets into `artifacts/cricket-dna/public/images/`:
- `parallax-bg-far.jpg`
- `parallax-bg-mid.jpg`
- `kohli-cutout.png`

---

## 1. Install dependencies

```bash
cd artifacts/cricket-dna
npm install @studio-freight/lenis
```

Do **not** install `gsap` — already present at `^3.15.0`. Confirm `gsap/ScrollTrigger` subpath imports resolve correctly under your Vite config (they should, just a sanity check before writing code).

---

## 2. Fix three issues in the original template before pasting anything in

1. **`new Lenis()` was instantiated inside the component's own `useEffect`.** Lenis must be a single, app-wide controller — creating it per-component risks multiple competing smooth-scroll instances if this component is reused or another Lenis consumer is added later. **Fix: lift it to an app-level provider (Section 3).**
2. **No CSS was provided.** The template only references classNames (`parallax__layers`, `parallax__layer-img`, `parallax__fade`, etc.) with zero actual positioning/sizing rules. Without real CSS, the layers just stack flat with no parallax or pinning. **Fix: CSS included in Section 5.**
3. **Placeholder Osmo demo images** need replacing with your own three assets from Section 0 — don't leave the Unsplash/Osmo URLs in place.

---

## 3. Add a single app-level Lenis provider

**New file:** `src/lib/smooth-scroll.tsx`

```tsx
import { createContext, useContext, useEffect, useRef, ReactNode } from "react";
import Lenis from "@studio-freight/lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);
const LenisContext = createContext<Lenis | null>(null);

export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const lenis = new Lenis();
    lenisRef.current = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    return () => {
      lenis.destroy();
      gsap.ticker.remove(raf);
    };
  }, []);

  return <LenisContext.Provider value={lenisRef.current}>{children}</LenisContext.Provider>;
}

export const useLenis = () => useContext(LenisContext);
```

**Wire it in once**, at your app root (likely `App.tsx` or wherever the router/providers are composed):

```tsx
import { SmoothScrollProvider } from "@/lib/smooth-scroll";

// wrap the existing app tree:

  {/* existing routes / providers */}

```

---

## 4. Add the parallax component

**New file:** `src/components/ui/kohli-parallax.tsx`

```tsx
'use client';
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export function KohliParallax() {
  const ref = useRef(null);

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
    


      


        


          


            
            
            


              

KOHLI


            


            
          


          


        


      


    


  );
}
```

---

## 5. Add the missing CSS

**Append to** `src/index.css`:

```css
.kohli-parallax__header {
  height: 300vh;
  position: relative;
}
.kohli-parallax__visuals {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow: hidden;
}
.kohli-parallax__layers {
  position: relative;
  width: 100%;
  height: 100%;
}
.kohli-parallax__layer-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.kohli-parallax__foreground {
  object-fit: contain;
  object-position: center bottom;
  z-index: 3;
}
.kohli-parallax__title {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  font-family: 'Bebas Neue', sans-serif;
  font-size: clamp(4rem, 15vw, 14rem);
  color: hsl(48 100% 41% / 0.9);
  pointer-events: none;
}
.kohli-parallax__fade {
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  background: linear-gradient(to bottom, transparent 70%, hsl(0 0% 4%) 100%);
}
```

---

## 6. Place it in the page

In `src/pages/KohliShrine.tsx`, import and drop `` directly after the existing hero section — it works best as the second beat of the page: the hero establishes him, then this scroll-driven layer reveal transitions into the stats/DNA sections below.

```tsx
import { KohliParallax } from "@/components/ui/kohli-parallax";

// inside the page, immediately after the hero section:
<KohliParallax />
```

---

## 7. Verification checklist

- [ ] Kohli cutout has true alpha transparency (no visible white box behind him on scroll)
- [ ] All three image assets load from `/public/images/` (check network tab for 404s)
- [ ] Scrolling through the 300vh section produces visible depth separation between the three layer speeds
- [ ] `SmoothScrollProvider` is mounted exactly once at the app root — not per-page, not per-component
- [ ] Existing `ScrollTrigger`-driven sections elsewhere in `KohliShrine.tsx` (or other pages) still fire correctly now that Lenis is intercepting scroll globally — test the full page scroll, not just this new section in isolation
- [ ] Clean up on unmount works — navigate away mid-scroll and confirm no console errors from orphaned `ScrollTrigger` instances   provide me a clean aesthetic scroll and you can extra spice if u want to improve the visuals

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7897227e-ff1f-4304-8d26-04fb4fdc6e35).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
