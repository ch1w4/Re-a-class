const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  const adminId = process.env.SERVER_ADMIN_ID || 'admin';
  const adminPass = process.env.SERVER_ADMIN_PASS || adminId;
  const adminName = process.env.SERVER_ADMIN_NAME || 'サーバー管理者';

  const existing = await prisma.user.findUnique({ where: { id: adminId } });
  if (existing) {
    console.log('管理者アカウントはすでに存在します。スキップします。');
    return;
  }

  const school = await prisma.school.upsert({
    where: { prefix: 'SYS' },
    update: {},
    create: { name: 'システム', prefix: 'SYS' },
  });

  await prisma.user.create({
    data: {
      id: adminId,
      schoolId: school.id,
      role: 'SERVER_ADMIN',
      displayName: adminName,
      passwordHash: hashPassword(adminPass),
    },
  });

  console.log(`サーバー管理者を作成しました: ${adminId}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
