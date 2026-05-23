'use client';
// 学校管理パネル (/school-admin)
// ロール SCHOOL_ADMIN のみアクセス可能。他のロールは /home にリダイレクト。
// 機能:
//   - ユーザー追加（1 人 or 一括）。ロール TEACHER / STUDENT を選択。
//     開始 ID 番号を指定可能、省略時は最小未使用番号を自動採番。
//     初期パスワードはユーザー ID と同一。
//   - 教師・生徒の一覧表示とパスワードリセット・削除
//   - 終了済み講義の掲示板へのリンク一覧

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface User { id: string; displayName: string; role: string; createdAt: string }
interface Room { id: string; name: string; endedAt: string | null; teacher: { displayName: string } }

export default function SchoolAdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);   // 学校内の全ユーザー一覧
  const [rooms, setRooms] = useState<Room[]>([]);   // 学校内の全ルーム一覧（掲示板リンク表示用）
  const [addTab, setAddTab] = useState<'single' | 'bulk'>('single'); // 追加タブ（1人/一括）

  // 追加フォームの共通設定
  const [role, setRole] = useState<'TEACHER' | 'STUDENT'>('STUDENT'); // 追加するユーザーのロール

  // 1 人追加フォームの状態
  const [displayName, setDisplayName] = useState('');  // 氏名
  const [startSeq, setStartSeq] = useState('');        // 開始 ID 番号（省略可）

  // 一括追加フォームの状態
  const [bulkNames, setBulkNames] = useState('');      // 氏名リスト（1 行 1 人）
  const [bulkStartSeq, setBulkStartSeq] = useState(''); // 一括追加の開始 ID 番号（省略可）
  // 一括追加の結果: 作成されたユーザーの ID・氏名一覧
  const [bulkResult, setBulkResult] = useState<{ id: string; displayName: string }[] | null>(null);

  const [error, setError] = useState('');        // フォームエラーメッセージ
  const [loading, setLoading] = useState(false); // API 呼び出し中フラグ
  // formKey を変化させることでフォームコンポーネントをリセットする
  const [formKey, setFormKey] = useState(0);

  // ロールに応じたID番号の範囲を返す
  const getRoleValidation = (r: 'TEACHER' | 'STUDENT') => {
    if (r === 'TEACHER') return { min: 90000001, max: 99999999, label: '90000001 〜 99999999' };
    return { min: 10000001, max: 89999999, label: '10000001 〜 89999999' };
  };

  // 入力されたID番号が範囲内に収まっているかチェックする
  const validateSeq = (seq: string, r: 'TEACHER' | 'STUDENT') => {
    if (!seq) return null; // 省略時はAPIの自動採番に任せるのでOK
    const n = parseInt(seq);
    if (isNaN(n)) return '正しい数値を入力してください';
    const { min, max } = getRoleValidation(r);
    if (n < min || n > max) return `ID番号は ${min} 〜 ${max} の範囲で指定してください`;
    return null;
  };

  // マウント時: ロール確認（SCHOOL_ADMIN 以外は /home へリダイレクト）
  useEffect(() => {
    fetch('/api/auth/me').then(async (res) => {
      if (!res.ok) { router.replace('/login'); return; }
      const data = await res.json();
      if (data.role !== 'SCHOOL_ADMIN') { router.replace('/home'); }
    });
  }, [router]);

  // 学校内ユーザー一覧を再取得する（ユーザー追加・削除後に呼ぶ）
  const fetchUsers = useCallback(async () => {
    const res = await fetch('/api/school-admin/users');
    if (res.ok) setUsers(await res.json());
  }, []);

  // 学校内ルーム一覧を取得する（終了済み講義の掲示板リンク表示用）
  const fetchRooms = useCallback(async () => {
    const res = await fetch('/api/rooms');
    if (res.ok) setRooms(await res.json());
  }, []);

  useEffect(() => { fetchUsers(); fetchRooms(); }, [fetchUsers, fetchRooms]);

  // 1 人追加: displayName・role・startSeq を POST して新規ユーザーを作成する
  const createSingle = async () => {
    if (!displayName.trim()) return;

    // 手動入力された番号の範囲チェック
    const validationError = validateSeq(startSeq, role);
    if (validationError) {
      setError(validationError);
      return;
    }
    
    setLoading(true); setError('');
    const body: Record<string, unknown> = { displayName, role };
    const n = parseInt(startSeq);
    // startSeq が有効な正整数の場合のみ body に含める（省略時は API 側が自動採番）
    if (startSeq && !isNaN(n) && n >= 1) body.startSeq = n;

    const res = await fetch('/api/school-admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); } else {
      // 作成した ID と初期パスワード（= ID）を alert で通知
      alert(`作成しました\nID: ${data.id}\n初期パスワード: ${data.id}`);
      setFormKey((k) => k + 1); // key を変化させてフォームをリセット
      fetchUsers();
    }
    setLoading(false);
  };

  // 一括追加: names 配列と role・startSeq を POST して複数ユーザーを一括作成する
  const createBulk = async () => {
    const names = bulkNames.split('\n').map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    // 一括追加の開始番号の範囲チェック
    const validationError = validateSeq(bulkStartSeq, role);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true); setError(''); setBulkResult(null);

    const body: Record<string, unknown> = { names, role };
    const n = parseInt(bulkStartSeq);
    if (bulkStartSeq && !isNaN(n) && n >= 1) body.startSeq = n;

    const res = await fetch('/api/school-admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); } else {
      // 作成結果をテーブルで表示する
      setBulkResult(data.created);
      setFormKey((k) => k + 1);
      fetchUsers();
    }
    setLoading(false);
  };

  // ユーザーを削除する（confirm で二重確認）
  const deleteUser = async (id: string) => {
    if (!confirm(`${id} を削除しますか？`)) return;
    await fetch(`/api/school-admin/users/${id}`, { method: 'DELETE' });
    fetchUsers();
  };

  // パスワードをユーザー ID にリセットする（忘れた場合の対応）
  const resetPassword = async (id: string) => {
    if (!confirm(`${id} のパスワードをIDにリセットしますか？`)) return;
    await fetch(`/api/school-admin/users/${id}`, { method: 'PATCH' });
    alert('パスワードをリセットしました');
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  // ユーザー一覧をロール別に分割して表示する
  const teachers = users.filter((u) => u.role === 'TEACHER');
  const students = users.filter((u) => u.role === 'STUDENT');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-teal-700 text-white px-6 py-4 shadow flex items-center justify-between">
        <h1 className="text-xl font-bold">Re:a Class — 学校管理</h1>
        <button onClick={logout} className="text-sm text-teal-200 hover:text-white transition">ログアウト</button>
      </header>

      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-8">

        {/* ユーザー追加セクション */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-gray-700 mb-4">ユーザーを追加</h2>

          {/* タブ切り替え: 1人追加 / 一括追加 */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-5">
            {(['single', 'bulk'] as const).map((t) => (
              <button key={t} onClick={() => {
                setAddTab(t);
                setError('');
                setBulkResult(null);
                setFormKey((k) => k + 1); // タブ切り替え時にフォームをリセット
              }}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${addTab === t ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {t === 'single' ? '1人追加' : '一括追加'}
              </button>
            ))}
          </div>

          {/* ロール選択: タブ共通（教師/生徒） */}
          <div className="mb-4 w-40">
            <label className="block text-sm text-gray-600 mb-1">ロール</label>
            <select value={role} onChange={(e) => setRole(e.target.value as 'TEACHER' | 'STUDENT')}
              className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
              <option value="STUDENT">生徒</option>
              <option value="TEACHER">教師</option>
            </select>
          </div>

          {/* 1 人追加フォーム: key が変わるたびに再マウントしてリセット */}
          {addTab === 'single' && (
            <div key={formKey} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm text-gray-600 mb-1">氏名</label>
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createSingle()}
                    placeholder="山田 太郎"
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
                <div>
                  {/* ID 番号の指定（省略時は自動採番） */}
                  <label className="block text-sm text-gray-600 mb-1">
                    ID番号（任意: <span className="text-[10px] text-gray-400">{getRoleValidation(role).label}</span>）
                  </label>
                  <input value={startSeq} onChange={(e) => setStartSeq(e.target.value)}
                    type="number" 
                    min={getRoleValidation(role).min} 
                    max={getRoleValidation(role).max} 
                    placeholder={`自動 (${getRoleValidation(role).min}〜)`}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                  {/* <p className="text-[10px] text-gray-400 mt-1">{getRoleValidation(role).label}</p> */}
                </div>
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button onClick={createSingle} disabled={loading || !displayName.trim()}
                className="px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-bold hover:bg-teal-700 disabled:opacity-50 transition">
                追加
              </button>
            </div>
          )}

          {/* 一括追加フォーム */}
          {addTab === 'bulk' && (
            <div key={formKey} className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">氏名リスト（1行1人）</label>
                <textarea value={bulkNames} onChange={(e) => setBulkNames(e.target.value)}
                  placeholder={'山田 太郎\n鈴木 花子\n田中 一郎'}
                  rows={8}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-y font-mono" />
                {/* リアルタイムで入力人数を表示 */}
                <p className="text-xs text-gray-400 mt-1">
                  {bulkNames.split('\n').filter((n) => n.trim()).length} 人
                </p>
              </div>
              <div className="w-56">
                <label className="block text-sm text-gray-600 mb-1">
                  ID番号（任意: <span className="text-[10px] text-gray-400">{getRoleValidation(role).label}</span>）
                </label>
                <input value={bulkStartSeq} onChange={(e) => setBulkStartSeq(e.target.value)}
                  type="number" 
                  min={getRoleValidation(role).min} 
                  max={getRoleValidation(role).max} 
                  placeholder={`自動 (${getRoleValidation(role).min}〜)`}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                {/* <p className="text-[10px] text-gray-400 mt-1">{getRoleValidation(role).label}</p> */}
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button onClick={createBulk}
                disabled={loading || bulkNames.split('\n').filter((n) => n.trim()).length === 0}
                className="px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-bold hover:bg-teal-700 disabled:opacity-50 transition">
                {loading ? '作成中...' : '一括追加'}
              </button>

              {/* 作成結果テーブル: ID と氏名を一覧表示（初期パスワードは ID と同一） */}
              {bulkResult && (
                <div className="mt-4 bg-teal-50 border border-teal-200 rounded-xl p-4">
                  <p className="text-sm font-bold text-teal-700 mb-2">{bulkResult.length}人を作成しました（初期パスワード = ID）</p>
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="text-teal-600"><th className="text-left pb-1">ID</th><th className="text-left pb-1">氏名</th></tr></thead>
                      <tbody>
                        {bulkResult.map((u) => (
                          <tr key={u.id} className="border-t border-teal-100">
                            <td className="py-1 font-mono text-blue-700">{u.id}</td>
                            <td className="py-1">{u.displayName}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* 終了済み講義の掲示板リンク一覧（終了済みルームが 1 件以上ある場合のみ表示） */}
        {rooms.filter((r) => r.endedAt).length > 0 && (
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold text-gray-700 mb-4">終了済み講義の掲示板</h2>
            <div className="space-y-2">
              {rooms.filter((r) => r.endedAt).map((r) => (
                <div key={r.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                  <div>
                    <p className="font-semibold text-sm text-gray-800">{r.name}</p>
                    <p className="text-xs text-gray-400">{r.teacher?.displayName} 先生 · {new Date(r.endedAt!).toLocaleDateString('ja-JP')} 終了</p>
                  </div>
                  {/* 管理者モードで掲示板を閲覧（実名表示） */}
                  <button onClick={() => router.push(`/board/${r.id}`)}
                    className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg font-semibold hover:bg-indigo-200 transition">
                    掲示板を見る
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ユーザー一覧: 教師と生徒を別々のテーブルで表示 */}
        <UserTable title="教師" users={teachers} onDelete={deleteUser} onReset={resetPassword} />
        <UserTable title="生徒" users={students} onDelete={deleteUser} onReset={resetPassword} />
      </div>
    </div>
  );
}

// ユーザーテーブルコンポーネント: PW リセット・削除ボタン付き
function UserTable({ title, users, onDelete, onReset }: {
  title: string; users: User[];
  onDelete: (id: string) => void; onReset: (id: string) => void;
}) {
  return (
    <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <h2 className="text-lg font-bold text-gray-700 mb-4">{title}一覧 ({users.length}人)</h2>
      {users.length === 0 ? (
        <p className="text-gray-400 text-sm">{title}がまだいません</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2">ID</th><th className="pb-2">氏名</th><th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="py-2 font-mono text-xs text-blue-600">{u.id}</td>
                <td className="py-2">{u.displayName}</td>
                <td className="py-2">
                  <div className="flex gap-2">
                    {/* PW リセット: パスワードをユーザー ID に戻す */}
                    <button onClick={() => onReset(u.id)}
                      className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-lg hover:bg-yellow-200 transition">
                      PW reset
                    </button>
                    <button onClick={() => onDelete(u.id)}
                      className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-lg hover:bg-red-200 transition">
                      削除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
