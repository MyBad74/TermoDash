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

type SharedCoopState = Omit<PlayerState, 'id'>;

interface GameState {
  players: PlayerState[];
  sharedCoopState?: SharedCoopState;
  activePlayerId: string | null;
  targetWord: string; // uma palavra por sala
  maxPlayers: number;
}

interface Room {
  players: string[]; // socket ids conectados
  maxPlayers: number;
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

const createInitialSharedCoopState = (): SharedCoopState => {
  // Igual ao PlayerState, mas sem o campo id.
  const { id: _ignored, ...rest } = createInitialPlayerState();
  return rest;
};

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

const getPlayerStateById = (room: Room, playerId: string) => {
  return room.gameState.players.find((p) => p.id === playerId) ?? null;
};

const ensureActivePlayer = (room: Room) => {
  const active = room.gameState.activePlayerId;
  if (active && room.players.includes(active)) return;
  room.gameState.activePlayerId = room.players[0] ?? null;
};

const getNextPlayerId = (room: Room, currentPlayerId: string) => {
  const list = room.players;
  if (list.length === 0) return null;
  const idx = list.indexOf(currentPlayerId);
  if (idx === -1) return list[0];
  return list[(idx + 1) % list.length] ?? null;
};

const clampMaxPlayers = (value: unknown, fallback = 2) => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(2, Math.min(8, Math.floor(n)));
};

const canStartGame = (room: Room) => room.players.length >= room.maxPlayers;

const isDashGameOver = (room: Room) => room.gameState.players.some((p) => p.gameStatus === 'won');

io.on('connection', (socket) => {
  console.log('a user connected:', socket.id);

  socket.on('create-room', ({ mode, maxPlayers }: { mode: 'dash' | 'coop'; maxPlayers?: number }) => {
    const roomId = Math.random().toString(36).substring(2, 8).toLowerCase();
    const targetWord = getRandomTargetWord();
    const desiredMaxPlayers = clampMaxPlayers(maxPlayers, 2);

    const playersState = Array.from({ length: desiredMaxPlayers }, () => createInitialPlayerState());
    playersState[0] = { ...playersState[0], id: socket.id, gameStatus: 'waiting' };

    rooms[roomId] = {
      players: [socket.id],
      maxPlayers: desiredMaxPlayers,
      mode,
      hostId: socket.id,
      gameState: {
        players: playersState,
        sharedCoopState: mode === 'coop' ? createInitialSharedCoopState() : undefined,
        activePlayerId: null,
        targetWord,
        maxPlayers: desiredMaxPlayers,
      },
    };

    socket.join(roomId);
    cancelRoomCleanup(roomId);

    console.log(`Room ${roomId} (mode: ${mode}, maxPlayers: ${desiredMaxPlayers}) created by ${socket.id}`);
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

    if (room.players.includes(socket.id)) {
      // Já está na sala, apenas envia o estado atual
      io.to(normalizedRoomId).emit('game-state-update', room.gameState);
      socket.emit('joined-room', { roomId: normalizedRoomId, mode: room.mode, players: room.players });
      return;
    }

    if (room.players.length >= room.maxPlayers) {
      socket.emit('room-full');
      return;
    }

    socket.join(normalizedRoomId);
    room.players.push(socket.id);

    // Reserva um "slot" para o jogador
    let playerState = getPlayerStateById(room, socket.id);
    if (!playerState) {
      playerState = room.gameState.players.find((p) => p.id === null) ?? null;
    }
    if (playerState) {
      playerState.id = socket.id;
    }

    const started = canStartGame(room);

    if (room.mode === 'dash') {
      const alreadyOver = isDashGameOver(room);

      if (playerState) {
        playerState.gameStatus = alreadyOver ? 'lost' : started ? 'playing' : 'waiting';
      }

      if (started && !alreadyOver) {
        for (const p of room.gameState.players) {
          if (p.id && p.gameStatus === 'waiting') p.gameStatus = 'playing';
        }
      }
    } else {
      const shared = room.gameState.sharedCoopState;

      if (playerState) {
        if (shared && (shared.gameStatus === 'won' || shared.gameStatus === 'lost')) {
          playerState.gameStatus = shared.gameStatus;
        } else {
          playerState.gameStatus = started ? 'playing' : 'waiting';
        }
      }

      if (shared) {
        if (started && shared.gameStatus === 'waiting') shared.gameStatus = 'playing';
        if (!started && shared.gameStatus === 'playing') shared.gameStatus = 'waiting';
      }

      if (started) {
        for (const p of room.gameState.players) {
          if (p.id && p.gameStatus === 'waiting') p.gameStatus = 'playing';
        }

        if (!room.gameState.activePlayerId) {
          room.gameState.activePlayerId = room.players[0] ?? null;
        }
        ensureActivePlayer(room);
      }
    }

    console.log(`${socket.id} joined room ${normalizedRoomId}`);
    io.to(normalizedRoomId).emit('game-state-update', room.gameState);
    socket.emit('joined-room', { roomId: normalizedRoomId, mode: room.mode, players: room.players });
  });

  socket.on('leave-room', (roomId: string) => {
    const room = rooms[roomId];
    if (!room) return;

    // Se o host sair explicitamente, a sala fecha (comportamento atual).
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

    const slot = room.gameState.players.find((p) => p.id === socket.id);
    if (slot) {
      Object.assign(slot, createInitialPlayerState(), { id: null });
    }

    if (room.gameState.activePlayerId === socket.id) {
      ensureActivePlayer(room);
    }

    if (!canStartGame(room)) {
      for (const p of room.gameState.players) {
        if (p.id && p.gameStatus === 'playing') p.gameStatus = 'waiting';
      }
      if (room.gameState.sharedCoopState && room.gameState.sharedCoopState.gameStatus === 'playing') {
        room.gameState.sharedCoopState.gameStatus = 'waiting';
      }
    }

    if (room.players.length === 0) {
      scheduleRoomCleanup(roomId);
      console.log(`Room ${roomId} is empty. Waiting before cleanup.`);
      return;
    }

    io.to(roomId).emit('game-state-update', room.gameState);
    socket.to(roomId).emit('player-left', socket.id);
  });

  socket.on('rematch', (roomId: string) => {
    const room = rooms[roomId];
    if (!room) return;
    if (!room.players.includes(socket.id)) return;

    const started = canStartGame(room);

    for (let i = 0; i < room.gameState.players.length; i++) {
      const id = room.gameState.players[i]?.id ?? null;
      const next = { ...createInitialPlayerState(), id };
      if (id) next.gameStatus = started ? 'playing' : 'waiting';
      room.gameState.players[i] = next;
    }

    room.gameState.targetWord = getRandomTargetWord();

    if (room.mode === 'coop') {
      room.gameState.sharedCoopState = createInitialSharedCoopState();
      room.gameState.sharedCoopState.gameStatus = started ? 'playing' : 'waiting';
      room.gameState.activePlayerId = started ? room.players[0] ?? null : null;
    } else {
      room.gameState.sharedCoopState = undefined;
      room.gameState.activePlayerId = null;
    }

    io.to(roomId).emit('game-state-update', room.gameState);
  });

  socket.on('game-action', (data: { roomId: string; action: 'key-press' | 'delete' | 'enter'; key?: string }) => {
    const { roomId, action, key } = data;
    const room = rooms[roomId];
    if (!room) return;
    if (!canStartGame(room)) return;

    const playerState = getPlayerStateById(room, socket.id);
    if (!playerState) return;

    if (room.mode === 'coop') {
      const shared = room.gameState.sharedCoopState;
      if (!shared) return;

      // Co-op: joga por turnos.
      ensureActivePlayer(room);
      if (socket.id !== room.gameState.activePlayerId) return;
      if (shared.gameStatus !== 'playing') return;

      if (action === 'key-press' && key && shared.currentGuess.length < 5) {
        shared.currentGuess += key;
      } else if (action === 'delete') {
        shared.currentGuess = shared.currentGuess.slice(0, -1);
      } else if (action === 'enter' && shared.currentGuess.length === 5) {
        const guess = shared.currentGuess;
        const targetWord = room.gameState.targetWord;

        const canonicalGuess = findCanonicalWord(guess);
        if (!canonicalGuess) {
          socket.emit('invalid-word', { guess });
          return;
        }

        const guessLetters = canonicalGuess.split('');
        const targetLetters = targetWord.split('');
        const displayedGuessLetters = guessLetters.map((g, i) => {
          return normalizeLetter(g) === normalizeLetter(targetLetters[i] ?? '') ? (targetLetters[i] ?? g) : g;
        });
        const displayedGuess = displayedGuessLetters.join('');

        const newLetterStates = checkGuess(canonicalGuess, targetWord);
        const newKeyStates = getUpdatedKeyStates(canonicalGuess, targetWord, shared.keyStates);

        shared.guesses.push(displayedGuess);
        shared.letterStates.push(newLetterStates);
        shared.keyStates = newKeyStates;
        shared.currentRow++;
        shared.currentGuess = '';

        const isCorrect = normalizeWord(guess) === normalizeWord(room.gameState.targetWord);
        if (isCorrect) {
          shared.gameStatus = 'won';
        } else if (shared.currentRow >= 6) {
          shared.gameStatus = 'lost';
        }

        for (const p of room.gameState.players) {
          if (!p.id) continue;
          if (shared.gameStatus === 'won') p.gameStatus = 'won';
          else if (shared.gameStatus === 'lost') p.gameStatus = 'lost';
          else if (p.gameStatus === 'waiting') p.gameStatus = 'playing';
        }

        // Troca de vez apenas no modo Co-op e enquanto o jogo continua.
        if (!isCorrect && shared.gameStatus === 'playing') {
          const nextId = getNextPlayerId(room, socket.id);
          if (nextId) room.gameState.activePlayerId = nextId;
        }
      }

      io.to(roomId).emit('game-state-update', room.gameState);
      return;
    }

    // Dash
    if (isDashGameOver(room)) return;
    if (playerState.gameStatus !== 'playing') return;

    if (action === 'key-press' && key && playerState.currentGuess.length < 5) {
      playerState.currentGuess += key;
    } else if (action === 'delete') {
      playerState.currentGuess = playerState.currentGuess.slice(0, -1);
    } else if (action === 'enter' && playerState.currentGuess.length === 5) {
      const guess = playerState.currentGuess;
      const targetWord = room.gameState.targetWord;

      const canonicalGuess = findCanonicalWord(guess);
      if (!canonicalGuess) {
        socket.emit('invalid-word', { guess });
        return;
      }

      const guessLetters = canonicalGuess.split('');
      const targetLetters = targetWord.split('');
      const displayedGuessLetters = guessLetters.map((g, i) => {
        return normalizeLetter(g) === normalizeLetter(targetLetters[i] ?? '') ? (targetLetters[i] ?? g) : g;
      });
      const displayedGuess = displayedGuessLetters.join('');

      const newLetterStates = checkGuess(canonicalGuess, targetWord);
      const newKeyStates = getUpdatedKeyStates(canonicalGuess, targetWord, playerState.keyStates);

      playerState.guesses.push(displayedGuess);
      playerState.letterStates.push(newLetterStates);
      playerState.keyStates = newKeyStates;
      playerState.currentRow++;
      playerState.currentGuess = '';

      const isCorrect = normalizeWord(guess) === normalizeWord(room.gameState.targetWord);
      if (isCorrect) {
        playerState.gameStatus = 'won';

        // No Dash, o primeiro a acertar termina o jogo.
        for (const p of room.gameState.players) {
          if (!p.id) continue;
          if (p.id === socket.id) continue;
          if (p.gameStatus === 'playing') p.gameStatus = 'lost';
        }
      } else if (playerState.currentRow >= 6) {
        playerState.gameStatus = 'lost';
      }
    }

    io.to(roomId).emit('game-state-update', room.gameState);
  });

  socket.on('disconnect', () => {
    console.log('user disconnected:', socket.id);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.indexOf(socket.id);
      if (playerIndex === -1) continue;

      room.players.splice(playerIndex, 1);

      const slot = room.gameState.players.find((p) => p.id === socket.id);
      if (slot) {
        Object.assign(slot, createInitialPlayerState(), { id: null });
      }

      if (room.gameState.activePlayerId === socket.id) {
        ensureActivePlayer(room);
      }

      if (!canStartGame(room)) {
        for (const p of room.gameState.players) {
          if (p.id && p.gameStatus === 'playing') p.gameStatus = 'waiting';
        }
        if (room.gameState.sharedCoopState && room.gameState.sharedCoopState.gameStatus === 'playing') {
          room.gameState.sharedCoopState.gameStatus = 'waiting';
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
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
