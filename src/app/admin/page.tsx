'use client';
// 管理者画面
// ログイン後、全ルームの一覧を表示する。
// 各ルームに対して「授業終了」「削除」操作が可能。
// 認証情報: username=admin / password=pass（環境変数 ADMIN_PASSWORD で変更可）

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

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

type SortKey =
  | 'createdAt_desc'
  | 'createdAt_asc'
  | 'autoDelete_asc'
  | 'autoEnd_asc'
  | 'reaction_desc'
  | 'message_desc'
  | 'survey_desc';

const SORT_LABELS: Record<SortKey, string> = {
  createdAt_desc: '作成日時（新しい順）',
  createdAt_asc:  '作成日時（古い順）',
  autoDelete_asc: '自動削除まで（近い順）',
  autoEnd_asc:    '自動終了まで（近い順）',
  reaction_desc:  'リアクション数（多い順）',
  message_desc:   'チャット数（多い順）',
  survey_desc:    'アンケート数（多い順）',
};

// 残り時間を「X日Y時間Z分」形式の文字列に変換
function formatRemaining(ms: number): string {
  if (ms <= 0) return '間もなく';
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}日${hours > 0 ? `${hours}時間` : ''}後`;
  if (hours > 0) return `${hours}時間${mins > 0 ? `${mins}分` : ''}後`;
  return `${mins}分後`;
}

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [expandedSummary, setExpandedSummary] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt_desc');
  // カウントダウン表示用に1分ごとに再レンダリング
  const [, setTick] = useState(0);
  const scrollRef = useRef<number>(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  // ページ読み込み時にセッションストレージから認証状態を復元
  useEffect(() => {
    const saved = sessionStorage.getItem('adminPassword');
    if (saved) setLoggedIn(true);
  }, []);

  const fetchRooms = useCallback(async (silent = false) => {
    const pw = sessionStorage.getItem('adminPassword') ?? '';
    if (!silent) setRefreshing(true);
    setError('');
    // スクロール位置を保存してから更新
    scrollRef.current = window.scrollY;
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
      // スクロール位置を復元
      requestAnimationFrame(() => window.scrollTo({ top: scrollRef.current }));
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setRefreshing(false);
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
      // ローカルの state だけ即時更新してスクロールを維持
      setRooms((prev) =>
        prev.map((r) => (r.id === roomId ? { ...r, endedAt: new Date().toISOString() } : r))
      );
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
      // ローカルの state から該当ルームを削除（スクロール位置維持）
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
    } else {
      const data = await res.json();
      alert(`エラー: ${data.error}`);
    }
  };

  const toggleSummary = (roomId: string) => {
    setExpandedSummary((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });

  // 自動終了まで: createdAt + 2時間
  const autoEndRemaining = (room: Room): string | null => {
    if (room.endedAt) return null;
    const ms = new Date(room.createdAt).getTime() + 2 * 60 * 60 * 1000 - Date.now();
    return ms > 0 ? `${formatRemaining(ms)}に自動終了` : '間もなく自動終了';
  };

  // 自動削除まで: endedAt + 7日
  const autoDeleteRemaining = (room: Room): string | null => {
    if (!room.endedAt) return null;
    const ms = new Date(room.endedAt).getTime() + 7 * 24 * 60 * 60 * 1000 - Date.now();
    return ms > 0 ? `${formatRemaining(ms)}に自動削除` : '間もなく自動削除';
  };

  // 検索＋並べ替えを適用したルーム一覧
  const filteredRooms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? rooms.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.teacherName.toLowerCase().includes(q)
        )
      : rooms;

    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'createdAt_desc':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'createdAt_asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'autoDelete_asc': {
          // 終了済みルームを先に（削除が近い順）、進行中は末尾
          const msA = a.endedAt
            ? new Date(a.endedAt).getTime() + 7 * 24 * 60 * 60 * 1000
            : Infinity;
          const msB = b.endedAt
            ? new Date(b.endedAt).getTime() + 7 * 24 * 60 * 60 * 1000
            : Infinity;
          return msA - msB;
        }
        case 'autoEnd_asc': {
          // 進行中ルームを先に（終了が近い順）、終了済みは末尾
          const msA = a.endedAt
            ? Infinity
            : new Date(a.createdAt).getTime() + 2 * 60 * 60 * 1000;
          const msB = b.endedAt
            ? Infinity
            : new Date(b.createdAt).getTime() + 2 * 60 * 60 * 1000;
          return msA - msB;
        }
        case 'reaction_desc':
          return b.reactionCount - a.reactionCount;
        case 'message_desc':
          return b.messageCount - a.messageCount;
        case 'survey_desc':
          return b.surveyCount - a.surveyCount;
        default:
          return 0;
      }
    });
  }, [rooms, searchQuery, sortKey]);

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
            {loginError && <p className="text-red-600 text-sm">{loginError}</p>}
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
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">Re:a Class 管理者パネル</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchRooms()}
              disabled={refreshing}
              className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
            >
              {refreshing ? '更新中...' : '更新'}
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

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-6">
            {error}
          </div>
        )}

        {/* 検索・並べ替えツールバー */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 mb-6 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          {/* 検索ボックス */}
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="授業名・教師名で検索..."
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* 並べ替えセレクト */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-gray-500 whitespace-nowrap">並べ替え:</span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>{SORT_LABELS[k]}</option>
              ))}
            </select>
          </div>

          {/* 件数表示 */}
          <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
            {filteredRooms.length} / {rooms.length} 件
          </span>
        </div>

        {rooms.length === 0 && !error && (
          <p className="text-center text-gray-400 py-8">ルームがありません</p>
        )}
        {rooms.length > 0 && filteredRooms.length === 0 && (
          <p className="text-center text-gray-400 py-8">「{searchQuery}」に一致するルームがありません</p>
        )}

        {/* ルーム一覧 */}
        <div className="space-y-4">
          {filteredRooms.map((room) => {
            const endNote = autoEndRemaining(room);
            const deleteNote = autoDeleteRemaining(room);
            const summaryOpen = expandedSummary.has(room.id);

            return (
              <div
                key={room.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    {/* ルーム情報 */}
                    <div className="flex-1 min-w-0">
                      {/* バッジ行 */}
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

                      {/* ルーム名・担当 */}
                      <h2 className="mt-2 text-lg font-semibold text-gray-800 truncate">
                        {room.name}
                      </h2>
                      <p className="text-sm text-gray-500">担当: {room.teacherName}</p>

                      {/* 日時・統計 */}
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

                      {/* カウントダウン */}
                      <div className="mt-2 flex flex-wrap gap-3">
                        {endNote && (
                          <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                            {endNote}
                          </span>
                        )}
                        {deleteNote && (
                          <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">
                            {deleteNote}
                          </span>
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
                      {(room.summary || room.transcript) && (
                        <button
                          onClick={() => toggleSummary(room.id)}
                          className="text-sm bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 px-4 py-1.5 rounded-lg transition whitespace-nowrap"
                        >
                          {summaryOpen ? '閉じる' : '要約を見る'}
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

                {/* 要約・書き起こしパネル（展開時） */}
                {summaryOpen && (
                  <div className="border-t border-gray-100 bg-gray-50 p-5 space-y-4">
                    {room.summary ? (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-2">授業要約</h3>
                        <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap text-sm leading-relaxed bg-white rounded-lg p-4 border border-gray-200">
                          {room.summary}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">要約はまだ生成されていません</p>
                    )}
                    {room.transcript && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-2">書き起こし</h3>
                        <div className="text-sm text-gray-600 whitespace-pre-wrap bg-white rounded-lg p-4 border border-gray-200 max-h-60 overflow-y-auto leading-relaxed">
                          {room.transcript}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
