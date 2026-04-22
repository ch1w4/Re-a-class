// ──────────────────────────────────────────────
// 認証ユーティリティ
// ──────────────────────────────────────────────
// パスワードのハッシュ化・検証と、DB セッションの管理を行う。
//
// hashPassword   : scrypt + ランダムソルト（32 文字 hex）でハッシュ化。
//                  DB 保存フォーマットは "salt:hash"（コロン区切り）
// verifyPassword : timingSafeEqual でタイミング攻撃を防ぎながら比較
//                  タイミング攻撃 = 比較にかかる時間からパスワードを推測する攻撃
// createSession  : DB に Session レコードを INSERT し、7 日有効な UUID を返す
// getSessionUser : session_id Cookie の値 → ログイン中 User を返す。
//                  セッションが存在しない or 期限切れなら null を返し古いレコードを削除
// deleteSession  : ログアウト時にセッションを DB から削除
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import { prisma } from './prisma';

/**
 * 平文パスワードを "ソルト:ハッシュ" 形式の文字列に変換する。
 * salt は 16 バイト（32 文字 hex）のランダム値で、毎回異なる値が生成される。
 * 同じパスワードでも salt が違えばハッシュが変わるので、レインボーテーブル攻撃を防げる。
 */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');               // ランダムソルト生成
  const hash = scryptSync(plain, salt, 64).toString('hex');  // scrypt でハッシュ化（64 バイト出力）
  return `${salt}:${hash}`;                                  // "salt:hash" 形式で返す
}

/**
 * ログイン時のパスワード照合。
 * DB から取り出した stored（"salt:hash" 形式）と入力された plain を比較する。
 * timingSafeEqual を使うことで、文字列の先頭から一致確認するような
 * 「早期 return」によるタイミング攻撃を防ぐ。
 */
export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;  // フォーマット不正はそのまま false
  try {
    const hashBuffer = Buffer.from(hash, 'hex');
    const supplied = scryptSync(plain, salt, 64);  // 入力パスワードを同じソルトでハッシュ
    return timingSafeEqual(hashBuffer, supplied);  // 定数時間比較
  } catch {
    return false;
  }
}

/**
 * ログイン成功後にセッションを DB へ保存し、session_id（UUID）を返す。
 * 返り値を httpOnly Cookie にセットすることでクライアントに渡す。
 * セッションの有効期限は 7 日間。
 */
export async function createSession(userId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 日後
  const session = await prisma.session.create({ data: { userId, expiresAt } });
  return session.id;  // UUID がそのまま Cookie の値になる
}

/**
 * Cookie に入っている session_id からログイン中ユーザーを取得する。
 * - sessionId が空 → null
 * - DB にセッションが存在しない → null
 * - 有効期限切れ → セッションを削除して null
 * - 正常 → User（school を含む）を返す
 */
export async function getSessionUser(sessionId: string) {
  if (!sessionId) return null;
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: { include: { school: true } } },  // ロール・学校名の取得に使う
  });
  if (!session || session.expiresAt < new Date()) {
    // 期限切れのセッションはその場で削除（放置するとゴミが溜まるため）
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.user;
}

/** ログアウト: Cookie に対応するセッションを DB から削除する */
export async function deleteSession(sessionId: string) {
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
}
