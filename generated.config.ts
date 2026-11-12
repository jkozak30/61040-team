import { httpWire } from "@mit-sdg/sync-engine-http/tooling";
import { assembleApplication } from "./src/assembly.ts";
import { policy } from "./src/http.ts";

export default {
  assemble: assembleApplication,
  title: "WatchParty",
  wireName: "WatchPartyWire",
  design: {
    version: 1,
    documents: [
      new URL("./design/types.md", import.meta.url),
      new URL("./design/compositions/Accounts.md", import.meta.url),
      new URL("./design/compositions/Rooms.md", import.meta.url),
      new URL("./design/compositions/Watch.md", import.meta.url),
      new URL("./design/compositions/Discussion.md", import.meta.url),
      new URL("./design/compositions/Summaries.md", import.meta.url),
    ],
  },
  projections: [httpWire({ policy, name: "WatchPartyWireHttp" })],
};
