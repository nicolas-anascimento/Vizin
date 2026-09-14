// ================= AVALIAÇÕES VIZIN — MÓDULO COMPARTILHADO =================
// Guarda as avaliações de uma locação concluída. Cada lado (locatário e
// proprietário) pode avaliar o outro, de forma independente.
//
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Trocar o localStorage por uma tabela real (`avaliacoes`), com endpoints
// tipo:
//   POST /api/alugueis/:id/avaliacao   { nota, comentario }
//   GET  /api/alugueis/:id/avaliacoes
// O back-end também deve impedir uma segunda avaliação da mesma pessoa
// para o mesmo aluguel (aqui isso é checado só no front, via jaAvaliou).

const AvaliacoesVizin = (function () {
    const CHAVE = "vizin_avaliacoes";

    function lerTudo() {
        return JSON.parse(localStorage.getItem(CHAVE) || "{}");
    }

    function salvarTudo(dados) {
        localStorage.setItem(CHAVE, JSON.stringify(dados));
    }

    // Retorna { locatario: {nota, comentario, data} | null, proprietario: {...} | null }
    function obterAvaliacoes(aluguelId) {
        const tudo = lerTudo();
        return tudo[aluguelId] || { locatario: null, proprietario: null };
    }

    function jaAvaliou(aluguelId, papelAvaliador) {
        const avaliacoes = obterAvaliacoes(aluguelId);
        return !!avaliacoes[papelAvaliador];
    }

    // papelAvaliador = quem está avaliando ("locatario" ou "proprietario")
    function avaliar(aluguelId, papelAvaliador, nota, comentario) {
        const tudo = lerTudo();
        const atual = tudo[aluguelId] || { locatario: null, proprietario: null };

        atual[papelAvaliador] = {
            nota,
            comentario: comentario || "",
            data: new Date().toISOString()
        };

        tudo[aluguelId] = atual;
        salvarTudo(tudo);

        document.dispatchEvent(new CustomEvent("avaliacoesAtualizadas"));

        return atual;
    }

    // Retorna as avaliações RECEBIDAS por um usuário (identificado por email),
    // cruzando com SolicitacoesVizin pra descobrir em quais alugueis esse
    // usuário foi proprietário ou locatário — a nota sozinha não diz "de
    // quem", só a solicitação correspondente informa isso.
    //
    // Retorno: { media: number, total: number, lista: [{nota, comentario,
    // data, nomeAvaliador, emailAvaliador, produtoTitulo, aluguelId}, ...] }
    function obterAvaliacoesRecebidas(email) {
        if (!email || !window.SolicitacoesVizin) {
            return { media: 0, total: 0, lista: [] };
        }

        const todasSolicitacoes = window.SolicitacoesVizin.obterTodas();
        const tudo = lerTudo();
        const lista = [];

        todasSolicitacoes.forEach(s => {
            const avaliacoesDoAluguel = tudo[s.id];
            if (!avaliacoesDoAluguel) return;

            // Usuário foi PROPRIETÁRIO neste aluguel -> quem avalia ele é o locatário
            if (s.proprietarioEmail === email && avaliacoesDoAluguel.locatario) {
                lista.push({
                    ...avaliacoesDoAluguel.locatario,
                    nomeAvaliador: s.solicitanteNome,
                    emailAvaliador: s.solicitanteEmail,
                    produtoTitulo: s.produtoTitulo,
                    aluguelId: s.id
                });
            }

            // Usuário foi LOCATÁRIO neste aluguel -> quem avalia ele é o proprietário
            if (s.solicitanteEmail === email && avaliacoesDoAluguel.proprietario) {
                lista.push({
                    ...avaliacoesDoAluguel.proprietario,
                    nomeAvaliador: s.proprietarioNome,
                    emailAvaliador: s.proprietarioEmail,
                    produtoTitulo: s.produtoTitulo,
                    aluguelId: s.id
                });
            }
        });

        const total = lista.length;
        const media = total > 0
            ? lista.reduce((soma, av) => soma + av.nota, 0) / total
            : 0;

        return { media, total, lista };
    }

    // Retorna somente as avaliações que o usuário recebeu COMO LOCATÁRIO,
    // ou seja, as notas que os proprietários deram a ele depois de ele
    // alugar um objeto deles. NÃO inclui as avaliações que os locatários
    // dos objetos QUE ELE ANUNCIA deram pro objeto/experiência de aluguel
    // (essa é a reputação dele como proprietário/produto, tratada à parte
    // em obterAvaliacoesDoProduto) — as duas coisas não devem se misturar
    // no perfil, senão a nota mistura "bom locatário" com "bom produto".
    //
    // Retorno: { media: number, total: number, lista: [{nota, comentario,
    // data, nomeAvaliador, emailAvaliador, produtoTitulo, aluguelId}, ...] }
    function obterAvaliacoesRecebidasComoLocatario(email) {
        if (!email || !window.SolicitacoesVizin) {
            return { media: 0, total: 0, lista: [] };
        }
 
        const todasSolicitacoes = window.SolicitacoesVizin.obterTodas();
        const tudo = lerTudo();
        const lista = [];
 
        todasSolicitacoes.forEach(s => {
            if (s.solicitanteEmail !== email) return;
 
            const avaliacoesDoAluguel = tudo[s.id];
            if (!avaliacoesDoAluguel || !avaliacoesDoAluguel.proprietario) return;
 
            // avaliacoesDoAluguel.proprietario = nota que o PROPRIETÁRIO deu
            // pro locatário nesse aluguel — é isso que conta como "avaliação
            // recebida" de alguém que alugou como locatário.
            lista.push({
                ...avaliacoesDoAluguel.proprietario,
                nomeAvaliador: s.proprietarioNome,
                emailAvaliador: s.proprietarioEmail,
                produtoTitulo: s.produtoTitulo,
                aluguelId: s.id
            });
        });
 
        const total = lista.length;
        const media = total > 0
            ? lista.reduce((soma, av) => soma + av.nota, 0) / total
            : 0;
 
        return { media, total, lista };
    }
 
    // Retorna as avaliações que um PRODUTO recebeu (sempre dadas pelo
    // locatário, já que é ele quem avalia a experiência de uso do objeto).
    //
    // Retorno: { media: number, total: number, lista: [{nota, comentario,
    // data, nomeAvaliador, emailAvaliador, aluguelId}, ...] }
    function obterAvaliacoesDoProduto(produtoId) {
        if (!window.SolicitacoesVizin) {
            return { media: 0, total: 0, lista: [] };
        }

        const todasSolicitacoes = window.SolicitacoesVizin.obterTodas();
        const tudo = lerTudo();
        const lista = [];

        todasSolicitacoes
            .filter(s => String(s.produtoId) === String(produtoId))
            .forEach(s => {
                const avaliacoesDoAluguel = tudo[s.id];
                if (!avaliacoesDoAluguel || !avaliacoesDoAluguel.locatario) return;

                lista.push({
                    ...avaliacoesDoAluguel.locatario,
                    nomeAvaliador: s.solicitanteNome,
                    emailAvaliador: s.solicitanteEmail,
                    aluguelId: s.id
                });
            });

        const total = lista.length;
        const media = total > 0
            ? lista.reduce((soma, av) => soma + av.nota, 0) / total
            : 0;

        return { media, total, lista };
    }

    return {
        obterAvaliacoes,
        jaAvaliou,
        avaliar,
        obterAvaliacoesRecebidas,
        obterAvaliacoesRecebidasComoLocatario,
        obterAvaliacoesDoProduto
    };
})();

window.AvaliacoesVizin = AvaliacoesVizin;