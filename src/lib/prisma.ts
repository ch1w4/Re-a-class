// PrismaClientのシングルトン管理。
// Next.jsの開発環境ではホットリロードのたびに新しいインスタンスが作られるのを防ぐため、
// グローバルオブジェクトにキャッシュする。
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // 開発環境ではエラーと警告のみログ出力。本番では最小限に抑える。
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
