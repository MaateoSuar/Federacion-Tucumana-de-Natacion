import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

@WebSocketGateway({
  cors: {
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      cb(null, true);
    },
    credentials: true,
  },
  namespace: '/results',
})
export class ResultsGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ResultsGateway.name);
  private pubClient!: Redis;
  private subClient!: Redis;

  constructor(private readonly config: ConfigService) {}

  afterInit(server: Server) {
    const url = this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    this.pubClient = new Redis(url, { lazyConnect: false });
    this.subClient = this.pubClient.duplicate();
    this.pubClient.on('error', (err) => this.logger.error('Redis pub error', err));
    this.subClient.on('error', (err) => this.logger.error('Redis sub error', err));
    if (typeof (server as unknown as Record<string, unknown>).adapter === 'function') {
      (server as unknown as { adapter: (a: ReturnType<typeof createAdapter>) => void })
        .adapter(createAdapter(this.pubClient, this.subClient));
      this.logger.log('ResultsGateway initialized with Redis adapter');
    } else {
      this.logger.warn('Redis adapter not applied (server.adapter not callable) — using in-memory adapter');
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join-event')
  handleJoin(
    @MessageBody() data: { tournamentId: string; eventId: string },
    @ConnectedSocket() client: Socket,
  ) {
    void client.join(`event:${data.eventId}`);
    void client.join(`tournament:${data.tournamentId}`);
    this.logger.debug(`${client.id} joined event:${data.eventId}`);
  }

  @SubscribeMessage('leave-event')
  handleLeave(
    @MessageBody() data: { eventId: string },
    @ConnectedSocket() client: Socket,
  ) {
    void client.leave(`event:${data.eventId}`);
  }

  notifyResultsUpdated(tournamentId: string, eventIds: string[]) {
    for (const eventId of eventIds) {
      this.server.to(`event:${eventId}`).emit('results:updated', { tournamentId, eventId });
    }
    this.server
      .to(`tournament:${tournamentId}`)
      .emit('tournament:updated', { tournamentId });
    this.logger.log(
      `Notified results:updated for tournament ${tournamentId} (${eventIds.length} events)`,
    );
  }
}
