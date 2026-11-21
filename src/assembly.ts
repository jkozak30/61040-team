import { assemble } from "@mit-sdg/sync-engine/assembly";
import type { Db } from "mongodb";
import { applicationConceptSet, Presence, RoomJoining, Sessioning, Watching, Discussing, Summarizing } from "./concepts.ts";
import { AuthenticatingConcept } from "./concepts/Authenticating.ts";
import { composition as Accounts } from "./compositions/Accounts.ts";
import { composition as Rooms } from "./compositions/Rooms.ts";
import { composition as Watch } from "./compositions/Watch.ts";
import { composition as Discussion } from "./compositions/Discussion.ts";
import { composition as Summary } from "./compositions/Summary.ts";
import { youtubeSource } from "./media-source.ts";
import { lookupYouTubeVideo } from "./youtube.ts";
import { openMongoClient } from "./db.ts";

export function assembleApplication(
  database: Db = openMongoClient("mongodb://127.0.0.1:27017/watchparty").db(),
  lookupVideo = lookupYouTubeVideo,
) {
  return assemble({
    conceptSet: applicationConceptSet,
    instances: {
      Authenticating: new AuthenticatingConcept(database),
      Sessioning: new Sessioning(database),
      Presence: new Presence(database),
      RoomJoining: new RoomJoining(database),
      Discussing: new Discussing(database),
      Summarizing: new Summarizing(database),
      Watching: new Watching(database, undefined, async (source) =>
        source.title ? source : youtubeSource(source.id, await lookupVideo(source.id))),
    },
    composition: { Accounts, Rooms, Watch, Discussion, Summary },
  });
}
