import { DOMAIN_EVENTS } from './domainCore';
import { GUILD_EVENTS } from './guildCore';
import { PETITION_DEFS } from './domainAudienceCore';
import { toExcludedEventId, EventKind } from './gameRulesCore';

export interface EventManagementCatalogEntry {
    namespacedId: string;
    kind: EventKind;
    label: string;
    description?: string;
}

export function getEventManagementCatalog(): EventManagementCatalogEntry[] {
    const catalog: EventManagementCatalogEntry[] = [];

    for (const e of DOMAIN_EVENTS) {
        if (e.id === 'domain_quiet_month') continue;
        catalog.push({
            namespacedId: toExcludedEventId('domain', e.id),
            kind: 'domain',
            label: `domain_${e.id}`, // We'll map this in the webview via localization
        });
    }

    for (const e of GUILD_EVENTS) {
        if (e.id === 'guild_quiet_week') continue;
        catalog.push({
            namespacedId: toExcludedEventId('guild', e.id),
            kind: 'guild',
            label: `guild_${e.id}`,
        });
    }

    for (const e of PETITION_DEFS) {
        catalog.push({
            namespacedId: toExcludedEventId('audience', e.id),
            kind: 'audience',
            label: `audience_${e.id}`,
        });
    }

    return catalog;
}
