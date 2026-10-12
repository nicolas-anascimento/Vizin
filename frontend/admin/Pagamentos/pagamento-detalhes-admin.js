/**
 * pagamento-detalhes-admin.js
 * ------------------------------------------------------------------
 * Modal "Ver detalhes da transação" — única ação disponível na coluna
 * de Ações da tabela de Pagamentos (o admin não aprova/cancela
 * transações manualmente: quem confirma pagamento é o webhook do
 * gateway, como já documentado em pagamento.js/pagamento-confirmado.js
 * do lado do usuário).
 *
 * Busca os dados completos da transação no back ao abrir (a linha da
 * tabela só tem os campos resumidos usados na listagem) — ver
 * pagamentos-api.js -> obterTransacaoAdmin.
 *
 * Uso:
 *   abrirModalDetalhesTransacao(transacaoResumida);
 *
 * Depende de:
 *   - pagamentos-api.js (obterTransacaoAdmin)
 *   - funções utilitárias de pagamentos.js (labelStatusPagamento,
 *     labelMetodoPagamento, formatarPrecoPagamento, celulaUsuarioPagamento)
 * ------------------------------------------------------------------
 */

function garantirModalDetalhesTransacao() {
    if (document.getElementById("admModalDetalhesTransacaoOverlay")) return;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
        <div class="admin-modal-overlay" id="admModalDetalhesTransacaoOverlay" hidden>
            <div class="admin-modal">
                <h3>Detalhes da transação</h3>

                <div id="admModalDetalhesTransacaoCarregando" class="admin-detalhes-carregando">Carregando...</div>
                <p class="admin-form-erro" id="admModalDetalhesTransacaoErro"></p>

                <div id="admModalDetalhesTransacaoConteudo" class="admin-detalhes-grid" hidden>
                    <div><span>ID da transação</span><strong id="admDetTransacaoId"></strong></div>
                    <div><span>Status</span><strong id="admDetTransacaoStatus"></strong></div>
                    <div><span>Usuário</span><strong id="admDetTransacaoUsuario"></strong></div>
                    <div><span>Método</span><strong id="admDetTransacaoMetodo"></strong></div>
                    <div><span>Valor</span><strong id="admDetTransacaoValor"></strong></div>
                    <div><span>Data</span><strong id="admDetTransacaoData"></strong></div>
                    <div><span>Tipo</span><strong id="admDetTransacaoTipo"></strong></div>
                    <div><span>Referente a</span><strong id="admDetTransacaoReferencia"></strong></div>
                    <div class="admin-detalhes-linha-larga" id="admDetTransacaoCartaoLinha" hidden>
                        <span>Cartão</span><strong id="admDetTransacaoCartao"></strong>
                    </div>
                    <div class="admin-detalhes-linha-larga" id="admDetTransacaoMotivoFalhaLinha" hidden>
                        <span>Motivo da falha</span><strong id="admDetTransacaoMotivoFalha"></strong>
                    </div>
                </div>

                <div class="admin-modal-botoes">
                    <button class="admin-btn-secundario" id="admModalDetalhesTransacaoFechar">Fechar</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(wrapper);

    document.getElementById("admModalDetalhesTransacaoFechar").addEventListener("click", fecharModalDetalhesTransacao);
    document.getElementById("admModalDetalhesTransacaoOverlay").addEventListener("click", (e) => {
        if (e.target.id === "admModalDetalhesTransacaoOverlay") fecharModalDetalhesTransacao();
    });
}

// Token da transação atualmente aberta no modal: se o admin abrir uma 2ª
// transação antes da resposta da 1ª voltar (rede lenta), a resposta da 1ª
// chega depois mas não deve mais ser aplicada — senão o modal fica
// mostrando os detalhes de uma transação diferente da que está com o
// título/overlay aberto, achando o admin que são os dados certos.
let tokenTransacaoAberta = 0;

async function abrirModalDetalhesTransacao(transacaoResumida) {
    garantirModalDetalhesTransacao();

    const meuToken = ++tokenTransacaoAberta;

    const overlay = document.getElementById("admModalDetalhesTransacaoOverlay");
    const carregandoEl = document.getElementById("admModalDetalhesTransacaoCarregando");
    const erroEl = document.getElementById("admModalDetalhesTransacaoErro");
    const conteudoEl = document.getElementById("admModalDetalhesTransacaoConteudo");

    overlay.hidden = false;
    carregandoEl.hidden = false;
    erroEl.textContent = "";
    conteudoEl.hidden = true;

    let t;
    try {
        t = await obterTransacaoAdmin(transacaoResumida.id);
    } catch (err) {
        if (meuToken !== tokenTransacaoAberta) return; // outra transação foi aberta nesse meio-tempo
        carregandoEl.hidden = true;
        erroEl.textContent = err.message;
        return;
    }

    if (meuToken !== tokenTransacaoAberta) return; // resposta obsoleta — não é mais a transação aberta no modal

    document.getElementById("admDetTransacaoId").textContent = t.id;
    document.getElementById("admDetTransacaoStatus").textContent = labelStatusPagamento(t.status);
    document.getElementById("admDetTransacaoUsuario").innerHTML = celulaUsuarioPagamento(t.usuario);
    document.getElementById("admDetTransacaoMetodo").textContent = labelMetodoPagamento(t.metodo);
    document.getElementById("admDetTransacaoValor").textContent = formatarPrecoPagamento(t.valor);
    document.getElementById("admDetTransacaoData").textContent = t.criado_em ? new Date(t.criado_em).toLocaleString("pt-BR") : "—";
    document.getElementById("admDetTransacaoTipo").textContent = t.tipo === "multa" ? "Multa por atraso" : "Aluguel";
    document.getElementById("admDetTransacaoReferencia").textContent = t.produto?.titulo || "—";

    // Qual cartão foi usado — só faz sentido pra método "cartao", e só se o
    // back mandar o resumo seguro (bandeira + últimos 4 dígitos), do mesmo
    // jeito que pagamento.js já expõe pro usuário.
    const linhaCartao = document.getElementById("admDetTransacaoCartaoLinha");
    if (t.metodo === "cartao" && t.cartao?.final) {
        linhaCartao.hidden = false;
        const bandeira = t.cartao.bandeira ? `${t.cartao.bandeira} ` : "";
        document.getElementById("admDetTransacaoCartao").textContent = `${bandeira}terminado em ${t.cartao.final}`;
    } else {
        linhaCartao.hidden = true;
    }

    const linhaMotivo = document.getElementById("admDetTransacaoMotivoFalhaLinha");
    if (t.status === "falhou" && t.motivo_falha) {
        linhaMotivo.hidden = false;
        document.getElementById("admDetTransacaoMotivoFalha").textContent = t.motivo_falha;
    } else {
        linhaMotivo.hidden = true;
    }

    carregandoEl.hidden = true;
    conteudoEl.hidden = false;
}

function fecharModalDetalhesTransacao() {
    document.getElementById("admModalDetalhesTransacaoOverlay").hidden = true;
}