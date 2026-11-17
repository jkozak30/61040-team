import { type Collection, type Db } from "mongodb";

export class CurrentNotSignedIn extends Error {}
export class ReplaceNotSignedIn extends Error {}
export class EndNotSignedIn extends Error {}

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
> {
  private readonly sessions: Collection<SessionDocument<Subject>>;
  private indexes: Promise<string[]> | undefined;

  constructor(
    database: Db,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.sessions = database.collection("sessioning.sessions");
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
