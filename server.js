import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import { Server } from "socket.io";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch"; // npm install node-fetch
import 'dotenv/config'; 
const TELEGRAM_BOT_TOKEN =  process.env.TELEGRAM_BOT_TOKEN;

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

// --- 알림 발송 함수 ---
async function sendTelegram(chatId, text) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (e) {
    console.error("텔레그램 알림 실패:", e);
  }
}

async function sendDiscord(webhookUrl, content) {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch (e) {
    console.error("디스코드 알림 실패:", e);
  }
}

// --- 알림 구독자 등록/조회 API ---
app.post("/api/subscribe", async (req, res) => {
  const { platform, id } = req.body;
  if (!platform || !id) return res.status(400).json({ error: "platform, id 필수" });
  try {
    const collection = db.collection("subscribe_data");
    // 중복 방지: 같은 platform+id가 이미 있으면 무시
    const exist = await collection.findOne({ platform, id });
    if (!exist) await collection.insertOne({ platform, id, created_at: new Date() });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "DB 오류" });
  }
});
app.get("/api/subscribe", async (req, res) => {
  try {
    const list = await db.collection("subscribe_data").find().toArray();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: "DB 오류" });
  }
});

// --- Change Stream에서 알림 발송 ---
function getSiteCategory(siteName) {
  if (siteName === "SiteA_SingleDetailView") return "data leak";
  if (siteName === "SiteB_CardListView") return "abyss data";
  return "data leak";
}

async function notifyAllSubscribers(message) {
  const subs = await db.collection("subscribe_data").find().toArray();
  for (const sub of subs) {
    if (sub.platform === "telegram") {
      await sendTelegram(sub.id, message);
    } else if (sub.platform === "discord") {
      await sendDiscord(sub.id, message);
    }
  }
}

async function startServer() {
  try {
    await client.connect();
    db = client.db("threat_intel");
    console.log("Connected to MongoDB");

    // 텔레그램 Change Stream 세팅
    const telegramCollection = db.collection("telegram_data");
    const telegramChangeStream = telegramCollection.watch();

    telegramChangeStream.on("change", async (change) => {
      io.emit("dataChanged", change);
      if (change.operationType === "insert" && change.fullDocument) {
        const doc = change.fullDocument;
        const msg = `[텔레그램 위험정보]\n${doc.text || doc.title || "새 메시지"}\n채널: ${doc.channel || ""}`;
        console.log('Change Stream 이벤트', change)
        await notifyAllSubscribers(msg);
      }
    });

    // 다크웹 Change Stream 세팅 (여기서 db가 초기화된 이후에 선언!)
    const darkwebCollection = db.collection("darkweb_data");
    const darkwebChangeStream = darkwebCollection.watch();

    darkwebChangeStream.on("change", async (change) => {
      if (change.operationType === "insert" && change.fullDocument) {
        const doc = change.fullDocument;
        let msg = `[다크웹 데이터]\n`;
        if (doc.title) msg += `제목: ${doc.title}\n`;
        if (doc.detail_page_extracted_title) msg += `제목: ${doc.detail_page_extracted_title}\n`;
        if (doc.site_name) msg += `사이트: ${doc.site_name}\n`;
        if (doc.url_used) msg += `URL: ${doc.url_used}\n`;
        msg += `카테고리: ${getSiteCategory(doc.site_name)}\n`;
        console.log('Change Stream 이벤트', change)
        await notifyAllSubscribers(msg);
      }
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
              category: item.site_name || item.category || "data leak market",
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
