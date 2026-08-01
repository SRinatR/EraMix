import { getContainer } from '@/server/container';
import { getServerActor } from '@/server/session';
import { UpdateRoleForm } from './update-role-form';
import { requirePermission } from '@eramix/application';
import { notFound } from 'next/navigation';

export default async function AdminUsersPage() {
  const actor = await getServerActor();
  if (!actor) {
    notFound();
  }
  try {
    requirePermission(actor.platformRole, 'users.manage');
  } catch {
    notFound();
  }

  const container = getContainer();
  const users = await container.users.listAll();

  return (
    <main>
      <h1>Users and roles</h1>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Status</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.displayName}</td>
              <td>{user.email}</td>
              <td>{user.status}</td>
              <td>
                <UpdateRoleForm
                  userId={user.id}
                  currentRole={user.platformRole}
                  expectedVersion={user.version}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
