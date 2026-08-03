import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { SESSION_COOKIE_NAME } from '@/server/session';
import { NextResponse } from 'next/server';

const postHandler = withApiHandler('auth.logout', () => {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return Promise.resolve(response);
});

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers({
  POST: postHandler,
});
