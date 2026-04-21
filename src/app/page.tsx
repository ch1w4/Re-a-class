// ルートページ（/）
// 常に /home にリダイレクトする。
// ミドルウェアが未ログインの場合は /login に転送するため、
// 実質的には「ログイン済みなら /home へ」という動作になる。
import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/home');
}
