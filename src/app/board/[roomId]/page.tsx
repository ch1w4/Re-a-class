'use client';
// 授業後の匿名掲示板ページ (/board/[roomId])
// 授業終了後に生徒が感想・質問を匿名で投稿できる掲示板。
// 生徒同士は匿名ラベル（「生徒A」等）で表示されるため、互いの発信者がわからない。
// SCHOOL_ADMIN/SERVER_ADMIN は実名表示（管理者モード）。
// TEACHER はアクセス不可（403 エラー表示）。
// 投稿一覧は初回取得後も 3 秒ごとにポーリングして他者の投稿を反映する。

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AirPlaneIcon } from '@/components/icons/airPlaneIcon';
import { ClipboardIcon } from '@/components/icons/clipboardIcon';
import { NoSymbolIcon } from '@/components/icons/nosymbolIcon';

interface Me { id: string; displayName: string; role: string }
interface BoardPost { id: string; content: string; authorLabel: string; createdAt: string }
interface Room { id: string; name: string; endedAt: string | null; teacher: { displayName: string } }

export default function BoardPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;

  const [me, setMe] = useState<Me | null>(null);           // ログイン中ユーザー情報（ロール判定に使用）
  const [room, setRoom] = useState<Room | null>(null);     // 授業情報（名前・教師名の表示用）
  const [posts, setPosts] = useState<BoardPost[]>([]);     // 掲示板の投稿一覧
  const [message, setMessage] = useState('');              // 投稿入力テキスト
  const [sending, setSending] = useState(false);           // 投稿送信中フラグ（二重投稿防止）
  const [error, setError] = useState('');                  // アクセス制限やルーム未存在のエラーメッセージ
  const [loading, setLoading] = useState(true);            // 初回ロード中フラグ
  const [toast, setToast] = useState('');                  // トースト通知（2 秒で消える）

  // 2 秒間トーストを表示する
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  // 掲示板の投稿一覧を取得する。
  // 授業終了前は 403、ルーム未存在は 404 を返す。
  const fetchPosts = useCallback(async () => {
    const res = await fetch(`/api/rooms/${roomId}/board`);
    if (res.ok) setPosts(await res.json());
    else if (res.status === 403) setError('授業終了後のみ閲覧できます');
    else if (res.status === 404) setError('ルームが見つかりません');
  }, [roomId]);

  // マウント時: ログイン確認 → TEACHER はアクセス拒否 → ルーム情報・投稿一覧を取得
  useEffect(() => {
    (async () => {
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) { router.replace('/login'); return; }
      const meData = await meRes.json();

      // 教師はこのページにアクセスできない（専用の授業画面を使うため）
      if (meData.role === 'TEACHER') {
        setError('掲示板は生徒・管理者のみ閲覧できます');
        setLoading(false);
        return;
      }

      setMe(meData);

      // ヘッダーに授業名・教師名を表示するためにルーム情報を取得
      const roomRes = await fetch(`/api/rooms/${roomId}`);
      if (roomRes.ok) setRoom(await roomRes.json());

      await fetchPosts();
      setLoading(false);
    })();
  }, [roomId, router, fetchPosts]);

  // 掲示板一覧を 3 秒ごとに再取得（他者投稿の反映）。エラー・初回読み込み中は開始しない。
  // ブラウザで別タブを手前にしたときは間隔を止め、戻ったときに再開して即時 1 回取得する。
  useEffect(() => {
    if (loading || error) return;

    let id: ReturnType<typeof setInterval> | null = null;
    const run = () => { void fetchPosts(); };
    const stop = () => {
      if (id != null) {
        clearInterval(id);
        id = null;
      }
    };
    const start = () => {
      if (id != null) return;
      run();
      id = setInterval(run, 3000);
    };

    const onVis = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [loading, error, fetchPosts]);

  // 掲示板に投稿する。
  // 成功後はローカル state に追加して即時表示（再フェッチ不要）。
  const sendPost = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/board`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message }),
      });
      if (res.ok) {
        const post = await res.json();
        setPosts((prev) => [...prev, post]); // ローカル state に追加して即時表示
        setMessage('');
        showToast('投稿しました！');
      } else {
        const data = await res.json();
        showToast(data.error ?? '投稿に失敗しました');
      }
    } finally {
      setSending(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <NoSymbolIcon className="w-20 h-20 text-red-500" />
        </div>
        <p className="text-gray-600 font-semibold">{error}</p>
        <button onClick={() => router.back()} className="mt-4 text-indigo-600 hover:underline text-sm">← 戻る</button>
      </div>
    </div>
  );

  const isStudent = me?.role === 'STUDENT';
  // 管理者モード: 投稿者の実名を表示する（通常は匿名ラベル）
  const isAdmin = me?.role === 'SCHOOL_ADMIN' || me?.role === 'SERVER_ADMIN';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-2xl mx-auto">
      {/* トースト通知 */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      {/* ヘッダー: 授業名・教師名・管理者モードバッジを表示 */}
      <header className="bg-indigo-600 text-white px-5 py-4 shadow-lg sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/home')} className="text-indigo-200 hover:text-white text-sm font-semibold">
            ← ホーム
          </button>
          <div className="text-right">
            <p className="font-semibold">{room?.name ?? roomId}</p>
            <p className="text-indigo-200 text-xs">
              {room?.teacher?.displayName} 先生 · 匿名掲示板
              {/* 管理者には実名表示中であることを示すバッジを表示 */}
              {isAdmin && <span className="ml-1 bg-indigo-800 px-1.5 py-0.5 rounded text-indigo-200">管理者モード</span>}
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {/* 匿名モード / 管理者モードの説明バナー */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 mb-4 text-xs text-indigo-700 flex items-center gap-2">
          {isAdmin ? (
            <>
              <ClipboardIcon className="w-5 h-5 shrink-0 text-gray-400" />
              <span>管理者モードです。投稿者の実名が表示されています。</span>
            </>
          ) : (
            <>
              <AirPlaneIcon className="w-5 h-5 shrink-0" />
              <span>匿名掲示板です。名前は他の人に見えません。</span>
            </>
          )}
        </div>

        {/* 投稿一覧 */}
        <div className="space-y-3 mb-4">
          {posts.length === 0 ? (
            <div className="text-center py-16">
              <div className="flex justify-center mb-4">
                <AirPlaneIcon className="w-12 h-12" />
              </div>
              <p className="text-gray-500 font-semibold">まだ投稿がありません</p>
              {isStudent && <p className="text-gray-400 text-sm mt-2">最初の投稿をしてみよう！</p>}
            </div>
          ) : (
            posts.map((p) => (
              <div key={p.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  {/* 管理者は実名（gray）、生徒は匿名ラベル（indigo）で表示 */}
                  <span className={`text-xs font-semibold ${isAdmin ? 'text-gray-700' : 'text-indigo-600'}`}>
                    {p.authorLabel}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(p.createdAt).toLocaleString('ja-JP')}
                  </span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{p.content}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 生徒のみ投稿フォームを表示（管理者は閲覧のみ） */}
      {isStudent && (
        <div className="bg-white border-t border-gray-200 p-4 flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendPost()}
            placeholder="感想や質問を投稿..."
            className="flex-1 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            onClick={sendPost}
            disabled={!message.trim() || sending}
            className="bg-indigo-500 text-white rounded-2xl px-4 py-3 font-semibold disabled:opacity-50 hover:bg-indigo-600 transition"
          >
            投稿
          </button>
        </div>
      )}

      {/* 管理者向けフッター: 投稿件数と操作不可の案内 */}
      {isAdmin && posts.length > 0 && (
        <div className="bg-white border-t border-gray-200 p-4 text-center text-xs text-gray-400">
          {posts.length}件の投稿 · 管理者は投稿できません
        </div>
      )}
    </div>
  );
}
