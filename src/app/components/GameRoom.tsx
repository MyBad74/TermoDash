import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from './ui/button';
import { GameModal } from './GameModal';
import { Socket } from 'socket.io-client';
import { PlayerBoard } from './PlayerBoard';
import { Keyboard } from './Keyboard';
import type { GameState } from '../App';

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

  const { player1, player2, activePlayerId } = gameState;
  const bothPlayersJoined = Boolean(player1.id && player2.id);

  const isDash = mode === 'dash';
  const isCoop = mode === 'coop';

  const player1IsActive = isDash ? Boolean(player1.id) : Boolean(player1.id && player1.id === activePlayerId);
  const player2IsActive = isDash ? Boolean(player2.id) : Boolean(player2.id && player2.id === activePlayerId);

  const myPlayerKeyStates = myId === player1.id ? player1.keyStates : myId === player2.id ? player2.keyStates : {};
  const myPlayerState = myId === player1.id ? player1 : myId === player2.id ? player2 : null;

  const isParticipant = myId === player1.id || myId === player2.id;
  const canPlay =
    isDash
      ? isParticipant && (myPlayerState?.gameStatus ?? 'waiting') === 'playing'
      : isCoop
        ? isParticipant && myId === activePlayerId
        : false;

  const iAmPlayer1 = Boolean(myId && myId === player1.id);
  const iAmPlayer2 = Boolean(myId && myId === player2.id);

  const hidePlayer1Letters = !iAmPlayer1; // adversário/espectador
  const hidePlayer2Letters = !iAmPlayer2; // adversário/espectador

  const winner = useMemo(() => {
    if (player1.gameStatus === 'won') return 1;
    if (player2.gameStatus === 'won') return 2;
    return undefined;
  }, [player1.gameStatus, player2.gameStatus]);

  const isGameOver = useMemo(() => {
    const someoneWon = Boolean(winner);
    const bothLost = player1.gameStatus === 'lost' && player2.gameStatus === 'lost';
    return someoneWon || bothLost;
  }, [winner, player1.gameStatus, player2.gameStatus]);

  const winnerAttempts = useMemo(() => {
    if (winner === 1) return player1.currentRow;
    if (winner === 2) return player2.currentRow;
    return 0;
  }, [winner, player1.currentRow, player2.currentRow]);

  const [endModalOpen, setEndModalOpen] = useState(false);
  useEffect(() => {
    if (isGameOver) setEndModalOpen(true);
    else setEndModalOpen(false);
  }, [isGameOver]);

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
    <div className="flex flex-col items-center p-4">
      <div className="w-full max-w-5xl flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold mb-1">Sala: {roomId}</h2>
        <Button variant="outline" onClick={onLeaveToLobby}>Sair para o Lobby</Button>
      </div>
      <div className="text-sm text-muted-foreground mb-4">
        {mode ? `Modo: ${mode === 'dash' ? 'Dash' : 'Co-op'}` : 'A carregar modo...'}
        {!bothPlayersJoined ? ' · A aguardar outro jogador...' : ''}
        {isCoop && bothPlayersJoined && activePlayerId
          ? ` · Vez de: ${activePlayerId === player1.id ? 'Jogador 1' : activePlayerId === player2.id ? 'Jogador 2' : '...'} `
          : ''}
      </div>
      <div className="flex gap-8 mt-8">
        <PlayerBoard
          playerName="Jogador 1"
          playerNumber={1}
          guesses={player1.guesses}
          currentGuess={player1.currentGuess}
          letterStates={player1.letterStates}
          currentRow={player1.currentRow}
          isActive={player1IsActive}
          hasWon={player1.gameStatus === 'won'}
          hideLetters={hidePlayer1Letters}
        />
        <PlayerBoard
          playerName="Jogador 2"
          playerNumber={2}
          guesses={player2.guesses}
          currentGuess={player2.currentGuess}
          letterStates={player2.letterStates}
          currentRow={player2.currentRow}
          isActive={player2IsActive}
          hasWon={player2.gameStatus === 'won'}
          hideLetters={hidePlayer2Letters}
        />
      </div>
      <Keyboard
        onKeyPress={safeOnKeyPress}
        onDelete={safeOnDelete}
        onEnter={safeOnEnter}
        keyStates={myPlayerKeyStates}
      />

      <GameModal
        isOpen={endModalOpen}
        isWin={myPlayerState?.gameStatus === 'won'}
        word={gameState.targetWord}
        attempts={winner ? winnerAttempts : myPlayerState?.currentRow ?? 0}
        winner={winner}
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
