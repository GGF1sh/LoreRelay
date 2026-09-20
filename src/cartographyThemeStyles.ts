import themeStylesJson from './cartographyThemeStyles.json';

export interface CartographyThemeStyle {
    mapType: string;
    renderStyle: string;
    extraNegative: string;
}

interface ThemeStyleRule {
    matchAny?: string[];
    matchExact?: string[];
    mapType: string;
    renderStyle: string;
    extraNegative: string;
}

const themeStyles = themeStylesJson as {
    rules: ThemeStyleRule[];
    default: CartographyThemeStyle;
};

function normalizeThemeKey(theme: string): string {
    return theme.toLowerCase().replace(/[\s_]+/g, '-');
}

/** Map look from world_forge meta.theme — shared with Python via cartographyThemeStyles.json. */
export function resolveCartographyThemeStyle(theme?: string): CartographyThemeStyle {
    const key = normalizeThemeKey(theme ?? 'fantasy');
    for (const rule of themeStyles.rules) {
        if (rule.matchExact?.some((fragment) => key === fragment)) {
            return rule;
        }
        if (rule.matchAny?.some((fragment) => key.includes(fragment))) {
            return rule;
        }
    }
    return themeStyles.default;
}