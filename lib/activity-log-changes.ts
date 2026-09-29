export interface ActivityFieldChange {
    field: string;
    label?: string;
    before?: unknown;
    after?: unknown;
}

const IGNORE_FIELDS = new Set(['updated_at', 'created_at', 'createdAt']);

function valuesEqual(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

export function formatActivityValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (value === '[hidden]') return 'Hidden';
    if (value === '[changed]' || value === '[reset]') return 'Changed';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        return value.every((entry) => typeof entry === 'string') ? value.join(', ') : JSON.stringify(value);
    }
    return JSON.stringify(value);
}

export function buildFieldChanges(
    before: Record<string, unknown> | null | undefined,
    after: Record<string, unknown>,
    fields?: string[]
): ActivityFieldChange[] {
    const beforeRecord = before ?? {};
    const keys = fields ?? [...new Set([...Object.keys(beforeRecord), ...Object.keys(after)])];

    const changes: ActivityFieldChange[] = [];
    for (const field of keys) {
        if (IGNORE_FIELDS.has(field)) continue;
        if (!(field in beforeRecord) && !(field in after)) continue;

        const previous = beforeRecord[field];
        const next = after[field];
        if (valuesEqual(previous, next)) continue;

        changes.push({
            field,
            before: previous,
            after: next,
        });
    }

    return changes;
}

export function buildChangeMetadata(
    before: Record<string, unknown> | null | undefined,
    after: Record<string, unknown>,
    fields?: string[]
): Record<string, unknown> {
    const changes = buildFieldChanges(before, after, fields);
    if (changes.length === 0) return {};
    return { changes };
}

export function summarizeChangedFields(changes: ActivityFieldChange[]): string {
    if (changes.length === 0) return '';
    return changes.map((change) => change.label || change.field).join(', ');
}

export function buildUpdateSummary(baseSummary: string, changes: ActivityFieldChange[]): string {
    const fields = summarizeChangedFields(changes);
    return fields ? `${baseSummary} (${fields})` : baseSummary;
}

function isLegacyFlatMetadata(metadata: Record<string, unknown>): boolean {
    if (Array.isArray(metadata.changes) && metadata.changes.length > 0) return false;
    return Object.keys(metadata).some((key) => !LEGACY_RESERVED_KEYS.has(key) && !IGNORE_FIELDS.has(key));
}

const LEGACY_RESERVED_KEYS = new Set([
    'changes',
    'fields',
    'sections',
    'password_reset',
    'service_ids',
    'provider_id',
    'provider_name',
    'provider_email',
    'withdrawal_id',
    'amount',
    'amount_etb',
    'reference',
    'tx_ref',
    'verify_status',
    'transfer_status',
    'source',
    'wallet_deducted',
    'wallet_skipped_reason',
]);

const METADATA_FIELD_LABELS: Record<string, string> = {
    provider_name: 'Provider',
    provider_email: 'Provider email',
    provider_id: 'Provider ID',
    withdrawal_id: 'Withdrawal ID',
    amount: 'Amount',
    amount_etb: 'Amount',
    reference: 'Chapa reference',
    tx_ref: 'Chapa reference',
    verify_status: 'Verify status',
    transfer_status: 'Transfer status',
    source: 'Source',
    wallet_deducted: 'Wallet deducted',
    wallet_skipped_reason: 'Wallet skip reason',
};

function metadataFieldLabel(field: string): string {
    return METADATA_FIELD_LABELS[field] ?? field.replace(/_/g, ' ');
}

export function getActivityMetadataFieldLabel(field: string): string {
    return metadataFieldLabel(field);
}

export interface ActivityDetailItem {
    kind: 'change' | 'info';
    field: string;
    label?: string;
    before?: unknown;
    after?: unknown;
    value?: unknown;
}

function isFieldChange(value: unknown): value is ActivityFieldChange {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return typeof record.field === 'string';
}

function pushInfo(items: ActivityDetailItem[], field: string, value: unknown): void {
    if (value === undefined || value === null) return;
    items.push({ kind: 'info', field, label: metadataFieldLabel(field), value });
}

export function extractActivityDetails(metadata: Record<string, unknown> | null | undefined): ActivityDetailItem[] {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];

    const items: ActivityDetailItem[] = [];

    if (Array.isArray(metadata.changes)) {
        for (const entry of metadata.changes) {
            if (!isFieldChange(entry)) continue;
            items.push({
                kind: 'change',
                field: entry.field,
                label: entry.label,
                before: entry.before,
                after: entry.after,
            });
        }
    }

    if (Array.isArray(metadata.fields) && items.length === 0) {
        for (const field of metadata.fields) {
            if (typeof field !== 'string') continue;
            items.push({ kind: 'info', field, value: 'Updated' });
        }
    }

    if (Array.isArray(metadata.sections)) {
        for (const section of metadata.sections) {
            if (typeof section !== 'string') continue;
            items.push({ kind: 'info', field: section, value: 'Section updated' });
        }
    }

    const reservedKeys = LEGACY_RESERVED_KEYS;

    const legacySnapshot = items.length === 0 && isLegacyFlatMetadata(metadata);

    for (const [field, value] of Object.entries(metadata)) {
        if (reservedKeys.has(field) || IGNORE_FIELDS.has(field)) {
            if (field === 'password_reset' && value === true) {
                items.push({ kind: 'info', field: 'password', value: 'Reset' });
            }
            if (field === 'service_ids' && Array.isArray(value)) {
                pushInfo(items, 'service_ids', value.join(', '));
            }
            if (field === 'provider_id' && typeof value === 'string') {
                pushInfo(items, 'provider_id', value);
            }
            if (field === 'provider_name' && typeof value === 'string') {
                pushInfo(items, 'provider_name', value);
            }
            if (field === 'provider_email' && typeof value === 'string') {
                pushInfo(items, 'provider_email', value);
            }
            if (field === 'withdrawal_id' && typeof value === 'string') {
                pushInfo(items, 'withdrawal_id', value);
            }
            if (field === 'amount' && (typeof value === 'string' || typeof value === 'number')) {
                pushInfo(items, 'amount', value);
            }
            if (field === 'amount_etb' && typeof value === 'string') {
                pushInfo(items, 'amount_etb', value);
            }
            if (field === 'reference' && typeof value === 'string') {
                pushInfo(items, 'reference', value);
            }
            if (field === 'tx_ref' && typeof value === 'string') {
                pushInfo(items, 'tx_ref', value);
            }
            if (field === 'verify_status' && typeof value === 'string') {
                pushInfo(items, 'verify_status', value);
            }
            if (field === 'transfer_status' && typeof value === 'string') {
                pushInfo(items, 'transfer_status', value);
            }
            if (field === 'source' && typeof value === 'string') {
                pushInfo(items, 'source', value);
            }
            if (field === 'wallet_deducted' && typeof value === 'boolean') {
                pushInfo(items, 'wallet_deducted', value);
            }
            if (field === 'wallet_skipped_reason' && typeof value === 'string') {
                pushInfo(items, 'wallet_skipped_reason', value);
            }
            continue;
        }

        if (items.some((item) => item.field === field)) continue;

        if (value && typeof value === 'object' && !Array.isArray(value)) continue;

        if (field === 'permissions' && Array.isArray(value)) {
            items.push({ kind: 'info', field, value: value.join(', ') });
            continue;
        }

        if (legacySnapshot) {
            items.push({ kind: 'info', field, label: metadataFieldLabel(field), value });
            continue;
        }

        items.push({ kind: 'change', field, after: value });
    }

    return items;
}

export function changeItemsHaveBeforeValues(items: ActivityDetailItem[]): boolean {
    return items.some(
        (item) => item.kind === 'change' && item.before !== undefined && item.before !== null && item.before !== ''
    );
}

export function hasActivityDetails(metadata: Record<string, unknown> | null | undefined): boolean {
    return extractActivityDetails(metadata).length > 0;
}
