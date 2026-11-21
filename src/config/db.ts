
import dotenv from "dotenv";
import { MongoClient, type Db } from "mongodb";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is missing");
}

const DB_NAME = "equiprent";

export const client = new MongoClient(MONGODB_URI, {
  maxPoolSize: 10,
  minPoolSize: 0,

  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 60000,

  retryWrites: true,
});

export const database: Db = client.db(DB_NAME);

let connectionPromise: Promise<Db> | null = null;

export const connectDB = async (): Promise<Db> => {
  if (!connectionPromise) {
    connectionPromise = (async () => {
      await client.connect();

      await database.command({ ping: 1 });

      console.log("MongoDB connected successfully!");

      return database;
    })().catch((error) => {
      connectionPromise = null;

      console.error("MongoDB connection failed:", error);

      throw error;
    });
  }

  return connectionPromise;
};
