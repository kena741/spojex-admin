'use client';

import {
    changeItemsHaveBeforeValues,
    extractActivityDetails,
    formatActivityValue,
    getActivityMetadataFieldLabel,
} from '@/lib/activity-log-changes';

interface ActivityLogDetailsProps {
    metadata: Record<string, unknown>;
    resourceId?: string | null;
    route?: string | null;
    env?: string;
}

export function ActivityLogDetails({ metadata, resourceId, route, env }: ActivityLogDetailsProps) {
    const details = extractActivityDetails(metadata);
    const changeItems = details.filter((item) => item.kind === 'change');
    const infoItems = details.filter((item) => item.kind === 'info');
    const hasBeforeValues = changeItemsHaveBeforeValues(changeItems);
    const changedOnlyItems = hasBeforeValues
        ? changeItems
        : changeItems.filter((item) => item.after !== undefined && item.after !== null && item.after !== '');

    return (
        <div className="space-y-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
            {(resourceId || route || env) && (
                <div className="flex flex-wrap gap-3 text-xs text-gray-600">
                    {resourceId ? (
                        <span>
                            <span className="font-semibold text-gray-700">Resource ID:</span>{' '}
                            <span className="font-mono">{resourceId}</span>
                        </span>
                    ) : null}
                    {route ? (
                        <span>
                            <span className="font-semibold text-gray-700">Route:</span>{' '}
                            <span className="font-mono">{route}</span>
                        </span>
                    ) : null}
                    {env ? (
                        <span>
                            <span className="font-semibold text-gray-700">Env:</span> {env}
                        </span>
                    ) : null}
                </div>
            )}

            {changeItems.length > 0 ? (
                <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {hasBeforeValues ? 'Changed fields' : 'Fields in update request'}
                    </p>
                    {!hasBeforeValues ? (
                        <p className="mb-3 text-sm text-amber-800">
                            This older log did not store the previous values, so the exact changed field cannot be confirmed.
                            These are the values sent in the update request.
                        </p>
                    ) : null}
                    <div className="overflow-x-auto rounded-lg border border-white/80 bg-white/90">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/80 text-left text-xs uppercase tracking-wide text-gray-500">
                                    <th className="px-3 py-2 font-semibold">Field</th>
                                    {hasBeforeValues ? (
                                        <>
                                            <th className="px-3 py-2 font-semibold">Before</th>
                                            <th className="px-3 py-2 font-semibold">After</th>
                                        </>
                                    ) : (
                                        <th className="px-3 py-2 font-semibold">Value</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {(hasBeforeValues ? changeItems : changedOnlyItems).map((item) => (
                                    <tr key={item.field} className="border-b border-gray-50 align-top last:border-0">
                                        <td className="px-3 py-2 font-medium text-gray-800">
                                            {item.label || item.field}
                                        </td>
                                        {hasBeforeValues ? (
                                            <>
                                                <td className="max-w-xs px-3 py-2 wrap-break-words text-gray-600">
                                                    {formatActivityValue(item.before)}
                                                </td>
                                                <td className="max-w-xs px-3 py-2 wrap-break-word text-gray-900">
                                                    {formatActivityValue(item.after)}
                                                </td>
                                            </>
                                        ) : (
                                            <td className="max-w-xs px-3 py-2 wrap-break-word text-gray-900">
                                                {formatActivityValue(item.after)}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : null}

            {infoItems.length > 0 ? (
                <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Additional details</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {infoItems.map((item) => (
                            <div
                                key={item.field}
                                className="rounded-lg border border-white/80 bg-white/90 px-3 py-2 text-sm"
                            >
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    {item.label || getActivityMetadataFieldLabel(item.field)}
                                </p>
                                <p className="mt-1 break-words text-gray-800">{formatActivityValue(item.value)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {details.length === 0 ? (
                <p className="text-sm text-gray-600">No extra details were recorded for this action.</p>
            ) : null}
        </div>
    );
}
