// ──────────────────────────────────────────────
// ユーザー ID 自動採番ユーティリティ
// ──────────────────────────────────────────────
// 学校の prefix（例: "A"）+ 8 桁連番（例: "00000001"）で ID を生成する。
//
// 採番ロジック:
//   1. 同じ prefix を持つ既存 ID を全件取得
//   2. 数字部分を int に変換して Set に格納（O(1) の存在チェックのため）
//   3. 1 から順に「Set にない最小値」を探す（削除されて空いた番号も再利用する）
//   4. 見つかった番号を 8 桁ゼロ埋めして prefix を付けて返す
//
// 例: prefix = "A"、既存 ID が [A00000001, A00000003] の場合
//     → "A00000002"（抜け番号の再利用）
import { prisma } from './prisma';

/**
 * 指定した学校の prefix に対して、最小の未使用ユーザー ID を生成して返す。
 * @param schoolId 学校の UUID（DB の School.id）
 * @returns "A00000001" のような形式の ID
 */
export async function generateUserId(schoolId: string): Promise<string> {
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) throw new Error('School not found');
  const prefix = school.prefix;

  // 同じ prefix の全ユーザー ID を取得（select: { id: true } で最小限のデータ取得）
  const all = await prisma.user.findMany({
    where: { id: { startsWith: prefix } },
    select: { id: true },
  });

  // prefix 部分を除いた数字部分を Set に格納
  const used = new Set(all.map((u) => parseInt(u.id.slice(prefix.length), 10)));

  // 1 から順に未使用の最小番号を探す（削除された番号も再利用）
  let seq = 1;
  while (used.has(seq)) seq++;

  // 8 桁を超える場合は学校の収容人数上限オーバー（通常起こらない）
  if (seq > 99999999) throw new Error('ID上限に達しました');

  // 8 桁ゼロ埋め + prefix を付けて返す
  return `${prefix}${String(seq).padStart(8, '0')}`;
}
