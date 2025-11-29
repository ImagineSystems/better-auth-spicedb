<script lang="ts">
  import { authClient } from '$lib/authClient';
  import { onMount } from 'svelte';
  import { untrack } from 'svelte';

  interface Agent { 
    id: string;
    name: string;
    departmentId: string;
    createdBy: string;
   }

  let agents = $state<Agent[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let permissions = $state<Map<string, { edit: boolean; delete: boolean }>>(new Map());

  const session = authClient.useSession() as any;

  // This effect will re-run whenever session.data changes
  $effect(() => {
    if ($session.data) {
      console.log('Session loaded:', $session.data.user.name);
      loadAgents(); // Now safe to load
    } else if ($session.error) {
      error = $session.error.message || 'Authentication error';
      loading = false;
    } else if ($session.data === null) {
      // Explicitly not logged in
      error = 'Please sign in to continue';
      loading = false;
    }
  });

  onMount(() => {
    console.log("Component mounted on client");

    // If session is already resolved (e.g. from cookie), trigger immediately
    untrack(() => {
      if ($session.data) {
        loadAgents();
      }
    });

    // Optional: cleanup
    return () => {
      console.log("Component unmounting");
    };
  });
  
  async function loadAgents() {
    loading = true;
    error = null;
    
    try {
      console.log('Asking SpiceDB which agents user can view...');
      
      // Get IDs of agents user can view
      const lookupResult = await authClient.spicedb.lookupResources({
        resourceType: 'agent',
        permission: 'view'
      });
      
      console.log('Lookup result:', lookupResult);
      
      // Check if resourceIds exists and handle it properly
      if (!lookupResult || !lookupResult.data?.resourceIds) {
        console.error('No resourceIds returned from lookupResources');
        error = 'Failed to lookup resources';
        loading = false;
        return;
      }
      
      const resourceIds = lookupResult.data?.resourceIds;
      
      console.log('User can view agent IDs:', resourceIds);
      
      if (resourceIds.length === 0) {
        agents = [];
        loading = false;
        return;
      }
      
      // Fetch only those agents
      console.log('Fetching agent data from API...');
      const response = await fetch(`/api/agents?ids=${resourceIds.join(',')}`);
      
      const data = await response.json(); 
      agents = data.agents; 

      console.log('Fetched agents from API:', agents);

      if (!agents || !Array.isArray(agents)) {
        throw new Error('Invalid agent data received from API');
      }
      
      console.log('Fetched agents:', agents);
      
      // Check edit/delete permissions for UI
      console.log('Checking edit/delete permissions...');
      const permissionChecks = agents.flatMap(agent => [
        { resourceType: 'agent', resourceId: agent.id, permission: 'edit' },
        { resourceType: 'agent', resourceId: agent.id, permission: 'delete' }
      ]);
      
      const result = await authClient.spicedb.checkBulk({
        checks: permissionChecks
      });
      
      console.log('Permission results:', result);
      
      // Store permissions
      agents.forEach(agent => {
        const canEdit = result.data?.results.find(
          r => r.resourceId === agent.id && r.permission === 'edit'
        )?.allowed ?? false;
        
        const canDelete = result.data?.results.find(
          r => r.resourceId === agent.id && r.permission === 'delete'
        )?.allowed ?? false;
        
        permissions.set(agent.id, { edit: canEdit, delete: canDelete });
      });
      
      console.log('Done. Loaded ', agents.length, 'agents');
      
    } catch (err) {
      console.error('Failed to load agents:', err);
      error = err instanceof Error ? err.message : 'Failed to load agents';
    } finally {
      loading = false;
    }
  }
</script>

<div class="container">
  <h1>Agents Dashboard</h1>
  
  {#if $session.data}
    <div class="user-info">
      <p>Logged in as: <strong>{$session.data.user.name}</strong> ({$session.data.user.id})</p>
    </div>
  {/if}
  
  <div class="actions">
    <button onclick={loadAgents} disabled={loading}>
      {loading ? 'Loading...' : 'Refresh'}
    </button>
  </div>
  
  {#if loading}
    <div class="loading">
      <p>Loading agents...</p>
    </div>
  {:else if error}
    <div class="error">
      <p>Error: {error}</p>
    </div>
  {:else if agents.length === 0}
    <div class="empty">
      <p>No agents found. You don't have permission to view any agents.</p>
    </div>
  {:else}
    <div class="agents-grid">
      {#each agents as agent}
        <div class="agent-card">
          <h3>{agent.name}</h3>
          <p>ID: {agent.id}</p>
          <p>Department: {agent.departmentId}</p>
          <p>Created by: {agent.createdBy}</p>
          
          <div class="permissions">
            <strong>Permissions:</strong>
            <ul>
              <li>View: ✅</li>
              <li>Edit: {permissions.get(agent.id)?.edit ? '✅' : '❌'}</li>
              <li>Delete: {permissions.get(agent.id)?.delete ? '✅' : '❌'}</li>
            </ul>
          </div>
          
          <div class="buttons">
            {#if permissions.get(agent.id)?.edit}
              <button class="edit">Edit</button>
            {:else}
              <button class="edit" disabled>Edit (No Permission)</button>
            {/if}
            
            {#if permissions.get(agent.id)?.delete}
              <button class="delete">Delete</button>
            {:else}
              <button class="delete" disabled>Delete (No Permission)</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }
  
  h1 {
    margin-bottom: 1rem;
  }
  
  .user-info {
    background: #f0f0f0;
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
  }
  
  .actions {
    margin-bottom: 2rem;
  }
  
  button {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    border: 1px solid #ccc;
    background: white;
    cursor: pointer;
  }
  
  button:hover:not(:disabled) {
    background: #f0f0f0;
  }
  
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .loading, .error, .empty {
    text-align: center;
    padding: 2rem;
  }
  
  .error {
    color: red;
  }
  
  .agents-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }
  
  .agent-card {
    border: 1px solid #ccc;
    border-radius: 8px;
    padding: 1rem;
    background: white;
  }
  
  .agent-card h3 {
    margin-top: 0;
  }
  
  .permissions {
    margin: 1rem 0;
    padding: 0.5rem;
    background: #f9f9f9;
    border-radius: 4px;
  }
  
  .permissions ul {
    margin: 0.5rem 0 0 0;
    padding-left: 1.5rem;
  }
  
  .buttons {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  
  .edit {
    background: #4CAF50;
    color: white;
    border: none;
  }
  
  .edit:hover:not(:disabled) {
    background: #45a049;
  }
  
  .delete {
    background: #f44336;
    color: white;
    border: none;
  }
  
  .delete:hover:not(:disabled) {
    background: #da190b;
  }
</style>