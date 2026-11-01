(function () {
    "use strict";

    let avaliacoes = [];
    let filtroNota = "todos";
    let termoBusca = "";
    let paginaAtual = 1;
    const POR_PAGINA = 10;

    const buscaInput = document.getElementById("buscaAvaliacoes");
    const filtroStatusBar = document.getElementById("filtroStatusBar");
    const tbody = document.getElementById("corpoTabelaAvaliacoes");
    const estadoVazioEl = document.getElementById("tabelaEstadoVazio");
    const infoPaginacaoEl = document.getElementById("infoPaginacao");
    const paginacaoEl = document.getElementById("paginacao");

    // Comentários e nomes vêm do back (texto digitado por usuários), então
    // tudo que vira innerHTML passa por aqui.
    function escapar(valor) {
        return String(valor ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function estrelasHtml(nota) {
        let html = "";
        for (let i = 1; i <= 5; i++) html += `<i class="bi ${i <= nota ? "bi-star-fill" : "bi-star"}"></i>`;
        return html;
    }

    function formatarData(iso) {
        return iso ? new Date(iso).toLocaleDateString("pt-BR") : "";
    }

    // ================= CARREGAMENTO =================
    async function carregar() {
        try {
            avaliacoes = await listarAvaliacoesAdmin();
        } catch (err) {
            console.error(err);
            tbody.innerHTML = "";
            estadoVazioEl.textContent = "Não foi possível carregar as avaliações.";
            estadoVazioEl.hidden = false;
            return;
        }
        renderizarStats();
        renderizarTabela();
    }

    // ================= CARDS DE ESTATÍSTICA (calculadas no front) =================
    // Avaliações ocultas não entram na nota média/total/distribuição —
    // deixaram de valer publicamente — mas continuam na tabela pro admin
    // gerenciar (linha destacada).
    function renderizarStats() {
        const visiveis = avaliacoes.filter(a => !a.oculta);
        const total = visiveis.length;
        const media = total ? visiveis.reduce((s, a) => s + a.nota, 0) / total : 0;

        document.getElementById("statNotaMedia").textContent = media.toFixed(1);
        document.getElementById("statNotaMediaEstrelas").innerHTML = estrelasHtml(Math.round(media));
        document.getElementById("statNotaMediaBase").textContent =
            `Baseado em ${total} avaliaç${total === 1 ? "ão" : "ões"}`;
        document.getElementById("statTotal").textContent = total;

        // "vs mês anterior": não existe endpoint de estatísticas ainda, então
        // comparamos a contagem de avaliações criadas no mês civil atual com
        // o mês civil anterior, usando as datas já carregadas. Suposição a
        // confirmar com o back.
        const agora = new Date();
        const inicioMesAtual = new Date(agora.getFullYear(), agora.getMonth(), 1);
        const inicioMesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
        const noMesAtual = visiveis.filter(a => new Date(a.data) >= inicioMesAtual).length;
        const noMesAnterior = visiveis.filter(a => {
            const d = new Date(a.data);
            return d >= inicioMesAnterior && d < inicioMesAtual;
        }).length;

        const variacaoEl = document.getElementById("statTotalVariacao");
        if (noMesAnterior > 0) {
            const variacao = Math.round(((noMesAtual - noMesAnterior) / noMesAnterior) * 100);
            variacaoEl.textContent = `${variacao >= 0 ? "+" : ""}${variacao}% vs mês anterior`;
            variacaoEl.classList.toggle("admin-stat-variacao-negativa", variacao < 0);
        } else {
            variacaoEl.textContent = "";
        }

        for (let nota = 1; nota <= 5; nota++) {
            const qtd = visiveis.filter(a => a.nota === nota).length;
            const pct = total ? (qtd / total) * 100 : 0;
            document.getElementById(`distFill${nota}`).style.width = `${pct}%`;
            document.getElementById(`distQtd${nota}`).textContent = qtd;
        }
    }

    // ================= FILTROS =================
    if (filtroStatusBar) {
        filtroStatusBar.querySelectorAll(".admin-filtro-pill").forEach(pill => {
            pill.addEventListener("click", () => {
                filtroStatusBar.querySelectorAll(".admin-filtro-pill").forEach(p => p.classList.remove("active"));
                pill.classList.add("active");
                filtroNota = pill.dataset.nota;
                paginaAtual = 1;
                renderizarTabela();
            });
        });
    }

    let debounceBusca;
    buscaInput.addEventListener("input", () => {
        clearTimeout(debounceBusca);
        debounceBusca = setTimeout(() => {
            termoBusca = buscaInput.value.trim();
            paginaAtual = 1;
            renderizarTabela();
        }, 250);
    });

    function listaFiltrada() {
        return avaliacoes.filter(a => {
            if (filtroNota !== "todos" && a.nota !== Number(filtroNota)) return false;
            if (termoBusca) {
                const alvo = `${a.avaliadorNome} ${a.avaliadoNome} ${a.comentario}`.toLowerCase();
                if (!alvo.includes(termoBusca.toLowerCase())) return false;
            }
            return true;
        });
    }

    // ================= TABELA + PAGINAÇÃO =================
    function renderizarTabela() {
        const filtradas = listaFiltrada();
        const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
        if (paginaAtual > totalPaginas) paginaAtual = totalPaginas;
        const inicio = (paginaAtual - 1) * POR_PAGINA;
        const pagina = filtradas.slice(inicio, inicio + POR_PAGINA);

        tbody.innerHTML = "";
        pagina.forEach(a => tbody.appendChild(criarLinha(a)));
        estadoVazioEl.hidden = filtradas.length > 0;
        if (filtradas.length === 0) estadoVazioEl.textContent = "Nenhuma avaliação encontrada.";

        const de = filtradas.length ? inicio + 1 : 0;
        const ate = Math.min(inicio + POR_PAGINA, filtradas.length);
        infoPaginacaoEl.textContent = `Mostrando ${de}-${ate} de ${filtradas.length} avaliaç${filtradas.length === 1 ? "ão" : "ões"}`;

        paginacaoEl.innerHTML = "";
        for (let p = 1; p <= totalPaginas; p++) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = `admin-paginacao-numero ${p === paginaAtual ? "active" : ""}`;
            btn.textContent = String(p);
            btn.addEventListener("click", () => { paginaAtual = p; renderizarTabela(); });
            paginacaoEl.appendChild(btn);
        }
    }

    function criarLinha(a) {
        const tr = document.createElement("tr");
        if (a.oculta) tr.classList.add("avaliacoes-linha-oculta");
        const comentarioResumido = a.comentario.length > 60 ? `${a.comentario.slice(0, 60)}…` : a.comentario;
        const tagOculta = a.oculta ? `<span class="avaliacoes-tag-oculta">Oculta</span>` : "";
        tr.innerHTML = `
            <td>${escapar(a.avaliadorNome)}${tagOculta}</td>
            <td>${escapar(a.avaliadoNome)}</td>
            <td>${escapar(a.produtoTitulo)}</td>
            <td class="avaliacoes-celula-estrelas">${estrelasHtml(a.nota)}</td>
            <td class="avaliacoes-celula-comentario" title="${escapar(a.comentario)}">${escapar(comentarioResumido)}</td>
            <td>${escapar(formatarData(a.data))}</td>
            <td class="avaliacoes-celula-acoes">
                <button type="button" class="avaliacoes-acao-icone" data-acao="ver" data-id="${a.id}" title="Ver detalhes"><i class="bi bi-eye"></i></button>
                <button type="button" class="avaliacoes-acao-icone" data-acao="ocultar" data-id="${a.id}" title="${a.oculta ? "Reexibir" : "Ocultar"}"><i class="bi ${a.oculta ? "bi-eye-slash-fill" : "bi-eye-slash"}"></i></button>
                <button type="button" class="avaliacoes-acao-icone avaliacoes-acao-perigo" data-acao="excluir" data-id="${a.id}" title="Excluir"><i class="bi bi-trash"></i></button>
            </td>
        `;
        return tr;
    }

    tbody.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-acao]");
        if (!btn) return;
        const avaliacao = avaliacoes.find(a => a.id === btn.dataset.id);
        if (!avaliacao) return;

        if (btn.dataset.acao === "ver") {
            abrirModalVerAvaliacao(avaliacao);
        } else if (btn.dataset.acao === "ocultar") {
            abrirModalOcultarAvaliacao(avaliacao, (novoValorOculta) => {
                avaliacao.oculta = novoValorOculta;
                renderizarStats();
                renderizarTabela();
            });
        } else if (btn.dataset.acao === "excluir") {
            abrirModalExcluirAvaliacao(avaliacao, () => {
                avaliacoes = avaliacoes.filter(x => x.id !== avaliacao.id);
                renderizarStats();
                renderizarTabela();
            });
        }
    });

    // ================= ABRIR DIRETO UMA AVALIAÇÃO (?abrir=<id>) =================
    // Usado pela central de notificações. A lista inteira já está em memória,
    // então basta procurar o id (se não achar, foi excluída).
    function abrirItemDaUrl() {
        const params = new URLSearchParams(window.location.search);
        const id = params.get("abrir");
        if (!id) return;
        params.delete("abrir");
        const resto = params.toString();
        history.replaceState(null, "", window.location.pathname + (resto ? `?${resto}` : ""));

        if (!avaliacoes.length) return; // falha ao carregar: a própria tela já avisou
        const avaliacao = avaliacoes.find(a => a.id === String(id));
        if (!avaliacao) {
            window.mostrarToastAdmin("Esta avaliação não existe mais ou foi excluída.", "erro");
            return;
        }
        abrirModalVerAvaliacao(avaliacao);
    }

    carregar().then(abrirItemDaUrl);
})();