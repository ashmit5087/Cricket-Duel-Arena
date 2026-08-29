import { useEffect, useState } from "react";
import { useScrollProgress } from "@/hooks/useScrollProgress";
import KingKohliGallery from "./KingKohliGallery";
import { KingKohliTitle } from "./KingKohliTitle";
import QuizCTA from "./QuizCTA";

interface QuizCinematicIntroProps {
  images: string[];
  onComplete: () => void;
  ctaVisible: boolean;
}

export default function QuizCinematicIntro({
  images,
  onComplete,
  ctaVisible
}: QuizCinematicIntroProps) {
  const progress = useScrollProgress({
    start: 0,
    end: 2.8,
  });

  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (progress < 0.995) {
      setSettled(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setSettled(true);
      onComplete(); // Tells parent to trigger CTA
    }, 500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [progress, onComplete]);

  return (
    <section
      className="
        relative
        h-[280vh]
        bg-[#0a0a0a]
      "
    >
      <div className="sticky top-0 h-screen overflow-hidden">
        <KingKohliGallery
          images={images}
          progress={progress}
        />

        <KingKohliTitle
          progress={progress}
        />

        <div
          className={`
            absolute
            inset-x-0
            bottom-10
            z-30
            flex
            justify-center
            transition-opacity
            duration-700
            ${
              progress > 0.02 &&
              progress < 0.95
                ? "opacity-60"
                : "opacity-0"
            }
          `}
        >
          <span className="text-xs uppercase tracking-[0.3em] text-white">
            Keep scrolling
          </span>
        </div>
      </div>
    </section>
  );
}
