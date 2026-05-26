import { useCallback, useEffect, useMemo, useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { toast, Toaster } from 'sonner';

import type { LetterState as GridLetterState } from './components/GameGrid';
import { Header } from './components/Header';
import { Lobby } from './components/Lobby';
import { GameRoom } from './components/GameRoom';
// import env

export type KeyStateValue = 'correct' | 'present' | 'absent' | 'unused';

export interface PlayerState {
  id: string | null;
  guesses: string[];
  currentGuess: string;
  currentRow: number;
  letterStates: GridLetterState[][];
  keyStates: Record<string, KeyStateValue>;
  gameStatus: 'playing' | 'won' | 'lost' | 'waiting';
}

export interface GameState {
  player1: PlayerState;
  player2: PlayerState;
  activePlayerId: string | null;
  targetWord: string;
}

const createEmptyPlayerState = (): PlayerState => ({
  id: null,
  guesses: [],
  currentGuess: '',
  currentRow: 0,
  letterStates: [],
  keyStates: {},
  gameStatus: 'waiting',
});

const createEmptyGameState = (): GameState => ({
  player1: createEmptyPlayerState(),
  player2: createEmptyPlayerState(),
  activePlayerId: null,
  targetWord: '',
});

type RoomMode = 'dash' | 'coop';
type GameAction = 'key-press' | 'delete' | 'enter';

export default function App() {
  const navigate = useNavigate();

  const [socket, setSocket] = useState<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [mode, setMode] = useState<RoomMode | null>(null);
  const [gameState, setGameState] = useState<GameState>(() => createEmptyGameState());

  useEffect(() => {
    let didCleanup = false;
    const socketUrl = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";
    const newSocket = io(socketUrl, {
      transports: ['polling'],
      upgrade: false,
    });

    setSocket(newSocket);

    const handleRoomJoin = ({ roomId: newRoomId, mode: newMode }: { roomId: string; mode: RoomMode }) => {
      setRoomId(newRoomId);
      setMode(newMode);
      navigate(`/room/${newRoomId}`);
    };

    newSocket.on('connect', () => setSocketConnected(true));
    newSocket.on('disconnect', () => setSocketConnected(false));
    newSocket.on('connect_error', () => {
      setSocketConnected(false);
      toast.error('Sem ligacao ao servidor de jogo.');
    });

    newSocket.on('room-created', handleRoomJoin);
    newSocket.on('joined-room', handleRoomJoin);
    newSocket.on('game-state-update', (newGameState: GameState) => setGameState(newGameState));

    newSocket.on('invalid-word', () => {
      toast.error('Palavra inválida (não está na lista).');
    });

    newSocket.on('room-not-found', () => {
      toast.error('Sala não encontrada!');
      navigate('/');
    });

    newSocket.on('room-full', () => {
      toast.error('A sala está cheia!');
      navigate('/');
    });

    newSocket.on('room-closed', () => {
      toast.error('O criador saiu. A sala foi encerrada.');
      setRoomId(null);
      setMode(null);
      setGameState(createEmptyGameState());
      navigate('/');
    });

    const handleDisconnect = () => {
      if (didCleanup) return;
      setRoomId(null);
      setMode(null);
      setGameState(createEmptyGameState());
      navigate('/');
    };

    newSocket.on('disconnect', handleDisconnect);

    return () => {
      didCleanup = true;
      newSocket.off('connect');
      newSocket.off('disconnect');
      newSocket.off('connect_error');
      newSocket.off('room-created', handleRoomJoin);
      newSocket.off('joined-room', handleRoomJoin);
      newSocket.off('game-state-update');
      newSocket.off('invalid-word');
      newSocket.off('room-closed');
      newSocket.off('disconnect', handleDisconnect);
      newSocket.disconnect();
    };
  }, [navigate]);

  const emitGameAction = useCallback(
    (action: GameAction, key?: string) => {
      if (!socket || !roomId) return;
      socket.emit('game-action', { roomId, action, key });
    },
    [socket, roomId]
  );

  const handlers = useMemo(
    () => ({
      onKeyPress: (key: string) => emitGameAction('key-press', key),
      onDelete: () => emitGameAction('delete'),
      onEnter: () => emitGameAction('enter'),
    }),
    [emitGameAction]
  );

  const leaveToLobby = useCallback(() => {
    if (socket && roomId) {
      socket.emit('leave-room', roomId);
    }
    setRoomId(null);
    setMode(null);
    setGameState(createEmptyGameState());
    navigate('/');
  }, [socket, roomId, navigate]);

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Header
        onHelp={() => toast('Ajuda: em breve')}
        onStats={() => toast('Estatísticas: em breve')}
        onSettings={() => toast('Definições: em breve')}
      />
      <main className="flex-1">
        <Routes>
          <Route
            path="/"
            element={socket ? <Lobby socket={socket} isConnected={socketConnected} /> : <div>A ligar ao servidor...</div>}
          />
          <Route
            path="/room/:roomId"
            element={
              socket ? (
                <GameRoom
                  socket={socket}
                  mode={mode}
                  gameState={gameState}
                  onKeyPress={handlers.onKeyPress}
                  onDelete={handlers.onDelete}
                  onEnter={handlers.onEnter}
                  onLeaveToLobby={leaveToLobby}
                />
              ) : (
                <div>A ligar ao servidor. . .</div>
              )
            }
          />
        </Routes>
      </main>
      <Toaster richColors />
    </div>
  );
}