const assert = require('node:assert/strict');
const test = require('node:test');
const { gerarPdfComElectron } = require('../backend/pdf');

test('imprime o HTML no Electron e fecha a janela de impressão', async () => {
  const eventos = [];
  const conteudoPdf = Buffer.from('%PDF-teste');
  class Janela {
    constructor(opcoes) {
      assert.equal(opcoes.show, false);
      assert.equal(opcoes.webPreferences.nodeIntegration, false);
      assert.equal(opcoes.webPreferences.javascript, false);
      this.webContents = {
        printToPDF: async opcoesPdf => {
          eventos.push(opcoesPdf);
          return conteudoPdf;
        }
      };
    }
    async loadURL(url) { eventos.push(decodeURIComponent(url)); }
    isDestroyed() { return false; }
    destroy() { eventos.push('fechada'); }
  }
  assert.equal(await gerarPdfComElectron(Janela, '<h1>Orçamento</h1>'), conteudoPdf);
  assert.ok(eventos[0].includes('<h1>Orçamento</h1>'));
  assert.deepEqual(eventos[1], { pageSize: 'A4', printBackground: true });
  assert.equal(eventos[2], 'fechada');
});

test('fecha a janela mesmo quando a impressão falha', async () => {
  let fechada = false;
  class Janela {
    constructor() { this.webContents = { printToPDF: () => Promise.reject(new Error('falha')) }; }
    async loadURL() {}
    isDestroyed() { return fechada; }
    destroy() { fechada = true; }
  }
  await assert.rejects(gerarPdfComElectron(Janela, '<h1>Teste</h1>'), /falha/);
  assert.equal(fechada, true);
});
