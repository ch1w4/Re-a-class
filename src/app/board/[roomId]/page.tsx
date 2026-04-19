'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Me { id: string; displayName: string; role: string }
interface BoardPost { id: string; content: string; authorLabel: string; createdAt: string }
interface Room { id: string; name: string; endedAt: string | null; teacher: { displayName: string } }

export default function BoardPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;

  const [me, setMe] = useState<Me | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  const fetchPosts = useCallback(async () => {
    const res = await fetch(`/api/rooms/${roomId}/board`);
    if (res.ok) setPosts(await res.json());
    else if (res.status === 403) setError('授業終了後のみ閲覧できます');
    else if (res.status === 404) setError('ルームが見つかりません');
  }, [roomId]);

  useEffect(() => {
    (async () => {
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) { router.replace('/login'); return; }
      const meData = await meRes.json();

      if (meData.role === 'TEACHER') {
        setError('掲示板は生徒・管理者のみ閲覧できます');
        setLoading(false);
        return;
      }

      setMe(meData);

      const roomRes = await fetch(`/api/rooms/${roomId}`);
      if (roomRes.ok) setRoom(await roomRes.json());

      await fetchPosts();
      setLoading(false);
    })();
  }, [roomId, router, fetchPosts]);

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
        setPosts((prev) => [...prev, post]);
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
        <div className="text-5xl mb-4">🚫</div>
        <p className="text-gray-600 font-semibold">{error}</p>
        <button onClick={() => router.back()} className="mt-4 text-indigo-600 hover:underline text-sm">← 戻る</button>
      </div>
    </div>
  );

  const isStudent = me?.role === 'STUDENT';
  const isAdmin = me?.role === 'SCHOOL_ADMIN' || me?.role === 'SERVER_ADMIN';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-2xl mx-auto">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      <header className="bg-indigo-600 text-white px-5 py-4 shadow-lg sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/home')} className="text-indigo-200 hover:text-white text-sm font-semibold">
            ← ホーム
          </button>
          <div className="text-right">
            <p className="font-semibold">{room?.name ?? roomId}</p>
            <p className="text-indigo-200 text-xs">
              {room?.teacher?.displayName} 先生 · 匿名掲示板
              {isAdmin && <span className="ml-1 bg-indigo-800 px-1.5 py-0.5 rounded text-indigo-200">管理者モード</span>}
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 mb-4 text-xs text-indigo-700">
          {isAdmin
            ? '📋 管理者モードです。投稿者の実名が表示されています。'
            : '📌 匿名掲示板です。名前は他の人に見えません。'}
        </div>

        <div className="space-y-3 mb-4">
          {posts.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">📌</div>
              <p className="text-gray-500 font-semibold">まだ投稿がありません</p>
              {isStudent && <p className="text-gray-400 text-sm mt-2">最初の投稿をしてみよう！</p>}
            </div>
          ) : (
            posts.map((p) => (
              <div key={p.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-2">
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

      {isAdmin && posts.length > 0 && (
        <div className="bg-white border-t border-gray-200 p-4 text-center text-xs text-gray-400">
          {posts.length}件の投稿 · 管理者は投稿できません
        </div>
      )}
    </div>
  );
}
