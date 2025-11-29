// src/routes/api/agents/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/db';
import { agent } from '$lib/db/schema';
import { inArray } from 'drizzle-orm';
import { auth } from '$lib/auth';

/**
 * WARNING: This pattern is NOT recommended unless an API route is absolutely necessary.
 * 
 * Do NOT implement this endpoint without proper authorization checks.
 * Without verifying that the authenticated user has permission to view
 * each requested agent ID, this endpoint is vulnerable to IDOR attacks.
 * The example below demonstrates how to properly implement authorization checks.
 */

/**
 * GET /api/agents?ids=id1,id2,id3
 * 
 * SECURITY: 
 * 1. Requires authentication
 * 2. Verifies each ID against SpiceDB via plugin API
 * 3. Only returns agents user has VIEW permission for
 * 4. Protected against IDOR attacks
 */
export const GET: RequestHandler = async ({ url, request, fetch }) => {
  // ============================================
  // 1. AUTHENTICATION CHECK
  // ============================================
  const session = await auth.api.getSession({ headers: request.headers });
  
  if (!session?.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // ============================================
  // 2. INPUT VALIDATION
  // ============================================
  const idsParam = url.searchParams.get('ids');
  
  if (!idsParam) {
    return json({ agents: [] });
  }
  
  const requestedIds = idsParam.split(',').filter(Boolean);
  
  if (requestedIds.length === 0) {
    return json({ agents: [] });
  }
  
  // Limit to prevent abuse
  if (requestedIds.length > 100) {
    return json({ error: 'Too many IDs requested (max 100)' }, { status: 400 });
  }
  
  // Validate ID format
  const validIdPattern = /^[a-zA-Z0-9_-]+$/;
  const invalidIds = requestedIds.filter(id => !validIdPattern.test(id));
  
  if (invalidIds.length > 0) {
    return json({ error: 'Invalid ID format' }, { status: 400 });
  }
  
  try {
    // ============================================
    // 3. AUTHORIZATION CHECK (IDOR Protection)
    // ============================================
    console.log(`[API] Checking permissions for ${requestedIds.length} agents for user ${session.user.id}`);
    
    // Use the plugin's bulk check endpoint
    const permResponse = await fetch('/api/auth/spicedb/check-bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || ''
      },
      body: JSON.stringify({
        checks: requestedIds.map(id => ({
          resourceType: 'agent',
          resourceId: id,
          permission: 'view'
        }))
      })
    });
    
    if (!permResponse.ok) {
      throw new Error('Permission check failed');
    }
    
    const { results } = await permResponse.json();
    
    // Filter to only allowed IDs
    const allowedIds = results
      .filter((check: any) => check.allowed)
      .map((check: any) => check.resourceId);
    
    console.log(`[API] User authorized for ${allowedIds.length}/${requestedIds.length} agents`);
    
    // If no IDs are allowed, return empty array
    if (allowedIds.length === 0) {
      console.warn(`[API] User ${session.user.id} attempted to access ${requestedIds.length} agents without permission`);
      return json({ agents: [] });
    }
    
    // Log if user tried to access unauthorized IDs
    const unauthorizedIds = requestedIds.filter(id => !allowedIds.includes(id));
    if (unauthorizedIds.length > 0) {
      console.warn(
        `[SECURITY] User ${session.user.id} attempted unauthorized access to agents: ${unauthorizedIds.join(', ')}`
      );
    }
    
    // ============================================
    // 4. FETCH DATA (Only authorized IDs)
    // ============================================
    const agents = await db.select()
      .from(agent)
      .where(inArray(agent.id, allowedIds));
    
    // ============================================
    // 5. RESPONSE
    // ============================================
    return json({ agents });
    
  } catch (err) {
    console.error('[API] Error checking permissions:', err);
    return json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
};