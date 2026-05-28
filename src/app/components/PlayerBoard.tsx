import { GameGrid, LetterState } from './GameGrid';
import { Crown } from 'lucide-react';

interface PlayerBoardProps {
  playerName: string;
  playerNumber: number;
  guesses: string[];
  currentGuess: string;
  letterStates: LetterState[][];
  currentRow: number;
  isActive: boolean;
  hasWon: boolean;
  hideLetters?: boolean;
}

export function PlayerBoard({
  playerName,
  playerNumber,
  guesses,
  currentGuess,
  letterStates,
  currentRow,
  isActive,
  hasWon,
  hideLetters = false,
}: PlayerBoardProps) {
  return (
    <div className="relative">
      <div
        className={`rounded-3xl p-4 transition-all duration-300 ${
          isActive
            ? 'bg-white shadow-xl border-2 border-emerald-500 scale-[1.02]'
            : 'bg-white/50 shadow-md border border-slate-200'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {(() => {
              const gradients = [
                'from-emerald-500 to-teal-600',
                'from-amber-500 to-orange-600',
                'from-sky-500 to-indigo-600',
                'from-fuchsia-500 to-pink-600',
                'from-lime-500 to-green-600',
                'from-violet-500 to-purple-600',
                'from-rose-500 to-red-600',
                'from-cyan-500 to-blue-600',
              ];
              const idx = Math.max(0, Math.floor(playerNumber) - 1) % gradients.length;
              const gradient = gradients[idx] ?? gradients[0];

              return (
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg bg-gradient-to-br ${gradient} text-white`}
                >
                  {playerNumber}
                </div>
              );
            })()}
            <div>
              <div className="font-semibold text-slate-900">{playerName}</div>
              <div className="text-xs text-slate-500">
                {isActive ? 'A jogar...' : 'Aguardar'}
              </div>
            </div>
          </div>
          {hasWon && (
            <div className="flex items-center gap-2 bg-amber-100 text-amber-700 px-3 py-1.5 rounded-full">
              <Crown className="w-4 h-4" />
              <span className="text-sm font-semibold">Venceu!</span>
            </div>
          )}
        </div>

        <GameGrid
          guesses={guesses}
          currentGuess={currentGuess}
          letterStates={letterStates}
          currentRow={currentRow}
          hideLetters={hideLetters}
        />

        {!isActive && !hasWon && (
          <div className="absolute inset-0 bg-slate-900/5 backdrop-blur-[1px] rounded-3xl pointer-events-none" />
        )}
      </div>
    </div>
  );
}
