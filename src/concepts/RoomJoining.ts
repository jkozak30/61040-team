import { type Collection, type Db, type Filter, MongoServerError } from "mongodb";

export class InvalidOwnerName extends Error {}
export class InvalidRoomCode extends Error {}
export class InvalidJoinName extends Error {}
export class VisitNotClaimable extends Error {}
export class NoSavedVisit extends Error {}

export type Room = string & { readonly __brand: "Room" };
export type Participant = string & { readonly __brand: "Participant" };
export class OwnershipTransferUnavailable extends Error {}

// Optional legacy fields are read for rooms created before identities were unified.
type Member<Identity> = {
  id: Participant;
  name: string;
  identity?: Identity;
  account?: Identity;
  visitor?: Identity;
  lastActivityAt?: Date;
  lastJoinedAt?: Date;
  aliases?: Participant[];
};
type Visit<Identity> = { identity?: Identity; account?: Identity; lastActivityAt: Date };

interface RoomDocument<Identity> {
  _id: Room;
  code: string;
  owner?: Identity;
  host?: Identity;
  revision: number;
  participants: Member<Identity>[];
  visits?: Visit<Identity>[];
}

export class RoomJoiningConcept<Identity extends string> {
  private readonly rooms: Collection<RoomDocument<Identity>>;
  private codeIndex: Promise<string> | undefined;

  constructor(database: Db, private readonly clock: () => Date = () => new Date()) {
    this.rooms = database.collection("roomjoining.rooms");
  }

  async create({ identity, name }: { identity: Identity; name: string }) {
    name = name.trim();
    if (!validName(name)) throw new InvalidOwnerName("Enter a display name of 1 to 32 characters.");

    this.codeIndex ??= this.rooms.createIndex({ code: 1 }, { unique: true }).catch((error: unknown) => {
      this.codeIndex = undefined;
      throw error;
    });
    await this.codeIndex;

    const room = crypto.randomUUID() as Room;
    const participant = crypto.randomUUID() as Participant;
    const lastActivityAt = this.clock();
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = makeCode();
      try {
        await this.rooms.insertOne({
          _id: room, code, owner: identity, revision: 0,
          participants: [{ id: participant, name, identity, lastActivityAt, lastJoinedAt: lastActivityAt }],
        });
        return { room, participant, code };
      } catch (error) {
        if (!(error instanceof MongoServerError && error.code === 11000 && error.keyPattern?.code === 1)) {
          throw error;
        }
      }
    }
    throw new Error("Could not allocate a unique room code.");
  }

  async join({ code, name, identity, saveVisit }: {
    code: string; name?: string | null; identity: Identity; saveVisit: boolean;
  }) {
    name = name?.trim();
    return this.#change({ code: code.trim().toUpperCase() }, (room) => {
      if (!room) throw new InvalidRoomCode("This room code is invalid.");
      let member = room.participants.find((candidate) => memberIdentity(candidate) === identity);
      if (!member) {
        if (!name || !validName(name)) throw new InvalidJoinName("Enter a display name of 1 to 32 characters.");
        member = { id: crypto.randomUUID() as Participant, name, identity };
        room.participants.push(member);
      }
      if (saveVisit) this.#recordJoin(member);
      return { room: room._id, participant: member.id };
    });
  }

  async claimVisit({ participant, previousIdentity, identity }: {
    participant: Participant; previousIdentity: Identity; identity: Identity;
  }) {
    return this.#change(participantFilter(participant), (room) => {
      const member = room?.participants.find((candidate) => hasParticipant(candidate, participant));
      const current = memberIdentity(member);
      if (!room || !member || (current !== identity &&
          (current !== previousIdentity || member.lastActivityAt !== undefined))) {
        throw new VisitNotClaimable("This visit cannot be claimed by that identity.");
      }
      const existing = room.participants.find((candidate) => memberIdentity(candidate) === identity);
      const claimed = existing ?? member;
      claimed.identity = identity;
      this.#recordJoin(claimed);
      return { room: room._id, claimedParticipant: claimed.id };
    });
  }

  async reopen({ room, identity }: { room: Room; identity: Identity }) {
    return this.#change({ _id: room }, (document) => {
      const member = document?.participants.find((participant) => memberIdentity(participant) === identity);
      if (!document || !member?.lastActivityAt) {
        throw new NoSavedVisit("This room is not saved for this identity.");
      }
      this.#recordJoin(member);
      return { participant: member.id, code: document.code };
    });
  }

  async recordActivity({ room, identity }: { room: Room; identity: Identity }) {
    return this.#change({ _id: room }, (document) => {
      const member = document?.participants.find((participant) => memberIdentity(participant) === identity);
      if (!document || !member?.lastActivityAt) {
        throw new NoSavedVisit("This room is not saved for this identity.");
      }
      this.#recordActivity(member);
      return { participant: member.id };
    });
  }

  async transferOwnership({ room, actor, successor }: { room: Room; actor: Participant; successor: Participant }) {
    return this.#change({ _id: room }, (document) => {
      const current = memberIdentity(document?.participants.find((member) => hasParticipant(member, actor)));
      const next = memberIdentity(document?.participants.find((member) => hasParticipant(member, successor)));
      if (!document || current === undefined || current !== (document.owner ?? document.host) || next === undefined) {
        throw new OwnershipTransferUnavailable("Only the owner can transfer to a room member.");
      }
      document.owner = next;
      delete document.host;
      return {};
    });
  }

  async _ownershipCandidates({ room }: { room: Room }): Promise<{ participant: Participant; name: string; identity: Identity }[]> {
    const document = await this.rooms.findOne({ _id: room });
    if (!document) return [];
    normalizeMembers(document);
    const owner = document.owner ?? document.host;
    return document.participants.flatMap((member) => {
      const identity = memberIdentity(member);
      if (identity === undefined || identity === owner) return [];
      return [{ participant: member.id, name: member.name, identity }];
    });
  }

  async _savedVisit({ room, identity }: { room: Room; identity: Identity }): Promise<{ lastActivityAt: Date }[]> {
    const document = await this.rooms.findOne({ _id: room });
    if (!document) return [];
    normalizeMembers(document);
    const lastActivityAt = document.participants.find((member) => member.identity === identity)?.lastActivityAt;
    return lastActivityAt ? [{ lastActivityAt }] : [];
  }

  async _participant({ participant }: { participant: Participant }): Promise<{
    room: Room; name: string; identity: Identity; owner: boolean; canonical: Participant;
  }[]> {
    const document = await this.rooms.findOne(participantFilter(participant));
    if (!document) return [];
    normalizeMembers(document);
    const member = document.participants.find((candidate) => hasParticipant(candidate, participant));
    if (member?.identity === undefined) return [];
    const { identity, name } = member;
    return [{ room: document._id, name, identity, owner: identity === (document.owner ?? document.host), canonical: member.id }];
  }

  async _history({ identity }: { identity: Identity }): Promise<{ room: Room; participant: Participant; lastActivityAt: Date; lastJoinedAt: Date | null; owner: boolean }[]> {
    const documents = await this.rooms.find({ $or: [
      { "participants.identity": identity }, { "participants.account": identity },
      { "participants.visitor": identity }, { "visits.identity": identity }, { "visits.account": identity },
    ] }).toArray();
    return documents.flatMap((document) => {
      normalizeMembers(document);
      const member = document.participants.find((member) => member.identity === identity);
      if (!member?.lastActivityAt) return [];
      return [{
        room: document._id,
        participant: member.id,
        lastActivityAt: member.lastActivityAt,
        lastJoinedAt: member.lastJoinedAt ?? null,
        owner: identity === (document.owner ?? document.host),
      }];
    }).sort((left, right) => right.lastActivityAt.getTime() - left.lastActivityAt.getTime()
      || left.room.localeCompare(right.room));
  }

  // Membership and saved-room activity change together in one room document.
  async #change<Result>(
    filter: Filter<RoomDocument<Identity>>,
    change: (room: RoomDocument<Identity> | null) => Result,
  ): Promise<Result> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const room = await this.rooms.findOne(filter);
      if (room) normalizeMembers(room);
      const result = change(room);
      if (!room) return result;
      const revision = room.revision++;
      const write = await this.rooms.replaceOne({ _id: room._id, revision }, room);
      if (write.matchedCount === 1) return result;
    }
    throw new Error("Room changed repeatedly. Retry the request.");
  }

  #recordJoin(member: Member<Identity>) {
    const now = this.clock();
    if (!member.lastJoinedAt || member.lastJoinedAt < now) member.lastJoinedAt = now;
    this.#recordActivity(member, now);
  }

  #recordActivity(member: Member<Identity>, now = this.clock()) {
    if (!member.lastActivityAt || member.lastActivityAt < now) member.lastActivityAt = now;
  }
}

function memberIdentity<Identity>(member: Member<Identity> | undefined) {
  return member?.identity ?? member?.account ?? member?.visitor;
}

function participantFilter(participant: Participant) {
  return { $or: [{ "participants.id": participant }, { "participants.aliases": participant }] };
}

function hasParticipant<Identity>(member: Member<Identity>, participant: Participant) {
  return member.id === participant || member.aliases?.includes(participant);
}

// Fold saved visits into membership. Keep old participant IDs resolvable for existing references.
function normalizeMembers<Identity>(room: RoomDocument<Identity>) {
  const members = new Map<Identity, Member<Identity>>();
  const participants: Member<Identity>[] = [];
  for (const member of room.participants) {
    const identity = memberIdentity(member);
    if (identity === undefined) {
      participants.push(member);
      continue;
    }
    const existing = members.get(identity);
    if (existing) {
      existing.aliases = [...new Set([...(existing.aliases ?? []), member.id, ...(member.aliases ?? [])])];
      if (member.lastActivityAt && (!existing.lastActivityAt || existing.lastActivityAt < member.lastActivityAt)) {
        existing.lastActivityAt = member.lastActivityAt;
      }
      if (member.lastJoinedAt && (!existing.lastJoinedAt || existing.lastJoinedAt < member.lastJoinedAt)) {
        existing.lastJoinedAt = member.lastJoinedAt;
      }
      continue;
    }
    member.identity = identity;
    delete member.account;
    delete member.visitor;
    members.set(identity, member);
    participants.push(member);
  }
  for (const visit of room.visits ?? []) {
    const identity = visit.identity ?? visit.account;
    const member = identity === undefined ? undefined : members.get(identity);
    if (member && (!member.lastActivityAt || member.lastActivityAt < visit.lastActivityAt)) {
      member.lastActivityAt = visit.lastActivityAt;
    }
  }
  room.participants = participants;
  delete room.visits;
}

function validName(name: string) {
  return name.length >= 1 && name.length <= 32;
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]!).join("");
}
