import { SESSION_COOKIE_NAME } from '@/server/session';
import { NextResponse } from 'next/server';

export function POST(): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
