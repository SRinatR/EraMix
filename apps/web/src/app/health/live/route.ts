import { defineRouteHandlers } from '@/server/handler';
import { NextResponse } from 'next/server';

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers({
  GET: () => Promise.resolve(NextResponse.json({ status: 'ok' })),
});
