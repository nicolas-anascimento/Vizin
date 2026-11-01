// Avaliações são arrays paginados na API; este adaptador entrega o resumo usado pelas telas.
const AvaliacoesVizin = (() => {
    const Api = window.ApiVizin;
    const enc = encodeURIComponent;
    async function resumo(caminho) {
        let page = 1;
        let total = 0;
        const rows = [];
        do {
            const { dados, cabecalhos } = await Api.requisitar("GET", `${caminho}?page=${page}&limit=100`, undefined, { comCabecalhos: true });
            if (!Array.isArray(dados)) throw new Error("Resposta de avaliações inválida");
            rows.push(...dados);
            total = Number(cabecalhos.get("X-Total-Count"));
            if (!Number.isFinite(total)) total = rows.length + (dados.length === 100 ? 1 : 0);
            page++;
        } while (rows.length < total);
        const lista = rows.map(r => ({
            ...r, data: r.criado_em, nomeAvaliador: r.nomeAvaliador || "Usuário",
            avaliadorId: r.avaliador_id, produtoTitulo: r.produtoTitulo || "",
            aluguelId: r.aluguel_id, objetoId: r.objetoId
        }));
        const media = lista.length ? lista.reduce((s, r) => s + Number(r.nota), 0) / lista.length : 0;
        return { media, total: lista.length, lista };
    }
    async function obterAvaliacoes(aluguelId) { return Api.get(`/solicitacoes/${enc(aluguelId)}/avaliacoes`); }
    async function jaAvaliou(aluguelId, papel) {
        const lista = await obterAvaliacoes(aluguelId);
        return lista.some(r => r.contexto === (papel === "locatario" ? "objeto" : "usuario"));
    }
    async function avaliar(aluguelId, _papel, nota, comentario) {
        const resposta = await Api.post(`/solicitacoes/${enc(aluguelId)}/avaliacao`, { nota, comentario: comentario || "" });
        document.dispatchEvent(new CustomEvent("avaliacoesAtualizadas"));
        return resposta;
    }
    return {
        obterAvaliacoes, jaAvaliou, avaliar,
        obterAvaliacoesRecebidas: id => id ? resumo(`/usuarios/${enc(id)}/avaliacoes-recebidas`) : Promise.resolve({ media: 0, total: 0, lista: [] }),
        obterAvaliacoesRecebidasComoLocatario: id => id ? resumo(`/usuarios/${enc(id)}/avaliacoes-recebidas-locatario`) : Promise.resolve({ media: 0, total: 0, lista: [] }),
        obterAvaliacoesDoProduto: id => resumo(`/objetos/${enc(id)}/avaliacoes`)
    };
})();
window.AvaliacoesVizin = AvaliacoesVizin;
