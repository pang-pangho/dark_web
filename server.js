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
function isValidTitle(title) {
  return title && title !== "N/A" && title.trim() !== "";
}
const uri =
  "mongodb+srv://admin:admin@cluster0.li29uru.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri);

let db;
function getSiteCategory(siteName) {
  if (siteName === "SiteA_SingleDetailView") return "data leak";
  if (siteName === "SiteB_CardListView") return "abyss data";
  // 기본값
  return "data leak";
}


async function startServer() {
  try {
    await client.connect();
    db = client.db("threat_intel");
    console.log("Connected to MongoDB");

    // 텔레그램 Change Stream 세팅
    const telegramCollection = db.collection("telegram_data");
    const telegramChangeStream = telegramCollection.watch();

    telegramChangeStream.on("change", (change) => {
      io.emit("dataChanged", change);
    });

    // 텔레그램 메시지 API
    app.get("/api/messages", async (req, res) => {
      try {
        const messages = await telegramCollection
          .find()
          .sort({ date: -1 })
          .toArray();
        res.json(messages);
      } catch (err) {
        console.error("DB error:", err);
        res.status(500).json({ error: "DB error" });
      }
    });

    // 다크웹 데이터 API (정규화해서 내려주기)
    app.get("/api/darkweb", async (req, res) => {
      try {
        const darkwebCollection = db.collection("darkweb_data");
        const items = await darkwebCollection.find().sort({ retrieved_at: -1 }).toArray();

        // 정규화
        const normalized = [];
        for (const item of items) {
          // 1. extracted_data 배열이 있으면 배열의 각 항목을 카드로
          if (Array.isArray(item.extracted_data)) {
            for (const [idx, ex] of item.extracted_data.entries()) {
              normalized.push({
                _id: item._id?.toString
                  ? item._id.toString() + "-ex-" + idx
                  : (item._id || "") + "-ex-" + idx,
                title: ex.title || ex.title_on_list || "-",
                description: ex.content || ex.summary_on_list || "-",
                date: item.retrieved_at || "",
                url: item.url_used,
                site: item.site_name,
                category: getSiteCategory(item.site_name),

                verified: item.verified,
                count: item.count
              });
            }
          }
          // 2. detail_page_extracted_title/content가 있으면 그것도 카드로
          if (item.detail_page_extracted_title &&
            isValidTitle(item.detail_page_extracted_title)) {
            normalized.push({
              _id: item._id?.toString
                ? item._id.toString() + "-detail"
                : (item._id || "") + "-detail",
              title: item.detail_page_extracted_title,
              description: item.detail_page_extracted_content || "-",
              date: item.retrieved_at || "",
              url: item.detail_page_url,
              site: item.site_name,
              category: item.site_name || item.category || "data leak",
              verified: item.verified,
              count: item.count
            });
          }
          // 3. title/content가 있으면 그대로
          if (item.title) {
            normalized.push({
              _id: item._id?.toString
                ? item._id.toString()
                : item._id || "-",
              title: item.title,
              description: item.content || "-",
              date: item.retrieved_at || "",
              url: item.url_used,
              site: item.site_name,
              category: item.site_name || item.category,
              verified: item.verified,
              count: item.count
            });
          }
          // 4. title_on_list/summary_on_list (배열 아닌 경우)
          if (item.title_on_list) {
            normalized.push({
              _id: item._id?.toString
                ? item._id.toString() + "-list"
                : (item._id || "") + "-list",
              title: item.title_on_list,
              description: item.summary_on_list || "-",
              date: item.retrieved_at || "",
              url: item.url_used,
              site: item.site_name,
              category: item.site_name || item.category,
              verified: item.verified,
              count: item.count
            });
          }
        }
        res.json(normalized);
      } catch (err) {
        console.error("DB error:", err);
        res.status(500).json({ error: "DB error" });
      }
    });

    // 번역 API 프록시
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

    // 정적 파일 서비스 (React 빌드 결과)
    app.use(express.static(path.join(__dirname, "dist")));

    // SPA 라우팅 지원 (API 이외 모든 경로는 React index.html 반환)
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });

    const PORT = process.env.PORT || 4000;
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  }
}

startServer();
