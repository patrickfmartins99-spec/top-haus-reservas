'use strict';

// Read only connection flags and helper availability; never read chat contents.
function inspectPage() {
  let socket;
  try { socket = window.require('WAWebSocketModel').Socket; } catch { /* Still loading. */ }
  const utils = window.WWebJS;
  return {
    connected: socket?.state === 'CONNECTED',
    synced: socket?.hasSynced === true,
    helpers: ['getChat', 'sendMessage', 'getMessageModel', 'sendSeen']
      .every((name) => typeof utils?.[name] === 'function'),
  };
}

function createReadinessGate({ client, loadUtils, now = Date.now, graceMs = 20000, warn = () => {} }) {
  let running = null;
  let connectedSince = null;
  let attempted = false;
  let lastReady = false;

  async function inspect() {
    if (!client.pupPage || client.pupPage.isClosed()) return false;
    try {
      let state = await client.pupPage.evaluate(inspectPage);
      if (!state.connected || !state.synced) {
        connectedSince = null;
        attempted = false;
        lastReady = false;
        return false;
      }
      if (state.helpers) {
        lastReady = true;
        return true;
      }
      if (lastReady) {
        connectedSince = null;
        attempted = false;
        lastReady = false;
      }
      connectedSince ??= now();
      if (!attempted && now() - connectedSince >= graceMs) {
        attempted = true;
        warn('Conexão sincronizada, mas envio não inicializado. Carregando os auxiliares da própria biblioteca.');
        // Uses the pinned installed library's own initializer, not a fake ready event.
        await client.pupPage.evaluate(loadUtils);
        state = await client.pupPage.evaluate(inspectPage);
        lastReady = state.connected && state.synced && state.helpers;
        return lastReady;
      }
    } catch (error) {
      warn(`WhatsApp ainda não está pronto para envio: ${error.message || error}`);
    }
    return false;
  }

  return function check() {
    if (!running) running = inspect().finally(() => { running = null; });
    return running;
  };
}

module.exports = { createReadinessGate, inspectPage };
