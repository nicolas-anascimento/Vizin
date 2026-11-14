// ============================================================
// Checkout PIX dos planos de anúncios — usado por finalizar-pagamento.js.
// Pagamento avulso (sem renovação automática); cartão e modo demonstração
// ainda não existem na API/UI. Aluguel e multa NÃO passam por aqui.
//
// Decidido AQUI: interação (gerar PIX, timer, copiar, acompanhar status).
// Decidido no BACK: valor, aprovação (webhook do Mercado Pago), expiração
// real do PIX, período contratado.
//
// Depende de: assinaturas-api.js
// ============================================================
(function () {
    "use strict";

    const API = window.AssinaturasAPI;
    const $ = (id) => document.getElementById(id);
    const preco = (v) => (typeof formatarPreco === "function"
        ? formatarPreco(v)
        : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

    let cfg = null;
    let el = {};
    let finalizado = false;
    let criandoPix = false;
    let chavePix = null;
    let pixAtual = null;   // { pagamentoId, limiteMs }
    let timerPix = null;
    let seguimentoPix = null;
    const chaveStorage = () => `vizin_assinatura_${cfg?.planoCodigo}_pix`; // Idempotency-Key da operação em andamento

    function mostrarToast(mensagem, tipo = "sucesso") {
        let toast = $("toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "toast";
            toast.className = "toast";
            document.body.appendChild(toast);
        }
        toast.innerText = mensagem;
        toast.className = `toast show ${tipo}`;
        setTimeout(() => toast.classList.remove("show"), 2500);
    }

    function gerarChave() {
        if (window.crypto?.randomUUID) return crypto.randomUUID();
        if (!window.crypto?.getRandomValues) throw new Error("Navegador sem geração segura de UUID.");
        const b = new Uint8Array(16);
        crypto.getRandomValues(b);
        b[6] = (b[6] & 15) | 64;
        b[8] = (b[8] & 63) | 128;
        const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
        return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
    }

    // Consulta o pagamento até sair de "pendente" (quem confirma é o webhook no back).
    function acompanhar(pagamentoId, aoFinalizar) {
        let ativo = true;
        let timeout = null;
        let tentativas = 0;

        async function ciclo() {
            if (!ativo) return;
            try {
                const p = await API.obterPagamento(pagamentoId);
                if (!ativo) return;
                if (!API.ehPendente(p)) { ativo = false; aoFinalizar(p); return; }
            } catch (erro) {
                if (erro.status === 403 || erro.status === 404) {
                    ativo = false;
                    aoFinalizar({ status: "erro", mensagem: erro.message });
                    return;
                }
                // falha transitória: tenta de novo
            }
            tentativas++;
            timeout = setTimeout(ciclo, tentativas < 12 ? 5000 : 10000);
        }

        timeout = setTimeout(ciclo, 3000);
        return { parar() { ativo = false; clearTimeout(timeout); } };
    }

    function pararTudo() {
        clearInterval(timerPix);
        timerPix = null;
        seguimentoPix?.parar();
    }

    function finalizar(pagamento) {
        if (finalizado) return;
        finalizado = true;
        pararTudo();
        sessionStorage.removeItem(chaveStorage());
        cfg.aoAprovar(pagamento);
    }

    // ================= PIX =================
    function selecionarPix() {
        el.btnPix.classList.add("ativo");
        el.conteudoPix.style.display = "block";
        el.metodoVazio.style.display = "none";
        abrirPix(false);
    }

    function voltarParaEscolha() {
        el.btnPix.classList.remove("ativo");
        el.conteudoPix.style.display = "none";
        el.metodoVazio.style.display = "block";
        clearInterval(timerPix);
        timerPix = null;
    }

    async function abrirPix(forcarNovo) {
        if (criandoPix || finalizado) return;

        if (!forcarNovo && pixAtual && pixAtual.limiteMs > Date.now()) {
            mostrarPix();
            return;
        }
        if (forcarNovo) {
            chavePix = null;
            sessionStorage.removeItem(chaveStorage());
        }

        criandoPix = true;
        seguimentoPix?.parar();
        pixAtual = null;
        el.pixBox.style.display = "none";
        el.pixExpirado.style.display = "none";
        el.pixAguardando.style.display = "none";
        if ($("pix-carregando")) $("pix-carregando").style.display = "block";

        try {
            // A mesma chave é reutilizada em retry/recarga (o back devolve o mesmo PIX).
            chavePix ||= sessionStorage.getItem(chaveStorage()) || gerarChave();
            sessionStorage.setItem(chaveStorage(), chavePix);

            const pagamento = await API.contratar(cfg.planoCodigo, "pix", chavePix);

            if (API.ehPago(pagamento)) { finalizar(pagamento); return; }
            if (!pagamento.pix?.copia_e_cola) {
                throw new Error("Não foi possível gerar o código PIX. Tente novamente.");
            }

            const expira = Date.parse(pagamento.pix.expira_em);
            pixAtual = {
                pagamentoId: pagamento.id,
                limiteMs: Number.isFinite(expira) ? expira : Date.now() + 30 * 60 * 1000
            };

            $("pix-codigo").value = pagamento.pix.copia_e_cola;
            const qr = $("pix-qrcode");
            if (qr && pagamento.pix.qr_code_base64) {
                qr.src = `data:image/png;base64,${pagamento.pix.qr_code_base64}`;
                qr.style.display = "";
            }

            mostrarPix();
            seguimentoPix = acompanhar(pixAtual.pagamentoId, (final) => {
                if (API.ehPago(final)) finalizar({ ...pagamento, ...final });
                else mostrarPixExpirado(); // expirado / recusado / cancelado
            });
        } catch (erro) {
            // 4xx = o back recusou de vez: descarta a chave. Rede/5xx: mantém pra repetir a mesma operação.
            if (erro.status && erro.status < 500) {
                chavePix = null;
                sessionStorage.removeItem(chaveStorage());
            }
            if (cfg.aoErro?.(erro)) return;
            mostrarToast(erro.status === 0 ? "Não sabemos se o PIX foi criado. Tente novamente: usaremos a mesma operação." : (erro.message || "Não foi possível gerar o PIX."), "erro");
            voltarParaEscolha();
        } finally {
            criandoPix = false;
            if ($("pix-carregando")) $("pix-carregando").style.display = "none";
        }
    }

    function mostrarPix() {
        el.pixExpirado.style.display = "none";
        el.pixBox.style.display = "block";
        el.pixAguardando.style.display = "block";
        iniciarTimerPix();
    }

    function mostrarPixExpirado() {
        clearInterval(timerPix);
        timerPix = null;
        seguimentoPix?.parar();
        pixAtual = null;
        el.pixBox.style.display = "none";
        el.pixAguardando.style.display = "none";
        el.pixExpirado.style.display = "block";
    }

    function iniciarTimerPix() {
        clearInterval(timerPix);
        const timerEl = $("pix-timer");
        const tempoEl = $("pix-timer-tempo");

        function tick() {
            if (!pixAtual) return;
            const restanteMs = pixAtual.limiteMs - Date.now();
            if (restanteMs <= 0) { mostrarPixExpirado(); return; }
            const min = Math.floor(restanteMs / 60000);
            const seg = Math.floor((restanteMs % 60000) / 1000);
            tempoEl.textContent = `${String(min).padStart(2, "0")}:${String(seg).padStart(2, "0")}`;
            timerEl.classList.toggle("pix-timer-urgente", restanteMs < 5 * 60 * 1000);
        }

        tick();
        if (pixAtual) timerPix = setInterval(tick, 1000);
    }

    async function copiarCodigoPix() {
        const campo = $("pix-codigo");
        try {
            await navigator.clipboard.writeText(campo.value);
        } catch (_) {
            campo.select();
            document.execCommand("copy");
        }
        mostrarToast("Código PIX copiado");
    }

    // config: { planoCodigo, total, aoAprovar(pagamento), aoErro(erro) -> boolean }
    function iniciar(config) {
        cfg = config;
        el = {
            btnPix: $("metodo-pix"),
            conteudoPix: $("conteudo-pix"),
            metodoVazio: $("metodo-vazio"),
            pixBox: $("pix-box"),
            pixExpirado: $("pix-expirado"),
            pixAguardando: $("pix-aguardando")
        };

        $("pix-valor").textContent = preco(cfg.total);
        el.btnPix.addEventListener("click", selecionarPix);
        $("btn-copiar-pix").addEventListener("click", copiarCodigoPix);
        $("btn-gerar-novo-pix").addEventListener("click", () => abrirPix(true));
    }

    window.CheckoutVizin = { iniciar, pararTudo, mostrarToast };
})();