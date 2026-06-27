'use client';

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface UseResultsSocketOptions {
  tournamentId: string;
  eventId: string;
  onResultsUpdated: () => void;
}

export function useResultsSocket({
  tournamentId,
  eventId,
  onResultsUpdated,
}: UseResultsSocketOptions) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(`${API_BASE}/results`, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join-event', { tournamentId, eventId });
    });

    socket.on('results:updated', (data: { tournamentId: string; eventId: string }) => {
      if (data.eventId === eventId) {
        onResultsUpdated();
      }
    });

    return () => {
      socket.emit('leave-event', { eventId });
      socket.disconnect();
    };
  }, [tournamentId, eventId, onResultsUpdated]);
}
