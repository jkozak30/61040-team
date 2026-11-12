import { type Collection, type Db, MongoServerError } from "mongodb";

export class AddVideoUnavailable extends Error {}
export class VideoUnavailable extends Error {}
export class ControlUnavailable extends Error {}
export class InvalidSeek extends Error {}
export class StalePlayback extends Error {}
export class UnknownStream extends Error {}

export type Stream = string & { readonly __brand: "Stream" };
export type VideoEntry = string & { readonly __brand: "VideoEntry" };
type Playback = "PLAYING" | "PAUSED";
type Control = "PLAY" | "PAUSE" | "SEEK";

export type PlaybackCommand = { entry: VideoEntry; expectedRevision: number } & (
  | { operation: "PLAY" | "PAUSE" }
  | { operation: "SEEK"; target: { position: number } | { offset: -10 | 10 } | null }
);

const CONTROL_HISTORY_LIMIT = 128;

export interface Snapshot {
  activeEntry?: VideoEntry;
  endedAt?: Date;
  playback: Playback;
  position: number;
  positionAt: Date;
  revision: number;
}

interface Entry<Media> {
  entry: VideoEntry;
  source: Media;
}

interface ControlEvent<Viewer> {
  entry: VideoEntry;
  viewer: Viewer;
  operation: Control;
  position: number;
  offset: number;
  revision: number;
}

interface StreamDocument<Scope, Viewer, Media> extends Snapshot {
  _id: Stream;
  scope: Scope;
  version: number;
  entries: Entry<Media>[];
  controls: ControlEvent<Viewer>[];
}

export class StreamingConcept<
  Scope extends string = string,
  Viewer extends string = string,
  Media = string,
> {
  private readonly streams: Collection<StreamDocument<Scope, Viewer, Media>>;
  private scopeIndex: Promise<string> | undefined;

  constructor(
    database: Db,
    private readonly clock: () => Date = () => new Date(),
    private readonly prepareMedia: (source: Media) => Promise<Media> = async (source) => source,
  ) {
    this.streams = database.collection("streaming.streams");
  }

  async open({ scope }: { scope: Scope }) {
    this.scopeIndex ??= this.streams.createIndex({ scope: 1 }, { unique: true }).catch((error: unknown) => {
      this.scopeIndex = undefined;
      throw error;
    });
    await this.scopeIndex;

    const initial: StreamDocument<Scope, Viewer, Media> = {
      _id: crypto.randomUUID() as Stream,
      scope,
      version: 0,
      playback: "PAUSED",
      position: 0,
      positionAt: this.clock(),
      revision: 0,
      entries: [],
      controls: [],
    };
    try {
      const result = await this.streams.findOneAndUpdate(
        { scope }, { $setOnInsert: initial }, { upsert: true, returnDocument: "after" },
      );
      if (result) return { stream: result._id };
    } catch (error) {
      if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
      const winner = await this.streams.findOne({ scope }, { projection: { _id: 1 } });
      if (winner) return { stream: winner._id };
      throw error;
    }
    throw new Error("Could not open the watch.");
  }

  async addVideo({ stream, source }: { stream: Stream; source: Media }) {
    const existing = await this.streams.findOne({ _id: stream }, { projection: { _id: 1 } });
    if (!existing) throw new AddVideoUnavailable("This room cannot accept another video.");
    const prepared = await this.prepareMedia(source);
    return this.#change(stream, (watch) => {
      if (!watch) throw new AddVideoUnavailable("This room cannot accept another video.");
      const entry = crypto.randomUUID() as VideoEntry;
      watch.entries.push({ entry, source: prepared });
      watch.revision++;
      return { entry, revision: watch.revision };
    });
  }

  async start({ stream, entry }: { stream: Stream; entry: VideoEntry }) {
    return this.#change(stream, (watch, now) => {
      if (!watch || watch.endedAt || watch.activeEntry || !watch.entries.some((video) => video.entry === entry)) {
        throw new VideoUnavailable("This room cannot start another live watch.");
      }
      selectEntry(watch, entry, now);
      return { revision: watch.revision };
    });
  }

  async switchVideo({ stream, entry }: { stream: Stream; entry: VideoEntry }) {
    return this.#change(stream, (watch, now) => {
      if (!watch || watch.endedAt || !watch.activeEntry || !watch.entries.some((video) => video.entry === entry)) {
        throw new VideoUnavailable("This video cannot be selected for the live watch.");
      }
      if (watch.activeEntry !== entry) selectEntry(watch, entry, now);
      return { revision: watch.revision };
    });
  }

  async control({ stream, viewer, command }: { stream: Stream; viewer: Viewer; command: PlaybackCommand }) {
    const { entry, expectedRevision, operation } = command;
    const target = command.operation === "SEEK" ? command.target : null;
    return this.#change(stream, (watch, now) => {
      if (
        !watch || watch.endedAt || watch.activeEntry !== entry
      ) {
        throw new ControlUnavailable("This player cannot control the live watch.");
      }

      if (operation === "SEEK" && (target === null || (
        "position" in target ? !Number.isFinite(target.position) || target.position < 0
          : target.offset !== -10 && target.offset !== 10
      ))) {
        throw new InvalidSeek("Choose a valid playback position.");
      }
      if (
        (operation === "PLAY" && watch.playback === "PLAYING") ||
        (operation === "PAUSE" && watch.playback === "PAUSED")
      ) {
        return { revision: watch.revision, changed: false };
      }
      if (expectedRevision !== watch.revision) {
        throw new StalePlayback("Playback changed. Try again from the current position.");
      }

      const offset = target && "offset" in target ? target.offset : 0;
      if (target) {
        watch.position = "position" in target ? target.position : Math.max(0, positionAt(watch, now) + offset);
      } else {
        watch.position = positionAt(watch, now);
        watch.playback = operation === "PLAY" ? "PLAYING" : "PAUSED";
      }
      watch.positionAt = now;
      watch.revision++;
      watch.controls.push({
        entry, viewer, operation, position: watch.position,
        offset, revision: watch.revision,
      });
      if (watch.controls.length > CONTROL_HISTORY_LIMIT) watch.controls.shift();
      return { revision: watch.revision, changed: true };
    });
  }

  async end({ stream }: { stream: Stream }) {
    return this.#change(stream, (watch, now) => {
      if (!watch) throw new UnknownStream("This watch does not exist.");
      if (watch.endedAt) return { ended: false };
      if (!watch.activeEntry) throw new VideoUnavailable("There is no live watch to end.");
      this.#end(watch, now);
      return { ended: true };
    });
  }

  async _stream({ scope }: { scope: Scope }): Promise<{ stream: Stream; snapshot: Snapshot; entries: Entry<Media>[] }[]> {
    const watch = await this.streams.findOne({ scope }, {
      projection: { activeEntry: 1, endedAt: 1, playback: 1, position: 1, positionAt: 1, revision: 1, entries: 1 },
    });
    if (!watch) return [];
    const { _id, entries, ...snapshot } = watch;
    return [{ stream: _id, snapshot, entries }];
  }

  async _discussionEntry({ scope, entry }: { scope: Scope; entry: VideoEntry }): Promise<{
    live: boolean; source: Media;
  }[]> {
    const watch = await this.streams.findOne({ scope, "entries.entry": entry }, {
      projection: { activeEntry: 1, endedAt: 1, "entries.$": 1 },
    });
    if (!watch) return [];
    const live = !watch.endedAt && watch.activeEntry === entry;
    return [{ live, source: watch.entries[0]!.source }];
  }

  async _historyWatch({ scope }: { scope: Scope }): Promise<{
    watch: { status: "NOT_STARTED" | "LIVE" | "ENDED"; activeEntry?: VideoEntry; endedAt?: Date; entries: Entry<Media>[] };
  }> {
    const watch = await this.streams.findOne({ scope }, {
      projection: { activeEntry: 1, endedAt: 1, entries: 1 },
    });
    if (!watch) return { watch: { status: "NOT_STARTED", entries: [] } };
    return { watch: {
      status: watch.endedAt ? "ENDED" : watch.activeEntry ? "LIVE" : "NOT_STARTED",
      entries: watch.entries,
      ...(watch.endedAt ? { endedAt: watch.endedAt } : {}),
      ...(watch.activeEntry === undefined ? {} : { activeEntry: watch.activeEntry }),
    } };
  }

  async _controlsAfter({ stream, afterRevision, throughRevision }: {
    stream: Stream; afterRevision: number; throughRevision: number;
  }): Promise<{ viewer: Viewer; event: Omit<ControlEvent<Viewer>, "viewer"> }[]> {
    const watch = await this.streams.findOne({ _id: stream }, { projection: { controls: 1 } });
    return watch?.controls.filter(({ revision }) => revision > afterRevision && revision <= throughRevision)
      .map(({ viewer, ...event }) => ({
        viewer,
        event: { ...event, position: event.position ?? 0, offset: event.offset ?? 0 },
      })) ?? [];
  }

  #end(watch: StreamDocument<Scope, Viewer, Media>, now: Date) {
    watch.position = positionAt(watch, now);
    watch.positionAt = now;
    watch.playback = "PAUSED";
    watch.endedAt = now;
    watch.revision++;
  }

  // Commit playback and control notifications together, even across instances.
  async #change<Result>(
    stream: Stream,
    change: (watch: StreamDocument<Scope, Viewer, Media> | null, now: Date) => Result,
  ): Promise<Result> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const watch = await this.streams.findOne({ _id: stream });
      const result = change(watch, this.clock());
      if (!watch) return result;
      const version = watch.version++;
      const write = await this.streams.replaceOne({ _id: stream, version }, watch);
      if (write.matchedCount === 1) return result;
    }
    throw new Error("Watch changed repeatedly. Retry the request.");
  }
}

function selectEntry(watch: Snapshot, entry: VideoEntry, now: Date) {
  watch.activeEntry = entry;
  watch.playback = "PAUSED";
  watch.position = 0;
  watch.positionAt = now;
  watch.revision++;
}

function positionAt(watch: Snapshot, now: Date) {
  if (watch.playback === "PAUSED") return watch.position;
  return watch.position + Math.max(0, now.getTime() - watch.positionAt.getTime()) / 1000;
}
