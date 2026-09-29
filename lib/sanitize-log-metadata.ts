const SENSITIVE_KEYS = new Set([
    'password',
    'newpassword',
    'oldpassword',
    'token',
    'secret',
    'service_role_key',
    'apikey',
    'api_key',
]);

function isSensitiveKey(key: string): boolean {
    const normalized = key.trim().toLowerCase().replace(/[_-]/g, '');
    return SENSITIVE_KEYS.has(normalized) || normalized.includes('password');
}

export function sanitizeLogMetadata(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(input)) {
        if (isSensitiveKey(key)) {
            output[key] = '[redacted]';
            continue;
        }
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
            output[key] = sanitizeLogMetadata(entry);
            continue;
        }
        output[key] = entry;
    }

    return output;
}
