
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is missing");
}

export const client = new MongoClient(MONGODB_URI);

export const database = client.db("equiprent");

let connectionPromise: Promise<MongoClient> | null = null;

export const connectDB = async () => {
  try {
    if (!connectionPromise) {
      connectionPromise = client.connect().catch((error) => {
        connectionPromise = null;
        throw error;
      });
    }

    await connectionPromise;
    await database.command({ ping: 1 });

    console.log("MongoDB connected successfully!");

    return database;
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    throw error;
  }
};
