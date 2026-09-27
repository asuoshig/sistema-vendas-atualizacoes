# Sistema de Vendas — versão de teste

Esta versão reúne a pasta `frontend` enviada pela Geovana, o `server.js`
reconstruído do texto colado na conversa e o `main.js` e `package.json`
reconstruídos da mensagem. Confira os arquivos originais antes de instalar.
O aplicativo ainda **não foi testado no Windows**.

## O que foi preparado

- Pedidos e orçamentos são salvos com todos os itens em uma transação; se algo
  falhar, o cadastro incompleto é desfeito. Depois de salvar, a tela oferece
  um link para abrir o PDF com um clique direto do usuário.
- Todos os PDFs são devolvidos em memória. Quando aberto no Electron, o
  aplicativo usa o próprio navegador incluído no instalador para imprimir
  pedidos, orçamentos e relatórios; não depende do Chrome do computador.
  Quem executar apenas `npm start` durante o desenvolvimento ainda precisa
  do Chrome e da dependência de desenvolvimento Puppeteer.
- Relatórios mensais e anuais listam somente pedidos ativos, aceitam mês `9`
  ou `09`, e a tela exibe a quantidade de pedidos e o valor total.
- A página `historico.html` permite consultar, cancelar e restaurar pedidos.
  O cancelamento mantém os dados e os itens no banco. A migração acrescenta
  apenas a coluna `cancelado_em` aos bancos antigos.
- `npm run electron` inicia somente o Electron; ele inicia o servidor e espera
  uma resposta antes de abrir a janela.
- O modo de desenvolvimento grava em `data-dev/database.db`, separado do
  banco que o aplicativo instalado usa no Windows.
- Antes de acrescentar `cancelado_em` a um banco antigo, o sistema cria uma
  cópia SQLite em `backups` dentro da pasta de dados do aplicativo.
- O Electron contém a verificação automática de versões NSIS. A configuração
  da versão publicada aponta para o repositório de atualizações informado:
  `asuoshig/sistema-vendas-atualizacoes`.

## Verificações feitas

- `node --check` passou no backend, no Electron e nos scripts das páginas.
- `node --test tests/pdf.test.js` confirmou que o fluxo do PDF chama a impressão
  do Electron e fecha a janela auxiliar mesmo se houver erro. É um teste com
  janela simulada; ainda precisa de teste visual no Windows.
- Um banco SQLite temporário confirmou a migração, o cadastro transacional,
  o rollback, o filtro de pedidos cancelados e a restauração.
- Não foi possível executar os PDFs reais nem gerar o instalador neste
  ambiente: as dependências Node e a instalação Windows não estão aqui.

## Antes de instalar no computador do vendedor

1. Localize o `database.db` que a instalação **dele** usa. Com o aplicativo
   fechado, faça uma cópia separada e confira a quantidade de pedidos na cópia.
2. Instale as dependências e teste esta versão no Windows com um banco de
   exemplo. Confira pedidos, orçamentos, PDFs, relatório anual e mensal,
   cancelamento e restauração.
3. Teste o instalador com uma **cópia** do banco real e compare os pedidos
   e os totais antes de atualizar a instalação em uso.

## Como preparar atualizações no repositório criado

O aplicativo continuará funcionando sem internet. O `database.db` e os
pedidos ficam no computador do vendedor, fora do instalador. Para distribuir
novas versões pelo GitHub Releases:

1. O repositório
   [asuoshig/sistema-vendas-atualizacoes](https://github.com/asuoshig/sistema-vendas-atualizacoes)
   foi confirmado como **público em 26/09/2026**; ainda não havia releases
   nessa data. Você pode guardar o código-fonte apenas no seu computador.
   Os instaladores publicados nesse repositório poderão ser baixados por
   qualquer pessoa; **nunca envie o banco `database.db` para lá**.
2. Em um computador **Windows**, com Node.js e npm instalados, abra o
   PowerShell na pasta do projeto e execute:

   ```powershell
   .\preparar-versao-windows.ps1
   ```

   Caso o PowerShell impeça scripts, execute `npm install` seguido de
   `npm run build:release`, e confira se aparecem `latest.yml` e
   `win-unpacked/resources/app-update.yml` na pasta `dist`. A instalação das
   dependências pode baixar pacotes da internet. Use `npm run build` somente
   para testar sem configurar o repositório de atualizações.
3. No [repositório criado](https://github.com/asuoshig/sistema-vendas-atualizacoes/releases/new), crie uma **release** com a etiqueta `v1.1.0` (a versão deve ser
   igual à do `package.json`). Envie os arquivos da pasta `dist`: instalador
   `.exe`, `latest.yml` e `.blockmap` se forem gerados. Publique a release;
   rascunhos não são vistos pelo atualizador.
4. Instale essa versão uma vez no computador do vendedor **depois** de fazer
   backup do banco e testar com uma cópia. Para a próxima atualização, aumente
   a versão do `package.json`, gere e publique a nova release com a etiqueta
   correspondente. Quando o aplicativo estiver aberto com internet, ele
   verificará se há versão nova; a instalação ocorre ao fechar o aplicativo.

O programa atual do vendedor, que não tem atualizador, precisará receber a
primeira instalação manualmente. O caminho de `userData` deve ser conferido
na instalação antiga antes de trocar o programa: se ela usava outra pasta,
será necessário copiar o banco para a pasta de dados usada por esta versão.
Ainda falta testar dois instaladores sucessivos em Windows e conferir os PDFs
reais e o histórico após a atualização.
