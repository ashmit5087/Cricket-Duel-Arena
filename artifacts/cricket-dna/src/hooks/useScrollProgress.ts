import { useEffect, useRef, useState } from "react";

interface ScrollProgressOptions {
  start?: number;
  end?: number;
}

export function useScrollProgress({
  start = 0,
  end = 1,
}: ScrollProgressOptions = {}) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const targetRef = useRef(0);
  const currentRef = useRef(0);

  useEffect(() => {
    const updateTarget = () => {
      const scrollY = window.scrollY;
      const viewportHeight = window.innerHeight;

      const startY = start * viewportHeight;
      const endY = end * viewportHeight;

      const raw =
        (scrollY - startY) /
        Math.max(endY - startY, 1);

      targetRef.current = Math.max(
        0,
        Math.min(1, raw)
      );
    };

    const animate = () => {
      currentRef.current +=
        (targetRef.current - currentRef.current) * 0.08;

      setProgress(currentRef.current);

      rafRef.current = requestAnimationFrame(animate);
    };

    window.addEventListener(
      "scroll",
      updateTarget,
      { passive: true }
    );

    updateTarget();

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener(
        "scroll",
        updateTarget
      );

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [start, end]);

  return progress;
}
