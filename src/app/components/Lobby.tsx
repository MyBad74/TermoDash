import { useState } from 'react';
import { Socket } from 'socket.io-client';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

interface LobbyProps {
  socket: Socket;
  isConnected: boolean;
}

export function Lobby({ socket, isConnected }: LobbyProps) {
  const [joinRoomId, setJoinRoomId] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(2);

  const handleCreateRoom = (mode: 'dash' | 'coop') => {
    socket.emit('create-room', { mode, maxPlayers });
  };

  const handleJoinRoom = () => {
    if (joinRoomId) {
      socket.emit('join-room', joinRoomId);
    }
  };

  return (
    <div className="flex justify-center items-center h-full">
      <Card className="w-[380px]">
        <CardHeader>
          <CardTitle>Multiplayer</CardTitle>
          <CardDescription>Crie uma sala ou junte-se a uma existente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Nº de jogadores</div>
            <Input
              type="number"
              min={2}
              max={8}
              value={maxPlayers}
              onChange={(e) => {
                const n = Math.floor(Number(e.target.value));
                if (!Number.isFinite(n)) return;
                setMaxPlayers(Math.max(2, Math.min(8, n)));
              }}
              disabled={!isConnected}
            />
            <div className="text-xs text-muted-foreground">A sala só começa quando todos entrarem.</div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Button onClick={() => handleCreateRoom('dash')} disabled={!isConnected}>
              Criar Sala Dash
            </Button>
            <Button onClick={() => handleCreateRoom('coop')} disabled={!isConnected}>
              Criar Sala Co-op
            </Button>
          </div>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Ou junte-se a uma sala
              </span>
            </div>
          </div>
          <div className="flex w-full max-w-sm items-center space-x-2">
            <Input 
              id="room-id"
              name="room-id"
              type="text" 
              placeholder="ID da Sala" 
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
              disabled={!isConnected}
            />
            <Button onClick={handleJoinRoom} disabled={!isConnected}>Juntar-se</Button>
          </div>
          {!isConnected && (
            <div className="text-xs text-muted-foreground">
              Liga o servidor de jogo e configura o URL no Vercel.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
