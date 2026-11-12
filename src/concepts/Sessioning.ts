import { type Collection, type Db, MongoServerError } from "mongodb";

export class CurrentNotSignedIn extends Error {}
export class ReplaceNotSignedIn extends Error {}
export class EndNotSignedIn extends Error {}

export class PresenceUnavailable extends Error {}
export class LeaveNotOwner extends Error {}

const GRACE_PERIOD_MS = 60_000;
type Status = "OPEN" | "DRAINED" | "CLOSED";
interface PresenceGroup<Scope, PresenceSubject, Connection> {
  _id: Scope;
  version: number;
  status: Status;
  connections: { viewer: PresenceSubject; connection: Connection; lastSeen: Date }[];
}

const DAY = 24 * 60 * 60 * 1000;
const IDLE = 7 * DAY;
const LIFETIME = 90 * DAY;
const notSignedIn = "Your session has ended. Sign in again.";

export type Session = string & { readonly __brand: "Session" };

interface SessionDocument<Subject> {
  token: Session;
  subject: Subject;
  lastUsed: Date;
  expiresAt: Date;
}

export class SessioningConcept<
  Subject extends string = string,
  Scope extends string = string,
  PresenceSubject extends string = string,
  Connection extends string = string,
> {
  private readonly groups: Collection<PresenceGroup<Scope, PresenceSubject, Connection>>;
  private readonly reusableGroups: Collection<PresenceGroup<Scope, PresenceSubject, Connection>>;
  private readonly sessions: Collection<SessionDocument<Subject>>;
  private indexes: Promise<string[]> | undefined;

  constructor(
    database: Db,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.sessions = database.collection("sessioning.sessions");
    this.groups = database.collection("sessioning.playerConnections");
    this.reusableGroups = database.collection("sessioning.reusableConnections");
  }

  #ready() {
    this.indexes ??= this.sessions.createIndexes([
      { key: { token: 1 }, unique: true },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ]).catch((error: unknown) => {
      this.indexes = undefined;
      throw error;
    });
    return this.indexes;
  }

  async start({ subject }: { subject: Subject }) {
    await this.#ready();
    const now = this.clock();
    const session = newToken();
    const expiresAt = new Date(now.getTime() + LIFETIME);
    await this.sessions.insertOne({ token: session, subject, lastUsed: now, expiresAt });
    return { session, expiresAt };
  }

  async current({ session }: { session: Session }) {
    const now = this.clock();
    const used = await this.sessions.findOneAndUpdate(active(session, now), {
      $max: { lastUsed: now },
    });
    if (!used) throw new CurrentNotSignedIn(notSignedIn);
    return { subject: used.subject };
  }

  async replace({ session, subject }: { session: Session; subject: Subject }) {
    const now = this.clock();
    const replacement = newToken();
    const expiresAt = new Date(now.getTime() + LIFETIME);

    // Keep the MongoDB document identity stable so rotation is one atomic write.
    const result = await this.sessions.updateOne(active(session, now), {
      $set: { token: replacement, subject, lastUsed: now, expiresAt },
    });
    if (result.matchedCount === 0) throw new ReplaceNotSignedIn(notSignedIn);
    return { replacement, expiresAt };
  }

  async _active({ session }: { session: Session }): Promise<{ subject: Subject; expiresAt: Date }[]> {
    const found = await this.sessions.findOne(active(session, this.clock()));
    return found ? [{ subject: found.subject, expiresAt: found.expiresAt }] : [];
  }

  async end({ session }: { session: Session }) {
    const ended = await this.sessions.deleteOne(active(session, this.clock()));
    if (ended.deletedCount === 0) throw new EndNotSignedIn(notSignedIn);
    return { session };
  }

  async keepPresent({ scope, subject, connection, reusable }: {
    scope: Scope; subject: PresenceSubject; connection: Connection; reusable?: boolean | null;
  }) {
    const groups = reusable ? this.reusableGroups : this.groups;
    try {
      await groups.updateOne({ _id: scope }, {
        $setOnInsert: { version: 0, status: "OPEN", connections: [] },
      }, { upsert: true });
    } catch (error) {
      if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
    }

    return this.#change(scope, (group, cutoff, now) => {
      if (reusable && group) group.connections = group.connections.filter((row) => row.lastSeen > cutoff);
      const player = group?.connections.find((row) => row.connection === connection);
      if (!group || group.status !== "OPEN" || (player && player.viewer !== subject) ||
        (group.connections.length > 0 && group.connections.every((row) => row.lastSeen <= cutoff))) {
        throw new PresenceUnavailable("This connection cannot join the presence group.");
      }
      if (!player) group.connections.push({ viewer: subject, connection, lastSeen: now });
      else if (player.lastSeen < now) player.lastSeen = now;
      return {};
    }, groups);
  }

  async leave({ scope, subject, connection, reusable }: {
    scope: Scope; subject: PresenceSubject; connection: Connection; reusable?: boolean | null;
  }) {
    const groups = reusable ? this.reusableGroups : this.groups;
    return this.#change(scope, (group, cutoff) => {
      const player = group?.connections.find((row) => row.connection === connection);
      if (player && player.viewer !== subject) {
        throw new LeaveNotOwner("This connection belongs to another subject.");
      }
      if (reusable) {
        if (group) group.connections = group.connections.filter((row) => row.connection !== connection && row.lastSeen > cutoff);
        return { drained: false };
      }
      return { drained: this.#prune(group, cutoff, connection) };
    }, groups);
  }

  async expirePresence({ scope }: { scope: Scope }) {
    return this.#change(scope, (group, cutoff) => ({
      drained: group?.status === "DRAINED" || this.#prune(group, cutoff),
    }));
  }

  async close({ scope }: { scope: Scope }) {
    const update = { $set: { status: "CLOSED" as const, connections: [] }, $inc: { version: 1 } };
    try {
      await this.groups.updateOne({ _id: scope }, update, { upsert: true });
    } catch (error) {
      if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
      await this.groups.updateOne({ _id: scope }, update);
    }
    return {};
  }

  async _presentSubjects({ scope, reusable }: { scope: Scope; reusable?: boolean | null }): Promise<{ subject: PresenceSubject }[]> {
    const groups = reusable ? this.reusableGroups : this.groups;
    const group = await groups.findOne({ _id: scope, status: "OPEN" });
    if (!group) return [];
    const cutoff = new Date(this.clock().getTime() - GRACE_PERIOD_MS);
    const subjects = new Set(group.connections.filter((row) => row.lastSeen > cutoff).map((row) => row.viewer));
    return [...subjects].map((subject) => ({ subject }));
  }

  async _connectionPresence({ scope, subject, connection }: { scope: Scope; subject: PresenceSubject; connection?: Connection | null }) {
    if (connection == null) return { present: false };
    const cutoff = new Date(this.clock().getTime() - GRACE_PERIOD_MS);
    const group = await this.groups.findOne({
      _id: scope,
      status: "OPEN",
      connections: { $elemMatch: { viewer: subject, connection, lastSeen: { $gt: cutoff } } },
    }, { projection: { _id: 1 } });
    return { present: group !== null };
  }

  async _due({}: Record<string, never>): Promise<{ scope: Scope }[]> {
    const cutoff = new Date(this.clock().getTime() - GRACE_PERIOD_MS);
    const rows = await this.groups.find({ $or: [
      { status: "DRAINED" },
      { status: "OPEN", "connections.lastSeen": { $lte: cutoff } },
    ] }, { projection: { _id: 1 } }).sort({ _id: 1 }).limit(100).toArray();
    return rows.map(({ _id }) => ({ scope: _id }));
  }

  #prune(group: PresenceGroup<Scope, PresenceSubject, Connection> | null, cutoff: Date, connection?: Connection) {
    if (!group || group.status !== "OPEN" || group.connections.length === 0) return false;
    group.connections = group.connections.filter((row) => row.connection !== connection && row.lastSeen > cutoff);
    if (group.connections.length > 0) return false;
    group.status = "DRAINED";
    return true;
  }

  async #change<Result>(
    scope: Scope,
    change: (group: PresenceGroup<Scope, PresenceSubject, Connection> | null, cutoff: Date, now: Date) => Result,
    groups = this.groups,
  ): Promise<Result> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const group = await groups.findOne({ _id: scope });
      const now = this.clock();
      const result = change(group, new Date(now.getTime() - GRACE_PERIOD_MS), now);
      if (!group) return result;
      const version = group.version++;
      if ((await groups.replaceOne({ _id: scope, version }, group)).matchedCount === 1) return result;
    }
    throw new Error("Presence changed repeatedly. Retry the request.");
  }
}

function newToken() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url") as Session;
}

function active(token: Session, now: Date) {
  return {
    token,
    lastUsed: { $gt: new Date(now.getTime() - IDLE) },
    expiresAt: { $gt: now },
  };
}
