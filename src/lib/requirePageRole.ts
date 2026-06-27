import type { Role } from '@prisma/client';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionUser } from './auth';
import { canAccessPage } from './pageAuthorization';

function roleHome(role: Role): string {
  if (role === 'SERVER_ADMIN') return '/admin';
  if (role === 'SCHOOL_ADMIN') return '/school-admin';
  return '/home';
}

export async function requirePageRole(roles: Role[]) {
  const sessionId = cookies().get('session_id')?.value;
  if (!sessionId) redirect('/login');

  const user = await getSessionUser(sessionId);
  if (!user) redirect('/login');
  if (!canAccessPage(user.role, roles)) redirect(roleHome(user.role));

  return user;
}
