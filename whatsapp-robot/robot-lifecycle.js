'use strict';
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');

async function acquireInstanceLock(identity) {
  const name = createHash('sha256').update(identity.toLowerCase()).digest('hex').slice(0, 24);
  const address = process.platform === 'win32'
    ? `\\\\.\\pipe\\tophaus-${name}`
    : path.join(os.tmpdir(), `tophaus-${name}.sock`);
  const server = net.createServer((socket) => socket.end());
  await new Promise((resolve, reject) => {
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') error.message = 'Já existe uma execução deste robô. Encerre-a com Ctrl+C antes de iniciar outra.';
      reject(error);
    });
    server.listen(address, resolve);
  });
  return () => new Promise((resolve) => server.close(() => {
    if (process.platform !== 'win32') {
      try { fs.unlinkSync(address); } catch { /* Socket already removed by Node. */ }
    }
    resolve();
  }));
}

async function closeOwnedBrowser(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => resolve()));
  } else child.kill('SIGKILL');
}

function createShutdown({ client, stopWork, release = async () => {}, exit = (code) => process.exit(code), forceClose = closeOwnedBrowser, timeoutMs = 4000, log = console.log }) {
  let stopping = false;
  return async (reason, code = 0) => {
    if (stopping) return;
    stopping = true;
    log(`🛑 Encerrando o robô (${reason})...`);
    stopWork();
    const child = client.pupBrowser?.process();
    let timer;
    try {
      await Promise.race([
        client.destroy(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Tempo de encerramento excedido')), timeoutMs); }),
      ]);
    } catch {
      await forceClose(child);
    } finally {
      clearTimeout(timer);
      await release();
      exit(code);
    }
  };
}

module.exports = { acquireInstanceLock, createShutdown };
