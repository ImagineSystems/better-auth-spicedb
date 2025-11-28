/**
 * Configuration for automatic relationship syncing
 * Maps Better Auth events to SpiceDB relationships
 */
export interface RelationshipMapping {
    /**
     * The Better Auth event to listen for
     * Examples: "user.created", "session.created", or custom events
     */
    on: string;

    /**
     * The resource object type in your SpiceDB schema
     * Example: "document", "agent", "department"
     */
    resourceType: string;

    /**
     * The relation name in your SpiceDB schema
     * Example: "owner", "member", "viewer"
     */
    relation: string;

    /**
     * The subject object type in your SpiceDB schema
     * Example: "user", "organization"
     */
    subjectType: string;

    /**
     * Function to extract the resource ID from the event
     * Example: (event) => event.document.id
     */
    resourceId: (event: any) => string;

    /**
     * Function to extract the subject ID from the event
     * Example: (event) => event.user.id
     */
    subjectId: (event: any) => string;
}

export interface SpiceDBPluginOptions {
    /**
     * SpiceDB gRPC endpoint
     * Example: "localhost:50051" or "grpc.authzed.com:443"
     */
    endpoint: string;

    /**
     * SpiceDB API token
     */
    token: string;

    /**
     * Use insecure connection (local development only)
     */
    insecure?: boolean;

    /**
     * Optional namespace prefix for multi-tenancy
     * Example: "tenant1_" → creates "tenant1_user:123"
     */
    namespace?: string;

    /**
     * Automatically sync Better Auth organization plugin events
     * Requires: better-auth organization plugin
     */
    syncOrganizations?: boolean;

    /**
     * Custom relationship mappings for automatic syncing
     * Define how your application events map to SpiceDB relationships
     */
    relationships?: RelationshipMapping[];
}

// ============================================
// Client-side types
// ============================================

export interface CheckPermissionParams {
    resourceType: string;
    resourceId: string;
    permission: string;
    subjectId?: string;
    subjectType?: string;
    context?: Record<string, any>;
}

export interface CheckPermissionResult {
    allowed: boolean;
    error?: string;
}

export interface BulkCheckParams {
    checks: Array<{
        resourceType: string;
        resourceId: string;
        permission: string;
    }>;
    subjectId?: string;
    subjectType?: string;
    context?: Record<string, any>;
}

export interface BulkCheckResult {
    results: Array<{
        resourceType: string;
        resourceId: string;
        permission: string;
        allowed: boolean;
    }>;
}

export interface LookupResourcesParams {
    resourceType: string;
    permission: string;
    subjectId?: string;
    subjectType?: string;
    context?: Record<string, any>;
}

export interface LookupResourcesResult {
    resourceIds: string[];
}

export interface WriteRelationshipParams {
    resource: { type: string; id: string };
    relation: string;
    subject: { type: string; id: string };
}

export interface RelationshipResult {
    success: boolean;
    error?: string;
}

// ============================================
// Helper types for better DX
// ============================================

/**
 * Helper type for defining permissions in your schema
 * Use this to get type safety when checking permissions
 */
export type Permission = string;

/**
 * Helper type for resource types
 */
export type ResourceType = string;

/**
 * Context for caveat evaluation
 * Can include any contextual data like time, IP, user attributes, etc.
 */
export type PermissionContext = Record<string, any>;