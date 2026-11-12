import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGameServer } from "./app";

const port = Number(process.env.PORT ?? 2567);
// In production the bundle sits in server/dist and the client build in client/dist.
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = process.env.CLIENT_DIR ?? path.resolve(here, "../../client/dist");

const server = createGameServer({ clientDir });
await server.listen(port);
console.log(`Troll Golf server listening on http://localhost:${port}`);
