<script lang="ts">
  import { authClient } from '$lib/authClient';
  import { goto } from '$app/navigation';
  
  let selectedUser = $state<string>('');
  let loading = $state(false);
  let error = $state<string | null>(null);
  let session = $state<any>(null);
  
  const testUsers = [
    { id: 'user_alice', email: 'alice@example.com', name: 'Alice (Engineering)' },
    { id: 'user_bob', email: 'bob@example.com', name: 'Bob (Sales)' },
    { id: 'user_charlie', email: 'charlie@example.com', name: 'Charlie (No Department)' },
  ];
  
  async function signIn() {
    if (!selectedUser) {
      error = 'Please select a user';
      return;
    }
    
    loading = true;
    error = null;
    
    try {
      const user = testUsers.find(u => u.id === selectedUser);
      if (!user) throw new Error('User not found');
      
      // Sign in with email/password 
      const result = await (authClient as any).signIn.email({
        email: user.email,
        password: 'password123', // Demo password
      });
      
      if (result.error) {
        console.error('Sign-in error:', result.error);
        console.error('Sign-in data:', result.data);
        error = result.error.message;
      } else {
        // Redirect to agents page
        await goto('/agents');
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to sign in';
    } finally {
      loading = false;
    }
  }
  
  async function checkSession() {
    const result = await (authClient as any).getSession();
    session = result.data;
  }
  
  async function signOut() {
    await (authClient as any).signOut();
    session = null;
  }
  
  // Check session on mount
  import { onMount } from 'svelte';
  onMount(checkSession);
</script>

<div class="container">
  <h1>SpiceDB Plugin Test</h1>
  
  {#if session}
    <div class="session">
      <p>Logged in as: <strong>{session.user.name}</strong></p>
      <button onclick={signOut}>Sign Out</button>
      <a href="/agents">Go to Agents →</a>
    </div>
  {:else}
    <div class="login">
      <h2>Test Login</h2>
      <p>Select a test user to sign in:</p>
      
      <div class="user-select">
        {#each testUsers as user}
          <label>
            <input 
              type="radio" 
              bind:group={selectedUser} 
              value={user.id}
            />
            {user.name}
          </label>
        {/each}
      </div>
      
      {#if error}
        <div class="error">
          {error}
        </div>
      {/if}
      
      <button onclick={signIn} disabled={loading || !selectedUser}>
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
      
      <div class="info">
        <h3>Test Scenario:</h3>
        <ul>
          <li><strong>Alice (Engineering)</strong> - Can see Agent Alpha & Agent Beta</li>
          <li><strong>Bob (Sales)</strong> - Can see Agent Gamma</li>
          <li><strong>Charlie</strong> - Cannot see any agents (no department)</li>
        </ul>
      </div>
    </div>
  {/if}
</div>

<style>
  .container {
    max-width: 600px;
    margin: 2rem auto;
    padding: 2rem;
  }
  
  h1 {
    text-align: center;
  }
  
  .session, .login {
    background: white;
    border: 1px solid #ccc;
    border-radius: 8px;
    padding: 2rem;
  }
  
  .session {
    text-align: center;
  }
  
  .session button {
    margin: 1rem 0;
  }
  
  .session a {
    display: block;
    margin-top: 1rem;
    color: #4CAF50;
  }
  
  .user-select {
    margin: 1rem 0;
  }
  
  .user-select label {
    display: block;
    padding: 0.5rem;
    margin: 0.5rem 0;
    cursor: pointer;
  }
  
  .user-select label:hover {
    background: #f0f0f0;
  }
  
  button {
    width: 100%;
    padding: 0.75rem;
    background: #4CAF50;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
  }
  
  button:hover:not(:disabled) {
    background: #45a049;
  }
  
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .error {
    color: red;
    padding: 1rem;
    background: #fee;
    border-radius: 4px;
    margin: 1rem 0;
  }
  
  .info {
    margin-top: 2rem;
    padding: 1rem;
    background: #f0f0f0;
    border-radius: 4px;
  }
  
  .info h3 {
    margin-top: 0;
  }
  
  .info ul {
    margin-bottom: 0;
  }
</style>