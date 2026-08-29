interface LeaderboardEntry {
  player_name: string;
  score: number;
  max_score: number;
  percentage: number;
  tier: string;
  created_at: string;
}

interface MasterLeaderboardProps {
  entries: LeaderboardEntry[];
  currentPlayerName?: string;
}

export default function MasterLeaderboard({
  entries,
  currentPlayerName,
}: MasterLeaderboardProps) {
  return (
    <section
      className="
        mx-auto
        w-full
        max-w-5xl
        px-6
        py-24
      "
    >
      <div className="mb-10 text-center md:text-left">
        <p
          className="
            text-xs
            uppercase
            tracking-[0.3em]
            opacity-50
            text-[#d4a500]
          "
        >
          Cricket DNA
        </p>

        <h2
          className="
            mt-2
            text-4xl
            font-semibold
            tracking-tight
            text-white
            uppercase
          "
          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
        >
          Master Board
        </h2>
      </div>

      <div
        className="
          overflow-hidden
          rounded-3xl
          border border-white/10
          bg-[#0a0a0a]
        "
      >
        {entries.length === 0 ? (
          <div className="px-6 py-16 text-center text-white">
            <p className="text-2xl font-semibold">
              The board is empty.
            </p>

            <p className="mt-2 opacity-50">
              Someone's gotta set the score.
            </p>
          </div>
        ) : (
          <div className="text-white">
            {entries.map((entry, index) => {
              const isCurrent =
                currentPlayerName &&
                entry.player_name === currentPlayerName;

              return (
                <div
                  key={`${entry.player_name}-${entry.created_at}`}
                  className={`
                    grid
                    grid-cols-[60px_1fr_auto]
                    items-center
                    gap-4
                    border-b border-white/5
                    px-5
                    py-5
                    last:border-b-0
                    md:grid-cols-[80px_1fr_140px_180px]
                    ${
                      isCurrent
                        ? "bg-white/10"
                        : "hover:bg-white/5"
                    }
                    transition-colors
                  `}
                >
                  <span
                    className="
                      text-sm
                      font-mono
                      opacity-50
                      text-[#d4a500]
                    "
                  >
                    #{String(index + 1).padStart(2, "0")}
                  </span>

                  <div>
                    <p className="font-semibold text-lg">
                      {entry.player_name}
                    </p>

                    <p className="mt-1 text-xs opacity-60">
                      {entry.tier}
                    </p>
                  </div>

                  <span
                    className="
                      font-mono
                      font-semibold
                      text-xl
                    "
                  >
                    {entry.score}/
                    {entry.max_score}
                  </span>

                  <span
                    className="
                      hidden
                      text-right
                      text-sm
                      opacity-50
                      md:block
                    "
                  >
                    {entry.percentage}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
