import type { ReactNode } from 'react';
import { requirePageRole } from '@/lib/requirePageRole';
import { PAGE_ROLES } from '@/lib/pageAuthorization';

export default async function StudentLayout({ children }: { children: ReactNode }) {
  await requirePageRole([...PAGE_ROLES.student]);
  return children;
}
