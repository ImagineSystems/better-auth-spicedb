// src/routes/api/agents/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/db';
import { agent } from '$lib/db/schema';
import { inArray } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
  const idsParam = url.searchParams.get('ids');
  
  if (!idsParam) {
    return json([]);
  }
  
  const ids = idsParam.split(',').filter(Boolean);
  
  if (ids.length === 0) {
    return json([]);
  }
  
  const agents = await db.select()
    .from(agent)
    .where(inArray(agent.id, ids));
  
  return json(agents);
};