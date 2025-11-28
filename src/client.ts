import type { BetterAuthClientPlugin } from "better-auth/client";

export const spiceDBClient = (): BetterAuthClientPlugin => {
    return {
        id: "spicedb-client",
        getActions: ($fetch) => ({
            spicedb: {
                /**
                 * Check if a subject has permission on a resource
                 * Defaults to checking current user's permissions
                 */
                check: async (params: {
                    resourceType: string,
                    resourceId: string,
                    permission: string,
                    subjectId?: string,
                    subjectType?: string,
                    context?: Record<string, any>
                }) => {
                    return await $fetch<{ allowed: boolean }>("/spicedb/check", {
                        method: "POST",
                        body: params
                    });
                },
                
                /**
                 * Check multiple permissions at once for better performance
                 * Useful for list views where you need to check many resources
                 */
                checkBulk: async (params: {
                    checks: Array<{
                        resourceType: string,
                        resourceId: string,
                        permission: string,
                    }>,
                    subjectId?: string,
                    subjectType?: string,
                    context?: Record<string, any>
                }) => {
                    return await $fetch<{ 
                        results: Array<{
                            resourceType: string,
                            resourceId: string,
                            permission: string,
                            allowed: boolean
                        }> 
                    }>("/spicedb/check-bulk", {
                        method: "POST",
                        body: params
                    });
                },
                
                /**
                 * Get all resource IDs that a subject has permission on
                 * This is the most efficient way to filter lists
                 */
                lookupResources: async (params: {
                    resourceType: string,
                    permission: string,
                    subjectId?: string,
                    subjectType?: string,
                    context?: Record<string, any>
                }) => {
                    return await $fetch<{ resourceIds: string[] }>("/spicedb/lookup-resources", {
                        method: "POST",
                        body: params
                    });
                },

                /**
                 * Manually write a relationship
                 * Requires admin privileges
                 */
                writeRelationship: async (params: {
                    resource: { type: string; id: string },
                    relation: string,
                    subject: { type: string; id: string }
                }) => {
                    return await $fetch<{ success: boolean }>("/spicedb/write-relationship", {
                        method: "POST",
                        body: params
                    });
                },

                /**
                 * Manually delete a relationship
                 * Requires admin privileges
                 */
                deleteRelationship: async (params: {
                    resource: { type: string; id: string },
                    relation: string,
                    subject: { type: string; id: string }
                }) => {
                    return await $fetch<{ success: boolean }>("/spicedb/delete-relationship", {
                        method: "POST",
                        body: params
                    });
                }
            }
        }),
        pathMethods: {
            "/spicedb/check": "POST",
            "/spicedb/check-bulk": "POST",
            "/spicedb/lookup-resources": "POST",
            "/spicedb/write-relationship": "POST",
            "/spicedb/delete-relationship": "POST"
        }
    };
};