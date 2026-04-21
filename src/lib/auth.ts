// 認証ユーティリティ
// パスワードのハッシュ化・検証と、DB セッションの管理を行う。
// hashPassword   : scrypt + ランダムソルトで安全にハッシュ化。フォーマット "salt:hash"
// verifyPassword : timingSafeEqual でタイミング攻撃を防ぎながら比較
// createSession  : DB に Session レコードを作成し、7 日間有効な session ID を返す
// getSessionUser : session ID → User(+School) を返す。期限切れは自動削除
// deleteSession  : ログアウト時にセッションを削除
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import { prisma } from './prisma';

// plain テキストを "ソルト:ハッシュ" 形式に変換して DB 保存用文字列を生成する
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  try {
    const hashBuffer = Buffer.from(hash, 'hex');
    const supplied = scryptSync(plain, salt, 64);
    return timingSafeEqual(hashBuffer, supplied);
  } catch {
    return false;
  }
}

export async function createSession(userId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 日後に期限切れ
  const session = await prisma.session.create({ data: { userId, expiresAt } });
  return session.id;
}

// Cookie の session_id 値からログインユーザーを取得する。
// セッションが存在しない・期限切れの場合は null を返し、古いレコードをその場で削除する。
export async function getSessionUser(sessionId: string) {
  if (!sessionId) return null;
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: { include: { school: true } } },
  });
  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.user;
}

export async function deleteSession(sessionId: string) {
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
}
