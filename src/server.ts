import type { BetterAuthPlugin } from "better-auth";
import { v1 } from "@authzed/authzed-node";
import { Struct } from "google-protobuf/google/protobuf/struct_pb";
import { createAuthEndpoint } from "better-auth/api";
import { z } from "zod";
import type { SpiceDBPluginOptions, RelationshipMapping } from "./types";

export const spicedb = (options: SpiceDBPluginOptions): BetterAuthPlugin => {
  const client = v1.NewClient(
    options.token,
    options.endpoint,
    options.insecure ? v1.ClientSecurity.INSECURE_PLAINTEXT_CREDENTIALS : undefined
  );

  const { promises: promiseClient } = client;

  const namespace = (id: string) => options.namespace ? `${options.namespace}${id}` : id;

  // Internal helper to write relationships
  const writeRelationship = async (
    resource: { type: string; id: string },
    relation: string,
    subject: { type: string; id: string }
  ) => {
    const request = v1.WriteRelationshipsRequest.create({
      updates: [{
        operation: v1.RelationshipUpdate_Operation.TOUCH,
        relationship: v1.Relationship.create({
          resource: v1.ObjectReference.create({ 
            objectType: resource.type, 
            objectId: namespace(resource.id) 
          }),
          relation,
          subject: v1.SubjectReference.create({
            object: v1.ObjectReference.create({ 
              objectType: subject.type, 
              objectId: namespace(subject.id) 
            })
          }),
        }),
      }],
    });
    await promiseClient.writeRelationships(request);
  };

  // Internal helper to delete relationships
  const deleteRelationship = async (
    resource: { type: string; id: string },
    relation: string,
    subject: { type: string; id: string }
  ) => {
    const request = v1.WriteRelationshipsRequest.create({
      updates: [{
        operation: v1.RelationshipUpdate_Operation.DELETE,
        relationship: v1.Relationship.create({
          resource: v1.ObjectReference.create({ 
            objectType: resource.type, 
            objectId: namespace(resource.id) 
          }),
          relation,
          subject: v1.SubjectReference.create({
            object: v1.ObjectReference.create({ 
              objectType: subject.type, 
              objectId: namespace(subject.id) 
            })
          }),
        }),
      }],
    });
    await promiseClient.writeRelationships(request);
  };

  // Automatically sync relationships based on mappings
  const hooks: Record<string, Function[]> = {};

  // Auto-sync for organization plugin if enabled
  if (options.syncOrganizations) {
    hooks["organization.addMember"] = [
      async (event: any) => {
        try {
          await writeRelationship(
            { type: "organization", id: event.organizationId },
            "member",
            { type: "user", id: event.userId }
          );
          console.log(`[spicedb] Synced: user:${event.userId} → organization:${event.organizationId}#member`);
        } catch (err) {
          console.error("[spicedb] Failed to sync organization member:", err);
        }
      }
    ];

    hooks["organization.removeMember"] = [
      async (event: any) => {
        try {
          await deleteRelationship(
            { type: "organization", id: event.organizationId },
            "member",
            { type: "user", id: event.userId }
          );
          console.log(`[spicedb] Removed: user:${event.userId} from organization:${event.organizationId}#member`);
        } catch (err) {
          console.error("[spicedb] Failed to remove organization member:", err);
        }
      }
    ];
  }

  // Process custom relationship mappings
  if (options.relationships) {
    options.relationships.forEach((mapping) => {
      if (!hooks[mapping.on]) hooks[mapping.on] = [];
      
      hooks[mapping.on].push(async (event: any) => {
        try {
          // Extract IDs using the mapping functions
          const resourceId = mapping.resourceId(event);
          const subjectId = mapping.subjectId(event);

          if (!resourceId || !subjectId) {
            console.warn(`[spicedb] Skipping sync - missing IDs in event:`, event);
            return;
          }

          await writeRelationship(
            { type: mapping.resourceType, id: resourceId },
            mapping.relation,
            { type: mapping.subjectType, id: subjectId }
          );

          console.log(`[spicedb] Synced: ${mapping.subjectType}:${subjectId} → ${mapping.resourceType}:${resourceId}#${mapping.relation}`);
        } catch (err) {
          console.error(`[spicedb] Failed to sync relationship for ${mapping.on}:`, err);
        }
      });
    });
  }

  return {
    id: "spicedb",
    hooks,

    endpoints: {
      // Check single permission
      spicedbCheck: createAuthEndpoint(
        "/spicedb/check",
        {
          method: "POST",
          body: z.object({
            resourceType: z.string(),
            resourceId: z.string(),
            permission: z.string(),
            subjectId: z.string().optional(), // Optional - defaults to current user
            subjectType: z.string().default("user"),
            context: z.record(z.any()).optional(),
          }),
        },
        async (ctx) => {
          const session = ctx.context.session;
          const { resourceType, resourceId, permission, subjectId, subjectType, context } = ctx.body;

          // If no subjectId provided, must be authenticated
          const actualSubjectId = subjectId || session?.user?.id;
          if (!actualSubjectId) {
            return ctx.json({ allowed: false, reason: "unauthenticated" }, { status: 401 });
          }

          try {
            const request = v1.CheckPermissionRequest.create({
              resource: v1.ObjectReference.create({ 
                objectType: resourceType, 
                objectId: namespace(resourceId) 
              }),
              permission,
              subject: v1.SubjectReference.create({
                object: v1.ObjectReference.create({ 
                  objectType: subjectType, 
                  objectId: namespace(actualSubjectId) 
                })
              }),
              context: context ? Struct.fromJson(context) : undefined,
            });

            const response = await promiseClient.checkPermission(request);
            const allowed = response.permissionship === v1.CheckPermissionResponse_Permissionship.HAS_PERMISSION;

            return ctx.json({ allowed });
          } catch (err: any) {
            console.error("[spicedb] Check failed:", err);
            return ctx.json({ allowed: false, error: err.message }, { status: 500 });
          }
        }
      ),

      // Bulk check permissions
      spicedbCheckBulk: createAuthEndpoint(
        "/spicedb/check-bulk",
        {
          method: "POST",
          body: z.object({
            checks: z.array(z.object({
              resourceType: z.string(),
              resourceId: z.string(),
              permission: z.string(),
            })),
            subjectId: z.string().optional(),
            subjectType: z.string().default("user"),
            context: z.record(z.any()).optional(),
          }),
        },
        async (ctx) => {
          const session = ctx.context.session;
          const { checks, subjectId, subjectType, context } = ctx.body;

          const actualSubjectId = subjectId || session?.user?.id;
          if (!actualSubjectId) {
            return ctx.json({ results: [], reason: "unauthenticated" }, { status: 401 });
          }

          try {
            const results = await Promise.all(
              checks.map(async (check) => {
                const request = v1.CheckPermissionRequest.create({
                  resource: v1.ObjectReference.create({ 
                    objectType: check.resourceType, 
                    objectId: namespace(check.resourceId) 
                  }),
                  permission: check.permission,
                  subject: v1.SubjectReference.create({
                    object: v1.ObjectReference.create({ 
                      objectType: subjectType, 
                      objectId: namespace(actualSubjectId) 
                    })
                  }),
                  context: context ? Struct.fromJson(context) : undefined,
                });

                const response = await promiseClient.checkPermission(request);
                const allowed = response.permissionship === v1.CheckPermissionResponse_Permissionship.HAS_PERMISSION;

                return {
                  resourceType: check.resourceType,
                  resourceId: check.resourceId,
                  permission: check.permission,
                  allowed,
                };
              })
            );

            return ctx.json({ results });
          } catch (err: any) {
            console.error("[spicedb] Bulk check failed:", err);
            return ctx.json({ results: [], error: err.message }, { status: 500 });
          }
        }
      ),

      // Lookup resources user has permission on
      spicedbLookupResources: createAuthEndpoint(
        "/spicedb/lookup-resources",
        {
          method: "POST",
          body: z.object({
            resourceType: z.string(),
            permission: z.string(),
            subjectId: z.string().optional(),
            subjectType: z.string().default("user"),
            context: z.record(z.any()).optional(),
          }),
        },
        async (ctx) => {
          const session = ctx.context.session;
          const { resourceType, permission, subjectId, subjectType, context } = ctx.body;

          const actualSubjectId = subjectId || session?.user?.id;
          if (!actualSubjectId) {
            return ctx.json({ resourceIds: [], reason: "unauthenticated" }, { status: 401 });
          }

          try {
            const request = v1.LookupResourcesRequest.create({
              resourceObjectType: resourceType,
              permission,
              subject: v1.SubjectReference.create({
                object: v1.ObjectReference.create({
                  objectType: subjectType,
                  objectId: namespace(actualSubjectId)
                })
              }),
              consistency: v1.Consistency.create({
                requirement: {
                  oneofKind: 'fullyConsistent',
                  fullyConsistent: true
                }
              }),
              context: context ? Struct.fromJson(context) : undefined,
            });

            const resourceIds: string[] = [];
            for await (const response of await promiseClient.lookupResources(request)) {
              const rawId = response.resourceObjectId;
              const id = options.namespace && rawId.startsWith(options.namespace)
                ? rawId.slice(options.namespace.length)
                : rawId;
              resourceIds.push(id);
            }

            return ctx.json({ resourceIds });
          } catch (err: any) {
            console.error("[spicedb] Lookup failed:", err);
            return ctx.json({ resourceIds: [], error: err.message }, { status: 500 });
          }
        }
      ),

      // Write a relationship (for manual control if needed)
      spicedbWriteRelationship: createAuthEndpoint(
        "/spicedb/write-relationship",
        {
          method: "POST",
          requireAdmin: true, // Should be restricted
          body: z.object({
            resource: z.object({
              type: z.string(),
              id: z.string(),
            }),
            relation: z.string(),
            subject: z.object({
              type: z.string(),
              id: z.string(),
            }),
          }),
        },
        async (ctx) => {
          try {
            await writeRelationship(
              ctx.body.resource as { type: string; id: string },
              ctx.body.relation,
              ctx.body.subject as { type: string; id: string }
            );
            return ctx.json({ success: true });
          } catch (err: any) {
            console.error("[spicedb] Write relationship failed:", err);
            return ctx.json({ success: false, error: err.message }, { status: 500 });
          }
        }
      ),

      // Delete a relationship
      spicedbDeleteRelationship: createAuthEndpoint(
        "/spicedb/delete-relationship",
        {
          method: "POST",
          requireAdmin: true,
          body: z.object({
            resource: z.object({
              type: z.string(),
              id: z.string(),
            }),
            relation: z.string(),
            subject: z.object({
              type: z.string(),
              id: z.string(),
            }),
          }),
        },
        async (ctx) => {
          try {
            await deleteRelationship(
              ctx.body.resource as { type: string; id: string },
              ctx.body.relation,
              ctx.body.subject as { type: string; id: string }
            );
            return ctx.json({ success: true });
          } catch (err: any) {
            console.error("[spicedb] Delete relationship failed:", err);
            return ctx.json({ success: false, error: err.message }, { status: 500 });
          }
        }
      ),
    },
  };
};