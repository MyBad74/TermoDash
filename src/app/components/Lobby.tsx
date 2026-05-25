import React, { useState } from 'react';
import { Socket } from 'socket.io-client';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';

interface LobbyProps {
  socket: Socket;
}

export function Lobby({ socket }: LobbyProps) {
  const [joinRoomId, setJoinRoomId] = useState('');

  const handleCreateRoom = (mode: 'dash' | 'coop') => {
    socket.emit('create-room', { mode });
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
          <div className="grid grid-cols-2 gap-4">
            <Button onClick={() => handleCreateRoom('dash')}>Criar Sala Dash</Button>
            <Button onClick={() => handleCreateRoom('coop')}>Criar Sala Co-op</Button>
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
              type="text" 
              placeholder="ID da Sala" 
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
            />
            <Button onClick={handleJoinRoom}>Juntar-se</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
