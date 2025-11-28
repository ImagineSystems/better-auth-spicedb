// scripts/seed.ts
import { db } from '../src/lib/db';
import { user, department, agent, account, verification, session } from '../src/lib/db/schema';
import { emitAuthEvent } from '../src/lib/auth';
import { scryptSync, randomBytes } from 'crypto';

/**
 * Function to hash a password using scrypt with specific parameters.
 * (Same as better-auth's default)
 * @param password 
 * @returns 
 */
function hashPassword(password: string): string {
    // 1. Generate 16 bytes of random data for the salt
    const saltBytes = randomBytes(16);
    // 2. Convert salt to hex string (this is what better-auth uses as the salt input)
    const salt = saltBytes.toString('hex');

    // 3. Hash using the EXACT parameters you found
    // N=16384, r=16, p=1, dkLen=64
    const hashedPasswordBuffer = scryptSync(password.normalize("NFKC"), salt, 64, {
        cost: 16384,            // N
        blockSize: 16,          // r
        parallelization: 1,     // p
        maxmem: 128 * 16384 * 16 * 2, // Matches the memory limit in your snippet
    });

    // 4. Convert result to hex
    const key = hashedPasswordBuffer.toString('hex');

    // 5. Combine format: salt:key
    return `${salt}:${key}`;
}

/**
 * Main seeding function
 */
async function seed() {
  console.log('🧹 Cleaning database...');
  // Delete tables that reference others first
  await db.delete(agent);       // References department and user
  await db.delete(department);  // References organization (string)
  await db.delete(account);     // References user
  await db.delete(session);     // References user
  await db.delete(verification);
  await db.delete(user);        // The root table
  
  console.log('🌱 Seeding database...');

  // 1. Create Users
  const [alice, bob, charlie] = await db.insert(user).values([
    {
      id: 'user_alice',
      name: 'Alice',
      email: 'alice@example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'user_bob',
      name: 'Bob',
      email: 'bob@example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'user_charlie',
      name: 'Charlie',
      email: 'charlie@example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]).returning();
  
  console.log('✅ Created users');
  
  // 2. Create Accounts

  const passwordHash = hashPassword('password123');

  await db.insert(account).values([
    {
      id: 'account_alice',
      accountId: 'alice@example.com',
      providerId: 'credential',
      userId: alice.id,
      // FIX: Use bcrypt hash (10 rounds is standard)
      password: passwordHash, 
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'account_bob',
      accountId: 'bob@example.com',
      providerId: 'credential',
      userId: bob.id,
      password: passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'account_charlie',
      accountId: 'charlie@example.com',
      providerId: 'credential',
      userId: charlie.id,
      password: passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  // 3. Create Departments
  const [engineering, sales] = await db.insert(department).values([
    {
      id: 'dept_engineering',
      name: 'Engineering',
      organizationId: 'org_1',
      createdAt: new Date(),
    },
    {
      id: 'dept_sales',
      name: 'Sales',
      organizationId: 'org_1',
      createdAt: new Date(),
    },
  ]).returning();
  
  // 4. Emit Auth Events
  await emitAuthEvent('department.member.added', {
    departmentId: engineering.id,
    userId: alice.id,
  });
  
  await emitAuthEvent('department.member.added', {
    departmentId: sales.id,
    userId: bob.id,
  });
  
  // 5. Create Agents
  const [agent1, agent2, agent3] = await db.insert(agent).values([
    {
      id: 'agent_1',
      name: 'Agent Alpha',
      departmentId: engineering.id,
      createdBy: alice.id,
      organizationId: 'org_1',
      createdAt: new Date(),
    },
    {
      id: 'agent_2',
      name: 'Agent Beta',
      departmentId: engineering.id,
      createdBy: alice.id,
      organizationId: 'org_1',
      createdAt: new Date(),
    },
    {
      id: 'agent_3',
      name: 'Agent Gamma',
      departmentId: sales.id,
      createdBy: bob.id,
      organizationId: 'org_1',
      createdAt: new Date(),
    },
  ]).returning();
  
  console.log('✅ Created agents');

  // 6. Sync to SpiceDB (Mocked events)
  await emitAuthEvent('agent.created', {
    agent: { id: agent1.id, departmentId: agent1.departmentId, createdBy: agent1.createdBy },
  });
  await emitAuthEvent('agent.created', {
    agent: { id: agent2.id, departmentId: agent2.departmentId, createdBy: agent2.createdBy },
  });
  await emitAuthEvent('agent.created', {
    agent: { id: agent3.id, departmentId: agent3.departmentId, createdBy: agent3.createdBy },
  });
  
  console.log('\n🎉 Seeding complete!');
  process.exit(0);
}

seed().catch((error) => {
  console.error('❌ Seeding failed:', error);
  process.exit(1);
});