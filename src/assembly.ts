import { assemble } from "@mit-sdg/sync-engine/assembly";
import type { Db } from "mongodb";
import { applicationConceptSet, Discussing, RoomJoining, Sessioning, Streaming, Summarizing } from "./concepts.ts";
import { AuthenticatingConcept } from "./concepts/Authenticating.ts";
import { composition as Accounts } from "./compositions/Accounts.ts";
import { composition as Rooms } from "./compositions/Rooms.ts";
import { composition as Discussion } from "./compositions/Discussion.ts";
import { composition as Summaries } from "./compositions/Summaries.ts";
import { lectureSummarizer } from "./lecture-summary.ts";
import { createGeminiSummarizer } from "./gemini.ts";
import { composition as Watch } from "./compositions/Watch.ts";
import { youtubeSource } from "./media-source.ts";
import { lookupYouTubeVideo } from "./youtube.ts";
import { openMongoClient } from "./db.ts";

export function assembleApplication(
  database: Db = openMongoClient("mongodb://127.0.0.1:27017/watchparty").db(),
  lookupVideo = lookupYouTubeVideo,
  generateSummary = createGeminiSummarizer(process.env.GEMINI_API_KEY),
) {
  return assemble({
    conceptSet: applicationConceptSet,
    instances: {
      Authenticating: new AuthenticatingConcept(database),
      Sessioning: new Sessioning(database),
      RoomJoining: new RoomJoining(database),
      Discussing: new Discussing(database, undefined, {
        anchor: (row) => {
          if (typeof row.position !== "number") throw new Error("Stored thread is missing its position.");
          return row.position;
        },
        context: (row) => row.live === true ? "LIVE" : "HISTORICAL",
      }),
      Summarizing: new Summarizing(database, lectureSummarizer(database, generateSummary)),
      Streaming: new Streaming(database, undefined, async (source) =>
        source.title ? source : youtubeSource(source.id, await lookupVideo(source.id))),
    },
    composition: { Accounts, Rooms, Watch, Discussion, Summaries },
  });
}
