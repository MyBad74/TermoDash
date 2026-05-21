import { motion } from 'motion/react';

export type LetterState = 'correct' | 'present' | 'absent' | 'empty' | 'current';

interface CellProps {
  letter: string;
  state: LetterState;
  index: number;
}

function Cell({ letter, state, index }: CellProps) {
  const getStateStyles = () => {
    switch (state) {
      case 'correct':
        return 'bg-emerald-500 border-emerald-500 text-white';
      case 'present':
        return 'bg-amber-500 border-amber-500 text-white';
      case 'absent':
        return 'bg-slate-400 border-slate-400 text-white';
      case 'current':
        return 'border-slate-400 bg-white text-slate-900';
      default:
        return 'border-slate-300 bg-white text-slate-900';
    }
  };

  return (
    <motion.div
      initial={{ scale: 1 }}
      animate={
        state !== 'empty' && state !== 'current'
          ? { rotateX: [0, 90, 0], scale: [1, 1.05, 1] }
          : { scale: letter ? [1, 1.1, 1] : 1 }
      }
      transition={{ duration: 0.6, delay: index * 0.1 }}
      className={`
        w-14 h-14 border-2 rounded-xl
        flex items-center justify-center
        font-bold text-2xl uppercase
        transition-all duration-200
        ${getStateStyles()}
      `}
    >
      {letter}
    </motion.div>
  );
}

interface GameGridProps {
  guesses: string[];
  currentGuess: string;
  letterStates: LetterState[][];
  currentRow: number;
}

export function GameGrid({ guesses, currentGuess, letterStates, currentRow }: GameGridProps) {
  const rows = 6;
  const cols = 5;

  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-2 justify-center">
          {Array.from({ length: cols }).map((_, colIndex) => {
            let letter = '';
            let state: LetterState = 'empty';

            if (rowIndex < currentRow) {
              letter = guesses[rowIndex]?.[colIndex] || '';
              state = letterStates[rowIndex]?.[colIndex] || 'empty';
            } else if (rowIndex === currentRow) {
              letter = currentGuess[colIndex] || '';
              state = letter ? 'current' : 'empty';
            }

            return (
              <Cell
                key={colIndex}
                letter={letter}
                state={state}
                index={colIndex}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
