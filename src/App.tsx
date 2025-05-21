import { useState, useEffect } from "react";
import io from "socket.io-client";
import {
  ArrowUp,
  ArrowDown,
  Clock,
  Eye,
  Shield,
} from "lucide-react";
import { Card, CardContent } from "./components/ui/card";
import { ThemeProvider } from "./components/theme-provider";
import "./index.css";
import TimeAgo from 'react-timeago';

 const SOCKET_URL ="https://dark-web-6squ.onrender.com"
// const SOCKET_URL = "http://localhost:4000"; // 서버 주소

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
};

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<Record<string | number, boolean>>({});
  const [monitorActor, setMonitorActor] = useState<string | null>(null); // 모니터링 중인 행위공격자
  const [blockedActors, setBlockedActors] = useState<string[]>([]); // 차단된 행위공격자 목록

  // 더보기 토글 함수
  const toggleExpand = (id: string | number) => {
    setExpandedMessages((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // 최초 데이터 로드 및 소켓 연결
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

  // 메시지 포맷터
  const formatMessages = (data: any[]): Message[] => data.map(formatSingleMessage);

  function formatSingleMessage(item: any): Message {
    return {
      id: item._id,
      content: item.text || "내용 없음",
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

  // 텔레그램 링크 추출 함수
  const extractTelegramLink = (text: string): string | null => {
    if (!text) return null;
    const match = text.match(/https?:\/\/t\.me\/[^\s]+/);
    return match ? match[0] : null;
  };

  // 채널명 추출 함수
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
                    <p className="text-sm font-medium opacity-70">
                      감지된 위협
                    </p>
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
                    <p className="text-sm font-medium opacity-70">
                      모니터링 채널
                    </p>
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
                    <p className="text-sm font-medium opacity-70">
                      데이터 포인트
                    </p>
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

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <Card className="border-gray-800 bg-gray-950">
              <CardContent className="p-6">
                <h3 className="text-xl font-bold mb-4">활동 추이</h3>
                <div className="h-[200px] w-full">
                  {/* Activity chart would go here */}
                  <div className="h-full w-full bg-gradient-to-b from-purple-900/20 to-transparent rounded-md flex items-end">
                    <div className="h-[30%] w-[10%] bg-purple-700 rounded-sm mx-1"></div>
                    <div className="h-[50%] w-[10%] bg-purple-700 rounded-sm mx-1"></div>
                    <div className="h-[40%] w-[10%] bg-purple-700 rounded-sm mx-1"></div>
                    <div className="h-[70%] w-[10%] bg-purple-700 rounded-sm mx-1"></div>
                    <div className="h-[60%] w-[10%] bg-purple-700 rounded-sm mx-1"></div>
                    <div className="h-[80%] w-[10%] bg-purple-700 rounded-sm mx-1"></div>
                    <div className="h-[90%] w-[10%] bg-purple-700 rounded-sm mx-1"></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 텔레그램 위험 정보 섹션 */}
            <Card className="border-gray-800 bg-gray-950">
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b border-gray-800 p-4">
                  <h3 className="text-xl font-bold">텔레그램 위험 정보</h3>
                  <div className="flex items-center text-sm text-gray-400">
                    <Clock className="mr-1 h-4 w-4" />
                    <span>실시간</span>
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
                            // 차단 해제
                            setBlockedActors(prev => prev.filter(a => a !== actor));
                          } else {
                            // 모니터링만 활성화
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
                          <div>{message.content}</div>
                          {/* 번역 버튼 및 결과 */}

                          {message.channel && (
                            <div className="mt-2 text-xs text-blue-400 break-all">
                              채널:{" "}
                              <a
                                href={message.channel}
                                className="hover:underline"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                https://t.me/{extractChannelName(message.channel)}
                              </a>
                            </div>
                          )}

                          {/* 더보기 클릭 시 나타나는 상세 정보 */}
                          {expandedMessages[message.id || index] && (
                            <div className="mt-2 text-xs text-gray-400">
                              <div>메시지ID: {message.messageId}</div>
                              <div>날짜: {message.rawDate}</div>
                              <div>ID: {message.uniqueId}</div>
                            </div>
                          )}
                        </div>

                        {/* 더보기 버튼 */}
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
                            onClick={() => setMonitorActor(message.threat_actor)}
                          >
                            <Eye className="mr-1 h-3 w-3" />
                            모니터링
                          </button>
                          <button
                            className="flex items-center"
                            onClick={() =>
                              setBlockedActors(prev =>
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
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}

export default App;
