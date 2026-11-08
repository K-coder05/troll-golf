import { existsSync } from "node:fs";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME } from "@troll-golf/shared";
import express from "express";
import { GolfRoom } from "./room/GolfRoom";

export interface GameServerOptions {
  /** Built client files to serve over HTTP (production). Omit in dev, where Vite serves them. */
  clientDir?: string;
  greet?: boolean;
}

export function createGameServer(options: GameServerOptions = {}): Server {
  const server = new Server({
    transport: new WebSocketTransport(),
    greet: options.greet ?? false,
    express: (app) => {
      app.get("/health", (_req, res) => {
        res.json({ ok: true });
      });
      if (options.clientDir && existsSync(options.clientDir)) {
        app.use(express.static(options.clientDir));
      }
    },
  });
  server.define(ROOM_NAME, GolfRoom);
  return server;
}
