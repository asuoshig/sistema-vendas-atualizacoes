function carregarProdutos(selectCategoria, selectProduto) {
  const categoria = selectCategoria.value;
  if (!categoria) {
    selectProduto.innerHTML = '<option value="">Produto</option>';
    return;
  }

  fetch(`/produtos/${categoria}`)
    .then(res => res.json())
    .then(produtos => {
      selectProduto.innerHTML = '<option value="">Produto</option>';
      produtos.forEach(prod => {
        const option = document.createElement('option');
        option.value = JSON.stringify(prod);
        option.textContent = prod.nome;
        selectProduto.appendChild(option);
      });
    })
    .catch(err => {
      console.error("Erro ao carregar produtos:", err);
      alert("Erro ao carregar produtos.");
    });
}

function selecionarProduto(selectProduto) {
  const produto = JSON.parse(selectProduto.value || '{}');
  const linha = selectProduto.closest('tr');
  const precoInput = linha.querySelector('.preco');
  precoInput.value = produto.preco_unitario?.toFixed(2) || '0.00';
  atualizarTotal();
}

function atualizarTotal() {
  console.log("Total atualizado (em breve você pode calcular o total do pedido aqui)");
}
