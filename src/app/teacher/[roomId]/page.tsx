'use client';
// 教師用授業画面 (/teacher/[roomId])
// ロール TEACHER / SCHOOL_ADMIN / SERVER_ADMIN がアクセス可能。
// 主な機能:
//   - リアクションのリアルタイム集計（2 秒 polling）
//   - 生徒からの個別チャット受信（chatEnabled のオン/オフ切り替え可能）
//   - アンケート作成・締め切り・結果表示
//   - 教師メモ（板書内容等）のリアルタイム保存
//   - 授業録音（MediaRecorder API）→ 停止後に OpenAI Whisper で書き起こし
//   - AI 要約レポート生成（書き起こし・リアクション・アンケートをもとに gpt-4o-mini）
//   - 授業終了（endedAt をセット、以降は生徒からの入力をブロック）

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';

type ReactionType = 'understood' | 'confused' | 'question' | 'slow' | 'fast';

interface ChatMessage { id: string; content: string; timestamp: string; user: { displayName: string } }
interface Reaction { id: string; type: ReactionType; timestamp: string }
interface SurveyOption { id: string; text: string; votes: number }
interface Survey { id: string; question: string; options: SurveyOption[]; isOpen: boolean; createdAt: string }
interface Room {
  id: string; name: string; createdAt: string; endedAt: string | null;
  chatEnabled: boolean; messages: ChatMessage[]; reactions: Reaction[];
  surveys: Survey[]; notes: string; transcript: string; summary: string;
  teacher: { displayName: string };
}

// 各リアクション種別の表示ラベル・絵文字・バーの色
const REACTION_INFO: Record<ReactionType, { label: string; emoji: string; bar: string }> = {
  understood: { label: '理解した',       emoji: '👍', bar: 'bg-green-400' },
  confused:   { label: 'わからない',     emoji: '🤔', bar: 'bg-red-400' },
  question:   { label: '質問あり',       emoji: '✋', bar: 'bg-yellow-400' },
  slow:       { label: 'もっとゆっくり', emoji: '🐢', bar: 'bg-blue-400' },
  fast:       { label: 'もっと速く',     emoji: '🚀', bar: 'bg-purple-400' },
};
const REACTION_TYPES = Object.keys(REACTION_INFO) as ReactionType[];

export default function TeacherRoom() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;

  const [room, setRoom] = useState<Room | null>(null);              // 授業データ（チャット・リアクション・アンケート含む）
  const [qrDataUrl, setQrDataUrl] = useState('');                   // 生徒参加用 QR コードの base64 data URL
  const [studentUrl, setStudentUrl] = useState('');                 // QR が指す生徒参加 URL（リンクとして表示）
  const [loading, setLoading] = useState(true);                     // 初回ロード中
  const [error, setError] = useState('');                           // エラーメッセージ
  const [generatingSummary, setGeneratingSummary] = useState(false);// AI 要約生成中フラグ
  const [copied, setCopied] = useState(false);                      // ルームID コピー完了フィードバック
  const [endConfirm, setEndConfirm] = useState(false);              // 授業終了確認モーダルの表示状態

  // 授業メモ関連
  const [notes, setNotes] = useState('');          // テキストエリアの現在値（room.notes から初期化）
  const [notesSaving, setNotesSaving] = useState(false);  // 保存中フラグ（ボタン無効化用）
  const [notesSaved, setNotesSaved] = useState(false);    // 保存完了フィードバック（2 秒間「✓ 保存済み」を表示）

  // 録音・書き起こし関連
  const [recording, setRecording] = useState(false);      // MediaRecorder が動作中かどうか
  const [transcribing, setTranscribing] = useState(false);// Whisper で書き起こし中かどうか
  const [transcript, setTranscript] = useState('');       // 累積書き起こしテキスト（複数回録音を追記）
  const mediaRecorderRef = useRef<MediaRecorder | null>(null); // MediaRecorder インスタンスへの参照
  const chunksRef = useRef<Blob[]>([]);                        // 録音データのチャンクを蓄積するバッファ

  // アンケート作成フォーム関連
  const [showSurveyForm, setShowSurveyForm] = useState(false);   // 作成フォームの表示状態
  const [surveyQuestion, setSurveyQuestion] = useState('');       // 質問文
  const [surveyOptions, setSurveyOptions] = useState(['', '']);   // 選択肢リスト（最低 2 つ必須）

  // ルームデータをサーバーから取得する。2 秒ポーリングで繰り返し呼ばれる。
  const fetchRoom = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${roomId}`);
      if (res.status === 401) { router.push('/login'); return; }
      if (!res.ok) { setError('ルームが見つかりません'); return; }
      setRoom(await res.json());
    } catch { setError('接続エラー'); }
    finally { setLoading(false); }
  }, [roomId, router]);

  // notes と transcript を room から初期化する（初回取得時のみ）。
  // polling のたびに上書きするとテキストエリアの入力が失われるため、initialized フラグで一度だけ実行する。
  const initialized = useRef(false);
  useEffect(() => {
    if (room && !initialized.current) {
      setNotes(room.notes ?? '');
      setTranscript(room.transcript ?? '');
      initialized.current = true;
    }
  }, [room]);

  // マウント時にルームデータと QR コードを取得する
  useEffect(() => {
    fetchRoom();
    fetch(`/api/rooms/${roomId}/qr`)
      .then((r) => r.json())
      .then((d) => { setQrDataUrl(d.qr); setStudentUrl(d.url); })
      .catch(() => {});
  }, [roomId, fetchRoom]);

  // 2 秒ごとにルームデータをポーリングしてリアクション・チャット・アンケートをリアルタイム更新
  useEffect(() => {
    const iv = setInterval(fetchRoom, 2000);
    return () => clearInterval(iv); // アンマウント時にインターバルをクリア
  }, [fetchRoom]);

  // チャット受付のオン/オフを切り替える
  const toggleChat = async () => {
    await fetch(`/api/rooms/${roomId}/chat/toggle`, { method: 'POST' });
    fetchRoom();
  };

  // ブラウザの MediaRecorder API を使って音声録音を開始する。
  // webm を優先し、非対応ブラウザでは ogg にフォールバックする。
  // 停止時に onstop コールバックで録音データを Whisper にアップロードする。
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      const mr = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      // ondataavailable: 録音データが届くたびにチャンクバッファへ追加
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      // onstop: 録音停止後にマイクトラックを解放し、Whisper へアップロード
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        await uploadAudio(blob, mimeType);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch { alert('マイクへのアクセスが拒否されました'); }
  };

  // 録音を停止する（onstop が非同期で書き起こしを開始する）
  const stopRecording = () => { mediaRecorderRef.current?.stop(); setRecording(false); };

  // 録音 Blob を multipart/form-data で /api/rooms/[roomId]/transcribe に送り、
  // Whisper の書き起こし結果を transcript state に反映する
  const uploadAudio = async (blob: Blob, mimeType: string) => {
    setTranscribing(true);
    try {
      const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
      const form = new FormData();
      form.append('audio', new File([blob], `audio.${ext}`, { type: mimeType }));
      const res = await fetch(`/api/rooms/${roomId}/transcribe`, { method: 'POST', body: form });
      if (res.ok) setTranscript((await res.json()).transcript);
      else alert('書き起こしに失敗しました');
    } finally { setTranscribing(false); }
  };

  // 授業メモを手動保存する。保存完了後 2 秒間「✓ 保存済み」を表示する。
  const saveNotes = async () => {
    setNotesSaving(true);
    try {
      await fetch(`/api/rooms/${roomId}/notes`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }) });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } finally { setNotesSaving(false); }
  };

  // 授業を終了する（DELETE は endedAt をセットするだけで物理削除はしない）。
  // 終了と同時にサーバー側で理解度チェックが 4 日後にスケジュールされる。
  const endClass = async () => {
    await fetch(`/api/rooms/${roomId}`, { method: 'DELETE' });
    setEndConfirm(false);
    fetchRoom();
  };

  // アンケートを作成する。空の選択肢を除外して最低 2 つあれば送信する。
  const createSurvey = async () => {
    const opts = surveyOptions.filter((o) => o.trim());
    if (!surveyQuestion.trim() || opts.length < 2) return;
    await fetch(`/api/rooms/${roomId}/surveys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: surveyQuestion, options: opts }),
    });
    // フォームをリセットして閉じる
    setSurveyQuestion(''); setSurveyOptions(['', '']); setShowSurveyForm(false);
    fetchRoom();
  };

  // アンケートへの投票を締め切る（isOpen を false にする）
  const closeSurvey = async (surveyId: string) => {
    await fetch(`/api/rooms/${roomId}/surveys/${surveyId}/close`, { method: 'POST' });
    fetchRoom();
  };

  // gpt-4o-mini で授業要約レポートを生成する。生成完了後 fetchRoom で表示を更新する。
  const generateSummary = async () => {
    setGeneratingSummary(true);
    try { await fetch(`/api/rooms/${roomId}/summary`, { method: 'POST' }); fetchRoom(); }
    finally { setGeneratingSummary(false); }
  };

  // 要約レポートを Markdown ファイルとしてブラウザからダウンロードする
  const downloadSummary = () => {
    if (!room?.summary) return;
    const blob = new Blob([room.summary], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${room.name}_summary.md`; a.click();
    URL.revokeObjectURL(url); // メモリリーク防止
  };

  // ルームID をクリップボードにコピーし、2 秒間「✓ コピー済み」を表示する
  const copyRoomId = () => { navigator.clipboard.writeText(roomId); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
    </div>
  );

  if (error || !room) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <p className="text-red-500 text-xl mb-4">{error || 'ルームが見つかりません'}</p>
        <button onClick={() => router.push('/home')} className="text-blue-600 hover:underline">ホームへ戻る</button>
      </div>
    </div>
  );

  // endedAt が設定されていれば授業終了済み（以降は閲覧専用モード）
  const isEnded = !!room.endedAt;
  // リアクション種別ごとの集計（例: { understood: 5, confused: 2, ... }）
  const counts = room.reactions.reduce<Record<string, number>>((acc, r) => { acc[r.type] = (acc[r.type] ?? 0) + 1; return acc; }, {});
  const totalReactions = room.reactions.length; // グラフの割合計算に使う全リアクション数

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 授業終了確認モーダル: 誤操作防止のため 2 ステップ確認 */}
      {endConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-gray-800 mb-2">授業を終了しますか？</h3>
            <p className="text-sm text-gray-500 mb-5">終了後は生徒からの操作を受け付けなくなります。4日後に理解度チェックが送信されます。</p>
            <div className="flex gap-3">
              <button onClick={() => setEndConfirm(false)} className="flex-1 py-2 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50 transition font-semibold">キャンセル</button>
              <button onClick={endClass} className="flex-1 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition font-semibold">終了する</button>
            </div>
          </div>
        </div>
      )}

      {/* ヘッダー: 授業終了後はグレーに変えて視覚的に終了状態を示す */}
      <header className={`text-white px-6 py-4 shadow-lg sticky top-0 z-10 ${isEnded ? 'bg-gray-600' : 'bg-blue-700'}`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/home')} className="text-white/70 hover:text-white text-sm transition">← ホーム</button>
            <span className="text-2xl font-bold">Re:a Class</span>
            <span className="bg-white/20 text-white text-xs px-2 py-1 rounded-lg">教師</span>
            {isEnded && <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-lg font-bold">授業終了</span>}
          </div>
          <div className="flex items-center gap-4">
            {/* 授業終了ボタン: 終了済みなら非表示 */}
            {!isEnded && (
              <button onClick={() => setEndConfirm(true)} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition">授業終了</button>
            )}
            <div className="text-right">
              <p className="font-semibold">{room.name}</p>
              <p className="text-blue-200 text-sm">担当: {room.teacher.displayName}</p>
            </div>
          </div>
        </div>
      </header>

      {/* 終了済みバナー */}
      {isEnded && (
        <div className="bg-gray-700 text-white text-center py-2 text-sm">
          授業は {new Date(room.endedAt!).toLocaleString('ja-JP')} に終了しました。閲覧専用モードです。
        </div>
      )}

      {/* 3 カラムグリッド: 左=QR/録音/要約/メモ、中=リアクション集計、右=チャット/アンケート */}
      <div className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ===== 左カラム ===== */}
        <div className="space-y-4">

          {/* QR コード & ルームID: 生徒が QR を読むだけで参加できる */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center">
            <h2 className="text-base font-bold text-gray-700 mb-3">生徒参加用 QRコード</h2>
            {qrDataUrl ? (
              // 終了済みの場合は QR を半透明グレーアウトして再利用不可を示す
              <img src={qrDataUrl} alt="QR" className={`mx-auto mb-3 rounded-xl ${isEnded ? 'opacity-40 grayscale' : ''}`} width={200} height={200} />
            ) : (
              <div className="w-48 h-48 bg-gray-100 rounded-xl mx-auto mb-3 flex items-center justify-center"><span className="text-gray-400 text-sm">生成中...</span></div>
            )}
            {/* ルームID クリックでクリップボードへコピー */}
            <button onClick={copyRoomId} className="w-full bg-gray-100 hover:bg-gray-200 rounded-xl px-3 py-2 text-sm font-mono text-gray-700 transition flex items-center justify-center gap-2">
              <span>ルームID: {room.id}</span>
              <span className="text-xs text-blue-500">{copied ? '✓ コピー済み' : 'コピー'}</span>
            </button>
            {/* 授業中のみ直接リンクを表示（終了後はリンク非表示） */}
            {studentUrl && !isEnded && <a href={studentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-600 break-all mt-2 block">{studentUrl}</a>}
          </div>

          {/* 統計サマリー: リアクション総数・チャット数・アンケート数を一目で確認 */}
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

          {/* 授業録音: MediaRecorder でブラウザ録音 → Whisper で書き起こし */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h2 className="text-base font-bold text-gray-700 mb-3">授業録音</h2>
            <div className="flex gap-2 mb-3">
              {!recording ? (
                // 録音開始ボタン: 授業終了後・書き起こし中は無効
                <button onClick={startRecording} disabled={isEnded || transcribing}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-white inline-block" />録音開始
                </button>
              ) : (
                // 録音停止ボタン: animate-pulse で録音中であることを視覚的に示す
                <button onClick={stopRecording}
                  className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-800 text-white rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 animate-pulse">
                  <span className="w-3 h-3 rounded-sm bg-white inline-block" />録音停止
                </button>
              )}
            </div>
            {/* 書き起こし中インジケーター */}
            {transcribing && <div className="flex items-center gap-2 text-sm text-blue-600 mb-2"><div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />書き起こし中...</div>}
            {/* 書き起こし結果テキスト（複数回の録音が改行で追記される） */}
            {transcript ? (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">書き起こし結果</p>
                <div className="bg-gray-50 rounded-xl p-3 max-h-40 overflow-y-auto text-xs text-gray-700 leading-relaxed">{transcript}</div>
              </div>
            ) : <p className="text-xs text-gray-400">録音した音声がWhisperで自動書き起こしされます</p>}
          </div>

          {/* AI 要約レポート: 書き起こし・リアクション・アンケートをまとめて gpt-4o-mini に送る */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h2 className="text-base font-bold text-gray-700 mb-3">授業要約 (AI)</h2>
            {room.summary ? (
              <>
                {/* 既存の要約を表示: pre で Markdown のインデントを保持 */}
                <pre className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-xl p-3 max-h-52 overflow-y-auto mb-3 leading-relaxed">{room.summary}</pre>
                <div className="flex gap-2">
                  <button onClick={generateSummary} disabled={generatingSummary} className="flex-1 py-2 bg-teal-100 text-teal-700 rounded-xl text-sm font-semibold hover:bg-teal-200 disabled:opacity-50 transition">{generatingSummary ? '生成中...' : '再生成'}</button>
                  <button onClick={downloadSummary} className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition">ダウンロード</button>
                </div>
              </>
            ) : (
              // 要約がまだない場合は生成ボタンのみ表示
              <button onClick={generateSummary} disabled={generatingSummary} className="w-full py-3 bg-teal-500 text-white rounded-xl font-semibold hover:bg-teal-600 disabled:opacity-50 transition">{generatingSummary ? '生成中...' : '要約を生成する'}</button>
            )}
          </div>

          {/* 授業メモ: 板書内容などを自由記述。手動「保存」ボタンで DB に反映 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold text-gray-700">授業メモ</h2>
              <button onClick={saveNotes} disabled={notesSaving} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-200 disabled:opacity-50 transition">
                {notesSaved ? '✓ 保存済み' : notesSaving ? '保存中...' : '保存'}
              </button>
            </div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="授業メモを入力..."
              className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400" rows={4} />
          </div>
        </div>

        {/* ===== 中央カラム: リアクション集計 ===== */}
        <div className="space-y-4">

          {/* リアクション割合バー: 全リアクション数に対する各種別の割合をプログレスバーで表示 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h2 className="text-base font-bold text-gray-700 mb-4">リアクション集計</h2>
            <div className="space-y-3">
              {REACTION_TYPES.map((type) => {
                const info = REACTION_INFO[type];
                const count = counts[type] ?? 0;
                // totalReactions=0 の場合はゼロ除算を避けて 0% にする
                const pct = totalReactions > 0 ? Math.round((count / totalReactions) * 100) : 0;
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-700">{info.emoji} {info.label}</span>
                      <span className="text-sm font-bold text-gray-800">{count}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div className={`${info.bar} h-2.5 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            {totalReactions === 0 && <p className="text-center text-gray-400 text-sm mt-4">まだリアクションはありません</p>}
          </div>

          {/* 最近のリアクション: タイムスタンプ付きで最新 15 件を逆順表示 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h2 className="text-base font-bold text-gray-700 mb-3">最近のリアクション</h2>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {[...room.reactions].reverse().slice(0, 15).map((r) => {
                const info = REACTION_INFO[r.type as ReactionType];
                return (
                  <div key={r.id} className="flex items-center gap-2 text-sm">
                    <span className="text-xl">{info?.emoji}</span>
                    <span className="text-gray-700 flex-1">{info?.label}</span>
                    <span className="text-gray-400 text-xs">{new Date(r.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                );
              })}
              {room.reactions.length === 0 && <p className="text-center text-gray-400 text-sm py-4">まだリアクションはありません</p>}
            </div>
          </div>
        </div>

        {/* ===== 右カラム: チャット・アンケート ===== */}
        <div className="space-y-4">

          {/* チャット: 生徒からの個別メッセージ受信。教師はオン/オフを切り替え可能 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-700">チャット</h2>
                {/* 現在の受付状態をバッジで表示 */}
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${room.chatEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {room.chatEnabled ? '開放中' : '閉鎖中'}
                </span>
              </div>
              {/* 授業中のみ切り替えボタンを表示（終了後は操作不可） */}
              {!isEnded && (
                <button onClick={toggleChat} className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition ${room.chatEnabled ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                  {room.chatEnabled ? '閉じる' : '開放する'}
                </button>
              )}
            </div>
            <div className="bg-gray-50 rounded-xl p-3 min-h-44 max-h-64 overflow-y-auto space-y-2">
              {room.messages.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-4">{room.chatEnabled ? 'メッセージなし' : 'チャットは閉鎖中です'}</p>
              ) : (
                // 全生徒のメッセージを時系列で表示（送信者名は「生徒」と表示し匿名性を保つ）
                room.messages.map((m) => (
                  <div key={m.id} className="bg-white rounded-xl px-3 py-2 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">生徒</span>
                      <span className="text-xs text-gray-400 ml-auto">{new Date(m.timestamp).toLocaleTimeString('ja-JP')}</span>
                    </div>
                    {/* content は AI が敬語変換済みのテキスト */}
                    <p className="text-sm text-gray-800">{m.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* アンケート: 授業中にリアルタイムでアンケートを作成・集計できる */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-gray-700">アンケート</h2>
              {/* 授業中のみ作成ボタンを表示 */}
              {!isEnded && (
                <button onClick={() => setShowSurveyForm(!showSurveyForm)}
                  className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-xl text-sm font-semibold hover:bg-orange-200 transition">
                  {showSurveyForm ? 'キャンセル' : '+ 作成'}
                </button>
              )}
            </div>

            {/* アンケート作成フォーム: 質問 + 選択肢（最低 2 つ、追加可能） */}
            {showSurveyForm && (
              <div className="bg-orange-50 rounded-xl p-4 mb-4 space-y-2 border border-orange-100">
                <input type="text" value={surveyQuestion} onChange={(e) => setSurveyQuestion(e.target.value)} placeholder="質問を入力..."
                  className="w-full border border-orange-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                {surveyOptions.map((opt, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="text" value={opt} onChange={(e) => { const next = [...surveyOptions]; next[i] = e.target.value; setSurveyOptions(next); }}
                      placeholder={`選択肢 ${i + 1}`}
                      className="flex-1 border border-orange-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                    {/* 最低 2 つ維持のため 3 つ以上のときのみ削除ボタンを表示 */}
                    {surveyOptions.length > 2 && (
                      <button onClick={() => setSurveyOptions(surveyOptions.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 font-bold px-2">×</button>
                    )}
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setSurveyOptions([...surveyOptions, ''])}
                    className="flex-1 py-2 border border-orange-300 text-orange-600 rounded-lg text-sm hover:bg-orange-100 transition">+ 選択肢を追加</button>
                  {/* 作成ボタン: 質問あり & 有効な選択肢 2 つ以上のときのみ有効 */}
                  <button onClick={createSurvey} disabled={!surveyQuestion.trim() || surveyOptions.filter((o) => o.trim()).length < 2}
                    className="flex-1 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 transition">作成</button>
                </div>
              </div>
            )}

            {/* アンケート一覧: 最新順（reverse）で表示。受付中=オレンジ背景、終了=グレー */}
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {room.surveys.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-4">アンケートなし</p>
              ) : (
                [...room.surveys].reverse().map((survey) => {
                  const total = survey.options.reduce((sum, o) => sum + o.votes, 0);
                  return (
                    <div key={survey.id} className={`rounded-xl p-4 border ${survey.isOpen ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200'}`}>
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-sm font-semibold text-gray-800 flex-1">{survey.question}</p>
                        {/* 受付中かつ授業中のみ締め切りボタンを表示 */}
                        {survey.isOpen && !isEnded ? (
                          <button onClick={() => closeSurvey(survey.id)} className="text-xs text-red-500 hover:text-red-700 ml-2 shrink-0 font-semibold">終了</button>
                        ) : (
                          <span className="text-xs text-gray-400 ml-2">終了</span>
                        )}
                      </div>
                      {/* 選択肢ごとの得票数とプログレスバー */}
                      <div className="space-y-1.5">
                        {survey.options.map((opt) => {
                          const pct = total > 0 ? Math.round((opt.votes / total) * 100) : 0;
                          return (
                            <div key={opt.id}>
                              <div className="flex justify-between text-xs text-gray-600 mb-0.5"><span>{opt.text}</span><span>{opt.votes}票 ({pct}%)</span></div>
                              <div className="w-full bg-gray-200 rounded-full h-2"><div className="bg-orange-400 h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} /></div>
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
