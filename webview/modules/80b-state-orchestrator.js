/* global window, document, vscode */
(function () {
    const section = document.getElementById('inspector-state-orchestrator-section');
    const previewBtn = document.getElementById('inspector-so-preview-btn');
    const retryBtn = document.getElementById('inspector-so-retry-btn');
    const mermaidEl = document.getElementById('inspector-so-mermaid');
    const errorEl = document.getElementById('inspector-so-error');

    if (!section || !previewBtn || !retryBtn || !mermaidEl) {
        return;
    }

    // Bind actions
    previewBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'previewGmTurnTransactionPlan' });
    });

    retryBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'retryFailedTransactions' });
    });

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message && message.type === 'stateOrchestratorUpdate') {
            section.classList.remove('hidden');

            // Show error message if exists
            if (message.errorMessage) {
                if (errorEl) {
                    errorEl.textContent = `Error: ${message.errorMessage}`;
                    errorEl.classList.remove('hidden');
                }
            } else {
                if (errorEl) {
                    errorEl.classList.add('hidden');
                }
            }

            // Render mermaid chart
            if (message.mermaid && window.mermaid) {
                mermaidEl.textContent = message.mermaid;
                // Add data-processed="false" so mermaid.run knows to parse it
                mermaidEl.removeAttribute('data-processed');
                window.mermaid.run({ nodes: [mermaidEl] })
                    .catch((e) => console.error('State Orchestrator Mermaid render error:', e));
            }

            // Disable/enable retry button based on status
            if (message.status === 'committed') {
                retryBtn.disabled = true;
            } else if (message.status === 'rolled_back' || message.status === 'partial_commit_warn') {
                retryBtn.disabled = false;
            } else {
                retryBtn.disabled = true; // planned/aborted etc.
            }
        }

        // Hide if debug capabilities are disabled
        if (message && message.type === 'debugCapabilities') {
            const show = !!(message.showDebugConsole || message.bulkWorldSim);
            if (!show) {
                section.classList.add('hidden');
            }
        }
    });
})();
