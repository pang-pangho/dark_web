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
} from "lucide-react";
import { Card, CardContent } from "./components/ui/card";
import { ThemeProvider } from "./components/theme-provider";
import "./index.css";
import TimeAgo from "react-timeago";

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
  function getChangeRate(today: number, yesterday: number): {rate: number, up: boolean} {
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
    fetchDashboardStats();
  }, []);

  // 소켓 연결 및 실시간 대시보드 갱신
  useEffect(() => {
    const sock = io(SOCKET_URL);
    sock.on("dataChanged", () => {
      fetchDashboardStats();
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

    const sock = io(SOCKET_URL);

    sock.on("dataChanged", (change: any) => {
      if (change.operationType === "insert" && change.fullDocument) {
        setMessages((prev) => [
          formatSingleMessage(change.fullDocument),
          ...prev,
        ]);
      }
    });

    return () => {
      sock.disconnect();
    };
  }, []);

  // 다크웹 데이터 불러오기
  useEffect(() => {
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

  return (
    <ThemeProvider defaultTheme="dark" attribute="class">
      <div className={`flex min-h-screen flex-col ${bgMain}`}>
        <header className={`border-b p-4 ${borderHeader}`}>
          <div className="flex items-center justify-between">
            <h1 className={`text-2xl font-bold ${textMain}`}>Untitle</h1>
            <div className="flex items-center gap-3">
              {/* 테마 토글 버튼 */}
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
        <main className="flex-1 p-4 md:p-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {/* 전체 감지된 위협 */}
            <Card className={card1}>
              <CardContent className="p-6">
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
            {/* 금일 감지된 위협 */}
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
          <div className="grid gap-6 md:grid-cols-2">
            {/* 왼쪽: 다크웹 데이터 카드 */}
            <section>
              <Card className={sectionCard + " mb-6"}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className={`text-xl font-bold ${textMain}`}>다크웹 데이터 목록</h2>
                    <span className={`text-xs ${textSub}`}>
                      {filteredDarkwebItems.length}개 항목
                    </span>
                  </div>
                  {/* 카테고리 필터 버튼 */}
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
                            <CardContent className="p-4">
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
            {/* 오른쪽: 텔레그램 위험 정보 카드 */}
            <section>
              <Card className={sectionCard + " mb-6"}>
                <CardContent className="p-0">
                  <div className={`flex items-center justify-between border-b p-4 ${borderB}`}>
                    <h3 className={`text-xl font-bold ${textMain}`}>텔레그램 위험 정보</h3>
                    <div className="flex items-center gap-2">
                      <div className={`flex items-center text-sm ${textSub}`}>
                        <Clock className="mr-1 h-4 w-4" />
                        <span>실시간</span>
                      </div>
                    </div>
                  </div>
                  {/* 행위공격자별 모니터링/차단 태그 */}
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
                          className={`text-xs px-2 py-1 rounded ${
                            isBlocked
                              ? "bg-red-700 text-white"
                              : isMonitored
                              ? filterBtnActive
                              : filterBtn
                          }`}
                          onClick={() => {
                            if (isBlocked) {
                              setBlockedActors((prev) =>
                                prev.filter((a) => a !== actor)
                              );
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
                          {/* 메시지 헤더 부분 */}
                          <div className="flex items-center justify-between mb-2">
                            <span className="bg-red-900 text-white text-xs px-2 py-0.5 rounded mr-2">
                              {message.threat_actor}
                            </span>
                            <span className="text-xs text-gray-300">
                              <TimeAgo date={message.rawDate} />
                            </span>
                          </div>
                          {/* 메시지 본문 */}
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
  {/* ... */}
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
                          {/* 하단 액션 버튼 영역 */}
                          <div className="flex mt-2 gap-2 text-xs text-gray-500">
                            <button
                              className="flex items-center"
                              onClick={() =>
                                setMonitorActor(message.threat_actor)
                              }
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
          </div>
        </main>
        {/* 이하 알림 모달 등 기존 코드 동일 */}
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
                  {/* 텔레그램 버튼 */}
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
                  {/* 디스코드 버튼 */}
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
        {/* 아이디 입력 모달 */}
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
