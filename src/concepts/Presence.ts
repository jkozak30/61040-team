import { type Collection, type Db, MongoServerError } from "mongodb";

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

// Keep the existing collections so active tabs survive a deployment.
export class PresenceConcept<
  Scope extends string = string,
  PresenceSubject extends string = string,
  Connection extends string = string,
> {
  private readonly groups: Collection<PresenceGroup<Scope, PresenceSubject, Connection>>;
  private readonly reusableGroups: Collection<PresenceGroup<Scope, PresenceSubject, Connection>>;

  constructor(
    database: Db,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.groups = database.collection("sessioning.playerConnections");
    this.reusableGroups = database.collection("sessioning.reusableConnections");
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
