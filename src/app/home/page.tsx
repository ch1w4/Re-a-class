'use client';
// ホームページ (/home)
// 教師・生徒が使うメインダッシュボード。ロールによって表示内容が変わる。
// 教師: 授業を作成するフォーム + 作成した講義一覧
// 生徒: ルームID入力で授業参加 + 参加した講義一覧（終了済みは掲示板へのリンク付き）
// 共通: ベルアイコンの通知ドロップダウン（未読バッジ表示）、10 秒ごとに通知を更新

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Me { id: string; displayName: string; role: string; schoolName: string }
interface Room {
  id: string; name: string; createdAt: string; endedAt: string | null;
  teacher?: { displayName: string };
  _count?: { enrollments: number };
}
interface Notification { id: string; title: string; body: string; link: string | null; isRead: boolean; createdAt: string }

export default function HomePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotif, setShowNotif] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const [meRes, roomsRes, notifRes] = await Promise.all([
      fetch('/api/auth/me'),
      fetch('/api/rooms'),
      fetch('/api/notifications'),
    ]);
    if (!meRes.ok) { router.push('/login'); return; }
    const meData = await meRes.json();
    if (meData.role === 'SERVER_ADMIN') { router.replace('/admin'); return; }
    if (meData.role === 'SCHOOL_ADMIN') { router.replace('/school-admin'); return; }
    setMe(meData);
    if (roomsRes.ok) setRooms(await roomsRes.json());
    if (notifRes.ok) setNotifications(await notifRes.json());
    setLoading(false);
  }, [router]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const iv = setInterval(() => {
      fetch('/api/notifications').then((r) => r.json()).then(setNotifications).catch(() => {});
    }, 10000);
    return () => clearInterval(iv);
  }, []);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const createRoom = async (name: string) => {
    const res = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const data = await res.json();
    if (res.ok) router.push(`/teacher/${data.id}`);
  };

  const joinRoom = () => {
    if (!roomId.trim()) return;
    router.push(`/student/${roomId.trim().toUpperCase()}`);
  };

  const markRead = async (id: string, link: string | null) => {
    await fetch(`/api/notifications/${id}`, { method: 'PATCH' });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
    if (link) router.push(link);
    setShowNotif(false);
  };

  const unread = notifications.filter((n) => !n.isRead).length;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-700 text-white px-6 py-4 shadow sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <span className="text-xl font-bold">Re:a Class</span>
            <span className="ml-3 text-blue-200 text-sm">{me?.schoolName}</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setShowNotif(!showNotif)} className="relative">
              <span className="text-2xl">🔔</span>
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                  {unread}
                </span>
              )}
            </button>
            <div className="text-right">
              <p className="font-semibold text-sm">{me?.displayName}</p>
              <button onClick={logout} className="text-xs text-blue-200 hover:text-white transition">ログアウト</button>
            </div>
          </div>
        </div>
      </header>

      {/* 通知ドロップダウン */}
      {showNotif && (
        <div className="fixed top-16 right-4 bg-white rounded-2xl shadow-2xl border border-gray-100 w-80 z-50 max-h-96 overflow-y-auto">
          <div className="p-4 border-b">
            <h3 className="font-bold text-gray-700">通知</h3>
          </div>
          {notifications.length === 0 ? (
            <p className="p-4 text-gray-400 text-sm text-center">通知はありません</p>
          ) : (
            notifications.map((n) => (
              <button key={n.id} onClick={() => markRead(n.id, n.link)}
                className={`w-full text-left p-4 border-b last:border-0 hover:bg-gray-50 transition ${!n.isRead ? 'bg-blue-50' : ''}`}>
                <p className="font-semibold text-sm text-gray-800">{n.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                <p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString('ja-JP')}</p>
              </button>
            ))
          )}
        </div>
      )}

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* 教師: ルーム作成 */}
        {me?.role === 'TEACHER' && (
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-base font-bold text-gray-700 mb-3">授業を開始</h2>
            <RoomCreateForm onCreate={createRoom} />
          </section>
        )}

        {/* 生徒: ルーム参加 */}
        {me?.role === 'STUDENT' && (
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-base font-bold text-gray-700 mb-3">授業に参加</h2>
            <div className="flex gap-2">
              <input value={roomId} onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                placeholder="ルームID（例: ABCD1234）"
                className="flex-1 border rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-400" />
              <button onClick={joinRoom} disabled={!roomId.trim()}
                className="px-4 py-2 bg-teal-500 text-white rounded-xl text-sm font-bold hover:bg-teal-600 disabled:opacity-50 transition">
                参加
              </button>
            </div>
          </section>
        )}

        {/* 講義一覧 */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-base font-bold text-gray-700 mb-4">
            {me?.role === 'TEACHER' ? '作成した講義' : '参加した講義'}
          </h2>
          {rooms.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">講義がまだありません</p>
          ) : (
            <div className="space-y-2">
              {rooms.map((r) => (
                <div key={r.id} className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between gap-2">
                  <button onClick={() => router.push(me?.role === 'TEACHER' ? `/teacher/${r.id}` : `/student/${r.id}`)}
                    className="flex-1 text-left hover:opacity-80 transition">
                    <p className="font-semibold text-gray-800">{r.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {me?.role === 'STUDENT' && r.teacher && `${r.teacher.displayName} 先生 · `}
                      {new Date(r.createdAt).toLocaleDateString('ja-JP')}
                    </p>
                  </button>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {r._count && <span className="text-xs text-gray-400">{r._count.enrollments}人</span>}
                    {r.endedAt && me?.role === 'STUDENT' && (
                      <button onClick={() => router.push(`/board/${r.id}`)}
                        className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold hover:bg-indigo-200 transition">
                        掲示板
                      </button>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${r.endedAt ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                      {r.endedAt ? '終了' : '進行中'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function RoomCreateForm({ onCreate }: { onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <div className="flex gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && name.trim() && onCreate(name)}
        placeholder="授業名（例: プログラミング基礎）"
        className="flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
      <button onClick={() => onCreate(name)} disabled={!name.trim()}
        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition">
        開始
      </button>
    </div>
  );
}
