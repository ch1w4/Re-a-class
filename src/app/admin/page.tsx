'use client';
// 管理者画面
// ログイン後、全ルームの一覧を表示する。
// 各ルームに対して「授業終了」「削除」操作が可能。
// 認証情報: username=admin / password=pass（環境変数 ADMIN_PASSWORD で変更可）

import { useState, useEffect, useCallback } from 'react';

interface Room {
  id: string;
  name: string;
  teacherName: string;
  createdAt: string;
  endedAt: string | null;
  transcript: string;
  summary: string | null;
  messageCount: number;
  reactionCount: number;
  surveyCount: number;
}

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // ページ読み込み時にセッションストレージから認証状態を復元
  useEffect(() => {
    const saved = sessionStorage.getItem('adminPassword');
    if (saved) {
      setLoggedIn(true);
    }
  }, []);

  const fetchRooms = useCallback(async () => {
    const pw = sessionStorage.getItem('adminPassword') ?? '';
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/rooms', {
        headers: { 'x-admin-password': pw },
      });
      if (!res.ok) {
        setError('ルームの取得に失敗しました');
        return;
      }
      const data = await res.json();
      setRooms(data);
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loggedIn) fetchRooms();
  }, [loggedIn, fetchRooms]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (username !== 'admin') {
      setLoginError('ユーザー名またはパスワードが違います');
      return;
    }
    // サーバーにパスワードを確認
    const res = await fetch('/api/admin/rooms', {
      headers: { 'x-admin-password': password },
    });
    if (res.ok) {
      sessionStorage.setItem('adminPassword', password);
      setLoggedIn(true);
    } else {
      setLoginError('ユーザー名またはパスワードが違います');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('adminPassword');
    setLoggedIn(false);
    setRooms([]);
    setUsername('');
    setPassword('');
  };

  const handleEnd = async (roomId: string) => {
    const pw = sessionStorage.getItem('adminPassword') ?? '';
    const res = await fetch(`/api/admin/rooms/${roomId}/end`, {
      method: 'POST',
      headers: { 'x-admin-password': pw },
    });
    if (res.ok) {
      fetchRooms();
    } else {
      const data = await res.json();
      alert(`エラー: ${data.error}`);
    }
  };

  const handleDelete = async (roomId: string) => {
    const pw = sessionStorage.getItem('adminPassword') ?? '';
    const res = await fetch(`/api/admin/rooms/${roomId}`, {
      method: 'DELETE',
      headers: { 'x-admin-password': pw },
    });
    if (res.ok) {
      setConfirmDelete(null);
      fetchRooms();
    } else {
      const data = await res.json();
      alert(`エラー: ${data.error}`);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });

  // ログイン画面
  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">管理者ログイン</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ユーザー名</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="admin"
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">パスワード</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••"
                autoComplete="current-password"
                required
              />
            </div>
            {loginError && (
              <p className="text-red-600 text-sm">{loginError}</p>
            )}
            <button
              type="submit"
              className="w-full bg-blue-600 text-white rounded-lg py-2 font-semibold hover:bg-blue-700 transition"
            >
              ログイン
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 管理画面
  return (
    <div className="min-h-screen bg-gray-100">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">Re:a Class 管理者パネル</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchRooms}
              className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition"
            >
              更新
            </button>
            <button
              onClick={handleLogout}
              className="text-sm bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg transition"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* サマリー */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{rooms.length}</p>
            <p className="text-sm text-gray-500 mt-1">総ルーム数</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center">
            <p className="text-3xl font-bold text-green-600">
              {rooms.filter((r) => !r.endedAt).length}
            </p>
            <p className="text-sm text-gray-500 mt-1">進行中</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center">
            <p className="text-3xl font-bold text-gray-500">
              {rooms.filter((r) => r.endedAt).length}
            </p>
            <p className="text-sm text-gray-500 mt-1">終了済み</p>
          </div>
        </div>

        {/* エラー・ローディング */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-6">
            {error}
          </div>
        )}
        {loading && (
          <p className="text-center text-gray-500 py-8">読み込み中...</p>
        )}

        {/* ルーム一覧 */}
        {!loading && rooms.length === 0 && !error && (
          <p className="text-center text-gray-400 py-8">ルームがありません</p>
        )}

        {!loading && rooms.length > 0 && (
          <div className="space-y-4">
            {rooms.map((room) => (
              <div
                key={room.id}
                className="bg-white rounded-xl shadow-sm p-5 border border-gray-100"
              >
                <div className="flex items-start justify-between gap-4">
                  {/* ルーム情報 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {room.id}
                      </span>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          room.endedAt
                            ? 'bg-gray-100 text-gray-500'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {room.endedAt ? '終了済み' : '進行中'}
                      </span>
                      {room.summary && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                          要約あり
                        </span>
                      )}
                    </div>
                    <h2 className="mt-2 text-lg font-semibold text-gray-800 truncate">
                      {room.name}
                    </h2>
                    <p className="text-sm text-gray-500">担当: {room.teacherName}</p>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-400">
                      <span>作成: {formatDate(room.createdAt)}</span>
                      {room.endedAt && <span>終了: {formatDate(room.endedAt)}</span>}
                      <span>チャット {room.messageCount}件</span>
                      <span>リアクション {room.reactionCount}件</span>
                      <span>アンケート {room.surveyCount}件</span>
                      {room.transcript && (
                        <span>書き起こし {room.transcript.length}文字</span>
                      )}
                    </div>
                  </div>

                  {/* アクションボタン */}
                  <div className="flex flex-col gap-2 shrink-0">
                    {!room.endedAt && (
                      <button
                        onClick={() => handleEnd(room.id)}
                        className="text-sm bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border border-yellow-200 px-4 py-1.5 rounded-lg transition whitespace-nowrap"
                      >
                        授業終了
                      </button>
                    )}
                    <button
                      onClick={() => setConfirmDelete(room.id)}
                      className="text-sm bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-4 py-1.5 rounded-lg transition whitespace-nowrap"
                    >
                      削除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 削除確認ダイアログ */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-bold text-gray-800 mb-2">削除の確認</h3>
            <p className="text-sm text-gray-600 mb-4">
              このルームとすべてのデータ（チャット・リアクション・アンケート・書き起こし）を
              完全に削除します。この操作は取り消せません。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-2 font-medium transition"
              >
                キャンセル
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg py-2 font-medium transition"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
