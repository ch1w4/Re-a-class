import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

  const host = request.headers.get('host') ?? 'localhost:3000';
  const protocol = host.startsWith('localhost') ? 'http' : 'https';
  const url = `${protocol}://${host}/student/${params.roomId}`;

  const dataUrl = await QRCode.toDataURL(url, {
    width: 300,
    margin: 2,
    color: { dark: '#1e40af', light: '#ffffff' },
  });

  return NextResponse.json({ qr: dataUrl, url });
}
