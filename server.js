import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import { Server } from "socket.io";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import 'dotenv/config'; 
import translateRouter from './server/translate.js'; // 번역 라우터 추가
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
app.use('/api', translateRouter); // 번역 라우터 등록
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
// 실제 최근 7일간 일별 통계 API 추가
// /api/daily-stats 엔드포인트 수정
app.get("/api/daily-stats", async (req, res) => {
  try {
    const now = new Date();
    const dailyStats = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setUTCHours(0, 0, 0, 0);
      
      const nextDay = new Date(date);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      
      // 해당 날짜의 다크웹 데이터 개수
      const darkwebCount = await db.collection("darkweb_data").countDocuments({
        retrieved_at: { $gte: date, $lt: nextDay }
      });
      
      // 해당 날짜의 텔레그램 데이터 개수
      const telegramCountArr = await db.collection("telegram_data").aggregate([
        {
          $addFields: {
            dateAsDate: {
              $switch: {
                branches: [
                  {
                    case: { $eq: [{ $type: "$date" }, "date"] },
                    then: "$date"
                  },
                  {
                    case: { $eq: [{ $type: "$date" }, "string"] },
                    then: {
                      $dateFromString: {
                        dateString: "$date",
                        onError: null,
                        onNull: null
                      }
                    }
                  }
                ],
                default: null
              }
            }
          }
        },
        {
          $match: {
            dateAsDate: { $gte: date, $lt: nextDay }
          }
        },
        { $count: "count" }
      ]).toArray();
      
      const telegramCount = telegramCountArr.length > 0 ? telegramCountArr[0].count : 0;
      
      // 전체 위협은 누적 계산 (이전 날짜들의 합계)
      const totalThreatsToDate = await calculateTotalThreatsToDate(date);
      
      dailyStats.push({
        date: date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" }),
        fullDate: date.toISOString().split('T')[0],
        totalThreats: totalThreatsToDate, // 누적 전체 위협
        todayThreats: telegramCount + darkwebCount, // 당일 새로 감지된 위협
        darkwebCount: darkwebCount,
        telegramCount: telegramCount,
        dayOfWeek: date.toLocaleDateString("ko-KR", { weekday: "short" })
      });
    }
    
    res.json(dailyStats);
  } catch (error) {
    console.error('일별 통계 조회 오류:', error);
    res.status(500).json({ error: '통계 데이터를 가져올 수 없습니다.' });
  }
});

// 특정 날짜까지의 누적 위협 계산 함수
async function calculateTotalThreatsToDate(targetDate) {
  try {
    // 해당 날짜까지의 모든 다크웹 데이터
    const totalDarkweb = await db.collection("darkweb_data").countDocuments({
      retrieved_at: { $lte: targetDate }
    });
    
    // 해당 날짜까지의 모든 텔레그램 데이터
    const totalTelegramArr = await db.collection("telegram_data").aggregate([
      {
        $addFields: {
          dateAsDate: {
            $switch: {
              branches: [
                {
                  case: { $eq: [{ $type: "$date" }, "date"] },
                  then: "$date"
                },
                {
                  case: { $eq: [{ $type: "$date" }, "string"] },
                  then: {
                    $dateFromString: {
                      dateString: "$date",
                      onError: null,
                      onNull: null
                    }
                  }
                }
              ],
              default: null
            }
          }
        }
      },
      {
        $match: {
          dateAsDate: { $lte: targetDate }
        }
      },
      { $count: "count" }
    ]).toArray();
    
    const totalTelegram = totalTelegramArr.length > 0 ? totalTelegramArr[0].count : 0;
    
    return totalDarkweb + totalTelegram;
  } catch (error) {
    console.error('누적 위협 계산 오류:', error);
    return 0;
  }
}

// 시간대별 통계 API (추가)
app.get("/api/hourly-stats", async (req, res) => {
  try {
    const { date } = req.query; // YYYY-MM-DD 형식
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setUTCHours(0, 0, 0, 0);
    
    const nextDay = new Date(targetDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    
    const hourlyStats = [];
    
    for (let hour = 0; hour < 24; hour++) {
      const hourStart = new Date(targetDate);
      hourStart.setUTCHours(hour, 0, 0, 0);
      
      const hourEnd = new Date(targetDate);
      hourEnd.setUTCHours(hour, 59, 59, 999);
      
      // 해당 시간대의 데이터 개수
      const darkwebCount = await db.collection("darkweb_data").countDocuments({
        retrieved_at: { $gte: hourStart, $lte: hourEnd }
      });
      
      const telegramCountArr = await db.collection("telegram_data").aggregate([
        {
          $addFields: {
            dateAsDate: {
              $switch: {
                branches: [
                  {
                    case: { $eq: [{ $type: "$date" }, "date"] },
                    then: "$date"
                  },
                  {
                    case: { $eq: [{ $type: "$date" }, "string"] },
                    then: {
                      $dateFromString: {
                        dateString: "$date",
                        onError: null,
                        onNull: null
                      }
                    }
                  }
                ],
                default: null
              }
            }
          }
        },
        {
          $match: {
            dateAsDate: { $gte: hourStart, $lte: hourEnd }
          }
        },
        { $count: "count" }
      ]).toArray();
      
      const telegramCount = telegramCountArr.length > 0 ? telegramCountArr[0].count : 0;
      
      hourlyStats.push({
        hour: hour,
        timeLabel: `${hour.toString().padStart(2, '0')}:00`,
        totalThreats: darkwebCount + telegramCount,
        darkwebCount: darkwebCount,
        telegramCount: telegramCount
      });
    }
    
    res.json(hourlyStats);
  } catch (error) {
    console.error('시간대별 통계 조회 오류:', error);
    res.status(500).json({ error: '시간대별 통계를 가져올 수 없습니다.' });
  }
});

// --- 대시보드 지표 API (UTC 기준) ---
app.get("/api/dashboard-stats", async (req, res) => {
  try {
    // 전체 감지된 위협: 다크웹 + 텔레그램 전체 count
    const darkwebCount = await db.collection("darkweb_data").countDocuments();
    const telegramCount = await db.collection("telegram_data").countDocuments();
    const totalThreats = darkwebCount + telegramCount;

    // 오늘/어제 UTC 00:00:00 ~ 23:59:59
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = now.getUTCMonth();
    const dd = now.getUTCDate();

    const startOfTodayUTC = new Date(Date.UTC(yyyy, mm, dd, 0, 0, 0));
    const endOfTodayUTC = new Date(Date.UTC(yyyy, mm, dd, 23, 59, 59));

    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yyyyY = yesterday.getUTCFullYear();
    const mmY = yesterday.getUTCMonth();
    const ddY = yesterday.getUTCDate();
    const startOfYesterdayUTC = new Date(Date.UTC(yyyyY, mmY, ddY, 0, 0, 0));
    const endOfYesterdayUTC = new Date(Date.UTC(yyyyY, mmY, ddY, 23, 59, 59));

    // 다크웹: Date 타입이므로 기존 방식
    const darkwebToday = await db.collection("darkweb_data").countDocuments({
      retrieved_at: { $gte: startOfTodayUTC, $lte: endOfTodayUTC }
    });
    const darkwebYesterday = await db.collection("darkweb_data").countDocuments({
      retrieved_at: { $gte: startOfYesterdayUTC, $lte: endOfYesterdayUTC }
    });

    // 텔레그램: date 필드가 문자열일 수도 있으니, aggregation으로 변환해서 카운트
    const telegramTodayArr = await db.collection("telegram_data").aggregate([
      {
        $addFields: {
          dateAsDate: {
            $switch: {
              branches: [
                {
                  case: { $eq: [{ $type: "$date" }, "date"] },
                  then: "$date"
                },
                {
                  case: { $eq: [{ $type: "$date" }, "string"] },
                  then: {
                    $dateFromString: {
                      dateString: "$date",
                      onError: null,
                      onNull: null
                    }
                  }
                }
              ],
              default: null
            }
          }
        }
      },
      {
        $match: {
          dateAsDate: { $gte: startOfTodayUTC, $lte: endOfTodayUTC }
        }
      },
      { $count: "count" }
    ]).toArray();
    const telegramToday = telegramTodayArr.length > 0 ? telegramTodayArr[0].count : 0;

    const telegramYesterdayArr = await db.collection("telegram_data").aggregate([
      {
        $addFields: {
          dateAsDate: {
            $switch: {
              branches: [
                {
                  case: { $eq: [{ $type: "$date" }, "date"] },
                  then: "$date"
                },
                {
                  case: { $eq: [{ $type: "$date" }, "string"] },
                  then: {
                    $dateFromString: {
                      dateString: "$date",
                      onError: null,
                      onNull: null
                    }
                  }
                }
              ],
              default: null
            }
          }
        }
      },
      {
        $match: {
          dateAsDate: { $gte: startOfYesterdayUTC, $lte: endOfYesterdayUTC }
        }
      },
      { $count: "count" }
    ]).toArray();
    const telegramYesterday = telegramYesterdayArr.length > 0 ? telegramYesterdayArr[0].count : 0;

    const todayThreats = darkwebToday + telegramToday;
    const yesterdayThreats = darkwebYesterday + telegramYesterday;

    // 모니터링 채널: 다크웹 카테고리 수 + 텔레그램 위험정보 그룹(채널) 수
    const darkwebCategories = await db.collection("darkweb_data").distinct("category");
    const telegramGroups = await db.collection("telegram_data").distinct("channel");
    const monitoringChannels = darkwebCategories.length + telegramGroups.length;

    // 구독 채널: subscribe_data 전체 count
    const subscribeCount = await db.collection("subscribe_data").countDocuments();

    res.json({
      totalThreats,
      todayThreats,
      yesterdayThreats,
      monitoringChannels,
      subscribeCount
    });
  } catch (e) {
    console.error("대시보드 지표 API 오류:", e);
    res.status(500).json({ error: "대시보드 지표 조회 실패" });
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

    // 다크웹 Change Stream 세팅
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
