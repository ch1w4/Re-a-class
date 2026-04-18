'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface User { id: string; displayName: string; role: string; createdAt: string }

export default function SchoolAdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [addTab, setAddTab] = useState<'single' | 'bulk'>('single');
  const [role, setRole] = useState<'TEACHER' | 'STUDENT'>('STUDENT');

  // 1人追加
  const [displayName, setDisplayName] = useState('');
  const [startSeq, setStartSeq] = useState('');

  // 一括追加
  const [bulkNames, setBulkNames] = useState('');
  const [bulkStartSeq, setBulkStartSeq] = useState('');
  const [bulkResult, setBulkResult] = useState<{ id: string; displayName: string }[] | null>(null);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me').then(async (res) => {
      if (!res.ok) { router.replace('/login'); return; }
      const data = await res.json();
      if (data.role !== 'SCHOOL_ADMIN') { router.replace('/home'); }
    });
  }, [router]);

  const fetchUsers = useCallback(async () => {
    const res = await fetch('/api/school-admin/users');
    if (res.ok) setUsers(await res.json());
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const createSingle = async () => {
    if (!displayName.trim()) return;
    setLoading(true); setError('');
    const body: Record<string, unknown> = { displayName, role };
    const n = parseInt(startSeq);
    if (startSeq && !isNaN(n) && n >= 1) body.startSeq = n;

    const res = await fetch('/api/school-admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); } else {
      alert(`作成しました\nID: ${data.id}\n初期パスワード: ${data.id}`);
      setDisplayName(''); setStartSeq(''); fetchUsers();
    }
    setLoading(false);
  };

  const createBulk = async () => {
    const names = bulkNames.split('\n').map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;
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
      setBulkResult(data.created);
      setBulkNames(''); setBulkStartSeq(''); fetchUsers();
    }
    setLoading(false);
  };

  const deleteUser = async (id: string) => {
    if (!confirm(`${id} を削除しますか？`)) return;
    await fetch(`/api/school-admin/users/${id}`, { method: 'DELETE' });
    fetchUsers();
  };

  const resetPassword = async (id: string) => {
    if (!confirm(`${id} のパスワードをIDにリセットしますか？`)) return;
    await fetch(`/api/school-admin/users/${id}`, { method: 'PATCH' });
    alert('パスワードをリセットしました');
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const teachers = users.filter((u) => u.role === 'TEACHER');
  const students = users.filter((u) => u.role === 'STUDENT');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-teal-700 text-white px-6 py-4 shadow flex items-center justify-between">
        <h1 className="text-xl font-bold">Re:a Class — 学校管理</h1>
        <button onClick={logout} className="text-sm text-teal-200 hover:text-white transition">ログアウト</button>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-8">

        {/* ユーザー追加 */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-gray-700 mb-4">ユーザーを追加</h2>

          {/* タブ */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-5">
            {(['single', 'bulk'] as const).map((t) => (
              <button key={t} onClick={() => {
                setAddTab(t);
                setError('');
                setBulkResult(null);
                setDisplayName('');
                setStartSeq('');
                setBulkNames('');
                setBulkStartSeq('');
              }}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${addTab === t ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {t === 'single' ? '1人追加' : '一括追加'}
              </button>
            ))}
          </div>

          {/* ロール選択（共通） */}
          <div className="mb-4 w-40">
            <label className="block text-sm text-gray-600 mb-1">ロール</label>
            <select value={role} onChange={(e) => setRole(e.target.value as 'TEACHER' | 'STUDENT')}
              className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
              <option value="STUDENT">生徒</option>
              <option value="TEACHER">教師</option>
            </select>
          </div>

          {addTab === 'single' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm text-gray-600 mb-1">氏名</label>
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createSingle()}
                    placeholder="山田 太郎"
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">ID番号（任意）</label>
                  <input value={startSeq} onChange={(e) => setStartSeq(e.target.value)}
                    type="number" min={1} placeholder="自動"
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button onClick={createSingle} disabled={loading || !displayName.trim()}
                className="px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-bold hover:bg-teal-700 disabled:opacity-50 transition">
                追加
              </button>
            </div>
          )}

          {addTab === 'bulk' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">氏名リスト（1行1人）</label>
                <textarea value={bulkNames} onChange={(e) => setBulkNames(e.target.value)}
                  placeholder={'山田 太郎\n鈴木 花子\n田中 一郎'}
                  rows={8}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-y font-mono" />
                <p className="text-xs text-gray-400 mt-1">
                  {bulkNames.split('\n').filter((n) => n.trim()).length} 人
                </p>
              </div>
              <div className="w-48">
                <label className="block text-sm text-gray-600 mb-1">開始ID番号（任意）</label>
                <input value={bulkStartSeq} onChange={(e) => setBulkStartSeq(e.target.value)}
                  type="number" min={1} placeholder="自動（続き番号）"
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button onClick={createBulk}
                disabled={loading || bulkNames.split('\n').filter((n) => n.trim()).length === 0}
                className="px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-bold hover:bg-teal-700 disabled:opacity-50 transition">
                {loading ? '作成中...' : '一括追加'}
              </button>

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

        {/* 教師一覧 */}
        <UserTable title="教師" users={teachers} onDelete={deleteUser} onReset={resetPassword} />

        {/* 生徒一覧 */}
        <UserTable title="生徒" users={students} onDelete={deleteUser} onReset={resetPassword} />
      </div>
    </div>
  );
}

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
