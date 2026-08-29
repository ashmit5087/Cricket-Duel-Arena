import { createFileRoute } from "@tanstack/react-router";
import { KohliParallax } from "@/components/KohliParallax";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kohli Parallax — Scroll Depth Animation" },
      {
        name: "description",
        content:
          "A cinematic four-layer GSAP + Lenis parallax scroll animation featuring Virat Kohli under stadium floodlights.",
      },
      { property: "og:title", content: "Kohli Parallax — Scroll Depth Animation" },
      {
        property: "og:description",
        content: "Four-layer GSAP ScrollTrigger parallax with smooth Lenis scrolling.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="bg-background">
      <KohliParallax />
      <section className="flex min-h-[60vh] items-center justify-center px-6">
        <p className="max-w-xl text-center text-sm tracking-[0.3em] text-muted-foreground uppercase">
          Scroll back up to replay the depth
        </p>
      </section>
    </main>
  );
}
