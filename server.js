import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import { Server } from "socket.io";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());

// __dirname 대체 (ESM 환경)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const uri =
  "mongodb+srv://admin:admin@cluster0.li29uru.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri);

let db;

async function startServer() {
  try {
    await client.connect();
    db = client.db("threat_intel");
    console.log("Connected to MongoDB");

    // Change Stream 세팅
    const collection = db.collection("telegram_data");
    const changeStream = collection.watch();

    changeStream.on("change", (change) => {
      io.emit("dataChanged", change);
    });

    // REST API
    app.get("/api/messages", async (req, res) => {
      try {
        const messages = await collection
          .find()
          .sort({ date: -1 })
          .toArray();
        res.json(messages);
      } catch (err) {
        console.error("DB error:", err);
        res.status(500).json({ error: "DB error" });
      }
    });

    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
    
    server.listen(4000, () => console.log("Server running on port 4000"));
  } catch (err) {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  }
}

startServer();
