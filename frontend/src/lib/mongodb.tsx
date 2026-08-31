// MongoDB connection setup
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || "";
let client;
let clientPromise: Promise<MongoClient> | undefined;

declare global {
	// eslint-disable-next-line no-var
	var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (uri) {
	if (!globalThis._mongoClientPromise) {
		client = new MongoClient(uri);
		globalThis._mongoClientPromise = client.connect();
	}
	clientPromise = globalThis._mongoClientPromise;
}

export default clientPromise;
