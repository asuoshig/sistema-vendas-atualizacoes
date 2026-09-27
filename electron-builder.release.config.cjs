// Destino das versões informado pela responsável pelo aplicativo.
// O banco de dados e o código-fonte não são publicados por esta configuração.
const owner = 'asuoshig';
const repo = 'sistema-vendas-atualizacoes';
const configuracao = require('./package.json').build;
module.exports = {
  ...configuracao,
  publish: { provider: 'github', owner, repo },
  win: {
    ...configuracao.win,
    artifactName: 'SistemaVendas-Setup-${version}.${ext}'
  }
};
