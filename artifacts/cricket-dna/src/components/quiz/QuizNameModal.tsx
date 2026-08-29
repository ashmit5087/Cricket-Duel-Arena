import { FormEvent, useState } from "react";
import { ArrowRight } from "lucide-react";

interface QuizNameModalProps {
  open: boolean;
  onSubmit: (name: string) => void;
}

export default function QuizNameModal({
  open,
  onSubmit,
}: QuizNameModalProps) {
  const [name, setName] = useState("");

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();

    const clean = name.trim().slice(0, 32);

    if (!clean) return;

    onSubmit(clean);
  };

  return (
    <div
      className="
        fixed
        inset-0
        z-[100]
        flex
        items-center
        justify-center
        bg-black/80
        px-6
        backdrop-blur-md
      "
    >
      <form
        onSubmit={submit}
        className="
          w-full
          max-w-md
          rounded-3xl
          border border-white/10
          bg-[#0a0a0a]
          p-8
          shadow-2xl
        "
      >
        <p
          className="
            text-xs
            uppercase
            tracking-[0.3em]
            opacity-50
            text-[#d4a500]
          "
        >
          Enter the arena
        </p>

        <h2
          className="
            mt-3
            text-3xl
            font-semibold
            text-white
          "
        >
          What should we call you?
        </h2>

        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={32}
          autoFocus
          placeholder="Your name"
          className="
            mt-8
            w-full
            rounded-2xl
            border border-white/20
            bg-white/5
            px-5
            py-4
            text-white
            outline-none
            focus:border-white/50
            transition-colors
          "
        />

        <button
          type="submit"
          disabled={!name.trim()}
          className="
            group
            mt-6
            w-full
            flex
            items-center
            justify-center
            rounded-2xl
            bg-white
            text-black
            px-5
            py-4
            font-semibold
            transition-all
            duration-300
            hover:bg-gray-200
            disabled:opacity-50
            disabled:cursor-not-allowed
          "
        >
          ENTER THE ARENA
          <ArrowRight className="ml-2 w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
        </button>
      </form>
    </div>
  );
}
