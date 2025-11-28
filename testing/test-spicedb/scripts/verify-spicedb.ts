import { v1 } from "@authzed/authzed-node";

// 1. Connect to local SpiceDB
const client = v1.NewClient(
  "testkey",
  "localhost:50051",
  v1.ClientSecurity.INSECURE_PLAINTEXT_CREDENTIALS
);

async function verify() {
  console.log("🔍 Querying SpiceDB for known relationships...\n");

  // Helper to print a stream of relationships
  const printRelationships = async (resourceType: string) => {
    console.log(`--- ${resourceType.toUpperCase()} Relationships ---`);
    const request = v1.ReadRelationshipsRequest.create({
      consistency: v1.Consistency.create({
        requirement: { oneofKind: 'fullyConsistent', fullyConsistent: true }
      }),
      relationshipFilter: v1.RelationshipFilter.create({
        resourceType: resourceType,
      })
    });

    const stream = client.readRelationships(request);
    let count = 0;

    for await (const response of stream) {
        const rel = response.relationship!;
        const resource = `${rel.resource!.objectType}:${rel.resource!.objectId}`;
        const subject = `${rel.subject!.object!.objectType}:${rel.subject!.object!.objectId}`;
        const relation = rel.relation;
        
        console.log(`✅ ${resource} #${relation} @ ${subject}`);
        count++;
    }
    
    if (count === 0) console.log(`   (No relationships found for ${resourceType})`);
    console.log(""); 
  };

  // 2. Check the types we know we seeded
  await printRelationships("department"); // Should see members
  await printRelationships("agent");      // Should see owners and departments
  
  process.exit(0);
}

verify().catch(e => console.error(e));