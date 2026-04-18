'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface School { id: string; name: string; prefix: string; createdAt: string; _count: { users: number } }

export default function AdminPage() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [adminName, setAdminName] = useState('');
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchSchools = useCallback(async () => {
    const res = await fetch('/api/server-admin/schools');
    if (res.ok) setSchools(await res.json());
  }, []);

  useEffect(() => { fetchSchools(); }, [fetchSchools]);

  const createSchool = async () => {
    if (!name.trim() || !prefix.trim()) return;
    setLoading(true); setError('');
    const res = await fetch('/api/server-admin/schools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, prefix }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); } else { setName(''); setPrefix(''); fetchSchools(); }
    setLoading(false);
  };

  const deleteSchool = async (id: string) => {
    if (!confirm('この学校を削除しますか？すべてのユーザーとデータが削除されます。')) return;
    await fetch(`/api/server-admin/schools/${id}`, { method: 'DELETE' });
    fetchSchools();
  };

  const createAdmin = async () => {
    if (!selectedSchool || !adminName.trim()) return;
    setLoading(true); setError('');
    const res = await fetch(`/api/server-admin/schools/${selectedSchool.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: adminName }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); } else {
      alert(`学校管理者を作成しました\nID: ${data.id}\n初期パスワード: ${data.id}`);
      setAdminName(''); setSelectedSchool(null); fetchSchools();
    }
    setLoading(false);
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-700 text-white px-6 py-4 shadow flex items-center justify-between">
        <h1 className="text-xl font-bold">Re:a Class — サーバー管理</h1>
        <button onClick={logout} className="text-sm text-blue-200 hover:text-white transition">ログアウト</button>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-8">
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-gray-700 mb-4">学校一覧</h2>
          {schools.length === 0 ? (
            <p className="text-gray-400 text-sm">学校がまだありません</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2">学校名</th><th className="pb-2">Prefix</th>
                  <th className="pb-2">ユーザー数</th><th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {schools.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-3 font-medium">{s.name}</td>
                    <td className="py-3 font-mono text-blue-600">{s.prefix}</td>
                    <td className="py-3">{s._count.users}人</td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <button onClick={() => setSelectedSchool(s)}
                          className="text-xs bg-teal-100 text-teal-700 px-2 py-1 rounded-lg hover:bg-teal-200 transition">
                          管理者を追加
                        </button>
                        <button onClick={() => deleteSchool(s.id)}
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

        <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-gray-700 mb-4">学校を追加</h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">学校名</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="○○大学"
                className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Prefix（英数字）</label>
              <input value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} placeholder="A"
                className="w-full border rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-3">ユーザーIDは <span className="font-mono">{prefix || 'PREFIX'}00000001</span> から始まります</p>
          {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
          <button onClick={createSchool} disabled={loading || !name.trim() || !prefix.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition">
            追加
          </button>
        </section>
      </div>

      {selectedSchool && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold mb-1">{selectedSchool.name}</h3>
            <p className="text-sm text-gray-500 mb-4">学校管理者を追加します</p>
            <label className="block text-sm text-gray-600 mb-1">氏名</label>
            <input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="山田 花子"
              className="w-full border rounded-xl px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-teal-400" />
            {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setSelectedSchool(null); setError(''); }}
                className="flex-1 py-2 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition">
                キャンセル
              </button>
              <button onClick={createAdmin} disabled={loading || !adminName.trim()}
                className="flex-1 py-2 bg-teal-500 text-white rounded-xl text-sm font-bold hover:bg-teal-600 disabled:opacity-50 transition">
                作成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
