import { Flame, Trophy, Target } from 'lucide-react';

interface GameStatsProps {
  currentAttempt: number;
  attemptsRemaining: number;
  streak: number;
  gamesWon: number;
}

export function GameStats({ currentAttempt, attemptsRemaining, streak, gamesWon }: GameStatsProps) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
            <Target className="w-6 h-6 text-emerald-600" />
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-900">{currentAttempt}</div>
            <div className="text-xs text-slate-500">Tentativa</div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
            <Flame className="w-6 h-6 text-amber-600" />
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-900">{streak}</div>
            <div className="text-xs text-slate-500">Sequência</div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center">
            <Trophy className="w-6 h-6 text-teal-600" />
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-900">{gamesWon}</div>
            <div className="text-xs text-slate-500">Vitórias</div>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-200">
        <div className="text-center">
          <div className="text-sm text-slate-600">Tentativas restantes</div>
          <div className="flex gap-1 justify-center mt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`w-6 h-6 rounded ${
                  i < attemptsRemaining
                    ? 'bg-emerald-500'
                    : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
