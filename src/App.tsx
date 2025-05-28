import { useState, useEffect } from "react";
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

const SOCKET_URL = "http://localhost:4000";
// const SOCKET_URL = "https://dark-web-6squ.onrender.com";
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
  darkwebCount?: number;
  telegramCount?: number;
};
// 기존 상태들 아래에 추가
const [wordCloudWords, setWordCloudWords] = useState<WordCloudWord[]>([]);

type WordCloudWord = {
  text: string;
  value: number;
};

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [monitorActor, setMonitorActor] = useState<string | null>(null);
  const [blockedActors, setBlockedActors] = useState<string[]>([]);
  const [darkwebItems, setDarkwebItems] = useState<DarkwebItem[]>([]);
  const [darkwebLoading, setDarkwebLoading] = useState(true);
  const [darkwebError, setDarkwebError] = useState<string | null>(null);
  const [darkwebCategory, setDarkwebCategory] = useState<string | null>(null);

  const [dashboardStats, setDashboardStats] = useState<{
    totalThreats: number;
    todayThreats: number;
    yesterdayThreats: number;
    monitoringChannels: number;
    subscribeCount: number;
  } | null>(null);

  const [showChart, setShowChart] = useState(false);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showIdInputModal, setShowIdInputModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<"telegram" | "discord" | null>(null);
  const [platformId, setPlatformId] = useState("");
  const [savedNotifications, setSavedNotifications] = useState<{ telegram?: string; discord?: string }>({});
  const [subscribeStatus, setSubscribeStatus] = useState<string | null>(null);

  const [isDarkMode, setIsDarkMode] = useState(true);
  const toggleTheme = () => setIsDarkMode((prev) => !prev);

  const [showWordCloud, setShowWordCloud] = useState(false);
  const [selectedActor, setSelectedActor] = useState<string | null>(null);

  const [keywordWorker, setKeywordWorker] = useState<Worker | null>(null);
const [keywordLoading, setKeywordLoading] = useState(false);
const [extractionProgress, setExtractionProgress] = useState(0);



// 기존 상태에 추가
const [messageTranslations, setMessageTranslations] = useState<Record<string, {
  translatedText: string;
  sourceLanguage: string;
  isTranslated: boolean;
}>>({})
const [translatingMessages, setTranslatingMessages] = useState<Set<string>>(new Set())

// 개별 메시지 번역 함수
const translateMessage = async (messageId: string, content: string) => {
  if (translatingMessages.has(messageId)) return;
  
  setTranslatingMessages(prev => new Set(prev).add(messageId));
  
  try {
    const response = await fetch(`${SOCKET_URL}/api/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: content,
        sourceLanguage: 'auto',
        targetLanguage: 'ko' // 한국어로 번역
      })
    });

    if (!response.ok) {
      throw new Error('번역 요청 실패');
    }

    const result = await response.json();
    
    setMessageTranslations(prev => ({
      ...prev,
      [messageId]: {
        translatedText: result.translatedText,
        sourceLanguage: result.sourceLanguage,
        isTranslated: true
      }
    }));
  } catch (error) {
    console.error('메시지 번역 오류:', error);
    setMessageTranslations(prev => ({
      ...prev,
      [messageId]: {
        translatedText: '번역 중 오류가 발생했습니다.',
        sourceLanguage: 'unknown',
        isTranslated: true
      }
    }));
  } finally {
    setTranslatingMessages(prev => {
      const newSet = new Set(prev);
      newSet.delete(messageId);
      return newSet;
    });
  }
};





useEffect(() => {
  const worker = new Worker(new URL('./keywordWorker.js', import.meta.url), {
    type: 'module'
  });

  worker.onmessage = (event) => {
    const { type, progress, error, keywords } = event.data;
    
    switch (type) {
      case 'LOADING_PROGRESS':
        const safeProgress = progress && typeof progress.progress === 'number' 
          ? Math.round(Math.max(0, Math.min(100, progress.progress * 100)))
          : 0;
        setExtractionProgress(safeProgress);
        break;
      case 'KEYWORDS_EXTRACTED':
        // 워드클라우드 데이터 설정
        if (keywords && Array.isArray(keywords)) {
          setWordCloudWords(keywords);
        }
        setKeywordLoading(false);
        setExtractionProgress(100);
        break;
      case 'EXTRACTION_ERROR':
        console.error('키워드 추출 오류:', error);
        setKeywordLoading(false);
        setExtractionProgress(0);
        break;
    }
  };
  
  setKeywordWorker(worker);

  return () => {
    worker.terminate();
  };
}, []);

  function getChangeRate(today: number, yesterday: number): { rate: number; up: boolean } {
    if (yesterday === 0) {
      if (today === 0) return { rate: 0, up: false };
      return { rate: 100, up: true };
    }
    const rate = ((today - yesterday) / yesterday) * 100;
    return { rate: Math.abs(rate), up: rate >= 0 };
  }

  const fetchDashboardStats = () => {
    fetch(`${SOCKET_URL}/api/dashboard-stats`)
      .then((res) => res.json())
      .then(setDashboardStats)
      .catch(() => setDashboardStats(null));
  };





// 누락된 함수 추가
const closeWordCloud = () => {
  setShowWordCloud(false);
  setSelectedActor(null);
};

  // 실제 차트 데이터 fetch 함수
  const fetchRealChartData = async () => {
    try {
      setChartLoading(true);
      const response = await fetch(`${SOCKET_URL}/api/daily-stats`);
      
      if (!response.ok) {
        throw new Error('서버 응답 오류');
      }
      
      const realData = await response.json();
      
      // API 응답 데이터를 차트 형식에 맞게 변환
      const chartFormattedData = realData.map((item: any) => ({
        date: item.date,
        totalThreats: item.totalThreats, // 누적 전체 위협
        todayThreats: item.todayThreats, // 당일 새로 감지된 위협
        darkwebCount: item.darkwebCount || 0,
        telegramCount: item.telegramCount || 0
      }));
      
      setChartData(chartFormattedData);
    } catch (error) {
      console.error('차트 데이터 로딩 실패:', error);
      setChartData([]);
    } finally {
      setChartLoading(false);
    }
  };

  const toggleChart = () => {
    if (!showChart) {
      fetchRealChartData();
    }
    setShowChart(!showChart);
  };

  useEffect(() => {
    const sock = io(SOCKET_URL);
    
    sock.on("dataChanged", (change) => {
      fetchDashboardStats();
      // if (showChart) {
      //   fetchRealChartData();
      // }
      if (change?.operationType === "insert" && change?.fullDocument) {
        setMessages((prev) => {
          const exists = prev.some(msg => msg.id === change.fullDocument._id);
          if (exists) return prev;
          return [formatSingleMessage(change.fullDocument), ...prev];
        });
      }
    });

    fetchDashboardStats();
    // fetchRealChartData();
  
    return () => {
      sock.disconnect();
    };
  }, []);

  const selectPlatform = (platform: "telegram" | "discord") => {
    setSelectedPlatform(platform);
    setShowNotificationModal(false);
    setShowIdInputModal(true);
    setPlatformId(savedNotifications[platform] || "");
    setSubscribeStatus(null);
  };

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


  useEffect(() => {
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
  }, []);

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
  
  
  


  

  const showWordCloudForCurrentFilter = () => {
    if (monitorActor === null) {
      setSelectedActor("전체 데이터");
    } else {
      setSelectedActor(monitorActor);
    }
    
    // 키워드 추출 시작
    setKeywordLoading(true);
    setExtractionProgress(0);
    setShowWordCloud(true);
    
    // 워커에 메시지 전송
    if (keywordWorker) {
      const filteredData = monitorActor 
        ? messages.filter(msg => msg.threat_actor === monitorActor)
        : messages;
      
      keywordWorker.postMessage({
        type: 'EXTRACT_KEYWORDS',
        data: filteredData.map(msg => msg.content)
      });
    }
  };
  

  // 차트 계산 로직
  const maxValue = chartData.length > 0 ? Math.max(...chartData.map((d) => Math.max(d.totalThreats, d.todayThreats))) : 1;
  const chartWidth = 700;
  const chartHeight = 400;
  const padding = 60;

  const getXPosition = (index: number) => {
    return padding + (index * (chartWidth - padding * 2)) / (chartData.length - 1);
  };

  const getYPosition = (value: number) => {
    return chartHeight - padding - (value / maxValue) * (chartHeight - padding * 2);
  };


  const todayThreatsPath = chartData
    .map((data, index) => {
      const x = getXPosition(index);
      const y = getYPosition(data.todayThreats);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <ThemeProvider defaultTheme="dark" attribute="class">
      <div className={`flex min-h-screen flex-col ${bgMain}`}>
        <header className={`border-b p-4 ${borderHeader}`}>
          <div className="flex items-center justify-between">
            
          <div className="flex items-center gap-3">
              {/* Threat Lens 로고 */}
              <div className="relative">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
                  <div className="relative">
                    {/* 외부 렌즈 링 */}
                    <div className="w-6 h-6 border-2 border-white rounded-full flex items-center justify-center">
                      {/* 내부 눈동자/센서 */}
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    </div>
                    {/* 스캔 라인 효과 */}
                    <div className="absolute -top-1 -left-1 w-8 h-8 border border-white/30 rounded-full animate-ping"></div>
                  </div>
                </div>
                {/* 작은 방패 아이콘 오버레이 */}
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                  <Shield className="h-2.5 w-2.5 text-white" />
                </div>
              </div>

              {/* 사이트 이름 */}
              <div>
                <h1
                  className={`text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent`}
                >
                  Threat Lens
                </h1>
                <p className={`text-xs ${textSub} -mt-1`}>Advanced Threat Intelligence</p>
              </div>
            </div>



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
  <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
    <div
      className={`${isDarkMode ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} border rounded-lg w-full max-w-6xl max-h-[90vh] overflow-auto`}
    >
      <div className="p-6">
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
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <div className={`text-lg ${textSub}`}>실제 데이터를 불러오는 중...</div>
            </div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex justify-center items-center h-96">
            <div className={`text-lg ${textSub}`}>표시할 데이터가 없습니다.</div>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="relative mb-6">
              <svg width={chartWidth} height={chartHeight} className="overflow-visible">
                {/* CSS 애니메이션 정의 */}
                <defs>
                  <style>
                    {`
                      @keyframes drawLine {
                        to {
                          stroke-dashoffset: 0;
                        }
                      }
                      @keyframes fadeIn {
                        to {
                          opacity: 1;
                        }
                      }
                      .tooltip-rect {
                        opacity: 0;
                        transition: opacity 0.2s ease;
                      }
                      .tooltip-rect:hover {
                        opacity: 1;
                      }
                    `}
                  </style>
                </defs>

                {/* 그리드 */}
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
                
                {/* 수평선 */}
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
                
                {/* 수직선 */}
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

                {/* 당일 감지된 위협 영역 (파란색) */}
                <defs>
                  <linearGradient id="todayThreatsGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity="0.3" />
                  </linearGradient>
                </defs>
                <path
                  d={`${todayThreatsPath} L ${getXPosition(chartData.length - 1)} ${chartHeight - padding} L ${padding} ${chartHeight - padding} Z`}
                  fill="url(#todayThreatsGradient)"
                  className="animate-pulse"
                  style={{ animationDuration: "3s", animationDelay: "0.5s" }}
                />

                {/* 당일 감지된 위협 라인 */}
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

                {/* 데이터 포인트 (동그라미) */}
                {chartData.map((data, index) => {
                  const x = getXPosition(index);
                  const y = getYPosition(data.todayThreats);
                  const tooltipId = `tooltip-${index}`;
                  
                  return (
                    <g key={`points-${index}`}>
                      {/* 호버 영역 (투명한 큰 원) */}
                      <circle
                        cx={x}
                        cy={y}
                        r="15"
                        fill="transparent"
                        className="cursor-pointer"
                        onMouseEnter={() => {
                          const tooltip = document.getElementById(tooltipId);
                          if (tooltip) tooltip.style.opacity = '1';
                        }}
                        onMouseLeave={() => {
                          const tooltip = document.getElementById(tooltipId);
                          if (tooltip) tooltip.style.opacity = '0';
                        }}
                      />
                      
                      {/* 실제 데이터 포인트 */}
                      <circle
                        cx={x}
                        cy={y}
                        r="6"
                        fill="#2563eb"
                        stroke="white"
                        strokeWidth="2"
                        className="drop-shadow-sm pointer-events-none"
                        style={{
                          opacity: 0,
                          animation: `fadeIn 0.5s ease-out ${1.5 + index * 0.2}s forwards`,
                        }}
                      />
                      
                      {/* 툴팁 */}
                      <g
                        id={tooltipId}
                        style={{ opacity: 0, transition: 'opacity 0.2s ease' }}
                        className="pointer-events-none"
                      >
                        {/* 툴팁 배경 */}
                        <rect
                          x={x - 50}
                          y={y - 70}
                          width="100"
                          height="50"
                          rx="8"
                          ry="8"
                          fill={isDarkMode ? "#1f2937" : "#ffffff"}
                          stroke={isDarkMode ? "#374151" : "#d1d5db"}
                          strokeWidth="1"
                          className="drop-shadow-lg"
                        />
                        
                        {/* 툴팁 화살표 */}
                        <path
                          d={`M ${x - 6} ${y - 20} L ${x} ${y - 14} L ${x + 6} ${y - 20} Z`}
                          fill={isDarkMode ? "#1f2937" : "#ffffff"}
                          stroke={isDarkMode ? "#374151" : "#d1d5db"}
                          strokeWidth="1"
                        />
                        
                        {/* 툴팁 텍스트 - 날짜 */}
                        <text
                          x={x}
                          y={y - 50}
                          textAnchor="middle"
                          className={`text-xs font-semibold ${isDarkMode ? 'fill-white' : 'fill-gray-900'}`}
                        >
                          {data.date}
                        </text>
                        
                        {/* 툴팁 텍스트 - 위협 수 */}
                        <text
                          x={x}
                          y={y - 35}
                          textAnchor="middle"
                          className={`text-xs ${isDarkMode ? 'fill-blue-400' : 'fill-blue-600'}`}
                        >
                          위협: {data.todayThreats.toLocaleString()}개
                        </text>
                        
                        {/* 추가 정보 (텔레그램/다크웹 분리) */}
                        {(data.telegramCount || data.darkwebCount) && (
                          <text
                            x={x}
                            y={y - 22}
                            textAnchor="middle"
                            className={`text-xs ${isDarkMode ? 'fill-gray-400' : 'fill-gray-600'}`}
                          >
                            {data.telegramCount ? `텔레그램: ${data.telegramCount}` : ''}
                            {data.telegramCount && data.darkwebCount ? ' | ' : ''}
                            {data.darkwebCount ? `다크웹: ${data.darkwebCount}` : ''}
                          </text>
                        )}
                      </g>
                    </g>
                  );
                })}

                {/* X축 라벨 */}
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

                {/* Y축 라벨 */}
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
            </div>
            
            {/* 범례 */}
            <div className="flex gap-8 justify-center">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-600 rounded-full"></div>
                <span className={`text-sm ${textMain}`}>당일 감지된 위협</span>
              </div>
            </div>
            
            {/* 사용법 안내 */}
            <div className={`mt-4 p-3 rounded-lg ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}`}>
              <p className={`text-xs text-center ${textSub}`}>
                💡 각 날짜의 동그라미에 마우스를 올리면 상세 정보를 확인할 수 있습니다
              </p>
            </div>
          </div>
        )}
      </div>
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
              <Card className={sectionCard + " mb-6"} style={{ height: '600px' }}>
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
                            <CardContent className="p-4 h-full flex flex-col">
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
                                      ? "bg-blue-700"
                                      : "bg-blue-700"
                                  } text-white`}
                                >
                                  {item.verified ? "✔️ 검증됨" : item.category }
                                </span>
                                {item.count && (
                                  <span className={textSub}>
                                    {item.count}개 항목
                                  </span>
                                )}
                              </div>
                              <div className={`font-bold mb-1 truncate ${textMain}` }>{item.title}</div>
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

            <section className={`transition-transform duration-500 ease-in-out ${showWordCloud ? "-translate-x-full" : "translate-x-0"}`}>
              <Card className={sectionCard + " mb-6"} style={{ height: '600px' }}>
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
                    <div className="max-h-[400px] overflow-y-auto overflow-x-hidden">
                      {filteredMessages.map((message, index) => {
  const messageTranslation = messageTranslations[message.id];
  const isTranslating = translatingMessages.has(message.id);
  const showOriginal = message.detectedLanguage === 'ko' || message.detectedLanguage === 'unknown';
  
  return (
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
      
      {/* 메시지 내용 */}
      <div className="mb-2">
        <div className={isDarkMode ? "text-white" : "text-gray-900"}>
          {/* 번역된 내용이 있고 표시 중이면 번역된 내용, 아니면 원본 */}
          {messageTranslation?.isTranslated && !showOriginal ? (
            <div>
              <div className="mb-2">{messageTranslation.translatedText}</div>
              <div className="text-xs text-green-400 mb-2">
                ✓ 번역됨 ({languageNames[messageTranslation.sourceLanguage] || messageTranslation.sourceLanguage} → 한국어)
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-gray-400 hover:text-gray-300">
                  원문 보기
                </summary>
                <div className="mt-1 text-gray-500 italic">
                  {message.content}
                </div>
              </details>
            </div>
          ) : (
            <div>
              {message.content}
              {!showOriginal && (
                <span className="ml-2 text-xs text-gray-500">
                  ({languageNames[message.detectedLanguage || "unknown"] || message.detectedLanguage})
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* 메시지 액션 버튼들 */}
      <div className="flex mt-2 gap-2 text-xs text-gray-500">
        <button
          className="flex items-center hover:text-blue-400 transition-colors"
          onClick={() => setMonitorActor(message.threat_actor)}
        >
          <Eye className="mr-1 h-3 w-3" />
          모니터링
        </button>
        <button
          className="flex items-center hover:text-red-400 transition-colors"
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
        
        {/* 번역 버튼 */}
        {!showOriginal && (
          <button
            className="flex items-center hover:text-emerald-400 transition-colors disabled:opacity-50"
            onClick={() => translateMessage(message.id, message.content)}
            disabled={isTranslating}
          >
            {isTranslating ? (
              <>
                <div className="mr-1 h-3 w-3 border border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
                번역 중...
              </>
            ) : messageTranslation?.isTranslated ? (
              <>
                <MessageCircle className="mr-1 h-3 w-3" />
                원문 보기
              </>
            ) : (
              <>
                <MessageCircle className="mr-1 h-3 w-3" />
                번역
              </>
            )}
          </button>
        )}
        
        {/* 번역된 내용이 있을 때 원문/번역 토글 버튼 */}
        {messageTranslation?.isTranslated && (
          <button
            className="flex items-center hover:text-blue-400 transition-colors"
            onClick={() => {
              // 원문과 번역 토글 (이미 번역된 경우)
              const currentTranslation = messageTranslations[message.id];
              setMessageTranslations(prev => ({
                ...prev,
                [message.id]: {
                  ...currentTranslation,
                  isTranslated: !currentTranslation.isTranslated
                }
              }));
            }}
          >
            <ArrowLeft className="mr-1 h-3 w-3" />
            {messageTranslation.isTranslated && !showOriginal ? '원문' : '번역'}
          </button>
        )}
      </div>
    </div>
  );
})}
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>

            {showWordCloud && (
  <section
    className={`absolute top-0 w-1/2 transition-all duration-500 ease-in-out transform ${showWordCloud ? "opacity-100" : "opacity-0"}`} 
    style={{ left: 'calc(50% + 1.5rem)' }}
  >
    <Card className={sectionCard + " mb-6"} style={{ height: '600px' }}>
      <CardContent className="p-6 h-full flex flex-col">
        <div className={`flex items-center justify-between mb-6 pr-2`}>
          <div className="flex items-center gap-3">
            <button 
              onClick={closeWordCloud}
              className={`p-2 rounded-lg transition-colors ${
                isDarkMode 
                  ? "hover:bg-gray-800 text-white" 
                  : "hover:bg-gray-100 text-gray-900"
              }`}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h3 className={`text-xl font-bold ${textMain}`}>{selectedActor || "전체 데이터"}</h3>
          </div>
          <span className={`text-xs ${textSub}`}>알고리즘 키워드 분석</span>
        </div>
        
        {keywordLoading ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p className={`text-lg ${textMain} mb-2`}>TF-IDF 알고리즘 모델로 키워드 분석 중...</p>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${extractionProgress}%` }}
              ></div>
            </div>
            <p className={`text-sm ${textSub}`}>{extractionProgress}% 완료</p>
          </div>
        ) : (
          <div className="relative h-[485px] overflow-auto">
            {wordCloudWords.length > 0 ? (
              <WordCloud
                data={wordCloudWords}
                width={400}
                height={350}
                font="Arial"
                fontStyle="normal"
                fontWeight="bold"
                fontSize={(word) => Math.max(8, Math.min(word.value * 3, 24))}
                spiral="archimedean"
                rotate={() => 0}
                padding={4}
                random={() => 0.5}
                fill={(_d: any, i: number) => {
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
        )}
        
        <div className={`mt-4 p-4 rounded-lg ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}`}>
          <p className={`text-sm ${textSub}`}>
            <strong className={textMain}>{selectedActor || "전체 데이터"}</strong>의 주요 키워드를 
            <span className="text-blue-500 font-semibold"> TF-IDF 알고리즘</span>로 분석한 결과입니다. 
            사이버 보안 관련 키워드는 가중치가 적용됩니다.
          </p>
        </div>
      </CardContent>
    </Card>
  </section>
)}

          </div>
        </main>

        {/* 알림 모달들 */}
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
