// ================= OBJETOS VIZIN — MÓDULO COMPARTILHADO (API REAL) =================
// Fonte única dos objetos anunciados. Antes: tabela em localStorage ("objetos",
// ids Date.now(), dono identificado por e-mail). Agora: o back-end é a fonte da
// verdade; este módulo só conversa com a API, traduz o formato e guarda um cache
// em memória dos objetos já lidos.
//
// ROTAS ASSUMIDAS (ajuste em ROTAS abaixo se o back usar outras) — confirmar com o back:
//   GET    /objetos                      lista (paginada: ?page=&limit=)
//   GET    /objetos/:id                  um objeto (404 => null)
//   GET    /objetos?proprietario_id=:id  objetos de um dono
//   POST   /objetos                      criar
//   PATCH  /objetos/:id                  editar (inclui { disponivel })
//   DELETE /objetos/:id                  excluir (409 se em locação / com solicitação pendente)
//
// TODAS as funções de leitura/escrita agora são ASSÍNCRONAS, exceto as que só
// consultam o cache em memória: obterDoCache, temLocacaoAtiva, temSolicitacaoPendente.
//
// O dono é identificado por ID (proprietario.id). A API pública não devolve o
// e-mail do dono.
//
// Disponibilidade: o back é quem muda `disponivel` automaticamente quando uma
// solicitação é aprovada/concluída/cancelada (o front não chama mais isso nesses
// fluxos). `marcarDisponibilidade` fica só para o "pausar anúncio" manual do dono.

(function () {
    "use strict";

    const Api = window.ApiVizin;
    if (!Api) {
        console.error("utils/api-client.js (e utils/config.js) precisam ser carregados ANTES deste script. Rode aplicar-scripts-html.py.");
        return;
    }

    const enc = encodeURIComponent;

    const ROTAS = {
        lista: "/objetos",
        um: (id) => `/objetos/${enc(id)}`,
        doProprietario: (id) => `/objetos?proprietario_id=${enc(id)}`
    };

    const cache = new Map(); // id (string) -> objeto normalizado

    // ================= NORMALIZAÇÃO =================
    function urlDaImagem(item) {
        if (!item) return null;
        return typeof item === "string" ? item : (item.url || item.src || null);
    }

    // Mantém os campos do back e garante os que as telas sempre leram:
    // `imagens` (array de URLs), `imagem` (= 1ª foto), `categoria` (texto),
    // `preco_dia`, `disponivel`, `proprietarioId`/`proprietarioNome`.
    function normalizar(dto) {
        if (!dto) return null;

        const imagens = (Array.isArray(dto.fotos) ? dto.fotos : (Array.isArray(dto.imagens) ? dto.imagens : []))
            .map(urlDaImagem)
            .filter(Boolean);
        const principal = urlDaImagem(dto.imagem) || urlDaImagem(dto.imagem_principal);
        if (imagens.length === 0 && principal) imagens.push(principal);

        const proprietario = dto.proprietario || null;

        return {
            ...dto,
            id: String(dto.id),
            imagens,
            imagem: imagens[0] || null,
            categoria: dto.categoria?.nome ?? dto.categoria_nome ?? dto.categoria ?? "",
            preco_dia: dto.preco_dia ?? dto.preco ?? dto.preco_por_dia,
            disponivel: dto.disponivel ?? true,
            proprietarioId: proprietario?.id ? String(proprietario.id) : (dto.proprietario_id ? String(dto.proprietario_id) : null),
            proprietarioNome: proprietario?.nome || dto.proprietarioNome || ""
        };
    }

    function guardar(objeto) {
        if (objeto) cache.set(objeto.id, objeto);
        return objeto;
    }

    function avisarMudanca() {
        document.dispatchEvent(new CustomEvent("objetosAtualizados"));
    }

    // Aceita array puro ou embrulhado ({ dados | items | data | objetos }).
    function extrairLista(corpo) {
        if (Array.isArray(corpo)) return corpo;
        return corpo?.dados || corpo?.items || corpo?.data || corpo?.objetos || [];
    }

    // Junta todas as páginas usando X-Total-Count.
    async function listar(caminho) {
        const sep = caminho.includes("?") ? "&" : "?";
        let pagina = 1;
        let totalPaginas = 1;
        let tudo = [];

        do {
            const { dados, cabecalhos } = await Api.requisitar(
                "GET", `${caminho}${sep}page=${pagina}&limit=100`, undefined, { comCabecalhos: true }
            );
            tudo = tudo.concat(extrairLista(dados));
            const total = Number(cabecalhos.get("X-Total-Count"));
            totalPaginas = Number.isFinite(total) ? Math.ceil(total / 100) : (extrairLista(dados).length === 100 ? pagina + 1 : pagina);
            pagina++;
        } while (pagina <= totalPaginas);

        return tudo.map(normalizar).map(guardar);
    }

    // ================= LEITURA =================
    function obterTodos() {
        return listar(ROTAS.lista);
    }

    // null se não existe (a página de Produto mostra "não encontrado").
    async function obterPorId(id) {
        try {
            return guardar(normalizar(await Api.get(ROTAS.um(id))));
        } catch (erro) {
            if (erro.status === 404 || erro.codigo === "nao_encontrado" || erro.codigo === "nao_encontrada") return null;
            throw erro;
        }
    }

    // Leitura SÍNCRONA do que já foi carregado (para cliques em cards etc.).
    function obterDoCache(id) {
        return cache.get(String(id)) || null;
    }

    // Por id do dono (UUID) — não por e-mail.
    async function obterDoProprietario(proprietarioId) {
        if (!proprietarioId) return [];
        const sessao = await window.SessaoVizin?.pronto;
        const meuId = sessao?.id || window.SolicitacoesVizin?.usuarioId?.();
        if (meuId && String(proprietarioId) === String(meuId)) return listar("/objetos/meus");
        return listar(ROTAS.doProprietario(proprietarioId));
    }

    // ================= ESCRITA =================
    // ---- CONTRATO DE ESCRITA (ASSUMIDO — confirmar com o back; é o único lugar a mudar) ----
    // Sem fotos: JSON com os campos.
    // Com fotos: multipart/form-data com os mesmos campos (texto) +
    //   "fotos"             -> cada arquivo novo (JPEG já reduzido no navegador)
    //   "fotos_mantidas"    -> JSON com os UUIDs das fotos existentes a manter
    //                          (só na edição)
    // Booleanos/números vão como texto ("true", "35.5") — o back precisa converter.
    // O dono NÃO é enviado: o back usa o usuário do token.
    function montarCorpo(dados, fotosNovas, imagensMantidas) {
        if (!fotosNovas?.length && imagensMantidas === undefined) return dados;

        const form = new FormData();
        Object.entries(dados).forEach(([campo, valor]) => {
            if (valor === undefined || valor === null || campo === "imagens") return;
            form.append(campo, String(valor));
        });
        if (imagensMantidas !== undefined) form.append("fotos_mantidas", JSON.stringify(imagensMantidas));
        (fotosNovas || []).forEach((arquivo, i) => form.append("fotos", arquivo, arquivo.name || `foto-${i + 1}.jpg`));
        return form;
    }

    // opcoes: { fotos: File[] }
    async function criar(dados, { fotos } = {}) {
        const objeto = guardar(normalizar(await Api.post(ROTAS.lista, montarCorpo(dados, fotos))));
        avisarMudanca();
        return objeto;
    }

    // Erros do back: 409 com codigo "objeto_em_locacao" / "objeto_com_solicitacao_pendente".
    // Convertidos para os mesmos Error(...) que as telas já tratavam.
    function traduzirErroDeBloqueio(erro) {
        if (erro instanceof Api.ApiError && erro.status === 409) {
            const codigo = String(erro.codigo || "");
            if (/locacao/i.test(codigo)) return new Error("OBJETO_EM_LOCACAO");
            if (/pendente/i.test(codigo)) return new Error("OBJETO_COM_SOLICITACAO_PENDENTE");
        }
        return erro;
    }

    // opcoes: { fotosNovas: File[], imagensMantidas: string[] } — só na edição de fotos.
    async function atualizar(id, dados, { fotosNovas, imagensMantidas } = {}) {
        try {
            const objeto = guardar(normalizar(await Api.patch(ROTAS.um(id), montarCorpo(dados, fotosNovas, imagensMantidas))));
            avisarMudanca();
            return objeto;
        } catch (erro) {
            throw traduzirErroDeBloqueio(erro);
        }
    }

    async function excluir(id) {
        try {
            await Api.delete(ROTAS.um(id));
        } catch (erro) {
            throw traduzirErroDeBloqueio(erro);
        }
        cache.delete(String(id));
        avisarMudanca();
    }

    // "Pausar/reativar anúncio" pelo dono. (Aprovar/concluir/cancelar locação
    // muda a disponibilidade sozinho no back.)
    function marcarDisponibilidade(id, disponivel) {
        return atualizar(id, { disponivel });
    }

    // ================= LOCAÇÃO ATIVA / SOLICITAÇÃO PENDENTE (leitura síncrona) =================
    // Preferem um sinal do próprio back no objeto (em_locacao / tem_solicitacao_pendente);
    // sem ele, olham as solicitações do USUÁRIO LOGADO (cache de SolicitacoesVizin) —
    // o que cobre o dono olhando os próprios objetos, mas NÃO enxerga locações de
    // terceiros (um visitante vê apenas "indisponível", não "alugado").
    // Aceitam o objeto inteiro ou só o id.
    const ESTADOS_LOCACAO_ATIVA = ["aprovado", "pago", "retirado"];

    function idDe(objetoOuId) {
        return typeof objetoOuId === "object" && objetoOuId !== null ? objetoOuId.id : objetoOuId;
    }

    function temLocacaoAtiva(objetoOuId) {
        if (typeof objetoOuId === "object" && objetoOuId !== null && objetoOuId.em_locacao !== undefined) {
            return !!objetoOuId.em_locacao;
        }
        if (!window.SolicitacoesVizin) return false;

        const id = String(idDe(objetoOuId));
        return window.SolicitacoesVizin.obterTodas()
            .some(s => String(s.produtoId) === id && ESTADOS_LOCACAO_ATIVA.includes(s.status));
    }

    function temSolicitacaoPendente(objetoOuId) {
        if (typeof objetoOuId === "object" && objetoOuId !== null && objetoOuId.tem_solicitacao_pendente !== undefined) {
            return !!objetoOuId.tem_solicitacao_pendente;
        }
        if (!window.SolicitacoesVizin) return false;

        const id = String(idDe(objetoOuId));
        return window.SolicitacoesVizin.obterTodas()
            .some(s => String(s.produtoId) === id && s.status === "pendente");
    }

    window.ObjetosVizin = {
        obterTodos,
        obterPorId,
        obterDoCache,
        obterDoProprietario,
        criar,
        atualizar,
        excluir,
        marcarDisponibilidade,
        temLocacaoAtiva,
        temSolicitacaoPendente
    };
})();
