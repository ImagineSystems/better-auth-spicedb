export { spicedb } from './server';
export { spiceDBClient } from './client';
export type {
    SpiceDBPluginOptions,
    RelationshipMapping,
    CheckPermissionParams,
    CheckPermissionResult,
    BulkCheckParams,
    BulkCheckResult,
    LookupResourcesParams,
    LookupResourcesResult,
    WriteRelationshipParams,
    RelationshipResult,
    Permission,
    ResourceType,
    PermissionContext
} from './types';

// Helper to emit custom events for SpiceDB sync
export function createEventEmitter(auth: any) {
    return async function emitEvent(eventName: string, data: any) {
        const plugin = auth.$Infer?.Plugin?.spicedb;
        if (plugin?.hooks?.[eventName]) {
            await Promise.all(
                plugin.hooks[eventName].map((fn: Function) => fn(data))
            );
        }
    };
}