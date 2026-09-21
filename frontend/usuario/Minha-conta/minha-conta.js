const listaEnderecos = document.getElementById('enderecos-lista');
const formularioEndereco = document.getElementById('endereco-form');
const erroEndereco = document.getElementById('enderecos-erro');
let enderecos = [];
async function carregarEnderecos() {
    try {
        enderecos = await window.ApiVizin.get('/enderecos');
        listaEnderecos.replaceChildren();
        if (!enderecos.length) listaEnderecos.textContent = 'Nenhum endereço cadastrado.';
        for (const endereco of enderecos) {
            const linha = document.createElement('p');
            const descricao = document.createElement('span');
            descricao.textContent = `${endereco.rua}, ${endereco.numero} — ${endereco.bairro}, ${endereco.cidade}/${endereco.estado}${endereco.principal ? ' (principal)' : ''} `;
            const editar = document.createElement('button');
            editar.type = 'button'; editar.textContent = 'Editar';
            editar.addEventListener('click', async () => {
                try {
                    const atual = await window.ApiVizin.get(`/enderecos/${encodeURIComponent(endereco.id)}`);
                    for (const nome of ['id','cep','rua','numero','complemento','bairro','cidade','estado']) formularioEndereco.elements[nome].value = atual[nome] || '';
                    formularioEndereco.elements.principal.checked = Boolean(atual.principal);
                } catch (e) { erroEndereco.textContent = e.message; }
            });
            const excluir = document.createElement('button');
            excluir.type = 'button'; excluir.textContent = 'Excluir';
            excluir.addEventListener('click', async () => {
                if (!confirm('Excluir este endereço?')) return;
                excluir.disabled = true;
                try { await window.ApiVizin.delete(`/enderecos/${encodeURIComponent(endereco.id)}`); await carregarEnderecos(); }
                catch (e) { erroEndereco.textContent = e.message; excluir.disabled = false; }
            });
            linha.append(descricao, editar, excluir); listaEnderecos.appendChild(linha);
        }
    } catch (e) { listaEnderecos.textContent = e.message; }
}
formularioEndereco.addEventListener('submit', async e => {
    e.preventDefault();
    const botao = formularioEndereco.querySelector('[type=submit]'); botao.disabled = true;
    erroEndereco.textContent = '';
    const dados = Object.fromEntries(new FormData(formularioEndereco));
    const id = dados.id; delete dados.id;
    dados.principal = formularioEndereco.elements.principal.checked;
    try {
        if (id) await window.ApiVizin.patch(`/enderecos/${encodeURIComponent(id)}`, dados);
        else await window.ApiVizin.post('/enderecos', dados);
        formularioEndereco.reset(); await carregarEnderecos();
    } catch (erro) { erroEndereco.textContent = erro.message; }
    finally { botao.disabled = false; }
});
carregarEnderecos();
