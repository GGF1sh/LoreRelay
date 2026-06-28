// ===== Zero-Config Quickstart =====

(function initQuickstart() {
  const modal = document.getElementById('quickstart-modal');
  const overlay = document.getElementById('quickstart-overlay');
  const closeBtn = document.getElementById('quickstart-close');
  const startBtn = document.getElementById('quickstart-start-btn');
  const promptInput = document.getElementById('quickstart-prompt');
  const overwriteCb = document.getElementById('quickstart-overwrite-cb');
  const loadingDiv = document.getElementById('quickstart-loading');

  if (!modal) return;

  function openQuickstart() {
    modal.classList.remove('hidden');
    promptInput.focus();
  }

  function closeQuickstart() {
    modal.classList.add('hidden');
  }

  // Global exposure
  window.LoreRelay = window.LoreRelay || {};
  window.LoreRelay.openQuickstart = openQuickstart;

  closeBtn.addEventListener('click', closeQuickstart);
  overlay.addEventListener('click', closeQuickstart);

  startBtn.addEventListener('click', () => {
    const promptText = promptInput.value.trim();
    if (!promptText) {
      alert('Please describe your adventure first!');
      return;
    }

    loadingDiv.classList.remove('hidden');
    startBtn.disabled = true;

    // Send to extension
    vscode.postMessage({
      type: 'runQuickstart',
      prompt: promptText,
      overwrite: !!overwriteCb.checked
    });
  });

  // Listen for completion to hide loading
  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'stateUpdate' || message.type === 'scenarioDirector') {
      if (!modal.classList.contains('hidden')) {
        loadingDiv.classList.add('hidden');
        startBtn.disabled = false;
        closeQuickstart();
      }
    }
  });

})();
