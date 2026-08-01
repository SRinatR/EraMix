import { Link } from '@/i18n/navigation';
import { getServerActor } from '@/server/session';
import { hasPermission } from '@eramix/application';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// ADM-001: Admin is a separate route group, requires authentication +
// permission, and is never indexed by search engines. Session-dependent;
// must not be statically prerendered at build time.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } };

const ADMIN_PERMISSIONS = [
  'users.manage',
  'order.read.all',
  'content.write',
  'catalog.write',
] as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await getServerActor();
  if (!actor) {
    redirect('/api/auth/login');
  }
  const isStaff = ADMIN_PERMISSIONS.some((permission) =>
    hasPermission(actor.platformRole, permission),
  );
  if (!isStaff) {
    redirect('/');
  }

  return (
    <div>
      <nav>
        <ul>
          <li>
            <Link href="/admin">Dashboard</Link>
          </li>
          <li>
            <Link href="/admin/orders">Orders</Link>
          </li>
          <li>
            <Link href="/admin/users">Users</Link>
          </li>
        </ul>
      </nav>
      {children}
    </div>
  );
}
