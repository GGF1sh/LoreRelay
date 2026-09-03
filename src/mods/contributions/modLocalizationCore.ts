import { ModDataError, normalizeModPackageFile, parseStrictJsonBytes, type ModPackageHashFile } from '../modHashCore';
import type { ModManifest } from '../modManifestCore';
import { compareUnicodeCodePointOrder, splitCanonicalResourceId } from '../modPathCore';

export type ModPresentationField = 'name' | 'label' | 'description' | 'alt';
export interface ModPresentationResource { id: string; fields: Partial<Record<ModPresentationField, string>> }
export interface ModLocalizedString { resourceId: string; field: ModPresentationField; locale: string; text: string }

function invalid(): never { throw new ModDataError('MOD_LOCALIZATION_INVALID', 'Localization must address a same-package, allowlisted presentation field'); }

/** Keys are canonical-resource-id#field, deliberately separate from Core i18n keys and content. */
export function parseModLocalization(manifest: ModManifest, files: readonly ModPackageHashFile[], resources: readonly ModPresentationResource[]): ModLocalizedString[] {
    const strings: ModLocalizedString[] = [], seen = new Set<string>();
    let bytes = 0;
    for (const descriptor of [...(manifest.entrypoints.localization ?? [])].sort((a, b) => compareUnicodeCodePointOrder(a.locale, b.locale) || compareUnicodeCodePointOrder(a.path, b.path))) {
        const file = files.find(item => item.path === descriptor.path);
        if (!file || file.kind !== 'json' || file.bytes.length > 1024 * 1024 || (bytes += file.bytes.length) > 4 * 1024 * 1024) return invalid();
        const doc = parseStrictJsonBytes(normalizeModPackageFile(file)) as Record<string, unknown>;
        if (!doc || typeof doc !== 'object' || Array.isArray(doc) || Object.keys(doc).some(key => !['format', 'locale', 'strings'].includes(key))
            || doc.format !== 'lorerelay-localization/1' || doc.locale !== descriptor.locale || !doc.strings || typeof doc.strings !== 'object' || Array.isArray(doc.strings)) return invalid();
        for (const [key, value] of Object.entries(doc.strings).sort((a, b) => compareUnicodeCodePointOrder(a[0], b[0]))) {
            const parts = key.split('#'), resourceId = parts[0], field = parts[1] as ModPresentationField;
            const owner = splitCanonicalResourceId(resourceId);
            const resource = resources.find(item => item.id === resourceId);
            const identity = `${key}\0${descriptor.locale.toLowerCase()}`;
            if (parts.length !== 2 || owner?.namespace !== 'mod' || owner.modId !== manifest.id || !resource
                || !Object.prototype.hasOwnProperty.call(resource.fields, field) || seen.has(identity) || strings.length >= 4096
                || typeof value !== 'string' || !value.trim() || value.trim() !== value || Buffer.byteLength(value) > 4096
                // URI tokens (including custom schemes) are not presentation prose.
                // A colon followed by whitespace and numeric times/ratios remain ordinary text.
                || /[\u0000-\u001f\u007f<>]|!\[|:\/\/|(?:data|file|command|vscode):|(?:^|[^a-z0-9+.-])[a-z][a-z0-9+.-]*:(?=\S)|\[[^\r\n]*\]\s*(?:\(|\[|:)|\bwww\.[^\s]+|[^\s@]+@[^\s@]+\.[^\s@]+/i.test(value)) return invalid();
            seen.add(identity);
            strings.push({ resourceId, field, locale: descriptor.locale.toLowerCase(), text: value });
        }
    }
    return strings;
}

/** Exact requested locale -> same package en -> authored field. Never consult base or other MODs. */
export function resolveModLocalizedField(registry: { presentations: readonly ModPresentationResource[]; localization: readonly ModLocalizedString[] }, id: string, field: ModPresentationField, locale: string): string | undefined {
    const source = registry.presentations.find(item => item.id === id)?.fields[field];
    if (source === undefined) return undefined;
    return registry.localization.find(item => item.resourceId === id && item.field === field && item.locale === locale.toLowerCase())?.text
        ?? registry.localization.find(item => item.resourceId === id && item.field === field && item.locale === 'en')?.text
        ?? source;
}

/** Translate badges only after prompt/turn processing; keep canonical labels in saved evidence. */
export function localizeModLoreLabels(registry: { presentations: readonly ModPresentationResource[]; localization: readonly ModLocalizedString[] }, labels: readonly string[], locale: string): string[] {
    return labels.map(label => {
        const pinned = label.startsWith('📌 '), plain = pinned ? label.slice(3) : label;
        const resource = registry.presentations.find(item => item.fields.label !== undefined && plain === `${item.id} — ${item.fields.label}`);
        return resource ? `${pinned ? '📌 ' : ''}${resource.id} — ${resolveModLocalizedField(registry, resource.id, 'label', locale)}` : label;
    });
}
