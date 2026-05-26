import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  transports: ['polling'],
  allowUpgrades: false,
  cors: {
    origin: "*", // Em produção, altere para o URL do seu frontend
    methods: ["GET", "POST"]
  }
});

io.engine.on('connection_error', (err) => {
  console.warn('engine connection_error', {
    code: err.code,
    message: err.message,
    context: err.context,
  });
});

// Tipos partilhados entre frontend e backend
type KeyStateValue = 'correct' | 'present' | 'absent' | 'unused';
type GuessCellState = 'correct' | 'present' | 'absent';
type LetterState = GuessCellState[];

interface PlayerState {
  id: string | null;
  guesses: string[];
  currentGuess: string;
  currentRow: number;
  letterStates: LetterState[];
  keyStates: Record<string, KeyStateValue>;
  gameStatus: 'playing' | 'won' | 'lost' | 'waiting';
}

interface GameState {
  player1: PlayerState;
  player2: PlayerState;
  activePlayerId: string | null;
  targetWord: string; // Simplificado para uma palavra por sala
}

interface Room {
  players: string[];
  mode: 'dash' | 'coop';
  gameState: GameState;
  hostId: string;
}

const rooms: Record<string, Room> = {};
const roomCleanupTimers: Record<string, ReturnType<typeof setTimeout>> = {};

const cancelRoomCleanup = (roomId: string) => {
  const timer = roomCleanupTimers[roomId];
  if (!timer) return;
  clearTimeout(timer);
  delete roomCleanupTimers[roomId];
};

const scheduleRoomCleanup = (roomId: string, delayMs = 30_000) => {
  cancelRoomCleanup(roomId);
  roomCleanupTimers[roomId] = setTimeout(() => {
    const room = rooms[roomId];
    if (room && room.players.length === 0) {
      delete rooms[roomId];
      console.log(`Room ${roomId} removed after ${delayMs}ms with no players.`);
    }
    delete roomCleanupTimers[roomId];
  }, delayMs);
};

const WORDS_FILE_PATH = path.join(__dirname, '..', 'words.txt');

const loadWordList = (): string[] => {
  try {
    if (!fs.existsSync(WORDS_FILE_PATH)) return [];
    const raw = fs.readFileSync(WORDS_FILE_PATH, 'utf8');
    return raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'))
      .map((w) => w.toLocaleUpperCase('pt-PT'))
      .filter((w) => w.length === 5);
  } catch (e) {
    console.warn('Failed to load words.txt:', e);
    return [];
  }
};

const getRandomTargetWord = () => {
  const words = loadWordList();
  if (words.length === 0) return 'TERMO';
  return words[Math.floor(Math.random() * words.length)];
};

const normalizeLetter = (letter: string) => {
  return letter
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('pt-PT');
};

const normalizeWord = (word: string) => word.split('').map(normalizeLetter).join('');

const getKeyVariants = (letter: string) => {
  const lower = letter.toLocaleLowerCase('pt-PT');
  const baseLower = normalizeLetter(letter).toLocaleLowerCase('pt-PT');
  const set = new Set([lower, baseLower]);

  // Trata Ç como variante de C para cores do teclado.
  if (baseLower === 'c') {
    set.add('c');
    set.add('ç');
  }

  return Array.from(set);
};

const findCanonicalWord = (guess: string) => {
  const words = loadWordList();
  const normGuess = normalizeWord(guess);
  return words.find((w) => normalizeWord(w) === normGuess) ?? null;
};

const mergeKeyState = (current: KeyStateValue, next: KeyStateValue): KeyStateValue => {
  const rank: Record<KeyStateValue, number> = { unused: 0, absent: 1, present: 2, correct: 3 };
  return rank[next] > rank[current] ? next : current;
};

const createInitialPlayerState = (): PlayerState => ({
  id: null,
  guesses: [],
  currentGuess: '',
  currentRow: 0,
  letterStates: [],
  keyStates: {},
  gameStatus: 'waiting',
});

const getUpdatedKeyStates = (
  guess: string,
  targetWord: string,
  currentKeyStates: Record<string, KeyStateValue>
) => {
  const next = { ...currentKeyStates };
  const targetLetters = targetWord.split('');
  const guessLetters = guess.split('');
  const normTarget = targetLetters.map(normalizeLetter);
  const normGuess = guessLetters.map(normalizeLetter);

  const letterCount: Record<string, number> = {};
  normTarget.forEach((letter) => {
    letterCount[letter] = (letterCount[letter] || 0) + 1;
  });

  const applyKeyState = (letter: string, state: KeyStateValue) => {
    for (const k of getKeyVariants(letter)) {
      const current = next[k] ?? 'unused';
      next[k] = mergeKeyState(current, state);
    }
  };

  // Correct first
  normGuess.forEach((_, i) => {
    if (normGuess[i] === normTarget[i]) {
      applyKeyState(guessLetters[i] ?? '', 'correct');
      applyKeyState(targetLetters[i] ?? '', 'correct');
      const key = normTarget[i];
      letterCount[key]--;
    }
  });

  // Present / absent
  normGuess.forEach((_, i) => {
    if (normGuess[i] === normTarget[i]) return;

    const key = normGuess[i];
    if (letterCount[key] > 0) {
      applyKeyState(guessLetters[i] ?? '', 'present');
      letterCount[key]--;
    } else {
      applyKeyState(guessLetters[i] ?? '', 'absent');
    }
  });

  return next;
};

// Lógica de verificação de palavras (movida para o servidor)
const checkGuess = (guess: string, targetWord: string) => {
  const newLetterStates: LetterState = [];
  const targetLetters = targetWord.split('');
  const guessLetters = guess.split('');

  const normTarget = targetLetters.map(normalizeLetter);
  const normGuess = guessLetters.map(normalizeLetter);

  const letterCount: Record<string, number> = {};
  normTarget.forEach((letter) => {
    letterCount[letter] = (letterCount[letter] || 0) + 1;
  });

  // Correct first
  normGuess.forEach((_, i) => {
    if (normGuess[i] === normTarget[i]) {
      newLetterStates[i] = 'correct';
      letterCount[normTarget[i]]--;
    }
  });

  // Present / absent
  normGuess.forEach((_, i) => {
    if (newLetterStates[i]) return;

    const key = normGuess[i];
    if (letterCount[key] > 0) {
      newLetterStates[i] = 'present';
      letterCount[key]--;
    } else {
      newLetterStates[i] = 'absent';
    }
  });

  return newLetterStates;
};

const getOtherPlayerId = (room: Room, currentPlayerId: string) => {
  const { player1, player2 } = room.gameState;
  const otherId = currentPlayerId === player1.id ? player2.id : player1.id;
  return otherId && room.players.includes(otherId) ? otherId : null;
};

const ensureActivePlayer = (room: Room) => {
  const active = room.gameState.activePlayerId;
  if (active && room.players.includes(active)) return;
  room.gameState.activePlayerId = room.players[0] ?? null;
};

io.on('connection', (socket) => {
  console.log('a user connected:', socket.id);

  socket.on('create-room', ({ mode }: { mode: 'dash' | 'coop' }) => {
    const roomId = Math.random().toString(36).substring(2, 8);
    const targetWord = getRandomTargetWord();

    const hostPlayerState = { ...createInitialPlayerState(), id: socket.id, gameStatus: 'waiting' as const };

    rooms[roomId] = {
      players: [socket.id],
      mode: mode,
      hostId: socket.id,
      gameState: {
        player1: hostPlayerState,
        player2: { ...createInitialPlayerState(), id: null },
        activePlayerId: null,
        targetWord: targetWord,
      },
    };

    socket.join(roomId);
    cancelRoomCleanup(roomId);

    console.log(`Room ${roomId} (mode: ${mode}) created by ${socket.id}`);
    socket.emit('room-created', { roomId, mode });
    io.to(roomId).emit('game-state-update', rooms[roomId].gameState);
  });

  socket.on('join-room', (roomId: string) => {
    const normalizedRoomId = roomId.trim().toLowerCase();
    const room = rooms[normalizedRoomId];
    if (!room) {
      socket.emit('room-not-found');
      return;
    }

    cancelRoomCleanup(normalizedRoomId);

    const isPlayer1 = room.gameState.player1.id === null || room.gameState.player1.id === socket.id;
    const isPlayer2 = room.gameState.player2.id === null || room.gameState.player2.id === socket.id;

    if (room.players.includes(socket.id)) {
       // Já está na sala, apenas envia o estado atual
       io.to(normalizedRoomId).emit('game-state-update', room.gameState);
       return;
    }

    if (room.players.length >= 2) {
      socket.emit('room-full');
      return;
    }

    socket.join(normalizedRoomId);
    room.players.push(socket.id);

    const someoneWon = room.gameState.player1.gameStatus === 'won' || room.gameState.player2.gameStatus === 'won';
    const hasTwoPlayers = room.players.length >= 2;

    if (isPlayer1) {
      room.gameState.player1.id = socket.id;
      room.gameState.player1.gameStatus =
        room.mode === 'dash' && someoneWon
          ? 'lost'
          : hasTwoPlayers
            ? 'playing'
            : 'waiting';
    } else if (isPlayer2) {
      room.gameState.player2.id = socket.id;
      room.gameState.player2.gameStatus =
        room.mode === 'dash' && someoneWon
          ? 'lost'
          : hasTwoPlayers
            ? 'playing'
            : 'waiting';
    }

    if (hasTwoPlayers) {
      if (room.gameState.player1.id && room.gameState.player1.gameStatus === 'waiting') {
        room.gameState.player1.gameStatus = 'playing';
      }
      if (room.gameState.player2.id && room.gameState.player2.gameStatus === 'waiting') {
        room.gameState.player2.gameStatus = 'playing';
      }

      if (room.mode === 'coop') {
        room.gameState.player2.keyStates = { ...room.gameState.player1.keyStates };
      }
    }
    
    // Define o primeiro jogador a entrar como o jogador ativo (apenas no modo Co-op)
    if (room.mode === 'coop' && !room.gameState.activePlayerId) {
      room.gameState.activePlayerId = socket.id;
    }

    console.log(`${socket.id} joined room ${normalizedRoomId}`);
    io.to(normalizedRoomId).emit('game-state-update', room.gameState);
    socket.emit('joined-room', { roomId: normalizedRoomId, mode: room.mode, players: room.players });
  });

  socket.on('leave-room', (roomId: string) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.hostId === socket.id) {
      io.to(roomId).emit('room-closed');
      io.in(roomId).socketsLeave(roomId);
      delete rooms[roomId];
      return;
    }

    const playerIndex = room.players.indexOf(socket.id);
    if (playerIndex === -1) return;

    socket.leave(roomId);
    room.players.splice(playerIndex, 1);

    if (room.gameState.player1.id === socket.id) {
      room.gameState.player1 = { ...createInitialPlayerState(), id: null };
    }
    if (room.gameState.player2.id === socket.id) {
      room.gameState.player2 = { ...createInitialPlayerState(), id: null };
    }

    if (room.gameState.activePlayerId === socket.id) {
      ensureActivePlayer(room);
    }

    if (room.players.length < 2) {
      if (room.gameState.player1.id && room.gameState.player1.gameStatus === 'playing') {
        room.gameState.player1.gameStatus = 'waiting';
      }
      if (room.gameState.player2.id && room.gameState.player2.gameStatus === 'playing') {
        room.gameState.player2.gameStatus = 'waiting';
      }
    }

    if (room.players.length === 0) {
      scheduleRoomCleanup(roomId);
      console.log(`Room ${roomId} is empty. Waiting before cleanup.`);
      return;
    }

    if (room.hostId === socket.id) {
      room.hostId = room.players[0];
    }

    io.to(roomId).emit('game-state-update', room.gameState);
    socket.to(roomId).emit('player-left', socket.id);
  });

  socket.on('rematch', (roomId: string) => {
    const room = rooms[roomId];
    if (!room) return;
    if (!room.players.includes(socket.id)) return;

    const canStart = room.players.length >= 2;

    const resetFor = (playerId: string | null): PlayerState => {
      const next = { ...createInitialPlayerState(), id: playerId };
      if (playerId) next.gameStatus = canStart ? 'playing' : 'waiting';
      return next;
    };

    room.gameState.player1 = resetFor(room.gameState.player1.id);
    room.gameState.player2 = resetFor(room.gameState.player2.id);

    room.gameState.targetWord = getRandomTargetWord();

    room.gameState.activePlayerId = room.mode === 'coop' ? room.players[0] ?? null : null;

    io.to(roomId).emit('game-state-update', room.gameState);
  });

  socket.on('game-action', (data: { roomId: string; action: 'key-press' | 'delete' | 'enter'; key?: string }) => {
    const { roomId, action, key } = data;
    const room = rooms[roomId];
    if (!room) return;
    if (room.players.length < 2) return;

    const playerState =
      room.gameState.player1.id === socket.id
        ? room.gameState.player1
        : room.gameState.player2.id === socket.id
          ? room.gameState.player2
          : null;

    if (!playerState) return;

    const sharedState = room.mode === 'coop' ? room.gameState.player1 : playerState;

    // No Co-op joga por turnos; no Dash ambos podem jogar quando quiserem.
    if (room.mode === 'coop') {
      ensureActivePlayer(room);
      if (socket.id !== room.gameState.activePlayerId) return;
    }

    // No Dash, quando alguém ganha, o jogo termina.
    if (room.mode === 'dash' && (room.gameState.player1.gameStatus === 'won' || room.gameState.player2.gameStatus === 'won')) {
      return;
    }

    if (sharedState.gameStatus !== 'playing') return;

    if (action === 'key-press' && key && sharedState.currentGuess.length < 5) {
      sharedState.currentGuess += key;
    } else if (action === 'delete') {
      sharedState.currentGuess = sharedState.currentGuess.slice(0, -1);
    } else if (action === 'enter' && sharedState.currentGuess.length === 5) {
      const guess = sharedState.currentGuess;
      const targetWord = room.gameState.targetWord;

      const canonicalGuess = findCanonicalWord(guess);
      if (!canonicalGuess) {
        socket.emit('invalid-word', { guess });
        return;
      }

      // Se acertar (mesmo sem acentos/Ç), mostra a letra "real" no tabuleiro.
      // Também converte a guess para a forma canónica (com acentos/ç) do words.txt.
      const guessLetters = canonicalGuess.split('');
      const targetLetters = targetWord.split('');
      const displayedGuessLetters = guessLetters.map((g, i) => {
        return normalizeLetter(g) === normalizeLetter(targetLetters[i] ?? '') ? (targetLetters[i] ?? g) : g;
      });
      const displayedGuess = displayedGuessLetters.join('');

      const newLetterStates = checkGuess(canonicalGuess, targetWord);
      const newKeyStates = getUpdatedKeyStates(canonicalGuess, targetWord, sharedState.keyStates);
      
      sharedState.guesses.push(displayedGuess);
      sharedState.letterStates.push(newLetterStates);
      sharedState.keyStates = newKeyStates;
      sharedState.currentRow++;
      sharedState.currentGuess = '';

      const isCorrect = normalizeWord(guess) === normalizeWord(room.gameState.targetWord);
      if (isCorrect) {
        sharedState.gameStatus = 'won';

        // No Dash, o primeiro a acertar termina o jogo.
        if (room.mode === 'dash') {
          const otherId = getOtherPlayerId(room, socket.id);
          if (otherId) {
            const otherState = otherId === room.gameState.player1.id ? room.gameState.player1 : room.gameState.player2;
            if (otherState.gameStatus === 'playing') otherState.gameStatus = 'lost';
          }
        }
      } else if (sharedState.currentRow >= 6) {
        sharedState.gameStatus = 'lost';
      }

      // Troca de vez apenas no modo Co-op (joga vez a vez)
      if (room.mode === 'coop' && !isCorrect) {
        const otherId = getOtherPlayerId(room, socket.id);
        if (otherId) room.gameState.activePlayerId = otherId;
      }
    }

    if (room.mode === 'coop') {
      const mirrorState = room.gameState.player2;
      mirrorState.guesses = [...sharedState.guesses];
      mirrorState.currentGuess = sharedState.currentGuess;
      mirrorState.currentRow = sharedState.currentRow;
      mirrorState.letterStates = sharedState.letterStates.map((row) => [...row]);
      mirrorState.keyStates = { ...sharedState.keyStates };
      mirrorState.gameStatus = sharedState.gameStatus;
    }

    io.to(roomId).emit('game-state-update', room.gameState);
  });

  socket.on('disconnect', () => {
    console.log('user disconnected:', socket.id);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.indexOf(socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);

        if (room.gameState.player1.id === socket.id) {
          room.gameState.player1 = { ...createInitialPlayerState(), id: null };
        }
        if (room.gameState.player2.id === socket.id) {
          room.gameState.player2 = { ...createInitialPlayerState(), id: null };
        }

        if (room.gameState.activePlayerId === socket.id) {
          ensureActivePlayer(room);
        }

        if (room.players.length < 2) {
          if (room.gameState.player1.id && room.gameState.player1.gameStatus === 'playing') {
            room.gameState.player1.gameStatus = 'waiting';
          }
          if (room.gameState.player2.id && room.gameState.player2.gameStatus === 'playing') {
            room.gameState.player2.gameStatus = 'waiting';
          }
        }

        if (room.players.length === 0) {
          scheduleRoomCleanup(roomId);
          console.log(`Room ${roomId} is empty after disconnect. Waiting before cleanup.`);
        } else {
          cancelRoomCleanup(roomId);
          if (room.hostId === socket.id) {
            room.hostId = room.players[0];
          }
          io.to(roomId).emit('game-state-update', room.gameState);
          socket.to(roomId).emit('player-left', socket.id);
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
