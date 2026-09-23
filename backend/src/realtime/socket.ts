import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import env from "../app/config/env.ts";
import { registerChatSocket } from "./chatSocket.ts";
import { registerRealtimeServer, userRoom } from "./realtimeService.ts";
import { authenticateSocket } from "./socketAuth.ts";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./types.ts";

export type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
export type RealtimeSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export function createRealtimeServer(httpServer: HttpServer): RealtimeServer {
  const io: RealtimeServer = new Server(httpServer, {
    cors: { origin: env.FRONTEND_ORIGINS, credentials: true },
    allowRequest: (request, callback) => {
      const origin = request.headers.origin;
      callback(null, !origin || env.FRONTEND_ORIGINS.includes(origin));
    },
    serveClient: true,
  });
  io.use((socket, next) => void authenticateSocket(socket, next));
  io.on("connection", (socket) => {
    void socket.join(userRoom(socket.data.userId));
    registerChatSocket(socket);
  });
  registerRealtimeServer(io);
  return io;
}
