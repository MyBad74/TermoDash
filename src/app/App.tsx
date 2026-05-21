import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { LetterState } from './components/GameGrid';
import { Keyboard } from './components/Keyboard';
import { GameModal } from './components/GameModal';
import { GameTabs } from './components/GameTabs';
import { PlayerBoard } from './components/PlayerBoard';
import { toast, Toaster } from 'sonner';

const WORD_LENGTH = 5;
const MAX_ATTEMPTS = 6;
const TARGET_WORDS = {
  dash: ['RITMO', '速度'],
  coop: ['UNIAO', 'EQUIPA'],
};

interface PlayerState {
  guesses: string[];
  currentGuess: string;
  currentRow: number;
  letterStates: LetterState[][];
  keyStates: Record<string, 'correct' | 'present' | 'absent' | 'unused'>;
  gameStatus: 'playing' | 'won' | 'lost';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dash' | 'coop'>('dash');
  const [activePlayer, setActivePlayer] = useState<1 | 2>(1);

  const [player1, setPlayer1] = useState<PlayerState>({
    guesses: [],
    currentGuess: '',
    currentRow: 0,
    letterStates: [],
    keyStates: {},
    gameStatus: 'playing',
  });

  const [player2, setPlayer2] = useState<PlayerState>({
    guesses: [],
    currentGuess: '',
    currentRow: 0,
    letterStates: [],
    keyStates: {},
    gameStatus: 'playing',
  });

  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<{
    winner: 1 | 2 | null;
    word: string;
    attempts: number;
  }>({ winner: null, word: '', attempts: 0 });

  const getCurrentTargetWord = useCallback(() => {
    const words = TARGET_WORDS[activeTab];
    return activePlayer === 1 ? words[0] : words[1];
  }, [activeTab, activePlayer]);

  const getCurrentPlayer = useCallback(() => {
    return activePlayer === 1 ? player1 : player2;
  }, [activePlayer, player1, player2]);

  const setCurrentPlayer = useCallback((updater: (prev: PlayerState) => PlayerState) => {
    if (activePlayer === 1) {
      setPlayer1(updater);
    } else {
      setPlayer2(updater);
    }
  }, [activePlayer]);

  const checkGuess = useCallback((guess: string, targetWord: string, currentKeyStates: Record<string, 'correct' | 'present' | 'absent' | 'unused'>) => {
    const newLetterStates: LetterState[] = [];
    const newKeyStates = { ...currentKeyStates };
    const targetLetters = targetWord.split('');
    const guessLetters = guess.split('');

    const letterCount: Record<string, number> = {};
    targetLetters.forEach((letter) => {
      letterCount[letter] = (letterCount[letter] || 0) + 1;
    });

    guessLetters.forEach((letter, i) => {
      if (letter === targetLetters[i]) {
        newLetterStates[i] = 'correct';
        newKeyStates[letter.toLowerCase()] = 'correct';
        letterCount[letter]--;
      }
    });

    guessLetters.forEach((letter, i) => {
      if (newLetterStates[i]) return;

      if (targetLetters.includes(letter) && letterCount[letter] > 0) {
        newLetterStates[i] = 'present';
        if (newKeyStates[letter.toLowerCase()] !== 'correct') {
          newKeyStates[letter.toLowerCase()] = 'present';
        }
        letterCount[letter]--;
      } else {
        newLetterStates[i] = 'absent';
        if (!newKeyStates[letter.toLowerCase()]) {
          newKeyStates[letter.toLowerCase()] = 'absent';
        }
      }
    });

    return { newLetterStates, newKeyStates };
  }, []);

  const handleKeyPress = useCallback((key: string) => {
    const currentPlayer = getCurrentPlayer();
    if (currentPlayer.gameStatus !== 'playing') return;
    if (currentPlayer.currentGuess.length >= WORD_LENGTH) return;

    setCurrentPlayer((prev) => ({
      ...prev,
      currentGuess: prev.currentGuess + key,
    }));
  }, [getCurrentPlayer, setCurrentPlayer]);

  const handleDelete = useCallback(() => {
    const currentPlayer = getCurrentPlayer();
    if (currentPlayer.gameStatus !== 'playing') return;

    setCurrentPlayer((prev) => ({
      ...prev,
      currentGuess: prev.currentGuess.slice(0, -1),
    }));
  }, [getCurrentPlayer, setCurrentPlayer]);

  const handleEnter = useCallback(() => {
    const currentPlayer = getCurrentPlayer();
    if (currentPlayer.gameStatus !== 'playing') return;
    if (currentPlayer.currentGuess.length !== WORD_LENGTH) {
      toast.error('Palavra incompleta');
      return;
    }

    const targetWord = getCurrentTargetWord();
    const { newLetterStates, newKeyStates } = checkGuess(
      currentPlayer.currentGuess,
      targetWord,
      currentPlayer.keyStates
    );

    const isCorrect = currentPlayer.currentGuess === targetWord;
    const newRow = currentPlayer.currentRow + 1;
    const isGameOver = newRow >= MAX_ATTEMPTS;

    setCurrentPlayer((prev) => ({
      ...prev,
      guesses: [...prev.guesses, prev.currentGuess],
      letterStates: [...prev.letterStates, newLetterStates],
      keyStates: newKeyStates,
      currentRow: newRow,
      currentGuess: '',
      gameStatus: isCorrect ? 'won' : isGameOver ? 'lost' : 'playing',
    }));

    if (isCorrect) {
      setModalData({
        winner: activePlayer,
        word: targetWord,
        attempts: newRow,
      });
      setTimeout(() => setShowModal(true), 1500);
    } else if (activeTab === 'dash') {
      // No modo Dash, alterna entre jogadores
      setActivePlayer((prev) => (prev === 1 ? 2 : 1));
    }
    // No modo Co-op, ambos jogam simultaneamente então não alterna
  }, [getCurrentPlayer, getCurrentTargetWord, setCurrentPlayer, checkGuess, activePlayer, activeTab]);

  const handlePlayAgain = () => {
    const resetState: PlayerState = {
      guesses: [],
      currentGuess: '',
      currentRow: 0,
      letterStates: [],
      keyStates: {},
      gameStatus: 'playing',
    };

    setPlayer1(resetState);
    setPlayer2(resetState);
    setActivePlayer(1);
    setShowModal(false);
  };

  const handleShare = () => {
    const winningPlayer = modalData.winner === 1 ? player1 : player2;
    const emoji = winningPlayer.letterStates
      .map((row) =>
        row
          .map((state) => {
            if (state === 'correct') return '🟩';
            if (state === 'present') return '🟨';
            return '⬜';
          })
          .join('')
      )
      .join('\n');

    const text = `LEXIS ${activeTab.toUpperCase()} - Jogador ${modalData.winner}\n${modalData.attempts}/6\n\n${emoji}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      toast.success('Resultado copiado!');
    }
  };

  const handleTabChange = (tab: 'dash' | 'coop') => {
    setActiveTab(tab);
    handlePlayAgain(); // Reset game when changing tabs
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleEnter();
      } else if (e.key === 'Backspace') {
        handleDelete();
      } else if (/^[a-záàâãéêíóôõúçA-ZÁÀÂÃÉÊÍÓÔÕÚÇ]$/.test(e.key)) {
        handleKeyPress(e.key.toUpperCase());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyPress, handleDelete, handleEnter]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
      <Toaster position="top-center" richColors />
      <Header
        onHelp={() => toast.info('Dash: turnos alternados | Co-op: joga em simultâneo')}
        onSettings={() => toast.info('Definições em breve')}
        onStats={() => toast.info('Estatísticas em breve')}
      />

      <main className="flex-1 flex flex-col items-center py-8 px-4 gap-6">
        <GameTabs activeTab={activeTab} onTabChange={handleTabChange} />

        <div className="w-full max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <PlayerBoard
              playerName="Jogador 1"
              playerNumber={1}
              guesses={player1.guesses}
              currentGuess={activeTab === 'coop' || activePlayer === 1 ? player1.currentGuess : ''}
              letterStates={player1.letterStates}
              currentRow={player1.currentRow}
              isActive={activeTab === 'coop' || activePlayer === 1}
              hasWon={player1.gameStatus === 'won'}
            />
            <PlayerBoard
              playerName="Jogador 2"
              playerNumber={2}
              guesses={player2.guesses}
              currentGuess={activeTab === 'coop' || activePlayer === 2 ? player2.currentGuess : ''}
              letterStates={player2.letterStates}
              currentRow={player2.currentRow}
              isActive={activeTab === 'coop' || activePlayer === 2}
              hasWon={player2.gameStatus === 'won'}
            />
          </div>

          <div className="flex flex-col items-center gap-4">
            {activeTab === 'dash' && (
              <div className="bg-white rounded-xl px-4 py-2 shadow-sm border border-slate-200">
                <span className="text-sm font-semibold text-slate-600">
                  Vez de: <span className="text-emerald-600">Jogador {activePlayer}</span>
                </span>
              </div>
            )}
            <Keyboard
              onKeyPress={handleKeyPress}
              onDelete={handleDelete}
              onEnter={handleEnter}
              keyStates={activeTab === 'coop' ? {} : getCurrentPlayer().keyStates}
            />
          </div>
        </div>
      </main>

      <GameModal
        isOpen={showModal}
        isWin={modalData.winner !== null}
        word={modalData.word}
        attempts={modalData.attempts}
        winner={modalData.winner || undefined}
        onClose={() => setShowModal(false)}
        onPlayAgain={handlePlayAgain}
        onShare={handleShare}
      />
    </div>
  );
}