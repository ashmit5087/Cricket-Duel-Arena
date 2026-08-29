import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import InfiniteGallery from "@/components/ui/3d-gallery-photography";
import { driftWallImages } from "@/lib/drift-wall-images";
import { useQuizScrollProgress } from "@/hooks/useQuizScrollProgress";
import QuizNameModal from "@/components/quiz/QuizNameModal";
import QuizInterface, { QuizData } from "@/components/quiz/QuizInterface";
import QuizResult, { QuizResultData } from "@/components/quiz/QuizResult";
import MasterLeaderboard from "@/components/quiz/MasterLeaderboard";
import { generateQuiz, submitQuiz } from "@/lib/api";

type QuizStage = "cinematic" | "cta" | "name" | "generating" | "quiz" | "result";

export default function Quiz() {
  const progress = useQuizScrollProgress();
  const [stage, setStage] = useState<QuizStage>("cinematic");
  const [settled, setSettled] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [resultData, setResultData] = useState<QuizResultData | null>(null);

  useEffect(() => {
    if (progress < 0.995) {
      setSettled(false);
      if (stage === "cta") setStage("cinematic");
      return;
    }

    const timeout = window.setTimeout(() => {
      setSettled(true);
      if (stage === "cinematic") setStage("cta");
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [progress, stage]);

  const handleGenerateQuizClick = () => {
    setStage("name");
  };

  const handleNameSubmit = async (name: string) => {
    setPlayerName(name);
    setStage("generating");
    try {
      const data = await generateQuiz();
      setQuizData(data);
      setStage("quiz");
    } catch (e) {
      console.error(e);
      // Fallback in case of error
      setStage("cta");
    }
  };

  const handleQuizSubmit = async (answers: { questionId: string; selectedIndex: number }[]) => {
    if (!quizData) return;
    try {
      const result = await submitQuiz({
        quizToken: quizData.quizToken,
        answers,
        playerName,
      });
      setResultData(result);
      setStage("result");
    } catch (e) {
      console.error(e);
      setStage("cta");
    }
  };

  const handlePlayAgain = () => {
    setStage("generating");
    setQuizData(null);
    setResultData(null);
    generateQuiz()
      .then((data) => {
        setQuizData(data);
        setStage("quiz");
      })
      .catch((e) => {
        console.error(e);
        setStage("cta");
      });
  };

  const titleReveal = Math.max(0, Math.min(1, (progress - 0.1) / 0.25));
  const titleScale = 0.96 + titleReveal * 0.04;

  const showGallery = stage === "cinematic" || stage === "cta" || stage === "name";

  return (
    <main className="bg-[#0a0a0c] min-h-screen text-white font-sans overflow-x-hidden selection:bg-[#c0392b] selection:text-white">
      {/* 1. Cinematic Gallery Section */}
      {showGallery && (
        <section className="relative" style={{ height: "300vh" }}>
          <div className="sticky top-0 h-screen overflow-hidden">
            <InfiniteGallery
              images={driftWallImages}
              controlled
              controlledProgress={progress}
              visibleCount={12}
              zSpacing={3}
              falloff={{ near: 0.8, far: 14 }}
              className="h-screen w-full"
            />
            
            {/* KING KOHLI Title Overlay */}
            <div
              className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-6 text-center mix-blend-exclusion"
            >
              <h1
                className="font-serif text-5xl tracking-tight md:text-7xl lg:text-8xl text-white uppercase"
                style={{
                  opacity: titleReveal,
                  transform: `scale(${titleScale})`,
                }}
              >
                KING KOHLI
              </h1>
            </div>
          </div>
        </section>
      )}

      {/* 2. CTA Section */}
      {showGallery && (
        <section className="relative z-30 bg-[#0a0a0c] py-32 flex flex-col items-center justify-center text-center px-4">
          <div
            className={`transition-all duration-1000 ease-out flex flex-col items-center gap-6 ${
              settled ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
            }`}
          >
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#c0392b] font-bold">
              Cricket DNA
            </p>
            <h2 className="font-serif text-4xl md:text-6xl text-white tracking-tight">
              Think you know<br/>the King? Bet.
            </h2>
            <p className="text-[#a0a0a0] max-w-md mx-auto text-lg mb-4">
              10 questions. No easy outs.
            </p>
            <button
              onClick={handleGenerateQuizClick}
              className="px-8 py-4 uppercase tracking-[0.2em] font-bold text-[11px] bg-[#c0392b] text-white hover:bg-[#e74c3c] transition-colors hover:-translate-y-0.5 active:translate-y-0"
            >
              Generate Quiz →
            </button>
          </div>
        </section>
      )}

      {/* Modals & Active Quiz Screens */}
      <AnimatePresence>
        {stage === "name" && (
          <QuizNameModal
            onSubmit={handleNameSubmit}
            onCancel={() => setStage("cta")}
          />
        )}
      </AnimatePresence>

      {stage === "generating" && (
        <div className="min-h-screen flex flex-col items-center justify-center">
          <div className="w-px h-16 bg-gradient-to-b from-[#c0392b] to-transparent animate-pulse mb-6" />
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#a0a0a0] animate-pulse">
            Generating Fresh Questions...
          </p>
        </div>
      )}

      {stage === "quiz" && quizData && (
        <section className="min-h-screen py-24 bg-[#0a0a0c]">
          <QuizInterface
            quizData={quizData}
            onSubmit={handleQuizSubmit}
          />
        </section>
      )}

      {/* Results & Leaderboard */}
      {stage === "result" && resultData && (
        <section className="min-h-screen bg-[#0a0a0c] flex flex-col pt-24 pb-12">
          <QuizResult
            playerName={playerName}
            result={resultData}
            onPlayAgain={handlePlayAgain}
          />
          <div className="mt-auto w-full pt-20 border-t border-white/10">
            <MasterLeaderboard currentPlayerName={playerName} />
          </div>
        </section>
      )}
    </main>
  );
}
