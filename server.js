import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import { Server } from "socket.io";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch"; // npm install node-fetch






const app = express();
app.use(cors());
app.use(express.json());
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

    // === React 정적 파일 서비스 추가 ===
    app.use(express.static(path.join(__dirname, "dist"))); // dist → 빌드 폴더명에 맞게 수정

    // SPA 라우팅 지원 (API 이외 모든 경로는 React index.html 반환)
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
    console.log("정적 파일 경로:", path.join(__dirname, "dist"));

    server.listen(4000, () => console.log("Server running on port 4000"));
  } catch (err) {
    console.log("정적 파일 경로:", path.join(__dirname, "dist"));

    console.error("MongoDB connection failed:", err);
    process.exit(1);
  }
  
}
app.post("/api/translate", async (req, res) => {
  const { text, target = "ko" } = req.body;
  try {
    const response = await fetch("https://libretranslate.de/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        source: "auto",
        target,
        format: "text"
      }),
    });
    const data = await response.json();
    if (data.error) {
      console.error("LibreTranslate error:", data.error);
      return res.status(500).json({ error: "번역 실패" });
    }
    res.json({ translatedText: data.translatedText });
  } catch (e) {
    console.error("번역 서버 오류:", e);
    res.status(500).json({ error: "번역 실패" });
  }
});

startServer();
