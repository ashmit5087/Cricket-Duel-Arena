import { useState } from "react";
import { ArrowRight } from "lucide-react";

interface QuizCTAProps {
  visible: boolean;
  onGenerate: () => void;
}

export default function QuizCTA({
  visible,
  onGenerate,
}: QuizCTAProps) {
  const [pressed, setPressed] = useState(false);

  const handleClick = () => {
    setPressed(true);

    window.setTimeout(() => {
      onGenerate();
      setPressed(false);
    }, 250);
  };

  return (
    <div
      className={`
        absolute
        left-0
        right-0
        top-[100vh]
        z-40
        flex
        min-h-screen
        items-center
        justify-center
        px-6
        transition-all
        duration-1000
        ease-out
        pointer-events-auto
        ${
          visible
            ? "translate-y-0 opacity-100"
            : "translate-y-12 opacity-0 pointer-events-none"
        }
      `}
    >
      <div className="max-w-2xl text-center flex flex-col items-center">
        <p
          className="
            mb-4
            text-xs
            font-medium
            uppercase
            tracking-[0.35em]
            opacity-60
            text-[#d4a500]
          "
        >
          Cricket DNA
        </p>

        <h2
          className="
            text-4xl
            font-semibold
            tracking-tight
            md:text-6xl
            text-white
            uppercase
          "
          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
        >
          Think you know the King?
          <br />
          Bet.
        </h2>

        <p className="mx-auto mt-5 max-w-md text-sm opacity-60 md:text-base text-gray-300">
          Ten questions. No easy outs.
        </p>

        <button
          type="button"
          onClick={handleClick}
          disabled={pressed}
          className="
            group
            mt-10
            flex
            items-center
            rounded-full
            border border-white/20
            bg-white/5
            backdrop-blur-md
            px-8
            py-4
            text-sm
            font-semibold
            uppercase
            tracking-[0.2em]
            text-white
            transition-all
            duration-300
            hover:-translate-y-1
            hover:bg-white/10
            hover:border-white/40
            hover:scale-[1.02]
            active:scale-[0.98]
          "
        >
          {pressed ? "Entering..." : "Generate Quiz"}

          <ArrowRight
            className="
              ml-3
              w-4 h-4
              transition-transform
              duration-300
              group-hover:translate-x-1
            "
          />
        </button>
      </div>
    </div>
  );
}
