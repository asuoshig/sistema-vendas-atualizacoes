// No aplicativo Electron, a geração de PDFs usa o navegador já incluído no instalador.
async function gerarPdfComElectron(BrowserWindow, html) {
  const janela = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      javascript: false
    }
  });

  try {
    await janela.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
    return await janela.webContents.printToPDF({ pageSize: 'A4', printBackground: true });
  } finally {
    if (!janela.isDestroyed()) janela.destroy();
  }
}

async function gerarPdf(html) {
  if (process.versions.electron) {
    const { BrowserWindow } = require('electron');
    return gerarPdfComElectron(BrowserWindow, html);
  }

  // Para quem inicia somente o servidor com `npm start` durante o desenvolvimento.
  const puppeteer = require('puppeteer');
  const fs = require('fs');
  const path = require('path');
  let chromeGerenciado;
  try { chromeGerenciado = puppeteer.executablePath(); } catch { /* Chrome pode não estar instalado. */ }
  const chrome = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    chromeGerenciado
  ].find(candidato => candidato && fs.existsSync(candidato));
  if (!chrome) throw new Error('Chrome não encontrado para gerar PDF fora do Electron.');

  const navegador = await puppeteer.launch({ executablePath: chrome, headless: true });
  try {
    const pagina = await navegador.newPage();
    await pagina.setContent(html, { waitUntil: 'networkidle0' });
    return Buffer.from(await pagina.pdf({ format: 'A4', printBackground: true }));
  } finally {
    await navegador.close();
  }
}

module.exports = { gerarPdf, gerarPdfComElectron };
