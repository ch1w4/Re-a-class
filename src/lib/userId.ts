import { prisma } from './prisma';

export async function generateUserId(schoolId: string): Promise<string> {
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) throw new Error('School not found');
  const prefix = school.prefix;

  const users = await prisma.user.findMany({
    where: { id: { startsWith: prefix } },
    orderBy: { id: 'desc' },
    take: 1,
  });

  const seq = users.length === 0 ? 1 : parseInt(users[0].id.slice(prefix.length), 10) + 1;
  if (seq > 99999999) throw new Error('ID上限に達しました');
  return `${prefix}${String(seq).padStart(8, '0')}`;
}
