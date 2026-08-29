import { useEffect, useState } from "react";
import { fetchLeaderboard, LeaderboardEntry } from "@/lib/api";

interface MasterLeaderboardProps {
  currentPlayerName?: string;
}

export default function MasterLeaderboard({ currentPlayerName }: MasterLeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard()
      .then((data) => setEntries(data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-[#a0a0a0] text-center py-20 text-sm tracking-widest uppercase">Loading the Board...</div>;
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-20">
        <h3 className="text-white font-serif text-3xl mb-4">THE BOARD IS EMPTY.</h3>
        <p className="text-[#a0a0a0]">Someone's gotta set the score.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-20">
      <h3 className="font-serif text-4xl text-white text-center mb-12 uppercase tracking-tight">Master Leaderboard</h3>
      
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.2em] text-[#6a6a6a]">
              <th className="py-4 px-4 font-normal">Rank</th>
              <th className="py-4 px-4 font-normal">Fan</th>
              <th className="py-4 px-4 font-normal">Score</th>
              <th className="py-4 px-4 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, idx) => {
              const isCurrentPlayer = entry.player_name === currentPlayerName;
              return (
                <tr 
                  key={idx} 
                  className={`border-b border-white/5 transition-colors ${isCurrentPlayer ? 'bg-white/10' : 'hover:bg-white/5'}`}
                >
                  <td className="py-4 px-4 font-mono text-sm text-[#a0a0a0]">
                    #{String(idx + 1).padStart(2, '0')}
                  </td>
                  <td className={`py-4 px-4 font-bold ${isCurrentPlayer ? 'text-[#d4a500]' : 'text-white'}`}>
                    {entry.player_name}
                  </td>
                  <td className="py-4 px-4 font-mono text-[#a0a0a0]">
                    <span className="text-white font-bold">{entry.score}</span> /{entry.max_score}
                  </td>
                  <td className="py-4 px-4 text-xs tracking-widest uppercase text-[#a0a0a0]">
                    {entry.tier}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
