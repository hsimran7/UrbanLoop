// MongoDB connection setup
import { MongoClient } from "mongodb";

const uri = "mongodb+srv://<username>:<password>@cluster.mongodb.net/urbanloop";
let client;
let clientPromise;

declare global {
	// eslint-disable-next-line no-var
	var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (!globalThis._mongoClientPromise) {
	client = new MongoClient(uri);
	globalThis._mongoClientPromise = client.connect();
}
clientPromise = globalThis._mongoClientPromise;

export default clientPromise;
