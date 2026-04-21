// ユーザー ID 自動採番ユーティリティ
// 学校の prefix（例: "A"）+ 8 桁連番（例: "00000001"）で ID を生成する。
// 既存 ID の中から最小の未使用番号を探して割り当てる（抜け番号の再利用）。
// 上限は 99,999,999 で、超えた場合はエラーをスローする。
import { prisma } from './prisma';

// 例: schoolId に対応する prefix が "A" なら "A00000001", "A00000002" ... を返す
export async function generateUserId(schoolId: string): Promise<string> {
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) throw new Error('School not found');
  const prefix = school.prefix;

  const all = await prisma.user.findMany({
    where: { id: { startsWith: prefix } },
    select: { id: true },
  });
  const used = new Set(all.map((u) => parseInt(u.id.slice(prefix.length), 10)));
  let seq = 1;
  while (used.has(seq)) seq++;

  if (seq > 99999999) throw new Error('ID上限に達しました');
  return `${prefix}${String(seq).padStart(8, '0')}`;
}
