import { MongoClient } from "mongodb";

export function openMongoClient(url: string) {
  return new MongoClient(url, { serverSelectionTimeoutMS: 2000 });
}
