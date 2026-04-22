'use client';
// 生徒用授業画面 (/student/[roomId])
// ロール STUDENT のみアクセス可能。
// 主な機能:
//   - 5 種類のリアクション送信（理解した・わからない・質問あり・ゆっくり・速く）
//   - アンケート回答・結果閲覧
//   - 授業メモ（教師が書いた板書内容）の閲覧
//   - 授業終了後: AI 要約・書き起こしの閲覧
//   - 理解度チェック（授業終了 4 日後に通知 → スコア 1〜4 とコメントで回答）
// 2 秒 polling でリアルタイム更新。参加登録（Enrollment）は入室時に自動実行。

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

type ReactionType = 'understood' | 'confused' | 'question' | 'slow' | 'fast';
// タブ ID の型: 授業中は reaction/survey、終了後は board が追加、理解度チェック期間中は understanding が追加
// 要約は教師フィードバック用のため生徒タブには含めない
type Tab = 'reaction' | 'survey' | 'board' | 'understanding';

interface Me { id: string; displayName: string; role: string }
interface SurveyOption { id: string; text: string; votes: number }
interface Survey { id: string; question: string; options: SurveyOption[]; isOpen: boolean; createdAt: string }
interface Room {
  id: string; name: string; createdAt: string; endedAt: string | null;
  surveys: Survey[]; summary: string;
  teacher: { displayName: string };
}
interface BoardPost { id: string; content: string; authorLabel: string; createdAt: string }

// リアクションボタンの定義: 通常状態(bg)とタップ時のハイライト状態(active)のスタイルを持つ
const REACTION_BUTTONS: { type: ReactionType; label: string; emoji: string; bg: string; active: string }[] = [
  { type: 'understood', label: '理解した',       emoji: '👍', bg: 'bg-green-100 border-green-300 text-green-700',    active: 'bg-green-500 border-green-600 text-white' },
  { type: 'confused',   label: 'わからない',     emoji: '🤔', bg: 'bg-red-100 border-red-300 text-red-700',          active: 'bg-red-500 border-red-600 text-white' },
  { type: 'question',   label: '質問あり',       emoji: '✋', bg: 'bg-yellow-100 border-yellow-300 text-yellow-700', active: 'bg-yellow-500 border-yellow-600 text-white' },
  { type: 'slow',       label: 'もっとゆっくり', emoji: '🐢', bg: 'bg-blue-100 border-blue-300 text-blue-700',       active: 'bg-blue-500 border-blue-600 text-white' },
  { type: 'fast',       label: 'もっと速く',     emoji: '🚀', bg: 'bg-purple-100 border-purple-300 text-purple-700', active: 'bg-purple-500 border-purple-600 text-white' },
];

function StudentRoom() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = params.roomId as string;
  // --- 基本状態 ---
  const [me, setMe] = useState<Me | null>(null);              // ログイン中の生徒情報
  const [room, setRoom] = useState<Room | null>(null);        // 授業データ（2 秒ポーリングで更新）
  const [loading, setLoading] = useState(true);               // 初回ロード中
  const [error, setError] = useState('');                     // エラーメッセージ
  const [tab, setTab] = useState<Tab>('reaction');            // 現在選択中のタブ
  const [toast, setToast] = useState('');                     // トースト通知のメッセージ（2 秒で消える）

  // --- リアクション関連 ---
  // sentReaction: 直前に送ったリアクション種別。1.5 秒間ハイライト表示して null に戻す
  const [sentReaction, setSentReaction] = useState<ReactionType | null>(null);

  // --- アンケート関連 ---
  // answeredSurveys: このセッションで回答済みのアンケートID集合（二重回答防止のためローカル管理）
  const [answeredSurveys, setAnsweredSurveys] = useState<Set<string>>(new Set());

  // --- 掲示板関連 ---
  const [boardPosts, setBoardPosts] = useState<BoardPost[]>([]);  // 掲示板の投稿一覧
  const [boardMessage, setBoardMessage] = useState('');            // 投稿入力テキスト
  const [boardSending, setBoardSending] = useState(false);         // 投稿中フラグ（二重投稿防止）
  const [boardLoaded, setBoardLoaded] = useState(false);           // 掲示板データ取得済みフラグ（タブ切り替え時に1回だけ取得）

  // --- 理解度チェック関連 ---
  const [understandingActive, setUnderstandingActive] = useState(false);     // チェック受付中かどうか（notifiedAt あり & talliedAt なし）
  const [understandingAnswered, setUnderstandingAnswered] = useState(false);  // 自分がすでに回答済みかどうか
  const [understandingScore, setUnderstandingScore] = useState<number | null>(null); // 選択したスコア（1〜4）
  const [understandingComment, setUnderstandingComment] = useState('');      // 入力したコメント（任意）
  const [understandingSubmitting, setUnderstandingSubmitting] = useState(false); // 回答送信中フラグ
  // タイミング情報（カウントダウン表示用）
  const [understandingTiming, setUnderstandingTiming] = useState<{
    scheduledAt: string | null;
    notifiedAt: string | null;
    tallyAt: string | null;
    talliedAt: string | null;
  } | null>(null);

  // 2 秒で消えるトースト通知を表示する
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  // マウント時: ログインチェック + 入室登録（Enrollment の upsert）を行う。
  // enroll は idempotent なので複数回呼んでも安全。
  useEffect(() => {
    fetch('/api/auth/me').then(async (res) => {
      if (res.status === 401) { router.replace('/login'); return; }
      const data = await res.json();
      setMe(data);
      // 入室を記録する（学習履歴と理解度チェック対象の決定に使われる）
      await fetch(`/api/rooms/${roomId}/enroll`, { method: 'POST' });
    });
  }, [roomId, router]);

  // URL クエリパラメータ ?tab=understanding などでタブを指定できる（通知リンクから遷移する場合に使用）
  useEffect(() => {
    const t = searchParams.get('tab') as Tab | null;
    if (t) setTab(t);
  }, [searchParams]);

  // ルームデータを取得する（2 秒ポーリングで繰り返し呼ばれる）
  const fetchRoom = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${roomId}`);
      if (res.status === 401) { router.replace('/login'); return; }
      if (!res.ok) { setError('ルームが見つかりません'); return; }
      setRoom(await res.json());
    } catch {
      setError('接続エラー');
    } finally {
      setLoading(false);
    }
  }, [roomId, router]);

  // 理解度チェックの状態とタイミング情報を取得する
  const fetchUnderstanding = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${roomId}/understanding`);
      if (res.ok) {
        const data = await res.json();
        setUnderstandingActive(data.active);
        setUnderstandingAnswered(data.answered);
        setUnderstandingTiming({
          scheduledAt: data.scheduledAt ?? null,
          notifiedAt: data.notifiedAt ?? null,
          tallyAt: data.tallyAt ?? null,
          talliedAt: data.talliedAt ?? null,
        });
      }
    } catch { /* 失敗しても通常フローには影響しない */ }
  }, [roomId]);

  // me が設定された（ログイン確認済み）タイミングで初回データ取得を実行
  useEffect(() => {
    if (me) { fetchRoom(); fetchUnderstanding(); }
  }, [me, fetchRoom, fetchUnderstanding]);

  // 2 秒ごとにポーリングを開始する。アンマウント時にクリアして無限ループを防ぐ。
  useEffect(() => {
    if (!me) return;
    const iv = setInterval(() => { fetchRoom(); fetchUnderstanding(); }, 2000);
    return () => clearInterval(iv);
  }, [me, fetchRoom, fetchUnderstanding]);

  // 掲示板タブを開いたとき、まだデータ未取得であれば一度だけ投稿一覧を取得する
  // ポーリングではなく初回のみ取得（掲示板は授業終了後で更新頻度が低いため）
  useEffect(() => {
    if (tab === 'board' && !boardLoaded) {
      fetch(`/api/rooms/${roomId}/board`).then(async (res) => {
        if (res.ok) { setBoardPosts(await res.json()); setBoardLoaded(true); }
      });
    }
  }, [tab, boardLoaded, roomId]);

  // リアクションを送信する。授業終了後はブロック。
  // 送信後 1.5 秒間ボタンをハイライト表示してフィードバックを与える。
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

  // アンケートに回答する。
  // answeredSurveys にすでに存在すれば二重回答を防ぐ。
  // 楽観的 UI: API レスポンスを待たずに先に answeredSurveys を更新して UX を向上させる。
  const answerSurvey = async (surveyId: string, optionId: string) => {
    if (answeredSurveys.has(surveyId) || room?.endedAt) return;
    setAnsweredSurveys((prev) => { const next = new Set(prev); next.add(surveyId); return next; });
    await fetch(`/api/rooms/${roomId}/surveys/${surveyId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionId }),
    });
    fetchRoom(); // 投票数をリアルタイムで反映
    showToast('回答しました！');
  };

  // 匿名掲示板への投稿を送信する。
  // 送信成功後は投稿をローカル state に追加して即座に表示する（再フェッチ不要）。
  const sendBoardPost = async () => {
    if (!boardMessage.trim() || boardSending) return;
    setBoardSending(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/board`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: boardMessage }),
      });
      if (res.ok) {
        const post = await res.json();
        setBoardPosts((prev) => [...prev, post]);
        setBoardMessage('');
        showToast('投稿しました！');
      }
    } finally {
      setBoardSending(false);
    }
  };

  // 理解度チェックの回答を送信する。スコア（1〜4）は必須。
  // 送信成功後は answered フラグを立てて回答済み画面に切り替える。
  const submitUnderstanding = async () => {
    if (!understandingScore || understandingSubmitting) return;
    setUnderstandingSubmitting(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/understanding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // score 1/2 はコメント不要なので空文字で送信
        body: JSON.stringify({ score: understandingScore, comment: understandingScore >= 3 ? understandingComment : '' }),
      });
      if (res.ok) {
        setUnderstandingAnswered(true);
        showToast('回答しました！');
      }
    } finally {
      setUnderstandingSubmitting(false);
    }
  };

  if (loading || !me) return (
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
        <button onClick={() => router.push('/home')} className="text-blue-600 hover:underline">ホームへ戻る</button>
      </div>
    </div>
  );

  const isEnded = !!room.endedAt; // 授業が終了しているかどうか（true なら入力系を全ブロック）

  // 指定日時までの残り時間を「X日後」「X時間X分後」「まもなく」などの文字列で返す
  const timeUntil = (iso: string): string => {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return '期限終了';
    const totalMins = Math.floor(ms / 60000);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hours >= 48) return `約${Math.floor(hours / 24)}日後`;
    if (hours >= 1) return `${hours}時間${mins > 0 ? `${mins}分` : ''}後`;
    if (totalMins > 0) return `${totalMins}分後`;
    return 'まもなく';
  };
  const openSurveys = room.surveys.filter((s) => s.isOpen); // 受付中のアンケート（バッジ表示の判定に使用）

  // タブリスト: 授業終了後に board タブ、チェック期間中に understanding タブが追加される
  // 要約は教師フィードバック専用のため生徒には表示しない
  const tabs: { id: Tab; label: string; emoji: string }[] = [
    { id: 'reaction', label: 'リアクション', emoji: '👍' },
    { id: 'survey',   label: 'アンケート',   emoji: '📊' },
    ...(isEnded ? [{ id: 'board' as Tab, label: '掲示板', emoji: '📌' }] : []),
    ...(understandingActive ? [{ id: 'understanding' as Tab, label: '理解度', emoji: '📋' }] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* トースト通知: 画面上部中央に 2 秒間表示 */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      {/* ヘッダー: 全幅。内容は max-w-2xl で中央揃え */}
      <header className={`text-white px-4 py-3 shadow-lg sticky top-0 z-10 ${isEnded ? 'bg-gray-600' : 'bg-teal-600'}`}>
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <button onClick={() => router.push('/home')} className="text-teal-200 hover:text-white text-sm font-semibold shrink-0">
            ← ホーム
          </button>
          <div className="text-right min-w-0">
            <p className="font-semibold truncate">{room.name}</p>
            <p className="text-teal-200 text-xs">{room.teacher.displayName} 先生</p>
          </div>
        </div>
      </header>

      {/* 授業終了バナー: 全幅 */}
      {isEnded && (
        <div className="bg-gray-100 border-b border-gray-200 text-center py-3 px-4">
          <p className="text-gray-600 font-semibold text-sm">この授業は終了しました</p>
          <p className="text-gray-400 text-xs mt-0.5">
            {new Date(room.endedAt!).toLocaleString('ja-JP')} に終了
          </p>
        </div>
      )}

      {/* 理解度チェック タイミング情報バナー（授業終了後に表示） */}
      {isEnded && understandingTiming && (() => {
        const t = understandingTiming;
        if (t.talliedAt) return (
          <div className="bg-purple-50 border-b border-purple-200 px-4 py-2 flex items-center justify-center gap-2 text-xs text-purple-700">
            <span>📋</span>
            <span><span className="font-semibold">理解度チェック</span> 結果は先生に届いています</span>
          </div>
        );
        if (t.notifiedAt && t.tallyAt) return (
          <div className="bg-orange-50 border-b border-orange-200 px-4 py-2 flex items-center justify-center gap-2 text-xs text-orange-700">
            <span>📋</span>
            <span><span className="font-semibold">理解度チェック受付中</span> — 提出期限: <span className="font-bold">{timeUntil(t.tallyAt)}</span></span>
          </div>
        );
        if (t.scheduledAt) return (
          <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center justify-center gap-2 text-xs text-blue-700">
            <span>📋</span>
            <span><span className="font-semibold">理解度チェック</span> <span className="font-bold">{timeUntil(t.scheduledAt)}</span>に開始予定</span>
          </div>
        );
        return null;
      })()}

      {/* タブナビゲーション: 全幅の白いバー。タブ自体は max-w-2xl で中央揃え */}
      <div className="bg-white border-b border-gray-200 sticky top-[52px] z-10">
        <div className="max-w-2xl mx-auto flex overflow-x-auto">
          {tabs.map((t) => {
            const hasBadge =
              (t.id === 'survey' && openSurveys.length > 0 && !openSurveys.every((s) => answeredSurveys.has(s.id)) && !isEnded) ||
              (t.id === 'understanding' && understandingActive && !understandingAnswered);
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-shrink-0 flex-1 py-3 text-xs font-semibold transition-all relative min-w-[60px] ${
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
      </div>

      {/* タブコンテンツ: max-w-2xl で中央揃え */}
      <div className="flex-1 max-w-2xl mx-auto w-full p-4">

        {/* ===== リアクションタブ ===== */}
        {tab === 'reaction' && (
          <div>
            {isEnded ? (
              // 授業終了後はリアクション送信不可
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
                      // 「理解した」ボタンは 2 カラム幅で強調表示
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

        {/* ===== アンケートタブ ===== */}
        {tab === 'survey' && (
          <div className="space-y-4">
            {room.surveys.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">📊</div>
                <p className="text-gray-500 font-semibold">アンケートなし</p>
                <p className="text-gray-400 text-sm mt-2">先生がアンケートを作成すると表示されます</p>
              </div>
            ) : (
              // 最新のアンケートが上に来るよう逆順表示
              [...room.surveys].reverse().map((survey) => {
                const answered = answeredSurveys.has(survey.id);
                const total = survey.options.reduce((sum, o) => sum + o.votes, 0);
                return (
                  <div key={survey.id}
                    className={`bg-white rounded-2xl p-5 shadow-sm border ${survey.isOpen && !isEnded ? 'border-orange-200' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      {/* 受付中/終了バッジ */}
                      {survey.isOpen && !isEnded
                        ? <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">受付中</span>
                        : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold">終了</span>
                      }
                    </div>
                    <p className="font-semibold text-gray-800 mb-3">{survey.question}</p>
                    {/* 未回答かつ受付中かつ授業中: 選択肢ボタンを表示 */}
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
                      // 回答済み・終了・授業終了後: 結果グラフを表示
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

        {/* ===== 掲示板タブ: 授業終了後のみ表示される匿名掲示板 ===== */}
        {tab === 'board' && (
          <div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 mb-4 text-xs text-indigo-700">
              📌 授業終了後の匿名掲示板です。投稿者は匿名で表示されます。
            </div>
            <div className="space-y-3 mb-4">
              {boardPosts.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-400 text-sm">まだ投稿がありません</p>
                  <p className="text-gray-300 text-xs mt-1">最初の投稿をしてみよう！</p>
                </div>
              ) : (
                boardPosts.map((p) => (
                  <div key={p.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      {/* authorLabel は SHA256(userId+roomId) から生成された「生徒X」形式の匿名ラベル */}
                      <span className="text-xs font-semibold text-indigo-600">{p.authorLabel}</span>
                      <span className="text-xs text-gray-400">{new Date(p.createdAt).toLocaleString('ja-JP')}</span>
                    </div>
                    <p className="text-sm text-gray-700">{p.content}</p>
                  </div>
                ))
              )}
            </div>
            {/* 投稿フォーム: sticky で常に画面下部に表示 */}
            <div className="flex gap-2 sticky bottom-0 bg-gray-50 py-2 max-w-2xl mx-auto w-full">
              <input
                type="text"
                value={boardMessage}
                onChange={(e) => setBoardMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendBoardPost()}
                placeholder="感想や質問を投稿..."
                className="flex-1 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <button
                onClick={sendBoardPost}
                disabled={!boardMessage.trim() || boardSending}
                className="bg-indigo-500 text-white rounded-2xl px-4 py-3 font-semibold disabled:opacity-50 hover:bg-indigo-600 transition"
              >
                投稿
              </button>
            </div>
          </div>
        )}

        {/* ===== 理解度チェックタブ: 授業終了 4 日後に通知→3 日間回答受付 ===== */}
        {tab === 'understanding' && (
          <div>
            {understandingAnswered ? (
              // 回答済み画面
              <div className="text-center py-16">
                <div className="text-5xl mb-4">✅</div>
                <p className="text-gray-600 font-semibold">回答済みです</p>
                <p className="text-gray-400 text-sm mt-2">ご協力ありがとうございました</p>
              </div>
            ) : (
              // 回答フォーム: スコア選択（1〜4）+ 任意コメント
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h2 className="text-base font-bold text-gray-700 mb-1">理解度チェック</h2>
                <p className="text-xs text-gray-400">「{room.name}」の内容はどのくらい理解できましたか？</p>
                {understandingTiming?.tallyAt && (
                  <p className="text-xs font-semibold text-orange-600 mt-1 mb-4">
                    提出期限: {timeUntil(understandingTiming.tallyAt)}（{new Date(understandingTiming.tallyAt).toLocaleString('ja-JP')}）
                  </p>
                )}
                {/* スコア選択ボタン: 選択中はそれぞれの色でハイライト */}
                <div className="space-y-3 mb-6">
                  {[
                    { score: 1, label: 'よく理解できた',         emoji: '😄', color: 'border-green-400 bg-green-50 text-green-700' },
                    { score: 2, label: 'だいたい理解できた',     emoji: '🙂', color: 'border-blue-400 bg-blue-50 text-blue-700' },
                    { score: 3, label: 'あまり理解できなかった', emoji: '😕', color: 'border-yellow-400 bg-yellow-50 text-yellow-700' },
                    { score: 4, label: '全然理解できなかった',   emoji: '😢', color: 'border-red-400 bg-red-50 text-red-700' },
                  ].map(({ score, label, emoji, color }) => (
                    <button
                      key={score}
                      onClick={() => {
                        setUnderstandingScore(score);
                        // score 1/2 に切り替えたときはコメントをクリア
                        if (score < 3) setUnderstandingComment('');
                      }}
                      className={`w-full border-2 rounded-xl px-4 py-3 flex items-center gap-3 text-sm font-semibold transition-all ${
                        understandingScore === score ? color : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-2xl">{emoji}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
                {/* 「理解できなかった」側（score 3/4）を選んだ場合のみコメント欄を表示。
                    過半数が未理解だった場合、AI がコメントを要約して教師に送られる。 */}
                {understandingScore !== null && understandingScore >= 3 && (
                  <>
                    <label className="block text-sm font-semibold text-gray-600 mb-2">何が理解できなかったか（任意）</label>
                    <textarea
                      value={understandingComment}
                      onChange={(e) => setUnderstandingComment(e.target.value)}
                      placeholder="理解できなかった内容や疑問点を書いてください..."
                      rows={3}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none mb-4"
                    />
                  </>
                )}
                {/* 送信ボタン: スコアが未選択のときは無効 */}
                <button
                  onClick={submitUnderstanding}
                  disabled={!understandingScore || understandingSubmitting}
                  className="w-full bg-teal-500 text-white rounded-xl py-3 font-semibold disabled:opacity-50 hover:bg-teal-600 transition"
                >
                  {understandingSubmitting ? '送信中...' : '回答する'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// useSearchParams を使うコンポーネントは Suspense でラップが必要（Next.js 14 の制約）
export default function StudentRoomPage() {
  return (
    <Suspense>
      <StudentRoom />
    </Suspense>
  );
}
