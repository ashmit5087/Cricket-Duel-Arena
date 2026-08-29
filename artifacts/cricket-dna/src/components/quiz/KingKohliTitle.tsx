interface KingKohliTitleProps {
  progress: number;
}

export function KingKohliTitle({
  progress,
}: KingKohliTitleProps) {
  const opacity =
    Math.min(
      1,
      Math.max(
        0,
        (progress - 0.12) / 0.25
      )
    );

  const scale =
    0.92 +
    opacity * 0.08;

  return (
    <div
      className="
        pointer-events-none
        fixed
        inset-0
        z-20
        flex
        items-center
        justify-center
        px-6
        text-center
      "
      style={{
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      <h1
        className="
          uppercase
          text-white
        "
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: "clamp(60px, 15vw, 180px)",
          letterSpacing: "0.04em",
          lineHeight: 0.9,
          textShadow: "0 10px 40px rgba(0,0,0,0.5)"
        }}
      >
        KING KOHLI
      </h1>
    </div>
  );
}
