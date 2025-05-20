import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";

const app = express();
app.use(cors());

const uri =
  "mongodb+srv://admin:admin@cluster0.li29uru.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri);

let db;

async function connectDB() {
  await client.connect();
  db = client.db("threat_intel");
  console.log("Connected to MongoDB");
}

app.get("/api/messages", async (req, res) => {
  try {
    const messages = await db
      .collection("telegram_data")
      .find()
      .sort({ date: -1 })
      .toArray();
    res.json(messages);
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ error: "DB error" });
  }
});

connectDB().then(() => {
  app.listen(4000, () => console.log("Server running on port 4000"));
});
