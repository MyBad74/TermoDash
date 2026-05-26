import { Delete } from 'lucide-react';
import { motion } from 'motion/react';

interface KeyboardProps {
  onKeyPress: (key: string) => void;
  onDelete: () => void;
  onEnter: () => void;
  keyStates: Record<string, 'correct' | 'present' | 'absent' | 'unused'>;
}

export function Keyboard({ onKeyPress, onDelete, onEnter, keyStates }: KeyboardProps) {
  const rows = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ç'],
    ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'DELETE'],
  ];

  const getKeyStyle = (key: string) => {
    const state = keyStates[key.toLowerCase()] || 'unused';

    switch (state) {
      case 'correct':
        return 'bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600';
      case 'present':
        return 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600';
      case 'absent':
        return 'bg-slate-400 text-white border-slate-400 hover:bg-slate-500';
      default:
        return 'bg-slate-200 text-slate-900 border-slate-300 hover:bg-slate-300';
    }
  };

  const handleClick = (key: string) => {
    if (key === 'ENTER') {
      onEnter();
    } else if (key === 'DELETE') {
      onDelete();
    } else {
      onKeyPress(key);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-1">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex gap-1 mb-1 justify-center">
          {row.map((key) => {
            const isWide = key === 'ENTER' || key === 'DELETE';

            return (
              <motion.button
                key={key}
                onClick={() => handleClick(key)}
                whileTap={{ scale: 0.95 }}
                className={`
                  ${isWide ? 'px-3' : 'w-8'} h-12
                  rounded-lg border-2 font-semibold text-sm
                  transition-all duration-150
                  ${getKeyStyle(key)}
                  active:translate-y-0.5
                `}
              >
                {key === 'DELETE' ? (
                  <Delete className="w-5 h-5 mx-auto" />
                ) : (
                  key
                )}
              </motion.button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
