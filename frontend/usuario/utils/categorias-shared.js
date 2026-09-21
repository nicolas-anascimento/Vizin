// Opções de categorias vêm do catálogo atual do servidor.
window.CategoriasVizin = {
    async carregar(select, opcoes = {}) {
        const anterior = select.value;
        const categorias = await window.ApiVizin.get('/categorias');
        select.replaceChildren(new Option(opcoes.rotuloVazio || 'Selecione...', ''));
        categorias.forEach(c => select.add(new Option(c.nome, c.slug)));
        select.value = anterior;
        return categorias;
    }
};
