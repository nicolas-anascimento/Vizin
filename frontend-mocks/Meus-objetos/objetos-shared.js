// ================= OBJETOS VIZIN — MÓDULO COMPARTILHADO =================
// Fonte única dos objetos cadastrados. Tanto "Meus Objetos" (gestão pelo
// dono) quanto "Produto" (visualização por quem quer alugar) leem e
// escrevem aqui, pra manter o campo `disponivel` sempre consistente entre
// as duas telas.
//
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Essa "tabela" no localStorage deve virar uma tabela de verdade no banco,
// com endpoints tipo:
//   GET    /api/objetos              -> listar (com filtro de disponibilidade)
//   GET    /api/objetos/:id          -> ler um
//   GET    /api/objetos?proprietarioId= -> listar do dono
//   POST   /api/objetos              -> criar
//   PATCH  /api/objetos/:id          -> editar (inclui disponibilidade)
//   DELETE /api/objetos/:id          -> excluir
 
(function () {
 
    const CHAVE_STORAGE = "objetos";
 
    function seedInicial() {
        if (localStorage.getItem(CHAVE_STORAGE)) return;
 
        const mock = [
            {
                id: 1,
                titulo: "Furadeira Profissional Bosch",
                descricao: "Furadeira de impacto profissional, ideal para trabalhos pesados. Inclui maleta e conjunto de brocas.",
                categoria: "Ferramentas",
                preco_dia: 35,
                disponivel: true,
                imagens: [
                    "https://picsum.photos/seed/furadeira1/600/450",
                    "https://picsum.photos/seed/furadeira2/600/450",
                    "https://picsum.photos/seed/furadeira3/600/450"
                ],
                localizacao: "Campinas, SP",
                proprietarioEmail: "maria@vizin.com",
                proprietarioNome: "Maria Santos"
            },
            {
                id: 2,
                titulo: "Câmera DSLR Canon EOS",
                descricao: "Câmera profissional perfeita para eventos e ensaios fotográficos. Lente 50mm incluída.",
                categoria: "Eletrônicos",
                preco_dia: 120,
                disponivel: true,
                imagens: [
                    "https://picsum.photos/seed/camera1/600/450",
                    "https://picsum.photos/seed/camera2/600/450"
                ],
                localizacao: "Campinas, SP",
                proprietarioEmail: "maria@vizin.com",
                proprietarioNome: "Maria Santos"
            }
        ];
 
        // `imagem` = primeira foto do array. Mantido por compatibilidade com
        // telas que ainda leem só `obj.imagem` (ex: Produto).
        mock.forEach(o => { o.imagem = o.imagens[0]; });
 
        localStorage.setItem(CHAVE_STORAGE, JSON.stringify(mock));
    }
 
    seedInicial();
 
    function obterTodos() {
        return JSON.parse(localStorage.getItem(CHAVE_STORAGE) || "[]");
    }
 
    function salvarTodos(lista) {
        localStorage.setItem(CHAVE_STORAGE, JSON.stringify(lista));
        document.dispatchEvent(new CustomEvent("objetosAtualizados"));
    }
 
    function obterPorId(id) {
        return obterTodos().find(o => String(o.id) === String(id)) || null;
    }
 
    function obterDoProprietario(proprietarioEmail) {
        return obterTodos().filter(o => o.proprietarioEmail === proprietarioEmail);
    }
 
    // Se vier `imagens` (array), garante que `imagem` (singular, usado pela
    // página de Produto e outras telas) fique sempre igual à primeira foto.
    function normalizarImagens(dados) {
        const copia = { ...dados };
        if (Array.isArray(copia.imagens) && copia.imagens.length > 0) {
            copia.imagem = copia.imagens[0];
        }
        return copia;
    }
 
    function criar(dados) {
        const lista = obterTodos();
        const novo = { id: Date.now(), disponivel: true, ...normalizarImagens(dados) };
        lista.unshift(novo);
        salvarTodos(lista);
        return novo;
    }
 
    function atualizar(id, dados) {
        const lista = obterTodos().map(o => String(o.id) === String(id) ? { ...o, ...normalizarImagens(dados) } : o);
        salvarTodos(lista);
        return obterPorId(id);
    }
 
    function excluir(id) {
        salvarTodos(obterTodos().filter(o => String(o.id) !== String(id)));
    }
 
    // Atalho pra ligar/desligar a disponibilidade — usado quando uma
    // solicitação é aprovada (indisponível) ou uma locação é concluída
    // (disponível de novo), e também pelo toggle manual do dono em
    // "Meus Objetos" / "Editar Objeto".
    function marcarDisponibilidade(id, disponivel) {
        return atualizar(id, { disponivel });
    }
 
    // ================= LOCAÇÃO ATIVA (TRAVA DE VERDADE) =================
    // `disponivel: false` sozinho NÃO diferencia "o dono pausou o anúncio"
    // de "o objeto está alugado agora". Essa função olha as solicitações de
    // verdade (solicitacoes-shared.js) e responde se existe uma locação
    // realmente em andamento pra esse objeto — é isso que deve travar o
    // toggle de disponibilidade e o botão de excluir, não o `disponivel` cru.
    //
    // Estados considerados "locação ativa" (ver histórico completo em
    // solicitacoes-shared.js / historico.js):
    //   aprovado -> pago -> retirado -> aguardando_devolucao
    // Fora desse intervalo (pendente, rejeitado, concluido) o objeto está
    // livre pra edição/exclusão/pausa manual.
    const ESTADOS_LOCACAO_ATIVA = ["aprovado", "pago", "retirado", "aguardando_devolucao"];
 
    function temLocacaoAtiva(id) {
        // Páginas que não carregam solicitacoes-shared.js (ex: Cadastrar
        // Objeto) não têm como travar nada — assume que não há locação ativa.
        if (!window.SolicitacoesVizin) return false;
 
        return window.SolicitacoesVizin.obterTodas()
            .some(s => String(s.produtoId) === String(id) && ESTADOS_LOCACAO_ATIVA.includes(s.status));
    }
 
    // Diferente de temLocacaoAtiva: aqui é sobre um pedido que AINDA não foi
    // respondido pelo dono. Não trava edição (o dono pode querer ajustar o
    // anúncio antes de responder), mas deve travar EXCLUSÃO — apagar o
    // objeto agora deixaria a solicitação pendente apontando pra um
    // produtoId inexistente, quebrando a tela de quem pediu.
    function temSolicitacaoPendente(id) {
        if (!window.SolicitacoesVizin) return false;
 
        return window.SolicitacoesVizin.obterTodas()
            .some(s => String(s.produtoId) === String(id) && s.status === "pendente");
    }
 
    window.ObjetosVizin = {
        obterTodos,
        obterPorId,
        obterDoProprietario,
        criar,
        atualizar,
        excluir,
        marcarDisponibilidade,
        temLocacaoAtiva,
        temSolicitacaoPendente
    };
 
})();
 