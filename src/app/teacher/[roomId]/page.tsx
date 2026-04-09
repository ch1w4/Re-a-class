'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';

type ReactionType = 'understood' | 'confused' | 'question' | 'slow' | 'fast';

interface ChatMessage { id: string; content: string; timestamp: string; studentId: string }
interface Reaction { id: string; type: ReactionType; timestamp: string }
interface SurveyOption { id: string; text: string; votes: number }
interface Survey { id: string; question: string; options: SurveyOption[]; isOpen: boolean; createdAt: string }
interface Room {
  id: string; name: string; teacherName: string; createdAt: string; endedAt: string | null;
  chatEnabled: boolean; messages: ChatMessage[]; reactions: Reaction[];
  surveys: Survey[]; notes: string; transcript: string; summary: string;
}

const REACTION_INFO: Record<ReactionType, { label: string; emoji: string; bar: string }> = {
  understood: { label: '理解した',      emoji: '👍', bar: 'bg-green-400' },
  confused:   { label: 'わからない',    emoji: '🤔', bar: 'bg-red-400' },
  question:   { label: '質問あり',      emoji: '✋', bar: 'bg-yellow-400' },
  slow:       { label: 'もっとゆっくり', emoji: '🐢', bar: 'bg-blue-400' },
  fast:       { label: 'もっと速く',    emoji: '🚀', bar: 'bg-purple-400' },
};
const REACTION_TYPES = Object.keys(REACTION_INFO) as ReactionType[];

export default function TeacherRoom() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;

  const [room, setRoom] = useState<Room | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [studentUrl, setStudentUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [copied, setCopied] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  // 録音
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Survey form state
  const [showSurveyForm, setShowSurveyForm] = useState(false);
  const [surveyQuestion, setSurveyQuestion] = useState('');
  const [surveyOptions, setSurveyOptions] = useState(['', '']);

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

  // notes / transcript はポーリングで上書きしないよう初回のみセット
  const initialized = useRef(false);
  useEffect(() => {
    if (room && !initialized.current) {
      setNotes(room.notes ?? '');
      setTranscript(room.transcript ?? '');
      initialized.current = true;
    }
  }, [room]);

  useEffect(() => {
    fetchRoom();
    fetch(`/api/rooms/${roomId}/qr`).then((r) => r.json()).then((d) => {
      setQrDataUrl(d.qr);
      setStudentUrl(d.url);
    }).catch(() => {});
  }, [roomId, fetchRoom]);

  useEffect(() => {
    const iv = setInterval(fetchRoom, 2000);
    return () => clearInterval(iv);
  }, [fetchRoom]);

  const toggleChat = async () => {
    await fetch(`/api/rooms/${roomId}/chat/toggle`, { method: 'POST' });
    fetchRoom();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      const mr = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        await uploadAudio(blob, mimeType);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch {
      alert('マイクへのアクセスが拒否されました');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const uploadAudio = async (blob: Blob, mimeType: string) => {
    setTranscribing(true);
    try {
      const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
      const file = new File([blob], `audio.${ext}`, { type: mimeType });
      const form = new FormData();
      form.append('audio', file);
      const res = await fetch(`/api/rooms/${roomId}/transcribe`, { method: 'POST', body: form });
      if (res.ok) {
        const data = await res.json();
        setTranscript(data.transcript);
      } else {
        alert('書き起こしに失敗しました');
      }
    } finally {
      setTranscribing(false);
    }
  };

  const saveNotes = async () => {
    setNotesSaving(true);
    try {
      await fetch(`/api/rooms/${roomId}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } finally {
      setNotesSaving(false);
    }
  };

  const endClass = async () => {
    await fetch(`/api/rooms/${roomId}`, { method: 'DELETE' });
    setEndConfirm(false);
    fetchRoom();
  };

  const createSurvey = async () => {
    const opts = surveyOptions.filter((o) => o.trim());
    if (!surveyQuestion.trim() || opts.length < 2) return;
    await fetch(`/api/rooms/${roomId}/surveys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: surveyQuestion, options: opts }),
    });
    setSurveyQuestion(''); setSurveyOptions(['', '']); setShowSurveyForm(false);
    fetchRoom();
  };

  const closeSurvey = async (surveyId: string) => {
    await fetch(`/api/rooms/${roomId}/surveys/${surveyId}/close`, { method: 'POST' });
    fetchRoom();
  };

  const generateSummary = async () => {
    setGeneratingSummary(true);
    try {
      await fetch(`/api/rooms/${roomId}/summary`, { method: 'POST' });
      fetchRoom();
    } finally {
      setGeneratingSummary(false);
    }
  };

  const downloadSummary = () => {
    if (!room?.summary) return;
    const blob = new Blob([room.summary], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${room.name}_summary.md`; a.click();
    URL.revokeObjectURL(url);
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-500">読み込み中...</p>
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
  const counts = room.reactions.reduce<Record<string, number>>((acc, r) => {
    acc[r.type] = (acc[r.type] ?? 0) + 1; return acc;
  }, {});
  const totalReactions = room.reactions.length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 終了確認モーダル */}
      {endConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-gray-800 mb-2">授業を終了しますか？</h3>
            <p className="text-sm text-gray-500 mb-5">
              終了後は生徒からのリアクション・チャット・アンケート回答を受け付けなくなります。
            </p>
            <div className="flex gap-3">
              <button onClick={() => setEndConfirm(false)}
                className="flex-1 py-2 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50 transition font-semibold">
                キャンセル
              </button>
              <button onClick={endClass}
                className="flex-1 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition font-semibold">
                終了する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={`text-white px-6 py-4 shadow-lg sticky top-0 z-10 ${isEnded ? 'bg-gray-600' : 'bg-blue-700'}`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold">Re:a Class</span>
            <span className="bg-white/20 text-white text-xs px-2 py-1 rounded-lg">教師</span>
            {isEnded && (
              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-lg font-bold">授業終了</span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {!isEnded && (
              <button
                onClick={() => setEndConfirm(true)}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition"
              >
                授業終了
              </button>
            )}
            <div className="text-right">
              <p className="font-semibold">{room.name}</p>
              <p className="text-blue-200 text-sm">担当: {room.teacherName}</p>
            </div>
          </div>
        </div>
      </header>

      {/* 終了バナー */}
      {isEnded && (
        <div className="bg-gray-700 text-white text-center py-2 text-sm">
          授業は {new Date(room.endedAt!).toLocaleString('ja-JP')} に終了しました。閲覧専用モードです。
        </div>
      )}

      <div className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ===== LEFT COLUMN ===== */}
        <div className="space-y-4">

          {/* QR Code */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center">
            <h2 className="text-base font-bold text-gray-700 mb-3">生徒参加用 QRコード</h2>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR Code" className={`mx-auto mb-3 rounded-xl ${isEnded ? 'opacity-40 grayscale' : ''}`} width={200} height={200} />
            ) : (
              <div className="w-48 h-48 bg-gray-100 rounded-xl mx-auto mb-3 flex items-center justify-center">
                <span className="text-gray-400 text-sm">生成中...</span>
              </div>
            )}
            <button
              onClick={copyRoomId}
              className="w-full bg-gray-100 hover:bg-gray-200 rounded-xl px-3 py-2 text-sm font-mono text-gray-700 transition flex items-center justify-center gap-2"
            >
              <span>ルームID: {room.id}</span>
              <span className="text-xs text-blue-500">{copied ? '✓ コピー済み' : 'コピー'}</span>
            </button>
            {studentUrl && !isEnded && (
              <a href={studentUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-600 break-all mt-2 block">
                {studentUrl}
              </a>
            )}
          </div>

          {/* Stats */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h2 className="text-base font-bold text-gray-700 mb-3">統計</h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'リアクション', value: totalReactions, color: 'text-blue-600' },
                { label: 'チャット', value: room.messages.length, color: 'text-teal-600' },
                { label: 'アンケート', value: room.surveys.length, color: 'text-orange-500' },
              ].map((s) => (
                <div key={s.label} className="text-center bg-gray-50 rounded-xl p-3">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Audio Recording */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h2 className="text-base font-bold text-gray-700 mb-3">授業録音</h2>
            <div className="flex gap-2 mb-3">
              {!recording ? (
                <button
                  onClick={startRecording}
                  disabled={isEnded || transcribing}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span className="w-3 h-3 rounded-full bg-white inline-block"></span>
                  録音開始
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-800 text-white rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 animate-pulse"
                >
                  <span className="w-3 h-3 rounded-sm bg-white inline-block"></span>
                  録音停止
                </button>
              )}
            </div>
            {transcribing && (
              <div className="flex items-center gap-2 text-sm text-blue-600 mb-2">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                書き起こし中...
              </div>
            )}
            {transcript ? (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">書き起こし結果</p>
                <div className="bg-gray-50 rounded-xl p-3 max-h-40 overflow-y-auto text-xs text-gray-700 leading-relaxed">
                  {transcript}
                </div>
                <p className="text-xs text-gray-400 mt-1">録音を追加すると末尾に追記されます</p>
              </div>
            ) : (
              <p className="text-xs text-gray-400">録音した音声がWhisperで自動書き起こしされ、要約に使用されます</p>
            )}
          </div>

          {/* AI Summary */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h2 className="text-base font-bold text-gray-700 mb-3">授業要約 (AI)</h2>
            {room.summary ? (
              <>
                <pre className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-xl p-3 max-h-52 overflow-y-auto mb-3 leading-relaxed">
                  {room.summary}
                </pre>
                <div className="flex gap-2">
                  <button onClick={generateSummary} disabled={generatingSummary}
                    className="flex-1 py-2 bg-teal-100 text-teal-700 rounded-xl text-sm font-semibold hover:bg-teal-200 disabled:opacity-50 transition">
                    {generatingSummary ? '生成中...' : '再生成'}
                  </button>
                  <button onClick={downloadSummary}
                    className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition">
                    ダウンロード
                  </button>
                </div>
              </>
            ) : (
              <button onClick={generateSummary} disabled={generatingSummary}
                className="w-full py-3 bg-teal-500 text-white rounded-xl font-semibold hover:bg-teal-600 disabled:opacity-50 transition">
                {generatingSummary ? '生成中...' : '要約を生成する'}
              </button>
            )}
          </div>
        </div>

        {/* ===== MIDDLE COLUMN ===== */}
        <div className="space-y-4">

          {/* Reaction Summary */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h2 className="text-base font-bold text-gray-700 mb-4">リアクション集計</h2>
            <div className="space-y-3">
              {REACTION_TYPES.map((type) => {
                const info = REACTION_INFO[type];
                const count = counts[type] ?? 0;
                const pct = totalReactions > 0 ? Math.round((count / totalReactions) * 100) : 0;
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-700">{info.emoji} {info.label}</span>
                      <span className="text-sm font-bold text-gray-800">{count}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div className={`${info.bar} h-2.5 rounded-full transition-all duration-500`}
                        style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
            {totalReactions === 0 && (
              <p className="text-center text-gray-400 text-sm mt-4">まだリアクションはありません</p>
            )}
          </div>

          {/* Recent Reactions Feed */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h2 className="text-base font-bold text-gray-700 mb-3">最近のリアクション</h2>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {[...room.reactions].reverse().slice(0, 15).map((r) => {
                const info = REACTION_INFO[r.type];
                return (
                  <div key={r.id} className="flex items-center gap-2 text-sm">
                    <span className="text-xl">{info.emoji}</span>
                    <span className="text-gray-700 flex-1">{info.label}</span>
                    <span className="text-gray-400 text-xs">
                      {new Date(r.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                );
              })}
              {room.reactions.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-4">まだリアクションはありません</p>
              )}
            </div>
          </div>
        </div>

        {/* ===== RIGHT COLUMN ===== */}
        <div className="space-y-4">

          {/* Chat */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-700">チャット</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  room.chatEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {room.chatEnabled ? '開放中' : '閉鎖中'}
                </span>
              </div>
              {!isEnded && (
                <button
                  onClick={toggleChat}
                  className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition ${
                    room.chatEnabled
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                >
                  {room.chatEnabled ? '閉じる' : '開放する'}
                </button>
              )}
            </div>
            <div className="bg-gray-50 rounded-xl p-3 min-h-44 max-h-64 overflow-y-auto space-y-2">
              {room.messages.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-4">
                  {room.chatEnabled ? 'メッセージなし' : 'チャットは閉鎖中です'}
                </p>
              ) : (
                (() => {
                  const labelMap: Record<string, string> = {};
                  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                  let idx = 0;
                  room.messages.forEach((m) => {
                    if (!labelMap[m.studentId]) {
                      labelMap[m.studentId] = `生徒${letters[idx % 26]}`;
                      idx++;
                    }
                  });
                  return room.messages.map((m) => (
                    <div key={m.id} className="bg-white rounded-xl px-3 py-2 shadow-sm border border-gray-100">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                          {labelMap[m.studentId]}
                        </span>
                        <span className="text-xs text-gray-400 ml-auto">
                          {new Date(m.timestamp).toLocaleTimeString('ja-JP')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-800">{m.content}</p>
                    </div>
                  ));
                })()
              )}
            </div>
          </div>

          {/* Surveys */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-gray-700">アンケート</h2>
              {!isEnded && (
                <button
                  onClick={() => setShowSurveyForm(!showSurveyForm)}
                  className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-xl text-sm font-semibold hover:bg-orange-200 transition"
                >
                  {showSurveyForm ? 'キャンセル' : '+ 作成'}
                </button>
              )}
            </div>

            {showSurveyForm && (
              <div className="bg-orange-50 rounded-xl p-4 mb-4 space-y-2 border border-orange-100">
                <input type="text" value={surveyQuestion}
                  onChange={(e) => setSurveyQuestion(e.target.value)}
                  placeholder="質問を入力..."
                  className="w-full border border-orange-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
                {surveyOptions.map((opt, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="text" value={opt}
                      onChange={(e) => {
                        const next = [...surveyOptions]; next[i] = e.target.value; setSurveyOptions(next);
                      }}
                      placeholder={`選択肢 ${i + 1}`}
                      className="flex-1 border border-orange-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                    {surveyOptions.length > 2 && (
                      <button onClick={() => setSurveyOptions(surveyOptions.filter((_, j) => j !== i))}
                        className="text-red-400 hover:text-red-600 font-bold px-2">×</button>
                    )}
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setSurveyOptions([...surveyOptions, ''])}
                    className="flex-1 py-2 border border-orange-300 text-orange-600 rounded-lg text-sm hover:bg-orange-100 transition">
                    + 選択肢を追加
                  </button>
                  <button onClick={createSurvey}
                    disabled={!surveyQuestion.trim() || surveyOptions.filter((o) => o.trim()).length < 2}
                    className="flex-1 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 transition">
                    作成
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3 max-h-72 overflow-y-auto">
              {room.surveys.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-4">アンケートなし</p>
              ) : (
                [...room.surveys].reverse().map((survey) => {
                  const total = survey.options.reduce((sum, o) => sum + o.votes, 0);
                  return (
                    <div key={survey.id}
                      className={`rounded-xl p-4 border ${survey.isOpen ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200'}`}>
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-sm font-semibold text-gray-800 flex-1">{survey.question}</p>
                        {survey.isOpen && !isEnded ? (
                          <button onClick={() => closeSurvey(survey.id)}
                            className="text-xs text-red-500 hover:text-red-700 ml-2 shrink-0 font-semibold">
                            終了
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400 ml-2">終了</span>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {survey.options.map((opt) => {
                          const pct = total > 0 ? Math.round((opt.votes / total) * 100) : 0;
                          return (
                            <div key={opt.id}>
                              <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                                <span>{opt.text}</span>
                                <span>{opt.votes}票 ({pct}%)</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div className="bg-orange-400 h-2 rounded-full transition-all duration-500"
                                  style={{ width: `${pct}%` }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-gray-400 mt-2">合計: {total}票</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
