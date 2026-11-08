/**
 * The admin client bundle. Built on its own (client/build-admin.mjs) and
 * served only to the authenticated Admin's session; the public client never
 * imports it. See docs/adr/0001-secret-admin-with-separate-bundle.md.
 */
import type { AdminBundle } from "../adminHost";
import { startConsole } from "./console";

export const mount: AdminBundle["mount"] = (host) => {
  startConsole(host);
};
