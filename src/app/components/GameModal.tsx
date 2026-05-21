import { motion, AnimatePresence } from 'motion/react';
import { Share2, RotateCcw, Trophy, X as XIcon } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useEffect } from 'react';

interface GameModalProps {
  isOpen: boolean;
  isWin: boolean;
  word: string;
  attempts: number;
  winner?: number;
  onClose: () => void;
  onPlayAgain: () => void;
  onShare: () => void;
}

export function GameModal({
  isOpen,
  isWin,
  word,
  attempts,
  winner,
  onClose,
  onPlayAgain,
  onShare,
}: GameModalProps) {
  useEffect(() => {
    if (isOpen && isWin) {
      const duration = 3000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

      const randomInRange = (min: number, max: number) => {
        return Math.random() * (max - min) + min;
      };

      const interval = setInterval(() => {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);

        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        });
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        });
      }, 250);

      return () => clearInterval(interval);
    }
  }, [isOpen, isWin]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
              <div className="relative">
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <XIcon className="w-5 h-5 text-slate-600" />
                </button>

                <div
                  className={`p-8 text-center ${
                    isWin
                      ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                      : 'bg-gradient-to-br from-slate-500 to-slate-600'
                  }`}
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                    className="w-20 h-20 mx-auto mb-4 bg-white rounded-full flex items-center justify-center"
                  >
                    {isWin ? (
                      <Trophy className="w-10 h-10 text-emerald-600" />
                    ) : (
                      <div className="text-3xl">😔</div>
                    )}
                  </motion.div>
                  <h2 className="text-3xl font-bold text-white mb-2">
                    {isWin ? 'Parabéns!' : 'Quase lá!'}
                  </h2>
                  <p className="text-white/90 text-lg">
                    {isWin
                      ? winner
                        ? `Jogador ${winner} venceu em ${attempts} ${attempts === 1 ? 'tentativa' : 'tentativas'}!`
                        : `Conseguiste em ${attempts} ${attempts === 1 ? 'tentativa' : 'tentativas'}!`
                      : 'Tenta novamente!'}
                  </p>
                </div>

                <div className="p-8">
                  <div className="bg-slate-100 rounded-2xl p-4 mb-6">
                    <div className="text-sm text-slate-600 mb-1">A palavra era:</div>
                    <div className="text-3xl font-bold text-slate-900 uppercase tracking-wider">
                      {word}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button
                      onClick={onPlayAgain}
                      className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-700 transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
                    >
                      <RotateCcw className="w-5 h-5" />
                      Jogar Novamente
                    </button>
                    <button
                      onClick={onShare}
                      className="w-full py-4 bg-slate-200 text-slate-900 font-semibold rounded-xl hover:bg-slate-300 transition-all flex items-center justify-center gap-2"
                    >
                      <Share2 className="w-5 h-5" />
                      Partilhar Resultado
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
