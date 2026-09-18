// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    window.location.href = "../Login/index.html";
}
 
const usuarioLogado = JSON.parse(localStorage.getItem("usuario") || "null");
 
// ================= [SÓ PARA TESTES] TOGGLE "VER COMO LOCATÁRIO/PROPRIETÁRIO" =================
// TODO: remover quando integrar com o back-end real.
// Igual à simulação da página de Produto: ignora quem de fato é
// solicitante/proprietário nos dados mock e força todos os itens do
// histórico a aparecerem com o papel escolhido, só pra dar pra ver as
// duas telas do fluxo sem depender de ter dados reais dos dois lados.
const CHAVE_SIM_PAPEL_HISTORICO = "vizin_sim_papel_historico";
const papelSimulado = sessionStorage.getItem(CHAVE_SIM_PAPEL_HISTORICO); // null | "locatario" | "proprietario"
 
document.querySelectorAll("#sim-papel-toggle-historico .sim-papel-btn").forEach(btn => {
    btn.classList.toggle("ativo", btn.dataset.papel === papelSimulado);
    btn.addEventListener("click", () => {
        // Clicar de novo no papel já ativo desliga a simulação.
        const novoPapel = btn.dataset.papel === papelSimulado ? null : btn.dataset.papel;
        if (novoPapel) {
            sessionStorage.setItem(CHAVE_SIM_PAPEL_HISTORICO, novoPapel);
        } else {
            sessionStorage.removeItem(CHAVE_SIM_PAPEL_HISTORICO);
        }
        location.reload();
    });
});
 
// ================= FILTRO ATIVO =================
// Pode chegar aqui já apontando pra uma aba específica — o link "Ver
// solicitação" nas notificações leva pra Historico/index.html?tab=solicitacoes,
// e o badge do ícone de Histórico no menu usa o mesmo link.
const tabs = document.querySelectorAll(".historico-tab");
 
const tabParam = new URLSearchParams(window.location.search).get("tab");
const tabValida = tabParam && Array.from(tabs).some(t => t.dataset.filtro === tabParam);
let filtroAtual = tabValida ? tabParam : "todos";
 
tabs.forEach(tab => {
    tab.classList.toggle("active", tab.dataset.filtro === filtroAtual);
 
    tab.addEventListener("click", () => {
        tabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        filtroAtual = tab.dataset.filtro;
        renderizarHistorico();
    });
});
 
function filtrarPorPapel(lista, filtro) {
    if (filtro === "alugados") return lista.filter(item => item.papel === "alugado");
    if (filtro === "alugados-para-outros") return lista.filter(item => item.papel === "alugado-para-outros");
 
    // "Solicitações": pedidos que outras pessoas fizeram nos SEUS objetos e
    // que ainda aguardam sua decisão (aprovar/recusar).
    if (filtro === "solicitacoes") return lista.filter(item => item.papel === "alugado-para-outros" && item.status === "pendente");
 
    return lista;
}
 
// ================= LABELS / CLASSES DE STATUS =================
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Esses status devem vir prontos da API (GET /api/alugueis/historico), em
// vez de serem derivados aqui a partir do status da solicitação mock.
const STATUS_LABEL = {
    pendente: "Aguardando aprovação",
    aprovado: "Aguardando pagamento",
    pago: "Aguardando retirada",
    retirado: "Em andamento",
    aguardando_devolucao: "Em andamento",
    concluido: "Concluído",
    rejeitado: "Recusado",
    cancelado: "Cancelado"
};
 
const STATUS_PILL_CLASSE = {
    pendente: "pendente",
    aprovado: "pendente",
    pago: "confirmado",
    retirado: "confirmado",
    aguardando_devolucao: "confirmado",
    concluido: "concluido",
    rejeitado: "recusado",
    cancelado: "recusado"
};
 
// Locação pode ser cancelada (por qualquer uma das partes) só até o
// momento da retirada — nesses três status ela ainda não começou de fato.
const STATUS_CANCELAVEIS = new Set(["pendente", "aprovado", "pago"]);
 
function formatarData(dataStr) {
    if (!dataStr) return "-";
    const [ano, mes, dia] = dataStr.split("-");
    return `${dia}/${mes}/${ano}`;
}
 
// Formata um timestamp ISO (ex: o "concluidoEm" salvo pelo RetiradaVizin /
// DevolucaoVizin quando as duas partes terminam de enviar as fotos) pra
// "dd/mm/aaaa às HH:MM".
function formatarDataHora(isoStr) {
    if (!isoStr) return "-";
    const d = new Date(isoStr);
    const dia = String(d.getDate()).padStart(2, "0");
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const ano = d.getFullYear();
    const hora = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dia}/${mes}/${ano} às ${hora}:${min}`;
}
 
// ================= SINCRONIZA STATUS COM RETIRADA/DEVOLUÇÃO =================
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Isso só é necessário no mock: quem faz a solicitação avançar de "pago"
// pra "retirado" (e de lá pra "concluido") é a própria página de Retirada
// ou Devolução, checando se AS DUAS partes já enviaram fotos. Se uma pessoa
// enviar as fotos dela e fechar a aba, e a outra parte só olhar o
// Histórico, a solicitação nunca avançaria sozinha — o Histórico ficaria
// "atrasado" em relação ao que realmente aconteceu. Por isso repetimos essa
// checagem aqui também, toda vez que o histórico é montado. No back-end
// real isso deixa de ser necessário: o servidor é a única fonte de verdade
// do status, e o histórico só espelha ela.
function sincronizarStatusComProcessos(s) {
    if (!window.SolicitacoesVizin) return s.status;
 
    let status = s.status;
 
    if (status === "pago" && window.RetiradaVizin && window.RetiradaVizin.ambosConcluidos(s.id)) {
        window.SolicitacoesVizin.atualizarStatus(s.id, "retirado");
        status = "retirado";
 
        if (window.NotificacoesVizin) {
            window.NotificacoesVizin.adicionarNotificacao({
                tipo: "retirada_confirmada",
                titulo: "Retirada confirmada",
                descricao: `A retirada de "${s.produtoTitulo}" foi confirmada por ambas as partes.`,
                data: new Date().toLocaleDateString("pt-BR"),
                solicitacaoId: s.id
            }, s.solicitanteEmail);
 
            window.NotificacoesVizin.adicionarNotificacao({
                tipo: "pagamento_liberado",
                titulo: "Pagamento liberado!",
                descricao: `A retirada de "${s.produtoTitulo}" foi confirmada e o valor de ${formatarPreco(s.total)} foi liberado para sua conta.`,
                data: new Date().toLocaleDateString("pt-BR"),
                solicitacaoId: s.id
            }, s.proprietarioEmail);
        }
    }
 
    if ((status === "retirado" || status === "aguardando_devolucao") && window.DevolucaoVizin && window.DevolucaoVizin.ambosConcluidos(s.id)) {
        window.SolicitacoesVizin.atualizarStatus(s.id, "concluido");
        status = "concluido";
 
        if (window.ObjetosVizin) {
            window.ObjetosVizin.marcarDisponibilidade(s.produtoId, true);
        }
 
        if (window.NotificacoesVizin) {
            window.NotificacoesVizin.adicionarNotificacao({
                tipo: "devolucao_confirmada",
                titulo: "Devolução confirmada",
                descricao: `A devolução de "${s.produtoTitulo}" foi confirmada. O aluguel foi concluído.`,
                data: new Date().toLocaleDateString("pt-BR"),
                solicitacaoId: s.id
            }, s.solicitanteEmail);
 
            window.NotificacoesVizin.adicionarNotificacao({
                tipo: "devolucao_confirmada",
                titulo: "Objeto devolvido",
                descricao: `${s.solicitanteNome || "O locatário"} devolveu "${s.produtoTitulo}". Você já pode avaliar a transação.`,
                data: new Date().toLocaleDateString("pt-BR"),
                solicitacaoId: s.id
            }, s.proprietarioEmail);
        }
    }
 
    return status;
}
 
const STATUS_PAGO_OU_DEPOIS = new Set(["pago", "retirado", "aguardando_devolucao", "concluido"]);
 
// Devolução atrasada NÃO muda o status real da locação (ver comentário em
// solicitacoes-shared.js: o proprietário continua esperando o objeto de
// volta, então o fluxo segue até a devolução acontecer de verdade) — mas
// precisa ficar visível NESTE card específico, não só num aviso genérico no
// topo da página (que não diz qual aluguel, entre vários, é o atrasado).
function estaComDevolucaoAtrasada(s, statusAtual) {
    if (statusAtual !== "retirado" && statusAtual !== "aguardando_devolucao") return false;
    if (!s.dataDevolucao) return false;
 
    const [ano, mes, dia] = s.dataDevolucao.split("-").map(Number);
    if (!ano || !mes || !dia) return false;
 
    const dataDevolucao = new Date(ano, mes - 1, dia);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
 
    return dataDevolucao < hoje;
}
 
// ================= MONTA O HISTÓRICO A PARTIR DAS SOLICITAÇÕES =================
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Troque isso por GET /api/alugueis/historico (autenticado), que já deve
// devolver os itens prontos (incluindo o array de fotos), filtrados pelo
// usuário logado no servidor.
function montarHistorico() {
    if (!usuarioLogado?.email || !window.SolicitacoesVizin) return [];
 
    const todas = window.SolicitacoesVizin.obterTodas();
 
    return todas
        .filter(s => s.solicitanteEmail === usuarioLogado.email || s.proprietarioEmail === usuarioLogado.email)
        .map(s => {
            const souSolicitante = s.solicitanteEmail === usuarioLogado.email;
 
            // Papel real do usuário logado nessa solicitação. Se a simulação
            // estiver ligada, ela sobrescreve esse valor pra todo mundo virar
            // "locatário" ou "proprietário" na tela, não importa quem
            // realmente pediu o aluguel nos dados mock.
            let papel = souSolicitante ? "alugado" : "alugado-para-outros";
            if (papelSimulado === "locatario") papel = "alugado";
            if (papelSimulado === "proprietario") papel = "alugado-para-outros";
 
            // Confere se a solicitação já deveria ter avançado de status por
            // conta de fotos de retirada/devolução enviadas pelas duas partes
            // (ver comentário da função acima).
            const statusAtual = sincronizarStatusComProcessos(s);
 
            // Busca o objeto original pra ter acesso a TODAS as fotos dele
            // (a solicitação só guarda a foto principal em imagemProduto).
            const produtoAtual = window.ObjetosVizin ? window.ObjetosVizin.obterPorId(s.produtoId) : null;
            const imagens = (produtoAtual?.imagens?.length)
                ? produtoAtual.imagens
                : [s.imagemProduto || "../img/sem-imagem.jpg"];
 
            // Fotos de retirada/devolução, pra ficarem registradas no card do
            // Histórico assim que cada etapa é concluída pelas duas partes.
            const statusRetirada = window.RetiradaVizin ? window.RetiradaVizin.obterStatus(s.id) : null;
            const statusDevolucao = window.DevolucaoVizin ? window.DevolucaoVizin.obterStatus(s.id) : null;
 
            return {
                id: s.id,
                produtoId: s.produtoId,
                produtoTitulo: s.produtoTitulo,
                imagens,
                papel,
                outraParteNome: papel === "alugado" ? (s.proprietarioNome || "Proprietário") : (s.solicitanteNome || "Locatário"),
                outraParteEmail: papel === "alugado" ? s.proprietarioEmail : s.solicitanteEmail,
                locatarioNome: s.solicitanteNome || "Locatário",
                proprietarioNome: s.proprietarioNome || "Proprietário",
                dataRetirada: formatarData(s.dataRetirada),
                dataDevolucao: formatarData(s.dataDevolucao),
                localRetirada: s.localizacaoProduto || "A combinar com o proprietário",
                preco: s.total,
                pagamento: statusAtual === "cancelado"
                    ? (s.pagamentoEstornado ? "Estornado" : "Cancelado")
                    : (STATUS_PAGO_OU_DEPOIS.has(statusAtual) ? "Pago" : "Pendente"),
                status: statusAtual,
                atrasado: estaComDevolucaoAtrasada(s, statusAtual),
                fotosRetirada: (statusRetirada && window.RetiradaVizin.ambosConcluidos(s.id)) ? statusRetirada : null,
                fotosDevolucao: (statusDevolucao && window.DevolucaoVizin.ambosConcluidos(s.id)) ? statusDevolucao : null,
                // Comprovante da multa: fica salvo no próprio registro da
                // solicitação (não "some" como a notificação de devolução
                // some assim que é lida) — ver montarComprovanteMulta abaixo.
                multaAtraso: s.multaAtraso || null,
                multaStatus: s.multaStatus || null,
                multaCongeladaEm: s.multaCongeladaEm || null,
                multaPagaEm: s.multaPagaEm || null,
                _raw: s
            };
        })
        .sort((a, b) => b.id - a.id);
}
 
// ================= CONTADOR NA ABA "SOLICITAÇÕES" =================
// Mesma lógica/fonte do badge que já existe em cima do ícone de Histórico
// no menu (contarPendentesComoProprietario), só que aplicada aqui na
// própria aba, pra dar essa informação também dentro da página.
function atualizarBadgeAbaSolicitacoes() {
    const badge = document.getElementById("badge-solicitacoes");
    if (!badge || !usuarioLogado?.email || !window.SolicitacoesVizin) return;
 
    const total = window.SolicitacoesVizin.contarPendentesComoProprietario(usuarioLogado.email);
 
    if (total > 0) {
        badge.textContent = total > 9 ? "9+" : String(total);
        badge.style.display = "inline-flex";
    } else {
        badge.textContent = "";
        badge.style.display = "none";
    }
}
 
// ================= AVISO DE CONTA RESTRITA (DEVOLUÇÃO EM ATRASO) =================
// Mesmo padrão do "aviso-indisponivel" criado dinamicamente em produto.js:
// só existe no DOM enquanto for necessário.
function atualizarAvisoBloqueio() {
    const detalhes = (usuarioLogado?.email && window.SolicitacoesVizin && window.SolicitacoesVizin.detalhesBloqueio)
        ? window.SolicitacoesVizin.detalhesBloqueio(usuarioLogado.email)
        : null;
 
    let aviso = document.getElementById("aviso-bloqueio-atraso");
 
    if (!detalhes) {
        if (aviso) aviso.remove();
        return;
    }
 
    if (!aviso) {
        aviso = document.createElement("div");
        aviso.id = "aviso-bloqueio-atraso";
        aviso.className = "card-aluguel-dica";
        aviso.style.background = "#fdeaea";
        aviso.style.marginBottom = "20px";
        document.querySelector(".historico-tabs").insertAdjacentElement("beforebegin", aviso);
    }

    // Duas mensagens diferentes pro mesmo tipo de restrição (não pode
    // solicitar novos aluguéis nem aprovar locações nos próprios objetos —
    // ver detalhesBloqueio em solicitacoes-shared.js), porque o motivo real
    // é diferente: um caso ainda depende de devolver o objeto, o outro já
    // foi devolvido e só falta pagar a multa.
    const mensagem = detalhes.motivo === "multa_pendente"
        ? `<strong>Você tem uma multa por atraso pendente de pagamento.</strong>
           Enquanto ela não for paga, você não pode solicitar novos aluguéis
           nem aprovar locações nos seus próprios objetos. Veja o comprovante no card do aluguel abaixo.`
        : `<strong>Você tem uma devolução em atraso.</strong>
           Enquanto o objeto não for devolvido, você não pode solicitar novos aluguéis
           nem aprovar locações nos seus próprios objetos.`;

    aviso.innerHTML = `
        <i class="bi bi-exclamation-triangle" style="color:#dc2626;"></i>
        <span>${mensagem}</span>
    `;
}
 
// ================= RENDER DOS CARDS =================
const listaContainer = document.getElementById("lista-historico");
const emptyState = document.getElementById("empty-state");
 
function renderizarHistorico() {
    if (!listaContainer) return;
 
    const historico = montarHistorico();
    const listaFiltrada = filtrarPorPapel(historico, filtroAtual);
 
    atualizarBadgeAbaSolicitacoes();
    atualizarAvisoBloqueio();
 
    listaContainer.innerHTML = "";
 
    if (!listaFiltrada || listaFiltrada.length === 0) {
        emptyState.style.display = "block";
        return;
    }
 
    emptyState.style.display = "none";
 
    listaFiltrada.forEach(item => {
        const card = document.createElement("div");
        card.className = "card-aluguel";
        // Enquanto a solicitação estiver pendente e o usuário logado for o
        // dono, mostra uma dica sugerindo conversar com o locatário antes
        // de decidir (aparece na aba "Solicitações" do histórico).
        const dicaSolicitacao = (item.status === "pendente" && item.papel === "alugado-para-outros")
            ? `<div class="card-aluguel-dica">
                    <i class="bi bi-chat-dots"></i>
                    <span>Converse com <strong>${item.outraParteNome}</strong> antes de decidir — combinem o local de retirada e tirem qualquer dúvida sobre o objeto para se entenderem.</span>
                </div>`
            : "";
 
        const temFotos = !!(item.fotosRetirada || item.fotosDevolucao);
        const secaoFotos = temFotos ? montarSecaoFotos(item) : "";
        const toggleFotos = temFotos
            ? `<div class="card-aluguel-toggle-fotos">
                    <button type="button" class="toggle-fotos oculto" data-aluguel-id="${item.id}">
                        Mostrar fotos <i class="bi bi-chevron-up"></i>
                    </button>
               </div>`
            : "";
 
        card.innerHTML = `
            <div class="card-aluguel-topo-linha">
                <img src="${item.imagens[0]}" alt="${item.produtoTitulo}" class="card-aluguel-img">
 
                <div class="card-aluguel-info">
                    <div class="card-aluguel-topo">
                        <div>
                            <h3 class="card-aluguel-titulo">${item.produtoTitulo}</h3>
                            <p class="card-aluguel-proprietario">
                                <i class="bi bi-person"></i>
                                ${item.papel === "alugado" ? "Proprietário" : "Locatário"}: ${item.outraParteNome}
                            </p>
                        </div>
                        <div class="card-aluguel-preco-status">
                            <span class="card-aluguel-preco">${formatarPreco(item.preco)}</span>
                            <span class="status-pill ${item.atrasado ? "atrasado" : (STATUS_PILL_CLASSE[item.status] || item.status)}">${item.atrasado ? "Devolução atrasada" : (STATUS_LABEL[item.status] || item.status)}</span>
                        </div>
                    </div>
 
                    <div class="card-aluguel-detalhes">
                        <div class="card-aluguel-detalhe">
                            <span class="label">Data de retirada:</span>
                            <span class="valor">${item.dataRetirada}</span>
                        </div>
                        <div class="card-aluguel-detalhe">
                            <span class="label">Data de devolução:</span>
                            <span class="valor">${item.dataDevolucao}</span>
                        </div>
                        <div class="card-aluguel-detalhe">
                            <span class="label">Local de retirada:</span>
                            <span class="valor">${item.localRetirada}</span>
                        </div>
                        <div class="card-aluguel-detalhe">
                            <span class="label">Pagamento:</span>
                            <span class="valor">${item.pagamento}</span>
                        </div>
                    </div>
 
                    ${dicaSolicitacao}
                    ${montarComprovanteMulta(item)}
 
                    <div class="card-aluguel-actions">
                        <button type="button" class="btn-historico ver-objeto" data-produto-id="${item.produtoId}">
                            Ver Objeto
                        </button>
                        <button type="button" class="btn-historico conversar"
                            data-user-id="${item.outraParteEmail || ""}"
                            data-user-name="${item.outraParteNome}"
                            data-produto-id="${item.produtoId}"
                            data-produto-titulo="${item.produtoTitulo}">
                            <i class="bi bi-chat-dots"></i> Conversar
                        </button>
                        ${botaoContextual(item)}
                        ${botaoCancelar(item)}
                        <button type="button" class="btn-historico denunciar"
                            data-aluguel-id="${item.id}"
                            data-produto-id="${item.produtoId}"
                            data-produto-titulo="${item.produtoTitulo}"
                            data-outra-parte-id="${item.outraParteEmail || ""}"
                            data-outra-parte-nome="${item.outraParteNome}"
                            title="Denunciar este aluguel">
                            <i class="bi bi-flag"></i> Denunciar
                        </button>
                    </div>
                </div>
            </div>
 
            ${toggleFotos}
            ${secaoFotos}
        `;
        listaContainer.appendChild(card);
    });
}
 
// ================= SEÇÃO DE FOTOS (RETIRADA / DEVOLUÇÃO) =================
// Monta os grupos de fotos de cada etapa já concluída pelas duas partes,
// com pill de "Locatário — Nome" / "Proprietário — Nome" acima das fotos
// daquela pessoa.
function montarGrupoFotos(item, papel) {
    const nome = papel === "locatario" ? item.locatarioNome : item.proprietarioNome;
    const label = papel === "locatario" ? "Locatário" : "Proprietário";
    const dados = (papel === "locatario") ? item._dadosEtapa.locatario : item._dadosEtapa.proprietario;
    const fotos = dados?.fotos || [];
    const observacao = (dados?.observacoes || "").trim();
 
    const thumbsHtml = fotos.length
        ? fotos.map(src => `<img src="${src}" alt="Foto de ${nome}" class="fotos-thumb">`).join("")
        : `<span class="fotos-thumb-placeholder" title="Foto não enviada"><i class="bi bi-image"></i></span>`;
 
    // A observação também precisa ficar registrada no Histórico, do lado das
    // fotos da mesma pessoa — é o que ela escreveu sobre o estado do objeto
    // no momento da retirada/devolução.
    const observacaoHtml = observacao
        ? `<p class="fotos-observacao"><i class="bi bi-chat-left-text"></i> ${observacao}</p>`
        : "";
 
    return `
        <div class="fotos-grupo">
            <span class="pessoa-pill ${papel}"><i class="bi bi-person"></i> ${label} — ${nome}</span>
            <div class="fotos-grupo-conteudo">
                <div class="fotos-thumbs">${thumbsHtml}</div>
                ${observacaoHtml}
            </div>
        </div>
    `;
}
 
function montarEtapaFotos(item, tipo) {
    // tipo: "retirada" ou "devolucao"
    const dadosEtapa = tipo === "retirada" ? item.fotosRetirada : item.fotosDevolucao;
    if (!dadosEtapa) return "";
 
    const icone = tipo === "retirada" ? "bi-camera" : "bi-camera2";
    const titulo = tipo === "retirada" ? "Fotos da Retirada" : "Fotos da Devolução";
    const itemComDados = Object.assign({}, item, { _dadosEtapa: dadosEtapa });
 
    return `
        <div class="fotos-etapa">
            <p class="fotos-etapa-titulo">
                <i class="bi ${icone}"></i> ${titulo}
                <span class="fotos-etapa-data">— ${formatarDataHora(dadosEtapa.concluidoEm)}</span>
            </p>
            ${montarGrupoFotos(itemComDados, "locatario")}
            ${montarGrupoFotos(itemComDados, "proprietario")}
        </div>
    `;
}
 
function montarSecaoFotos(item) {
    return `
        <div class="card-aluguel-fotos oculto" id="fotos-secao-${item.id}">
            ${montarEtapaFotos(item, "retirada")}
            ${montarEtapaFotos(item, "devolucao")}
        </div>
    `;
}
 
// Botão "Cancelar Locação" — tanto o locatário quanto o proprietário podem
// cancelar, enquanto o status ainda permitir (ver STATUS_CANCELAVEIS). Numa
// solicitação pendente em que o usuário logado é o dono, a decisão dele já
// é Aprovar/Recusar, então não repetimos a ação aqui.
// ================= COMPROVANTE DA MULTA =================
// Diferente da notificação de devolução (que some da lista assim que é
// lida), este bloco fica fixo no card do aluguel enquanto ele existir no
// Histórico — funciona como o "recibo" da multa: quanto foi, referente a
// quantos dias, quando foi congelada, e se já foi paga/contestada. Só entra
// no card quando a locação teve atraso de verdade (multaAtraso != null).
function montarComprovanteMulta(item) {
    if (!item.multaAtraso || item.multaAtraso.diasAtraso <= 0 || !window.SolicitacoesVizin) return "";

    const formatar = window.SolicitacoesVizin.formatarReal;
    const status = item.multaStatus || "pendente";
    const souLocatario = item.papel === "alugado";

    const STATUS_INFO = {
        pendente: { label: "Pendente", cor: "#dc2626", fundo: "#fdeaea" },
        paga: { label: "Paga", cor: "#1f8b4c", fundo: "#e6f6ec" }
    };
    const infoStatus = STATUS_INFO[status] || STATUS_INFO.pendente;

    const quando = status === "paga" && item.multaPagaEm
        ? `Paga em ${formatarDataHora(item.multaPagaEm)}`
        : `Congelada em ${formatarDataHora(item.multaCongeladaEm)}`;

    const valorParaMim = souLocatario ? item.multaAtraso.valorTotal : item.multaAtraso.valorProprietario;
    const rotuloValor = souLocatario ? "Valor cobrado" : "Seu valor (após taxa da plataforma)";

    // Pagar Multa não paga na hora mais — leva pra página de pagamento
    // dedicada (Pagamento-multa), igual ao checkout normal do aluguel.
    const acoes = (souLocatario && status === "pendente")
        ? `<div style="display:flex; gap:10px; margin-top:10px;">
                <a class="btn-historico preenchido" href="../Pagamento-multa/index.html?solicitacaoId=${item.id}">
                    <i class="bi bi-credit-card"></i> Pagar Multa
                </a>
           </div>`
        : "";

    return `
        <div class="card-aluguel-multa" style="margin-top:14px; padding:12px 14px; border-radius:12px; background:${infoStatus.fundo};">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <span style="font-size:13px; font-weight:700; color:var(--texto);">
                    <i class="bi bi-receipt"></i> Multa por atraso na devolução
                </span>
                <span style="font-size:11px; font-weight:700; padding:3px 10px; border-radius:999px; background:${infoStatus.cor}; color:#fff;">
                    ${infoStatus.label}
                </span>
            </div>
            <div style="font-size:12.5px; color:var(--texto-suave); margin-top:8px; display:flex; flex-direction:column; gap:3px;">
                <span>${item.multaAtraso.diasAtraso} dia(s) de atraso · ${formatar(window.SolicitacoesVizin.MULTA_POR_DIA_ATRASO)}/dia</span>
                <span>${rotuloValor}: <strong style="color:var(--texto);">${formatar(valorParaMim)}</strong></span>
                <span>${quando}</span>
            </div>
            ${acoes}
        </div>
    `;
}

function botaoCancelar(item) {
    if (item.status === "pendente" && item.papel === "alugado-para-outros") return "";
    if (!STATUS_CANCELAVEIS.has(item.status)) return "";
 
    return `<button type="button" class="btn-historico recusar cancelar-locacao" data-solicitacao-id="${item.id}">
                <i class="bi bi-x-circle"></i> Cancelar Locação
            </button>`;
}
 
// Segundo botão de ação varia conforme status/papel do aluguel.
function botaoContextual(item) {
    const s = item._raw;
 
    // Pedido de aluguel aguardando a decisão do DONO — a mesma ação que
    // antes só existia na página de Notificações (ver responderSolicitacao
    // em solicitacoes-shared.js).
    if (item.status === "pendente" && item.papel === "alugado-para-outros") {
        // Enquanto o dono (usuário logado) tiver uma devolução em atraso em
        // outra locação, ele não pode aprovar novos pedidos — só recusar
        // continua liberado. Ver SolicitacoesVizin.estaBloqueadoPorAtraso.
        const bloqueado = !!(usuarioLogado?.email && window.SolicitacoesVizin
            && window.SolicitacoesVizin.estaBloqueadoPorAtraso(usuarioLogado.email));
 
        const botaoAprovar = bloqueado
            ? `<span class="btn-historico" style="opacity:.6; cursor:not-allowed;" title="Você tem uma devolução em atraso — devolva o objeto para poder aprovar novas locações.">
                    <i class="bi bi-lock"></i> Aprovar (bloqueado)
               </span>`
            : `<button type="button" class="btn-historico preenchido aprovar-solicitacao" data-solicitacao-id="${item.id}">
                    <i class="bi bi-check-lg"></i> Aprovar
               </button>`;
 
        return `
            ${botaoAprovar}
            <button type="button" class="btn-historico recusar recusar-solicitacao" data-solicitacao-id="${item.id}">
                <i class="bi bi-x-lg"></i> Recusar
            </button>
        `;
    }
 
    // Link secundário pro "hub" de Status da Locação — antes só existia
    // para retirado/aguardando_devolucao (via "Acompanhar Locação" abaixo).
    // pago, concluido e cancelado deixavam o Status inacessível por aqui,
    // mesmo a tela já tratando esses três estados. Fica junto do botão de
    // ação principal (Registrar Retirada / Avaliar), sem substituí-lo.
    const linkVerStatus = `<a class="btn-historico" href="../Status-locacao/index.html?solicitacaoId=${item.id}">
                <i class="bi bi-box-seam"></i> Ver Status da Locação
            </a>`;
 
    if (item.status === "cancelado") {
        return linkVerStatus;
    }
 
    if (item.status === "concluido") {
        if (window.AvaliacoesVizin && window.AvaliacoesVizin.jaAvaliou(item.id, item.papel === "alugado" ? "locatario" : "proprietario")) {
            return `<button type="button" class="btn-historico" disabled style="opacity:.6; cursor:default;">
                        <i class="bi bi-check-circle"></i> Avaliação enviada
                    </button>
                    ${linkVerStatus}`;
        }
 
        return `<a class="btn-historico preenchido" href="../Avaliacao/index.html?solicitacaoId=${item.id}">
                    <i class="bi bi-star-fill"></i> Avaliar
                </a>
                ${linkVerStatus}`;
    }
 
    if (item.status === "retirado" || item.status === "aguardando_devolucao") {
        return `<a class="btn-historico preenchido" href="../Status-locacao/index.html?solicitacaoId=${item.id}">
                    <i class="bi bi-box-seam"></i> Acompanhar Locação
                </a>`;
    }
 
    if (item.status === "pago") {
        // Registrar a retirada é uma ação DAS DUAS partes — tanto locatário
        // quanto proprietário precisam enviar fotos na página de Retirada
        // (ver retirada-objeto.js). Aqui só adaptamos o texto do botão
        // conforme a parte em questão já ter enviado as fotos dela ou não.
        const query = new URLSearchParams({
            produtoId: item.produtoId,
            retirada: s.dataRetirada,
            devolucao: s.dataDevolucao,
            solicitacaoId: item.id
        });
 
        const papelChave = item.papel === "alugado" ? "locatario" : "proprietario";
        const statusRetirada = window.RetiradaVizin ? window.RetiradaVizin.obterStatus(item.id) : null;
        const jaEnviei = statusRetirada?.[papelChave]?.enviado;
 
        return `<a class="btn-historico preenchido" href="../Retirada-objeto/index.html?${query.toString()}">
                    <i class="bi bi-box-arrow-in-down"></i> ${jaEnviei ? "Ver Status da Retirada" : "Registrar Retirada"}
                </a>
                ${linkVerStatus}`;
    }
 
    if (item.status === "aprovado" && item.papel === "alugado") {
        const query = new URLSearchParams({
            produtoId: item.produtoId,
            retirada: s.dataRetirada,
            devolucao: s.dataDevolucao,
            solicitacaoId: item.id
        });
        return `<a class="btn-historico preenchido" href="../Finalizar-pagamento/index.html?${query.toString()}">
                    <i class="bi bi-credit-card"></i> Finalizar Pagamento
                </a>`;
    }
 
    return "";
}
 
renderizarHistorico();
 
// Se uma solicitação mudar de status em outra aba/página (aprovação,
// pagamento, retirada), o histórico se atualiza sozinho.
document.addEventListener("solicitacoesAtualizadas", renderizarHistorico);
 
// ================= AÇÕES DOS CARDS (delegação de eventos) =================
listaContainer.addEventListener("click", (e) => {
    const btnVer = e.target.closest(".ver-objeto");
    const btnConversar = e.target.closest(".conversar");
    const btnAvaliar = e.target.closest(".avaliar");
    const btnAprovar = e.target.closest(".aprovar-solicitacao");
    const btnRecusar = e.target.closest(".recusar-solicitacao");
    const btnCancelarLocacao = e.target.closest(".cancelar-locacao");
    const btnDenunciar = e.target.closest(".denunciar");
    const btnToggleFotos = e.target.closest(".toggle-fotos");
    const thumbClicada = e.target.closest(".fotos-thumb");
 
    if (thumbClicada) {
        // Reúne todas as fotos do mesmo grupo (mesma pessoa/etapa) pra
        // navegar entre elas dentro do modal com as setas.
        const grupo = thumbClicada.closest(".fotos-thumbs");
        const imgsDoGrupo = Array.from(grupo.querySelectorAll("img.fotos-thumb"));
        const imagens = imgsDoGrupo.map(img => img.src);
        const indice = imgsDoGrupo.indexOf(thumbClicada);
        abrirModalFotosHistorico(imagens, indice);
        return;
    }
 
    if (btnToggleFotos) {
        const secao = document.getElementById(`fotos-secao-${btnToggleFotos.dataset.aluguelId}`);
        if (!secao) return;
        const agoraOculto = secao.classList.toggle("oculto");
        btnToggleFotos.classList.toggle("oculto", agoraOculto);
        btnToggleFotos.innerHTML = agoraOculto
            ? `Mostrar fotos <i class="bi bi-chevron-up"></i>`
            : `Ocultar fotos <i class="bi bi-chevron-up"></i>`;
        return;
    }
 
    if (btnConversar) {
        const query = new URLSearchParams({
            userId: btnConversar.dataset.userId,
            userName: btnConversar.dataset.userName,
            produtoId: btnConversar.dataset.produtoId,
            produtoTitulo: btnConversar.dataset.produtoTitulo
        });
        window.location.href = `../Mensagens/index.html?${query.toString()}`;
        return;
    }
 
    if (btnCancelarLocacao) {
        abrirModalCancelar(Number(btnCancelarLocacao.dataset.solicitacaoId));
        return;
    }
 
    if (btnDenunciar) {
        const query = new URLSearchParams({
            tipo: "denuncia",
            aluguelId: btnDenunciar.dataset.aluguelId,
            produtoId: btnDenunciar.dataset.produtoId,
            produtoTitulo: btnDenunciar.dataset.produtoTitulo,
            usuarioId: btnDenunciar.dataset.outraParteId,
            usuarioNome: btnDenunciar.dataset.outraParteNome
        });
        window.location.href = `../Suporte/index.html?${query.toString()}`;
        return;
    }
 
    if (btnAprovar) {
        // PONTO DE INTEGRAÇÃO COM O BACK-END:
        // PATCH /api/solicitacoes/:id { status: "aprovado" }
        const resultado = window.SolicitacoesVizin.responder(Number(btnAprovar.dataset.solicitacaoId), "aprovado");
        if (!resultado) {
            mostrarToast("Você tem uma devolução em atraso e não pode aprovar locações agora.", "erro");
            return;
        }
        mostrarToast("Solicitação aprovada ✔");
        return;
    }
 
    if (btnRecusar) {
        // PONTO DE INTEGRAÇÃO COM O BACK-END:
        // PATCH /api/solicitacoes/:id { status: "rejeitado" }
        window.SolicitacoesVizin.responder(Number(btnRecusar.dataset.solicitacaoId), "rejeitado");
        mostrarToast("Solicitação recusada");
        return;
    }
 
    if (btnVer) {
        window.location.href = `../Produto/index.html?id=${btnVer.dataset.produtoId}`;
        return;
    }

    if (btnAvaliar) {
        // PONTO DE INTEGRAÇÃO COM O BACK-END:
        // Abrir modal/página de avaliação, ou POST /api/alugueis/:id/avaliacao
        mostrarToast("Em breve: avaliação do aluguel");
        return;
    }
    // "Registrar Retirada" e "Finalizar Pagamento" agora são links reais
    // (<a href>), não precisam de handler aqui.
});
 
// ================= MODAL DE CONFIRMAÇÃO (CANCELAR LOCAÇÃO) =================
// A lista de aluguéis é toda montada via delegação de eventos (um único
// listener pra vários cards), então o modal também é único e reaproveitado:
// guardamos aqui o id da solicitação que está pendente de confirmação.
const modalCancelar = document.getElementById("modal-cancelar");
const modalCancelarTexto = document.getElementById("modal-cancelar-texto");
const modalCancelarVoltar = document.getElementById("modal-cancelar-voltar");
const modalCancelarConfirmar = document.getElementById("modal-cancelar-confirmar");
let solicitacaoIdParaCancelar = null;
 
// A mesma pergunta "cancelar locação?" tem consequências bem diferentes
// dependendo do momento: se ainda não houve pagamento (pendente/aprovado),
// não existe nenhum estorno a fazer — dizer "o valor será estornado" nesse
// caso é enganoso. Só ajustamos o texto (o cancelamento em si continua
// idêntico via SolicitacoesVizin.cancelar).
function abrirModalCancelar(solicitacaoId) {
    solicitacaoIdParaCancelar = solicitacaoId;
 
    const solicitacao = window.SolicitacoesVizin ? window.SolicitacoesVizin.obterPorId(solicitacaoId) : null;
 
    if (modalCancelarTexto) {
        modalCancelarTexto.textContent = (solicitacao && solicitacao.status === "pago")
            ? `Tem certeza que deseja cancelar esta locação? O valor de ${formatarPreco(solicitacao.total)} será estornado e o objeto voltará a ficar disponível.`
            : "Tem certeza que deseja cancelar este pedido de aluguel? Como ainda não houve pagamento, nada será cobrado. O objeto voltará a ficar disponível.";
    }
 
    modalCancelar.classList.add("show");
}
 
function fecharModalCancelar() {
    modalCancelar.classList.remove("show");
    solicitacaoIdParaCancelar = null;
}
 
modalCancelarVoltar.addEventListener("click", fecharModalCancelar);
 
modalCancelar.addEventListener("click", (e) => {
    if (e.target === modalCancelar) fecharModalCancelar();
});
 
modalCancelarConfirmar.addEventListener("click", () => {
    if (solicitacaoIdParaCancelar === null) return;
 
    modalCancelarConfirmar.disabled = true;
    modalCancelarConfirmar.textContent = "Cancelando...";
 
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // PATCH /api/solicitacoes/:id { status: "cancelado" }
    window.SolicitacoesVizin.cancelar(solicitacaoIdParaCancelar, usuarioLogado?.email);
 
    fecharModalCancelar();
    mostrarToast("Locação cancelada");
 
    modalCancelarConfirmar.disabled = false;
    modalCancelarConfirmar.textContent = "Cancelar Locação";
});
 
// ================= MODAL DE FOTOS (ver em tamanho original) =================
// Mesmo padrão do modal da página de Produto (produto.js -> criarModalFotos),
// só que aqui é genérico: qualquer grupo de fotos do card (retirada ou
// devolução, de qualquer uma das partes) pode abrir nele, passando o array
// de fotos daquele grupo e o índice clicado.
let modalFotosImagens = [];
let modalFotosIndice = 0;
 
function criarModalFotosHistorico() {
    if (document.getElementById("historico-modal-fotos")) return;
 
    const overlay = document.createElement("div");
    overlay.id = "historico-modal-fotos";
    overlay.style.cssText = "display:none;position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;align-items:center;justify-content:center;";
    overlay.innerHTML = `
        <button id="historico-modal-fechar" type="button" aria-label="Fechar"
            style="position:absolute;top:20px;right:24px;width:40px;height:40px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:24px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;">&times;</button>
        <button id="historico-modal-prev" type="button" aria-label="Foto anterior"
            style="position:absolute;top:50%;left:20px;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:26px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;">&lsaquo;</button>
        <img id="historico-modal-img" src="" alt="" style="width:88vw;height:88vh;max-width:88vw;max-height:88vh;object-fit:contain;border-radius:6px;">
        <button id="historico-modal-next" type="button" aria-label="Próxima foto"
            style="position:absolute;top:50%;right:20px;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:26px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;">&rsaquo;</button>
        <span id="historico-modal-contador"
            style="position:absolute;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(255,255,255,.15);color:#fff;padding:4px 14px;border-radius:14px;font-size:13px;"></span>
    `;
    document.body.appendChild(overlay);
 
    document.getElementById("historico-modal-fechar").addEventListener("click", fecharModalFotosHistorico);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fecharModalFotosHistorico(); });
    document.getElementById("historico-modal-prev").addEventListener("click", () => navegarModalFotosHistorico(-1));
    document.getElementById("historico-modal-next").addEventListener("click", () => navegarModalFotosHistorico(1));
 
    document.addEventListener("keydown", (e) => {
        if (overlay.style.display !== "flex") return;
        if (e.key === "Escape") fecharModalFotosHistorico();
        if (e.key === "ArrowLeft") navegarModalFotosHistorico(-1);
        if (e.key === "ArrowRight") navegarModalFotosHistorico(1);
    });
}
 
function abrirModalFotosHistorico(imagens, indiceInicial) {
    if (!imagens || !imagens.length) return;
    criarModalFotosHistorico();
    modalFotosImagens = imagens;
    modalFotosIndice = indiceInicial;
    atualizarModalFotosHistorico();
    document.getElementById("historico-modal-fotos").style.display = "flex";
    document.body.style.overflow = "hidden";
}
 
function fecharModalFotosHistorico() {
    const overlay = document.getElementById("historico-modal-fotos");
    if (overlay) overlay.style.display = "none";
    document.body.style.overflow = "";
}
 
function navegarModalFotosHistorico(delta) {
    if (modalFotosImagens.length <= 1) return;
    modalFotosIndice = (modalFotosIndice + delta + modalFotosImagens.length) % modalFotosImagens.length;
    atualizarModalFotosHistorico();
}
 
function atualizarModalFotosHistorico() {
    document.getElementById("historico-modal-img").src = modalFotosImagens[modalFotosIndice];
    const contador = document.getElementById("historico-modal-contador");
    const prevBtn = document.getElementById("historico-modal-prev");
    const nextBtn = document.getElementById("historico-modal-next");
    const multiplo = modalFotosImagens.length > 1;
    contador.textContent = `${modalFotosIndice + 1}/${modalFotosImagens.length}`;
    contador.style.display = multiplo ? "block" : "none";
    prevBtn.style.display = multiplo ? "flex" : "none";
    nextBtn.style.display = multiplo ? "flex" : "none";
}
 
// ================= TOAST =================
function mostrarToast(mensagem, tipo = "sucesso") {
    const toast = document.getElementById("toast");
    if (!toast) return;
 
    toast.innerText = mensagem;
    toast.className = `toast show ${tipo}`;
 
    setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}