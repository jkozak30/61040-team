import { password as passwordHash } from "bun";
import { type Collection, type Db, MongoServerError } from "mongodb";

export class InvalidUsername extends Error {}
export class InvalidPassword extends Error {}
export class UsernameTaken extends Error {}
export class InvalidCredentials extends Error {}

export type Account = string & { readonly __brand: "Account" };

interface AccountDocument {
  _id: Account;
  username: string;
  verifier: string;
}

const invalidCredentials = "The username or password is incorrect.";
const invalidUsername = /[^A-Za-z0-9_-]/;

// Unknown accounts still go through a password verification.
let dummyVerifier: Promise<string> | undefined;

export class AuthenticatingConcept {
  private readonly accounts: Collection<AccountDocument>;
  private usernameIndex: Promise<string> | undefined;

  constructor(database: Db) {
    this.accounts = database.collection("authenticating.accounts");
  }

  #ready() {
    this.usernameIndex ??= this.accounts
      .createIndex({ username: 1 }, { unique: true })
      .catch((error: unknown) => {
        this.usernameIndex = undefined;
        throw error;
      });
    return this.usernameIndex;
  }

  async register({ username, password }: { username: string; password: string }) {
    if (!validUsername(username)) {
      throw new InvalidUsername("A username must have 3 to 32 letters, digits, underscores, or hyphens.");
    }
    if (!validPassword(password)) {
      throw new InvalidPassword("A password must have 10 to 128 characters.");
    }

    const account = crypto.randomUUID() as Account;
    const verifier = await passwordHash.hash(password, "argon2id");
    await this.#ready();
    try {
      await this.accounts.insertOne({ _id: account, username: username.toLowerCase(), verifier });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new UsernameTaken("That username is taken.");
      }
      throw error;
    }
    return { account };
  }

  async authenticate({ username, password }: { username: string; password: string }) {
    if (!validPassword(password)) throw new InvalidCredentials(invalidCredentials);

    const found = validUsername(username)
      ? await this.accounts.findOne({ username: username.toLowerCase() })
      : null;
    const verifier = found?.verifier
      ?? await (dummyVerifier ??= passwordHash.hash(crypto.randomUUID(), "argon2id"));
    const matches = await passwordHash.verify(password, verifier);
    if (!found || !matches) throw new InvalidCredentials(invalidCredentials);

    return { account: found._id };
  }

  async _username({ account }: { account: Account }): Promise<{ username: string }[]> {
    const found = await this.accounts.findOne({ _id: account }, { projection: { username: 1 } });
    return found ? [{ username: found.username }] : [];
  }
}

function validUsername(username: string) {
  return username.length >= 3 && username.length <= 32 && !invalidUsername.test(username);
}

function validPassword(password: string) {
  if (password.length < 10 || password.length > 256) return false;
  const length = Array.from(password).length;
  return length >= 10 && length <= 128;
}
