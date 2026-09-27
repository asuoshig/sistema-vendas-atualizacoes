const express = require('express');

const sqlite3 = require('sqlite3').verbose();

const path = require('path');

const fs = require('fs');

const { gerarPdf } = require('./pdf');

async function enviarPdf(res, html, nomeArquivo, disposicao = 'inline') {
  const pdf = await gerarPdf(html);
  res.type('application/pdf');
  res.setHeader('Content-Disposition', `${disposicao}; filename="${nomeArquivo}"`);
  res.send(pdf);
}

function erroPdf(res, error) {
  console.error('Erro ao gerar PDF:', error);
  if (!res.headersSent) res.status(500).send('Erro ao gerar PDF.');
}





const app = express();

const PORT = 3000;



app.use(express.json());

app.use(express.static(path.join(__dirname, '../frontend')));



// ======================================================

// DETECTAR SE ESTAMOS NO ELECTRON OU NO NODE PURO

// ======================================================

let userDataPath;



try {

    const { app: electronApp } = require('electron');



    if (electronApp && electronApp.getPath && electronApp.isPackaged) {

        // 👉 MODO APP (EXE)

        userDataPath = electronApp.getPath('userData');

        console.log("🔵 Electron detectado → usando userDataPath");

    } else {

        throw new Error("Electron não disponível");

    }



} catch (e) {

    // Modo de desenvolvimento: nunca migrar o banco da instalação em uso.

    console.log("🟡 Rodando servidor fora do Electron (modo DEV)");

    userDataPath = path.join(__dirname, '..', 'data-dev');

}



// Criar pasta caso não exista

if (!fs.existsSync(userDataPath)) {

    fs.mkdirSync(userDataPath, { recursive: true });

}



const caminhoBanco = path.join(userDataPath, 'database.db');



console.log("📌 Usando banco em:", caminhoBanco);



// Abrir conexão

const db = new sqlite3.Database(caminhoBanco, (err) => {

    if (err) {

        console.error("❌ Erro ao abrir o banco:", err);

    } else {

        console.log("✅ Banco iniciado com sucesso!");

    }

});

function executarSql(sql, parametros = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, parametros, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, alteracoes: this.changes });
    });
  });
}

let filaDeCadastros = Promise.resolve();
function cadastrarEmTransacao(tarefa) {
  const resultado = filaDeCadastros.then(async () => {
    await executarSql('BEGIN IMMEDIATE');
    try {
      const id = await tarefa();
      await executarSql('COMMIT');
      return id;
    } catch (error) {
      await executarSql('ROLLBACK').catch(erro => console.error('Erro ao desfazer cadastro:', erro));
      throw error;
    }
  });
  filaDeCadastros = resultado.catch(() => {});
  return resultado;
}

function dataLocal() {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date()).map(item => [item.type, item.value])
  );
  return `${partes.year}-${partes.month}-${partes.day} ${partes.hour}:${partes.minute}:${partes.second}`;
}






db.serialize(() => {



  db.run(`CREATE TABLE IF NOT EXISTS produtos (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    nome TEXT,

    categoria TEXT,

    preco_unitario REAL

  )`);



  db.run(`CREATE TABLE IF NOT EXISTS produtos_go (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    nome TEXT,

    categoria TEXT,

    preco_unitario REAL

  )`);



  db.run(`CREATE TABLE IF NOT EXISTS produtos_to (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    nome TEXT,

    categoria TEXT,

    preco_unitario REAL

  )`);



  db.run(`CREATE TABLE IF NOT EXISTS pedidos (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    data TEXT,

    total REAL,

    nome_cliente TEXT,

    cnpj TEXT,

    razao_social TEXT,

    cidade TEXT,

    endereco TEXT,

    telefone TEXT,

    observacoes TEXT,

    pagamento TEXT,

    cancelado_em TEXT

  )`);



  db.run(`CREATE TABLE IF NOT EXISTS itens_pedido (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    pedido_id INTEGER,

    produto TEXT,

    quantidade ,

    preco_unitario REAL,

    subtotal REAL,

    FOREIGN KEY(pedido_id) REFERENCES pedidos(id)

  )`);



  db.run(`CREATE TABLE IF NOT EXISTS clientes (

  id INTEGER PRIMARY KEY AUTOINCREMENT,

  cnpj TEXT,

  razao_social TEXT,

  cidade TEXT,

  nome TEXT

)`);



 db.run(`CREATE TABLE IF NOT EXISTS orcamentos (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    data TEXT,

    total REAL,

    nome_cliente TEXT,

    cnpj TEXT,

    razao_social TEXT,

    cidade TEXT,

    endereco TEXT,

    telefone TEXT,

    observacoes TEXT,

    pagamento TEXT

  )`);





db.run(`CREATE TABLE IF NOT EXISTS itens_orcamento (

  id INTEGER PRIMARY KEY AUTOINCREMENT,

  orcamento_id INTEGER,

  produto TEXT,

  quantidade REAL,

  preco_unitario REAL,

  subtotal REAL,

  FOREIGN KEY(orcamento_id) REFERENCES orcamentos(id)

)`);



  // Mantém os pedidos existentes; somente acrescenta o controle de cancelamento.
  db.all('PRAGMA table_info(pedidos)', (err, colunas) => {
    if (err) return console.error('Erro ao verificar banco:', err);
    if (colunas.some(coluna => coluna.name === 'cancelado_em')) {
      return iniciarServidor();
    }
    try {
      const pastaBackups = path.join(userDataPath, 'backups');
      fs.mkdirSync(pastaBackups, { recursive: true });
      const nome = `database-antes-migracao-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
      db.backup(path.join(pastaBackups, nome), erroBackup => {
        if (erroBackup) return console.error('Erro ao criar backup; migração cancelada:', erroBackup);
        db.run('ALTER TABLE pedidos ADD COLUMN cancelado_em TEXT', erro => {
          if (erro) return console.error('Erro ao atualizar banco:', erro);
          iniciarServidor();
        });
      });
    } catch (erroBackup) {
      console.error('Erro ao criar backup; migração cancelada:', erroBackup);
    }
  });

});



// === ROTAS ===

app.get('/api/saude', (req, res) => {
  res.json({ aplicativo: 'sistema-vendas', status: 'ok' });
});

async function salvarCadastroCompleto(req, res, tipo) {
  const corpo = req.body || {};
  const itens = corpo.itens;
  if (!String(corpo.nome_cliente || '').trim() || !Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: 'Informe o cliente e ao menos um produto.' });
  }

  const itensValidos = itens.map(item => {
    if (!item || typeof item !== 'object') return null;
    const quantidade = Number(item.quantidade);
    const preco = Number(item.preco_unitario);
    if (!String(item.produto || '').trim() || !Number.isFinite(quantidade) ||
        quantidade <= 0 || !Number.isFinite(preco) || preco < 0) return null;
    const subtotal = Math.round(quantidade * preco * 100) / 100;
    if (!Number.isFinite(subtotal)) return null;
    return {
      produto: String(item.produto).trim(),
      quantidade, preco,
      subtotal
    };
  });
  if (itensValidos.some(item => !item)) {
    return res.status(400).json({ error: 'Revise os produtos, quantidades e preços.' });
  }

  const subtotal = itensValidos.reduce((valor, item) => valor + item.subtotal, 0);
  const total = Math.round(subtotal * (corpo.pagamento === 'avista' ? 0.95 : 1) * 100) / 100;
  if (!Number.isFinite(total)) {
    return res.status(400).json({ error: 'Valor total inválido.' });
  }
  const orcamento = tipo === 'orcamento';
  const tabela = orcamento ? 'orcamentos' : 'pedidos';
  const tabelaItens = orcamento ? 'itens_orcamento' : 'itens_pedido';
  const colunaId = orcamento ? 'orcamento_id' : 'pedido_id';

  try {
    const id = await cadastrarEmTransacao(async () => {
      const registro = await executarSql(
        `INSERT INTO ${tabela}
        (data, total, nome_cliente, cnpj, razao_social, cidade, endereco, telefone, observacoes, pagamento)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [dataLocal(), total, String(corpo.nome_cliente).trim(),
          corpo.cnpj || null, corpo.razao_social || null, corpo.cidade || null,
          corpo.endereco || null, corpo.telefone || null,
          corpo.observacoes || null, corpo.pagamento || null]
      );
      for (const item of itensValidos) {
        await executarSql(
          `INSERT INTO ${tabelaItens} (${colunaId}, produto, quantidade, preco_unitario, subtotal)
           VALUES (?, ?, ?, ?, ?)`,
          [registro.id, item.produto, item.quantidade, item.preco, item.subtotal]
        );
      }
      return registro.id;
    });
    res.status(201).json({ id, total });
  } catch (error) {
    console.error('Erro ao salvar cadastro completo:', error);
    res.status(500).json({ error: 'Não foi possível salvar. Nenhum cadastro parcial foi mantido.' });
  }
}

app.post('/api/orcamentos/completo', (req, res) => salvarCadastroCompleto(req, res, 'orcamento'));
app.post('/api/pedidos/completo', (req, res) => salvarCadastroCompleto(req, res, 'pedido'));



// SALVAR ORÇAMENTO

app.post('/api/orcamentos', (req, res) => {

  const {

    nome_cliente, cnpj, razao_social, cidade,

    endereco, telefone, total, observacoes, pagamento

  } = req.body;



  const dataAtual = new Date().toISOString().split('T')[0];



  const sql = `

    INSERT INTO orcamentos (data, total, nome_cliente, cnpj, razao_social,

      cidade, endereco, telefone, observacoes, pagamento)

    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

  `;



  db.run(sql, [

    dataAtual, total, nome_cliente, cnpj, razao_social,

    cidade, endereco, telefone, observacoes, pagamento

  ], function(err) {

    if (err) {

      console.error('Erro ao salvar orçamento:', err);

      return res.status(500).json({ error: "Erro ao salvar orçamento" });

    }

    res.json({ id: this.lastID });

  });

});



// SALVAR ITENS DO ORÇAMENTO

app.post('/api/orcamento/:id/itens', (req, res) => {

  const orcamento_id = req.params.id;

  const itens = Array.isArray(req.body) ? req.body : [req.body];



  const stmt = db.prepare(`

    INSERT INTO itens_orcamento (orcamento_id, produto, quantidade, preco_unitario, subtotal)

    VALUES (?, ?, ?, ?, ?)

  `);



  try {

    itens.forEach(item => {

      stmt.run(orcamento_id, item.produto, item.quantidade, item.preco_unitario, item.subtotal);

    });

  } catch (err) {

    console.error('Erro ao executar stmt.run:', err);

    return res.status(500).json({ error: "Erro ao salvar itens do orçamento" });

  }



  stmt.finalize(err => {

    if (err) {

      console.error('Erro ao finalizar stmt:', err);

      return res.status(500).json({ error: "Erro ao salvar itens do orçamento" });

    }

    res.sendStatus(200);

  });

});



// GERAR PDF DO ORÇAMENTO (retorna buffer)

app.get('/orcamento/:id/pdf', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM orcamentos WHERE id = ?', [id], (err, orcamento) => {
    if (err) return res.status(500).send('Erro ao buscar orçamento.');
    if (!orcamento) return res.status(404).send('Orçamento não encontrado.');
    db.all('SELECT * FROM itens_orcamento WHERE orcamento_id = ?', [id], async (erro, itens) => {
      if (erro) return res.status(500).send('Erro ao buscar itens.');
      try {
        await enviarPdf(res, gerarHTMLOrcamento(orcamento, itens), `orcamento_${id}.pdf`);
      } catch (error) {
        erroPdf(res, error);
      }
    });
  });
});

function gerarHTMLOrcamento(orcamento, itens) {
  const subtotal = Math.round(
  itens.reduce((soma, item) => soma + Number(item.subtotal), 0) * 100
) / 100;
const aVista = orcamento.pagamento === 'avista';
const totalFinal = Math.round(subtotal * (aVista ? 0.95 : 1) * 100) / 100;
const desconto = Math.round((subtotal - totalFinal) * 100) / 100;
const formatarMoeda = valor =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return `

    <html>

      <head>

        <meta charset="UTF-8" />

        <title>Orçamento #${orcamento.id}</title>

        <style>

          body { font-family: Arial; margin: 40px; }

          h1 { text-align: center; }

          table { width: 100%; border-collapse: collapse; }

          th, td { border: 1px solid #000; padding: 8px; }

          th { background: #eee; }

          .cabecalho-orcamento {
  border-bottom: 2px solid #123d69;
  padding-bottom: 16px;
  margin-bottom: 20px;
}

.logos-orcamento {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 28px;
}

.logos-orcamento img {
  display: block;
  height: 90px;
  width: auto;
  max-width: 48%;
  object-fit: contain;
}

.contato-orcamento {
  margin-top: 12px;
  text-align: center;
  font-size: 12px;
  line-height: 1.5;
  color: #263849;
}

.resumo-orcamento {
  width: 300px;
  margin: 20px 0 0 auto;
}

.resumo-orcamento p {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin: 7px 0;
}

.resumo-orcamento .total {
  border-top: 2px solid #0e376c;
  padding-top: 9px;
  color: #0e376c;
  font-size: 18px;
}

        </style>

      </head>

      <body>

      <header class="cabecalho-orcamento">
  <div class="logos-orcamento">
    <img src="http://127.0.0.1:3000/assets/logo-mangueiras.png"
         alt="Mangueiras Aliança">
    <img src="http://127.0.0.1:3000/assets/logo-tintas.png"
         alt="Tintas Aliança">
  </div>

  <div class="contato-orcamento">
    <strong>MANGUEIRAS E TINTAS ALIANÇA</strong><br>
    BR 060 Qd 24 Lts 22/23/24, Recreio dos Funcionários Públicos<br>
    Goiânia-GO · CEP 74.393-351<br>
    wemersonsousa198212@gmail.com · (62) 8272-3108
  </div>
</header>

        <h1>Orçamento Nº ${orcamento.id}</h1>



        <p><strong>Cliente:</strong> ${orcamento.nome_cliente}</p>

        <p><strong>Cidade:</strong> ${orcamento.cidade}</p>

        <p><strong>Telefone:</strong> ${orcamento.telefone}</p>



        <table>

          <thead>

            <tr>

              <th>Produto</th>

              <th>Qtd</th>

              <th>Preço</th>

              <th>Subtotal</th>

            </tr>

          </thead>

          <tbody>

            ${itens.map(i => `

              <tr>

                <td>${i.produto}</td>

                <td>${i.quantidade}</td>

                <td>R$ ${i.preco_unitario.toFixed(2)}</td>

                <td>R$ ${i.subtotal.toFixed(2)}</td>

              </tr>

            `).join('')}

          </tbody>

        </table>



        <div class="resumo-orcamento">
  <p><span>Subtotal</span><strong>${formatarMoeda(subtotal)}</strong></p>
  ${aVista ? `<p><span>Desconto de 5% à vista</span><strong>− ${formatarMoeda(desconto)}</strong></p>` : ''}
  <p class="total"><span>Total a pagar</span><strong>${formatarMoeda(totalFinal)}</strong></p>
</div>

      </body>

    </html>

  `;

}





// Listar todos os clientes

app.get('/clientes', (req, res) => {

  db.all("SELECT * FROM clientes ORDER BY nome", (err, rows) => {

    if (err) return res.status(500).json({ error: 'Erro ao buscar clientes' });

    res.json(rows);

  });

});



app.get('/', (req, res) => {

  res.sendFile(path.join(__dirname, '../frontend/home.html'));

});



// PRODUTOS GERAIS

app.post('/produtos', (req, res) => {

  const produtos = req.body;

  const stmt = db.prepare("INSERT INTO produtos (nome, categoria, preco_unitario) VALUES (?, ?, ?)");

  produtos.forEach(prod => {

    stmt.run(prod.nome, prod.categoria, prod.preco_unitario);

  });

  stmt.finalize();

  res.sendStatus(200);

});



app.get('/produtos/:categoria', (req, res) => {

  const categoria = req.params.categoria;

  db.all("SELECT * FROM produtos WHERE categoria LIKE ? COLLATE NOCASE", [categoria], (err, rows) => {

    if (err) return res.status(500).json({ error: 'Erro ao buscar produtos' });

    res.json(rows);

  });

});



// Retornar todos os produtos da tabela (independente da categoria)

app.get('/produtos/:tabela/todos', (req, res) => {

  const tabela = req.params.tabela.toLowerCase();



  let tableName;

  if (tabela === 'go') tableName = 'produtos_go';

  else if (tabela === 'to') tableName = 'produtos_to';

  else return res.status(400).json({ error: 'Tabela inválida' });



  db.all(`SELECT * FROM ${tableName}`, [], (err, rows) => {

    if (err) return res.status(500).json({ error: 'Erro ao buscar produtos' });

    res.json(rows);

  });

});





// Atualizar preço

app.put('/produtos/:tabela/:id', (req, res) => {

  const tabela = req.params.tabela.toLowerCase();

  const id = req.params.id;

  const { preco_unitario } = req.body;



  let tableName;

  if (tabela === 'go') tableName = 'produtos_go';

  else if (tabela === 'to') tableName = 'produtos_to';

  else return res.status(400).json({ error: 'Tabela inválida' });



  db.run(`UPDATE ${tableName} SET preco_unitario = ? WHERE id = ?`, [preco_unitario, id], function(err) {

    if (err) return res.status(500).json({ error: 'Erro ao atualizar preço' });

    if (this.changes === 0) return res.status(404).json({ error: 'Produto não encontrado' });

    res.sendStatus(200);

  });

});

//isso e teste

app.get('/produtos/:tabela/:categoria', (req, res) => {

  const tabela = req.params.tabela.toLowerCase();

  const categoria = req.params.categoria;



  let tableName;

  if (tabela === 'go') tableName = 'produtos_go';

  else if (tabela === 'to') tableName = 'produtos_to';

  else return res.status(400).json({ error: 'Tabela inválida' });



  db.all(

    `SELECT * FROM ${tableName} WHERE categoria LIKE ? COLLATE NOCASE`,

    [categoria],

    (err, rows) => {

      if (err) return res.status(500).json({ error: 'Erro ao buscar produtos' });

      res.json(rows);

    }

  );

});



// Deletar produto

app.delete('/produtos/:tabela/:id', (req, res) => {

  const tabela = req.params.tabela.toLowerCase();

  const id = req.params.id;



  let tableName;

  if (tabela === 'go') tableName = 'produtos_go';

  else if (tabela === 'to') tableName = 'produtos_to';

  else return res.status(400).json({ error: 'Tabela inválida' });



  db.run(`DELETE FROM ${tableName} WHERE id = ?`, [id], function(err) {

    if (err) return res.status(500).json({ error: 'Erro ao excluir produto' });

    if (this.changes === 0) return res.status(404).json({ error: 'Produto não encontrado' });

    res.sendStatus(200);

  });

});







//pedidos

app.post('/api/pedidos', (req, res) => {

  const { nome_cliente, cnpj, razao_social, cidade, endereco, telefone, total, observacoes, pagamento } = req.body;

  const agora = new Date();

  const data = agora.toISOString().replace('T', ' ').substring(0, 19);



  const sql = `INSERT INTO pedidos (data, total, nome_cliente, cnpj, razao_social, cidade, endereco, telefone, observacoes, pagamento)

               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.run(sql, [data, total, nome_cliente, cnpj, razao_social, cidade, endereco, telefone, observacoes, pagamento], function(err) {

    if (err) return res.status(500).json({ error: 'Erro ao salvar pedido' });

    res.json({ id: this.lastID });

  });

});





//salva itens do pedido

app.post('/api/pedido/:pedidoId/itens', (req, res) => {

  const pedidoId = req.params.pedidoId;

  const itens = req.body;



  const stmt = db.prepare(`INSERT INTO itens_pedido (pedido_id, produto, quantidade, preco_unitario, subtotal)

                           VALUES (?, ?, ?, ?, ?)`);



  itens.forEach(item => {

    stmt.run(pedidoId, item.produto, item.quantidade, item.preco_unitario, item.subtotal);

  });



  stmt.finalize(err => {

    if (err) return res.status(500).json({ error: 'Erro ao salvar itens' });

    res.json({ success: true });

  });

});

app.get('/pedido/:pedidoId/pdf', (req, res) => {
  const { pedidoId } = req.params;
  db.get('SELECT * FROM pedidos WHERE id = ?', [pedidoId], (err, pedido) => {
    if (err) return res.status(500).send('Erro ao buscar pedido.');
    if (!pedido) return res.status(404).send('Pedido não encontrado.');
    db.all('SELECT * FROM itens_pedido WHERE pedido_id = ?', [pedidoId], async (erro, itens) => {
      if (erro) return res.status(500).send('Erro ao buscar itens.');
      try {
        await enviarPdf(res, gerarHTMLPedido(pedido, itens), `pedido_${pedidoId}.pdf`);
      } catch (error) {
        erroPdf(res, error);
      }
    });
  });
});

  function gerarHTMLPedido(pedido, itens) {

  const dataFormatada = new Date(pedido.data).toLocaleDateString('pt-BR');

  const formaPagamento = pedido.pagamento || 'parcelado';



  const subtotal = itens.reduce((acc, item) => acc + item.subtotal, 0);

  const totalFinal = Number(pedido.total);
  const desconto = formaPagamento === 'avista' ? Math.max(0, subtotal - totalFinal) : 0;



  const linhasItens = itens.map((item, i) => `

    <tr>

      <td>${i + 1}</td>

      <td>${item.produto}</td>

      <td>${item.quantidade}</td>

      <td>R$ ${item.preco_unitario.toFixed(2)}</td>

      <td>R$ ${item.subtotal.toFixed(2)}</td>

    </tr>

  `).join('');



  const linhaSubtotalTabela = `

    <tr>

      <td colspan="4" style="text-align: right;"><strong>Subtotal:</strong></td>

      <td><strong>R$ ${subtotal.toFixed(2)}</strong></td>

    </tr>

  `;



  const resumoValoresHTML = formaPagamento === 'avista'

    ? `

      <div class="resumo-valores">

        <p><strong>Subtotal:</strong> R$ ${subtotal.toFixed(2)}</p>

        <p><strong>Desconto 5% (à vista):</strong> - R$ ${desconto.toFixed(2)}</p>

        <p><strong>Total a Pagar:</strong> R$ ${totalFinal.toFixed(2)}</p>

      </div>

    `

    : `

      <div class="resumo-valores">

        <p><strong>Total a Pagar:</strong> R$ ${subtotal.toFixed(2)}</p>

      </div>

    `;



  return `

    <html>

      <head>

        <meta charset="UTF-8" />

        <title>Pedido #${pedido.id}</title>

        <style>

          body {

            font-family: Arial, sans-serif;

            margin: 40px;

            color: #333;

          }

          .topo {
  border-bottom: 2px solid #0e376c;
  padding-bottom: 14px;
  margin-bottom: 16px;
  break-inside: avoid;
}

.topo-marcas {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.topo-marcas img {
  display: block;
  height: 90px;
  object-fit: contain;
}

.logo-mangueiras { width: 24%; }
.logo-tintas { width: 31%; }
.caminhao-entrega { width: 38%; }

.dados-empresa {
  text-align: center;
  font-size: 11px;
  line-height: 1.5;
  color: #263849;
  margin-top: 10px;
}

.frase-confianca {
  text-align: center;
  font-weight: bold;
  font-size: 13px;
  color: #0e376c;
  margin: 8px 0 0;
}

          h1 {

            text-align: center;

            margin-top: 20px;

            font-size: 22px;

          }

          .info-cliente {

            margin-top: 20px;

            font-size: 14px;

            line-height: 1.6;

          }

          .separador {

            margin: 20px 0;

            font-weight: bold;

            color: #888;

            text-align: center;

            letter-spacing: 2px;

          }

          table {

            width: 100%;

            border-collapse: collapse;

            margin-top: 10px;

            font-size: 14px;

          }

          th, td {

            border: 1px solid #aaa;

            padding: 8px;

            text-align: left;

          }

          th {

            background-color: #e0e0e0;

          }

          .resumo-valores {

            margin-top: 20px;

            font-size: 15px;

          }

          .observacoes {

            margin-top: 20px;

            font-size: 14px;

          }

          .assinatura {

            margin-top: 50px;

            text-align: center;

            font-size: 14px;

          }

          .linha-assinatura {

            border-top: 1px solid #000;

            width: 300px;

            margin: 0 auto;

            margin-bottom: 5px;

          }

        </style>

      </head>

      <body>

        <div class="topo">
  <div class="topo-marcas">
    <img class="logo-mangueiras"
         src="http://127.0.0.1:3000/assets/logo-mangueiras.png"
         alt="Mangueiras Aliança">
    <img class="logo-tintas"
         src="http://127.0.0.1:3000/assets/logo-tintas.png"
         alt="Tintas Aliança">
    <img class="caminhao-entrega"
         src="http://127.0.0.1:3000/assets/caminhao-entrega.png"
         alt="Caminhão de entrega">
  </div>

  <div class="dados-empresa">
    <strong>MANGUEIRAS E TINTAS ALIANÇA</strong><br>
    BR 060 Qd 24 Lts 22/23/24 Recreio dos Funcionários Públicos<br>
    Goiânia-GO - CEP: 74.393-351<br>
    Wemersonsousa198212@gmail.com <br>
    (62) 8272-3108
  </div>

  <p class="frase-confianca">Essa é de confiança!</p>
</div>



        <h1>Pedido Nº ${pedido.id}</h1>



        <div class="info-cliente">

          <h2>Informações do Cliente</h2>

          <p><strong>Data de Emissão:</strong> ${dataFormatada}</p>

          <p><strong>Cliente:</strong> ${pedido.nome_cliente}</p>

          <p><strong>CNPJ:</strong> ${pedido.cnpj}</p>

          <p><strong>Razão Social:</strong> ${pedido.razao_social}</p>

          <p><strong>Cidade:</strong> ${pedido.cidade}</p>

          <p><strong>Endereço:</strong> ${pedido.endereco}</p>

          <p><strong>Telefone:</strong> ${pedido.telefone}</p>

        </div>



        <hr>

        <div class="separador">ITENS DO PEDIDO</div>



        <table>

          <thead>

            <tr>

              <th>#</th>

              <th>Produto</th>

              <th>Qtd</th>

              <th>Preço Unit.</th>

              <th>Subtotal</th>

            </tr>

          </thead>

          <tbody>

            ${linhasItens}

            ${linhaSubtotalTabela}

          </tbody>

        </table>



        ${resumoValoresHTML}

        <hr>



        ${pedido.observacoes ? `

          <div class="observacoes">

            <h3>Observações</h3>

            <p>${pedido.observacoes}</p>

          </div>

        ` : ''}



        <div class="assinatura">

          <div class="linha-assinatura"></div>

          <p>Wemerson - Vendedor <br> (62) 8272-3108</p>

        </div>

      </body>

    </html>

  `;

}



// Cancelar mantém o pedido e seus itens no banco para possível conferência.
app.patch('/api/pedidos/:pedidoId/cancelar', (req, res) => {
  const { pedidoId } = req.params;
  if (!/^[1-9]\d*$/.test(pedidoId)) {
    return res.status(400).json({ error: 'Número de pedido inválido.' });
  }
  db.run(
    "UPDATE pedidos SET cancelado_em = datetime('now') WHERE id = ? AND cancelado_em IS NULL",
    [pedidoId],
    function (err) {
      if (err) return res.status(500).json({ error: 'Erro ao cancelar pedido.' });
      if (this.changes === 0) return res.status(404).json({ error: 'Pedido não encontrado ou já cancelado.' });
      res.json({ success: true });
    }
  );
});

app.patch('/api/pedidos/:pedidoId/restaurar', (req, res) => {
  const { pedidoId } = req.params;
  if (!/^[1-9]\d*$/.test(pedidoId)) {
    return res.status(400).json({ error: 'Número de pedido inválido.' });
  }
  db.run(
    'UPDATE pedidos SET cancelado_em = NULL WHERE id = ? AND cancelado_em IS NOT NULL',
    [pedidoId],
    function (err) {
      if (err) return res.status(500).json({ error: 'Erro ao restaurar pedido.' });
      if (this.changes === 0) return res.status(404).json({ error: 'Pedido não encontrado ou já ativo.' });
      res.json({ success: true });
    }
  );
});

app.get('/api/pedidos', (req, res) => {
  const incluirCancelados = req.query.incluirCancelados === '1';
  const sql = 'SELECT * FROM pedidos ' +
    (incluirCancelados ? '' : 'WHERE cancelado_em IS NULL ') +
    'ORDER BY data DESC, id DESC';
  db.all(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Erro ao buscar pedidos.' });
    res.json(rows);
  });
});

app.get('/api/pedido/:pedidoId', (req, res) => {
  db.get('SELECT * FROM pedidos WHERE id = ?', [req.params.pedidoId], (err, pedido) => {
    if (err) return res.status(500).json({ error: 'Erro ao buscar pedido.' });
    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
    res.json(pedido);
  });
});

app.get('/api/pedido/:pedidoId/itens', (req, res) => {
  db.all('SELECT * FROM itens_pedido WHERE pedido_id = ? ORDER BY id',
    [req.params.pedidoId], (err, itens) => {
      if (err) return res.status(500).json({ error: 'Erro ao buscar itens.' });
      res.json(itens);
    });
});

function periodo(req, res, anual = false) {
  const { ano } = req.params;
  const mes = String(req.params.mes || '').padStart(2, '0');
  if (!/^\d{4}$/.test(ano) || (!anual && !/^(0[1-9]|1[0-2])$/.test(mes))) {
    res.status(400).json({ error: 'Ano ou mês inválido.' });
    return null;
  }
  return { ano, mes };
}

// A rota anual vem primeiro para que /ano/2026 não seja interpretada como mês.
app.get('/relatorio/pedidos/ano/:ano', (req, res) => {
  const filtro = periodo(req, res, true);
  if (!filtro) return;
  db.all(
    "SELECT * FROM pedidos WHERE cancelado_em IS NULL AND strftime('%Y', data) = ? ORDER BY data DESC",
    [filtro.ano],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Erro ao buscar pedidos.' });
      res.json(rows);
    }
  );
});

app.get('/relatorio/pedidos/ano/:ano/pdf', (req, res) => {
  const filtro = periodo(req, res, true);
  if (!filtro) return;
  db.all(
    "SELECT * FROM pedidos WHERE cancelado_em IS NULL AND strftime('%Y', data) = ? ORDER BY data DESC",
    [filtro.ano],
    async (err, pedidos) => {
      if (err) return res.status(500).send('Erro ao buscar pedidos.');
      if (!pedidos.length) return res.status(404).send('Nenhum pedido neste ano.');
      try {
        await enviarPdf(res, gerarHTMLRelatorioAnual(pedidos, filtro.ano),
          `relatorio_pedidos_${filtro.ano}.pdf`, 'attachment');
      } catch (error) {
        erroPdf(res, error);
      }
    }
  );
});

app.get('/relatorio/pedidos/:ano/:mes', (req, res) => {
  const filtro = periodo(req, res);
  if (!filtro) return;
  db.all(
    "SELECT * FROM pedidos WHERE cancelado_em IS NULL AND strftime('%Y', data) = ? AND strftime('%m', data) = ? ORDER BY data DESC",
    [filtro.ano, filtro.mes],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Erro ao buscar pedidos.' });
      res.json(rows);
    }
  );
});

app.get('/relatorio/pedidos/:ano/:mes/pdf', (req, res) => {
  const filtro = periodo(req, res);
  if (!filtro) return;
  db.all(
    "SELECT * FROM pedidos WHERE cancelado_em IS NULL AND strftime('%Y', data) = ? AND strftime('%m', data) = ? ORDER BY data DESC",
    [filtro.ano, filtro.mes],
    async (err, pedidos) => {
      if (err) return res.status(500).send('Erro ao buscar pedidos.');
      if (!pedidos.length) return res.status(404).send('Nenhum pedido neste mês.');
      try {
        await enviarPdf(res, gerarHTMLRelatorio(pedidos, filtro.mes, filtro.ano),
          `relatorio_pedidos_${filtro.ano}_${filtro.mes}.pdf`, 'attachment');
      } catch (error) {
        erroPdf(res, error);
      }
    }
  );
});

function gerarResumoRelatorio(pedidos) {
  const totalVendido = pedidos.reduce(
    (soma, pedido) => soma + Number(pedido.total || 0), 0
  );
  const moeda = valor => valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  return `
    <div style="margin-top: 24px; text-align: right;">
      <p><strong>Total vendido no período:</strong> ${moeda(totalVendido)}</p>
      <p><strong>Comissão (10%):</strong> ${moeda(totalVendido * 0.10)}</p>
    </div>
  `;
}
function gerarHTMLRelatorio(pedidos, mes, ano) {

  const meses = {

    '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',

    '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',

    '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro'

  };



  let linhas = pedidos.map(p => `

    <tr>

      <td>${p.id}</td>

      <td>${new Date(p.data).toLocaleDateString('pt-BR')}</td>

      <td>${p.nome_cliente}</td>

      <td>${p.razao_social}</td>

      <td>${p.cidade}</td>

      <td>R$ ${p.total.toFixed(2)}</td>

    </tr>

  `).join('');



  return `

    <html>

    <head>

      <meta charset="UTF-8" />

      <title>Relatório de Pedidos - ${meses[mes]} ${ano}</title>

      <style>

        body { font-family: Arial, sans-serif; margin: 20px; }

        h1 { text-align: center; }

        table { width: 100%; border-collapse: collapse; margin-top: 20px; }

        th, td { border: 1px solid #000; padding: 8px; text-align: left; }

        th { background-color: #ddd; }

      </style>

    </head>

    <body>

      <h1>Relatório de Pedidos - ${meses[mes]} ${ano}</h1>
      ${gerarResumoRelatorio(pedidos)}

      <table>

        <thead>

          <tr>

            <th>ID</th>

            <th>Data</th>

            <th>Cliente</th>

            <th>Razão Social</th>

            <th>Cidade</th>

            <th>Total (R$)</th>

          </tr>

        </thead>

        <tbody>

          ${linhas}

        </tbody>

      </table>

    </body>

    </html>

  `;

}



function gerarHTMLRelatorioAnual(pedidos, ano) {

  let linhas = pedidos.map(p => `

    <tr>

      <td>${p.id}</td>

      <td>${new Date(p.data).toLocaleDateString('pt-BR')}</td>

      <td>${p.nome_cliente}</td>

      <td>${p.razao_social}</td>

      <td>${p.cidade}</td>

      <td>R$ ${p.total.toFixed(2)}</td>

    </tr>

  `).join('');



  return `

    <html>

    <head>

      <meta charset="UTF-8" />

      <title>Relatório de Pedidos - Ano ${ano}</title>

      <style>

        body { font-family: Arial, sans-serif; margin: 20px; }

        h1 { text-align: center; }

        table { width: 100%; border-collapse: collapse; margin-top: 20px; }

        th, td { border: 1px solid #000; padding: 8px; text-align: left; }

        th { background-color: #ddd; }

      </style>

    </head>

    <body>

      <h1>Relatório de Pedidos - Ano ${ano}</h1>
      ${gerarResumoRelatorio(pedidos)}

      <table>

        <thead>

          <tr>

            <th>ID</th>

            <th>Data</th>

            <th>Cliente</th>

            <th>Razão Social</th>

            <th>Cidade</th>

            <th>Total (R$)</th>

          </tr>

        </thead>

        <tbody>

          ${linhas}

        </tbody>

      </table>

    </body>

    </html>

  `;

}



// Criar cliente

app.post('/clientes', (req, res) => {

  const { cnpj, razao_social, cidade, nome } = req.body;

  const sql = `INSERT INTO clientes (cnpj, razao_social, cidade, nome) VALUES (?, ?, ?, ?)`;

  db.run(sql, [cnpj, razao_social, cidade, nome], function(err) {

    if (err) return res.status(500).json({ error: 'Erro ao cadastrar cliente' });

    res.sendStatus(200);

  });

});



// Editar cliente

app.put('/clientes/:id', (req, res) => {

  const id = req.params.id;

  const { cnpj, razao_social, cidade, nome } = req.body;

  const sql = `UPDATE clientes SET cnpj = ?, razao_social = ?, cidade = ?, nome = ? WHERE id = ?`;

  db.run(sql, [cnpj, razao_social, cidade, nome, id], function(err) {

    if (err) return res.status(500).json({ error: 'Erro ao atualizar cliente' });

    res.sendStatus(200);

  });

});



// Excluir cliente

app.delete('/clientes/:id', (req, res) => {

  const id = req.params.id;

  db.run(`DELETE FROM clientes WHERE id = ?`, [id], function(err) {

    if (err) return res.status(500).json({ error: 'Erro ao excluir cliente' });

    res.sendStatus(200);

  });

});



app.post('/cadastrar-produtos/:tabela', (req, res) => {

  const tabela = req.params.tabela.toLowerCase();

  const produtos = req.body;



  let tableName;

  if (tabela === 'go') tableName = 'produtos_go';

  else if (tabela === 'to') tableName = 'produtos_to';

  else return res.status(400).json({ error: 'Tabela inválida' });



  const stmt = db.prepare(`INSERT INTO ${tableName} (nome, categoria, preco_unitario) VALUES (?, ?, ?)`);

  produtos.forEach(prod => {

    stmt.run(prod.nome, prod.categoria, prod.preco_unitario);

  });

  stmt.finalize(err => {

    if (err) return res.status(500).json({ error: 'Erro ao cadastrar produtos' });

    res.sendStatus(200);

  });

});





function iniciarServidor() {
  const servidor = app.listen(PORT, '127.0.0.1', () => {
    console.log(`✅ Servidor rodando: http://127.0.0.1:${PORT}`);
  });
  servidor.on('error', error => console.error('Erro ao iniciar servidor:', error));
}
