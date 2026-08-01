import { withApiHandler } from '@/server/handler';
import { SESSION_COOKIE_NAME } from '@/server/session';
import { NextResponse } from 'next/server';

export const POST = withApiHandler('auth.logout', () => {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return Promise.resolve(response);
});
