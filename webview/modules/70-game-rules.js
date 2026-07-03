// webview/modules/70-game-rules.js

(function() {
    const rulesBtn = document.getElementById('game-rules-settings-btn');
    const rulesPanel = document.getElementById('game-rules-panel');
    const rulesClose = document.getElementById('game-rules-panel-close');
    const rulesBackdrop = document.getElementById('game-rules-backdrop');
    const rulesSavedToast = document.getElementById('game-rules-saved');

    const inputs = {
        enableRpgMechanics: document.getElementById('gr-enable-rpg'),
        defaultMaxHp: document.getElementById('gr-default-hp'),
        defaultMaxMp: document.getElementById('gr-default-mp'),
        diceDifficulty: document.getElementById('gr-dice-diff'),
        skillCommentary: document.getElementById('gr-skill-commentary'),
        backgroundSimulation: document.getElementById('gr-bg-sim'),
        autoLorebookGrowth: document.getElementById('gr-auto-lore'),
        enableNpcRegistry: document.getElementById('gr-npc-registry'),
        enableWorldForge: document.getElementById('gr-world-forge'),
        enableEmergentSimulation: document.getElementById('gr-emergent-sim'),
        enableFactionReputation: document.getElementById('gr-faction-reputation'),
        enableCommerce: document.getElementById('gr-commerce'),
        enableCommerceUi: document.getElementById('gr-commerce-ui'),
        playerRole: document.getElementById('gr-player-role'),
        enableNpcAgency: document.getElementById('gr-npc-agency'),
        enableDomainMode: document.getElementById('gr-domain-mode'),
        enableDomainAudience: document.getElementById('gr-domain-audience'),
        enableDomainRivals: document.getElementById('gr-domain-rivals'),
        enableDomainMissions: document.getElementById('gr-domain-missions'),
        enableMassBattle: document.getElementById('gr-mass-battle'),
        enableGuildMode: document.getElementById('gr-guild-mode'),
        enableGuildRequests: document.getElementById('gr-guild-requests'),
        enableGuildParties: document.getElementById('gr-guild-parties'),
        enableNpcRelationships: document.getElementById('gr-npc-relationships'),
        enableTravelEncounters: document.getElementById('gr-travel-encounters'),
        travelEncounterDensity: document.getElementById('gr-travel-density'),
        simIntervalTurns: document.getElementById('gr-sim-interval')
    };

    let saveTimeout = null;

    function openPanel() {
        rulesPanel.classList.remove('hidden');
        rulesPanel.setAttribute('aria-hidden', 'false');
        rulesBackdrop.classList.remove('hidden');
    }

    function closePanel() {
        rulesPanel.classList.add('hidden');
        rulesPanel.setAttribute('aria-hidden', 'true');
        rulesBackdrop.classList.add('hidden');
    }

    if (rulesBtn) rulesBtn.addEventListener('click', openPanel);
    if (rulesClose) rulesClose.addEventListener('click', closePanel);
    if (rulesBackdrop) rulesBackdrop.addEventListener('click', closePanel);

    function notifySave() {
        if (saveTimeout) clearTimeout(saveTimeout);
        rulesSavedToast.classList.remove('hidden');
        saveTimeout = setTimeout(() => {
            rulesSavedToast.classList.add('hidden');
        }, 2000);
    }

    function triggerSave() {
        const rules = {
            enableRpgMechanics: inputs.enableRpgMechanics.checked,
            defaultMaxHp: parseInt(inputs.defaultMaxHp.value, 10) || 100,
            defaultMaxMp: parseInt(inputs.defaultMaxMp.value, 10) || 50,
            diceDifficulty: inputs.diceDifficulty.value || 'Normal',
            skillCommentary: inputs.skillCommentary.checked,
            backgroundSimulation: inputs.backgroundSimulation.checked,
            autoLorebookGrowth: inputs.autoLorebookGrowth.checked,
            enableNpcRegistry: inputs.enableNpcRegistry ? inputs.enableNpcRegistry.checked : false,
            enableWorldForge: inputs.enableWorldForge ? inputs.enableWorldForge.checked : false,
            enableEmergentSimulation: inputs.enableEmergentSimulation ? inputs.enableEmergentSimulation.checked : false,
            enableFactionReputation: inputs.enableFactionReputation ? inputs.enableFactionReputation.checked : false,
            enableCommerce: inputs.enableCommerce ? inputs.enableCommerce.checked : false,
            enableCommerceUi: inputs.enableCommerceUi ? inputs.enableCommerceUi.checked : false,
            playerRole: inputs.playerRole ? inputs.playerRole.value : 'merchant',
            enableNpcAgency: inputs.enableNpcAgency ? inputs.enableNpcAgency.checked : false,
            enableDomainMode: inputs.enableDomainMode ? inputs.enableDomainMode.checked : false,
            enableDomainAudience: inputs.enableDomainAudience ? inputs.enableDomainAudience.checked : false,
            enableDomainRivals: inputs.enableDomainRivals ? inputs.enableDomainRivals.checked : false,
            enableDomainMissions: inputs.enableDomainMissions ? inputs.enableDomainMissions.checked : false,
            enableMassBattle: inputs.enableMassBattle ? inputs.enableMassBattle.checked : false,
            enableGuildMode: inputs.enableGuildMode ? inputs.enableGuildMode.checked : false,
            enableGuildRequests: inputs.enableGuildRequests ? inputs.enableGuildRequests.checked : false,
            enableGuildParties: inputs.enableGuildParties ? inputs.enableGuildParties.checked : false,
            enableNpcRelationships: inputs.enableNpcRelationships ? inputs.enableNpcRelationships.checked : false,
            enableTravelEncounters: inputs.enableTravelEncounters ? inputs.enableTravelEncounters.checked : false,
            travelEncounterDensity: inputs.travelEncounterDensity ? inputs.travelEncounterDensity.value : 'medium',
            simIntervalTurns: inputs.simIntervalTurns ? (parseInt(inputs.simIntervalTurns.value, 10) || 5) : 5
        };
        vscode.postMessage({ type: 'updateGameRules', rules });
        notifySave();
    }

    // Bind change events
    Object.values(inputs).forEach(input => {
        if (!input) return;
        if (input.type === 'checkbox') {
            input.addEventListener('change', triggerSave);
        } else {
            input.addEventListener('change', triggerSave);
            // Auto save on blur for number/text inputs
            input.addEventListener('blur', triggerSave);
        }
    });

    window.addEventListener('message', event => {
        const message = event.data;
        if (message.type === 'gameRules' && message.rules) {
            const rules = message.rules;
            if (rules.enableRpgMechanics !== undefined) inputs.enableRpgMechanics.checked = rules.enableRpgMechanics;
            if (rules.defaultMaxHp !== undefined) inputs.defaultMaxHp.value = rules.defaultMaxHp;
            if (rules.defaultMaxMp !== undefined) inputs.defaultMaxMp.value = rules.defaultMaxMp;
            if (rules.diceDifficulty !== undefined) inputs.diceDifficulty.value = rules.diceDifficulty;
            if (rules.skillCommentary !== undefined) inputs.skillCommentary.checked = rules.skillCommentary;
            if (rules.backgroundSimulation !== undefined) inputs.backgroundSimulation.checked = rules.backgroundSimulation;
            if (rules.autoLorebookGrowth !== undefined) inputs.autoLorebookGrowth.checked = rules.autoLorebookGrowth;
            if (rules.enableNpcRegistry !== undefined && inputs.enableNpcRegistry) inputs.enableNpcRegistry.checked = rules.enableNpcRegistry;
            if (rules.enableWorldForge !== undefined && inputs.enableWorldForge) inputs.enableWorldForge.checked = rules.enableWorldForge;
            if (rules.enableEmergentSimulation !== undefined && inputs.enableEmergentSimulation) inputs.enableEmergentSimulation.checked = rules.enableEmergentSimulation;
            if (rules.enableFactionReputation !== undefined && inputs.enableFactionReputation) inputs.enableFactionReputation.checked = rules.enableFactionReputation;
            if (rules.enableCommerce !== undefined && inputs.enableCommerce) inputs.enableCommerce.checked = rules.enableCommerce;
            if (rules.enableCommerceUi !== undefined && inputs.enableCommerceUi) inputs.enableCommerceUi.checked = rules.enableCommerceUi;
            if (rules.playerRole !== undefined && inputs.playerRole) inputs.playerRole.value = rules.playerRole;
            if (rules.enableNpcAgency !== undefined && inputs.enableNpcAgency) inputs.enableNpcAgency.checked = rules.enableNpcAgency;
            if (rules.enableDomainMode !== undefined && inputs.enableDomainMode) inputs.enableDomainMode.checked = rules.enableDomainMode;
            if (rules.enableDomainAudience !== undefined && inputs.enableDomainAudience) inputs.enableDomainAudience.checked = rules.enableDomainAudience;
            if (rules.enableDomainRivals !== undefined && inputs.enableDomainRivals) inputs.enableDomainRivals.checked = rules.enableDomainRivals;
            if (rules.enableDomainMissions !== undefined && inputs.enableDomainMissions) inputs.enableDomainMissions.checked = rules.enableDomainMissions;
            if (rules.enableMassBattle !== undefined && inputs.enableMassBattle) inputs.enableMassBattle.checked = rules.enableMassBattle;
            if (rules.enableGuildMode !== undefined && inputs.enableGuildMode) inputs.enableGuildMode.checked = rules.enableGuildMode;
            if (rules.enableGuildRequests !== undefined && inputs.enableGuildRequests) inputs.enableGuildRequests.checked = rules.enableGuildRequests;
            if (rules.enableGuildParties !== undefined && inputs.enableGuildParties) inputs.enableGuildParties.checked = rules.enableGuildParties;
            if (rules.enableNpcRelationships !== undefined && inputs.enableNpcRelationships) inputs.enableNpcRelationships.checked = rules.enableNpcRelationships;
            if (rules.enableTravelEncounters !== undefined && inputs.enableTravelEncounters) inputs.enableTravelEncounters.checked = rules.enableTravelEncounters;
            if (rules.travelEncounterDensity !== undefined && inputs.travelEncounterDensity) inputs.travelEncounterDensity.value = rules.travelEncounterDensity;
            if (rules.simIntervalTurns !== undefined && inputs.simIntervalTurns) inputs.simIntervalTurns.value = rules.simIntervalTurns;
        }
    });

    // Request initial rules
    vscode.postMessage({ type: 'getGameRules' });

})();
