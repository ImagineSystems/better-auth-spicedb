# better-auth-spicedb

> [!CAUTION]
> This project is in early alpha and unfinished. Behaviour is unstable and may change without notice. Use at your own risk.

A **Relationship-Based Access Control (ReBAC)** plugin for **Better Auth** that syncs permissions to **SpiceDB (or Authzed)**.

This plugin features:

- **Declarative Sync:** Define relationship mappings once, sync automatically
- **Zero SpiceDB Knowledge Required:** Clean API abstracts all complexity
- **Performance:** Bulk checks and resource lookup for efficient list filtering
- **Type-Safe:** Full TypeScript support with type inference
- **Flexible:** Works with any resource type and permission model

---

## Prerequisites
- Node.js *v18 or higher*
- A Node package manager -  e.g. Bun
- A SpiceDB installation - e.g. on Docker

## Installation

Using your favourite Node package manager; e.g. Bun:

```bash
bun i 
```

If using Docker, start SpiceDB with:

```bash
docker run --rm \
  -p 50051:50051 \
  -p 8443:8443 \
  authzed/spicedb serve \
  --grpc-preshared-key "testkey" \ 
  --datastore-engine memory
```
*Note: use an actual key in production!*

Install Zed CLI, e.g. on macOS:
```bash
brew install authzed/tap/zed
```

## Quick Start

### 1. Define Your SpiceDB Schema

Create a `schema.zed` file and apply it to your SpiceDB instance:

```zed
definition user {}

definition organization {
    relation member: user
    relation admin: user
    
    permission view = member + admin
    permission manage = admin
}

definition department {
    relation organization: organization
    relation member: user
    relation manager: user
    
    // Inherit organization membership
    permission view = member + manager + organization->admin
    permission manage = manager + organization->admin
}

definition agent {
    relation department: department
    relation owner: user
    
    // Only department members can view
    permission view = department->member + owner
    
    // Only owners and department managers can edit
    permission edit = owner + department->manage
    
    // Only owners can delete
    permission delete = owner
}
```

```bash
zed schema write --insecure \
  --endpoint localhost:50051 \
  --token "testkey" \
  schema.zed
```
*Note: use an actual key in production without the `--insecure` flag!*

---

### 2. Server Configuration

Set up the plugin in your Better Auth config:

```ts
// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { spicedb, createEventEmitter } from "better-auth-spicedb";

const spiceDBPlugin = spicedb({
    endpoint: process.env.SPICEDB_ENDPOINT!, // e.g., "localhost:50051"
    token: process.env.SPICEDB_TOKEN!,
    insecure: process.env.NODE_ENV === "development",

    // Optional: Auto-sync organization membership
    syncOrganizations: true,

    // Define custom relationship mappings
    relationships: [
        // When an agent is created
        {
            on: "agent.created",
            resourceType: "agent",
            relation: "owner",
            subjectType: "user",
            resourceId: (event) => event.agent.id,
            subjectId: (event) => event.agent.createdBy
        },
        
        // When user joins department
        {
            on: "department.member.added",
            resourceType: "department",
            relation: "member",
            subjectType: "user",
            resourceId: (event) => event.departmentId,
            subjectId: (event) => event.userId
        }
    ]
});

export const auth = betterAuth({
    database: {
        // your db config
    },
    baseURL: "http://localhost:5173", // important!
    plugins: [
        organization(), // Optional: enables auto-sync for orgs
        spiceDBPlugin
    ]
});

// register an event emitter
export const emitEvent = createEventEmitter(spiceDBPlugin);

```

---

### 3. Emit Events in Your App

When you create resources, emit events to trigger SpiceDB sync:

```ts
// src/lib/services/agentService.ts
import { emitEvent } from '$lib/auth';

export async function createAgent(data: {
    name: string;
    departmentId: string;
    createdBy: string;
}) {
    // 1. Create in your database
    const agent = await db.insert(agents).values({
        id: crypto.randomUUID(),
        ...data
    }).returning();
    
    // 2. Emit event - SpiceDB auto-syncs! ✨
    await emitEvent("agent.created", {
        agent: {
            id: agent.id,
            departmentId: data.departmentId,
            createdBy: data.createdBy
        }
    });
    
    return agent;
}
```

---

### 4. Client Configuration

Enable frontend permission checks:

```ts
// src/lib/authClient.ts
import { createAuthClient } from "better-auth/client";
import { spiceDBClient } from "better-auth-spicedb/client";

export const authClient = createAuthClient({
    baseURL: "http://localhost:3000",
    plugins: [spiceDBClient()]
});
```


## Usage Patterns

### Pattern 1: Server-Side List Filtering (Recommended)

Use `lookupResources` to get only resources the user can access:

```ts
// +page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, fetch }) => {
    const session = await auth.api.getSession({ 
        headers: locals.request.headers 
    });
    
    if (!session) throw redirect(302, '/login');
    
    // Get IDs of agents user can view
    const response = await fetch('/api/spicedb/lookup-resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            resourceType: 'agent',
            permission: 'view'
        })
    });
    
    const { resourceIds } = await response.json();
    
    // Fetch only allowed agents from database
    const agents = await db.select()
        .from(agents)
        .where(inArray(agents.id, resourceIds));
    
    return { agents };
};
```

### Pattern 2: Individual Permission Checks

Check specific permissions for authorization:

```ts
// +page.server.ts (Actions)
export const actions: Actions = {
    updateAgent: async ({ request, params, fetch }) => {
        const agentId = params.id;
        
        // Check if user can edit this specific agent
        const response = await fetch('/api/spicedb/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                resourceType: 'agent',
                resourceId: agentId,
                permission: 'edit'
            })
        });
        
        const { allowed } = await response.json();
        
        if (!allowed) {
            throw error(403, 'Cannot edit this agent');
        }
        
        // Proceed with update...
        await db.update(agents)
            .set({ name: formData.get('name') })
            .where(eq(agents.id, agentId));
        
        return { success: true };
    }
};
```

### Pattern 3: Client-Side UI State

Use permissions to show/hide UI elements:

```svelte
<!-- +page.svelte -->
<script lang="ts">
  import { authClient } from '$lib/authClient';
  
  let { data } = $props(); // agents from server
  let permissionsMap = $state(new Map());
  
  // Check permissions for UI elements
  $effect(() => {
    if (data.agents.length > 0) {
      checkPermissions();
    }
  });
  
  async function checkPermissions() {
    // Bulk check for better performance
    const result = await authClient.spicedb.checkBulk({
      checks: data.agents.flatMap(agent => [
        { resourceType: 'agent', resourceId: agent.id, permission: 'edit' },
        { resourceType: 'agent', resourceId: agent.id, permission: 'delete' }
      ])
    });
    
    // Build permissions map
    data.agents.forEach(agent => {
      const edit = result.results.find(
        r => r.resourceId === agent.id && r.permission === 'edit'
      )?.allowed ?? false;
      
      const del = result.results.find(
        r => r.resourceId === agent.id && r.permission === 'delete'
      )?.allowed ?? false;
      
      permissionsMap.set(agent.id, { edit, delete: del });
    });
  }
</script>

{#each data.agents as agent}
  <div class="agent-card">
    <h3>{agent.name}</h3>
    
    {#if permissionsMap.get(agent.id)?.edit}
      <button>Edit</button>
    {/if}
    
    {#if permissionsMap.get(agent.id)?.delete}
      <button>Delete</button>
    {/if}
  </div>
{/each}
```

### Pattern 4: Client-Side Resource Lookup (Not Recommended)

For client-side routing or dynamic filtering:

```ts
async function loadAgents() {
    // 1. Get IDs of viewable agents
    const { resourceIds } = await authClient.spicedb.lookupResources({
        resourceType: 'agent',
        permission: 'view'
    });
    
    if (resourceIds.length === 0) return [];
    
    // 2. Fetch only those agents
    const response = await fetch(`/api/agents?ids=${resourceIds.join(',')}`);
    return await response.json();
}
```
> [!WARNING]
> Do NOT implement the fetch API call on the server without **authorization** AND an **additional check** on the resource Ids requested. Without this, your code is vulnerable to an IDOR (Insecure Direct Object Reference) attack. 

Due to the warning above and the additional check required, this approach should be used as a last resort.

## API Reference

### Server Configuration — `spicedb()`

```ts
interface SpiceDBPluginOptions {
    /** SpiceDB gRPC endpoint (e.g., "localhost:50051") */
    endpoint: string;
    
    /** SpiceDB API token */
    token: string;
    
    /** Use insecure connection (local dev only) */
    insecure?: boolean;
    
    /** Optional namespace prefix for multi-tenancy */
    namespace?: string;
    
    /** Auto-sync Better Auth organization events */
    syncOrganizations?: boolean;
    
    /** Custom relationship mappings */
    relationships?: RelationshipMapping[];
}

interface RelationshipMapping {
    /** Event name to listen for */
    on: string;
    
    /** Resource type in SpiceDB schema */
    resourceType: string;
    
    /** Relation name in SpiceDB schema */
    relation: string;
    
    /** Subject type in SpiceDB schema */
    subjectType: string;
    
    /** Extract resource ID from event */
    resourceId: (event: any) => string;
    
    /** Extract subject ID from event */
    subjectId: (event: any) => string;
}
```

---

### Client API — `authClient.spicedb`

#### `check(params)`

Check if current user has permission on a resource.

```ts
const result = await authClient.spicedb.check({
    resourceType: 'agent',
    resourceId: '123',
    permission: 'edit',
    context?: { /* optional caveat context */ }
});

// Returns: { allowed: boolean }
```

#### `checkBulk(params)`

Check multiple permissions at once (better performance).

```ts
const result = await authClient.spicedb.checkBulk({
    checks: [
        { resourceType: 'agent', resourceId: '1', permission: 'view' },
        { resourceType: 'agent', resourceId: '2', permission: 'edit' }
    ]
});

// Returns: { 
//   results: Array<{
//     resourceType: string,
//     resourceId: string,
//     permission: string,
//     allowed: boolean
//   }>
// }
```

#### `lookupResources(params)`

Get all resource IDs user has permission on (most efficient for lists).

```ts
const result = await authClient.spicedb.lookupResources({
    resourceType: 'agent',
    permission: 'view'
});

// Returns: { resourceIds: string[] }
```

#### `writeRelationship(params)` 

Manually write a relationship to SpiceDB.

```ts
await authClient.spicedb.writeRelationship({
    resource: { type: 'agent', id: '123' },
    relation: 'owner',
    subject: { type: 'user', id: '456' }
});
```

#### `deleteRelationship(params)` 

Manually delete a relationship from SpiceDB.

```ts
await authClient.spicedb.deleteRelationship({
    resource: { type: 'agent', id: '123' },
    relation: 'owner',
    subject: { type: 'user', id: '456' }
});
```


## What Gets Synced Automatically?

| Configuration | Event | Resulting SpiceDB Tuple |
|--------------|-------|-------------------------|
| `syncOrganizations: true` | User joins org | `organization:123#member@user:456` |
| `syncOrganizations: true` | User leaves org | Deletes: `organization:123#member@user:456` |
| Custom relationship mapping | Your custom event | Based on your mapping config |


## Best Practices

### 1. Define Schema First
Think through your permission model before writing code. SpiceDB schemas define the "shape" of your permissions.

### 2. Use Server-Side Filtering for Lists
Always use `lookupResources` on the server to filter lists. Never fetch all resources and filter client-side.

```ts
// ✅ GOOD: Server filters first
const { resourceIds } = await lookupResources(...);
const agents = await db.where(inArray(id, resourceIds));

// ❌ BAD: Fetching everything then filtering
const allAgents = await db.select();
const filtered = allAgents.filter(a => checkPermission(a.id));
```

### 3. Use Client Checks for UI State Only
Client-side permission checks should only control what users *see*, not what they can *do*.

```ts
// ✅ Client: Show/hide buttons
const { allowed } = await authClient.spicedb.check(...);
if (allowed) showEditButton();

// ✅ Server: Actual authorization
const { allowed } = await fetch('/api/spicedb/check', ...);
if (!allowed) throw error(403);
```

### 4. Batch Checks When Possible
Use `checkBulk` instead of multiple individual checks for better performance.

```ts
// ✅ One request for all checks
await authClient.spicedb.checkBulk({ checks: [...] });

// ❌ Multiple requests
for (const agent of agents) {
    await authClient.spicedb.check({ resourceId: agent.id, ... });
}
```

### 5. Use Context for Dynamic Rules
Leverage SpiceDB caveats for time-based or attribute-based permissions.

```ts
await authClient.spicedb.check({
    resourceType: 'document',
    resourceId: '123',
    permission: 'view',
    context: {
        time: new Date().toISOString(),
        clearanceLevel: 'secret'
    }
});
```

## Advanced: Multi-Tenancy

Use the `namespace` option for tenant isolation:

```ts
spicedb({
    namespace: `tenant_${tenantId}_`,
    // ... other options
})

// Creates: "tenant_acme_user:123", "tenant_acme_agent:456"
```


## Troubleshooting

### Events Not Syncing

Make sure you're emitting events after database operations:

```ts
import { createEventEmitter } from 'better-auth-spicedb';

const emitEvent = createEventEmitter(auth);
await emitEvent("agent.created", { agent: {...} });
```

### Permission Always Denied

1. Check your SpiceDB schema is applied
2. Verify relationships exist: `zed permission check ...`
3. Check console logs for sync errors
4. Ensure namespace matches if using multi-tenancy

### TypeScript Errors

Make sure you're importing types from the correct path:

```ts
import type { 
    CheckPermissionParams,
    LookupResourcesParams 
} from 'better-auth-spicedb';
```



## License

MIT - See LICENSE file for details