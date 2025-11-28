import type { BetterAuthClientPlugin } from "better-auth";
import type { 
    SpiceDBPluginOptions, 
    BulkCheckParams, 
    BulkCheckResult,
    LookupResourcesParams,
    LookupResourcesResult,
    CheckPermissionParams,
    CheckPermissionResult,
    WriteRelationshipParams,
    RelationshipResult
} from "./types";

export const spiceDBClient = (options?: SpiceDBPluginOptions) => {
    return {
        id: "spicedb",
        $InferServerPlugin: {} as ReturnType<typeof import("./server").spicedb>,
        
        // This maps 'authClient.spicedb.methodName' -> API calls
        getActions: ($fetch : any) => ({
            spicedb: {
                check: async (params: CheckPermissionParams) => {
                    const result = await $fetch("/spicedb/check", {
                        method: "POST",
                        body: params
                    });
                    return result as CheckPermissionResult;  
                },
                checkBulk: async (params: BulkCheckParams) => {
                    const result = await $fetch("/spicedb/check-bulk", {
                        method: "POST",
                        body: params
                    });
                    return result as BulkCheckResult;
                },
                lookupResources: async (params: LookupResourcesParams) => {
                    const result = await $fetch("/spicedb/lookup-resources", {
                        method: "POST",
                        body: params,
                        credentials: 'include' // Include cookies for session auth
                    });
                    return result as LookupResourcesResult;
                },
                // Admin only
                writeRelationship: async (params: WriteRelationshipParams) => {
                    const result = await $fetch("/spicedb/write-relationship", {
                        method: "POST",
                        body: params
                    });
                    return result as RelationshipResult;
                }
            }
        }),
    } satisfies BetterAuthClientPlugin;
};