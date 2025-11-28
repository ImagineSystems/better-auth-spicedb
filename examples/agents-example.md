# Complete Example: Department-Scoped Agents

---

## 1. Setup — `src/lib/auth.ts`

```ts
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { spicedb, createEventEmitter } from "better-auth-spicedb";
import Database from "better-sqlite3";

const db = new Database("./db.sqlite");

export const auth = betterAuth({
    database: db,
    emailAndPassword: { enabled: true },
    plugins: [
        organization(),
        spicedb({
            endpoint: process.env.SPICEDB_ENDPOINT!,
            token: process.env.SPICEDB_TOKEN!,
            insecure: process.env.NODE_ENV === "development",

            // Auto-sync organization membership
            syncOrganizations: true,

            // Define custom relationships
            relationships: [
                // Link agent to department
                {
                    on: "agent.created",
                    resourceType: "agent",
                    relation: "department",
                    subjectType: "department",
                    resourceId: (e) => e.agent.id,
                    subjectId: (e) => e.agent.departmentId
                },

                // Link creator as owner
                {
                    on: "agent.created",
                    resourceType: "agent",
                    relation: "owner",
                    subjectType: "user",
                    resourceId: (e) => e.agent.id,
                    subjectId: (e) => e.agent.createdBy
                },

                // Department membership
                {
                    on: "department.member.added",
                    resourceType: "department",
                    relation: "member",
                    subjectType: "user",
                    resourceId: (e) => e.departmentId,
                    subjectId: (e) => e.userId
                }
            ]
        })
    ]
});

// Export event emitter for easy use
export const emitAuthEvent = createEventEmitter(auth);
```

---

## 2. SpiceDB Schema — `schema.zed`

```zed
definition user {}

definition organization {
    relation member: user
    relation admin: user
}

definition department {
    relation organization: organization
    relation member: user
    relation manager: user

    permission view = member + manager + organization->admin
    permission manage = manager + organization->admin
}

definition agent {
    relation department: department
    relation owner: user

    permission view = department->member + owner
    permission edit = owner + department->manage
    permission delete = owner
}
```

---

## 3. Client Setup — `src/lib/authClient.ts`

```ts
import { createAuthClient } from "better-auth/client";
import { spiceDBClient } from "better-auth-spicedb";

export const authClient = createAuthClient({
    baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000",
    plugins: [spiceDBClient()]
});
```

---

## 4. Database Operations — `src/lib/services/agentService.ts`

```ts
import { db } from '$lib/db';
import { agents } from '$lib/db/schema';
import { emitAuthEvent } from '$lib/auth';
import { eq } from 'drizzle-orm';

export async function createAgent(data: {
    name: string;
    departmentId: string;
    createdBy: string;
    organizationId: string;
}) {
    // Create in database
    const [agent] = await db.insert(agents).values({
        id: crypto.randomUUID(),
        name: data.name,
        departmentId: data.departmentId,
        createdBy: data.createdBy,
        organizationId: data.organizationId
    }).returning();

    // Emit event for SpiceDB sync
    await emitAuthEvent("agent.created", {
        agent: {
            id: agent.id,
            departmentId: agent.departmentId,
            createdBy: agent.createdBy
        }
    });

    return agent;
}

export async function updateAgent(id: string, data: { name: string }) {
    const [agent] = await db.update(agents)
        .set({ name: data.name })
        .where(eq(agents.id, id))
        .returning();

    return agent;
}

export async function deleteAgent(id: string) {
    await db.delete(agents).where(eq(agents.id, id));
}
```

---

## 5. Server Route — `src/routes/agents/+page.server.ts`

```ts
import type { PageServerLoad, Actions } from './$types';
import { auth } from '$lib/auth';
import { error, redirect } from '@sveltejs/kit';
import { createAgent, updateAgent, deleteAgent } from '$lib/services/agentService';
import { db } from '$lib/db';
import { agents } from '$lib/db/schema';
import { inArray } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals, fetch }) => {
    const session = await auth.api.getSession({
        headers: locals.request.headers
    });

    if (!session) throw redirect(302, '/login');

    // Get IDs of agents user can view
    const permResponse = await fetch('/api/spicedb/lookup-resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            resourceType: 'agent',
            permission: 'view'
        })
    });

    const { resourceIds } = await permResponse.json();

    if (resourceIds.length === 0) {
        return { agents: [] };
    }

    // Fetch only allowed agents
    const agents = await db.select()
        .from(agents)
        .where(inArray(agents.id, resourceIds));

    return { agents };
};

export const actions: Actions = {
    create: async ({ request, locals }) => {
        const session = await auth.api.getSession({
            headers: locals.request.headers
        });
        if (!session) throw error(401);

        const formData = await request.formData();
        const name = formData.get('name') as string;
        const departmentId = formData.get('departmentId') as string;

        // Check if user is department member
        const permResponse = await fetch('http://localhost:3000/api/spicedb/check', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': locals.request.headers.get('cookie') || ''
            },
            body: JSON.stringify({
                resourceType: 'department',
                resourceId: departmentId,
                permission: 'view'
            })
        });

        const { allowed } = await permResponse.json();
        if (!allowed) {
            throw error(403, 'Cannot create agents in this department');
        }

        const agent = await createAgent({
            name,
            departmentId,
            createdBy: session.user.id,
            organizationId: session.user.organizationId
        });

        return { success: true, agent };
    },

    update: async ({ request, locals }) => {
        const session = await auth.api.getSession({
            headers: locals.request.headers
        });
        if (!session) throw error(401);

        const formData = await request.formData();
        const id = formData.get('id') as string;
        const name = formData.get('name') as string;

        // Check edit permission
        const permResponse = await fetch('http://localhost:3000/api/spicedb/check', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': locals.request.headers.get('cookie') || ''
            },
            body: JSON.stringify({
                resourceType: 'agent',
                resourceId: id,
                permission: 'edit'
            })
        });

        const { allowed } = await permResponse.json();
        if (!allowed) {
            throw error(403, 'Cannot edit this agent');
        }

        const agent = await updateAgent(id, { name });
        return { success: true, agent };
    },

    delete: async ({ request, locals }) => {
        const session = await auth.api.getSession({
            headers: locals.request.headers
        });
        if (!session) throw error(401);

        const formData = await request.formData();
        const id = formData.get('id') as string;

        // Check delete permission
        const permResponse = await fetch('http://localhost:3000/api/spicedb/check', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': locals.request.headers.get('cookie') || ''
            },
            body: JSON.stringify({
                resourceType: 'agent',
                resourceId: id,
                permission: 'delete'
            })
        });

        const { allowed } = await permResponse.json();
        if (!allowed) {
            throw error(403, 'Cannot delete this agent');
        }

        await deleteAgent(id);
        return { success: true };
    }
};
```

---

## 6. Client Component — `src/routes/agents/+page.svelte`

```svelte
<script lang="ts">
  import { authClient } from '$lib/authClient';
  import { enhance } from '$app/forms';

  interface Props {
    data: { agents: Agent[] };
  }

  let { data }: Props = $props();
  let permissionsMap = $state<Map<string, { edit: boolean; delete: boolean }>>(new Map());
  let selectedAgent = $state<Agent | null>(null);
  let isCreating = $state(false);

  // Check permissions for all agents at once (CLIENT-SIDE)
  $effect(() => {
    if (data.agents.length > 0) {
      checkAllPermissions();
    }
  });

  async function checkAllPermissions() {
    const checks = data.agents.flatMap(agent => [
      { resourceType: 'agent', resourceId: agent.id, permission: 'edit' },
      { resourceType: 'agent', resourceId: agent.id, permission: 'delete' }
    ]);

    const result = await authClient.spicedb.checkBulk({ checks });

    data.agents.forEach(agent => {
      const editResult = result.results.find(
        r => r.resourceId === agent.id && r.permission === 'edit'
      );
      const deleteResult = result.results.find(
        r => r.resourceId === agent.id && r.permission === 'delete'
      );

      permissionsMap.set(agent.id, {
        edit: editResult?.allowed ?? false,
        delete: deleteResult?.allowed ?? false
      });
    });
  }

  async function canUserCreateAgent(departmentId: string): Promise<boolean> {
    const result = await authClient.spicedb.check({
      resourceType: 'department',
      resourceId: departmentId,
      permission: 'view'
    });
    return result.allowed;
  }
</script>

<div class="container">
  <h1>Agents</h1>

  <button onclick={() => isCreating = true}>
    Create Agent
  </button>

  <div class="agents-grid">
    {#each data.agents as agent}
      <div class="agent-card">
        <h3>{agent.name}</h3>
        <p>Department: {agent.departmentId}</p>

        <div class="actions">
          {#if permissionsMap.get(agent.id)?.edit}
            <form method="POST" action="?/update" use:enhance>
              <input type="hidden" name="id" value={agent.id} />
              <input type="text" name="name" value={agent.name} />
              <button type="submit">Update</button>
            </form>
          {/if}

          {#if permissionsMap.get(agent.id)?.delete}
            <form method="POST" action="?/delete" use:enhance>
              <input type="hidden" name="id" value={agent.id} />
              <button type="submit">Delete</button>
            </form>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>
```

---

## 7. Reusable Permission Gate Component — `src/lib/components/PermissionGate.svelte`

```svelte
<script lang="ts">
  import { authClient } from '$lib/authClient';
  import type { Snippet } from 'svelte';

  interface Props {
    resourceType: string;
    resourceId: string;
    permission: string;
    children?: Snippet;
    fallback?: Snippet;
  }

  let {
    resourceType,
    resourceId,
    permission,
    children,
    fallback
  }: Props = $props();

  let allowed = $state<boolean | null>(null);
  let loading = $state(true);

  async function checkPermission() {
    loading = true;
    try {
      const result = await authClient.spicedb.check({
        resourceType,
        resourceId,
        permission
      });
      allowed = result.allowed;
    } catch (error) {
      console.error('Permission check failed:', error);
      allowed = false;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    checkPermission();
  });
</script>

{#if loading}
  <div class="skeleton">Loading...</div>
{:else if allowed}
  {@render children?.()}
{:else if fallback}
  {@render fallback()}
{/if}
```

---

## Usage Example

```svelte
<PermissionGate  
  resourceType="agent"  
  resourceId={agent.id}  
  permission="edit"
>
  {#snippet children()}
    <button>Edit Agent</button>
  {/snippet}
</PermissionGate>
```

