'use client';
// 学校管理者向け 掲示板実名確認ページ (/board/[roomId])
// 授業終了後の匿名掲示板の投稿者を、同一学校の SCHOOL_ADMIN が実名で確認するための専用画面。
// アクセス制御は layout.tsx（requirePageRole）が SCHOOL_ADMIN 専用として行う。
// 生徒向けの匿名掲示板（閲覧・投稿）は /student/[roomId] の「掲示板」タブに統合されている。
// 投稿一覧は初回取得後も 3 秒ごとにポーリングして他者の投稿を反映する。

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AirPlaneIcon } from '@/components/icons/airPlaneIcon';
import { ClipboardIcon } from '@/components/icons/clipboardIcon';
import { NoSymbolIcon } from '@/components/icons/nosymbolIcon';

interface BoardPost { id: string; content: string; authorLabel: string; createdAt: string }
interface Room { id: string; name: string; endedAt: string | null; teacher: { displayName: string } }

export default function BoardPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;

  const [room, setRoom] = useState<Room | null>(null);     // 授業情報（名前・教師名の表示用）
  const [posts, setPosts] = useState<BoardPost[]>([]);     // 掲示板の投稿一覧
  const [error, setError] = useState('');                  // アクセス制限やルーム未存在のエラーメッセージ
  const [loading, setLoading] = useState(true);            // 初回ロード中フラグ

  // 掲示板の投稿一覧を取得する。
  // 授業終了前は 403、ルーム未存在（または他校のルーム）は 404 を返す。
  const fetchPosts = useCallback(async () => {
    const res = await fetch(`/api/rooms/${roomId}/board`);
    if (res.ok) setPosts(await res.json());
    else if (res.status === 403) setError('授業終了後のみ閲覧できます');
    else if (res.status === 404) setError('ルームが見つかりません');
  }, [roomId]);

  // マウント時: ルーム情報・投稿一覧を取得する（ロール確認は layout 側で完了済み）
  useEffect(() => {
    (async () => {
      // ヘッダーに授業名・教師名を表示するためにルーム情報を取得
      const roomRes = await fetch(`/api/rooms/${roomId}`);
      if (roomRes.ok) setRoom(await roomRes.json());

      await fetchPosts();
      setLoading(false);
    })();
  }, [roomId, fetchPosts]);

  // 掲示板一覧を 3 秒ごとに再取得（他者投稿の反映）。エラー・初回読み込み中は開始しない。
  // ブラウザで別タブを手前にしたときは間隔を止め、戻ったときに再開して即時 1 回取得する。
  useEffect(() => {
    if (loading || error) return;

    let id: ReturnType<typeof setInterval> | null = null;
    const run = () => { void fetchPosts(); };
    const stop = () => {
      if (id != null) {
        clearInterval(id);
        id = null;
      }
    };
    const start = () => {
      if (id != null) return;
      run();
      id = setInterval(run, 3000);
    };

    const onVis = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [loading, error, fetchPosts]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <NoSymbolIcon className="w-20 h-20 text-red-500" />
        </div>
        <p className="text-gray-600 font-semibold">{error}</p>
        <button onClick={() => router.back()} className="mt-4 text-indigo-600 hover:underline text-sm">← 戻る</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-2xl mx-auto">
      {/* ヘッダー: 授業名・教師名を表示 */}
      <header className="bg-indigo-600 text-white px-5 py-4 shadow-lg sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/school-admin')} className="text-indigo-200 hover:text-white text-sm font-semibold">
            ← 管理画面
          </button>
          <div className="text-right">
            <p className="font-semibold">{room?.name ?? roomId}</p>
            <p className="text-indigo-200 text-xs">
              {room?.teacher?.displayName} 先生 · 匿名掲示板
              <span className="ml-1 bg-indigo-800 px-1.5 py-0.5 rounded text-indigo-200">管理者モード</span>
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {/* 管理者モードの説明バナー */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 mb-4 text-xs text-indigo-700 flex items-center gap-2">
          <ClipboardIcon className="w-5 h-5 shrink-0 text-gray-400" />
          <span>管理者モードです。投稿者の実名が表示されています。</span>
        </div>

        {/* 投稿一覧 */}
        <div className="space-y-3 mb-4">
          {posts.length === 0 ? (
            <div className="text-center py-16">
              <div className="flex justify-center mb-4">
                <AirPlaneIcon className="w-12 h-12" />
              </div>
              <p className="text-gray-500 font-semibold">まだ投稿がありません</p>
            </div>
          ) : (
            posts.map((p) => (
              <div key={p.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-700">{p.authorLabel}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(p.createdAt).toLocaleString('ja-JP')}
                  </span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{p.content}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 投稿件数と操作不可の案内 */}
      {posts.length > 0 && (
        <div className="bg-white border-t border-gray-200 p-4 text-center text-xs text-gray-400">
          {posts.length}件の投稿 · 管理者は投稿できません
        </div>
      )}
    </div>
  );
}
