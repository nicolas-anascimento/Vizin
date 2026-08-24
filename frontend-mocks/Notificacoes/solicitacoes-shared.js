/* =====================================================
   Gerencia as SOLICITAÇÕES DE ALUGUEL em si (não confundir com as
   notificações). Enquanto notificacoes-shared.js guarda uma "caixa de
   entrada" por usuário, este arquivo guarda os PEDIDOS de aluguel numa
   tabela única — porque tanto quem pediu quanto o dono precisam enxergar
   e (no caso do dono) alterar o mesmo registro.

   PONTO DE INTEGRAÇÃO COM O BACK-END:
   Essa "tabela" no localStorage deve virar uma tabela de verdade no banco
   (ex: `solicitacoes`), com endpoints tipo:
     POST   /api/solicitacoes                 -> criar
     GET    /api/solicitacoes/:id              -> ler uma
     GET    /api/solicitacoes?proprietarioId=  -> listar do dono
     GET    /api/solicitacoes?solicitanteId=   -> listar de quem pediu
     PATCH  /api/solicitacoes/:id              -> mudar status (aprovar/rejeitar)

   Incluir este script em qualquer página que crie, aprove/rejeite ou
   acompanhe solicitações: a página do produto e a de notificações.
   ===================================================== */

(function () {

    const CHAVE_STORAGE = "solicitacoes";

    function obterTodas() {
        return JSON.parse(localStorage.getItem(CHAVE_STORAGE) || "[]");
    }

    function salvarTodas(lista) {
        localStorage.setItem(CHAVE_STORAGE, JSON.stringify(lista));
        document.dispatchEvent(new CustomEvent("solicitacoesAtualizadas"));
    }

    function obterPorId(id) {
        return obterTodas().find(s => s.id === id) || null;
    }

    function obterDoProprietario(proprietarioEmail) {
        return obterTodas().filter(s => s.proprietarioEmail === proprietarioEmail);
    }

    function obterDoSolicitante(solicitanteEmail) {
        return obterTodas().filter(s => s.solicitanteEmail === solicitanteEmail);
    }

    // dados = { produtoId, produtoTitulo, solicitanteEmail, solicitanteNome,
    //           proprietarioEmail, dataRetirada, dataDevolucao, dias, total }
    function criar(dados) {
        const lista = obterTodas();
        const nova = { id: Date.now(), status: "pendente", ...dados };
        lista.unshift(nova);
        salvarTodas(lista);
        return nova;
    }

    // status = "aprovado" | "rejeitado"
    function atualizarStatus(id, status) {
        const lista = obterTodas().map(s => s.id === id ? { ...s, status } : s);
        salvarTodas(lista);
        return obterPorId(id);
    }

    window.SolicitacoesVizin = {
        obterTodas,
        obterPorId,
        obterDoProprietario,
        obterDoSolicitante,
        criar,
        atualizarStatus
    };

})();