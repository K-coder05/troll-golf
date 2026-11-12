import { existsSync } from "node:fs";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME } from "@troll-golf/shared";
import express from "express";
import { ADMIN_BUNDLE_ROUTE, adminBundleSource, redeemAdminBundleToken } from "./admin/bundle";
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
      // The admin client bundle, only for a session holding a one-time token (see admin/bundle.ts).
      app.get(`${ADMIN_BUNDLE_ROUTE}/:file`, async (req, res) => {
        const token = /^([0-9a-f]{48})\.js$/.exec(req.params.file)?.[1];
        const source = token && redeemAdminBundleToken(token) ? await adminBundleSource() : null;
        if (!source) {
          res.status(404).end();
          return;
        }
        res.set({
          "Content-Type": "text/javascript; charset=utf-8",
          "Cache-Control": "no-store",
          // In dev the page comes from Vite on another port.
          "Access-Control-Allow-Origin": "*",
        });
        res.send(source);
      });
      if (options.clientDir && existsSync(options.clientDir)) {
        app.use(express.static(options.clientDir));
      }
    },
  });
  server.define(ROOM_NAME, GolfRoom);
  return server;
}
