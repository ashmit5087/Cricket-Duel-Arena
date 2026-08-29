import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface Question {
  id: string;
  question: string;
  options: string[];
}

export interface QuizData {
  quizId: string;
  title: string;
  difficulty: string;
  questions: Question[];
  quizToken: string;
}

interface QuizInterfaceProps {
  quizData: QuizData;
  onSubmit: (answers: { questionId: string; selectedIndex: number }[]) => void;
}

export default function QuizInterface({ quizData, onSubmit }: QuizInterfaceProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<{ questionId: string; selectedIndex: number }[]>([]);

  const currentQ = quizData.questions[currentIdx];

  const handleSelect = (optionIndex: number) => {
    const newAnswers = [...answers, { questionId: currentQ.id, selectedIndex: optionIndex }];
    setAnswers(newAnswers);

    if (currentIdx < quizData.questions.length - 1) {
      setTimeout(() => setCurrentIdx((prev) => prev + 1), 300);
    } else {
      setTimeout(() => onSubmit(newAnswers), 300);
    }
  };

  if (!currentQ) return null;

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col min-h-[60vh] justify-center px-4">
      <div className="flex justify-between items-end mb-8 text-[10px] uppercase tracking-[0.2em] text-[#a0a0a0]">
        <span>{quizData.title}</span>
        <span>Question {currentIdx + 1} of {quizData.questions.length}</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentQ.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col gap-10"
        >
          <h2 className="text-2xl md:text-4xl font-serif text-white leading-tight">
            {currentQ.question}
          </h2>

          <div className="flex flex-col gap-3">
            {currentQ.options.map((option, idx) => (
              <button
                key={idx}
                onClick={() => handleSelect(idx)}
                className="text-left w-full p-5 bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/30 transition-all font-medium flex items-center gap-4"
              >
                <span className="text-[#a0a0a0] font-mono text-xs opacity-50">0{idx + 1}</span>
                {option}
              </button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="mt-12 w-full h-1 bg-white/10 overflow-hidden">
        <motion.div 
          className="h-full bg-[#c0392b]"
          initial={{ width: 0 }}
          animate={{ width: `${((currentIdx) / quizData.questions.length) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </div>
  );
}
