import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from './ui/button';
import { GameModal } from './GameModal';
import { Socket } from 'socket.io-client';
import { PlayerBoard } from './PlayerBoard';
import { Keyboard } from './Keyboard';
import type { GameState } from '../App';
import { toast } from 'sonner';

interface GameRoomProps {
  socket: Socket;
  mode: 'dash' | 'coop' | null;
  gameState: GameState;
  onKeyPress: (key: string) => void;
  onDelete: () => void;
  onEnter: () => void;
  onLeaveToLobby: () => void;
}

export function GameRoom({ 
  socket, 
  mode,
  gameState,
  onKeyPress,
  onDelete,
  onEnter,
  onLeaveToLobby
}: GameRoomProps) {
  const { roomId } = useParams<{ roomId: string }>();

  useEffect(() => {
    if (!roomId) return;

    const join = () => socket.emit('join-room', roomId);
    if (socket.connected) join();
    else socket.once('connect', join);

    return () => {
      socket.off('connect', join);
    };
  }, [roomId, socket]);

  const myId = socket.id ?? null;

  const { players, activePlayerId, maxPlayers, sharedCoopState } = gameState;

  const joinedPlayers = useMemo(() => players.filter((p) => Boolean(p.id)), [players]);
  const joinedCount = joinedPlayers.length;
  const roomReady = maxPlayers > 0 && joinedCount >= maxPlayers;

  const isDash = mode === 'dash';
  const isCoop = mode === 'coop';

  const myPlayerState = useMemo(
    () => (myId ? players.find((p) => p.id === myId) ?? null : null),
    [myId, players]
  );

  const isParticipant = Boolean(myPlayerState);
  const effectiveKeyStates = isCoop ? sharedCoopState?.keyStates ?? {} : myPlayerState?.keyStates ?? {};

  const activePlayerNumber = useMemo(() => {
    if (!activePlayerId) return null;
    const idx = players.findIndex((p) => p.id === activePlayerId);
    return idx >= 0 ? idx + 1 : null;
  }, [players, activePlayerId]);

  const canPlay =
    isDash
      ? isParticipant && roomReady && (myPlayerState?.gameStatus ?? 'waiting') === 'playing'
      : isCoop
        ? isParticipant &&
          roomReady &&
          myId === activePlayerId &&
          (sharedCoopState?.gameStatus ?? 'waiting') === 'playing'
        : false;

  const winner = useMemo(() => {
    const idx = players.findIndex((p) => p.gameStatus === 'won');
    return idx >= 0 ? idx + 1 : undefined;
  }, [players]);

  const isGameOver = useMemo(() => {
    if (isCoop) {
      const s = sharedCoopState?.gameStatus;
      return s === 'won' || s === 'lost';
    }

    const someoneWon = Boolean(winner);
    const allLost = joinedPlayers.length > 0 && joinedPlayers.every((p) => p.gameStatus === 'lost');
    return someoneWon || allLost;
  }, [isCoop, sharedCoopState?.gameStatus, winner, joinedPlayers]);

  const winnerAttempts = useMemo(() => {
    if (!winner) return 0;
    return players[winner - 1]?.currentRow ?? 0;
  }, [winner, players]);

  const [endModalOpen, setEndModalOpen] = useState(false);
  const [endSnapshot, setEndSnapshot] = useState<{
    word: string;
    attempts: number;
    winner?: number;
    isWin: boolean;
  } | null>(null);

  useEffect(() => {
    if (isGameOver) {
      const attempts = isCoop
        ? sharedCoopState?.currentRow ?? 0
        : winner
          ? winnerAttempts
          : myPlayerState?.currentRow ?? 0;

      const isWin = isCoop
        ? (sharedCoopState?.gameStatus ?? 'waiting') === 'won' && isParticipant
        : (myPlayerState?.gameStatus ?? 'waiting') === 'won';

      setEndSnapshot({
        word: gameState.targetWord,
        attempts,
        winner: isCoop ? undefined : winner,
        isWin,
      });
      setEndModalOpen(true);
      return;
    }

    setEndModalOpen(false);
    setEndSnapshot(null);
  }, [
    isGameOver,
    gameState.targetWord,
    winner,
    winnerAttempts,
    myPlayerState?.currentRow,
    myPlayerState?.gameStatus,
    isCoop,
    sharedCoopState?.currentRow,
    sharedCoopState?.gameStatus,
    isParticipant,
  ]);

  const safeOnKeyPress = useCallback(
    (key: string) => {
      if (!canPlay) return;
      onKeyPress(key);
    },
    [canPlay, onKeyPress]
  );

  const safeOnDelete = useCallback(() => {
    if (!canPlay) return;
    onDelete();
  }, [canPlay, onDelete]);

  const safeOnEnter = useCallback(() => {
    if (!canPlay) return;
    onEnter();
  }, [canPlay, onEnter]);

  const handleCopyRoomLink = useCallback(async () => {
    if (!roomId) return;
    const url = `${window.location.origin}/room/${roomId}`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success('Link copiado!');
        return;
      }
    } catch {
      // fallback to prompt
    }

    window.prompt('Copia o link:', url);
  }, [roomId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;

      if (!canPlay) return;

      const key = e.key;
      if (key === 'Enter') {
        e.preventDefault();
        safeOnEnter();
        return;
      }

      if (key === 'Backspace' || key === 'Delete') {
        e.preventDefault();
        safeOnDelete();
        return;
      }

      if (key.length === 1) {
        const upper = key.toLocaleUpperCase('pt-PT');
        if (/^[A-ZÇ]$/.test(upper)) {
          safeOnKeyPress(upper);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canPlay, safeOnKeyPress, safeOnDelete, safeOnEnter]);

  const handleRematch = () => {
    if (!roomId) return;
    socket.emit('rematch', roomId);
    setEndModalOpen(false);
  };

  return (
    <div className="flex flex-col items-center px-4 pb-4 pt-2">
      <div className="w-full max-w-5xl flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Sala: {roomId}</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleCopyRoomLink}>Copiar link</Button>
          <Button variant="outline" onClick={onLeaveToLobby}>Sair para o Lobby</Button>
        </div>
      </div>
      <div className="text-xs text-muted-foreground mb-2">
        {mode ? `Modo: ${mode === 'dash' ? 'Dash' : 'Co-op'}` : 'A carregar modo...'}
        {!roomReady ? ` · A aguardar jogadores (${joinedCount}/${maxPlayers})...` : ''}
        {isCoop && roomReady && activePlayerId
          ? ` · Vez de: ${activePlayerNumber ? `Jogador ${activePlayerNumber}` : '...'} `
          : ''}
      </div>
      <div className={isCoop ? 'flex gap-6 mt-3 mb-5' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-3 mb-5'}>
        {isCoop ? (
          <PlayerBoard
            playerName="Co-op"
            playerNumber={1}
            guesses={sharedCoopState?.guesses ?? []}
            currentGuess={sharedCoopState?.currentGuess ?? ''}
            letterStates={sharedCoopState?.letterStates ?? []}
            currentRow={sharedCoopState?.currentRow ?? 0}
            isActive={roomReady}
            hasWon={(sharedCoopState?.gameStatus ?? 'waiting') === 'won'}
            hideLetters={false}
          />
        ) : (
          <>
            {players.map((p, idx) => {
              const playerNumber = idx + 1;
              const isMe = Boolean(myId && p.id === myId);

              return (
                <PlayerBoard
                  key={idx}
                  playerName={`Jogador ${playerNumber}`}
                  playerNumber={playerNumber}
                  guesses={p.guesses}
                  currentGuess={p.currentGuess}
                  letterStates={p.letterStates}
                  currentRow={p.currentRow}
                  isActive={Boolean(p.id && p.gameStatus === 'playing')}
                  hasWon={p.gameStatus === 'won'}
                  hideLetters={!isMe}
                />
              );
            })}
          </>
        )}
      </div>
      <Keyboard
        onKeyPress={safeOnKeyPress}
        onDelete={safeOnDelete}
        onEnter={safeOnEnter}
        keyStates={effectiveKeyStates}
      />

      <GameModal
        isOpen={endModalOpen}
        isWin={endSnapshot?.isWin ?? false}
        word={endSnapshot?.word ?? ''}
        attempts={endSnapshot?.attempts ?? 0}
        winner={endSnapshot?.winner}
        onClose={() => {}}
        onPlayAgain={handleRematch}
        onExitToLobby={onLeaveToLobby}
        onShare={() => {}}
        showShare={false}
        hideClose
      />
    </div>
  );
}
