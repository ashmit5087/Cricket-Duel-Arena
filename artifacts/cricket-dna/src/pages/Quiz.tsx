import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuiz, useSubmitQuiz, useQuizLeaderboard } from "@/hooks/usePlayerData";
import type { QuizData, QuizResult } from "@/lib/api";
import QuizCinematicIntro from "@/components/quiz/QuizCinematicIntro";
import QuizCTA from "@/components/quiz/QuizCTA";
import QuizNameModal from "@/components/quiz/QuizNameModal";
import MasterLeaderboard from "@/components/quiz/MasterLeaderboard";
import { Loader2 } from "lucide-react";

type QuizPageState =
  | "cinematic"
  | "cta"
  | "name"
  | "generating"
  | "quiz"
  | "result";

const DRIFT_WALL_IMAGES = [
  "/gallery/virat 1.jpg",
  "/gallery/virat 2.jpg",
  "/gallery/virat 3.jpg",
  "/gallery/virat 4.jpg",
  "/gallery/virat 6.jpg",
  "/gallery/virat 7.jpg",
  "/gallery/virat 8.jpg",
  "/gallery/virat 9.jpg",
  "/gallery/virat 10.jpg",
  "/gallery/virat 11.jpg",
  "/gallery/virat 12.jpg",
  "/gallery/virat 13.jpg",
  "/gallery/virat 14.jpg",
  "/gallery/virat 15.jpg",
  "/gallery/virat 16.jpg",
  "/gallery/virat 17.jpg",
  "/gallery/virat 18.jpg",
  "/gallery/virat 19.jpg",
  "/gallery/virat 20.jpg",
];

export default function Quiz() {
  const [pageState, setPageState] = useState<QuizPageState>("cinematic");
  const [playerName, setPlayerName] = useState("");
  const [result, setResult] = useState<QuizResult | null>(null);
  
  // The hooks
  const { data: quizData, refetch: fetchQuiz, isFetching, error } = useQuiz({ enabled: false });
  const submitMutation = useSubmitQuiz();
  const { data: leaderboardData, refetch: refetchLeaderboard } = useQuizLeaderboard();

  // For the actual quiz
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<{ questionId: string; selectedIndex: number }[]>([]);
  const [lockedIn, setLockedIn] = useState<number | null>(null);

  useEffect(() => {
    if (pageState === "generating") {
      fetchQuiz().then(() => {
        setPageState("quiz");
        setCurrentIdx(0);
        setAnswers([]);
        setLockedIn(null);
      });
    }
  }, [pageState, fetchQuiz]);

  useEffect(() => {
    if (pageState === "result") {
      refetchLeaderboard();
    }
  }, [pageState, refetchLeaderboard]);

  const handleSelect = (idx: number) => {
    if (lockedIn !== null || !quizData) return;
    setLockedIn(idx);

    const q = quizData.questions[currentIdx];
    const newAnswers = [...answers, { questionId: q.id, selectedIndex: idx }];
    setAnswers(newAnswers);

    setTimeout(() => {
      if (currentIdx < quizData.questions.length - 1) {
        setLockedIn(null);
        setCurrentIdx((c) => c + 1);
      } else {
        submitMutation.mutate(
          { token: quizData.quizToken, playerName, answers: newAnswers },
          {
            onSuccess: (data: QuizResult) => {
              setResult(data);
              setPageState("result");
            },
            onError: () => {
              setLockedIn(null);
            },
          }
        );
      }
    }, 900);
  };

  const handlePlayAgain = () => {
    setResult(null);
    setPageState("generating");
  };

  const leaderboardEntries = (leaderboardData || []).map((entry: any) => ({
    player_name: entry.player_name,
    score: entry.score,
    max_score: entry.max_score,
    percentage: entry.percentage,
    tier: entry.tier,
    created_at: entry.created_at,
  }));

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      {/* 1. Cinematic Intro Sequence */}
      {(pageState === "cinematic" || pageState === "cta") && (
        <QuizCinematicIntro
          images={DRIFT_WALL_IMAGES}
          onComplete={() => setPageState("cta")}
          ctaVisible={pageState === "cta"}
        />
      )}

      {/* 2. CTA Overlay */}
      {pageState === "cta" && (
        <QuizCTA
          visible={true}
          onGenerate={() => setPageState("name")}
        />
      )}

      {/* 3. Name Modal */}
      <QuizNameModal
        open={pageState === "name"}
        onSubmit={(name) => {
          setPlayerName(name);
          setPageState("generating");
        }}
      />

      {/* 4. Loading State */}
      {(pageState === "generating" || isFetching) && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0a0a]">
          <Loader2 className="w-12 h-12 text-[#d4a500] animate-spin mb-4" />
          <h2 className="text-2xl font-semibold uppercase tracking-widest text-white/80" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            Summoning the King...
          </h2>
          <p className="mt-2 text-sm text-white/50">Generating 10 fresh questions</p>
        </div>
      )}

      {/* Error state */}
      {error && pageState !== "cinematic" && pageState !== "cta" && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0a0a]">
          <div className="text-red-500 mb-4 text-4xl">⚠️</div>
          <h2 className="text-2xl text-white mb-2 font-serif">Arena Unavailable</h2>
          <p className="text-[#888] text-sm mb-6 max-w-sm">
            {error.message || "Failed to generate the quiz."}
          </p>
          <button
            onClick={() => setPageState("generating")}
            className="px-6 py-2 border border-white/20 text-xs uppercase tracking-widest hover:bg-white/10"
          >
            Try Again
          </button>
        </div>
      )}

      {/* 5. The Quiz */}
      {pageState === "quiz" && quizData && !submitMutation.isPending && (
        <section className="max-w-3xl mx-auto py-24 px-6 min-h-screen flex flex-col justify-center">
          <div className="mb-6 sm:mb-10">
            <div className="flex justify-between text-[10px] sm:text-xs uppercase tracking-widest text-[#666] mb-2">
              <span>
                Q{currentIdx + 1}/{quizData.questions.length}
              </span>
              <span>{Math.round((currentIdx / quizData.questions.length) * 100)}%</span>
            </div>
            <div className="h-1 bg-white/10 w-full overflow-hidden">
              <motion.div
                className="h-full bg-[#c0392b]"
                initial={{ width: 0 }}
                animate={{ width: `${(currentIdx / quizData.questions.length) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>

          <AnimatePresence mode="wait">
            {quizData.questions[currentIdx] && (
              <motion.div
                key={quizData.questions[currentIdx].id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-[#080808]/85 backdrop-blur-md p-5 sm:p-8 md:p-12 border border-white/10"
              >
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#c0392b] mb-2 sm:mb-3 font-bold">
                  Question {currentIdx + 1}
                </div>
                <h2 className="font-serif text-xl sm:text-2xl md:text-3xl text-white mb-6 sm:mb-8 leading-snug">
                  {quizData.questions[currentIdx].question}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                  {quizData.questions[currentIdx].options.map((opt: string, i: number) => {
                    const isSelected = lockedIn === i;
                    const isLocked = lockedIn !== null;

                    return (
                      <button
                        key={i}
                        onClick={() => handleSelect(i)}
                        disabled={isLocked}
                        className={`
                          text-left p-3.5 sm:p-4 md:p-6 border transition-all duration-300 min-h-[60px]
                          ${
                            isSelected
                              ? "bg-[#c0392b] border-[#c0392b] text-white shadow-[0_0_15px_rgba(192,57,43,0.5)]"
                              : "bg-transparent border-white/10 text-[#d0d0d0] hover:border-white/30 hover:bg-white/5 active:bg-white/10"
                          }
                          ${isLocked && !isSelected ? "opacity-30 grayscale" : ""}
                        `}
                      >
                        <div className="flex items-start gap-3 sm:gap-4">
                          <span
                            className={`text-[10px] sm:text-xs font-mono mt-0.5 sm:mt-1 shrink-0 ${
                              isSelected ? "text-white/80" : "text-[#c0392b]"
                            }`}
                          >
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span className="text-sm sm:text-base leading-tight font-medium">
                            {opt}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {/* Submitting Loading State */}
      {submitMutation.isPending && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0a0a]">
          <Loader2 className="w-12 h-12 text-[#d4a500] animate-spin mb-4" />
          <h2 className="text-2xl font-semibold uppercase tracking-widest text-white/80" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            Scoring Quiz...
          </h2>
        </div>
      )}

      {/* 6. Result & Leaderboard */}
      {pageState === "result" && result && (
        <div className="pt-24 animate-in fade-in duration-700">
          <div className="max-w-2xl mx-auto text-center px-6">
            <span className="text-6xl mb-6 block">{result.tierEmoji}</span>
            <h2 className="text-5xl font-bold uppercase mb-4 text-[#d4a500]" style={{ fontFamily: "'Bebas Neue', sans-serif", textShadow: "0 0 30px rgba(212,165,0,0.3)" }}>
              {result.percentage}%
            </h2>
            <p className="text-2xl text-white font-medium mb-1">{result.tier}</p>
            <p className="text-[#666] text-sm mb-8">
              You scored {result.totalScore} out of {result.maxScore} points.
            </p>
            
            <button
              onClick={handlePlayAgain}
              className="px-8 py-4 bg-[#c0392b] text-white font-bold tracking-[0.15em] uppercase hover:bg-[#a93226] transition-colors shadow-[0_0_20px_rgba(192,57,43,0.4)]"
            >
              Play Again
            </button>
          </div>

          <MasterLeaderboard
            entries={leaderboardEntries}
            currentPlayerName={playerName}
          />
        </div>
      )}
    </main>
  );
}
