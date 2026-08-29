import { useEffect, useRef, useState } from "react";

export function useQuizScrollProgress() {
  const [progress, setProgress] = useState(0);

  const target = useRef(0);
  const current = useRef(0);

  useEffect(() => {
    let raf = 0;

    const updateTarget = () => {
      const scrollY = window.scrollY;
      const viewport = window.innerHeight;
      
      // Assume a 300vh section for the animation. So the distance is viewport * 2
      const animationDistance = viewport * 2.0;

      target.current = Math.max(
        0,
        Math.min(1, scrollY / animationDistance)
      );
    };

    const animate = () => {
      current.current += (target.current - current.current) * 0.08;

      setProgress(current.current);

      raf = requestAnimationFrame(animate);
    };

    window.addEventListener("scroll", updateTarget, { passive: true });
    updateTarget();

    raf = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("scroll", updateTarget);
      cancelAnimationFrame(raf);
    };
  }, []);

  return progress;
}
