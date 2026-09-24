// ================= CHECAGEM DE BLOQUEIOS =================
// Mesma ideia já usada em "excluir objeto com locação ativa": não deixa a
// pessoa excluir a conta se isso puder deixar outra pessoa na mão (aluguel
// em andamento) ou causar prejuízo (saldo a receber).
function calcularBloqueiosExclusao() {
    const motivos = [];
 
    if (window.SolicitacoesVizin) {
        const todas = window.SolicitacoesVizin.obterTodas();
 
        // "Em andamento" = já saiu de pendente e ainda não terminou (não
        // confundir com os nomes reais do ciclo de vida, que são
        // pendente -> aprovado -> pago -> retirado -> aguardando_devolucao
        // -> concluido, com cancelado/rejeitado como saídas).
        const STATUS_EM_ANDAMENTO = ["aprovado", "pago", "retirado", "aguardando_devolucao"];
 
        const aluguéisComoLocatario = todas.filter(s =>
            s.souSolicitante && STATUS_EM_ANDAMENTO.includes(s.status)
        ).length;
 
        const aluguéisComoProprietario = todas.filter(s =>
            s.souProprietario && STATUS_EM_ANDAMENTO.includes(s.status)
        ).length;
 
        const pedidosPendentes = todas.filter(s =>
            s.souProprietario && s.status === "pendente"
        ).length;
 
        if (aluguéisComoLocatario > 0) {
            motivos.push(`Você tem ${aluguéisComoLocatario} aluguel(éis) em andamento como locatário.`);
        }
        if (aluguéisComoProprietario > 0) {
            motivos.push(`Você tem ${aluguéisComoProprietario} objeto(s) alugado(s) para outras pessoas no momento.`);
        }
        if (pedidosPendentes > 0) {
            motivos.push(`Você tem ${pedidosPendentes} solicitação(ões) de aluguel aguardando sua resposta.`);
        }
    }
 
    return motivos;
}
 
const avisoBloqueio = document.getElementById("aviso-bloqueio");
const listaMotivosBloqueio = document.getElementById("lista-motivos-bloqueio");
const cardConfirmacao = document.getElementById("card-confirmacao");
 
const motivosBloqueio = calcularBloqueiosExclusao();
 
if (motivosBloqueio.length > 0) {
    avisoBloqueio.style.display = "flex";
    listaMotivosBloqueio.innerHTML = motivosBloqueio.map(m => `<li>${m}</li>`).join("");
    cardConfirmacao.style.display = "none";
}
 
// ================= HABILITAR BOTÃO SÓ QUANDO TUDO ESTIVER PREENCHIDO =================
const senhaInput = document.getElementById("senhaConfirmacaoExclusao");
const textoInput = document.getElementById("textoConfirmacaoExclusao");
const checkboxCiente = document.getElementById("checkboxCienteExclusao");
const btnExcluir = document.getElementById("btnExcluirConta");
const mensagemEl = document.getElementById("mensagemExclusao");
 
function mostrarMensagemExclusao(texto, tipo) {
    mensagemEl.textContent = texto;
    mensagemEl.classList.remove("erro", "sucesso");
    if (tipo) mensagemEl.classList.add(tipo);
}
 
function atualizarEstadoBotao() {
    const pronto = senhaInput.value.length > 0
        && textoInput.value.trim().toUpperCase() === "EXCLUIR"
        && checkboxCiente.checked;
    btnExcluir.disabled = !pronto;
}
 
[senhaInput, textoInput].forEach(el => el.addEventListener("input", atualizarEstadoBotao));
checkboxCiente.addEventListener("change", atualizarEstadoBotao);
 
// ================= TOGGLE MOSTRAR/OCULTAR SENHA =================
const toggleSenhaExclusao = document.getElementById("toggleSenhaExclusao");
toggleSenhaExclusao.addEventListener("click", () => {
    const visivel = senhaInput.type === "text";
    senhaInput.type = visivel ? "password" : "text";
    toggleSenhaExclusao.classList.toggle("bi-eye-slash", visivel);
    toggleSenhaExclusao.classList.toggle("bi-eye", !visivel);
});

// ================= MODAL DE CONFIRMAÇÃO FINAL =================
const modal = document.getElementById("modal-confirmar-exclusao");
 
function abrirModal() { modal.classList.add("show"); }
function fecharModal() { modal.classList.remove("show"); }
 
document.getElementById("modal-exclusao-voltar").addEventListener("click", fecharModal);
modal.addEventListener("click", (e) => { if (e.target === modal) fecharModal(); });
 
btnExcluir.addEventListener("click", () => {
    mostrarMensagemExclusao("", null);
    // A senha só é validada de fato no back-end, no momento da exclusão
    // (dentro da confirmação do modal) — não faz sentido validar aqui, pois
    // isso permitiria testar se a senha está certa sem excluir a conta.
    abrirModal();
});

document.getElementById("modal-exclusao-confirmar").addEventListener("click", async () => {
    const botaoModal = document.getElementById("modal-exclusao-confirmar");
    botaoModal.disabled = true;
    botaoModal.textContent = "Excluindo...";
 
    try {
        // O back-end valida a senha, checa bloqueios (aluguéis ativos etc.)
        // e cuida da exclusão em cascata (objetos, notificações) e do
        // período de 30 dias de "arrependimento".
        await excluirConta(senhaInput.value);
 
        localStorage.removeItem("token");
        localStorage.removeItem("usuario");
 
        sessionStorage.setItem("mensagemLogin", "Sua conta foi desativada. Faça login novamente dentro de 30 dias para recuperá-la.");
        window.location.href = "/login";
 
    } catch (err) {
        console.error(err);
        fecharModal();
        // err.message vem do api.js — pode ser "Senha incorreta." ou um
        // motivo de bloqueio (aluguel ativo etc.) reforçado pelo servidor.
        mostrarMensagemExclusao(err.message, "erro");
        botaoModal.disabled = false;
        botaoModal.textContent = "Sim, excluir conta";
    }
});
 
