/** Numeric/boolean inspection evidence from an owned synthetic fixture only.
 * Text, filenames, identifiers, hidden prose and credentials are not exported to a blog artifact.
 */
export function projectQaLabMetrics(before: unknown, after: unknown) {
    const metrics: { index: number; before: number | boolean | null; after: number | boolean | null }[] = [];
    const paths: string[] = [];
    let truncated = false;
    const scalar = (v: unknown): v is number | boolean => typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));
    const visit = (a: unknown, b: unknown, route: string, depth: number) => {
        if (depth > 20 || metrics.length >= 500) { truncated = true; return; }
        if (scalar(a) || scalar(b)) {
            paths.push(route);
            metrics.push({ index: metrics.length, before: scalar(a) ? a : null, after: scalar(b) ? b : null });
            return;
        }
        const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
        if (!object(a) && !object(b)) return;
        const keys = [...new Set([...Object.keys(object(a) ? a : {}), ...Object.keys(object(b) ? b : {})])].sort();
        for (const key of keys) {
            // Defence in depth for any future ledger fields. The QA endpoint already has a file allowlist.
            if (/secret|token|password|auth|email|request.?id|witness/i.test(key)) continue;
            visit(object(a) ? a[key] : undefined, object(b) ? b[key] : undefined,
                route + '/' + key.replace(/~/g, '~0').replace(/\//g, '~1'), depth + 1);
        }
    };
    visit(before, after, '', 0);
    return { metrics, paths, truncated };
}

/** Model findings are hypotheses, not proof of a new bug or a successful reproduction. */
export function parseQaLabFindings(text: string, metrics: ReturnType<typeof projectQaLabMetrics>['metrics']) {
    if (Buffer.byteLength(text, 'utf8') > 16_384) throw new Error('invalid_qa_findings');
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new Error('invalid_qa_findings'); }
    if (!value || typeof value !== 'object' || Object.keys(value).length !== 1
        || !Array.isArray((value as { findings?: unknown }).findings)) throw new Error('invalid_qa_findings');
    const findings = (value as { findings: Record<string, unknown>[] }).findings;
    if (findings.length > 10) throw new Error('invalid_qa_findings');
    return findings.map(finding => {
        if (!finding || typeof finding !== 'object' || Object.keys(finding).length !== 3
            || !['new_discovery_candidate', 'known_reproduction_candidate', 'model_decision_error', 'connection_failure', 'preference'].includes(String(finding.category))
            || !Number.isSafeInteger(finding.metricIndex) || !metrics.some(metric => metric.index === finding.metricIndex)
            || !['nonnegative', 'positive', 'zero', 'increased', 'decreased', 'unchanged', 'changed'].includes(String(finding.expectation))) throw new Error('invalid_qa_findings');
        const metric = metrics.find(item => item.index === finding.metricIndex)!;
        const a = metric.before, b = metric.after;
        const observed = finding.expectation === 'unchanged' ? a !== null && b !== null && a === b
            : finding.expectation === 'changed' ? a !== null && b !== null && a !== b
            : typeof b !== 'number' ? null
            : finding.expectation === 'nonnegative' ? b >= 0 : finding.expectation === 'positive' ? b > 0
            : finding.expectation === 'zero' ? b === 0 : typeof a !== 'number' ? null
            : finding.expectation === 'increased' ? b > a : b < a;
        return { category: String(finding.category), metricIndex: metric.index, expectation: String(finding.expectation),
            expectationObserved: observed, verification: 'requires_reproduction_and_triage' as const };
    });
}
