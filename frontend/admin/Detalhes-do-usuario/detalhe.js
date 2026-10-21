const escAdmin = valor => String(valor ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);


const CORES_AVATAR = ["#6D49F2", "#F27C38", "#3B82C4", "#1F9D66", "#B4770A", "#C4362B"];
const conteudo = document.getElementById("conteudoDetalhe");

const params = new URLSearchParams(window.location.search);
const idUsuario = params.get("id");

// ================= ROTAS USADAS NESTA TELA =================
//   objetosDoUsuario     GET /admin/objetos?proprietario_id=:id      (rota admin: inclui ocultos, arquivados e pausados)
//   avaliacoesDoObjeto   GET /objetos/:id/avaliacoes?page=&limit=    (mesma do avaliacoes-shared.js)
//   alugueisDoUsuario    GET /admin/usuarios/:id/alugueis?page=&limit=   (confirmado; mesmo DTO de /solicitacoes, limite máx. 100)
//   detalheDoObjeto      GET /objetos/:id                            (descrição, localização e fotos completas; admin vê ocultos/arquivados)
//   denúncias            listarOcorrenciasAdmin (denuncias-api.js) com denunciado_id
const ROTAS = {
    objetosDoUsuario: (id, pagina, limite) => `/admin/objetos?proprietario_id=${encodeURIComponent(id)}&page=${pagina}&limit=${limite}`,
    detalheDoObjeto: (id) => `/objetos/${encodeURIComponent(id)}`,
    avaliacoesDoObjeto: (id, pagina, limite) => `/objetos/${encodeURIComponent(id)}/avaliacoes?page=${pagina}&limit=${limite}`,
    alugueisDoUsuario: (id, pagina, limite) => `/admin/usuarios/${encodeURIComponent(id)}/alugueis?page=${pagina}&limit=${limite}`
};

function iniciais(nome) {
    return String(nome ?? "").split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("") || "?";
}

function corAvatar(id) {
    const indice = [...String(id)].reduce((soma, caractere) => soma + caractere.charCodeAt(0), 0);
    return CORES_AVATAR[indice % CORES_AVATAR.length];
}

function formatarData(iso) {
    if (!iso) return "—";
    // Data pura (AAAA-MM-DD): formata direto, sem passar por Date (evita voltar um dia por fuso).
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        const [ano, mes, dia] = iso.split("-");
        return `${dia}/${mes}/${ano}`;
    }
    // Timestamp completo: converte pro fuso do navegador (o que o usuário vê no perfil).
    const data = new Date(iso);
    return Number.isNaN(data.getTime()) ? "—" : data.toLocaleDateString("pt-BR");
}

function formatarMoeda(valor) {
    const n = Number(valor);
    if (valor === null || valor === undefined || !Number.isFinite(n)) return "—";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function labelStatus(status) {
    return { ativo: "Ativo", inativo: "Inativo" }[status] || status;
}

async function carregarDetalhe() {
    if (!idUsuario) {
        conteudo.innerHTML = `<p class="admin-tabela-vazio">Usuário não informado na URL.</p>`;
        return;
    }

    let usuario;
    try { usuario = await buscarUsuarioAdminPorId(idUsuario); }
    catch (err) {
        conteudo.innerHTML = `<p class="admin-tabela-vazio">${escAdmin(err.message)}</p>`;
        return;
    }
    // Mesmo mapeamento da lista (usuarios.js): ativo -> status, criado_em -> dataCadastro.
    usuario = { ...usuario, status: usuario.ativo ? 'ativo' : 'inativo', dataCadastro: usuario.criado_em };
    renderizarDetalhe(usuario);
}

// Verificação de conta. O back manda `verificado` (selo) e `verificacao`
// ({ id, status } do envio mais recente, ou null se nunca enviou). Sem
// `verificacao` (back ainda não atualizado), cai no boolean, como antes.
const VERIFICACAO_LABEL = { aprovado: "Verificado", pendente: "Em análise", rejeitado: "Reprovada" };

function campoVerificacao(usuario) {
    const v = usuario.verificacao || null;
    const status = usuario.verificado ? "aprovado" : (v && v.status);
    const revogada = !usuario.verificado && v && v.status === "rejeitado" && v.revogada;
    const label = revogada ? "Revogada" : (VERIFICACAO_LABEL[status] || "Não verificado");

    let link = "";
    if (v && v.id) {
        const texto = v.status === "pendente" ? "Analisar documentos" : "Ver análise";
        link = `<a class="detalhe-campo-link" href="/admin/verificacoes/analise?id=${encodeURIComponent(v.id)}">${texto}</a>`;
    }

    return `<div class="detalhe-campo"><span>Verificação</span><strong>${label}</strong>${link}</div>`;
}

// Perfil de administrador: conta da equipe, não participa da plataforma como
// usuário (não anuncia, não aluga, não é denunciado, não passa por verificação).
// Por isso mostra só os dados da conta, sem as seções de usuário comum, e sem
// suspender/excluir por aqui.
function renderizarDetalheAdmin(usuario) {
    conteudo.innerHTML = `
        <div class="detalhe-cabecalho">
            <div class="detalhe-avatar" style="background:${corAvatar(usuario.id)}">${window.avatarAdminHtml ? window.avatarAdminHtml(usuario.avatarUrl ?? usuario.avatar_url, iniciais(usuario.nome)) : iniciais(usuario.nome)}</div>
            <div class="detalhe-info">
                <h1>${escAdmin(usuario.nome)} <span class="admin-badge admin">Administrador</span></h1>
                <p>Conta da equipe desde ${formatarData(usuario.dataCadastro)}</p>
            </div>
        </div>

        <div class="detalhe-grid-info">
            <div class="detalhe-campo"><span>Email</span><strong>${escAdmin(usuario.email)}</strong></div>
            <div class="detalhe-campo"><span>Tipo</span><strong>Administrador</strong></div>
            <div class="detalhe-campo"><span>Data de Cadastro</span><strong>${formatarData(usuario.dataCadastro)}</strong></div>
        </div>

        <p class="detalhe-bloco-aviso"><i class="bi bi-info-circle"></i> Contas de administrador não anunciam itens, não alugam e não recebem denúncias, por isso não há histórico de usuário aqui. Também não é possível suspender ou excluir um administrador por esta tela.</p>
    `;
}

function renderizarDetalhe(usuario) {
    if (usuario.tipo === "admin") {
        renderizarDetalheAdmin(usuario);
        return;
    }

    conteudo.innerHTML = `
        <div class="detalhe-cabecalho">
            <div class="detalhe-avatar" style="background:${corAvatar(usuario.id)}">${window.avatarAdminHtml ? window.avatarAdminHtml(usuario.avatarUrl ?? usuario.avatar_url, iniciais(usuario.nome)) : iniciais(usuario.nome)}</div>
            <div class="detalhe-info">
                <h1>${escAdmin(usuario.nome)} <span class="admin-badge ${usuario.status}">${labelStatus(usuario.status)}</span></h1>
                <p>Cadastrado em ${formatarData(usuario.dataCadastro)}</p>
            </div>
            <div class="detalhe-acoes">
                <button class="admin-btn-secundario" id="btnAlterarStatus"><i class="bi bi-shield-lock"></i> Alterar status</button>
                <button class="admin-btn-perigo" id="btnExcluir"><i class="bi bi-trash"></i> Excluir</button>
            </div>
        </div>

        <div class="detalhe-grid-info">
            <div class="detalhe-campo"><span>Email</span><strong>${escAdmin(usuario.email)}</strong></div>
            <div class="detalhe-campo"><span>Tipo</span><strong>${usuario.tipo === 'admin' ? 'Administrador' : 'Usuário'}</strong></div>
            ${campoVerificacao(usuario)}
            <div class="detalhe-campo"><span>Data de Cadastro</span><strong>${formatarData(usuario.dataCadastro)}</strong></div>
        </div>

        <section class="detalhe-secao">
            <h2>Itens anunciados</h2>
            <div class="admin-card" id="secaoObjetos">
                <p class="admin-tabela-vazio">Carregando itens...</p>
            </div>
        </section>

        <section class="detalhe-secao">
            <h2>Histórico de aluguéis</h2>
            <div class="admin-card" id="secaoAlugueis">
                <p class="admin-tabela-vazio">Carregando aluguéis...</p>
            </div>
        </section>

        <section class="detalhe-secao">
            <h2>Denúncias recebidas</h2>
            <div class="admin-card" id="secaoDenuncias">
                <p class="admin-tabela-vazio">Carregando denúncias...</p>
            </div>
        </section>
    `;

    document.getElementById("btnAlterarStatus").addEventListener("click", () => {
        abrirModalStatus(usuario, () => carregarDetalhe());
    });

    document.getElementById("btnExcluir").addEventListener("click", () => {
        abrirModalExcluir(usuario, () => {
            window.location.href = "/admin/usuarios";
        });
    });

    carregarObjetos(usuario);
    carregarAlugueis(usuario);
    carregarDenuncias(usuario);
}

// =====================================================================
// UTILITÁRIOS COMPARTILHADOS PELAS 3 SEÇÕES
// =====================================================================
function extrairLista(corpo) {
    if (Array.isArray(corpo)) return corpo;
    return corpo?.dados || corpo?.items || corpo?.data || corpo?.objetos || corpo?.avaliacoes || [];
}

// Junta todas as páginas (até 10) de uma listagem. Aceita array puro ou
// { data|dados|items, total }. Ignora itens repetidos (se o back ignorar
// `page`, para em vez de repetir a mesma página).
async function buscarTodasAsPaginas(montarCaminho, mensagem, porPagina = 50) {
    const tudo = [];
    const vistos = new Set();
    let pagina = 1;
    let totalPaginas = 1;

    do {
        const corpo = await apiRequest(montarCaminho(pagina, porPagina), "GET", null, mensagem);
        const lista = extrairLista(corpo);

        const novos = lista.filter(item => {
            if (item?.id === null || item?.id === undefined) return true;
            const chave = String(item.id);
            if (vistos.has(chave)) return false;
            vistos.add(chave);
            return true;
        });
        tudo.push(...novos);
        if (lista.length > 0 && novos.length === 0) break;

        const total = Array.isArray(corpo) ? NaN : Number(corpo?.total ?? NaN);
        totalPaginas = Number.isFinite(total)
            ? Math.ceil(total / porPagina)
            : (lista.length >= porPagina ? pagina + 1 : pagina);
        pagina++;
    } while (pagina <= totalPaginas && pagina <= 10);

    return tudo;
}

// Link só se for http(s) ou caminho do próprio site (evita javascript: etc.).
function urlSegura(url) {
    const u = String(url ?? "").trim();
    return /^(https?:\/\/|\/)/i.test(u) ? u : null;
}

function campoModal(rotulo, valor) {
    return `<div><span>${escAdmin(rotulo)}</span><strong>${valor}</strong></div>`;
}

// Lista com botão "Mostrar mais". Cada item precisa de `id` (string) e o
// HTML devolvido por renderItem precisa de data-item-id="${id}".
function montarListaPaginada(alvo, { itens, passo, classeLista, renderItem, aoAbrir }) {
    alvo.innerHTML = `<div class="${classeLista}"></div><button type="button" class="detalhe-mostrar-mais" hidden></button>`;
    const lista = alvo.firstElementChild;
    const botao = alvo.lastElementChild;
    let visiveis = 0;

    function mostrarMais() {
        const proximos = itens.slice(visiveis, visiveis + passo);
        lista.insertAdjacentHTML("beforeend", proximos.map(renderItem).join(""));
        visiveis += proximos.length;
        const restantes = itens.length - visiveis;
        botao.hidden = restantes <= 0;
        botao.textContent = `Mostrar mais (${restantes})`;
    }

    lista.addEventListener("click", (e) => {
        const el = e.target.closest("[data-item-id]");
        if (!el) return;
        const item = itens.find(i => i.id === el.dataset.itemId);
        if (item) aoAbrir(item);
    });
    botao.addEventListener("click", mostrarMais);
    mostrarMais();
}

// =====================================================================
// MODAL (um só, reaproveitado por objeto / aluguel / denúncia)
// =====================================================================
let modalEl = null;
let tokenModal = 0;
let galeriaImagens = [];
let galeriaIndice = 0;

function garantirModal() {
    if (modalEl) return modalEl;

    modalEl = document.createElement("div");
    modalEl.className = "detalhe-modal-overlay";
    modalEl.innerHTML = `
        <div class="detalhe-modal-box" role="dialog" aria-modal="true">
            <button type="button" class="detalhe-modal-fechar" data-fechar aria-label="Fechar">&times;</button>
            <div id="detalheModalConteudo"></div>
        </div>`;
    document.body.appendChild(modalEl);

    modalEl.addEventListener("click", (e) => {
        if (e.target === modalEl || e.target.closest("[data-fechar]")) {
            fecharModal();
            return;
        }
        const seta = e.target.closest("[data-galeria]");
        if (seta && galeriaImagens.length > 1) {
            const passo = seta.dataset.galeria === "next" ? 1 : -1;
            galeriaIndice = (galeriaIndice + passo + galeriaImagens.length) % galeriaImagens.length;
            renderizarGaleria();
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modalEl.classList.contains("show")) fecharModal();
    });

    return modalEl;
}

// Devolve um "token": respostas assíncronas que chegam depois de o modal
// ter sido fechado/trocado comparam com tokenModal e se descartam.
function abrirModal(html) {
    const modal = garantirModal();
    document.getElementById("detalheModalConteudo").innerHTML = html;
    modal.classList.add("show");
    modal.querySelector(".detalhe-modal-box").scrollTop = 0;
    document.body.style.overflow = "hidden";
    return ++tokenModal;
}

function fecharModal() {
    if (!modalEl) return;
    modalEl.classList.remove("show");
    document.body.style.overflow = "";
    tokenModal++;
}

function renderizarGaleria() {
    const alvo = document.getElementById("modalObjetoGaleria");
    if (!alvo) return;

    if (galeriaImagens.length === 0) {
        alvo.innerHTML = `<div class="detalhe-modal-sem-foto"><i class="bi bi-image"></i></div>`;
        return;
    }

    const setas = galeriaImagens.length > 1 ? `
        <button type="button" class="detalhe-galeria-seta prev" data-galeria="prev" aria-label="Foto anterior">&#8249;</button>
        <button type="button" class="detalhe-galeria-seta next" data-galeria="next" aria-label="Próxima foto">&#8250;</button>
        <span class="detalhe-galeria-contador">${galeriaIndice + 1} / ${galeriaImagens.length}</span>` : "";

    alvo.innerHTML = `<img src="${escAdmin(galeriaImagens[galeriaIndice])}" alt="">${setas}`;
}

// =====================================================================
// ITENS ANUNCIADOS
// =====================================================================
function urlDaImagem(item) {
    if (!item) return null;
    return typeof item === "string" ? item : (item.url || item.src || null);
}

// Mesma leitura tolerante do objetos-shared.js: aceita `fotos`/`imagens`
// (strings ou { url }) e cai na imagem principal se não houver lista.
function normalizarObjeto(dto) {
    // /admin/objetos manda `fotos_item` e `categorias`; /objetos/:id manda `fotos` e `categoria`.
    const fotosBrutas = [dto.fotos, dto.imagens, dto.fotos_item].find(Array.isArray) || [];
    const imagens = fotosBrutas.map(urlDaImagem).filter(Boolean);
    const principal = urlDaImagem(dto.imagem) || urlDaImagem(dto.imagem_principal);
    if (imagens.length === 0 && principal) imagens.push(principal);

    let localizacao = "";
    if (typeof dto.localizacao === "string") localizacao = dto.localizacao;
    else localizacao = [dto.bairro, dto.cidade].filter(v => typeof v === "string" && v).join(", ");

    return {
        id: String(dto.id),
        titulo: dto.titulo ?? dto.nome ?? "Sem título",
        descricao: dto.descricao ?? "",
        imagens,
        categoria: dto.categoria?.nome ?? dto.categorias?.nome ?? dto.categoria_nome ?? (typeof dto.categoria === "string" ? dto.categoria : ""),
        preco: dto.preco_dia ?? dto.preco ?? dto.preco_por_dia,
        disponivel: dto.disponivel ?? true,
        // Mesmos campos que a página Anúncios do admin lê (anuncios.js).
        status: dto.status || (dto.arquivado || dto.arquivado_em ? "arquivado" : "ativo"),
        oculto_pelo_admin: !!dto.oculto_pelo_admin,
        motivo_ocultacao: dto.motivo_ocultacao || "",
        em_locacao: !!dto.em_locacao,
        tem_solicitacao_pendente: !!dto.tem_solicitacao_pendente,
        localizacao
    };
}

// Mesma prioridade de anuncios.js:infoDisponibilidade (arquivado > oculto pela
// moderação > em locação > solicitação pendente > disponível/pausado).
function infoDisponibilidadeObjeto(obj) {
    if (obj.status === "arquivado") return { classe: "arquivado", label: "Arquivado" };
    if (obj.oculto_pelo_admin) return { classe: "indisponivel", label: "Oculto pela moderação" };
    if (obj.em_locacao) return { classe: "em-locacao", label: "Em locação" };
    if (obj.tem_solicitacao_pendente) return { classe: "pendente", label: "Solicitação pendente" };
    if (obj.disponivel) return { classe: "", label: "Disponível" };
    return { classe: "indisponivel", label: "Pausado pelo dono" };
}

function renderCardObjeto(obj) {
    const disp = infoDisponibilidadeObjeto(obj);
    const foto = obj.imagens[0]
        ? `<img class="detalhe-objeto-img" src="${escAdmin(obj.imagens[0])}" alt="${escAdmin(obj.titulo)}" loading="lazy">`
        : `<div class="detalhe-objeto-img-vazia"><i class="bi bi-image"></i></div>`;
    return `
        <button type="button" class="detalhe-objeto-card" data-item-id="${escAdmin(obj.id)}">
            ${foto}
            <div class="detalhe-objeto-info">
                <p class="detalhe-objeto-titulo">${escAdmin(obj.titulo)}</p>
                <div class="detalhe-objeto-rodape">
                    <span class="detalhe-objeto-preco">${obj.preco != null ? formatarMoeda(obj.preco) + "/dia" : "—"}</span>
                    <span class="detalhe-tag-status ${disp.classe}">${escAdmin(disp.label)}</span>
                </div>
            </div>
        </button>`;
}

async function carregarObjetos(usuario) {
    const alvo = document.getElementById("secaoObjetos");
    if (!alvo) return;

    let objetos;
    try {
        const brutos = await buscarTodasAsPaginas(
            (p, l) => ROTAS.objetosDoUsuario(usuario.id, p, l),
            "Não foi possível carregar os itens anunciados.", 50
        );
        objetos = brutos.map(normalizarObjeto);
    } catch (err) {
        alvo.innerHTML = `<p class="admin-tabela-vazio">${escAdmin(err.message)}</p>`;
        return;
    }

    if (objetos.length === 0) {
        alvo.innerHTML = `<p class="admin-tabela-vazio">Este usuário ainda não anunciou nenhum objeto.</p>`;
        return;
    }

    alvo.innerHTML = `
        <div class="detalhe-bloco">
            <p class="detalhe-bloco-contagem">${objetos.length} objeto(s) cadastrado(s)</p>
            <div id="listaObjetos"></div>
        </div>`;

    montarListaPaginada(document.getElementById("listaObjetos"), {
        itens: objetos,
        passo: 8,
        classeLista: "detalhe-objetos-grid",
        renderItem: renderCardObjeto,
        aoAbrir: abrirModalObjeto
    });
}

function abrirModalObjeto(obj) {
    galeriaImagens = obj.imagens;
    galeriaIndice = 0;

    const tags = [];
    if (obj.categoria) tags.push(`<span class="detalhe-tag">${escAdmin(obj.categoria)}</span>`);
    if (obj.preco != null) tags.push(`<span class="detalhe-tag preco">${formatarMoeda(obj.preco)}/dia</span>`);
    const disp = infoDisponibilidadeObjeto(obj);
    tags.push(`<span class="detalhe-tag ${disp.classe || "disponivel"}">${escAdmin(disp.label)}</span>`);
    if (obj.status === "arquivado") tags.push(`<span class="detalhe-tag arquivado">Status: Arquivado</span>`);

    const token = abrirModal(`
        <div class="detalhe-modal-galeria" id="modalObjetoGaleria"></div>
        <div class="detalhe-modal-corpo">
            <h2>${escAdmin(obj.titulo)}</h2>
            <p class="detalhe-modal-desc" id="modalObjetoDesc">${escAdmin(obj.descricao || "Sem descrição.")}</p>
            <div class="detalhe-tags">${tags.join("")}</div>
            ${obj.oculto_pelo_admin && obj.motivo_ocultacao ? `<p class="detalhe-bloco-aviso"><i class="bi bi-shield-lock"></i> Motivo da ocultação: ${escAdmin(obj.motivo_ocultacao)}</p>` : ""}
            <p class="detalhe-modal-local" id="modalObjetoLocal" ${obj.localizacao ? "" : "hidden"}><i class="bi bi-geo-alt"></i> <span>${escAdmin(obj.localizacao)}</span></p>
            <h3>Avaliações</h3>
            <div id="modalObjetoAvaliacoes"><p class="detalhe-aval-vazio">Carregando avaliações...</p></div>
        </div>`);

    renderizarGaleria();
    hidratarObjeto(obj, token);
    carregarAvaliacoesDoObjeto(obj, token);
}

// A listagem admin é enxuta: completa descrição, localização e fotos pelo
// detalhe canônico. Se falhar, mantém o que já veio da lista.
async function hidratarObjeto(obj, token) {
    if (obj.descricao && obj.localizacao && obj.imagens.length > 0) return;
    let completo;
    try {
        completo = normalizarObjeto(await apiRequest(ROTAS.detalheDoObjeto(obj.id), "GET", null, "Não foi possível carregar o objeto."));
    } catch { return; }
    if (token !== tokenModal) return;

    if (completo.descricao) {
        obj.descricao = completo.descricao;
        const desc = document.getElementById("modalObjetoDesc");
        if (desc) desc.textContent = completo.descricao;
    }
    if (completo.localizacao) {
        obj.localizacao = completo.localizacao;
        const local = document.getElementById("modalObjetoLocal");
        if (local) { local.hidden = false; local.querySelector("span").textContent = completo.localizacao; }
    }
    if (completo.imagens.length > 0 && galeriaImagens.length === 0) {
        obj.imagens = completo.imagens;
        galeriaImagens = completo.imagens;
        galeriaIndice = 0;
        renderizarGaleria();
    }
}

// A API de avaliações devolve `nomeAvaliador`, `avaliadorAvatarUrl`, `nota`, `comentario`, `criado_em`.
function normalizarAvaliacao(a) {
    return {
        nota: Math.max(0, Math.min(5, Number(a.nota ?? a.estrelas ?? 0) || 0)),
        comentario: a.comentario ?? a.texto ?? "",
        data: a.criado_em ?? a.data ?? a.created_at ?? null,
        autor: a.nomeAvaliador ?? a.avaliador?.nome ?? a.autor?.nome ?? a.autor_nome ?? a.nome ?? "Usuário",
        avatarUrl: a.avaliadorAvatarUrl ?? a.avaliador?.avatarUrl ?? null
    };
}

function estrelas(nota) {
    const cheias = Math.round(nota);
    return Array.from({ length: 5 }, (_, i) => `<i class="bi ${i < cheias ? "bi-star-fill" : "bi-star"}"></i>`).join("");
}

async function carregarAvaliacoesDoObjeto(obj, token) {
    let lista;
    let erro = null;

    try {
        const brutas = await buscarTodasAsPaginas(
            (p, l) => ROTAS.avaliacoesDoObjeto(obj.id, p, l),
            "Não foi possível carregar as avaliações.", 100
        );
        lista = brutas.map(normalizarAvaliacao);
    } catch (err) {
        erro = err;
    }

    if (token !== tokenModal) return; // o modal foi fechado/trocado enquanto carregava
    const alvo = document.getElementById("modalObjetoAvaliacoes");
    if (!alvo) return;

    if (erro) {
        alvo.innerHTML = `<p class="detalhe-aval-vazio">${escAdmin(erro.message)}</p>`;
        return;
    }
    if (lista.length === 0) {
        alvo.innerHTML = `<p class="detalhe-aval-vazio">Este objeto ainda não recebeu avaliações.</p>`;
        return;
    }

    const media = lista.reduce((soma, a) => soma + a.nota, 0) / lista.length;

    const itens = lista.map(a => `
        <div class="detalhe-aval-item">
            <div class="detalhe-aval-topo">
                <div class="detalhe-aval-avatar">${window.avatarAdminHtml ? window.avatarAdminHtml(a.avatarUrl, iniciais(a.autor)) : escAdmin(iniciais(a.autor))}</div>
                <div class="detalhe-aval-autor">
                    <strong>${escAdmin(a.autor)}</strong>
                    <span>${formatarData(a.data)}</span>
                </div>
                <div class="detalhe-aval-nota"><i class="bi bi-star-fill"></i> ${a.nota.toFixed(1).replace(".", ",")}</div>
            </div>
            ${a.comentario ? `<p class="detalhe-aval-comentario">${escAdmin(a.comentario)}</p>` : ""}
        </div>`).join("");

    alvo.innerHTML = `
        <div class="detalhe-aval-resumo">
            <div class="detalhe-aval-media">${media.toFixed(1).replace(".", ",")}</div>
            <div class="detalhe-aval-resumo-info">
                <div class="detalhe-estrelas">${estrelas(media)}</div>
                <div class="detalhe-aval-total">${lista.length} avaliação(ões)</div>
            </div>
        </div>
        ${itens}`;
}

// =====================================================================
// HISTÓRICO DE ALUGUÉIS
// =====================================================================
// [rótulo, classe do selo]. Chaves = status do back (statusApi).
const STATUS_ALUGUEL = {
    pendente:             ["Pendente", "pendente"],
    aprovado:             ["Aprovado", "info"],
    pago:                 ["Pago", "info"],
    retirado:             ["Em andamento", "info"],
    aguardando_devolucao: ["Em andamento", "info"],
    devolvido:            ["Devolvido", "ok"],
    finalizado:           ["Concluído", "ok"],
    concluido:            ["Concluído", "ok"],
    recusado:             ["Recusado", "erro"],
    rejeitado:            ["Recusado", "erro"],
    cancelado:            ["Cancelado", "erro"],
    expirado:             ["Expirado", "erro"]
};

const STATUS_MULTA = { pendente: "Pendente", paga: "Paga", contestada: "Contestada" };

function statusAluguel(status) {
    return STATUS_ALUGUEL[status] || [String(status || "—"), "neutro"];
}

function normalizarAluguel(dto, usuarioId) {
    const proprietarioId = dto.proprietario?.id ? String(dto.proprietario.id) : null;
    const solicitanteId = dto.solicitante?.id ? String(dto.solicitante.id) : null;
    const foiPago = Array.isArray(dto.pagamentos) && dto.pagamentos.some(p => ["pago", "estornado"].includes(p?.status));
    const multa = dto.multa && Number(dto.multa.dias_atraso) > 0 ? dto.multa : null;

    return {
        id: String(dto.id),
        statusApi: dto.status,
        papel: proprietarioId === String(usuarioId) ? "proprietario" : "locatario",

        produtoTitulo: dto.produto?.titulo || "Objeto sem título",
        produtoCategoria: dto.produto?.categoria || "",
        imagem: dto.produto?.imagem || null,

        proprietario: { id: proprietarioId, nome: dto.proprietario?.nome || "" },
        solicitante: { id: solicitanteId, nome: dto.solicitante?.nome || "" },

        dataRetirada: dto.data_retirada,
        dataDevolucao: dto.data_devolucao,
        dias: dto.dias,

        subtotal: dto.subtotal,
        taxaServico: dto.taxa_servico,
        total: dto.total,

        canceladoPor: dto.cancelado_por || null,
        estornado: dto.status === "cancelado" && foiPago,
        criadaEm: dto.criadoEm ?? dto.criado_em ?? null,
        multa
    };
}

function rotuloOutraParte(a) {
    return a.papel === "proprietario"
        ? `Locatário: ${a.solicitante.nome || "—"}`
        : `Proprietário: ${a.proprietario.nome || "—"}`;
}

function renderLinhaAluguel(a) {
    const [rotulo, classe] = statusAluguel(a.statusApi);
    const foto = urlSegura(a.imagem)
        ? `<img class="detalhe-linha-img" src="${escAdmin(a.imagem)}" alt="" loading="lazy">`
        : `<div class="detalhe-linha-img vazia"><i class="bi bi-box-seam"></i></div>`;

    return `
        <button type="button" class="detalhe-linha" data-item-id="${escAdmin(a.id)}">
            ${foto}
            <div class="detalhe-linha-info">
                <strong class="detalhe-linha-titulo">${escAdmin(a.produtoTitulo)}</strong>
                <span class="detalhe-linha-sub">${escAdmin(rotuloOutraParte(a))}</span>
                <span class="detalhe-linha-sub">${formatarData(a.dataRetirada)} → ${formatarData(a.dataDevolucao)}</span>
            </div>
            <div class="detalhe-linha-lado">
                <span class="detalhe-linha-valor">${formatarMoeda(a.total)}</span>
                <span class="detalhe-pill ${classe}">${escAdmin(rotulo)}</span>
                <span class="detalhe-pill papel">${a.papel === "proprietario" ? "Proprietário" : "Locatário"}</span>
            </div>
        </button>`;
}

async function carregarAlugueis(usuario) {
    const alvo = document.getElementById("secaoAlugueis");
    if (!alvo) return;

    const est = usuario.estatisticas || {};
    const resumo = `Como locatário: ${Number(est.alugueis_como_locatario || 0)} · Como proprietário: ${Number(est.alugueis_como_proprietario || 0)}`;

    let alugueis;
    try {
        const brutos = await buscarTodasAsPaginas(
            (p, l) => ROTAS.alugueisDoUsuario(usuario.id, p, l),
            "Não foi possível carregar o histórico de aluguéis."
        );
        alugueis = brutos.map(dto => normalizarAluguel(dto, usuario.id));
    } catch (err) {
        // Mantém a contagem de antes e avisa do problema.
        alvo.innerHTML = `<p class="admin-tabela-vazio">${escAdmin(resumo)}<br>${escAdmin(err.message)}</p>`;
        return;
    }

    if (alugueis.length === 0) {
        alvo.innerHTML = `<p class="admin-tabela-vazio">Nenhum aluguel registrado para este usuário.</p>`;
        return;
    }

    alugueis.sort((a, b) => String(b.dataRetirada || "").localeCompare(String(a.dataRetirada || "")));

    alvo.innerHTML = `
        <div class="detalhe-bloco">
            <p class="detalhe-bloco-contagem">${escAdmin(resumo)}</p>
            <div id="listaAlugueis"></div>
        </div>`;

    montarListaPaginada(document.getElementById("listaAlugueis"), {
        itens: alugueis,
        passo: 5,
        classeLista: "detalhe-linhas",
        renderItem: renderLinhaAluguel,
        aoAbrir: abrirModalAluguel
    });
}

function quemCancelou(a) {
    if (!a.canceladoPor) return null;
    if (a.canceladoPor === "sistema") return "Sistema";
    if (a.canceladoPor === a.proprietario.id) return "Proprietário";
    if (a.canceladoPor === a.solicitante.id) return "Locatário";
    return "—";
}

function abrirModalAluguel(a) {
    const [rotulo, classe] = statusAluguel(a.statusApi);

    const foto = urlSegura(a.imagem)
        ? `<div class="detalhe-modal-galeria"><img src="${escAdmin(a.imagem)}" alt=""></div>`
        : "";

    const campos = [
        campoModal("Locatário", escAdmin(a.solicitante.nome || "—")),
        campoModal("Proprietário", escAdmin(a.proprietario.nome || "—")),
        campoModal("Retirada", formatarData(a.dataRetirada)),
        campoModal("Devolução", formatarData(a.dataDevolucao)),
        campoModal("Dias", a.dias != null ? escAdmin(a.dias) : "—"),
        campoModal("Solicitado em", formatarData(a.criadaEm)),
        campoModal("Subtotal", formatarMoeda(a.subtotal)),
        campoModal("Taxa de serviço", formatarMoeda(a.taxaServico)),
        campoModal("Total", formatarMoeda(a.total))
    ];

    const cancelou = quemCancelou(a);
    if (cancelou) campos.push(campoModal("Cancelado por", escAdmin(cancelou)));
    if (a.estornado) campos.push(campoModal("Pagamento", "Estornado"));

    let multa = "";
    if (a.multa) {
        multa = `
            <h3>Multa por atraso</h3>
            <div class="detalhe-modal-grid">
                ${campoModal("Dias de atraso", escAdmin(a.multa.dias_atraso))}
                ${campoModal("Valor total", formatarMoeda(a.multa.valor_total))}
                ${campoModal("Situação", escAdmin(STATUS_MULTA[a.multa.status] || a.multa.status || "—"))}
            </div>`;
    }

    abrirModal(`
        ${foto}
        <div class="detalhe-modal-corpo ${foto ? "" : "sem-imagem"}">
            <h2>${escAdmin(a.produtoTitulo)}</h2>
            <div class="detalhe-tags">
                <span class="detalhe-pill ${classe}">${escAdmin(rotulo)}</span>
                ${a.produtoCategoria ? `<span class="detalhe-tag">${escAdmin(a.produtoCategoria)}</span>` : ""}
                <span class="detalhe-pill papel">${a.papel === "proprietario" ? "Proprietário" : "Locatário"} neste aluguel</span>
            </div>
            <div class="detalhe-modal-grid">${campos.join("")}</div>
            ${multa}
        </div>`);
}

// =====================================================================
// DENÚNCIAS RECEBIDAS
// =====================================================================
const STATUS_OCORRENCIA = {
    aberta:       ["Aberta", "erro"],
    andamento:    ["Em andamento", "info"],
    resolvida:    ["Resolvida", "ok"],
    fechada:      ["Fechada", "neutro"],
    improcedente: ["Improcedente", "pendente"]
};

const PRIORIDADE_OCORRENCIA = {
    critica: ["Crítica", "erro"],
    alta:    ["Alta", "pendente"],
    media:   ["Média", "info"],
    baixa:   ["Baixa", "neutro"]
};

const ORIGEM_OCORRENCIA = { aluguel: "Aluguel", anuncio: "Anúncio", avaliacao: "Avaliação", conversa: "Conversa" };

function renderLinhaDenuncia(o) {
    const [rotStatus, clsStatus] = STATUS_OCORRENCIA[o.status] || [o.status, "neutro"];
    const [rotPri, clsPri] = PRIORIDADE_OCORRENCIA[o.prioridade] || [o.prioridade, "neutro"];

    return `
        <button type="button" class="detalhe-linha" data-item-id="${escAdmin(o.id)}">
            <div class="detalhe-linha-icone"><i class="bi bi-flag-fill"></i></div>
            <div class="detalhe-linha-info">
                <strong class="detalhe-linha-titulo">${escAdmin(o.motivo)}</strong>
                <span class="detalhe-linha-sub">Denunciante: ${escAdmin(o.denuncianteNome)}</span>
                <span class="detalhe-linha-sub">${formatarData(o.criadoEm)}${o.protocolo ? " · " + escAdmin(o.protocolo) : ""}</span>
            </div>
            <div class="detalhe-linha-lado">
                <span class="detalhe-pill ${clsPri}">${escAdmin(rotPri)}</span>
                <span class="detalhe-pill ${clsStatus}">${escAdmin(rotStatus)}</span>
            </div>
        </button>`;
}

// Filtro real por UUID do denunciado (GET /admin/ocorrencias?tipo=denuncia&denunciado_id=:id),
// paginado no servidor. O filtro por ID abaixo é só uma segurança extra.
async function carregarDenuncias(usuario) {
    const alvo = document.getElementById("secaoDenuncias");
    if (!alvo) return;

    const esperadas = Number(usuario.estatisticas?.denuncias_recebidas || 0);
    let denuncias;

    try {
        const brutas = [];
        let pagina = 1;
        let totalPaginas = 1;
        do {
            const corpo = await listarOcorrenciasAdmin({ denunciadoId: usuario.id, tipo: "denuncia", pagina, porPagina: 50 });
            const lista = extrairLista(corpo);
            brutas.push(...lista);
            const total = Array.isArray(corpo) ? NaN : Number(corpo?.total ?? NaN);
            totalPaginas = Number.isFinite(total) ? Math.ceil(total / 50) : (lista.length >= 50 ? pagina + 1 : pagina);
            pagina++;
        } while (pagina <= totalPaginas && pagina <= 10);

        const vistos = new Set();
        denuncias = brutas
            .map(normalizarOcorrenciaAdmin)
            .filter(o => o.denunciadoId === String(usuario.id))
            .filter(o => !vistos.has(o.id) && vistos.add(o.id));
    } catch (err) {
        alvo.innerHTML = `<p class="admin-tabela-vazio">${esperadas} denúncia(s) recebida(s).<br>${escAdmin(err.message)}</p>`;
        return;
    }

    const aviso = esperadas > denuncias.length
        ? `<p class="detalhe-bloco-aviso"><i class="bi bi-info-circle"></i> O perfil registra ${esperadas} denúncia(s), mas só ${denuncias.length} foi(ram) localizada(s) aqui. Veja a lista completa na <a href="/admin/denuncias">fila de Denúncias e Suporte</a>.</p>`
        : "";

    if (denuncias.length === 0) {
        alvo.innerHTML = esperadas > 0
            ? `<div class="detalhe-bloco">${aviso}</div>`
            : `<p class="admin-tabela-vazio">Nenhuma denúncia recebida.</p>`;
        return;
    }

    denuncias.sort((a, b) => String(b.criadoEm || "").localeCompare(String(a.criadoEm || "")));

    alvo.innerHTML = `
        <div class="detalhe-bloco">
            <p class="detalhe-bloco-contagem">${denuncias.length} denúncia(s) recebida(s)</p>
            ${aviso}
            <div id="listaDenuncias"></div>
        </div>`;

    montarListaPaginada(document.getElementById("listaDenuncias"), {
        itens: denuncias,
        passo: 5,
        classeLista: "detalhe-linhas",
        renderItem: renderLinhaDenuncia,
        aoAbrir: abrirModalDenuncia
    });
}

function abrirModalDenuncia(o) {
    const [rotStatus, clsStatus] = STATUS_OCORRENCIA[o.status] || [o.status, "neutro"];
    const [rotPri, clsPri] = PRIORIDADE_OCORRENCIA[o.prioridade] || [o.prioridade, "neutro"];

    const origem = o.origem ? (ORIGEM_OCORRENCIA[o.origem.tipo] || o.origem.tipo) : "—";

    const urlAnexo = o.anexo ? urlSegura(o.anexo.url) : null;
    const anexo = urlAnexo
        ? `<a class="detalhe-campo-link" href="${escAdmin(urlAnexo)}" target="_blank" rel="noopener noreferrer"><i class="bi bi-paperclip"></i> Ver evidência</a>`
        : "Nenhuma";

    const respostas = o.respostas.length
        ? o.respostas.map(r => {
            const autor = typeof r.autor === "object" ? (r.autor?.nome || "Equipe") : (r.autor || "Equipe");
            return `
                <div class="detalhe-resposta">
                    <div class="detalhe-resposta-topo"><strong>${escAdmin(autor)}</strong><span>${formatarData(r.criado_em)}</span></div>
                    <p>${escAdmin(r.mensagem)}</p>
                </div>`;
        }).join("")
        : `<p class="detalhe-aval-vazio">Nenhuma resposta enviada ainda.</p>`;

    abrirModal(`
        <div class="detalhe-modal-corpo sem-imagem">
            <h2>${escAdmin(o.motivo)}</h2>
            <div class="detalhe-tags">
                <span class="detalhe-pill ${clsStatus}">${escAdmin(rotStatus)}</span>
                <span class="detalhe-pill ${clsPri}">Prioridade ${escAdmin(String(rotPri).toLowerCase())}</span>
            </div>
            <div class="detalhe-modal-grid">
                ${campoModal("Protocolo", escAdmin(o.protocolo || "—"))}
                ${campoModal("Data", formatarData(o.criadoEm))}
                ${campoModal("Denunciante", escAdmin(o.denuncianteNome))}
                ${campoModal("Origem", escAdmin(origem))}
                ${campoModal("Evidência", anexo)}
            </div>
            <h3>Descrição</h3>
            <p class="detalhe-modal-desc">${escAdmin(o.descricao || "Sem descrição.")}</p>
            <h3>Respostas</h3>
            ${respostas}
            <a class="detalhe-campo-link detalhe-modal-rodape-link" href="/admin/denuncias"><i class="bi bi-box-arrow-up-right"></i> Gerenciar na fila de Denúncias e Suporte</a>
        </div>`);
}

carregarDetalhe();