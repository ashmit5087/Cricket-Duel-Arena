import { motion } from "framer-motion";

export interface QuizResultData {
  totalScore: number;
  maxScore: number;
  percentage: number;
  tier: string;
  tierEmoji: string;
}

interface QuizResultProps {
  playerName: string;
  result: QuizResultData;
  onPlayAgain: () => void;
}

export default function QuizResult({ playerName, result, onPlayAgain }: QuizResultProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-lg mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center px-4"
    >
      <span className="text-6xl mb-6">{result.tierEmoji}</span>
      
      <h2 className="text-4xl md:text-5xl font-serif text-white mb-2 uppercase tracking-tight">
        {playerName}
      </h2>
      
      <div className="text-5xl font-mono text-[#d4a500] font-bold mb-6">
        {result.totalScore} <span className="text-2xl text-[#d4a500]/50">/ {result.maxScore}</span>
      </div>
      
      <div className="px-6 py-2 bg-white/5 border border-white/10 text-white font-medium tracking-[0.1em] uppercase text-sm mb-12">
        {result.tier}
      </div>
      
      <button
        onClick={onPlayAgain}
        className="px-8 py-4 uppercase tracking-[0.2em] font-bold text-[11px] bg-[#c0392b] text-white hover:bg-[#e74c3c] transition-colors"
      >
        Play Again →
      </button>
    </motion.div>
  );
}
