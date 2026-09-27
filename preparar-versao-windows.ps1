$ErrorActionPreference = 'Stop'
$env:PUPPETEER_SKIP_DOWNLOAD = '1'

npm install --no-audit
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar dependências.' }

npm run build:release
if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar o instalador.' }

$manifesto = Join-Path 'dist' 'latest.yml'
$feedNoAplicativo = Join-Path 'dist' 'win-unpacked/resources/app-update.yml'
if (-not (Test-Path $manifesto) -or -not (Test-Path $feedNoAplicativo)) {
  throw 'Faltou latest.yml ou app-update.yml. Não publique nem instale essa versão: ela não receberá atualizações.'
}
$versao = (Get-Content 'package.json' -Raw | ConvertFrom-Json).version
$instalador = Join-Path 'dist' "SistemaVendas-Setup-$versao.exe"
if (-not (Test-Path $instalador)) { throw "O instalador da versão $versao não foi gerado." }
if (-not ((Get-Content $manifesto -Raw).Contains("version: $versao"))) {
  throw 'latest.yml não corresponde à versão do aplicativo. Não publique esses arquivos.'
}
$feed = Get-Content $feedNoAplicativo -Raw
if (-not ($feed.Contains('asuoshig') -and $feed.Contains('sistema-vendas-atualizacoes'))) {
  throw 'O instalador não aponta para o repositório de atualizações correto.'
}

Write-Host "Instalador e metadados gerados em dist/. Crie a release v$versao em https://github.com/asuoshig/sistema-vendas-atualizacoes/releases/new"
Write-Host 'Envie o .exe, latest.yml e os arquivos .blockmap gerados antes de publicar a release.'
