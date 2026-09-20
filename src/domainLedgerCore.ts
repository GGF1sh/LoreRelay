// Domain §1.4 — treasury vs commerce.credits wallet boundary (pure).

/** GM one-liner when Commerce and Domain are both enabled. */
export const DOMAIN_LEDGER_PROMPT_LINE =
    'Ledger: tradeOps change commerce.credits only (personal/caravan trade). '
    + 'Domain tax, garrison pay, monthly policy, and lordship income change domain.treasury only. '
    + 'Never move the same payment through both wallets in narration or statePatch.';

export type DomainWallet = 'treasury' | 'credits';

export type DomainPaymentKind =
    | 'trade_ops'
    | 'domain_monthly_policy'
    | 'domain_tax_income'
    | 'domain_event'
    | 'domain_garrison';

/** Deterministic routing for narration / apply layers (§6.1). */
export function resolveDomainPaymentWallet(kind: DomainPaymentKind): DomainWallet {
    if (kind === 'trade_ops') {
        return 'credits';
    }
    return 'treasury';
}

export function buildDomainLedgerPromptLine(commerceEnabled: boolean, domainEnabled: boolean): string {
    if (!commerceEnabled || !domainEnabled) {
        return '';
    }
    return DOMAIN_LEDGER_PROMPT_LINE;
}