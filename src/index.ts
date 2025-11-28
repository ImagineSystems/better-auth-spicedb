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

/**
 * Create an event emitter that works with SpiceDB plugin hooks
 */
export function createEventEmitter(plugin: ReturnType<typeof import('./server').spicedb>) {
    return async function emitEvent(eventName: string, data: any) {
        const eventHooks = plugin.hooks?.[eventName];

        if (eventHooks && Array.isArray(eventHooks)) {
            console.log(`[SpiceDB] Dispatching '${eventName}' to ${eventHooks.length} hooks...`);
            await Promise.all(eventHooks.map((fn: Function) => fn(data)));
        } else {
            console.warn(`[SpiceDB] No hooks registered for event '${eventName}'.`);
        }
    };
}