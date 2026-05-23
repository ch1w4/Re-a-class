// 学校管理者用 ユーザー一覧・作成 API
// GET  /api/school-admin/users — 同一学校内のユーザー一覧を返す
// POST /api/school-admin/users — ユーザーを 1 人または一括で追加する
//   body.names（配列）があれば一括追加、なければ 1 人追加。
//   ID は「学校 prefix + 8 桁連番」（startSeq 省略時は最小未使用番号）で自動採番。
//   初期パスワードはユーザー ID と同一。
//   作成できるロールは TEACHER / STUDENT のみ（SCHOOL_ADMIN 以上は別エンドポイント）。
// ロール: SCHOOL_ADMIN / SERVER_ADMIN
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { hashPassword } from '@/lib/auth';
import type { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { error, user } = await requireAuth(request, ['SCHOOL_ADMIN', 'SERVER_ADMIN']);
  if (error) return error;

  // 自分の学校のユーザーのみ返す（schoolId でテナント分離）
  const users = await prisma.user.findMany({
    where: { schoolId: user!.schoolId },
    orderBy: { id: 'asc' },
    select: { id: true, displayName: true, role: true, createdAt: true },
  });
  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const { error, user } = await requireAuth(request, ['SCHOOL_ADMIN', 'SERVER_ADMIN']);
  if (error) return error;

  const body = await request.json();
  const { role, startSeq } = body;

  // SCHOOL_ADMIN が作成できるのは TEACHER / STUDENT のみ
  const allowedRoles: Role[] = ['TEACHER', 'STUDENT'];
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: '無効なロールです' }, { status: 400 });
  }

  const school = await prisma.school.findUnique({ where: { id: user!.schoolId } });
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 });

  const prefix = school.prefix;

  // 1. ロールごとのID範囲を定義
  const minSeq = role === 'TEACHER' ? 90000001 : 10000001;
  const maxSeq = role === 'TEACHER' ? 99999999 : 89999999;

  // 2. 開始シーケンス番号を決定する。
  let seq: number;
  if (startSeq !== undefined && startSeq !== null) {
    seq = Number(startSeq);
    // フロントエンドでもチェックしていますが、API側でも厳密に範囲をチェックします
    if (!Number.isInteger(seq) || seq < minSeq || seq > maxSeq) {
      return NextResponse.json({ error: `ID番号は ${minSeq} 〜 ${maxSeq} の範囲で指定してください` }, { status: 400 });
    }
  } else {
    // 既存ユーザーの ID から使用済み番号の集合を作り、ロールごとの範囲内で最小の未使用番号を探す
    const all = await prisma.user.findMany({
      where: { id: { startsWith: prefix } },
      select: { id: true },
    });
    const used = new Set(all.map((u) => parseInt(u.id.slice(prefix.length), 10)));
    
    // seq=1 ではなく、指定されたロールの最小番号（minSeq）からスタートする
    seq = minSeq;
    while (used.has(seq)) {
      seq++;
    }
    
    // 万が一、上限（99999999 または 89999999）を超えてしまった場合のエラー処理
    if (seq > maxSeq) {
      return NextResponse.json({ error: 'このロールの割り当て可能なIDが上限に達しています' }, { status: 409 });
    }
  }

  // seq を prefix + 8 桁ゼロ埋めに変換する
  const buildId = (n: number) => `${prefix}${String(n).padStart(8, '0')}`;

  // 一括追加: body.names 配列が渡された場合
  if (Array.isArray(body.names)) {
    const names: string[] = body.names.map((n: string) => n.trim()).filter(Boolean);
    if (names.length === 0) return NextResponse.json({ error: '名前が入力されていません' }, { status: 400 });

    const created: { id: string; displayName: string; role: string }[] = [];
    for (const displayName of names) {
      // 複数人作成中に上限を超えないかチェック
      if (seq > maxSeq) {
        return NextResponse.json({ error: `IDが上限(${maxSeq})に達したため、残りのユーザーは作成できませんでした` }, { status: 409 });
      }

      const id = buildId(seq);
      const existing = await prisma.user.findUnique({ where: { id } });
      if (existing) {
        return NextResponse.json({ error: `ID ${id} はすでに使用されています` }, { status: 409 });
      }
      
      const newUser = await prisma.user.create({
        data: { id, schoolId: user!.schoolId, role, displayName, passwordHash: hashPassword(id) },
      });
      created.push({ id: newUser.id, displayName: newUser.displayName, role: newUser.role });
      
      seq++; // 次のユーザーのために連番をインクリメント
    }
    return NextResponse.json({ created }, { status: 201 });
  }

  // 1 人追加: body.displayName が渡された場合
  const { displayName } = body;
  if (!displayName?.trim()) return NextResponse.json({ error: '名前は必須です' }, { status: 400 });

  const id = buildId(seq);
  const existing = await prisma.user.findUnique({ where: { id } });
  if (existing) return NextResponse.json({ error: `ID ${id} はすでに使用されています` }, { status: 409 });

  const newUser = await prisma.user.create({
    data: { id, schoolId: user!.schoolId, role, displayName: displayName.trim(), passwordHash: hashPassword(id) },
  });
  return NextResponse.json({ id: newUser.id, displayName: newUser.displayName, role: newUser.role }, { status: 201 });
}
