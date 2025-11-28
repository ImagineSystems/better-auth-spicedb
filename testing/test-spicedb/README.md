# SvelteKit Example: Testing Guide

## Prerequisites

1. **Node.js** installed (v18 or higher)
2. **Node Package Manager**, such as **Bun**
3. **Docker** installed (for SpiceDB)
4. **better-auth-spicedb** 

---

## Step 1: Start SpiceDB

```bash
# Start SpiceDB with Docker
docker run --rm \
  -p 50051:50051 \
  -p 8443:8443 \
  authzed/spicedb serve \
  --grpc-preshared-key "testkey" \
  --datastore-engine memory

# Keep this terminal running
```

---

## Step 2: Setup Test Project

```bash
# Install dependencies from testing/test-spicedb
bun add

# Link to plugin (for testing only!)
cd /path/to/better-auth-spicedb
bun link

# Back in test project:
cd /path/to/test-spicedb
bun link better-auth-spicedb
```

**Note:** Using `bun link` means changes to your plugin are immediately reflected - no compilation needed!

---

## Step 3: Apply SpiceDB Schema

```bash
# Install zed CLI (macOS)
brew install authzed/tap/zed
# OR: go install github.com/authzed/zed@latest

# Apply schema
zed schema write --insecure \
  --endpoint localhost:50051 \
  --token "testkey" \
  schema.zed

# Verify it worked
zed schema read --insecure \
  --endpoint localhost:50051 \
  --token "testkey"
```

---

## Step 4: Setup Database & Seed Data

```bash
bun setup
```
You should see output like:
```
🌱 Seeding database...
✅ Created users: { alice: 'user_alice', bob: 'user_bob', charlie: 'user_charlie' }
✅ Created departments: { engineering: 'dept_engineering', sales: 'dept_sales' }
✅ Added Alice to Engineering
✅ Added Bob to Sales
✅ Synced Agent Alpha to SpiceDB
✅ Synced Agent Beta to SpiceDB
✅ Synced Agent Gamma to SpiceDB

🎉 Seeding complete!

Test scenarios:
1. Alice (Engineering) should see: Agent Alpha, Agent Beta
2. Bob (Sales) should see: Agent Gamma
3. Charlie (no department) should see: nothing
```
---

## Step 5: Build plugin (testing only!)
```bash
# From repository root /
bun run build
```

---

## Step 6: Start Development Server

```bash
bun run dev
```

---
## Step 7: View DB using Drizzle Kit Studio (optional)
```bash
bunx drizzle-kit studio
```

---

## Step 8: Test

### Manual Testing:

1. Open http://localhost:5173
2. You'll see the login page with test users
3. Click on a user (you'll need to sign them up first)
4. Go to `/agents` page
5. Open browser console to see detailed logs

### Expected Results:

**Alice (Engineering):**
- Should see: Agent Alpha, Agent Beta (2 agents)
- Can edit/delete: Yes (she's the owner)

**Bob (Sales):**
- Should see: Agent Gamma (1 agent)
- Can edit/delete: Yes (he's the owner)

**Charlie (No Department):**
- Should see: Nothing (0 agents)
- No permissions


---

## Step 9: Verify with SpiceDB CLI

You can also verify relationships directly in SpiceDB:

```bash
# Check if Alice can view Agent Alpha
zed permission check \
  --insecure \
  --endpoint localhost:50051 \
  --token "testkey" \
  agent:agent_1 view user:user_alice
# Should return: true

# Check if Bob can view Agent Alpha (should fail)
zed permission check \
  --insecure \
  --endpoint localhost:50051 \
  --token "testkey" \
  agent:agent_1 view user:user_bob
# Should return: false

# List all relationships
zed relationship read \
  --insecure \
  --endpoint localhost:50051 \
  --token "testkey"

# OR use verify-spicedb.ts from scripts/
bun tsx scripts/verify-spicedb.ts
```

---

## Debugging Tips

### If agents don't show up:

1. Check browser console for errors
2. Verify SpiceDB relationships:
   ```bash
   zed relationship read --insecure --endpoint localhost:50051 --token "testkey"
   ```
3. Check if seed script completed successfully
4. Verify database has data:
   ```bash
   sqlite3 sqlite.db "SELECT * FROM agent;"
   sqlite3 sqlite.db "SELECT * FROM department;"
   ```

### If permissions are wrong:

1. Test directly with zed CLI:
   ```bash
   zed permission check --insecure --endpoint localhost:50051 --token "testkey" agent:agent_1 view user:user_alice
   ```
2. Check relationships:
   ```bash
   zed relationship read --insecure --endpoint localhost:50051 --token "testkey" | grep agent_1
   ```
3. Verify schema is applied:
   ```bash
   zed schema read --insecure --endpoint localhost:50051 --token "testkey"
   ```

### If plugin changes aren't reflected:

1. Restart the dev server
2. Clear browser cache / hard refresh

---

## Testing Different Scenarios

### Test 1: Department-Based Access
- Alice sees only Engineering agents ✓
- Bob sees only Sales agents ✓
- Charlie sees nothing ✓

### Test 2: Permissions Inheritance
- Alice can edit her own agents ✓
- Bob cannot edit Alice's agents ✓

### Test 3: Real-time Permission Checks
- Refresh page - permissions persist ✓
- Different users see different buttons ✓

---

## Production Deployment

When ready for production:

1. Change `insecure: true` to `insecure: false` in auth config
2. Use proper TLS endpoint for SpiceDB
3. Store token in environment variables
4. Add proper authentication (not test users) and routing
5. Add proper error handling

---

## Next Steps

Once this works, you can:

1. Add more resource types (documents, projects, etc.)
2. Implement more complex permission hierarchies
3. Add caveats for time-based or attribute-based permissions
4. Build admin UI for managing departments and permissions
5. Add audit logging