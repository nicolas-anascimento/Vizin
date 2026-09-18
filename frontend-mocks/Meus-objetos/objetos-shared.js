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

    // ================= PONTE CROSS-TAB =================
    // Mesmo problema (e mesma solução) já aplicada em solicitacoes-shared.js:
    // "objetosAtualizados" é um CustomEvent, só ouvido dentro do MESMO
    // document que o disparou — não avisa outras abas quando o objeto muda
    // por uma ação feita nelas (ex: editar o preço em Editar-objeto, ou
    // excluir em Meus Objetos, enquanto a página de Produto do mesmo objeto
    // está aberta em outra aba). O evento nativo "storage" resolve isso:
    // dispara nas OUTRAS abas quando a chave muda, então reemitimos o
    // CustomEvent local a partir dele — toda a reatividade que já existia
    // (meus-objetos.js, produto.js) passa a funcionar entre abas de graça,
    // sem precisar duplicar esse listener em cada página consumidora.
    // (meus-objetos.js já tinha seu próprio listener de "storage" pra isso —
    // com esta ponte central ele fica redundante, mas inofensivo.)
    window.addEventListener("storage", (e) => {
        if (e.key === CHAVE_STORAGE) {
            document.dispatchEvent(new CustomEvent("objetosAtualizados"));
        }
    });
 
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
 
    // `opcoes.ignorarBloqueio` existe pra quem PRECISA escrever exatamente
    // no instante em que o objeto entra/sai de locação — hoje só
    // marcarDisponibilidade() (chamada por solicitacoes-shared.js ao
    // aprovar um pedido, quando temLocacaoAtiva(id) já é true por
    // definição nesse exato momento). Qualquer outro chamador — acima de
    // tudo o form completo de Editar Objeto — passa por aqui sem esse
    // escape e sofre a mesma trava de corrida que excluir() já tem: sem
    // ela, uma solicitação podia ser aprovada (ou chegar uma pendente)
    // bem entre a tela carregar destravada e o dono clicar em "Salvar", e
    // a edição sobrescrevia preço/fotos/descrição de um objeto que virou
    // uma locação em andamento por baixo do editor — a mesma classe de
    // órfão/inconsistência que a trava em excluir() já evita do lado da
    // exclusão.
    function atualizar(id, dados, opcoes = {}) {
        const { ignorarBloqueio = false } = opcoes;

        if (!ignorarBloqueio) {
            if (temLocacaoAtiva(id)) {
                throw new Error("OBJETO_EM_LOCACAO");
            }
            if (temSolicitacaoPendente(id)) {
                throw new Error("OBJETO_COM_SOLICITACAO_PENDENTE");
            }
        }

        const lista = obterTodos().map(o => String(o.id) === String(id) ? { ...o, ...normalizarImagens(dados) } : o);
        salvarTodos(lista);
        return obterPorId(id);
    }
 
    // A UI (meus-objetos.js) já verifica temLocacaoAtiva/temSolicitacaoPendente
    // antes de sequer abrir o modal de confirmação — mas isso só checa o
    // estado no momento em que o modal ABRE. Entre abrir o modal e a pessoa
    // clicar em "Excluir" pode passar tempo suficiente pra uma solicitação
    // nova chegar ou uma pendente ser aprovada em outra aba, e sem checar de
    // novo AQUI (na função que de fato apaga o dado), a exclusão passava
    // batido — apagando um objeto que virou uma locação ativa e deixando
    // essa locação órfã, apontando pra um produtoId inexistente. Lançar
    // erro aqui, na fonte da verdade, protege qualquer chamador (não só o
    // modal atual, mas qualquer tela futura que venha a chamar excluir()
    // direto) — mesmo padrão de validação na fonte já usado em
    // solicitacoes-shared.js (criar/responder).
    function excluir(id) {
        if (temLocacaoAtiva(id)) {
            throw new Error("OBJETO_EM_LOCACAO");
        }
        if (temSolicitacaoPendente(id)) {
            throw new Error("OBJETO_COM_SOLICITACAO_PENDENTE");
        }
        salvarTodos(obterTodos().filter(o => String(o.id) !== String(id)));
    }
 
    // Atalho pra ligar/desligar a disponibilidade — usado quando uma
    // solicitação é aprovada (indisponível) ou uma locação é concluída
    // (disponível de novo), e também pelo toggle manual do dono em
    // "Meus Objetos" / "Editar Objeto".
    function marcarDisponibilidade(id, disponivel) {
        // ignorarBloqueio: true — este é o próprio mecanismo que FAZ a
        // transição de/para locação ativa (aprovar um pedido chama isso
        // com o status já "aprovado" em disco, ou seja, temLocacaoAtiva(id)
        // já é true neste exato instante). Bloquear aqui travaria a
        // aprovação de qualquer solicitação. O toggle manual do dono em
        // "Meus Objetos" também passa por aqui e continua protegido do
        // jeito de sempre: o próprio switch fica disabled na UI quando
        // temLocacaoAtiva(id).
        return atualizar(id, { disponivel }, { ignorarBloqueio: true });
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
 