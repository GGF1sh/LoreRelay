// webview/modules/84a-webview-anim.js
// Shared decorative animation driver for Webview visual polish (Graphics Upgrade Track 1-3).
// Single rAF loop shared by all animated overlays — no canonical state, no persistence, no ops.
// Consumers register a tick(phase) callback; this module owns start/stop, throttling,
// prefers-reduced-motion, tab-visibility pause, and the user-facing effects tier.

(function () {
    const TIER_STORAGE_KEY = 'lr.effectsTier';
    const TIERS = ['off', 'light', 'full'];
    const DEFAULT_TIER = 'light';

    const _handlers = new Map(); // id -> { tick, fps, lastCall }
    let _rafId = null;
    let _startTime = null;
    let _tierListeners = [];

    function prefersReducedMotion() {
        return typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function normalizeTier(raw) {
        return TIERS.includes(raw) ? raw : DEFAULT_TIER;
    }

    function getEffectsTier() {
        try {
            return normalizeTier(window.localStorage.getItem(TIER_STORAGE_KEY));
        } catch {
            return DEFAULT_TIER;
        }
    }

    function setEffectsTier(tier) {
        const normalized = normalizeTier(tier);
        try {
            window.localStorage.setItem(TIER_STORAGE_KEY, normalized);
        } catch { /* ignore (private browsing / quota) */ }
        for (const listener of _tierListeners) {
            try { listener(normalized); } catch { /* consumer error must not break the loop */ }
        }
        syncLoopState();
        return normalized;
    }

    function onTierChange(fn) {
        if (typeof fn === 'function') { _tierListeners.push(fn); }
    }

    /** Motion runs only when the OS/browser doesn't request reduced motion AND the tier isn't 'off'. */
    function isMotionEnabled() {
        return !prefersReducedMotion() && getEffectsTier() !== 'off';
    }

    function loopTick(now) {
        _rafId = null;
        if (!isMotionEnabled() || document.hidden || !_handlers.size) { return; }
        if (_startTime === null) { _startTime = now; }
        const phase = now - _startTime;
        for (const [, entry] of _handlers) {
            const minInterval = entry.fps > 0 ? 1000 / entry.fps : 0;
            if (minInterval > 0 && entry.lastCall !== null && (now - entry.lastCall) < minInterval) { continue; }
            entry.lastCall = now;
            try { entry.tick(phase); } catch (err) { console.error('[LR_anim] tick handler failed:', err); }
        }
        scheduleLoop();
    }

    function scheduleLoop() {
        if (_rafId !== null) { return; }
        if (!isMotionEnabled() || document.hidden || !_handlers.size) { return; }
        _rafId = window.requestAnimationFrame(loopTick);
    }

    function stopLoop() {
        if (_rafId !== null) {
            window.cancelAnimationFrame(_rafId);
            _rafId = null;
        }
    }

    /** Re-evaluate whether the loop should be running (call after tier/visibility changes). */
    function syncLoopState() {
        if (isMotionEnabled() && !document.hidden && _handlers.size) {
            scheduleLoop();
        } else {
            stopLoop();
        }
    }

    /**
     * Register a decorative animation tick. `tick(phaseMs)` is called on every eligible frame
     * (throttled to `fps` if provided). Never called while motion is disabled — consumers must
     * keep rendering their static (non-animated) appearance via their existing draw paths;
     * this driver only adds animated redraws on top.
     */
    function register(id, tick, options) {
        if (!id || typeof tick !== 'function') { return; }
        _handlers.set(id, { tick, fps: (options && options.fps) || 0, lastCall: null });
        syncLoopState();
    }

    function unregister(id) {
        _handlers.delete(id);
        if (!_handlers.size) { stopLoop(); }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { stopLoop(); } else { syncLoopState(); }
    });

    if (typeof window.matchMedia === 'function') {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const onChange = () => syncLoopState();
        if (typeof mq.addEventListener === 'function') { mq.addEventListener('change', onChange); }
        else if (typeof mq.addListener === 'function') { mq.addListener(onChange); }
    }

    window.LR_anim = {
        register,
        unregister,
        isMotionEnabled,
        getEffectsTier,
        setEffectsTier,
        onTierChange,
        TIERS,
    };
})();
