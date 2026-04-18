'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface User { id: string; displayName: string; role: string; createdAt: string }

export default function SchoolAdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'TEACHER' | 'STUDENT'>('STUDENT');
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

  const createUser = async () => {
    if (!displayName.trim()) return;
    setLoading(true); setError('');
    const res = await fetch('/api/school-admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, role }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); } else {
      alert(`ユーザーを作成しました\nID: ${data.id}\n初期パスワード: ${data.id}`);
      setDisplayName(''); fetchUsers();
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

  const roleLabel = (r: string) => ({ SCHOOL_ADMIN: '学校管理者', TEACHER: '教師', STUDENT: '生徒', SERVER_ADMIN: 'システム' }[r] ?? r);
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
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="col-span-2">
              <label className="block text-sm text-gray-600 mb-1">氏名</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="山田 太郎"
                className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">ロール</label>
              <select value={role} onChange={(e) => setRole(e.target.value as 'TEACHER' | 'STUDENT')}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
                <option value="STUDENT">生徒</option>
                <option value="TEACHER">教師</option>
              </select>
            </div>
          </div>
          {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
          <button onClick={createUser} disabled={loading || !displayName.trim()}
            className="px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-bold hover:bg-teal-700 disabled:opacity-50 transition">
            追加
          </button>
        </section>

        {/* 教師一覧 */}
        <UserTable title="教師" users={teachers} roleLabel={roleLabel} onDelete={deleteUser} onReset={resetPassword} />

        {/* 生徒一覧 */}
        <UserTable title="生徒" users={students} roleLabel={roleLabel} onDelete={deleteUser} onReset={resetPassword} />
      </div>
    </div>
  );
}

function UserTable({ title, users, roleLabel, onDelete, onReset }: {
  title: string; users: User[]; roleLabel: (r: string) => string;
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
