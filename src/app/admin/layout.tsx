import type { ReactNode } from 'react';
import { requirePageRole } from '@/lib/requirePageRole';
import { PAGE_ROLES } from '@/lib/pageAuthorization';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requirePageRole([...PAGE_ROLES.admin]);
  return children;
}
