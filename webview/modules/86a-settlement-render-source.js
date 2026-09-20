/* global document, T */

// ---------------------------------------------------------------------------
// SETTLEMENT-VIEW-SOURCE-001
// Shared fixed-city vs Mobile Base interior selection for Settlement + Diorama.
// Ephemeral Webview UI state only — not persisted to disk/game state.
// ---------------------------------------------------------------------------

const SETTLEMENT_RENDER_SOURCE_FIXED = 'fixed';
const SETTLEMENT_RENDER_SOURCE_MOBILE_BASE = 'mobile_base';

/** User override: 'fixed' | 'mobile_base' | null (null = use default rules). */
let _settlementRenderSourceChoice = null;
let _lastRenderSourceCurrentLocationId = null;
let _lastRenderSourceMode = null; // 'preview' | 'current' | null
let _settlementSourceControlsWired = false;

function isSettlementPreviewMode(msg) {
    return Boolean(msg && msg.settlementDisplayContext && msg.settlementDisplayContext.mode === 'preview');
}

function isLegacySettlementPayload(msg) {
    // Messages without multi-location context use pre-SLICE2 Mobile Base-first rules.
    return !msg || !msg.settlementDisplayContext;
}

function isFixedSettlementAvailable(msg) {
    if (!msg || !msg.settlementView) { return false; }
    const ctx = msg.settlementDisplayContext;
    if (ctx) {
        return ctx.availability === 'available';
    }
    // Legacy: any top-level settlementView counts as fixed/root available.
    return true;
}

function isMobileBaseInteriorAvailable(msg, forDiorama) {
    if (!msg || msg.enableMobileBaseSystem !== true) { return false; }
    const interior = msg.mobileBaseInterior;
    if (!interior || interior.interiorBlocked) { return false; }
    if (forDiorama) {
        return Boolean(interior.settlementDiorama);
    }
    return Boolean(interior.settlementView);
}

/**
 * Resolve which logical source Settlement and Diorama must both use.
 * @returns {{ source: 'fixed'|'mobile_base'|null, reason: string }}
 */
function resolveSettlementRenderSource(msg, options) {
    const forDiorama = Boolean(options && options.forDiorama);
    const choice = options && Object.prototype.hasOwnProperty.call(options, 'explicitChoice')
        ? options.explicitChoice
        : _settlementRenderSourceChoice;

    if (!msg) {
        return { source: null, reason: 'no_msg' };
    }

    const fixedOk = isFixedSettlementAvailable(msg);
    const mbOk = isMobileBaseInteriorAvailable(msg, forDiorama);

    // 1) Remote preview: always fixed; never MB fallback.
    if (isSettlementPreviewMode(msg)) {
        if (fixedOk) {
            return { source: SETTLEMENT_RENDER_SOURCE_FIXED, reason: 'preview_fixed' };
        }
        return { source: null, reason: 'preview_missing_or_invalid' };
    }

    // 6) Legacy (no settlementDisplayContext): preserve Mobile Base-first.
    if (isLegacySettlementPayload(msg)) {
        if (mbOk) {
            return { source: SETTLEMENT_RENDER_SOURCE_MOBILE_BASE, reason: 'legacy_mb_first' };
        }
        if (fixedOk) {
            return { source: SETTLEMENT_RENDER_SOURCE_FIXED, reason: 'legacy_fixed' };
        }
        return { source: null, reason: 'legacy_none' };
    }

    // 2–4) Current location with multi-location context.
    if (fixedOk && mbOk) {
        if (choice === SETTLEMENT_RENDER_SOURCE_MOBILE_BASE) {
            return { source: SETTLEMENT_RENDER_SOURCE_MOBILE_BASE, reason: 'user_mobile_base' };
        }
        return { source: SETTLEMENT_RENDER_SOURCE_FIXED, reason: 'default_fixed' };
    }
    if (fixedOk) {
        return { source: SETTLEMENT_RENDER_SOURCE_FIXED, reason: 'fixed_only' };
    }
    if (mbOk) {
        return { source: SETTLEMENT_RENDER_SOURCE_MOBILE_BASE, reason: 'mobile_base_only' };
    }
    return { source: null, reason: 'none' };
}

function setSettlementRenderSourceChoice(source) {
    if (source === SETTLEMENT_RENDER_SOURCE_FIXED || source === SETTLEMENT_RENDER_SOURCE_MOBILE_BASE) {
        _settlementRenderSourceChoice = source;
        return;
    }
    if (source === null || source === undefined) {
        _settlementRenderSourceChoice = null;
    }
}

function getSettlementRenderSourceChoice() {
    return _settlementRenderSourceChoice;
}

/**
 * Normalize ephemeral choice when worldView updates (location / preview transitions).
 */
function onSettlementRenderSourceWorldMsg(msg) {
    const ctx = msg && msg.settlementDisplayContext;
    const currentLoc = (ctx && ctx.currentLocationId)
        || (msg && msg.currentLocationId)
        || null;
    const mode = isSettlementPreviewMode(msg) ? 'preview' : 'current';

    // Leaving remote preview → default fixed (clear explicit MB choice).
    if (_lastRenderSourceMode === 'preview' && mode === 'current') {
        _settlementRenderSourceChoice = null;
    }

    // Current location change → default fixed for the new city.
    if (
        mode === 'current'
        && _lastRenderSourceCurrentLocationId
        && currentLoc
        && _lastRenderSourceCurrentLocationId !== currentLoc
    ) {
        _settlementRenderSourceChoice = null;
    }

    // Drop explicit MB choice when MB is no longer available.
    if (_settlementRenderSourceChoice === SETTLEMENT_RENDER_SOURCE_MOBILE_BASE) {
        const mb2d = isMobileBaseInteriorAvailable(msg, false);
        const mb3d = isMobileBaseInteriorAvailable(msg, true);
        if (!mb2d && !mb3d) {
            _settlementRenderSourceChoice = null;
        }
    }

    _lastRenderSourceMode = mode;
    _lastRenderSourceCurrentLocationId = currentLoc;
}

function getSelectedSettlementView(msg) {
    const resolved = resolveSettlementRenderSource(msg, { forDiorama: false });
    if (resolved.source === SETTLEMENT_RENDER_SOURCE_MOBILE_BASE) {
        const interior = msg && msg.mobileBaseInterior;
        return interior && interior.settlementView ? interior.settlementView : null;
    }
    if (resolved.source === SETTLEMENT_RENDER_SOURCE_FIXED) {
        return msg && msg.settlementView ? msg.settlementView : null;
    }
    return null;
}

function getSelectedSettlementDiorama(msg) {
    const resolved = resolveSettlementRenderSource(msg, { forDiorama: true });
    if (resolved.source === SETTLEMENT_RENDER_SOURCE_MOBILE_BASE) {
        const interior = msg && msg.mobileBaseInterior;
        return interior && interior.settlementDiorama ? interior.settlementDiorama : null;
    }
    if (resolved.source === SETTLEMENT_RENDER_SOURCE_FIXED) {
        return msg && msg.settlementDiorama ? msg.settlementDiorama : null;
    }
    return null;
}

function getSelectedSettlementExpansionPreviews(msg) {
    const resolved = resolveSettlementRenderSource(msg, { forDiorama: false });
    if (resolved.source === SETTLEMENT_RENDER_SOURCE_MOBILE_BASE) {
        const interior = msg && msg.mobileBaseInterior;
        return interior && Array.isArray(interior.settlementExpansionPreviews)
            ? interior.settlementExpansionPreviews
            : [];
    }
    if (resolved.source === SETTLEMENT_RENDER_SOURCE_FIXED) {
        return msg && Array.isArray(msg.settlementExpansionPreviews)
            ? msg.settlementExpansionPreviews
            : [];
    }
    return [];
}

function shouldShowSettlementSourceSelector(msg) {
    if (!msg || isSettlementPreviewMode(msg) || isLegacySettlementPayload(msg)) {
        return false;
    }
    return isFixedSettlementAvailable(msg) && isMobileBaseInteriorAvailable(msg, false);
}

function tSettlementSource(key) {
    if (typeof T === 'function') {
        const tr = T(key);
        if (tr && tr !== key) { return tr; }
    }
    if (key === 'webview.world.settlementSourceFixed') { return 'Settlement'; }
    if (key === 'webview.world.settlementSourceMobileBase') { return 'Mobile Base interior'; }
    if (key === 'webview.world.settlementSourceAria') { return 'Settlement view source'; }
    return key;
}

function wireSettlementSourceControlsOnce() {
    if (_settlementSourceControlsWired) { return; }
    _settlementSourceControlsWired = true;
    document.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest
            ? e.target.closest('[data-settlement-source]')
            : null;
        if (!btn) { return; }
        const source = btn.getAttribute('data-settlement-source');
        if (source !== SETTLEMENT_RENDER_SOURCE_FIXED && source !== SETTLEMENT_RENDER_SOURCE_MOBILE_BASE) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        setSettlementRenderSourceChoice(source);
        const msg = (typeof _settlementWorldMsg !== 'undefined' && _settlementWorldMsg)
            || (typeof _dioramaWorldMsg !== 'undefined' && _dioramaWorldMsg)
            || null;
        renderSettlementSourceSelector(msg);
        if (typeof drawSettlementIsometric === 'function') {
            try { drawSettlementIsometric(); } catch (_err) { /* ignore */ }
        }
        if (typeof renderSettlementDiorama === 'function') {
            try { renderSettlementDiorama(); } catch (_err) { /* ignore */ }
        }
    });
}

function syncSourceBar(prefix, msg) {
    const bar = document.getElementById(`world-${prefix}-source-bar`);
    if (!bar) { return; }
    const show = shouldShowSettlementSourceSelector(msg);
    bar.classList.toggle('hidden', !show);
    if (!show) { return; }

    const resolved = resolveSettlementRenderSource(msg, { forDiorama: false });
    const active = resolved.source || SETTLEMENT_RENDER_SOURCE_FIXED;
    const fixedBtn = document.getElementById(`world-${prefix}-source-fixed`);
    const mbBtn = document.getElementById(`world-${prefix}-source-mb`);
    if (fixedBtn) {
        fixedBtn.textContent = tSettlementSource('webview.world.settlementSourceFixed');
        fixedBtn.classList.toggle('is-active', active === SETTLEMENT_RENDER_SOURCE_FIXED);
        fixedBtn.setAttribute('aria-pressed', active === SETTLEMENT_RENDER_SOURCE_FIXED ? 'true' : 'false');
    }
    if (mbBtn) {
        mbBtn.textContent = tSettlementSource('webview.world.settlementSourceMobileBase');
        mbBtn.classList.toggle('is-active', active === SETTLEMENT_RENDER_SOURCE_MOBILE_BASE);
        mbBtn.setAttribute('aria-pressed', active === SETTLEMENT_RENDER_SOURCE_MOBILE_BASE ? 'true' : 'false');
    }
    bar.setAttribute('aria-label', tSettlementSource('webview.world.settlementSourceAria'));
}

function renderSettlementSourceSelector(msg) {
    wireSettlementSourceControlsOnce();
    syncSourceBar('settlement', msg);
    syncSourceBar('diorama', msg);
}

function isMobileBaseRenderSourceSelected(msg) {
    const resolved = resolveSettlementRenderSource(msg, { forDiorama: false });
    return resolved.source === SETTLEMENT_RENDER_SOURCE_MOBILE_BASE;
}
