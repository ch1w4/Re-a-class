import { prisma } from './prisma';

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
