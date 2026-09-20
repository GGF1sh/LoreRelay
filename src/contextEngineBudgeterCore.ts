export type ContextCategory =
    | 'system_rules'
    | 'current_scene'
    | 'speaker_identity'
    | 'relationships'
    | 'relevant_memories'
    | 'world_information'
    | 'recent_events'
    | 'flexible_pool'; // Used for borrowing

export interface CategoryBudget {
    min: number;
    target: number;
    max: number;
    borrowUnused: boolean;
}

export interface ContextItemCandidate {
    id: string;
    /** LOD variants: 0 is lowest detail (e.g. ID only), higher numbers are more detail (e.g. full text). Must be sorted LOD descending. */
    lodVariants: { lod: number; text: string; tokenCost: number }[];
    relevanceScore: number;
}

export interface ContextCategoryInput {
    categoryId: string;
    budget: CategoryBudget;
    candidates: ContextItemCandidate[];
}

export interface AllocatedItem {
    id: string;
    lod: number;
    text: string;
    tokenCost: number;
}

export interface AllocationResult {
    categoryId: string;
    allocatedTokens: number;
    items: AllocatedItem[];
}

export const CATEGORY_FILL_ORDER: string[] = [
    'system_rules',
    'speaker_identity',
    'current_scene',
    'world_information',
    'relationships',
    'relevant_memories',
    'recent_events'
];

/**
 * Packs candidates into the given allocated token budget.
 * Degrades LOD before dropping items.
 * Returns the packed items and the total tokens used.
 */
function packCategory(
    candidates: ContextItemCandidate[],
    allocatedTokens: number,
    isTier0: boolean
): { items: AllocatedItem[]; usedTokens: number } {
    // Sort descending by relevance, then ascending by ID
    const sorted = [...candidates].sort((a, b) => {
        if (b.relevanceScore !== a.relevanceScore) {
            return b.relevanceScore - a.relevanceScore;
        }
        return a.id.localeCompare(b.id);
    });

    const items: AllocatedItem[] = [];
    let usedTokens = 0;

    for (const cand of sorted) {
        if (cand.lodVariants.length === 0) continue;
        
        let selectedVariant = null;
        for (const variant of cand.lodVariants) {
            if (usedTokens + variant.tokenCost <= allocatedTokens) {
                selectedVariant = variant;
                break; // Found highest affordable LOD (variants are sorted desc)
            }
        }

        // Tier-0 fallback: if even LOD0 doesn't fit, but it's a critical category, we force it in?
        // For now, if we can't fit the lowest LOD, we drop the item.
        if (selectedVariant) {
            usedTokens += selectedVariant.tokenCost;
            items.push({
                id: cand.id,
                lod: selectedVariant.lod,
                text: selectedVariant.text,
                tokenCost: selectedVariant.tokenCost
            });
        }
    }

    return { items, usedTokens };
}

/**
 * Allocates tokens across categories according to min/target/max bounds,
 * then packs items into each category gracefully lowering LOD if needed.
 */
export function allocateContextBudgets(
    categories: ContextCategoryInput[],
    totalTokens: number
): AllocationResult[] {
    const allocMap = new Map<string, number>();
    for (const c of categories) {
        allocMap.set(c.categoryId, 0);
    }

    // 1. Min guarantees
    let remaining = totalTokens;
    let minSum = 0;
    for (const c of categories) {
        minSum += c.budget.min;
    }

    if (minSum > totalTokens) {
        // Degraded mode: Ensure Tier-0 (system_rules) first, scale down others
        const tier0 = categories.find(c => c.categoryId === 'system_rules');
        const tier0Min = tier0 ? tier0.budget.min : 0;
        
        if (tier0) {
            allocMap.set(tier0.categoryId, Math.min(tier0Min, totalTokens));
            remaining = Math.max(0, totalTokens - tier0Min);
        }
        
        const otherCategories = categories.filter(c => c.categoryId !== 'system_rules');
        const otherMinSum = minSum - tier0Min;
        
        if (remaining > 0 && otherMinSum > 0) {
            const scale = remaining / otherMinSum;
            for (const c of otherCategories) {
                const scaledMin = Math.floor(c.budget.min * scale);
                allocMap.set(c.categoryId, scaledMin);
                remaining -= scaledMin;
            }
        }
    } else {
        // Normal min allocation
        for (const c of categories) {
            allocMap.set(c.categoryId, c.budget.min);
            remaining -= c.budget.min;
        }
    }

    // 2. Target allocation
    if (remaining > 0) {
        const fillOrder = [...CATEGORY_FILL_ORDER];
        // Add any categories not in the explicit order at the end
        for (const c of categories) {
            if (!fillOrder.includes(c.categoryId)) fillOrder.push(c.categoryId);
        }

        for (const catId of fillOrder) {
            if (remaining <= 0) break;
            const cat = categories.find(c => c.categoryId === catId);
            if (!cat) continue;
            
            const currentAlloc = allocMap.get(catId) || 0;
            const take = Math.min(cat.budget.target - currentAlloc, remaining);
            if (take > 0) {
                allocMap.set(catId, currentAlloc + take);
                remaining -= take;
            }
        }
    }

    // 3. Max borrow (Flexible Pool surplus)
    if (remaining > 0) {
        // Sort borrowable categories by their top candidate relevance score
        const borrowable = categories
            .filter(c => c.budget.borrowUnused)
            .map(c => {
                const topScore = c.candidates.reduce((max, cand) => Math.max(max, cand.relevanceScore), 0);
                return { cat: c, topScore };
            })
            .sort((a, b) => b.topScore - a.topScore);

        for (const { cat } of borrowable) {
            if (remaining <= 0) break;
            const currentAlloc = allocMap.get(cat.categoryId) || 0;
            const take = Math.min(cat.budget.max - currentAlloc, remaining);
            if (take > 0) {
                allocMap.set(cat.categoryId, currentAlloc + take);
                remaining -= take;
            }
        }
    }

    // 4. Pack items per category using their final allocated budget
    const results: AllocationResult[] = [];
    for (const c of categories) {
        const allocated = allocMap.get(c.categoryId) || 0;
        const isTier0 = c.categoryId === 'system_rules' || c.categoryId === 'speaker_identity';
        const { items, usedTokens } = packCategory(c.candidates, allocated, isTier0);
        
        results.push({
            categoryId: c.categoryId,
            allocatedTokens: usedTokens,
            items
        });
    }

    return results;
}
