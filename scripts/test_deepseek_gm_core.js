const assert = require('node:assert/strict');
const { parseDeepSeekCandidate, readDeepSeekUsage } = require('../out/deepSeekGmCore');
const fixture = () => ({ model: 'deepseek-v4-flash', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'candidate' } }],
    usage: { prompt_tokens: 1000000, prompt_cache_hit_tokens: 0, completion_tokens: 1000000 } });
let result = parseDeepSeekCandidate(fixture(), 'deepseek-v4-flash');
assert.equal(result.text, 'candidate');
assert.equal(result.usage.estimatedUsdMin, 0.88);
assert.equal(result.usage.estimatedUsdMax, 1.76);
assert.equal(result.usage.priceDate, '2026-09-08');
const cached = fixture(); cached.usage.prompt_cache_hit_tokens = 1000000;
assert.equal(parseDeepSeekCandidate(cached, 'deepseek-v4-flash').usage.estimatedUsdMin, 0.667);
const missing = fixture(); delete missing.usage;
assert.equal(parseDeepSeekCandidate(missing, 'deepseek-v4-flash').usage, undefined);
for (const reason of ['length', 'tool_calls', 'content_filter', null]) {
    const partial = fixture(); partial.choices[0].finish_reason = reason;
    assert.throws(() => parseDeepSeekCandidate(partial, 'deepseek-v4-flash'), /invalid_candidate/);
    assert.equal(readDeepSeekUsage(partial, 'deepseek-v4-flash').input, 1000000, 'Rejected responses can still incur API usage');
}
const wrong = fixture(); wrong.model = 'other';
assert.throws(() => parseDeepSeekCandidate(wrong, 'deepseek-v4-flash'), /model_mismatch/);
const tools = fixture(); tools.choices[0].message.tool_calls = [{ id: 'tool' }];
assert.throws(() => parseDeepSeekCandidate(tools, 'deepseek-v4-flash'), /invalid_candidate/);
console.log('DeepSeek finality, model binding, tool refusal and dated usage cost range passed.');
