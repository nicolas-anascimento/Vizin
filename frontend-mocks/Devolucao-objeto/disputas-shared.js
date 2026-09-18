/* =====================================================
   DISPUTAS VIZIN — MÓDULO COMPARTILHADO
   ------------------------------------------------------
   Cobre um buraco que existia nas telas de Retirada e Devolução: se algo
   dá errado (objeto diferente do anúncio, chegou danificado, a outra
   parte simplesmente não aparece...), a única saída visível era o link
   solto "Fale com o Suporte", que abria a página de Suporte do zero, sem
   nenhum contexto e sem a pessoa saber depois se aquele chamado já tinha
   sido aberto ou não.
 
   Este módulo guarda esses relatos localmente (localStorage) e:
     - notifica a OUTRA parte da locação (transparência: ninguém abre um
       relato sobre a outra pessoa sem ela saber);
     - permite que a própria tela de Retirada/Devolução mostre "você já
       tem um chamado aberto sobre isso" em vez de deixar a pessoa reportar
       o mesmo problema várias vezes ou perder de vista que já reportou.
 
   PONTO DE INTEGRAÇÃO COM O BACK-END:
   Isso deve virar:
     POST /api/relatos            { aluguelId, etapa, motivo, descricao }
     GET  /api/relatos/:aluguelId
   e a página de Suporte (../Suporte/index.html) deve passar a listar e
   permitir acompanhar esses relatos de verdade, com um responsável do
   time analisando — hoje isso é só um registro local sem "handler" nenhum
   do outro lado.
   ===================================================== */
 
const DisputasVizin = (function () {
    const CHAVE = "vizin_relatos_problema";
 
    function lerTudo() {
        return JSON.parse(localStorage.getItem(CHAVE) || "[]");
    }
 
    function salvarTudo(lista) {
        localStorage.setItem(CHAVE, JSON.stringify(lista));
    }
 
    const MOTIVOS_LABEL = {
        objeto_diferente: "O objeto não é como no anúncio",
        objeto_danificado: "O objeto chegou danificado",
        objeto_incompleto: "Faltam peças/acessórios do objeto",
        outra_parte_ausente: "A outra parte não apareceu / não responde",
        multa_indevida: "A multa por atraso não deveria ser cobrada de mim",
        outro: "Outro motivo"
    };
 
    // etapa = "retirada" | "devolucao" | "multa"
    // papel = "locatario" | "proprietario" (quem está reportando)
    function abrirRelato({ aluguelId, etapa, papel, motivo, descricao, produtoTitulo, destinatarioEmail, remetenteNome }) {
        const lista = lerTudo();
 
        const relato = {
            id: Date.now(),
            aluguelId,
            etapa,
            papel,
            motivo,
            motivoLabel: MOTIVOS_LABEL[motivo] || motivo,
            descricao: descricao || "",
            status: "aberto", // aberto | em_analise | resolvido
            criadoEm: new Date().toISOString()
        };
 
        lista.unshift(relato);
        salvarTudo(lista);
 
        // Avisa a outra parte — nunca reporta alguém sem essa pessoa saber.
        const ETAPA_LABEL = { retirada: "na retirada", devolucao: "na devolução", multa: "na multa por atraso" };

        if (window.NotificacoesVizin && destinatarioEmail) {
            window.NotificacoesVizin.adicionarNotificacao(
                {
                    tipo: "problema_reportado",
                    titulo: `Um problema foi reportado ${ETAPA_LABEL[etapa] || ""}`,
                    descricao: `${remetenteNome || "A outra parte"} reportou um problema em "${produtoTitulo || "seu aluguel"}": ${relato.motivoLabel}. Nosso Suporte foi avisado.`,
                    data: new Date().toLocaleDateString("pt-BR"),
                    solicitacaoId: aluguelId
                },
                destinatarioEmail
            );
        }
 
        return relato;
    }
 
    // Relato mais recente e ainda aberto para esse aluguel/etapa (qualquer
    // uma das duas partes pode ter aberto — mostramos pra ambas, já que o
    // problema afeta a locação inteira, não só quem reportou).
    function obterRelatoAberto(aluguelId, etapa) {
        return lerTudo().find(r => r.aluguelId == aluguelId && r.etapa === etapa && r.status !== "resolvido") || null;
    }
 
    function obterTodosPorAluguel(aluguelId) {
        return lerTudo().filter(r => r.aluguelId == aluguelId);
    }
 
    return { abrirRelato, obterRelatoAberto, obterTodosPorAluguel, MOTIVOS_LABEL };
})();
 
window.DisputasVizin = DisputasVizin;