// QR コード生成 API
// GET /api/rooms/[roomId]/qr
// 生徒参加用の URL を QR コードとして base64 data URL で返す。
// 教師画面でルーム作成直後に呼ばれ、生徒が QR をスキャンするだけで参加できる。
import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { requireAuth } from '@/lib/requireAuth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const { error } = await requireAuth(request);
  if (error) return error;

  // リクエスト元のホスト（origin）を使って絶対 URL を生成する
  const origin = request.nextUrl.origin;
  const url = `${origin}/student/${params.roomId}`;

  const qr = await QRCode.toDataURL(url, { width: 300, margin: 2 });
  return NextResponse.json({ qr, url });
}
