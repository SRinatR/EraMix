import { Link } from '@/i18n/navigation';
import { getServerActor } from '@/server/session';
import { hasPermission } from '@eramix/application';

export default async function AdminDashboardPage() {
  const actor = await getServerActor();
  const role = actor?.platformRole ?? 'CUSTOMER';

  return (
    <main>
      <h1>Admin dashboard</h1>
      <ul>
        {hasPermission(role, 'order.read.all') && (
          <li>
            <Link href="/admin/orders">Order queue</Link>
          </li>
        )}
        {hasPermission(role, 'users.manage') && (
          <li>
            <Link href="/admin/users">Users and roles</Link>
          </li>
        )}
      </ul>
    </main>
  );
}
