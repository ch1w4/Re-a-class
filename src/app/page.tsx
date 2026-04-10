'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<'select' | 'teacher' | 'student'>('select');
  const [teacherName, setTeacherName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const createRoom = async () => {
    if (!teacherName.trim() || !roomName.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherName, roomName }),
      });
      const data = await res.json();
      localStorage.setItem(`reaclass_teacher_token_${data.id}`, data.teacherToken);
      router.push(`/teacher/${data.id}`);
    } catch {
      setError('ルームの作成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = () => {
    if (!roomId.trim()) return;
    router.push(`/student/${roomId.trim().toUpperCase()}`);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-teal-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-5xl font-bold text-blue-700 mb-2">Re:a Class</h1>
          <div className="h-1 w-24 bg-red-400 mx-auto mb-4 rounded-full"></div>
          <p className="text-gray-500 text-lg">対面授業の補助をするWebアプリケーション</p>
        </div>

        {mode === 'select' && (
          <div className="space-y-4">
            <button
              onClick={() => setMode('teacher')}
              className="w-full py-5 bg-blue-600 text-white rounded-2xl text-xl font-bold hover:bg-blue-700 active:scale-95 transition-all shadow-lg shadow-blue-200"
            >
              👨‍🏫 教師として始める
            </button>
            <button
              onClick={() => setMode('student')}
              className="w-full py-5 bg-teal-500 text-white rounded-2xl text-xl font-bold hover:bg-teal-600 active:scale-95 transition-all shadow-lg shadow-teal-200"
            >
              🎓 生徒として参加する
            </button>
          </div>
        )}

        {mode === 'teacher' && (
          <div className="bg-white rounded-3xl p-8 shadow-xl border border-blue-100">
            <h2 className="text-2xl font-bold text-blue-700 mb-6">ルームを作成</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">教師名</label>
                <input
                  type="text"
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createRoom()}
                  placeholder="山田 太郎"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">授業名</label>
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createRoom()}
                  placeholder="プログラミング基礎"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button
                onClick={createRoom}
                disabled={loading || !teacherName.trim() || !roomName.trim()}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? '作成中...' : 'ルームを作成'}
              </button>
              <button
                onClick={() => { setMode('select'); setError(''); }}
                className="w-full py-3 text-gray-400 hover:text-gray-600 transition text-sm"
              >
                ← 戻る
              </button>
            </div>
          </div>
        )}

        {mode === 'student' && (
          <div className="bg-white rounded-3xl p-8 shadow-xl border border-teal-100">
            <h2 className="text-2xl font-bold text-teal-600 mb-6">ルームに参加</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">ルームID</label>
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                  placeholder="XXXXXXXX"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-teal-400 transition font-mono text-center text-lg tracking-widest"
                />
              </div>
              <button
                onClick={joinRoom}
                disabled={!roomId.trim()}
                className="w-full py-3 bg-teal-500 text-white rounded-xl font-bold hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                参加する
              </button>
              <button
                onClick={() => setMode('select')}
                className="w-full py-3 text-gray-400 hover:text-gray-600 transition text-sm"
              >
                ← 戻る
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-8">
          対面授業をもっとインタラクティブに
        </p>
      </div>
    </main>
  );
}
