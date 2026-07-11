'use client';
// ホームページ (/home)
// 教師・生徒が使うメインダッシュボード。ロールによって表示内容が変わる。
// 教師: 授業を作成するフォーム + 作成した講義一覧
// 生徒: ルームID入力で授業参加 + 参加した講義一覧（終了済みは掲示板へのリンク付き）
// 共通: ベルアイコンの通知ドロップダウン（未読バッジ表示）、10 秒ごとに通知を更新

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { BellIcon } from '@/components/icons/bellIcon';
import { SettingIcon } from '@/components/icons/settiongicon';
import { LogOutIcon } from '@/components/icons/logOutIcon';

interface Me { id: string; displayName: string; role: string; schoolName: string }
interface Room {
  id: string; name: string; createdAt: string; endedAt: string | null;
  teacher?: { displayName: string };  // 生徒向けレスポンスのみ付与される教師名
  _count?: { enrollments: number };   // 教師・管理者向けレスポンスのみ付与される参加者数
}
interface Notification { id: string; title: string; body: string; link: string | null; isRead: boolean; createdAt: string }

export default function HomePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);                           // ログイン中ユーザー情報
  const [rooms, setRooms] = useState<Room[]>([]);                          // 講義一覧（ロールごとに内容が異なる）
  const [notifications, setNotifications] = useState<Notification[]>([]); // 通知一覧（最新 50 件）
  const [showNotif, setShowNotif] = useState(false);                       // 通知ドロップダウンの開閉状態
  const [showSettings, setShowSettings] = useState(false);                 // 設定ドロップダウンの開閉状態
  const [showPasswordModal, setShowPasswordModal] = useState(false);       // パスワード変更モーダル
  const [roomId, setRoomId] = useState('');                                // 生徒が入力するルームID（参加時に使用）
  const [loading, setLoading] = useState(true);                            // 初回データ取得中のローディング状態
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null); // 削除確認中のルームID
  const [advancing, setAdvancing] = useState(false);   // 時間スキップ処理中フラグ
  const [advanceMsg, setAdvanceMsg] = useState('');    // スキップ結果メッセージ（3秒で消える）
  const settingsRef = useRef<HTMLDivElement>(null);

  // 初回マウント時に me / rooms / notifications を並列取得する。
  // SERVER_ADMIN は /admin へ、SCHOOL_ADMIN は /school-admin へリダイレクト。
  // TEACHER / STUDENT のみここに残ってダッシュボードを表示する。
  const fetchAll = useCallback(async () => {
    const [meRes, roomsRes, notifRes] = await Promise.all([
      fetch('/api/auth/me'),
      fetch('/api/rooms'),
      fetch('/api/notifications'),
    ]);
    if (!meRes.ok) { router.push('/login'); return; }
    const meData = await meRes.json();
    // 管理者ロールは専用パネルへ振り分け
    if (meData.role === 'SERVER_ADMIN') { router.replace('/admin'); return; }
    if (meData.role === 'SCHOOL_ADMIN') { router.replace('/school-admin'); return; }
    setMe(meData);
    if (roomsRes.ok) setRooms(await roomsRes.json());
    if (notifRes.ok) setNotifications(await notifRes.json());
    setLoading(false);
  }, [router]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // 通知は 10 秒ごとに静かに更新する。
  // 理解度チェック通知（授業終了 4 日後）をリアルタイムに反映するために必要。
  // rooms は変動が少ないのでポーリング対象外とする。
  useEffect(() => {
    const iv = setInterval(() => {
      fetch('/api/notifications').then((r) => r.json()).then(setNotifications).catch(() => { });
    }, 10000);
    return () => clearInterval(iv); // アンマウント時にタイマーを停止
  }, []);

  // 設定ドロップダウン外クリックで閉じる
  useEffect(() => {
    if (!showSettings) return;
    const onPointerDown = (e: PointerEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [showSettings]);

  // セッション Cookie を削除してログインページへ遷移
  const logout = async () => {
    setShowSettings(false);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  // 教師が授業を開始する: ルームを POST で作成し、即座に教師用授業画面へ遷移
  const createRoom = async (name: string) => {
    const res = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const data = await res.json();
    if (res.ok) router.push(`/teacher/${data.id}`);
  };

  // 生徒が入力したルームIDで授業に参加する。
  // IDは大文字変換して渡す（教師が配布するIDは大文字のため）。
  const joinRoom = () => {
    if (!roomId.trim()) return;
    router.push(`/student/${roomId.trim().toUpperCase()}`);
  };

  // 通知をクリックしたとき: 既読フラグをサーバーに送り、link があれば遷移する。
  // ローカル state を直接 map 更新することで再フェッチなしでバッジをリアルタイム更新。
  const markRead = async (id: string, link: string | null) => {
    await fetch(`/api/notifications/${id}`, { method: 'PATCH' });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
    if (link) router.push(link);
    setShowNotif(false);
  };

  // デモ用: 時間をスキップして理解度チェックの通知・集計処理を即時実行する
  const advanceTime = async () => {
    setAdvancing(true);
    try {
      const res = await fetch('/api/debug/advance-time', { method: 'POST' });
      const data = await res.json();
      setAdvanceMsg(data.message ?? '完了');
      fetchAll(); // 通知バッジを更新
      setTimeout(() => setAdvanceMsg(''), 4000);
    } finally {
      setAdvancing(false);
    }
  };

  // ルームを物理削除する（教師のみ）。削除後はローカル state からも除去。
  const deleteRoom = async (id: string) => {
    const res = await fetch(`/api/rooms/${id}?mode=delete`, { method: 'DELETE' });
    if (res.ok) {
      setRooms((prev) => prev.filter((r) => r.id !== id));
      setConfirmDeleteId(null);
    }
  };

  const unread = notifications.filter((n) => !n.isRead).length; // ベルアイコンに重ねる未読バッジの件数

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-700 text-white px-4 sm:px-6 py-4 shadow sticky top-0 z-10">
        <div className="flex items-center justify-between w-full gap-3">
          <div className="min-w-0">
            <span className="text-xl font-bold">Re:a Class</span>
            <span className="ml-3 text-blue-200 text-sm hidden sm:inline">{me?.schoolName}</span>
          </div>
          <div className="relative flex items-center gap-1 sm:gap-2 shrink-0 ml-auto" ref={settingsRef}>
            {/* 名前 → 🔔 → 設定（スマホは名前タップでメニュー、設定アイコンは md 以上） */}
            <button
              type="button"
              onClick={() => { setShowSettings(!showSettings); setShowNotif(false); }}
              className="md:hidden font-semibold text-sm px-1 py-2 rounded-lg hover:bg-white/10 transition"
              aria-label="メニュー"
              aria-expanded={showSettings}
            >
              {me?.displayName}
            </button>
            <p className="hidden md:block font-semibold text-sm px-1">{me?.displayName}</p>
            <button
              onClick={() => { setShowNotif(!showNotif); setShowSettings(false); }}
              className="relative p-2 rounded-full group"
              aria-label="通知"
            >
              <BellIcon className="w-6 h-6 text-white transition-colors duration-200 group-hover:text-yellow-500" />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                  {unread}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => { setShowSettings(!showSettings); setShowNotif(false); }}
              className="hidden md:block p-2 rounded-full group"
              aria-label="設定"
              aria-expanded={showSettings}
            >
              <SettingIcon className="w-6 h-6 text-white transition-colors duration-200 group-hover:text-blue-200" />
            </button>
            {showSettings && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-2xl border border-gray-100 py-1 z-50">
                <button
                  onClick={() => { setShowSettings(false); setShowPasswordModal(true); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition"
                >
                  パスワード変更
                </button>
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition"
                >
                  <LogOutIcon className="w-4 h-4" />
                  ログアウト
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 通知ドロップダウン: fixed でヘッダー直下に表示。isRead=false は青背景でハイライト */}
      {showNotif && (
        <div className="fixed top-16 right-4 bg-white rounded-2xl shadow-2xl border border-gray-100 w-80 z-50 max-h-[80vh] overflow-y-auto">
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

      {showPasswordModal && (
        <PasswordChangeModal onClose={() => setShowPasswordModal(false)} />
      )}

      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        {/* 教師のみ: 新しい授業を作成するフォーム */}
        {me?.role === 'TEACHER' && (
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-base font-bold text-gray-700 mb-3">授業を開始</h2>
            <RoomCreateForm onCreate={createRoom} />
          </section>
        )}

        {/* 生徒のみ: ルームIDを入力して授業に参加するフォーム */}
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

        {/* 講義一覧: 教師は自分が作成したルーム、生徒は参加したルームを表示 */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-base font-bold text-gray-700 mb-4">
            {me?.role === 'TEACHER' ? '作成した講義' : '参加した講義'}
          </h2>
          {rooms.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">講義がまだありません</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {rooms.map((r) => (
                <div key={r.id} className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between gap-2">
                  {/* 授業名・日付をクリックで教師/生徒それぞれの授業画面へ遷移 */}
                  <button onClick={() => router.push(me?.role === 'TEACHER' ? `/teacher/${r.id}` : `/student/${r.id}`)}
                    className="flex-1 text-left hover:opacity-80 transition">
                    <p className="font-semibold text-gray-800">{r.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {me?.role === 'STUDENT' && r.teacher && `${r.teacher.displayName} 先生 · `}
                      {new Date(r.createdAt).toLocaleDateString('ja-JP')}
                    </p>
                  </button>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* 教師向け: 参加人数を表示 */}
                    {r._count && <span className="text-xs text-gray-400">{r._count.enrollments}人</span>}
                    {/* 生徒向け: 授業終了後は掲示板タブを開いた状態で授業画面へ遷移するリンクボタンを表示 */}
                    {r.endedAt && me?.role === 'STUDENT' && (
                      <button onClick={() => router.push(`/student/${r.id}?tab=board`)}
                        className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold hover:bg-indigo-200 transition">
                        掲示板
                      </button>
                    )}
                    {/* 授業ステータスバッジ: 進行中=緑、終了=グレー */}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${r.endedAt ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                      {r.endedAt ? '終了' : '進行中'}
                    </span>
                    {/* 教師向け: 削除ボタン（確認UI付き） */}
                    {me?.role === 'TEACHER' && (
                      confirmDeleteId === r.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-red-600 font-semibold">削除？</span>
                          <button onClick={() => deleteRoom(r.id)}
                            className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-lg font-semibold hover:bg-red-600 transition">
                            はい
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)}
                            className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-lg font-semibold hover:bg-gray-300 transition">
                            いいえ
                          </button>
                        </div>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(r.id); }}
                          className="text-xs text-red-400 hover:text-red-600 font-semibold transition px-1">
                          削除
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      {/* デモ用: 右下固定の時間スキップボタン */}
      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-2 z-50">
        {advanceMsg && (
          <div className="bg-gray-800 text-white text-xs px-3 py-2 rounded-xl shadow-lg max-w-56 text-right leading-snug">
            {advanceMsg}
          </div>
        )}
        <button
          onClick={advanceTime}
          disabled={advancing}
          className="flex items-center gap-2 bg-gray-900 hover:bg-gray-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-xl transition"
        >
          <span>{advancing ? '⏳' : '⏩'}</span>
          <span>{advancing ? '処理中...' : '時間をスキップ'}</span>
        </button>
      </div>
    </div>
  );
}

// 教師用の授業作成フォームコンポーネント（授業名を入力して開始ボタンを押す）
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

function PasswordChangeModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => onClose(), 2000);
    return () => clearTimeout(t);
    // onClose は親のインライン関数のため依存に入れない（タイマーリセット防止）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const submit = async () => {
    setError('');
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('すべての項目を入力してください');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('新しいパスワードが一致しません');
      return;
    }
    if (newPassword.length < 4) {
      setError('新しいパスワードは4文字以上にしてください');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? '変更に失敗しました');
        return;
      }
      setDone(true);
    } catch {
      setError('変更に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none">
        <div className="bg-gray-900 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl">
          変更が完了しました。
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-gray-800">パスワード変更</h3>
        <div>
          <label className="block text-sm text-gray-600 mb-1">現在のパスワード</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">新しいパスワード</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">新しいパスワード（確認）</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition"
          >
            キャンセル
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {saving ? '変更中...' : '変更する'}
          </button>
        </div>
      </div>
    </div>
  );
}
