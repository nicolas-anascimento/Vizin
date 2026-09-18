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

    // ================= PONTE CROSS-TAB =================
    // "solicitacoesAtualizadas" é um CustomEvent — só é ouvido dentro do
    // MESMO document que o disparou. Isso é suficiente pra reações dentro
    // da própria aba (ex: o polling de verificarPrazos/verificarSolicitacoesPendentes,
    // que roda em qualquer aba que tenha este script carregado), mas NÃO
    // avisa outras abas/janelas quando uma solicitação muda por uma ação
    // explícita nelas — ex: o dono aprova um pedido na aba do Histórico
    // enquanto o locatário está com a página de Produto aberta em outra
    // aba. O locatário só ficaria sabendo ao recarregar a página.
    // O evento nativo "storage", por outro lado, SÓ dispara nas OUTRAS
    // abas do mesmo site (nunca na aba que fez a alteração) — por isso
    // usamos os dois em conjunto: reemitimos "solicitacoesAtualizadas"
    // localmente sempre que a chave "solicitacoes" mudar vinda de fora,
    // fazendo toda a reatividade que já existia (historico.js, notificacoes.js
    // e agora produto.js) funcionar também entre abas, sem precisar mudar
    // nenhum desses outros arquivos.
    window.addEventListener("storage", (e) => {
        if (e.key === CHAVE_STORAGE) {
            document.dispatchEvent(new CustomEvent("solicitacoesAtualizadas"));
        }
    });

    function obterPorId(id) {
        return obterTodas().find(s => s.id === id) || null;
    }

    // ================= LIMPAR NOTIFICAÇÃO "solicitacao_aluguel" =================
    // Sempre que uma solicitação SAI do estado "pendente" (aprovada,
    // rejeitada, cancelada ou expirada automaticamente), a notificação
    // original de "Nova solicitação de aluguel" que o proprietário recebeu
    // deixa de fazer sentido — o card em notificacoes.js já troca o link
    // "Ver solicitação" por "Marcar como lida" nesse caso, mas se ninguém
    // clicar manualmente ela fica acumulada pra sempre em "Não lidas".
    // Por isso marcamos ela como lida automaticamente aqui, assim que a
    // decisão é tomada (por qualquer caminho: aprovar/rejeitar, cancelar ou
    // expiração automática de prazo).
    function limparNotificacaoSolicitacaoPendente(solicitacao) {
        if (!solicitacao || !window.NotificacoesVizin) return;

        const notificacoesDoDono = window.NotificacoesVizin.obterTodas(solicitacao.proprietarioEmail);
        const alvo = notificacoesDoDono.find(n =>
            n.tipo === "solicitacao_aluguel" && n.solicitacaoId === solicitacao.id && !n.lida
        );

        if (alvo) {
            window.NotificacoesVizin.marcarComoLida(alvo.id, solicitacao.proprietarioEmail);
        }
    }

    function obterDoProprietario(proprietarioEmail) {
        return obterTodas().filter(s => s.proprietarioEmail === proprietarioEmail);
    }

    function obterDoSolicitante(solicitanteEmail) {
        return obterTodas().filter(s => s.solicitanteEmail === solicitanteEmail);
    }

    // dados = { produtoId, produtoTitulo, solicitanteEmail, solicitanteNome,
    //           proprietarioEmail, dataRetirada, dataDevolucao, dias, total }
    //
    // Lança um erro (em vez de simplesmente recusar em silêncio) se o
    // solicitante estiver com uma devolução em atraso em outra locação —
    // ver estaBloqueadoPorAtraso mais abaixo. Quem chama (produto.js) já
    // trata isso com um try/catch e mostra a mensagem certa pro usuário.
    //
    // Também barra um segundo pedido "pendente" do MESMO solicitante pro
    // MESMO objeto — sem isso, abrir a página de Produto em duas abas (ou
    // clicar duas vezes rápido antes do botão desabilitar) gerava duas
    // solicitações pendentes idênticas, e só a mais recente ficava visível
    // pro locatário acompanhar (ver "maisRecente" em produto.js), deixando
    // a outra órfã, pendente pra sempre do ponto de vista do dono.
    function criar(dados) {
        if (estaBloqueadoPorAtraso(dados.solicitanteEmail)) {
            throw new Error("BLOQUEADO_POR_ATRASO");
        }

        const jaTemPendente = obterTodas().some(s =>
            s.produtoId === dados.produtoId &&
            s.solicitanteEmail === dados.solicitanteEmail &&
            s.status === "pendente"
        );
        if (jaTemPendente) {
            throw new Error("PEDIDO_JA_PENDENTE");
        }

        const lista = obterTodas();
        const nova = { id: Date.now(), status: "pendente", ...dados };
        lista.unshift(nova);
        salvarTodas(lista);
        return nova;
    }

    // status = "aprovado" | "rejeitado"
    // extras: campos adicionais opcionais pra registrar junto (ex: motivo
    // de uma rejeição automática do sistema).
    function atualizarStatus(id, status, extras = {}) {
        const lista = obterTodas().map(s => s.id === id ? { ...s, status, ...extras } : s);
        salvarTodas(lista);
        return obterPorId(id);
    }

    // ================= APROVAR/RECUSAR (compartilhado) =================
    // Antes essa lógica vivia só em notificacoes.js (o dono só podia decidir
    // pela tela de Notificações). Agora que a decisão também acontece na
    // aba "Solicitações" do Histórico, ela mora aqui — a única entidade que
    // conhece de verdade uma solicitação — pra não duplicar a regra de
    // negócio nos dois lugares.
    //
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // PATCH /api/solicitacoes/:id { status: "aprovado" | "rejeitado" }
    function responder(id, novoStatus) {
        // Dono com uma devolução em atraso em outra locação (como
        // locatário) não pode aprovar novos pedidos nos próprios objetos —
        // só recusar continua liberado, já que isso não "aluga pra
        // outros", só encerra o pedido.
        if (novoStatus === "aprovado") {
            const pendente = obterPorId(id);
            if (pendente && estaBloqueadoPorAtraso(pendente.proprietarioEmail)) {
                console.warn("Não é possível aprovar: você tem uma devolução em atraso em outra locação.");
                return null;
            }
        }

        const solicitacao = atualizarStatus(id, novoStatus);
        if (!solicitacao) return null;

        // A solicitação saiu de "pendente" — a notificação original de
        // "Nova solicitação de aluguel" pro proprietário pode ser arquivada.
        limparNotificacaoSolicitacaoPendente(solicitacao);

        // Ao aprovar, o objeto fica reservado (indisponível) pra ninguém
        // mais conseguir solicitar enquanto essa locação estiver em andamento.
        if (novoStatus === "aprovado" && window.ObjetosVizin) {
            window.ObjetosVizin.marcarDisponibilidade(solicitacao.produtoId, false);
        }

        // Avisa quem fez o pedido.
        if (window.NotificacoesVizin) {
            window.NotificacoesVizin.adicionarNotificacao(
                {
                    tipo: novoStatus === "aprovado" ? "aluguel_aprovado" : "aluguel_rejeitado",
                    titulo: novoStatus === "aprovado" ? "Solicitação aprovada!" : "Solicitação recusada",
                    descricao: novoStatus === "aprovado"
                        ? `Seu pedido de aluguel de "${solicitacao.produtoTitulo}" foi aprovado.`
                        : `Seu pedido de aluguel de "${solicitacao.produtoTitulo}" foi recusado.`,
                    data: new Date().toLocaleDateString("pt-BR"),
                    solicitacaoId: solicitacao.id
                },
                solicitacao.solicitanteEmail
            );
        }

        // Ao aprovar UM pedido, qualquer OUTRO pedido ainda "pendente" pro
        // mesmo objeto (de outros interessados que pediram no mesmo período
        // de indecisão do dono) deixa de fazer sentido: o objeto já foi pra
        // outra pessoa. Sem isso, esses outros pedidos ficavam pendentes
        // pra sempre — o solicitante ficava preso no card "Aguardando
        // aprovação" (o polling em produto.js nunca resolvia) e o dono
        // ainda via um botão "Aprovar" ativo pra um objeto que ele já
        // alugou, podendo aprovar os dois por engano (double-booking).
        if (novoStatus === "aprovado") {
            rejeitarPendentesConcorrentes(solicitacao);
        }

        return solicitacao;
    }

    function rejeitarPendentesConcorrentes(solicitacaoAprovada) {
        const concorrentes = obterTodas().filter(s =>
            s.produtoId === solicitacaoAprovada.produtoId &&
            s.status === "pendente" &&
            s.id !== solicitacaoAprovada.id
        );

        concorrentes.forEach(s => {
            atualizarStatus(s.id, "rejeitado", { canceladoPor: "sistema", motivoRejeicao: "objeto_alugado_para_outro" });
            limparNotificacaoSolicitacaoPendente({ ...s, status: "rejeitado" });

            if (window.NotificacoesVizin) {
                window.NotificacoesVizin.adicionarNotificacao(
                    {
                        tipo: "aluguel_rejeitado",
                        titulo: "Solicitação recusada",
                        descricao: `"${s.produtoTitulo}" foi alugado para outra pessoa antes que seu pedido fosse respondido.`,
                        data: new Date().toLocaleDateString("pt-BR"),
                        solicitacaoId: s.id
                    },
                    s.solicitanteEmail
                );
            }
        });
    }

    // Quantas solicitações estão aguardando decisão de um proprietário —
    // usado pra popular o número em cima do ícone de Histórico no menu.
    function contarPendentesComoProprietario(proprietarioEmail) {
        return obterTodas().filter(s => s.proprietarioEmail === proprietarioEmail && s.status === "pendente").length;
    }

    // ================= CANCELAR (locatário OU proprietário podem cancelar) =================
    // Só é permitido cancelar a locação ANTES da retirada — enquanto ela
    // está "pendente" (aguardando aprovação), "aprovado" (aguardando
    // pagamento) ou "pago" (aguardando retirada). A partir do momento em
    // que a retirada é confirmada (status "retirado" em diante), o aluguel
    // já está em andamento de verdade e não é mais cancelável por aqui.
    //
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // PATCH /api/solicitacoes/:id { status: "cancelado" }
    // Se já havia pagamento, o back-end também deve disparar o estorno de
    // verdade junto ao gateway de pagamento (ex: POST /api/pagamentos/:id/estornar) —
    // aqui só marcamos "pagamentoEstornado" pra refletir isso na tela.
    const STATUS_CANCELAVEIS = new Set(["pendente", "aprovado", "pago"]);

    function podeCancelar(id) {
        const s = obterPorId(id);
        return !!s && STATUS_CANCELAVEIS.has(s.status);
    }

    function cancelar(id, canceladoPorEmail) {
        const solicitacao = obterPorId(id);
        if (!solicitacao || !STATUS_CANCELAVEIS.has(solicitacao.status)) return null;

        const houvePagamento = solicitacao.status === "pago";

        const lista = obterTodas().map(s => s.id === id
            ? { ...s, status: "cancelado", canceladoPor: canceladoPorEmail, pagamentoEstornado: houvePagamento }
            : s);
        salvarTodas(lista);

        // Se a solicitação ainda estava "pendente" quando foi cancelada, a
        // notificação original de "Nova solicitação de aluguel" também
        // deixa de fazer sentido.
        limparNotificacaoSolicitacaoPendente(solicitacao);

        // O objeto volta a ficar disponível pra outras pessoas solicitarem.
        // Chamar isso sempre é seguro mesmo se ele nunca tivesse sido
        // marcado indisponível (caso "pendente", em que ninguém tinha
        // reservado o objeto ainda).
        if (window.ObjetosVizin) {
            window.ObjetosVizin.marcarDisponibilidade(solicitacao.produtoId, true);
        }

        // Avisa a OUTRA parte (quem não foi quem cancelou).
        if (window.NotificacoesVizin) {
            const souSolicitante = canceladoPorEmail === solicitacao.solicitanteEmail;
            const destinatario = souSolicitante ? solicitacao.proprietarioEmail : solicitacao.solicitanteEmail;
            const quemCancelou = souSolicitante
                ? (solicitacao.solicitanteNome || "O locatário")
                : (solicitacao.proprietarioNome || "O proprietário");

            window.NotificacoesVizin.adicionarNotificacao(
                {
                    tipo: "aluguel_cancelado",
                    titulo: "Locação cancelada",
                    descricao: houvePagamento
                        ? `${quemCancelou} cancelou o aluguel de "${solicitacao.produtoTitulo}". O valor pago foi estornado.`
                        : `${quemCancelou} cancelou o pedido de aluguel de "${solicitacao.produtoTitulo}".`,
                    data: new Date().toLocaleDateString("pt-BR"),
                    solicitacaoId: solicitacao.id
                },
                destinatario
            );
        }

        return obterPorId(id);
    }

    // ================= LEMBRETES DE RETIRADA/DEVOLUÇÃO =================
    // Manda uma notificação de lembrete pro LOCATÁRIO e pro PROPRIETÁRIO,
    // tanto no dia ANTERIOR quanto no dia da retirada e no dia anterior e no
    // dia da devolução. Roda em polling (mesmo padrão do atualizarBadge em
    // notificacoes-shared.js), então guardamos no localStorage quais
    // lembretes já foram disparados pra não mandar o mesmo aviso de novo a
    // cada verificação/recarregamento de página.
    //
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // Isso deve virar um job agendado no servidor (cron/worker) que roda uma
    // vez por dia e cria as notificações via um serviço interno — não faz
    // sentido depender do navegador da pessoa estar aberto pra disparar
    // lembretes. O controle de "já enviado" também deve morar no banco
    // (ex: coluna `lembrete_retirada_antes_enviado_em` na tabela de
    // solicitações) em vez de uma lista solta no localStorage.
    const CHAVE_LEMBRETES_ENVIADOS = "vizin_lembretes_enviados";

    function obterLembretesEnviados() {
        return JSON.parse(localStorage.getItem(CHAVE_LEMBRETES_ENVIADOS) || "[]");
    }

    function jaEnviouLembrete(chave) {
        return obterLembretesEnviados().includes(chave);
    }

    function marcarLembreteEnviado(chave) {
        const lista = obterLembretesEnviados();
        if (!lista.includes(chave)) {
            lista.push(chave);
            localStorage.setItem(CHAVE_LEMBRETES_ENVIADOS, JSON.stringify(lista));
        }
    }

    // dataRetirada/dataDevolucao são salvas direto do valor de um
    // <input type="date"> (ver produto.js), então chegam aqui como string
    // "aaaa-mm-dd" (ISO), não "dd/mm/aaaa". Fazemos o parse manualmente (em
    // vez de `new Date("aaaa-mm-dd")`) porque esse construtor interpreta a
    // string como UTC-meia-noite — em fusos horários atrás de UTC (como o
    // Brasil) isso "puxa" a data um dia pra trás na comparação local, o que
    // faria os lembretes dispararem no dia errado.
    function parseDataISO(dataStr) {
        if (!dataStr) return null;
        const partes = dataStr.split("-").map(Number);
        if (partes.length !== 3 || partes.some(Number.isNaN)) return null;
        const [ano, mes, dia] = partes;
        return new Date(ano, mes - 1, dia);
    }

    // ================= MULTA POR ATRASO NA DEVOLUÇÃO =================
    // R$ 2,00 por dia de atraso, sempre a partir de solicitacao.dataDevolucao.
    // A plataforma retém 10% desse valor (custo de operação/mediação); os
    // outros 90% são repassados ao proprietário, como compensação por ficar
    // sem o objeto além do combinado.
    //
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // O valor e o percentual devem virar configuração no servidor (não
    // hardcoded no front), e a cobrança de verdade (débito no locatário +
    // repasse ao proprietário) deve acontecer via gateway de pagamento,
    // não só como um número guardado no registro da solicitação.
    const MULTA_POR_DIA_ATRASO = 2; // R$
    const PERCENTUAL_PLATAFORMA_MULTA = 0.10; // 10% pra a plataforma, 90% pro proprietário

    function formatarReal(valor) {
        return `R$ ${valor.toFixed(2).replace(".", ",")}`;
    }

    // dataReferencia = até quando contar o atraso (por padrão, hoje). No
    // momento em que a devolução é de fato confirmada, quem chama passa a
    // data da confirmação, pra "congelar" o valor — depois de devolvido, o
    // atraso não pode continuar contando.
    function calcularDiasAtraso(solicitacao, dataReferencia = new Date()) {
        if (!solicitacao || !solicitacao.dataDevolucao) return 0;

        const dataDevolucao = parseDataISO(solicitacao.dataDevolucao);
        if (!dataDevolucao) return 0;

        const ref = new Date(dataReferencia);
        ref.setHours(0, 0, 0, 0);

        const diffDias = Math.round((ref - dataDevolucao) / (1000 * 60 * 60 * 24));
        return diffDias > 0 ? diffDias : 0;
    }

    // Retorna { diasAtraso, valorTotal, valorPlataforma, valorProprietario }
    // (valores em número, já arredondados em 2 casas — usar formatarReal
    // pra exibir).
    function calcularMulta(solicitacao, dataReferencia = new Date()) {
        const diasAtraso = calcularDiasAtraso(solicitacao, dataReferencia);
        const valorTotal = Number((diasAtraso * MULTA_POR_DIA_ATRASO).toFixed(2));
        const valorPlataforma = Number((valorTotal * PERCENTUAL_PLATAFORMA_MULTA).toFixed(2));
        const valorProprietario = Number((valorTotal - valorPlataforma).toFixed(2));

        return { diasAtraso, valorTotal, valorPlataforma, valorProprietario };
    }

    function mesmoDia(a, b) {
        return a.getFullYear() === b.getFullYear()
            && a.getMonth() === b.getMonth()
            && a.getDate() === b.getDate();
    }

    // `avisoMultaLocatario` (opcional) é um texto extra, mostrado só pro
    // LOCATÁRIO, avisando do risco de multa antes do prazo vencer — usado no
    // lembrete de devolução do dia anterior (ver verificarLembretes abaixo).
    // A ideia é reduzir o atraso proativamente, avisando ENQUANTO ainda dá
    // tempo de evitar a multa, em vez de só cobrar depois que ela já
    // aconteceu (ver avisarDevolucaoAtrasada, que dispara só depois do
    // prazo já ter passado).
    function enviarLembrete(solicitacao, chaveBase, tituloEvento, quandoTexto, avisoMultaLocatario) {
        if (!window.NotificacoesVizin) return;

        const descricao = `${tituloEvento} de "${solicitacao.produtoTitulo}" está marcada para ${quandoTexto}.`;

        if (solicitacao.proprietarioEmail) {
            window.NotificacoesVizin.adicionarNotificacao(
                {
                    tipo: "lembrete",
                    titulo: `Lembrete de ${tituloEvento}`,
                    descricao,
                    data: new Date().toLocaleDateString("pt-BR"),
                    solicitacaoId: solicitacao.id
                },
                solicitacao.proprietarioEmail
            );
        }

        if (solicitacao.solicitanteEmail) {
            window.NotificacoesVizin.adicionarNotificacao(
                {
                    tipo: "lembrete",
                    titulo: `Lembrete de ${tituloEvento}`,
                    descricao: descricao + (avisoMultaLocatario || ""),
                    data: new Date().toLocaleDateString("pt-BR"),
                    solicitacaoId: solicitacao.id
                },
                solicitacao.solicitanteEmail
            );
        }

        marcarLembreteEnviado(chaveBase);
    }

    function verificarLembretes() {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const amanha = new Date(hoje);
        amanha.setDate(amanha.getDate() + 1);

        obterTodas().forEach(solicitacao => {

            // Retirada: só faz sentido enquanto o aluguel está pago e
            // aguardando a retirada (antes disso não tem retirada agendada
            // de verdade; depois disso ela já foi feita).
            if (solicitacao.status === "pago" && solicitacao.dataRetirada) {
                const dataRetirada = parseDataISO(solicitacao.dataRetirada);
                if (dataRetirada) {
                    const chaveAntes = `${solicitacao.id}_retirada_antes`;
                    const chaveDia = `${solicitacao.id}_retirada_dia`;

                    if (mesmoDia(dataRetirada, amanha) && !jaEnviouLembrete(chaveAntes)) {
                        enviarLembrete(solicitacao, chaveAntes, "Retirada", `amanhã (${solicitacao.dataRetirada})`);
                    } else if (mesmoDia(dataRetirada, hoje) && !jaEnviouLembrete(chaveDia)) {
                        enviarLembrete(solicitacao, chaveDia, "Retirada", `hoje (${solicitacao.dataRetirada})`);
                    }
                }
            }

            // Devolução: só faz sentido enquanto o objeto já foi retirado e
            // o aluguel está em andamento (aguardando devolução).
            if (solicitacao.status === "retirado" && solicitacao.dataDevolucao) {
                const dataDevolucao = parseDataISO(solicitacao.dataDevolucao);
                if (dataDevolucao) {
                    const chaveAntes = `${solicitacao.id}_devolucao_antes`;
                    const chaveDia = `${solicitacao.id}_devolucao_dia`;

                    // No aviso do dia ANTERIOR, avisa também do risco de
                    // multa — é o momento em que ainda dá pra evitar o
                    // atraso, então vale mostrar o valor por dia pra deixar
                    // o custo concreto (não só "não esqueça").
                    const avisoMulta = ` Devolva até lá para evitar multa de ${formatarReal(MULTA_POR_DIA_ATRASO)} por dia de atraso.`;

                    if (mesmoDia(dataDevolucao, amanha) && !jaEnviouLembrete(chaveAntes)) {
                        enviarLembrete(solicitacao, chaveAntes, "Devolução", `amanhã (${solicitacao.dataDevolucao})`, avisoMulta);
                    } else if (mesmoDia(dataDevolucao, hoje) && !jaEnviouLembrete(chaveDia)) {
                        enviarLembrete(solicitacao, chaveDia, "Devolução", `hoje (${solicitacao.dataDevolucao})`, ` Devolva hoje para evitar multa de ${formatarReal(MULTA_POR_DIA_ATRASO)} por dia de atraso.`);
                    }
                }
            }
        });
    }

    // Roda assim que o script carrega (cobre quem abre a página já no dia
    // certo) e depois verifica periodicamente — cobre o caso de deixar a
    // aba aberta e o dia virar, sem precisar recarregar a página. Mesmo
    // padrão leve de setInterval já usado em notificacoes-shared.js.
    verificarLembretes();
    setInterval(verificarLembretes, 60 * 1000);

    // ================= RETIRADA NÃO REALIZADA → CANCELAMENTO AUTOMÁTICO =================
    // ================= DEVOLUÇÃO ATRASADA → RESTRIÇÃO NA CONTA DO LOCATÁRIO =================
    //
    // Regras pedidas:
    //  1) Se o objeto não for retirado até a data combinada, a locação é
    //     cancelada automaticamente: o valor pago é estornado e o objeto
    //     volta a ficar disponível — igual ao cancelamento manual, só que
    //     feito pelo "sistema" em vez de por uma das partes.
    //  2) Se o objeto não for devolvido até a data combinada, a locação em
    //     si NÃO é mexida (ela segue seu fluxo normal até o fim, pra não
    //     prejudicar o proprietário que está esperando o objeto de volta) —
    //     mas o LOCATÁRIO fica impedido de (a) solicitar novos aluguéis e
    //     (b) aprovar solicitações em objetos que ele mesmo alugue pra
    //     outros, até devolver o que está em atraso. Assim que a devolução
    //     acontecer (status vira "concluido"), a restrição desaparece
    //     sozinha.
    //
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // Isso deveria ser um job agendado no servidor (mesmo comentário do
    // bloco de lembretes acima) — que cancela/estorna direto no banco e
    // grava a restrição num campo tipo `usuarios.bloqueado_por_atraso`, em
    // vez de ser recalculada no cliente a cada checagem como é feito aqui.

    // Registro de quais avisos de "devolução atrasada" já foram mandados,
    // pro mesmo motivo do CHAVE_LEMBRETES_ENVIADOS acima: sem isso, o aviso
    // repetiria a cada 60s enquanto o atraso durasse.
    const CHAVE_AVISOS_ATRASO = "vizin_avisos_atraso_devolucao";

    function obterAvisosAtrasoEnviados() {
        return JSON.parse(localStorage.getItem(CHAVE_AVISOS_ATRASO) || "[]");
    }

    function jaAvisouAtraso(chave) {
        return obterAvisosAtrasoEnviados().includes(chave);
    }

    function marcarAvisoAtrasoEnviado(chave) {
        const lista = obterAvisosAtrasoEnviados();
        if (!lista.includes(chave)) {
            lista.push(chave);
            localStorage.setItem(CHAVE_AVISOS_ATRASO, JSON.stringify(lista));
        }
    }

    // Calculado na hora, não é um campo salvo: um e-mail está "bloqueado"
    // por um de DOIS motivos possíveis — ver detalhesBloqueio logo abaixo,
    // que é a fonte de verdade. Mantido como função separada (retornando só
    // true/false) porque é assim que o resto do código já consome isso
    // (criar/responder acima, produto.js, historico.js) — trocar pra
    // detalhesBloqueio exigiria mudar todos esses chamadores sem ganho real
    // pra eles, que só precisam saber "pode ou não pode".
    function estaBloqueadoPorAtraso(email) {
        return !!detalhesBloqueio(email);
    }

    // Retorna { motivo, solicitacao } explicando POR QUE um e-mail está
    // bloqueado de solicitar novos aluguéis / aprovar locações nos próprios
    // objetos, ou null se não houver bloqueio nenhum. A restrição em si é a
    // MESMA nos dois casos (ver "leve" vs "duro" no comentário de
    // criar/responder acima — a distinção é sobre QUAL ação cada papel tem
    // barrada, não sobre o motivo do bloqueio), mas o motivo muda o que faz
    // sentido mostrar na tela:
    //
    //   "devolucao_pendente" -> a pessoa ainda está com o objeto de outra
    //                           locação e o prazo de devolução já passou.
    //                           Some sozinho assim que ela devolver (ver
    //                           sincronizarStatusComProcessos em historico.js).
    //
    //   "multa_pendente"     -> a pessoa já devolveu o objeto, mas ficou
    //                           devendo uma multa por atraso que ainda não
    //                           foi paga. Diferente do motivo acima, este
    //                           NÃO desaparece sozinho — só some quando a
    //                           multa é paga (pagarMulta). É essa checagem
    //                           que torna o pagamento da multa obrigatório
    //                           pra voltar a alugar, e não só "a devolução
    //                           em si".
    function detalhesBloqueio(email) {
        if (!email) return null;

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        const emDevolucao = obterTodas().find(s => {
            if (s.solicitanteEmail !== email) return false;
            if (s.status !== "retirado" && s.status !== "aguardando_devolucao") return false;

            const dataDevolucao = parseDataISO(s.dataDevolucao);
            return !!dataDevolucao && dataDevolucao < hoje;
        });
        if (emDevolucao) return { motivo: "devolucao_pendente", solicitacao: emDevolucao };

        const comMultaPendente = obterTodas().find(s =>
            s.solicitanteEmail === email &&
            s.status === "concluido" &&
            s.multaAtraso && s.multaAtraso.diasAtraso > 0 &&
            s.multaStatus === "pendente"
        );
        if (comMultaPendente) return { motivo: "multa_pendente", solicitacao: comMultaPendente };

        return null;
    }

    // ================= PAGAMENTO DA MULTA =================
    // A multa fica registrada em `solicitacao.multaAtraso` — valor já
    // CONGELADO no momento em que a devolução é confirmada (ver
    // finalizarDevolucao em devolucao-objeto.js), e nunca recalculado depois
    // disso, pra não "crescer" enquanto o pagamento está em processamento.
    // O ciclo de vida dela é controlado por `solicitacao.multaStatus`:
    //   "pendente"    -> existe multa e ela ainda não foi paga (é esse
    //                    estado que aciona detalhesBloqueio acima).
    //   "paga"        -> o locatário já quitou o valor.
    // Locações sem atraso na devolução nunca ganham `multaStatus`.
    //
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // POST /api/multas/:solicitacaoId/pagar, disparado pela página de
    // Pagamento-multa (mesmo padrão de Finalizar-pagamento) — dispara a
    // cobrança de verdade no gateway de pagamento.
    function pagarMulta(id) {
        const solicitacao = obterPorId(id);
        if (!solicitacao || !solicitacao.multaAtraso || solicitacao.multaAtraso.diasAtraso <= 0) return solicitacao;
        if (solicitacao.multaStatus === "paga") return solicitacao;

        const lista = obterTodas().map(s => s.id === id
            ? { ...s, multaStatus: "paga", multaPagaEm: new Date().toISOString() }
            : s);
        salvarTodas(lista);

        if (window.NotificacoesVizin) {
            window.NotificacoesVizin.adicionarNotificacao(
                {
                    tipo: "multa_paga",
                    titulo: "Multa paga",
                    descricao: `A multa de ${formatarReal(solicitacao.multaAtraso.valorTotal)} referente à devolução de "${solicitacao.produtoTitulo}" foi paga. Sua conta já está liberada para novas locações.`,
                    data: new Date().toLocaleDateString("pt-BR"),
                    solicitacaoId: id
                },
                solicitacao.solicitanteEmail
            );

            window.NotificacoesVizin.adicionarNotificacao(
                {
                    tipo: "multa_paga",
                    titulo: "Multa recebida",
                    descricao: `${solicitacao.solicitanteNome || "O locatário"} pagou a multa por atraso de "${solicitacao.produtoTitulo}". Você vai receber ${formatarReal(solicitacao.multaAtraso.valorProprietario)}.`,
                    data: new Date().toLocaleDateString("pt-BR"),
                    solicitacaoId: id
                },
                solicitacao.proprietarioEmail
            );
        }

        return obterPorId(id);
    }

    // `relato` é o objeto retornado por DisputasVizin.abrirRelato (opcional,
    // só pra guardar a referência de qual relato suspendeu esta cobrança).
    function contestarMulta(id, relato) {
        const solicitacao = obterPorId(id);
        if (!solicitacao || !solicitacao.multaAtraso || solicitacao.multaAtraso.diasAtraso <= 0) return solicitacao;
        if (solicitacao.multaStatus === "paga") return solicitacao;

        const lista = obterTodas().map(s => s.id === id
            ? { ...s, multaStatus: "contestada", multaContestadaEm: new Date().toISOString(), multaRelatoId: relato?.id || null }
            : s);
        salvarTodas(lista);

        if (window.NotificacoesVizin) {
            window.NotificacoesVizin.adicionarNotificacao(
                {
                    tipo: "multa_contestada",
                    titulo: "Multa contestada",
                    descricao: `${solicitacao.solicitanteNome || "O locatário"} contestou a multa de ${formatarReal(solicitacao.multaAtraso.valorTotal)} da devolução de "${solicitacao.produtoTitulo}". A cobrança fica suspensa até o Suporte analisar.`,
                    data: new Date().toLocaleDateString("pt-BR"),
                    solicitacaoId: id
                },
                solicitacao.proprietarioEmail
            );
        }

        return obterPorId(id);
    }

    // Lista as locações concluídas em que este e-mail é o LOCATÁRIO e ainda
    // tem multa pendente de pagamento (não conta as já pagas nem as
    // contestadas) — usado pra montar avisos/comprovantes agregados.
    function obterMultasPendentes(email) {
        if (!email) return [];
        return obterTodas().filter(s =>
            s.solicitanteEmail === email &&
            s.status === "concluido" &&
            s.multaAtraso && s.multaAtraso.diasAtraso > 0 &&
            s.multaStatus === "pendente"
        );
    }

    // Se a solicitação está "aprovada" mas o pagamento nunca foi feito até a
    // data de retirada combinada, cancelamos automaticamente e liberamos o
    // objeto — igual ao cancelamento por retirada não realizada, só que sem
    // "pagamentoEstornado" (nada chegou a ser pago).
    //
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // Igual ao comentário de cancelarPorRetiradaNaoRealizada — isso deveria
    // ser um job agendado no servidor, não recalculado no cliente.
    function cancelarPorPagamentoNaoRealizado(solicitacao) {
        const lista = obterTodas().map(s => s.id === solicitacao.id
            ? { ...s, status: "cancelado", canceladoPor: "sistema", pagamentoEstornado: false }
            : s);
        salvarTodas(lista);
 
        // O objeto nunca chegou a ser reservado de verdade (ninguém pagou),
        // então volta a ficar disponível pra qualquer pessoa solicitar.
        if (window.ObjetosVizin) {
            window.ObjetosVizin.marcarDisponibilidade(solicitacao.produtoId, true);
        }
 
        if (window.NotificacoesVizin) {
            window.NotificacoesVizin.adicionarNotificacao(
                {
                    tipo: "aluguel_cancelado",
                    titulo: "Solicitação cancelada automaticamente",
                    descricao: `Você não pagou o aluguel de "${solicitacao.produtoTitulo}" até a data de retirada combinada (${solicitacao.dataRetirada}). A solicitação foi cancelada.`,
                    data: new Date().toLocaleDateString("pt-BR"),
                    solicitacaoId: solicitacao.id
                },
                solicitacao.solicitanteEmail
            );
 
            window.NotificacoesVizin.adicionarNotificacao(
                {
                    tipo: "aluguel_cancelado",
                    titulo: "Solicitação cancelada automaticamente",
                    descricao: `${solicitacao.solicitanteNome || "O locatário"} não pagou o aluguel de "${solicitacao.produtoTitulo}" até a data de retirada combinada. A solicitação foi cancelada e o objeto já está disponível novamente.`,
                    data: new Date().toLocaleDateString("pt-BR"),
                    solicitacaoId: solicitacao.id
                },
                solicitacao.proprietarioEmail
            );
        }
    }
 
    function cancelarPorRetiradaNaoRealizada(solicitacao) {
        const lista = obterTodas().map(s => s.id === solicitacao.id
            ? { ...s, status: "cancelado", canceladoPor: "sistema", pagamentoEstornado: true }
            : s);
        salvarTodas(lista);

        // O objeto nunca chegou a ser retirado, então volta a ficar
        // disponível pra qualquer pessoa solicitar de novo.
        if (window.ObjetosVizin) {
            window.ObjetosVizin.marcarDisponibilidade(solicitacao.produtoId, true);
        }

        if (window.NotificacoesVizin) {
            window.NotificacoesVizin.adicionarNotificacao(
                {
                    tipo: "aluguel_cancelado",
                    titulo: "Locação cancelada automaticamente",
                    descricao: `Você não retirou "${solicitacao.produtoTitulo}" até a data combinada (${solicitacao.dataRetirada}). A locação foi cancelada e o valor pago foi estornado.`,
                    data: new Date().toLocaleDateString("pt-BR"),
                    solicitacaoId: solicitacao.id
                },
                solicitacao.solicitanteEmail
            );

            window.NotificacoesVizin.adicionarNotificacao(
                {
                    tipo: "aluguel_cancelado",
                    titulo: "Locação cancelada automaticamente",
                    descricao: `${solicitacao.solicitanteNome || "O locatário"} não retirou "${solicitacao.produtoTitulo}" até a data combinada. A locação foi cancelada, o valor foi estornado e o objeto já está disponível novamente.`,
                    data: new Date().toLocaleDateString("pt-BR"),
                    solicitacaoId: solicitacao.id
                },
                solicitacao.proprietarioEmail
            );
        }
    }

    function avisarDevolucaoAtrasada(solicitacao) {
        if (!window.NotificacoesVizin) return;

        const multa = calcularMulta(solicitacao);
        const textoMulta = multa.diasAtraso > 0
            ? ` Já foram acumulados ${formatarReal(multa.valorTotal)} de multa (${formatarReal(MULTA_POR_DIA_ATRASO)}/dia), que serão cobrados na conclusão da devolução.`
            : "";

        window.NotificacoesVizin.adicionarNotificacao(
            {
                tipo: "bloqueio_conta",
                titulo: "Devolução em atraso",
                descricao: `Você não devolveu "${solicitacao.produtoTitulo}" até ${solicitacao.dataDevolucao}. Enquanto o objeto não for devolvido, você não pode solicitar novos aluguéis nem aprovar locações nos seus próprios objetos.${textoMulta}`,
                data: new Date().toLocaleDateString("pt-BR"),
                solicitacaoId: solicitacao.id
            },
            solicitacao.solicitanteEmail
        );

        // O proprietário também é avisado — ele está esperando o objeto de
        // volta e a locação dele continua "presa" nesse estado até a
        // devolução acontecer de verdade.
        const textoMultaProprietario = multa.diasAtraso > 0
            ? ` Já foram acumulados ${formatarReal(multa.valorTotal)} de multa por atraso, dos quais ${formatarReal(multa.valorProprietario)} são seus (a plataforma retém ${formatarReal(multa.valorPlataforma)}).`
            : "";

        window.NotificacoesVizin.adicionarNotificacao(
            {
                tipo: "lembrete",
                titulo: "Devolução em atraso",
                descricao: `${solicitacao.solicitanteNome || "O locatário"} ainda não devolveu "${solicitacao.produtoTitulo}" (devolução estava marcada para ${solicitacao.dataDevolucao}).${textoMultaProprietario}`,
                data: new Date().toLocaleDateString("pt-BR"),
                solicitacaoId: solicitacao.id
            },
            solicitacao.proprietarioEmail
        );
    }

    // ================= SOLICITAÇÃO PENDENTE SEM RESPOSTA =================
    // Diferente da devolução em atraso (que já tem um prazo explícito
    // combinado), uma solicitação "pendente" não tem data-limite — o dono
    // pode simplesmente esquecer de responder. Depois de alguns dias parada,
    // mandamos um lembrete pro dono (uma única vez, mesmo padrão de
    // "já avisado" usado acima) — não bloqueia nem cancela nada sozinho,
    // só evita que o pedido fique esquecido indefinidamente na caixa de
    // entrada de alguém.
    //
    // Usamos o próprio `id` da solicitação (gerado com Date.now() em criar())
    // como timestamp de criação — evita precisar guardar mais um campo só
    // pra isso.
    //
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // Mesmo comentário do bloco de lembretes acima: isso deveria ser um job
    // agendado no servidor lendo `solicitacoes.criado_em`, não recalculado
    // no cliente.
    const DIAS_LEMBRETE_PENDENTE = 2;
    const CHAVE_AVISOS_PENDENTE = "vizin_avisos_pendente_sem_resposta";

    function obterAvisosPendenteEnviados() {
        return JSON.parse(localStorage.getItem(CHAVE_AVISOS_PENDENTE) || "[]");
    }

    function jaAvisouPendente(chave) {
        return obterAvisosPendenteEnviados().includes(chave);
    }

    function marcarAvisoPendenteEnviado(chave) {
        const lista = obterAvisosPendenteEnviados();
        if (!lista.includes(chave)) {
            lista.push(chave);
            localStorage.setItem(CHAVE_AVISOS_PENDENTE, JSON.stringify(lista));
        }
    }

    function verificarSolicitacoesPendentes() {
        const limiarMs = DIAS_LEMBRETE_PENDENTE * 24 * 60 * 60 * 1000;
        const agora = Date.now();

        obterTodas().forEach(solicitacao => {
            if (solicitacao.status !== "pendente") return;

            const idadeMs = agora - solicitacao.id;
            if (idadeMs < limiarMs) return;

            const chave = `${solicitacao.id}_pendente_sem_resposta`;
            if (jaAvisouPendente(chave)) return;

            if (window.NotificacoesVizin) {
                window.NotificacoesVizin.adicionarNotificacao(
                    {
                        tipo: "lembrete",
                        titulo: "Solicitação aguardando resposta",
                        descricao: `O pedido de aluguel de "${solicitacao.produtoTitulo}" feito por ${solicitacao.solicitanteNome || "um interessado"} está parado há ${DIAS_LEMBRETE_PENDENTE} dias sem resposta. Considere aprovar ou recusar.`,
                        data: new Date().toLocaleDateString("pt-BR"),
                        solicitacaoId: solicitacao.id
                    },
                    solicitacao.proprietarioEmail
                );
            }

            marcarAvisoPendenteEnviado(chave);
        });
    }

    // Mesmo padrão de polling leve já usado pra lembretes/prazos.
    verificarSolicitacoesPendentes();
    setInterval(verificarSolicitacoesPendentes, 60 * 1000);

    function verificarPrazos() {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        obterTodas().forEach(solicitacao => {

            // Pagamento não realizado: a solicitação foi aprovada mas
            // ninguém pagou até o dia da retirada combinada — cancela
            // automaticamente e libera o objeto.
            if (solicitacao.status === "aprovado" && solicitacao.dataRetirada) {
                const dataRetiradaAprovado = parseDataISO(solicitacao.dataRetirada);
                if (dataRetiradaAprovado && dataRetiradaAprovado < hoje) {
                    cancelarPorPagamentoNaoRealizado(solicitacao);
                    return; // essa locação já foi cancelada, não checa mais nada pra ela
                }
            }

            // Retirada não realizada: só faz sentido enquanto o status
            // ainda é "pago" — se já virou "retirado", a retirada
            // aconteceu e não há nada pra cancelar aqui.
            if (solicitacao.status === "pago" && solicitacao.dataRetirada) {
                const dataRetirada = parseDataISO(solicitacao.dataRetirada);
                if (dataRetirada && dataRetirada < hoje) {
                    cancelarPorRetiradaNaoRealizada(solicitacao);
                    return; // essa locação já foi cancelada, não checa devolução dela
                }
            }

            // Devolução atrasada: avisa uma única vez (por isso o controle
            // de "já avisado", igual ao dos lembretes) — a restrição em si
            // (estaBloqueadoPorAtraso) é sempre recalculada na hora, então
            // não precisa "renovar" nada aqui a cada checagem.
            if ((solicitacao.status === "retirado" || solicitacao.status === "aguardando_devolucao") && solicitacao.dataDevolucao) {
                const dataDevolucao = parseDataISO(solicitacao.dataDevolucao);
                if (dataDevolucao && dataDevolucao < hoje) {
                    const chaveAviso = `${solicitacao.id}_devolucao_atrasada_aviso`;
                    if (!jaAvisouAtraso(chaveAviso)) {
                        avisarDevolucaoAtrasada(solicitacao);
                        marcarAvisoAtrasoEnviado(chaveAviso);
                    }
                }
            }
        });
    }

    // Mesmo padrão de polling leve já usado pra lembretes.
    verificarPrazos();
    setInterval(verificarPrazos, 60 * 1000);

    window.SolicitacoesVizin = {
        obterTodas,
        obterPorId,
        obterDoProprietario,
        obterDoSolicitante,
        criar,
        atualizarStatus,
        responder,
        contarPendentesComoProprietario,
        podeCancelar,
        cancelar,
        estaBloqueadoPorAtraso,
        detalhesBloqueio,
        calcularDiasAtraso,
        calcularMulta,
        pagarMulta,
        obterMultasPendentes,
        formatarReal,
        MULTA_POR_DIA_ATRASO,
        PERCENTUAL_PLATAFORMA_MULTA,
        verificarLembretes,          // exposto pra debug/testes no console
        verificarPrazos,             // exposto pra debug/testes no console
        verificarSolicitacoesPendentes // exposto pra debug/testes no console
    };

})();