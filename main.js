const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

const localUrl = 'http://127.0.0.1:3000';
let serverStarted = false;

function startServer() {
  if (serverStarted) return;
  serverStarted = true;
  require(path.join(__dirname, 'backend', 'server.js'));
}

function servidorResponde() {
  return new Promise((resolve, reject) => {
    const req = http.get(`${localUrl}/api/saude`, res => {
      let conteudo = '';
      res.on('data', parte => { conteudo += parte.toString().slice(0, 200); });
      res.on('end', () => {
        try {
          const dados = JSON.parse(conteudo);
          if (res.statusCode === 200 && dados.aplicativo === 'sistema-vendas') resolve();
          else reject(new Error('A porta 3000 está sendo usada por outro programa.'));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(1000, () => req.destroy(new Error('Tempo de resposta excedido')));
  });
}

async function aguardarServidor() {
  const limite = Date.now() + 15000;
  while (Date.now() < limite) {
    try {
      await servidorResponde();
      return;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  throw new Error('O servidor local não iniciou em 15 segundos.');
}

function createWindow() {
  const webPreferences = {
    contextIsolation: true,
    nodeIntegration: false,
    partition: 'nopersist'
  };
  const preload = path.join(__dirname, 'preload.js');
  if (fs.existsSync(preload)) webPreferences.preload = preload;

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const destino = new URL(url);
      if (destino.protocol === 'http:' || destino.protocol === 'https:') {
        shell.openExternal(url).catch(console.error);
      }
    } catch (error) {
      console.error('Não foi possível abrir a janela:', error);
    }
    return { action: 'deny' };
  });

  win.loadURL(localUrl);
  prepararAtualizacoes();
}

function prepararAtualizacoes() {
  if (!app.isPackaged || !fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))) {
    return;
  }
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', erro => console.error('Erro ao verificar atualização:', erro));

  const verificar = () => {
    autoUpdater.checkForUpdatesAndNotify()
      .catch(erro => console.error('Atualização indisponível:', erro));
  };
  const primeiraVerificacao = setTimeout(verificar, 5000);
  const repeticao = setInterval(verificar, 6 * 60 * 60 * 1000);
  app.on('before-quit', () => {
    clearTimeout(primeiraVerificacao);
    clearInterval(repeticao);
  });
}

app.whenReady().then(async () => {
  try {
    startServer();
    await aguardarServidor();
    createWindow();
  } catch (error) {
    console.error(error);
    dialog.showErrorBox('Sistema de Vendas', error.message);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
