import  { useState, useEffect, useMemo } from "react";
import io from "socket.io-client";
import {
  ArrowUp,
  ArrowDown,
  Clock,
  Eye,
  Shield,
  Bell,
  MessageCircle,
  X,
  Sun,
  Moon,
  BarChart3,
  ArrowLeft,
  Cloud,
} from "lucide-react";
import { Card, CardContent } from "./components/ui/card";
import { ThemeProvider } from "./components/theme-provider";
import "./index.css";
import TimeAgo from "react-timeago";
import WordCloud from "react-d3-cloud";

// const SOCKET_URL = "http://localhost:4000";
const SOCKET_URL = "https://dark-web-6squ.onrender.com";

const detectLanguage = (text: string): string => {
  const langPatterns = {
    en: /\b(the|is|are|and|or|but|in|on|at|to|for|with|by|of|from)\b/i,
    ru: /[а-яА-Я]{3,}/i,
    de: /\b(und|oder|aber|der|die|das|ein|eine|zu|für|mit|von|bei)\b/i,
    fr: /\b(et|ou|mais|le|la|les|un|une|des|du|de|à|pour|avec|par)\b/i,
    es: /\b(y|o|pero|el|la|los|las|un|una|unos|unas|de|a|para|con|por)\b/i,
    it: /\b(e|o|ma|il|la|i|le|un|una|di|a|per|con|su)\b/i,
    ko: /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/,
    ja: /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/,
    zh: /[\u4e00-\u9fff\uf900-\ufaff]/,
  };
  for (const [lang, pattern] of Object.entries(langPatterns)) {
    if (pattern.test(text)) return lang;
  }
  return "unknown";
};

const languageNames: Record<string, string> = {
  en: "영어 (English)",
  ru: "러시아어 (Russian)",
  de: "독일어 (German)",
  fr: "프랑스어 (French)",
  es: "스페인어 (Spanish)",
  it: "이탈리아어 (Italian)",
  ko: "한국어 (Korean)",
  ja: "일본어 (Japanese)",
  zh: "중국어 (Chinese)",
  unknown: "알 수 없음 (Unknown)",
};

type DarkwebItem = {
  _id: string;
  title: string;
  description: string;
  category: string;
  count?: number;
  date: string;
  site?: string;
  url?: string;
  verified?: boolean;
};

type Message = {
  id: string;
  content: string;
  time: string;
  isAlert: boolean;
  views: number;
  forwards: number;
  channel: string;
  threat_actor: string;
  messageId: number;
  rawDate: string;
  uniqueId: string;
  originalContent?: string;
  translatedContent?: string;
  detectedLanguage?: string;
  isTranslated?: boolean;
  showTranslation?: boolean;
};

type ChartData = {
  date: string;
  totalThreats: number;
  todayThreats: number;
};

// react-d3-cloud용 타입 수정
type WordCloudWord = {
  text: string;
  value: number;
};

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<Record<string | number, boolean>>({});
  const [monitorActor, setMonitorActor] = useState<string | null>(null);
  const [blockedActors, setBlockedActors] = useState<string[]>([]);
  const [darkwebItems, setDarkwebItems] = useState<DarkwebItem[]>([]);
  const [darkwebLoading, setDarkwebLoading] = useState(true);
  const [darkwebError, setDarkwebError] = useState<string | null>(null);
  const [darkwebCategory, setDarkwebCategory] = useState<string | null>(null);

  // 대시보드 지표 상태
  const [dashboardStats, setDashboardStats] = useState<{
    totalThreats: number;
    todayThreats: number;
    yesterdayThreats: number;
    monitoringChannels: number;
    subscribeCount: number;
  } | null>(null);

  // 차트 상태
  const [showChart, setShowChart] = useState(false);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  // 알림받기 관련 상태
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showIdInputModal, setShowIdInputModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<"telegram" | "discord" | null>(null);
  const [platformId, setPlatformId] = useState("");
  const [savedNotifications, setSavedNotifications] = useState<{ telegram?: string; discord?: string }>({});
  const [subscribeStatus, setSubscribeStatus] = useState<string | null>(null);

  // 테마 상태
  const [isDarkMode, setIsDarkMode] = useState(true);
  const toggleTheme = () => setIsDarkMode((prev) => !prev);

  // --- 증감률 계산 함수 ---
  function getChangeRate(today: number, yesterday: number): { rate: number; up: boolean } {
    if (yesterday === 0) {
      if (today === 0) return { rate: 0, up: false };
      return { rate: 100, up: true };
    }
    const rate = ((today - yesterday) / yesterday) * 100;
    return { rate: Math.abs(rate), up: rate >= 0 };
  }

  // 대시보드 지표 fetch 함수
  const fetchDashboardStats = () => {
    fetch(`${SOCKET_URL}/api/dashboard-stats`)
      .then((res) => res.json())
      .then(setDashboardStats)
      .catch(() => setDashboardStats(null));
  };

  // 최초 mount 시 한 번 fetch
  useEffect(() => {
    const sock = io(SOCKET_URL);
    
    // 대시보드 데이터 변경 감지
    sock.on("dataChanged", (change) => {
      fetchDashboardStats();
      
      // 새 메시지 추가 (중복 방지)
      if (change?.operationType === "insert" && change?.fullDocument) {
        setMessages((prev) => {
          const exists = prev.some(msg => msg.id === change.fullDocument._id);
          if (exists) return prev;
          return [formatSingleMessage(change.fullDocument), ...prev];
        });
      }
    });
  
    return () => {
      sock.disconnect();
    };
  }, []);

  

  // 알림받기 플랫폼 선택 함수
  const selectPlatform = (platform: "telegram" | "discord") => {
    setSelectedPlatform(platform);
    setShowNotificationModal(false);
    setShowIdInputModal(true);
    setPlatformId(savedNotifications[platform] || "");
    setSubscribeStatus(null);
  };

  // 알림받기 아이디 저장 및 서버 등록 (구독 성공 후 대시보드 갱신)
  const saveNotificationId = async () => {
    if (selectedPlatform && platformId.trim()) {
      try {
        const res = await fetch(`${SOCKET_URL}/api/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: selectedPlatform,
            id: platformId.trim(),
          }),
        });
        if (res.ok) {
          setSavedNotifications((prev) => ({
            ...prev,
            [selectedPlatform]: platformId.trim(),
          }));
          setSubscribeStatus("구독이 등록되었습니다!");
          fetchDashboardStats();
        } else {
          setSubscribeStatus("구독 등록에 실패했습니다.");
        }
      } catch {
        setSubscribeStatus("서버 오류로 실패했습니다.");
      }
      setTimeout(() => {
        setShowIdInputModal(false);
        setSelectedPlatform(null);
        setPlatformId("");
        setSubscribeStatus(null);
      }, 1200);
    }
  };

  // 더보기 토글 함수
  const toggleExpand = (id: string | number) => {
    setExpandedMessages((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // 텔레그램 메시지 불러오기
  useEffect(() => {
    // 텔레그램 메시지 불러오기
    fetch(`${SOCKET_URL}/api/messages`)
      .then((response) => {
        if (!response.ok) throw new Error("서버 응답 오류");
        return response.json();
      })
      .then((data) => {
        setMessages(formatMessages(data));
        setLoading(false);
      })
      .catch(() => {
        setError("텔레그램 메시지를 불러오는데 실패했습니다");
        setLoading(false);
      });
  
    // 다크웹 데이터 불러오기
    fetch(`${SOCKET_URL}/api/darkweb`)
      .then((response) => {
        if (!response.ok) throw new Error("서버 응답 오류");
        return response.json();
      })
      .then((data) => {
        setDarkwebItems(data);
        setDarkwebLoading(false);
      })
      .catch(() => {
        setDarkwebError("다크웹 데이터를 불러오는데 실패했습니다");
        setDarkwebLoading(false);
      });
  }, []); // 한 번만 실행

  // 메시지 포맷터
  const formatMessages = (data: any[]): Message[] => data.map(formatSingleMessage);

  function formatSingleMessage(item: any): Message {
    const originalContent = item.text || "내용 없음";
    const detectedLanguage = detectLanguage(originalContent);
    const translatedContent =
      detectedLanguage !== "ko"
        ? "번역된 예시 텍스트 (실제 번역 API 연동 필요)"
        : originalContent;
    return {
      id: item._id,
      content: originalContent,
      originalContent,
      translatedContent,
      detectedLanguage,
      isTranslated: false,
      showTranslation: false,
      time: formatDate(item.date),
      isAlert:
        item.threat_actor === "Anonymous Russia channel" ||
        Boolean(item.attack_type),
      views: item.views || Math.floor(Math.random() * 2000),
      forwards: item.forwards || Math.floor(Math.random() * 100),
      channel:
        item.channel ||
        extractTelegramLink(item.text) ||
        "https://t.me/anzu_team",
      threat_actor: item.threat_actor || "Anzu Team",
      messageId: item.message_id || Math.floor(Math.random() * 100),
      rawDate: item.date || new Date().toISOString(),
      uniqueId: `nw-${Math.floor(Math.random() * 9999999999999)}`,
    };
  }

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return "방금";
      if (diffMins < 60) return `${diffMins}분전`;

      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}시간전`;

      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}일전`;
    } catch (e) {
      return "날짜 오류";
    }
  };

  const extractTelegramLink = (text: string): string | null => {
    if (!text) return null;
    const match = text.match(/https?:\/\/t\.me\/[^\s]+/);
    return match ? match[0] : null;
  };

  const actorList = Array.from(
    new Set(messages.map((msg) => msg.threat_actor))
  ).filter(Boolean);

  const filteredMessages = monitorActor
    ? messages.filter(
        (msg) =>
          msg.threat_actor === monitorActor &&
          !blockedActors.includes(msg.threat_actor)
      )
    : messages.filter((msg) => !blockedActors.includes(msg.threat_actor));

  const darkwebCategories = Array.from(
    new Set(darkwebItems.map((item) => item.category))
  ).filter(Boolean);

  const filteredDarkwebItems =
    darkwebCategory && darkwebCategory !== "전체 보기"
      ? darkwebItems.filter((item) => item.category === darkwebCategory)
      : darkwebItems;

  // 카드, 배경, 텍스트 색상 등 다크/라이트 분기
  const bgMain = isDarkMode ? "bg-black text-white" : "bg-gray-50 text-gray-900";
  const borderHeader = isDarkMode ? "border-gray-800 bg-black" : "border-gray-200 bg-white";
  const card1 = isDarkMode ? "bg-purple-900 border-none text-white" : "bg-purple-600 border-none text-white";
  const card2 = isDarkMode ? "bg-purple-700 border-none text-white" : "bg-purple-500 border-none text-white";
  const card3 = isDarkMode ? "bg-blue-900 border-none text-white" : "bg-blue-600 border-none text-white";
  const card4 = isDarkMode ? "bg-emerald-800 border-none text-white" : "bg-emerald-600 border-none text-white";
  const sectionCard = isDarkMode ? "border-gray-800 bg-gray-950" : "border-gray-200 bg-white";
  const filterBtnActive = isDarkMode ? "bg-blue-700 text-white" : "bg-blue-700 text-white";
  const filterBtn = isDarkMode ? "bg-gray-800 text-gray-300" : "bg-gray-200 text-gray-700";
  const borderB = isDarkMode ? "border-gray-800" : "border-gray-200";
  const textSub = isDarkMode ? "text-gray-400" : "text-gray-600";
  const textMain = isDarkMode ? "text-white" : "text-gray-900";

  // --- 워드클라우드 동적 분석 함수 (react-d3-cloud용으로 수정) ---
  function extractKeywords(messages: Message[], maxWords = 20): WordCloudWord[] {
    // 불용어(한글, 영어, 숫자, 특수문자 등)
    const stopwords = new Set([
      "the","is","are","and","or","but","in","on","at","to","for","with","by","of","from",
      "a","an","it","this","that","i","you","he","she","we","they","me","my","your","our",
      "가","이","은","는","을","를","에","의","도","로","과","와","에서","하다","있다","및","등","수","것","들","한","또한","또는","까지","부터","보다","다","고",
      "https", "http", "www", "com", "org", "net", "io", "co", "kr", "me", "ru", "de", "fr", "es", "it", "jp", "cn",
    "click", "here", "more", "info", "new", "get", "now", "free", "join", "today","ad","will",
    "hello", "hi", "hey", "okay", "ok", "lol", "lmao", "yo", "sup", "bro", "yo", "fr", "irl", "pls", "dm", "pm", "lmk", "wsg", "wtf", "idk", "bruh", "cb", "nah", "ikr"
,"com", "net", "org", "io", "me", "ru", "cn", "de", "fr", "co", "gg", "to", "sx", "link", "url", "site"

    ]);
    const freq: Record<string, number> = {};
    for (const msg of messages) {
      const words = (msg.content || "")
        .toLowerCase()
        .replace(/[^a-zA-Z0-9가-힣 ]/g, " ")
        .split(/\s+/);
      for (const w of words) {
        if (!w || stopwords.has(w) || w.length < 2) continue;
        if (/^[0-9a-f]{6,}$/.test(w)) continue; // 해시 제외
        if (/^\d+$/.test(w)) continue; // 숫자 제외
        freq[w] = (freq[w] || 0) + 1;
      }
    }
    
    const result = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxWords)
      .map(([text, count]) => ({
        text,
        value: count,
      }));
    return result;
  }

  // 워드클라우드 모달 상태
  const [showWordCloud, setShowWordCloud] = useState(false);
  const [selectedActor, setSelectedActor] = useState<string | null>(null);

  // 워드클라우드 데이터 (useMemo로 캐싱)
  const wordCloudWords = useMemo(() => {
    if (!showWordCloud) return [];
    if (selectedActor === "전체 데이터" || !selectedActor) {
      return extractKeywords(messages);
    }
    return extractKeywords(messages.filter(msg => msg.threat_actor === selectedActor));
  }, [showWordCloud, selectedActor, messages]);

  // 워드클라우드 모달 열기
  const showWordCloudForCurrentFilter = () => {
    if (monitorActor === null) {
      setSelectedActor("전체 데이터");
    } else {
      setSelectedActor(monitorActor);
    }
    setShowWordCloud(true);
  };
  const closeWordCloud = () => {
    setShowWordCloud(false);
    setSelectedActor(null);
  };

  // 차트 데이터 생성 함수
  const generateChartData = (): ChartData[] => {
    if (!dashboardStats) return [];
    const data: ChartData[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);

      const baseTotal = dashboardStats.totalThreats;
      const baseToday = dashboardStats.todayThreats;

      const variation = Math.random() * 0.2 - 0.1;
      const totalThreats = Math.floor(baseTotal * (1 + variation * (i + 1) * 0.05));
      const todayThreats = Math.floor(baseToday * (1 + variation * 3));

      data.push({
        date: date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" }),
        totalThreats,
        todayThreats: i === 0 ? dashboardStats.todayThreats : todayThreats,
      });
    }
    return data;
  };

  const toggleChart = () => {
    if (!showChart) {
      setChartLoading(true);
      setTimeout(() => {
        setChartData(generateChartData());
        setChartLoading(false);
      }, 500);
    }
    setShowChart(!showChart);
  };

  // 차트 최대값 계산
  const maxValue = chartData.length > 0 ? Math.max(...chartData.map((d) => Math.max(d.totalThreats, d.todayThreats))) : 1;
  const chartWidth = 600;
  const chartHeight = 300;
  const padding = 40;

  const getXPosition = (index: number) => {
    return padding + (index * (chartWidth - padding * 2)) / (chartData.length - 1);
  };
  const getYPosition = (value: number) => {
    return chartHeight - padding - (value / maxValue) * (chartHeight - padding * 2);
  };

  const totalThreatsPath = chartData
    .map((data, index) => {
      const x = getXPosition(index);
      const y = getYPosition(data.totalThreats);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
  const todayThreatsPath = chartData
    .map((data, index) => {
      const x = getXPosition(index);
      const y = getYPosition(data.todayThreats);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  // --- 렌더링 ---
  return (
    <ThemeProvider defaultTheme="dark" attribute="class">
      <div className={`flex min-h-screen flex-col ${bgMain}`}>
        <header className={`border-b p-4 ${borderHeader}`}>
          <div className="flex items-center justify-between">
            <h1 className={`text-2xl font-bold ${textMain}`}>Untitle</h1>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleChart}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  showChart
                    ? "bg-blue-600 text-white"
                    : isDarkMode
                      ? "bg-gray-800 hover:bg-gray-700 text-gray-300"
                      : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                }`}
              >
                <BarChart3 className="h-4 w-4" />
                <span className="text-sm">통계</span>
              </button>
              <button
                onClick={toggleTheme}
                className={`relative w-14 h-7 rounded-full transition-all duration-300 ease-in-out ${
                  isDarkMode ? "bg-gray-600" : "bg-gray-300"
                } focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50`}
              >
                <div
                  className={`absolute top-0.5 w-6 h-6 rounded-full transition-all duration-300 ease-in-out transform shadow-md flex items-center justify-center ${
                    isDarkMode ? "translate-x-0.5 bg-gray-800" : "translate-x-7 bg-white"
                  }`}
                >
                  {isDarkMode ? (
                    <Moon className="h-3 w-3 text-blue-400" />
                  ) : (
                    <Sun className="h-3 w-3 text-yellow-500" />
                  )}
                </div>
              </button>
              <button
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                onClick={() => setShowNotificationModal(true)}
              >
                <Bell className="h-4 w-4" />
                알림받기
              </button>
            </div>
          </div>
        </header>

        {/* 차트 모달 */}
        {showChart && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div
              className={`${isDarkMode ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} border rounded-lg w-full max-w-5xl p-6 mx-4`}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className={`text-xl font-bold ${textMain}`}>최근 7일간 위협 탐지 현황</h3>
                <button
                  className={`${isDarkMode ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900"}`}
                  onClick={() => setShowChart(false)}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {chartLoading ? (
                <div className="flex justify-center items-center h-96">
                  <div className={`text-lg ${textSub}`}>차트 데이터 로딩 중...</div>
                </div>
              ) : (
                <div className="h-96 relative flex justify-center">
                  <svg width={chartWidth} height={chartHeight} className="overflow-visible">
                    <defs>
                      <pattern
                        id="grid"
                        width="50"
                        height="30"
                        patternUnits="userSpaceOnUse"
                        className={isDarkMode ? "opacity-20" : "opacity-30"}
                      >
                        <path d="M 50 0 L 0 0 0 30" fill="none" stroke="currentColor" strokeWidth="1" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                      <line
                        key={ratio}
                        x1={padding}
                        y1={chartHeight - padding - ratio * (chartHeight - padding * 2)}
                        x2={chartWidth - padding}
                        y2={chartHeight - padding - ratio * (chartHeight - padding * 2)}
                        stroke="currentColor"
                        strokeWidth="1"
                        className={isDarkMode ? "opacity-20" : "opacity-30"}
                      />
                    ))}
                    {chartData.map((_, index) => (
                      <line
                        key={index}
                        x1={getXPosition(index)}
                        y1={padding}
                        x2={getXPosition(index)}
                        y2={chartHeight - padding}
                        stroke="currentColor"
                        strokeWidth="1"
                        className={isDarkMode ? "opacity-20" : "opacity-30"}
                      />
                    ))}
                    <defs>
                      <linearGradient id="totalThreatsGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#9333ea" stopOpacity="1.0" />
                        <stop offset="100%" stopColor="#9333ea" stopOpacity="0.5" />
                      </linearGradient>
                    </defs>
                    <path
                      d={`${totalThreatsPath} L ${getXPosition(chartData.length - 1)} ${chartHeight - padding} L ${padding} ${chartHeight - padding} Z`}
                      fill="url(#totalThreatsGradient)"
                      className="animate-pulse"
                      style={{ animationDuration: "3s" }}
                    />
                    <defs>
                      <linearGradient id="todayThreatsGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#2563eb" stopOpacity="1.0" />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity="0.5" />
                      </linearGradient>
                    </defs>
                    <path
                      d={`${todayThreatsPath} L ${getXPosition(chartData.length - 1)} ${chartHeight - padding} L ${padding} ${chartHeight - padding} Z`}
                      fill="url(#todayThreatsGradient)"
                      className="animate-pulse"
                      style={{ animationDuration: "3s", animationDelay: "0.5s" }}
                    />
                    <path
                      d={totalThreatsPath}
                      fill="none"
                      stroke="#9333ea"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="drop-shadow-sm"
                      style={{
                        strokeDasharray: "1000",
                        strokeDashoffset: "1000",
                        animation: "drawLine 2s ease-out forwards",
                      }}
                    />
                    <path
                      d={todayThreatsPath}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="drop-shadow-sm"
                      style={{
                        strokeDasharray: "1000",
                        strokeDashoffset: "1000",
                        animation: "drawLine 2s ease-out 0.5s forwards",
                      }}
                    />
                    {chartData.map((data, index) => (
                      <g key={`total-${index}`}>
                        <circle
                          cx={getXPosition(index)}
                          cy={getYPosition(data.totalThreats)}
                          r="6"
                          fill="#9333ea"
                          stroke="white"
                          strokeWidth="2"
                          className="drop-shadow-sm cursor-pointer hover:r-8 transition-all"
                          style={{
                            opacity: 0,
                            animation: `fadeIn 0.5s ease-out ${1 + index * 0.2}s forwards`,
                          }}
                        >
                          <title>{`${data.date}: ${data.totalThreats.toLocaleString()}개`}</title>
                        </circle>
                        <circle
                          cx={getXPosition(index)}
                          cy={getYPosition(data.todayThreats)}
                          r="6"
                          fill="#2563eb"
                          stroke="white"
                          strokeWidth="2"
                          className="drop-shadow-sm cursor-pointer hover:r-8 transition-all"
                          style={{
                            opacity: 0,
                            animation: `fadeIn 0.5s ease-out ${1.5 + index * 0.2}s forwards`,
                          }}
                        >
                          <title>{`${data.date}: ${data.todayThreats.toLocaleString()}개`}</title>
                        </circle>
                      </g>
                    ))}
                    {chartData.map((data, index) => (
                      <text
                        key={`x-label-${index}`}
                        x={getXPosition(index)}
                        y={chartHeight - 10}
                        textAnchor="middle"
                        className={`text-sm ${textSub} fill-current`}
                      >
                        {data.date}
                      </text>
                    ))}
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                      <text
                        key={`y-label-${ratio}`}
                        x={padding - 10}
                        y={chartHeight - padding - ratio * (chartHeight - padding * 2) + 5}
                        textAnchor="end"
                        className={`text-xs ${textSub} fill-current`}
                      >
                        {Math.floor(maxValue * ratio).toLocaleString()}
                      </text>
                    ))}
                  </svg>
                  <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-6">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-purple-600 rounded-full"></div>
                      <span className={`text-sm ${textMain}`}>전체 감지된 위협</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-blue-600 rounded-full"></div>
                      <span className={`text-sm ${textMain}`}>금일 감지된 위협</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <main className="flex-1 p-4 md:p-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card className={card1}>
            <CardContent className="p-6 h-full flex flex-col">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium opacity-70">전체 감지된 위협</p>
                    <h2 className="text-3xl font-bold">
                      {dashboardStats ? dashboardStats.totalThreats.toLocaleString() : "로딩..."}
                    </h2>
                  </div>
                  {dashboardStats && (
                    <div className={`flex items-center ${getChangeRate(dashboardStats.totalThreats, dashboardStats.totalThreats - dashboardStats.todayThreats).up ? "text-green-400" : "text-red-400"}`}>
                      {getChangeRate(dashboardStats.totalThreats, dashboardStats.totalThreats - dashboardStats.todayThreats).up ? <ArrowUp className="h-4 w-4 mr-1" /> : <ArrowDown className="h-4 w-4 mr-1" />}
                      <span className="text-xs">
                        {getChangeRate(dashboardStats.totalThreats, dashboardStats.totalThreats - dashboardStats.todayThreats).rate.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className={card2}>
              <CardContent className="p-6">

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium opacity-70">금일 감지된 위협</p>
                    <h2 className="text-3xl font-bold">
                      {dashboardStats ? dashboardStats.todayThreats.toLocaleString() : "로딩..."}
                    </h2>
                  </div>
                  {dashboardStats && (
                    <div className={`flex items-center ${getChangeRate(dashboardStats.todayThreats, dashboardStats.yesterdayThreats).up ? "text-green-400" : "text-red-400"}`}>
                      {getChangeRate(dashboardStats.todayThreats, dashboardStats.yesterdayThreats).up ? <ArrowUp className="h-4 w-4 mr-1" /> : <ArrowDown className="h-4 w-4 mr-1" />}
                      <span className="text-xs">
                        {getChangeRate(dashboardStats.todayThreats, dashboardStats.yesterdayThreats).rate.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className={card3}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium opacity-70">모니터링 채널</p>
                    <h2 className="text-3xl font-bold">
                      {dashboardStats ? dashboardStats.monitoringChannels.toLocaleString() : "로딩..."}
                    </h2>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className={card4}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium opacity-70">구독 채널</p>
                    <h2 className="text-3xl font-bold">
                      {dashboardStats ? dashboardStats.subscribeCount.toLocaleString() : "로딩..."}
                    </h2>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-6 md:grid-cols-2 relative overflow-hidden" style={{ minHeight: '600px' }}>

            <section className={`transition-transform duration-500 ease-in-out ${showWordCloud ? "-translate-x-full opacity-0" : "translate-x-0 opacity-100"}`}>
              <Card className={sectionCard + " mb-6"}style={{ height: '600px' }}>
                    <CardContent className="p-5 h-full flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className={`text-xl font-bold ${textMain}`}>다크웹 데이터 목록</h2>
                    <span className={`text-xs ${textSub}`}>{filteredDarkwebItems.length}개 항목</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <button
                      className={`text-xs px-2 py-1 rounded ${!darkwebCategory || darkwebCategory === "전체 보기" ? filterBtnActive : filterBtn}`}
                      onClick={() => setDarkwebCategory("전체 보기")}
                    >
                      전체 보기
                    </button>
                    {darkwebCategories.map((cat) => (
                      <button
                        key={cat}
                        className={`text-xs px-2 py-1 rounded ${darkwebCategory === cat ? filterBtnActive : filterBtn}`}
                        onClick={() => setDarkwebCategory(cat)}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  {darkwebLoading ? (
                    <div className={textSub}>로딩 중...</div>
                  ) : darkwebError ? (
                    <div className="text-red-400">{darkwebError}</div>
                  ) : (
                    <div className="max-h-[515px] overflow-y-auto overflow-x-hidden">
                      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
                        {filteredDarkwebItems.map((item) => (
                          <Card
                            key={item._id}
                            className={isDarkMode ? "bg-gray-900 border-none text-white" : "bg-gray-50 border-none text-gray-900"}
                          >
                            <CardContent className="p-0 h-full flex flex-col">
                              <div className="flex items-center justify-between mb-2">
                                <span
                                  className={`text-xs px-2 py-0.5 rounded font-bold ${
                                    item.verified
                                      ? "bg-blue-700"
                                      : item.category === "의료 정보"
                                      ? "bg-red-700"
                                      : item.category === "기업 정보"
                                      ? "bg-orange-700"
                                      : item.category === "계정 정보"
                                      ? "bg-blue-700"
                                      : isDarkMode
                                      ? "bg-gray-700"
                                      : "bg-gray-200"
                                  } text-white`}
                                >
                                  {item.verified ? "✔️ 검증됨" : item.category}
                                </span>
                                {item.count && (
                                  <span className={textSub}>
                                    {item.count}개 항목
                                  </span>
                                )}
                              </div>
                              <div className={`font-bold mb-1 truncate ${textMain}`}>{item.title}</div>
                              <div className={`text-xs mb-1 ${textSub}`}>{item.description}</div>
                              {item.site && (
                                <div className={`text-xs mb-1 ${textSub}`}>{item.category}</div>
                              )}
                              <div className="text-xs text-gray-500 mb-1">
                                {item.date}
                              </div>
                              {item.url && (
                                <a
                                  href={item.url}
                                  className="text-xs text-blue-400 break-all hover:underline"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {item.url}
                                </a>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
            <section className={`transition-transform duration-500 ease-in-out ${showWordCloud ? "-translate-x-full "  : "translate-x-0"}`}>
              <Card className={sectionCard + " mb-6"}style={{ height: '600px' }}>
              <CardContent className="p-0 h-full flex flex-col">
                  <div className={`flex items-center justify-between border-b p-4 ${borderB}`}>
                    <h3 className={`text-xl font-bold ${textMain}`}>텔레그램 위험 정보</h3>
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center text-sm ${textSub}`}>
                        <Clock className="mr-1 h-4 w-4" />
                        <span>실시간</span>
                      </div>
                      <button
                        onClick={showWordCloudForCurrentFilter}
                        className={`p-2 rounded-lg transition-colors hover:scale-110 ${
                          isDarkMode
                            ? "hover:bg-gray-800 text-gray-400 hover:text-blue-400"
                            : "hover:bg-gray-100 text-gray-600 hover:text-blue-600"
                        }`}
                        title="키워드 분석 보기"
                      >
                        <Cloud className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                  <div className={`flex flex-wrap gap-2 p-4 border-b ${borderB}`}>
                    <button
                      className={`text-xs px-2 py-1 rounded ${monitorActor === null ? filterBtnActive : filterBtn}`}
                      onClick={() => setMonitorActor(null)}
                    >
                      전체 보기
                    </button>
                    {actorList.map((actor) => {
                      const isBlocked = blockedActors.includes(actor);
                      const isMonitored = monitorActor === actor;
                      return (
                        <button
                          key={actor}
                          className={`text-xs px-2 py-1 rounded transition-colors ${
                            isBlocked ? "bg-red-700 text-white" : isMonitored ? filterBtnActive : filterBtn
                          } hover:scale-105`}
                          onClick={() => {
                            if (isBlocked) {
                              setBlockedActors((prev) => prev.filter((a) => a !== actor));
                            } else {
                              setMonitorActor(actor);
                            }
                          }}
                        >
                          {actor}
                        </button>
                      );
                    })}
                  </div>
                  {loading ? (
                    <div className="flex justify-center items-center h-[200px]">
                      <p className={textSub}>데이터 로딩 중...</p>
                    </div>
                  ) : error ? (
                    <div className="flex justify-center items-center h-[200px]">
                      <p className="text-red-400">{error}</p>
                    </div>
                  ) : (
                    <div className="max-h-[400px]  overflow-y-auto overflow-x-hidden">
                      {filteredMessages.map((message, index) => (
                        <div
                          key={message.id || index}
                          className={`border-b p-4 ${borderB} ${index === 0 ? (isDarkMode ? "bg-blue-950/20" : "bg-blue-100/20") : ""}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="bg-red-900 text-white text-xs px-2 py-0.5 rounded mr-2">
                              {message.threat_actor}
                            </span>
                            <span className="text-xs text-gray-300">
                              <TimeAgo date={message.rawDate} />
                            </span>
                          </div>
                          <div className="mb-2">
                            <div className={isDarkMode ? "text-white" : "text-gray-900"}>
                              {message.content}
                              {message.showTranslation && (
                                <span className={isDarkMode ? "ml-2 text-xs text-green-400" : "ml-2 text-xs text-green-600"}>
                                  (번역됨)
                                </span>
                              )}
                              {!message.showTranslation &&
                                message.detectedLanguage !== "ko" &&
                                message.detectedLanguage !== "en" && (
                                  <span className="ml-2 text-xs text-gray-500">
                                    ({languageNames[message.detectedLanguage || "unknown"] || message.detectedLanguage})
                                  </span>
                                )}
                            </div>
                          </div>
                          {!expandedMessages[message.id || index] && (
                            <div className="mt-2">
                              <button
                                className="text-xs text-gray-400"
                                onClick={() => toggleExpand(message.id || index)}
                              >
                                더 보기...
                              </button>
                            </div>
                          )}
                          <div className="flex mt-2 gap-2 text-xs text-gray-500">
                            <button
                              className="flex items-center"
                              onClick={() => setMonitorActor(message.threat_actor)}
                            >
                              <Eye className="mr-1 h-3 w-3" />
                              모니터링
                            </button>
                            <button
                              className="flex items-center"
                              onClick={() =>
                                setBlockedActors((prev) =>
                                  prev.includes(message.threat_actor)
                                    ? prev
                                    : [...prev, message.threat_actor]
                                )
                              }
                            >
                              <Shield className="mr-1 h-3 w-3" />
                              차단
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
            {showWordCloud && (
  <section 
    className={`absolute top-0 w-1/2 transition-all duration-500 ease-in-out transform ${showWordCloud ? "opacity-100" : "opacity-0"}`} 
    style={{ left: 'calc(50% - -1.5rem)' }}
  >
    <Card className={sectionCard + " mb-6"}style={{ height: '600px' }}>
    <CardContent className="p-6 h-full flex flex-col">
    <div className={`flex items-center justify-between mb-6 pr-4`}>
  <div className="flex items-center gap-3">
    <button onClick={closeWordCloud}>
      <ArrowLeft className="h-4 w-4" />
    </button>
    <h3 className={`text-xl font-bold ${textMain}`}>{selectedActor || "전체 데이터"}</h3>
  </div>
  <span className={`text-xs ${textSub}`}>키워드 분석</span>
</div>
                    <div className="relative h-[485px] overflow-auto">
                      {wordCloudWords.length > 0 ? (
                        <WordCloud
                          data={wordCloudWords}
                          width={400}
                          height={350}
                          font="Arial"
                          fontStyle="normal"
                          fontWeight="bold"
                          fontSize={(word) => Math.max(12, Math.min(word.value * 8, 38))}
                          spiral="archimedean"
                          rotate={() => 0}
                          padding={5}
                          random={() => 0.5}
                          fill={(_d: any, i: number) => {  // 여기에 타입 추가
                            const colors = ["#8b5cf6", "#3b82f6", "#ef4444", "#06b6d4", "#10b981", "#f59e0b", "#6b7280"];
                            return colors[i % colors.length];
                          }}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <p className={`text-lg ${textSub}`}>키워드 없음</p>
                        </div>
                      )}
                    </div>
                    <div className={`mt-4 p-4 rounded-lg ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}`}>
                      <p className={`text-sm ${textSub}`}>
                        <strong className={textMain}>{selectedActor || "전체 데이터"}</strong>의 주요 키워드를 실시간 분석한 결과입니다. 글자 크기는 해당 키워드의 언급 빈도를 나타냅니다.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}
          </div>
        </main>
        {showNotificationModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className={isDarkMode ? "bg-gray-900 border border-gray-800 rounded-lg w-full max-w-md p-6" : "bg-white border border-gray-200 rounded-lg w-full max-w-md p-6"}>
              <div className="flex items-center justify-between mb-6">
                <h3 className={`text-xl font-bold ${textMain}`}>알림받기 설정</h3>
                <button className={isDarkMode ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900"} onClick={() => setShowNotificationModal(false)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="text-center mb-6">
                <p className={`${textSub} mb-4`}>알림을 받을 플랫폼을 선택해주세요</p>
                <div className="flex justify-center gap-8">
                  <button
                    className={`flex flex-col items-center gap-3 p-6 rounded-lg transition-colors group ${isDarkMode ? "bg-gray-800 hover:bg-gray-700" : "bg-gray-100 hover:bg-gray-200"}`}
                    onClick={() => selectPlatform("telegram")}
                  >
                    <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center group-hover:bg-blue-400 transition-colors">
                      <MessageCircle className="h-8 w-8 text-white" />
                    </div>
                    <span className={`font-medium ${textMain}`}>텔레그램</span>
                    {savedNotifications.telegram && <span className="text-xs text-green-400">✓ 설정됨</span>}
                  </button>
                  <button
                    className={`flex flex-col items-center gap-3 p-6 rounded-lg transition-colors group ${isDarkMode ? "bg-gray-800 hover:bg-gray-700" : "bg-gray-100 hover:bg-gray-200"}`}
                    onClick={() => selectPlatform("discord")}
                  >
                    <div className="w-16 h-16 bg-indigo-500 rounded-full flex items-center justify-center group-hover:bg-indigo-400 transition-colors">
                      <MessageCircle className="h-8 w-8 text-white" />
                    </div>
                    <span className={`font-medium ${textMain}`}>디스코드</span>
                    {savedNotifications.discord && <span className="text-xs text-green-400">✓ 설정됨</span>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {showIdInputModal && selectedPlatform && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className={isDarkMode ? "bg-gray-900 border border-gray-800 rounded-lg w-full max-w-md p-6" : "bg-white border border-gray-200 rounded-lg w-full max-w-md p-6"}>
              <div className="flex items-center justify-between mb-6">
                <h3 className={`text-xl font-bold ${textMain}`}>
                  {selectedPlatform === "telegram" ? "텔레그램" : "디스코드"} 아이디 입력
                </h3>
                <button
                  className={isDarkMode ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900"}
                  onClick={() => {
                    setShowIdInputModal(false);
                    setSelectedPlatform(null);
                    setPlatformId("");
                  }}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-12 h-12 ${selectedPlatform === "telegram" ? "bg-blue-500" : "bg-indigo-500"} rounded-full flex items-center justify-center`}
                  >
                    <MessageCircle className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h4 className={`font-medium ${textMain}`}>{selectedPlatform === "telegram" ? "텔레그램" : "디스코드"}</h4>
                    <p className={`text-sm ${textSub}`}>
                      {selectedPlatform === "telegram"
                        ? "@username 또는 사용자 ID를 입력하세요"
                        : "디스코드 Webhook URL을 입력하세요"}
                    </p>
                  </div>
                </div>
                <input
                  type="text"
                  value={platformId}
                  onChange={(e) => setPlatformId(e.target.value)}
                  placeholder={selectedPlatform === "telegram" ? "@username 또는 chat_id" : "Discord Webhook URL"}
                  className={`w-full border rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 ${
                    isDarkMode
                      ? "bg-gray-800 border-gray-700 text-white placeholder-gray-400"
                      : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                  }`}
                />
                <p className={`text-xs mt-2 ${textSub}`}>
                  {selectedPlatform === "telegram"
                    ? "예: @myusername 또는 123456789"
                    : "예: https://discord.com/api/webhooks/xxx/yyy"}
                </p>
                {subscribeStatus && (
                  <div className="text-center mt-3 text-green-400">{subscribeStatus}</div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                    isDarkMode
                      ? "bg-gray-700 hover:bg-gray-600 text-white"
                      : "bg-gray-200 hover:bg-gray-300 text-gray-900"
                  }`}
                  onClick={() => {
                    setShowIdInputModal(false);
                    setSelectedPlatform(null);
                    setPlatformId("");
                  }}
                >
                  취소
                </button>
                <button
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={saveNotificationId}
                  disabled={!platformId.trim()}
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ThemeProvider>
  );
}

export default App;
