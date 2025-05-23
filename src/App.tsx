import { useState, useEffect } from "react";
import io from "socket.io-client";
import {
  ArrowUp,
  ArrowDown,
  Clock,
  Eye,
  Shield,
  Languages,
  Settings,
  X,
} from "lucide-react";
import { Card, CardContent } from "./components/ui/card";
import { ThemeProvider } from "./components/theme-provider";
import "./index.css";
import TimeAgo from "react-timeago";

const SOCKET_URL = "https://dark-web-6squ.onrender.com";
// const SOCKET_URL = "http://localhost:4000";

// 카테고리 코드 → 한글명/타입명 매핑
const CATEGORY_LABELS: Record<string, string> = {
  SiteA_SingleDetailView: "data leak",
  SiteB_CardListView: "abyss data",
};

function getCategoryLabel(code: string) {
  return CATEGORY_LABELS[code] || code;
}

// 언어 감지 함수
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
  // 다크웹 데이터 상태
  const [darkwebItems, setDarkwebItems] = useState<DarkwebItem[]>([]);
  const [darkwebLoading, setDarkwebLoading] = useState(true);
  const [darkwebError, setDarkwebError] = useState<string | null>(null);
  const [darkwebCategory, setDarkwebCategory] = useState<string | null>(null);

  // 번역 관련 상태
  const [autoTranslateSettings, setAutoTranslateSettings] = useState<{
    enabled: boolean;
    languages: Record<string, boolean>;
  }>({
    enabled: false,
    languages: {
      en: false,
      ru: true,
      de: true,
      fr: true,
      es: true,
      it: true,
      zh: true,
      ja: false,
      ko: false,
    },
  });
  const [showSettings, setShowSettings] = useState(false);

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

  // 날짜 포맷팅 함수
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

  const extractChannelName = (url: string): string => {
    if (!url) return "unknown";
    try {
      const match = url.match(/t\.me\/([^/]+)/);
      return match ? match[1] : "unknown";
    } catch (e) {
      return "unknown";
    }
  };

  // 행위공격자 목록(중복제거)
  const actorList = Array.from(
    new Set(messages.map((msg) => msg.threat_actor))
  ).filter(Boolean);

  // 메시지 필터링: 차단된 행위공격자 메시지는 항상 숨김
  const filteredMessages = monitorActor
    ? messages.filter(
        (msg) =>
          msg.threat_actor === monitorActor &&
          !blockedActors.includes(msg.threat_actor)
      )
    : messages.filter((msg) => !blockedActors.includes(msg.threat_actor));

  // 다크웹 카테고리 목록 추출
  const darkwebCategories = Array.from(
    new Set(darkwebItems.map((item) => item.category))
  ).filter(Boolean);

  // 카테고리별 필터링
  const filteredDarkwebItems =
    darkwebCategory && darkwebCategory !== "전체 보기"
      ? darkwebItems.filter((item) => item.category === darkwebCategory)
      : darkwebItems;

  // 번역 토글
  const toggleTranslation = (id: string) => {
    setMessages((prevMessages) =>
      prevMessages.map((msg) =>
        msg.id === id
          ? {
              ...msg,
              showTranslation: !msg.showTranslation,
              isTranslated: true,
              content: msg.showTranslation
                ? msg.originalContent
                : msg.translatedContent || "번역 결과 없음",
            }
          : msg
      )
    );
  };

  // 전체 번역
  const translateAll = () => {
    setMessages((prevMessages) =>
      prevMessages.map((msg) => ({
        ...msg,
        showTranslation: true,
        isTranslated: true,
        content: msg.translatedContent || "번역 결과 없음",
      }))
    );
  };

  // 자동 번역 적용
  useEffect(() => {
    if (autoTranslateSettings.enabled) {
      setMessages((prevMessages) =>
        prevMessages.map((msg) => {
          if (
            autoTranslateSettings.languages[msg.detectedLanguage || "unknown"] &&
            msg.detectedLanguage !== "ko" &&
            !msg.showTranslation
          ) {
            return {
              ...msg,
              content: msg.translatedContent || "번역 결과 없음",
              showTranslation: true,
              isTranslated: true,
            };
          }
          return msg;
        })
      );
    }
  }, [autoTranslateSettings]);

  // 자동 번역 설정 토글
  const toggleAutoTranslate = () => {
    setAutoTranslateSettings((prev) => ({
      ...prev,
      enabled: !prev.enabled,
    }));
  };

  // 특정 언어 자동 번역 설정 토글
  const toggleLanguageTranslate = (language: string) => {
    setAutoTranslateSettings((prev) => ({
      ...prev,
      languages: {
        ...prev.languages,
        [language]: !prev.languages[language],
      },
    }));
  };

  return (
    <ThemeProvider defaultTheme="dark" attribute="class">
      
      <div className="flex min-h-screen flex-col bg-black text-white">
        <header className="border-b border-gray-800 p-4">
          <h1 className="text-2xl font-bold">Untitle</h1>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-purple-900 border-none text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium opacity-70">감지된 위협</p>
                    <h2 className="text-3xl font-bold">12.7K</h2>
                  </div>
                  <div className="flex items-center text-green-400">
                    <ArrowUp className="h-4 w-4 mr-1" />
                    <span className="text-xs">+16%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-purple-700 border-none text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium opacity-70">위험 지수</p>
                    <h2 className="text-3xl font-bold">38%</h2>
                  </div>
                  <div className="flex items-center text-red-400">
                    <ArrowDown className="h-4 w-4 mr-1" />
                    <span className="text-xs">-4%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-blue-900 border-none text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium opacity-70">모니터링 채널</p>
                    <h2 className="text-3xl font-bold">73</h2>
                  </div>
                  <div className="flex items-center text-green-400">
                    <ArrowUp className="h-4 w-4 mr-1" />
                    <span className="text-xs">+5</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-emerald-800 border-none text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium opacity-70">데이터 포인트</p>
                    <h2 className="text-3xl font-bold">9M</h2>
                  </div>
                  <div className="flex items-center text-green-400">
                    <ArrowUp className="h-4 w-4 mr-1" />
                    <span className="text-xs">+23%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* 왼쪽: 다크웹 데이터 카드 */}
            <section>
              <Card className="border-gray-800 bg-gray-950 mb-6">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">다크웹 데이터 목록</h2>
                    <span className="text-xs text-gray-400">
                      {filteredDarkwebItems.length}개 항목
                    </span>
                  </div>
                  {/* 카테고리 필터 버튼 */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    <button
                      className={`text-xs px-2 py-1 rounded ${
                        !darkwebCategory || darkwebCategory === "전체 보기"
                          ? "bg-blue-700 text-white"
                          : "bg-gray-800 text-gray-300"
                      }`}
                      onClick={() => setDarkwebCategory("전체 보기")}
                    >
                      전체 보기
                    </button>
                    {darkwebCategories.map((cat) => (
                      <button
                        key={cat}
                        className={`text-xs px-2 py-1 rounded ${
                          darkwebCategory === cat
                            ? "bg-blue-700 text-white"
                            : "bg-gray-800 text-gray-300"
                        }`}
                        onClick={() => setDarkwebCategory(cat)}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  {darkwebLoading ? (
                    <div className="text-gray-400">로딩 중...</div>
                  ) : darkwebError ? (
                    <div className="text-red-400">{darkwebError}</div>
                  ) : (
                    // ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼ 내부 스크롤 적용 ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
                    <div className="max-h-[400px] overflow-y-auto overflow-x-hidden">
                      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
                        {filteredDarkwebItems.map((item) => (
                          <Card
                            key={item._id}
                            className="bg-gray-900 border-none text-white"
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
                                      : "bg-gray-700"
                                  } text-white`}
                                >
                                  {item.verified ? "✔️ 검증됨" : item.category}
                                </span>
                                {item.count && (
                                  <span className="text-xs text-gray-300">
                                    {item.count}개 항목
                                  </span>
                                )}
                              </div>
                              <div className="font-bold mb-1 truncate">
                                {item.title}
                              </div>
                              <div className="text-xs text-gray-400 mb-1">
                                {item.description}
                              </div>
                              {item.site && (
                                <div className="text-xs text-gray-400 mb-1">
                                  {item.category}
                                </div>
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
                              <div className="mt-2">
                                <button className="text-xs text-blue-400 underline">
                                  상세 정보
                                </button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                    // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲ 내부 스크롤 적용 ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
                  )}
                </CardContent>
              </Card>
            </section>
            {/* 오른쪽: 텔레그램 위험 정보 카드 */}
            <section>
              <Card className="border-gray-800 bg-gray-950 mb-6">
                <CardContent className="p-0">
                  <div className="flex items-center justify-between border-b border-gray-800 p-4">
                    <h3 className="text-xl font-bold">텔레그램 위험 정보</h3>
                    <div className="flex items-center gap-2">
                      <button
                        className="flex items-center text-sm text-blue-400 bg-blue-900/30 rounded px-2 py-1 hover:bg-blue-900/50"
                        onClick={translateAll}
                      >
                        <Languages className="mr-1 h-4 w-4" />
                        <span>전체 번역</span>
                      </button>
                      <button
                        className={`flex items-center text-sm ${
                          autoTranslateSettings.enabled
                            ? "text-green-400 bg-green-900/30 hover:bg-green-900/50"
                            : "text-gray-400 bg-gray-800 hover:bg-gray-700"
                        } rounded px-2 py-1`}
                        onClick={() => setShowSettings(true)}
                      >
                        <Settings className="mr-1 h-4 w-4" />
                        <span>번역 설정</span>
                      </button>
                      <div className="flex items-center text-sm text-gray-400">
                        <Clock className="mr-1 h-4 w-4" />
                        <span>실시간</span>
                      </div>
                    </div>
                  </div>
                  {/* 행위공격자별 모니터링/차단 태그 */}
                  <div className="flex flex-wrap gap-2 p-4 border-b border-gray-800">
                    <button
                      className={`text-xs px-2 py-1 rounded ${
                        monitorActor === null
                          ? "bg-blue-700 text-white"
                          : "bg-gray-800 text-gray-300"
                      }`}
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
                              ? "bg-blue-700 text-white"
                              : "bg-gray-800 text-gray-300"
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
                  {/* 자동 번역 상태 표시 */}
                  {autoTranslateSettings.enabled && (
                    <div className="bg-green-900/20 border-b border-green-900/50 px-4 py-2 flex items-center justify-between">
                      <div className="flex items-center text-green-400 text-sm">
                        <Languages className="mr-2 h-4 w-4" />
                        <span>자동 번역 활성화됨</span>
                      </div>
                      <div className="text-xs text-gray-400">
                        {Object.entries(autoTranslateSettings.languages)
                          .filter(([_, isEnabled]) => isEnabled)
                          .map(([lang]) => languageNames[lang])
                          .join(", ")}
                      </div>
                    </div>
                  )}
                  {loading ? (
                    <div className="flex justify-center items-center h-[200px]">
                      <p className="text-gray-400">데이터 로딩 중...</p>
                    </div>
                  ) : error ? (
                    <div className="flex justify-center items-center h-[200px]">
                      <p className="text-red-400">{error}</p>
                    </div>
                  ) : (
                    <div className="max-h-[400px] overflow-y-auto">
                      {filteredMessages.map((message, index) => (
                        <div
                          key={message.id || index}
                          className={`border-b border-gray-800 p-4 ${
                            index === 0 ? "bg-blue-950/20" : ""
                          }`}
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
                            <div>
                              {message.content}
                              {message.showTranslation && (
                                <span className="ml-2 text-xs text-green-400">
                                  (번역됨)
                                </span>
                              )}
                              {!message.showTranslation &&
                                message.detectedLanguage !== "ko" &&
                                message.detectedLanguage !== "en" && (
                                  <span className="ml-2 text-xs text-gray-500">
                                    (
                                    {languageNames[
                                      message.detectedLanguage || "unknown"
                                    ] || message.detectedLanguage}
                                    )
                                  </span>
                                )}
                            </div>
                            {message.channel && (
                              <div className="mt-2 text-xs text-blue-400 break-all">
                                채널:{" "}
                                <a
                                  href={message.channel}
                                  className="hover:underline"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  https://t.me/
                                  {extractChannelName(message.channel)}
                                </a>
                              </div>
                            )}
                            {expandedMessages[message.id || index] && (
                              <div className="mt-2 text-xs text-gray-400">
                                <div>메시지ID: {message.messageId}</div>
                                <div>날짜: {message.rawDate}</div>
                                <div>ID: {message.uniqueId}</div>
                              </div>
                            )}
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
                              className={`flex items-center ${
                                message.showTranslation ? "text-green-400" : ""
                              }`}
                              onClick={() => toggleTranslation(message.id)}
                            >
                              <Languages className="mr-1 h-3 w-3" />
                              번역
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
        {/* 자동 번역 설정 모달 (생략) */}
        {showSettings && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            {/* ...생략... */}
          </div>
        )}
      </div>
    </ThemeProvider>
  );
}

export default App;
