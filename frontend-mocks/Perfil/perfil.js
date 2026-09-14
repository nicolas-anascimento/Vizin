// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    window.location.href = "../Login/index.html";
}
 
// ================= HELPER: escapar texto p/ evitar quebra de HTML =================
function escaparHTMLPerfil(texto) {
    const div = document.createElement('div');
    div.textContent = texto || "";
    return div.innerHTML;
}
 
// ================= HELPERS DE VALIDAÇÃO (e-mail / telefone) =================
// Mesmas regras usadas no cadastro (Login/login.js). Copiadas aqui porque
// perfil.js não carrega login.js — se algum dia isso virar um módulo
// compartilhado, dá pra extrair pra um arquivo único tipo "validadores.js".
function somenteNumerosPerfil(valor) {
    return (valor || "").replace(/\D/g, "");
}
 
function formatarWhatsappPerfil(valor) {
    let v = somenteNumerosPerfil(valor).slice(0, 11);
    v = v.replace(/^(\d{2})(\d)/, "($1) $2");
    v = v.replace(/(\d{5})(\d{1,4})$/, "$1-$2");
    return v;
}
 
function validarWhatsappPerfil(whatsapp) {
    const numeros = somenteNumerosPerfil(whatsapp);
    return numeros.length === 10 || numeros.length === 11;
}
 
function validarEmailPerfil(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
 
// ================= USUÁRIO LOGADO =================
// O login.js já salva o usuário real (nome, email) no localStorage após o
// login/cadastro. Aqui eu pego esses dados reais e completo com valores mock
// só nos campos que o back-end ainda não fornece (bio, avatar, estatísticas).
// A avaliação média/total NÃO é mais mock — é calculada de verdade a partir
// de AvaliacoesVizin.obterAvaliacoesRecebidasComoLocatario (ver mais abaixo).
// As estatísticas (objetos alugados/anunciados/taxa de resposta) também não
// são mais mock — vêm de calcularEstatisticas (ver mais abaixo).
const usuarioSalvo = JSON.parse(localStorage.getItem("usuario") || "null") || {};
 
const usuarioLogado = {
    id: usuarioSalvo.id || usuarioSalvo.email || "joao",
    nome: usuarioSalvo.nome || "João Silva",
    email: usuarioSalvo.email || "felipe.senna@eaportal.org",
    // E-mail pendente de confirmação (fica != null enquanto a pessoa não
    // clica no link enviado pro endereço novo). Enquanto pendente, o
    // e-mail "oficial" (usado pra login/contato) continua sendo o antigo.
    emailPendente: usuarioSalvo.emailPendente || null,
    telefone: usuarioSalvo.telefone || "",
    bio: usuarioSalvo.bio || "Usuário ativo na plataforma Vizin",
    avatarUrl: usuarioSalvo.avatarUrl || null,
    membroDesde: usuarioSalvo.membroDesde || "14/01/2025",
    // PONTO DE INTEGRAÇÃO COM O BACK-END: viria de GET /api/usuarios/me
    // (ex: conta suspensa por denúncia, violação dos termos etc. — ver
    // também a notificação "bloqueio_conta").
    suspenso: usuarioSalvo.suspenso ?? false
};
 
const dadosCalculadosLogado = calcularEstatisticas(usuarioLogado.email);
usuarioLogado.stats = dadosCalculadosLogado.stats;
usuarioLogado.objetosAnunciados = dadosCalculadosLogado.objetosAnunciados;
 
// ================= VERIFICAÇÃO DE CONTA =================
// Fonte da verdade: a mesma chave lida/escrita por Verificacao/verificacao.js.
// estadoVerificacao.status pode ser "nao_verificado" | "em_analise" |
// "verificado" | "reprovado". usuarioLogado.verificado continua existindo
// (== status === "verificado") só pra não quebrar o resto do arquivo, que
// já checava esse booleano pra mostrar o selo ao lado do nome.
function obterEstadoVerificacao(email) {
    return JSON.parse(localStorage.getItem(`vizin_verificacao_${email}`) || "null") || { status: "nao_verificado" };
}
 
const estadoVerificacaoLogado = obterEstadoVerificacao(usuarioLogado.email);
usuarioLogado.statusVerificacao = estadoVerificacaoLogado.status;
usuarioLogado.motivoReprovacaoVerificacao = estadoVerificacaoLogado.motivoReprovacao || null;
usuarioLogado.verificado = estadoVerificacaoLogado.status === "verificado";
 
// ================= AVALIAÇÕES REAIS (do próprio usuário logado) =================
// Só as avaliações recebidas COMO LOCATÁRIO entram aqui — não misturamos
// com as avaliações que os objetos anunciados por ele recebem dos
// locatários deles (essas ficam só na própria página do objeto/Produto).
const avaliacoesReaisLogado = (window.AvaliacoesVizin && window.SolicitacoesVizin)
    ? window.AvaliacoesVizin.obterAvaliacoesRecebidasComoLocatario(usuarioLogado.email)
    : { media: 0, total: 0, lista: [] };
 
usuarioLogado.avaliacaoMedia = avaliacoesReaisLogado.media;
usuarioLogado.avaliacaoTotal = avaliacoesReaisLogado.total;
usuarioLogado.avaliacoes = avaliacoesReaisLogado.lista.map(av => ({
    nome: av.nomeAvaliador || "Usuário",
    email: av.emailAvaliador || null,
    data: new Date(av.data).toLocaleDateString("pt-BR"),
    nota: av.nota,
    comentario: av.comentario
}));
 
// ================= ESTATÍSTICAS E OBJETOS ANUNCIADOS (DADOS REAIS) =================
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Isso viria pronto do back-end (ex: GET /api/usuarios/:id/estatisticas).
// Por enquanto calculamos a partir do que já existe no front:
//   - anunciados: quantidade de objetos que o usuário tem cadastrados (ObjetosVizin)
//   - alugados: quantos alugueis esse usuário já concluiu como locatário (SolicitacoesVizin)
//   - taxaResposta: aproximação a partir dos pedidos que ele recebeu como
//     proprietário (quantos já foram respondidos, aprovados ou rejeitados,
//     em vez de ficarem pendentes). O ideal no back-end é medir isso pelo
//     tempo médio de resposta, não só pelo status atual.
function calcularEstatisticas(email) {
    const objetosDoUsuario = window.ObjetosVizin ? window.ObjetosVizin.obterDoProprietario(email) : [];
 
    let alugados = 0;
    let taxaResposta = null; // null = ainda não há dados suficientes pra calcular
 
    if (window.SolicitacoesVizin) {
        const todasSolicitacoes = window.SolicitacoesVizin.obterTodas();
 
        alugados = todasSolicitacoes.filter(s => s.solicitanteEmail === email && s.status === "concluido").length;
 
        const pedidosRecebidos = todasSolicitacoes.filter(s => s.proprietarioEmail === email);
        if (pedidosRecebidos.length > 0) {
            const respondidos = pedidosRecebidos.filter(s => s.status !== "pendente").length;
            taxaResposta = Math.round((respondidos / pedidosRecebidos.length) * 100);
        }
    }
 
    return {
        stats: { alugados, anunciados: objetosDoUsuario.length, taxaResposta },
        objetosAnunciados: objetosDoUsuario
    };
}
 
// ================= MOCK DE OUTROS USUÁRIOS =================
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Trocar por: GET /api/usuarios/:id
const outrosUsuariosMockBase = {
    "maria-santos": {
        id: "maria-santos",
        nome: "Maria Santos",
        email: "maria.santos@email.com",
        telefone: "(11) 98888-7766",
        bio: "Adoro compartilhar meus equipamentos com a vizinhança.",
        avatarUrl: null,
        membroDesde: "03/06/2024",
        verificado: true,
        suspenso: false
    }
};
 
// ================= DETERMINAR MODO (PRÓPRIO PERFIL X OUTRO USUÁRIO) =================
const params = new URLSearchParams(window.location.search);
const idParam = params.get("id");
 
const ehProprioPerfilPorId = !idParam || idParam === usuarioLogado.id || idParam === usuarioLogado.email;
 
// ================= [SÓ PARA TESTES] TOGGLE DONO/VISITANTE =================
// TODO: remover quando integrar com o back-end real. Deixa testar como a
// própria página de perfil aparece pro dono da conta (com modo de edição)
// e pra um visitante (somente leitura), sem precisar trocar de usuário de
// verdade nem mexer na URL. Os DADOS exibidos continuam vindo de
// usuarioExibido normalmente — esse toggle só força a visibilidade das
// ações de edição (e o filtro de objetos indisponíveis, ver
// objetosVisiveisParaPerfil). Importante: a checagem de "é dono de
// verdade" pra decidir o que persiste no localStorage usa sempre
// ehProprioPerfilPorId, NUNCA ehProprioPerfil — senão simular "Dono da
// conta" no perfil de outra pessoa e salvar uma edição sobrescreveria os
// dados da SUA conta de verdade.
const CHAVE_SIM_PERFIL = "vizin_sim_perfil_override";
const simPerfilOverride = sessionStorage.getItem(CHAVE_SIM_PERFIL); // "dono" | "visitante" | null
 
const ehProprioPerfil = simPerfilOverride ? simPerfilOverride === "dono" : ehProprioPerfilPorId;
 
let usuarioExibido;
 
if (ehProprioPerfilPorId) {
    usuarioExibido = usuarioLogado;
} else {
    const base = outrosUsuariosMockBase[idParam] || { id: idParam, nome: "Usuário não encontrado", email: idParam, telefone: "", bio: "", avatarUrl: null, membroDesde: "-", verificado: false, suspenso: false };
 
    // Avaliações reais também pro perfil de outra pessoa — só as que ela
    // recebeu como locatária, mesma regra do próprio perfil.
    const avaliacoesReaisOutro = (window.AvaliacoesVizin && window.SolicitacoesVizin)
        ? window.AvaliacoesVizin.obterAvaliacoesRecebidasComoLocatario(base.email)
        : { media: 0, total: 0, lista: [] };
 
    const dadosCalculadosOutro = calcularEstatisticas(base.email);
 
    usuarioExibido = {
        ...base,
        stats: dadosCalculadosOutro.stats,
        objetosAnunciados: dadosCalculadosOutro.objetosAnunciados,
        avaliacaoMedia: avaliacoesReaisOutro.media,
        avaliacaoTotal: avaliacoesReaisOutro.total,
        avaliacoes: avaliacoesReaisOutro.lista.map(av => ({
            nome: av.nomeAvaliador || "Usuário",
            email: av.emailAvaliador || null,
            data: new Date(av.data).toLocaleDateString("pt-BR"),
            nota: av.nota,
            comentario: av.comentario
        }))
    };
}
 
// Só mostra objetos indisponíveis pra quem está gerenciando o próprio
// anúncio — pro visitante, ver "Indisponível" num objeto que ele não pode
// alugar mesmo é ruído. Respeita o toggle de simulação de propósito: é
// assim que dá pra conferir exatamente o que um visitante veria.
function objetosVisiveisParaPerfil(usuario) {
    const todos = usuario.objetosAnunciados || [];
    return ehProprioPerfil ? todos : todos.filter(o => o.disponivel);
}
 
// ================= ELEMENTOS ================
const elAvatarImg = document.getElementById("perfil-avatar-img");
const elAvatarInicial = document.getElementById("perfil-avatar-inicial");
const elNomeView = document.getElementById("perfil-nome-view");
const elEmail = document.getElementById("perfil-email");
const elTelefone = document.getElementById("perfil-telefone");
const elEmailPendente = document.getElementById("perfil-email-pendente");
const elEmailPendenteValor = document.getElementById("perfil-email-pendente-valor");
const elAvaliacaoMedia = document.getElementById("perfil-avaliacao-media");
const elAvaliacaoTotal = document.getElementById("perfil-avaliacao-total");
const elMembroDesde = document.getElementById("perfil-membro-desde");
const elVerificado = document.getElementById("perfil-verificado");
const elBioView = document.getElementById("perfil-bio-view");
const elStatAlugados = document.getElementById("stat-alugados");
const elStatAnunciados = document.getElementById("stat-anunciados");
const elStatResposta = document.getElementById("stat-resposta");
const elListaAvaliacoes = document.getElementById("lista-avaliacoes");
const elAvaliacoesContagem = document.getElementById("avaliacoes-contagem");
const elListaObjetos = document.getElementById("lista-objetos-anunciados");
const elObjetosContagem = document.getElementById("objetos-anunciados-contagem");
const elBtnMostrarMaisObjetos = document.getElementById("btn-mostrar-mais-objetos");
const elBtnMostrarMaisAvaliacoes = document.getElementById("btn-mostrar-mais-avaliacoes");
const elCtaVerificacao = document.getElementById("cta-verificacao");
const btnVerificarConta = document.getElementById("btn-verificar-conta");
const elBannerSuspenso = document.getElementById("banner-suspenso");
const elBannerSuspensoTexto = document.getElementById("banner-suspenso-texto");
const elBtnDenunciar = document.getElementById("btn-denunciar-usuario");
const elBtnConversar = document.getElementById("btn-conversar-usuario");
const btnRemoverFoto = document.getElementById("btn-remover-foto");
const bioContadorEl = document.getElementById("bio-contador");
const elCardConfiguracoes = document.getElementById("card-configuracoes");
 
const btnEditarPerfil = document.getElementById("btn-editar-perfil");
const perfilEditActions = document.getElementById("perfil-edit-actions");
const avatarCameraBtn = document.getElementById("btn-trocar-foto");
 
// Listas completas mantidas à parte pra alimentar os botões "mostrar mais"
// sem precisar refazer o filtro/consulta toda vez que a pessoa clica.
const LIMITE_OBJETOS_VISIVEIS = 6;
const LIMITE_AVALIACOES_VISIVEIS = 5;
let mostrarTodosObjetos = false;
let mostrarTodasAvaliacoes = false;
let objetosAtuais = [];
let avaliacoesAtuais = [];
 
// ================= RENDERIZAR DADOS =================
function renderizarPerfil(usuario) {
    if (usuario.avatarUrl) {
        elAvatarImg.src = usuario.avatarUrl;
        elAvatarImg.style.display = "block";
        elAvatarInicial.style.display = "none";
    } else {
        elAvatarImg.style.display = "none";
        elAvatarInicial.style.display = "block";
        elAvatarInicial.textContent = usuario.nome.charAt(0).toUpperCase();
    }
 
    elNomeView.textContent = usuario.nome;
    elEmail.textContent = usuario.email;
 
    // Telefone: no próprio perfil sempre aparece pro dono. No perfil de
    // outra pessoa, por privacidade, só mostramos se ela tiver decidido
    // deixar público (ver Privacidade/index.html) — aqui, na ausência
    // dessa integração, mantemos oculto pra visitante como padrão seguro.
    if (elTelefone) {
        if (ehProprioPerfil) {
            elTelefone.textContent = usuario.telefone || "Nenhum telefone cadastrado";
        } else {
            elTelefone.textContent = "";
        }
    }
 
    if (elEmailPendente) {
        if (ehProprioPerfil && usuario.emailPendente) {
            elEmailPendente.style.display = "flex";
            elEmailPendenteValor.textContent = usuario.emailPendente;
        } else {
            elEmailPendente.style.display = "none";
        }
    }
 
    elAvaliacaoMedia.textContent = usuario.avaliacaoTotal > 0 ? usuario.avaliacaoMedia.toFixed(1) : "Novo";
    elAvaliacaoTotal.textContent = usuario.avaliacaoTotal;
    elMembroDesde.textContent = usuario.membroDesde;
    elVerificado.style.display = usuario.verificado ? "inline-flex" : "none";
    elBioView.textContent = usuario.bio;
 
    elStatAlugados.textContent = usuario.stats.alugados;
    elStatAnunciados.textContent = usuario.stats.anunciados;
    elStatResposta.textContent = usuario.stats.taxaResposta === null ? "Ainda sem pedidos" : `${usuario.stats.taxaResposta}%`;
 
    // CTA de verificação: só faz sentido pro próprio dono da conta. O
    // conteúdo muda conforme o estado real (ver Verificacao/verificacao.js):
    // "nao_verificado" -> convite pra verificar; "em_analise" -> avisa que
    // está em análise; "reprovado" -> mostra o motivo e convida a tentar de
    // novo; "verificado" -> esconde o card (o selo ao lado do nome já basta).
    if (elCtaVerificacao) {
        const status = usuario.statusVerificacao || "nao_verificado";
 
        if (!ehProprioPerfil || status === "verificado") {
            elCtaVerificacao.style.display = "none";
        } else {
            elCtaVerificacao.style.display = "flex";
 
            const elIcone = document.getElementById("cta-verificacao-icone");
            const elTitulo = document.getElementById("cta-verificacao-titulo");
            const elTexto = document.getElementById("cta-verificacao-texto");
 
            if (status === "em_analise") {
                elIcone.className = "bi bi-hourglass-split";
                elTitulo.textContent = "Documentos em análise";
                elTexto.textContent = "Recebemos seus documentos e estamos conferindo suas informações. Isso pode levar até 48 horas.";
                btnVerificarConta.textContent = "Ver status";
            } else if (status === "reprovado") {
                elIcone.className = "bi bi-patch-exclamation-fill";
                elTitulo.textContent = "Não foi possível verificar sua conta";
                elTexto.textContent = usuario.motivoReprovacaoVerificacao || "Reveja seus documentos e tente novamente.";
                btnVerificarConta.textContent = "Tentar novamente";
            } else {
                elIcone.className = "bi bi-patch-exclamation-fill";
                elTitulo.textContent = "Verifique sua conta";
                elTexto.textContent = "Contas verificadas passam mais confiança pra quem vai alugar seus objetos ou alugar de você.";
                btnVerificarConta.textContent = "Verificar Conta";
            }
        }
    }
 
    // Banner de conta suspensa — texto muda dependendo de ser a sua conta
    // ou a de outra pessoa.
    if (elBannerSuspenso) {
        if (usuario.suspenso) {
            elBannerSuspenso.style.display = "flex";
            elBannerSuspensoTexto.textContent = ehProprioPerfil
                ? "Sua conta está suspensa. Algumas ações ficam bloqueadas até a análise ser concluída."
                : "Esta conta está suspensa.";
        } else {
            elBannerSuspenso.style.display = "none";
        }
    }
 
    // Botão de remover foto só aparece pro dono, e só quando já existe uma
    // foto pra remover.
    if (btnRemoverFoto) {
        btnRemoverFoto.style.display = (ehProprioPerfil && usuario.avatarUrl) ? "flex" : "none";
    }
 
    // Card de configurações (Minha conta, Notificações, Privacidade,
    // Pagamento, Termos) só faz sentido pro dono da conta.
    if (elCardConfiguracoes) {
        elCardConfiguracoes.style.display = ehProprioPerfil ? "block" : "none";
    }
 
    renderizarAvaliacoes(usuario.avaliacoes);
}
 
// ================= RENDERIZAR AVALIAÇÕES (COM "MOSTRAR MAIS") =================
function renderizarAvaliacoes(avaliacoesCompletas) {
    avaliacoesAtuais = avaliacoesCompletas;
 
    elAvaliacoesContagem.textContent = avaliacoesCompletas.length > 0
        ? `${avaliacoesCompletas.length} ${avaliacoesCompletas.length === 1 ? "avaliação" : "avaliações"}`
        : "";
 
    elListaAvaliacoes.innerHTML = "";
 
    if (avaliacoesCompletas.length === 0) {
        elListaAvaliacoes.innerHTML = `<p class="perfil-bio-view">Ainda não recebeu avaliações.</p>`;
        elBtnMostrarMaisAvaliacoes.style.display = "none";
        return;
    }
 
    const avaliacoesVisiveis = mostrarTodasAvaliacoes
        ? avaliacoesCompletas
        : avaliacoesCompletas.slice(0, LIMITE_AVALIACOES_VISIVEIS);
 
    avaliacoesVisiveis.forEach(av => {
        // Nome e comentário vêm de texto livre digitado por outro usuário
        // (ver Avaliacao/avaliacao.js) — precisam ser escapados antes de
        // ir pro innerHTML, senão viram uma brecha de XSS.
        const nomeSeguro = escaparHTMLPerfil(av.nome);
        const comentarioSeguro = escaparHTMLPerfil(av.comentario);
 
        // Se soubermos o e-mail de quem avaliou, avatar e nome viram um
        // link pro perfil dessa pessoa — permite acessar a conta de
        // quem fez a avaliação direto por aqui.
        const linkPerfilAvaliador = av.email ? `../Perfil/index.html?id=${encodeURIComponent(av.email)}` : null;
 
        const avatarHtml = linkPerfilAvaliador
            ? `<a class="avaliacao-avatar-link" href="${linkPerfilAvaliador}" title="Ver perfil de ${nomeSeguro}"><div class="avaliacao-avatar">${nomeSeguro.charAt(0).toUpperCase()}</div></a>`
            : `<div class="avaliacao-avatar">${nomeSeguro.charAt(0).toUpperCase()}</div>`;
 
        const nomeHtml = linkPerfilAvaliador
            ? `<a class="avaliacao-nome avaliacao-nome-link" href="${linkPerfilAvaliador}">${nomeSeguro}</a>`
            : `<p class="avaliacao-nome">${nomeSeguro}</p>`;
 
        const item = document.createElement("div");
        item.className = "avaliacao-item";
        item.innerHTML = `
            ${avatarHtml}
            <div>
                <div class="avaliacao-topo">
                    <div>
                        ${nomeHtml}
                        <p class="avaliacao-data">${av.data}</p>
                    </div>
                    <span class="avaliacao-nota"><i class="bi bi-star-fill"></i> ${av.nota.toFixed(1)}</span>
                </div>
                <p class="avaliacao-comentario">${comentarioSeguro}</p>
            </div>
        `;
        elListaAvaliacoes.appendChild(item);
    });
 
    const restantes = avaliacoesCompletas.length - avaliacoesVisiveis.length;
    elBtnMostrarMaisAvaliacoes.style.display = restantes > 0 ? "block" : "none";
    elBtnMostrarMaisAvaliacoes.textContent = `Mostrar mais ${restantes} avaliaç${restantes > 1 ? "ões" : "ão"}`;
}
 
elBtnMostrarMaisAvaliacoes.addEventListener("click", () => {
    mostrarTodasAvaliacoes = true;
    renderizarAvaliacoes(avaliacoesAtuais);
});
 
// ================= RENDERIZAR OBJETOS ANUNCIADOS (COM "MOSTRAR MAIS") =================
function renderizarObjetosAnunciados(objetosCompletos) {
    objetosAtuais = objetosCompletos;
 
    elObjetosContagem.textContent = objetosCompletos.length > 0
        ? `${objetosCompletos.length} ${objetosCompletos.length === 1 ? "objeto" : "objetos"}`
        : "";
 
    elListaObjetos.innerHTML = "";
 
    if (objetosCompletos.length === 0) {
        elListaObjetos.innerHTML = `<p class="objetos-anunciados-vazio">Nenhum objeto anunciado ainda.</p>`;
        elBtnMostrarMaisObjetos.style.display = "none";
        return;
    }
 
    const objetosVisiveis = mostrarTodosObjetos
        ? objetosCompletos
        : objetosCompletos.slice(0, LIMITE_OBJETOS_VISIVEIS);
 
    objetosVisiveis.forEach(obj => {
        // Título vem de texto livre digitado pelo dono ao cadastrar o
        // objeto — escapado antes de ir pro innerHTML (mesmo cuidado já
        // tomado com nome/comentário de avaliações).
        const tituloSeguro = escaparHTMLPerfil(obj.titulo);
        const imagem = (obj.imagens && obj.imagens[0]) || obj.imagem || "../img/sem-imagem.jpg";
        const precoFormatado = Number(obj.preco_dia || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
 
        const card = document.createElement("a");
        card.className = "objeto-anunciado-card";
        card.href = `../Produto/index.html?id=${obj.id}`;
        card.innerHTML = `
            <img class="objeto-anunciado-img" src="${imagem}" alt="${tituloSeguro}">
            <div class="objeto-anunciado-info">
                <p class="objeto-anunciado-titulo">${tituloSeguro}</p>
                <div class="objeto-anunciado-rodape">
                    <span class="objeto-anunciado-preco">${precoFormatado}/dia</span>
                    <span class="objeto-anunciado-badge ${obj.disponivel ? "" : "indisponivel"}">${obj.disponivel ? "Disponível" : "Indisponível"}</span>
                </div>
            </div>
        `;
        elListaObjetos.appendChild(card);
    });
 
    const restantes = objetosCompletos.length - objetosVisiveis.length;
    elBtnMostrarMaisObjetos.style.display = restantes > 0 ? "block" : "none";
    elBtnMostrarMaisObjetos.textContent = `Mostrar mais ${restantes} objeto${restantes > 1 ? "s" : ""}`;
}
 
elBtnMostrarMaisObjetos.addEventListener("click", () => {
    mostrarTodosObjetos = true;
    renderizarObjetosAnunciados(objetosAtuais);
});
 
renderizarPerfil(usuarioExibido);
renderizarObjetosAnunciados(objetosVisiveisParaPerfil(usuarioExibido));
 
// Chegando aqui a partir do link "Ver detalhes" de uma notificação de
// avaliação recebida (ver Notificacoes/notificacoes.js), rola direto até a
// seção de avaliações em vez de deixar a pessoa procurar na página.
if (window.location.hash === "#avaliacoes-secao") {
    document.getElementById("avaliacoes-secao")?.scrollIntoView({ behavior: "smooth", block: "start" });
}
 
// Mantém a lista de objetos e as estatísticas em sincronia caso algo mude
// em outra aba (ex: o usuário edita/exclui um objeto em "Meus Objetos" e
// volta pro Perfil sem recarregar a página). Usa ehProprioPerfilPorId (e
// não a flag simulada) porque isso só faz sentido pros SEUS objetos de
// verdade.
document.addEventListener("objetosAtualizados", () => {
    if (!ehProprioPerfilPorId) return;
    const dadosAtualizados = calcularEstatisticas(usuarioExibido.email);
    usuarioExibido.stats = dadosAtualizados.stats;
    usuarioExibido.objetosAnunciados = dadosAtualizados.objetosAnunciados;
    renderizarPerfil(usuarioExibido);
    renderizarObjetosAnunciados(objetosVisiveisParaPerfil(usuarioExibido));
});
 
// ================= EXIBIR OU OCULTAR AÇÕES DE EDIÇÃO =================
if (!ehProprioPerfil) {
    btnEditarPerfil.style.display = "none";
    avatarCameraBtn.style.display = "none";
    if (btnRemoverFoto) btnRemoverFoto.style.display = "none";
 
    // Perfil de outra pessoa: mostra "Conversar" (abre/retoma o chat com
    // essa pessoa em Mensagens — sem produtoId, já que não parte de um
    // objeto específico) e "Denunciar" no lugar das ações de edição.
    if (elBtnConversar) {
        elBtnConversar.style.display = "inline-flex";
        const paramsConversa = new URLSearchParams({
            userId: usuarioExibido.email || "",
            userName: usuarioExibido.nome || ""
        });
        elBtnConversar.href = `../Mensagens/index.html?${paramsConversa.toString()}`;
    }
 
    if (elBtnDenunciar) {
        elBtnDenunciar.style.display = "inline-flex";
        // usuarioNome vai junto pra Suporte poder mostrar um chip tipo
        // "Denunciando: Maria Silva" em vez da pessoa ter que digitar de
        // novo quem ela está denunciando (ver Suporte/suporte.js).
        const paramsDenuncia = new URLSearchParams({
            tipo: "denuncia",
            usuarioId: usuarioExibido.email || "",
            usuarioNome: usuarioExibido.nome || ""
        });
        elBtnDenunciar.href = `../Suporte/index.html?${paramsDenuncia.toString()}`;
    }
} else if (usuarioExibido.suspenso) {
    // É o dono, mas a conta está suspensa: edição fica bloqueada até a
    // suspensão ser resolvida (mesmo padrão de "ação bloqueada" já usado
    // em outras telas, ex: excluir objeto com locação ativa).
    btnEditarPerfil.disabled = true;
    btnEditarPerfil.title = "Edição bloqueada enquanto sua conta está suspensa.";
}
 
const togglePerfilEls = document.querySelectorAll(".sim-perfil-btn");
const papelSimuladoAtual = simPerfilOverride || (ehProprioPerfilPorId ? "dono" : "visitante");
togglePerfilEls.forEach(btn => {
    btn.classList.toggle("ativo", btn.dataset.papel === papelSimuladoAtual);
    btn.addEventListener("click", () => {
        sessionStorage.setItem(CHAVE_SIM_PERFIL, btn.dataset.papel);
        location.reload();
    });
});
 
// ================= CTA DE VERIFICAÇÃO DE CONTA =================
if (btnVerificarConta) {
    btnVerificarConta.addEventListener("click", () => {
        window.location.href = "../Verificacao-da-conta/index.html";
    });
}
 
// ================= MODO EDIÇÃO =================
const nomeInputEl = document.getElementById("input-nome");
const emailInputEl = document.getElementById("input-email");
const telefoneInputEl = document.getElementById("input-telefone");
const bioInputEl = document.getElementById("input-bio");
const campoNomeEdicao = document.getElementById("campo-nome-edicao");
const campoEmailEdicao = document.getElementById("campo-email-edicao");
const campoTelefoneEdicao = document.getElementById("campo-telefone-edicao");
const campoBioEdicao = document.getElementById("campo-bio-edicao");
 
if (telefoneInputEl) {
    telefoneInputEl.addEventListener("input", () => {
        telefoneInputEl.value = formatarWhatsappPerfil(telefoneInputEl.value);
    });
}
 
function entrarModoEdicao() {
    nomeInputEl.value = usuarioExibido.nome;
    emailInputEl.value = usuarioExibido.email;
    telefoneInputEl.value = usuarioExibido.telefone || "";
    bioInputEl.value = usuarioExibido.bio;
    if (bioContadorEl) bioContadorEl.textContent = bioInputEl.value.length;
 
    campoNomeEdicao.style.display = "block";
    campoEmailEdicao.style.display = "block";
    campoTelefoneEdicao.style.display = "block";
    campoBioEdicao.style.display = "block";
    elBioView.style.display = "none";
 
    btnEditarPerfil.style.display = "none";
    perfilEditActions.style.display = "flex";
}
 
function sairModoEdicao() {
    campoNomeEdicao.style.display = "none";
    campoEmailEdicao.style.display = "none";
    campoTelefoneEdicao.style.display = "none";
    campoBioEdicao.style.display = "none";
    elBioView.style.display = "block";
 
    btnEditarPerfil.style.display = "inline-flex";
    perfilEditActions.style.display = "none";
}
 
btnEditarPerfil.addEventListener("click", entrarModoEdicao);
 
if (bioInputEl && bioContadorEl) {
    bioInputEl.addEventListener("input", () => {
        bioContadorEl.textContent = bioInputEl.value.length;
    });
}
 
// ================= CONFIRMAÇÃO AO DESCARTAR EDIÇÃO =================
// Clicar em "Cancelar" apagava o que a pessoa tinha digitado sem avisar.
// Agora só sai direto se nada mudou; se algum campo foi alterado, pede
// confirmação antes de descartar (mesmo padrão visual de modal já usado
// em outras telas — Excluir Objeto, Cancelar Locação etc.).
const modalDescartar = document.getElementById("modal-descartar-edicao");
 
function abrirModalDescartar() {
    modalDescartar.classList.add("show");
}
 
function fecharModalDescartar() {
    modalDescartar.classList.remove("show");
}
 
document.getElementById("btn-cancelar-edicao").addEventListener("click", () => {
    const nomeMudou = nomeInputEl.value.trim() !== usuarioExibido.nome;
    const emailMudou = emailInputEl.value.trim() !== usuarioExibido.email;
    const telefoneMudou = telefoneInputEl.value.trim() !== (usuarioExibido.telefone || "");
    const bioMudou = bioInputEl.value.trim() !== usuarioExibido.bio;
 
    if (nomeMudou || emailMudou || telefoneMudou || bioMudou) {
        abrirModalDescartar();
    } else {
        sairModoEdicao();
    }
});
 
document.getElementById("modal-descartar-voltar").addEventListener("click", fecharModalDescartar);
 
modalDescartar.addEventListener("click", (e) => {
    if (e.target === modalDescartar) fecharModalDescartar();
});
 
document.getElementById("modal-descartar-confirmar").addEventListener("click", () => {
    fecharModalDescartar();
    sairModoEdicao();
});
 
document.getElementById("btn-salvar-edicao").addEventListener("click", async () => {
    const novoNome = nomeInputEl.value.trim();
    const novoEmail = emailInputEl.value.trim();
    const novoTelefone = telefoneInputEl.value.trim();
    const novaBio = bioInputEl.value.trim();
 
    if (!novoNome) {
        alert("O nome não pode ficar vazio.");
        return;
    }
 
    if (!novoEmail || !validarEmailPerfil(novoEmail)) {
        alert("Informe um e-mail válido.");
        return;
    }
 
    if (novoTelefone && !validarWhatsappPerfil(novoTelefone)) {
        alert("Informe um telefone válido, com DDD.");
        return;
    }
 
    // Trocar de e-mail é sensível o bastante pra merecer confirmação: em
    // vez de aplicar na hora, marca como "pendente" até a pessoa clicar
    // no link que (no back-end de verdade) seria enviado pro endereço
    // novo. Evita perder acesso à conta por causa de um e-mail digitado
    // errado.
    const emailMudou = novoEmail !== usuarioExibido.email;
 
    const btnSalvar = document.getElementById("btn-salvar-edicao");
    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando...";
 
    try {
        // PONTO DE INTEGRAÇÃO COM O BACK-END:
        // const response = await fetch("/api/usuarios/perfil", {
        //     method: "PUT",
        //     headers: {
        //         "Content-Type": "application/json",
        //         "Authorization": `Bearer ${localStorage.getItem("token")}`
        //     },
        //     body: JSON.stringify({ nome: novoNome, bio: novaBio, telefone: novoTelefone, email: novoEmail })
        // });
        // if (!response.ok) throw new Error("Erro ao salvar perfil");
        // O back-end real ainda devolveria emailPendente != null quando o
        // e-mail exigir confirmação, exatamente como simulamos abaixo.
 
        await new Promise(resolve => setTimeout(resolve, 800)); // simula envio
 
        usuarioExibido.nome = novoNome;
        usuarioExibido.bio = novaBio;
        usuarioExibido.telefone = novoTelefone;
 
        if (emailMudou) {
            usuarioExibido.emailPendente = novoEmail;
        }
 
        // Mantém o localStorage sincronizado, já que outras páginas leem
        // "usuario" de lá. IMPORTANTE: usa ehProprioPerfilPorId (identidade
        // real), não ehProprioPerfil (que pode estar forçado pelo toggle de
        // simulação) — senão, simular "Dono da conta" no perfil de outra
        // pessoa e salvar sobrescreveria os dados da SUA conta de verdade.
        if (ehProprioPerfilPorId) {
            const usuarioSalvoAtual = JSON.parse(localStorage.getItem("usuario") || "{}");
            localStorage.setItem("usuario", JSON.stringify({
                ...usuarioSalvoAtual,
                nome: novoNome,
                bio: novaBio,
                telefone: novoTelefone,
                emailPendente: emailMudou ? novoEmail : (usuarioSalvoAtual.emailPendente || null)
            }));
        }
 
        renderizarPerfil(usuarioExibido);
        sairModoEdicao();
 
        if (emailMudou) {
            alert(`Enviamos um link de confirmação para ${novoEmail}. Seu e-mail de acesso só muda depois que você confirmar.`);
        }
 
    } catch (err) {
        console.error(err);
        alert("Não foi possível salvar as alterações. Tente novamente.");
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Salvar";
    }
});
 
// ================= TROCAR / REMOVER FOTO DE PERFIL =================
const inputAvatar = document.getElementById("input-avatar");
const TAMANHO_MAXIMO_AVATAR_MB = 5;
 
avatarCameraBtn.addEventListener("click", () => inputAvatar.click());
 
inputAvatar.addEventListener("change", async (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo || !arquivo.type.startsWith("image/")) return;
 
    if (arquivo.size > TAMANHO_MAXIMO_AVATAR_MB * 1024 * 1024) {
        alert(`Essa imagem é muito grande. O tamanho máximo é ${TAMANHO_MAXIMO_AVATAR_MB}MB.`);
        inputAvatar.value = "";
        return;
    }
 
    // Preview imediato local
    const preview = URL.createObjectURL(arquivo);
    elAvatarImg.src = preview;
    elAvatarImg.style.display = "block";
    elAvatarInicial.style.display = "none";
    if (btnRemoverFoto) btnRemoverFoto.style.display = "flex";
 
    try {
        // PONTO DE INTEGRAÇÃO COM O BACK-END:
        // const formData = new FormData();
        // formData.append("avatar", arquivo, arquivo.name);
        // const response = await fetch("/api/usuarios/avatar", {
        //     method: "POST",
        //     headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` },
        //     body: formData
        // });
        // if (!response.ok) throw new Error("Erro ao enviar foto");
        // const data = await response.json();
        // usuarioExibido.avatarUrl = data.avatarUrl; // URL definitiva vinda do back-end
 
        usuarioExibido.avatarUrl = preview; // mock: mantém a preview local por enquanto
 
        if (ehProprioPerfilPorId) {
            const usuarioSalvoAtual = JSON.parse(localStorage.getItem("usuario") || "{}");
            localStorage.setItem("usuario", JSON.stringify({ ...usuarioSalvoAtual, avatarUrl: preview }));
        }
    } catch (err) {
        console.error(err);
        alert("Não foi possível atualizar a foto de perfil.");
    }
 
    inputAvatar.value = "";
});
 
if (btnRemoverFoto) {
    btnRemoverFoto.addEventListener("click", () => {
        usuarioExibido.avatarUrl = null;
 
        // PONTO DE INTEGRAÇÃO COM O BACK-END: DELETE /api/usuarios/avatar
        if (ehProprioPerfilPorId) {
            const usuarioSalvoAtual = JSON.parse(localStorage.getItem("usuario") || "{}");
            localStorage.setItem("usuario", JSON.stringify({ ...usuarioSalvoAtual, avatarUrl: null }));
        }
 
        renderizarPerfil(usuarioExibido);
    });
}
 