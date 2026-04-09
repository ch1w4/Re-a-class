'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';

type ReactionType = 'understood' | 'confused' | 'question' | 'slow' | 'fast';
type Tab = 'reaction' | 'chat' | 'survey' | 'summary';

interface ChatMessage { id: string; content: string; timestamp: string; studentId: string }
interface Reaction { id: string; type: ReactionType; timestamp: string }
interface SurveyOption { id: string; text: string; votes: number }
interface Survey { id: string; question: string; options: SurveyOption[]; isOpen: boolean; createdAt: string }
interface Room {
  id: string; name: string; teacherName: string; createdAt: string; endedAt: string | null;
  chatEnabled: boolean; messages: ChatMessage[]; reactions: Reaction[];
  surveys: Survey[]; summary: string;
}

const REACTION_BUTTONS: { type: ReactionType; label: string; emoji: string; bg: string; active: string }[] = [
  { type: 'understood', label: '理解した',       emoji: '👍', bg: 'bg-green-100 border-green-300 text-green-700',    active: 'bg-green-500 border-green-600 text-white' },
  { type: 'confused',   label: 'わからない',     emoji: '🤔', bg: 'bg-red-100 border-red-300 text-red-700',          active: 'bg-red-500 border-red-600 text-white' },
  { type: 'question',   label: '質問あり',       emoji: '✋', bg: 'bg-yellow-100 border-yellow-300 text-yellow-700', active: 'bg-yellow-500 border-yellow-600 text-white' },
  { type: 'slow',       label: 'もっとゆっくり', emoji: '🐢', bg: 'bg-blue-100 border-blue-300 text-blue-700',       active: 'bg-blue-500 border-blue-600 text-white' },
  { type: 'fast',       label: 'もっと速く',     emoji: '🚀', bg: 'bg-purple-100 border-purple-300 text-purple-700', active: 'bg-purple-500 border-purple-600 text-white' },
];

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: 'reaction', label: 'リアクション', emoji: '👍' },
  { id: 'chat',     label: 'チャット',     emoji: '💬' },
  { id: 'survey',   label: 'アンケート',   emoji: '📊' },
  { id: 'summary',  label: '要約',         emoji: '📝' },
];

function getOrCreateStudentId(roomId: string): string {
  const key = `reaclass_sid_${roomId}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = Math.random().toString(36).slice(2, 10);
  localStorage.setItem(key, id);
  return id;
}

export default function StudentRoom() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('reaction');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sentReaction, setSentReaction] = useState<ReactionType | null>(null);
  const [answeredSurveys, setAnsweredSurveys] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState('');
  const [studentId, setStudentId] = useState('');

  useEffect(() => {
    setStudentId(getOrCreateStudentId(roomId));
  }, [roomId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  const fetchRoom = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${roomId}`);
      if (!res.ok) { setError('ルームが見つかりません'); return; }
      setRoom(await res.json());
    } catch {
      setError('接続エラー');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => { fetchRoom(); }, [fetchRoom]);
  useEffect(() => {
    const iv = setInterval(fetchRoom, 2000);
    return () => clearInterval(iv);
  }, [fetchRoom]);

  useEffect(() => {
    if (tab === 'chat') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room?.messages, tab]);

  const sendReaction = async (type: ReactionType) => {
    if (room?.endedAt) return;
    setSentReaction(type);
    try {
      await fetch(`/api/rooms/${roomId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      showToast('送信しました！');
    } finally {
      setTimeout(() => setSentReaction(null), 1500);
    }
  };

  const sendMessage = async () => {
    if (!message.trim() || sending || !room?.chatEnabled || !studentId || room?.endedAt) return;
    setSending(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message, studentId }),
      });
      if (res.ok) { setMessage(''); fetchRoom(); }
    } finally {
      setSending(false);
    }
  };

  const answerSurvey = async (surveyId: string, optionId: string) => {
    if (answeredSurveys.has(surveyId) || room?.endedAt) return;
    setAnsweredSurveys((prev) => { const next = new Set(prev); next.add(surveyId); return next; });
    await fetch(`/api/rooms/${roomId}/surveys/${surveyId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionId }),
    });
    fetchRoom();
    showToast('回答しました！');
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-500">接続中...</p>
      </div>
    </div>
  );

  if (error || !room) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <p className="text-red-500 text-xl mb-4">{error || 'ルームが見つかりません'}</p>
        <button onClick={() => router.push('/')} className="text-blue-600 hover:underline">トップへ戻る</button>
      </div>
    </div>
  );

  const isEnded = !!room.endedAt;
  const myMessages = room.messages.filter((m) => m.studentId === studentId);
  const openSurveys = room.surveys.filter((s) => s.isOpen);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <header className={`text-white px-5 py-4 shadow-lg ${isEnded ? 'bg-gray-600' : 'bg-teal-600'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold text-lg">Re:a Class</h1>
            <p className="text-teal-200 text-xs">{isEnded ? '授業終了' : '生徒モード'}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">{room.name}</p>
            <p className="text-teal-200 text-xs">{room.teacherName} 先生</p>
          </div>
        </div>
      </header>

      {/* 終了バナー */}
      {isEnded && (
        <div className="bg-gray-100 border-b border-gray-200 text-center py-3 px-4">
          <p className="text-gray-600 font-semibold text-sm">この授業は終了しました</p>
          <p className="text-gray-400 text-xs mt-0.5">
            {new Date(room.endedAt!).toLocaleString('ja-JP')} に終了
          </p>
        </div>
      )}

      {/* Tab Bar */}
      <div className="bg-white border-b border-gray-200 flex">
        {TABS.map((t) => {
          const hasBadge = t.id === 'survey' && openSurveys.length > 0 && !openSurveys.every((s) => answeredSurveys.has(s.id)) && !isEnded;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-3 text-xs font-semibold transition-all relative ${
                tab === t.id ? 'text-teal-600 border-b-2 border-teal-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <span className="block text-lg leading-none mb-0.5">{t.emoji}</span>
              {t.label}
              {hasBadge && <span className="absolute top-1 right-2 w-2 h-2 bg-red-500 rounded-full"></span>}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">

        {/* REACTION TAB */}
        {tab === 'reaction' && (
          <div>
            {isEnded ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">🏁</div>
                <p className="text-gray-500 font-semibold">授業は終了しました</p>
                <p className="text-gray-400 text-sm mt-2">リアクションの送信は締め切られました</p>
              </div>
            ) : (
              <>
                <p className="text-center text-gray-500 text-sm mb-5">今の授業についてリアクションを送ろう！</p>
                <div className="grid grid-cols-2 gap-3">
                  {REACTION_BUTTONS.map((btn) => (
                    <button
                      key={btn.type}
                      onClick={() => sendReaction(btn.type)}
                      className={`border-2 rounded-2xl p-5 flex flex-col items-center gap-2 font-semibold text-sm transition-all active:scale-95 ${
                        sentReaction === btn.type ? btn.active : btn.bg
                      } ${btn.type === 'understood' ? 'col-span-2' : ''}`}
                    >
                      <span className="text-4xl">{btn.emoji}</span>
                      <span>{btn.label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-center text-xs text-gray-400 mt-6">何度でも送れます。匿名で先生に届きます。</p>
              </>
            )}
          </div>
        )}

        {/* CHAT TAB */}
        {tab === 'chat' && (
          <div className="flex flex-col h-full">
            {isEnded ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">🔒</div>
                <p className="text-gray-500 font-semibold">チャットは終了しました</p>
              </div>
            ) : !room.chatEnabled ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">🔒</div>
                <p className="text-gray-500 font-semibold">チャットは閉鎖中です</p>
                <p className="text-gray-400 text-sm mt-2">先生がチャットを開放すると投稿できます</p>
              </div>
            ) : (
              <>
                <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 mb-4 text-xs text-teal-700">
                  💬 メッセージは<span className="font-bold">先生だけ</span>に届きます。他の生徒には見えません。
                </div>

                <div className="space-y-2 mb-4 min-h-40">
                  {myMessages.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-400 text-sm">まだメッセージを送っていません</p>
                      <p className="text-gray-300 text-xs mt-1">質問や感想を気軽に送ってみよう</p>
                    </div>
                  ) : (
                    myMessages.map((m) => (
                      <div key={m.id} className="flex justify-end">
                        <div className="bg-teal-500 text-white rounded-2xl rounded-br-sm px-4 py-3 max-w-xs shadow-sm">
                          <p className="text-sm">{m.content}</p>
                          <p className="text-xs text-teal-200 mt-1 text-right">
                            {new Date(m.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="flex gap-2 sticky bottom-0 bg-gray-50 py-2">
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="先生へのメッセージ..."
                    className="flex-1 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!message.trim() || sending}
                    className="bg-teal-500 text-white rounded-2xl px-4 py-3 font-semibold disabled:opacity-50 hover:bg-teal-600 transition"
                  >
                    送信
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* SURVEY TAB */}
        {tab === 'survey' && (
          <div className="space-y-4">
            {room.surveys.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">📊</div>
                <p className="text-gray-500 font-semibold">アンケートなし</p>
                <p className="text-gray-400 text-sm mt-2">先生がアンケートを作成すると表示されます</p>
              </div>
            ) : (
              [...room.surveys].reverse().map((survey) => {
                const answered = answeredSurveys.has(survey.id);
                const total = survey.options.reduce((sum, o) => sum + o.votes, 0);
                return (
                  <div key={survey.id}
                    className={`bg-white rounded-2xl p-5 shadow-sm border ${survey.isOpen && !isEnded ? 'border-orange-200' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      {survey.isOpen && !isEnded
                        ? <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">受付中</span>
                        : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold">終了</span>
                      }
                    </div>
                    <p className="font-semibold text-gray-800 mb-3">{survey.question}</p>
                    {survey.isOpen && !answered && !isEnded ? (
                      <div className="space-y-2">
                        {survey.options.map((opt) => (
                          <button key={opt.id} onClick={() => answerSurvey(survey.id, opt.id)}
                            className="w-full text-left border-2 border-orange-200 rounded-xl px-4 py-3 text-sm font-semibold text-orange-700 hover:bg-orange-50 active:bg-orange-100 transition">
                            {opt.text}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {answered && survey.isOpen && !isEnded && <p className="text-xs text-teal-600 font-semibold mb-2">✓ 回答済み</p>}
                        {survey.options.map((opt) => {
                          const pct = total > 0 ? Math.round((opt.votes / total) * 100) : 0;
                          return (
                            <div key={opt.id}>
                              <div className="flex justify-between text-xs text-gray-600 mb-1">
                                <span>{opt.text}</span>
                                <span>{opt.votes}票 ({pct}%)</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-2.5">
                                <div className="bg-orange-400 h-2.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }}></div>
                              </div>
                            </div>
                          );
                        })}
                        <p className="text-xs text-gray-400">合計: {total}票</p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* SUMMARY TAB */}
        {tab === 'summary' && (
          <div>
            {room.summary ? (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h2 className="text-base font-bold text-gray-700 mb-3">授業要約</h2>
                <pre className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{room.summary}</pre>
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">📝</div>
                <p className="text-gray-500 font-semibold">要約はまだありません</p>
                <p className="text-gray-400 text-sm mt-2">先生が要約を生成すると表示されます</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
