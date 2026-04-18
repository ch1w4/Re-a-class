'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const login = async () => {
    if (!userId.trim() || !password.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }

      const redirect = params.get('redirect');
      if (data.role === 'SERVER_ADMIN') {
        router.push(redirect || '/admin');
      } else if (data.role === 'SCHOOL_ADMIN') {
        router.push(redirect || '/school-admin');
      } else {
        router.push(redirect || '/home');
      }
    } catch {
      setError('接続エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-teal-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-blue-700 mb-2">Re:a Class</h1>
          <div className="h-1 w-20 bg-red-400 mx-auto mb-3 rounded-full" />
          <p className="text-gray-500">ログイン</p>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-xl border border-blue-100 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">ユーザーID</label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && login()}
              placeholder="A00000001"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && login()}
              placeholder="••••••••"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            onClick={login}
            disabled={loading || !userId.trim() || !password.trim()}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
          <p className="text-xs text-gray-400 text-center">初期パスワードはユーザーIDと同じです</p>
        </div>
      </div>
    </main>
  );
}
