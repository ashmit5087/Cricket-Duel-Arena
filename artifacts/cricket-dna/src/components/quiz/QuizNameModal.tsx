import { useState } from "react";
import { motion } from "framer-motion";

interface QuizNameModalProps {
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export default function QuizNameModal({ onSubmit, onCancel }: QuizNameModalProps) {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim().slice(0, 32);
    if (!cleanName) return;
    onSubmit(cleanName);
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onCancel} />
      
      <motion.div
        className="relative w-full max-w-md bg-[#0a0a0c] border border-white/10 p-8 flex flex-col"
        initial={{ y: 20, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 10, opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
        >
          ✕
        </button>

        <h2 className="font-serif text-3xl text-white mb-2 tracking-tight">ENTER THE ARENA</h2>
        <p className="text-[#a0a0a0] mb-8 text-sm">What should we call you?</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={32}
            autoFocus
            className="w-full bg-transparent border-b border-white/20 focus:border-white text-xl text-white py-2 outline-none transition-colors placeholder:text-white/20"
          />
          
          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full py-4 uppercase tracking-[0.2em] font-bold text-[11px] bg-[#c0392b] text-white hover:bg-[#e74c3c] disabled:opacity-50 disabled:hover:bg-[#c0392b] transition-all cursor-pointer"
          >
            Enter The Arena →
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}
