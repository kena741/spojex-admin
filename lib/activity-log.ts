export interface AdminActivityLog {
    id: string;
    created_at: string;
    admin_id: string | null;
    admin_email: string | null;
    admin_name: string | null;
    admin_role: string | null;
    action: string;
    resource_type: string;
    resource_id: string | null;
    resource_name?: string | null;
    route: string | null;
    summary: string;
    display_summary?: string;
    metadata: Record<string, unknown>;
    env: string;
}

export interface CreateActivityLogPayload {
    action: string;
    resource_type: string;
    resource_id?: string;
    summary: string;
    metadata?: Record<string, unknown>;
}
