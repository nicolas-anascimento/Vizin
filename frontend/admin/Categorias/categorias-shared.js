// ================= CATEGORIAS VIZIN — MÓDULO COMPARTILHADO =================
// Fonte única das categorias para as telas do usuário (Início, Cadastrar
// objeto, Editar objeto). É a MESMA tabela que o admin gerencia em
// /admin/categorias — criou/renomeou/excluiu lá, aparece aqui.
//
// ROTA ASSUMIDA (confirmar com o back):
//   GET /categorias   pública, lista todas as categorias
//   cada item: { id, nome, slug, icone?, cor? }
//   (aceita array puro ou embrulhado em { data | dados | items | categorias })
//
// O <select> usa o SLUG como value (fallback: id, se o back não mandar slug).
// É esse mesmo valor que Cadastrar/Editar enviam no campo `categoria` e que o
// filtro do Início compara com `categoriaSlug` do objeto.
//
// Uso:
//   await CategoriasVizin.carregar(selectEl);                          // "Selecione..."
//   await CategoriasVizin.carregar(selectEl, { rotuloVazio: "Todas" });

(function () {
    "use strict";

    const Api = window.ApiVizin;
    if (!Api) {
        console.error("utils/api-client.js (e utils/config.js) precisam ser carregados ANTES deste script.");
        return;
    }

    let cache = null; // Promise<categoria[]> — uma única requisição por página

    function extrairLista(corpo) {
        if (Array.isArray(corpo)) return corpo;
        return corpo?.dados || corpo?.data || corpo?.items || corpo?.categorias || [];
    }

    function normalizar(dto) {
        return {
            ...dto,
            id: String(dto.id),
            nome: dto.nome || "",
            slug: dto.slug ? String(dto.slug) : null,
            // value usado no <select> e enviado ao back
            valor: dto.slug ? String(dto.slug) : String(dto.id),
            icone: dto.icone || null,
            cor: dto.cor || null
        };
    }

    // Lista (com cache). Se falhar, limpa o cache pra permitir nova tentativa.
    function obterTodas() {
        if (!cache) {
            cache = Api.get("/categorias")
                .then(corpo => extrairLista(corpo)
                    .map(normalizar)
                    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")))
                .catch(erro => {
                    cache = null;
                    throw erro;
                });
        }
        return cache;
    }

    // Preenche um <select> preservando o valor já escolhido (se ainda existir).
    async function carregar(select, { rotuloVazio = "Selecione..." } = {}) {
        const lista = await obterTodas();
        if (!select) return lista;

        const atual = select.value;
        select.replaceChildren(
            new Option(rotuloVazio, ""),
            ...lista.map(c => new Option(c.nome, c.valor))
        );
        if (atual && lista.some(c => c.valor === atual)) select.value = atual;
        select.disabled = false;
        return lista;
    }

    // Busca por slug OU id (útil pra mapear o valor do select de volta pra categoria).
    async function obterPorValor(valor) {
        const lista = await obterTodas();
        return lista.find(c => c.valor === String(valor) || c.id === String(valor)) || null;
    }

    // Descarta o cache (ex.: depois de o admin mexer nas categorias na mesma sessão).
    function invalidar() {
        cache = null;
    }

    window.CategoriasVizin = { obterTodas, carregar, obterPorValor, invalidar };
})();
