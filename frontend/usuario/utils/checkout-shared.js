// ============================================================
// Checkout compartilhado (PIX + cartão) — usado por
// finalizar-pagamento.js (aluguel) e pagamento-multa.js (multa).
// Os dois têm o mesmo HTML/ids de pagamento, então a lógica mora aqui.
//
// O que é decidido AQUI: interação (escolher método, timer, copiar código,
// cartões salvos, tokenizar, acompanhar status).
// O que NÃO é decidido aqui (é do back-end): valores, se o pagamento foi
// aprovado, expiração real do PIX, disponibilidade do objeto, prazos.
//
// Depende de: pagamentos-api.js, pagamento-gateway.js
// ============================================================
(function () {
    "use strict";

    const G = window.PagamentoGateway;
    const API = window.PagamentosAPI;
    const $ = (id) => document.getElementById(id);
    const preco = (v) => (typeof formatarPreco === "function"
        ? formatarPreco(v)
        : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

    let cfg = null;
    let el = {};
    let finalizado = false;
    let emProcessamento = false;
    let criandoPix = false;
    let chaveCartao = null;
    let corpoCartaoPendente = null;
    let chavePixPendente = null;
    const chaveTentativa = () => `vizin_pagamento_${cfg?.tipo}_${cfg?.solicitacaoId}`;        // Idempotency-Key da tentativa de cartão em andamento
    let pixAtual = null;           // { pagamentoId, limiteMs }
    let timerPix = null;
    let seguimentoPix = null;
    let seguimentoCartao = null;
    let modoCartao = "novo";       // "novo" | "salvo"
    let cartaoSalvoId = null;
    let cartoesSalvos = [];
    let rotuloPagar = "Pagar";

    // ================= UTILITÁRIOS =================
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
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        const h = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
        return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
    }

    // Consulta o status de um pagamento até sair de "pendente".
    // Em produção o back atualiza o status via webhook do gateway; aqui só lemos.
    function acompanhar(pagamentoId, { aoFinalizar, aoLimite, limiteMs }) {
        let ativo = true;
        let timeout = null;
        let tentativas = 0;
        const inicio = Date.now();

        async function ciclo() {
            if (!ativo) return;
            try {
                const p = await API.obterPagamento(pagamentoId);
                if (!ativo) return;
                if (p.status !== "pendente") {
                    ativo = false;
                    aoFinalizar(p);
                    return;
                }
            } catch (erro) {
                if (erro.status === 403 || erro.status === 404) {
                    ativo = false;
                    aoFinalizar({ status: "erro", mensagem: erro.message });
                    return;
                }
                // falha transitória (rede / 5xx): tenta de novo no próximo ciclo
            }
            if (limiteMs && Date.now() - inicio > limiteMs) {
                ativo = false;
                aoLimite?.();
                return;
            }
            tentativas++;
            timeout = setTimeout(ciclo, tentativas < 12 ? 5000 : 10000);
        }

        timeout = setTimeout(ciclo, 3000);
        return { parar() { ativo = false; clearTimeout(timeout); } };
    }

    function finalizar(pagamento) {
        if (finalizado) return;
        finalizado = true;
        emProcessamento = false; // senão o beforeunload avisaria na própria saída pós-pagamento
        pararTudo();
        cfg.aoAprovar(pagamento);
    }

    function pararTudo() {
        clearInterval(timerPix);
        timerPix = null;
        seguimentoPix?.parar();
        seguimentoCartao?.parar();
        fecharDesafio3ds();
        try { G.desmontarTudo(); } catch (_) { /* nada montado */ }
    }

    // ================= 3DS (desafio do emissor) =================
    // Quando o back devolve acao_necessaria { tipo: "3ds", url }, a pessoa
    // confirma a compra no banco dentro de um iframe. O resultado NÃO vem do
    // iframe: continuamos consultando GET /pagamentos/:id como em qualquer
    // pagamento pendente.
    let overlay3ds = null;

    function abrirDesafio3ds(url) {
        fecharDesafio3ds();
        if (typeof url !== "string" || !/^https:\/\//i.test(url)) return; // só https

        overlay3ds = document.createElement("div");
        overlay3ds.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;";

        const caixa = document.createElement("div");
        caixa.style.cssText = "background:#fff;border-radius:12px;width:min(440px,100%);height:min(640px,90vh);display:flex;flex-direction:column;overflow:hidden;";

        const topo = document.createElement("div");
        topo.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:10px 14px;font-size:13px;font-weight:700;border-bottom:1px solid #e4e4e8;";
        const titulo = document.createElement("span");
        titulo.textContent = "Confirme a compra com seu banco";
        const fechar = document.createElement("button");
        fechar.type = "button";
        fechar.textContent = "Fechar";
        fechar.style.cssText = "background:none;border:none;cursor:pointer;font-weight:700;";
        fechar.addEventListener("click", fecharDesafio3ds);
        topo.append(titulo, fechar);

        const frame = document.createElement("iframe");
        frame.src = url;
        frame.title = "Verificação do seu banco";
        frame.style.cssText = "flex:1;border:0;width:100%;";

        caixa.append(topo, frame);
        overlay3ds.appendChild(caixa);
        document.body.appendChild(overlay3ds);
    }

    function fecharDesafio3ds() {
        overlay3ds?.remove();
        overlay3ds = null;
    }

    // ================= SELEÇÃO DO MÉTODO =================
    function selecionarMetodo(metodo) {
        el.btnPix.classList.toggle("ativo", metodo === "pix");
        el.btnCartao.classList.toggle("ativo", metodo === "cartao");
        el.conteudoPix.style.display = metodo === "pix" ? "block" : "none";
        el.conteudoCartao.style.display = metodo === "cartao" ? "block" : "none";
        el.metodoVazio.style.display = "none";
        esconderErroCartao();

        if (metodo === "pix") {
            abrirPix(false);
        } else {
            // Só o timer visual para. O acompanhamento do PIX continua em segundo
            // plano: se a pessoa já pagou no banco e trocou de aba, o pagamento
            // ainda é reconhecido (e evita cobrar de novo no cartão).
            clearInterval(timerPix);
            timerPix = null;
            prepararCartao();
        }
    }

    function voltarParaEscolhaDeMetodo() {
        esconderErroCartao();
        el.btnPix.classList.remove("ativo");
        el.btnCartao.classList.remove("ativo");
        el.conteudoPix.style.display = "none";
        el.conteudoCartao.style.display = "none";
        el.metodoVazio.style.display = "block";
        clearInterval(timerPix);
        timerPix = null;
        try { G.desmontarTudo(); } catch (_) { /* nada montado */ }
    }

    // ================= PIX =================
    async function abrirPix(forcarNovo) {
        if (criandoPix || finalizado) return;
        if (sessionStorage.getItem(`${chaveTentativa()}_cartao_desconhecido`)) {
            mostrarToast("Há um pagamento de cartão com resultado desconhecido. Consulte o status da locação antes de pagar novamente.", "erro");
            return;
        }

        if (!forcarNovo && pixAtual && pixAtual.limiteMs > Date.now()) {
            mostrarPix();
            return;
        }

        criandoPix = true;
        seguimentoPix?.parar();
        pixAtual = null;
        el.pixBox.style.display = "none";
        el.pixExpirado.style.display = "none";
        el.pixAguardando.style.display = "none";
        $("pix-carregando") && ($("pix-carregando").style.display = "block");

        try {
            chavePixPendente ||= sessionStorage.getItem(`${chaveTentativa()}_pix`) || gerarChave();
            sessionStorage.setItem(`${chaveTentativa()}_pix`, chavePixPendente);
            const pagamento = await API.criarPagamento(
                cfg.tipo,
                cfg.solicitacaoId,
                { metodo: "pix", device_id: G.obterDeviceId() },
                chavePixPendente
            );

            chavePixPendente = null;
            sessionStorage.removeItem(`${chaveTentativa()}_pix`);
            if (pagamento.status === "aprovado") { finalizar(pagamento); return; }

            // Resposta sem os dados do PIX não é uma criação válida.
            if (!pagamento.pix?.copia_e_cola || !(pagamento.pix.expira_em_segundos > 0)) {
                throw new Error("Não foi possível gerar o código PIX. Tente novamente.");
            }

            pixAtual = {
                pagamentoId: pagamento.pagamento_id,
                limiteMs: Date.now() + pagamento.pix.expira_em_segundos * 1000
            };

            $("pix-codigo").value = pagamento.pix.copia_e_cola;
            const qr = $("pix-qrcode");
            if (qr && pagamento.pix.qr_code_base64) {
                qr.src = `data:image/png;base64,${pagamento.pix.qr_code_base64}`;
                qr.style.display = "";
            }

            mostrarPix();
            seguimentoPix = acompanhar(pixAtual.pagamentoId, {
                aoFinalizar: (final) => {
                    if (final.status === "aprovado") finalizar(final);
                    else mostrarPixExpirado(); // expirado / recusado / cancelado
                }
            });
        } catch (erro) {
            if (erro.status && erro.status < 500) {
                chavePixPendente = null;
                sessionStorage.removeItem(`${chaveTentativa()}_pix`);
            }
            if (cfg.aoErro?.(erro)) return;
            mostrarToast(erro.status === 0 ? "Não sabemos se o PIX foi criado. Tente novamente com a mesma operação." : (erro.message || "Não foi possível gerar o PIX."), "erro");
            voltarParaEscolhaDeMetodo();
        } finally {
            criandoPix = false;
            $("pix-carregando") && ($("pix-carregando").style.display = "none");
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
            // fallback para contextos sem Clipboard API (http, navegadores antigos)
            campo.select();
            document.execCommand("copy");
        }
        mostrarToast("Código PIX copiado");
    }

    // ================= CARTÕES SALVOS =================
    async function carregarCartoesSalvos() {
        try {
            cartoesSalvos = await API.listarCartoes();
        } catch (erro) {
            console.error(erro);
            cartoesSalvos = []; // sem lista, a pessoa ainda pode pagar digitando um cartão
        }
        renderizarCartoesSalvos();
    }

    function criarOpcaoCartao(cartao) {
        const label = document.createElement("label");
        label.className = "cartao-salvo-opcao";

        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "cartao-salvo-radio";
        radio.value = cartao.id;
        radio.addEventListener("change", () => selecionarCartaoSalvo(cartao.id));

        const icone = document.createElement("div");
        icone.className = "cartao-salvo-icone";
        const i = document.createElement("i");
        i.className = "bi bi-credit-card-fill";
        icone.appendChild(i);

        const info = document.createElement("div");
        info.className = "cartao-salvo-info";
        const numero = document.createElement("p");
        numero.className = "cartao-salvo-numero";
        numero.textContent = `${cartao.bandeira} •••• ${cartao.ultimos_digitos}`;
        const validade = document.createElement("p");
        validade.className = "cartao-salvo-validade";
        validade.textContent = `Validade ${cartao.validade}`;
        info.append(numero, validade);

        label.append(radio, icone, info);

        if (cartao.padrao) {
            const badge = document.createElement("span");
            badge.className = "cartao-salvo-badge-padrao";
            badge.textContent = "Padrão";
            label.appendChild(badge);
        }
        return label;
    }

    function renderizarCartoesSalvos() {
        if (cartoesSalvos.length === 0) {
            modoCartao = "novo";
            cartaoSalvoId = null;
            el.cartoesSalvosSecao.style.display = "none";
            el.camposCartaoNovo.style.display = "block";
            el.btnUsarCartaoSalvo.style.display = "none";
        } else {
            modoCartao = "salvo";
            el.cartoesSalvosLista.innerHTML = "";
            cartoesSalvos.forEach(c => el.cartoesSalvosLista.appendChild(criarOpcaoCartao(c)));
            el.cartoesSalvosSecao.style.display = "block";
            el.camposCartaoNovo.style.display = "none";
            el.btnUsarCartaoSalvo.style.display = "inline-block";
            const inicial = cartoesSalvos.find(c => c.padrao) || cartoesSalvos[0];
            selecionarCartaoSalvo(inicial.id);
            return; // selecionarCartaoSalvo já prepara o CVV
        }
        prepararCartao();
    }

    function selecionarCartaoSalvo(id) {
        cartaoSalvoId = id;
        el.cartoesSalvosLista.querySelectorAll(".cartao-salvo-opcao").forEach(opcao => {
            const radio = opcao.querySelector('input[type="radio"]');
            radio.checked = radio.value === id;
            opcao.classList.toggle("selecionado", radio.value === id);
        });
        esconderErroCartao();
        prepararCartao();
    }

    // Monta os campos seguros certos pro modo atual — mas só se a aba de
    // cartão estiver visível (iframes não devem ser montados em área oculta).
    function prepararCartao() {
        if (el.conteudoCartao.style.display !== "block") return;
        try {
            if (modoCartao === "salvo" && cartaoSalvoId) {
                G.montarCvvCartaoSalvo("cartao-salvo-cvv");
            } else {
                G.montarCamposNovoCartao({
                    idNumero: "cartao-numero",
                    idValidade: "cartao-validade",
                    idCvv: "cartao-cvv"
                });
            }
        } catch (erro) {
            console.error(erro);
            mostrarErroGeralCartao(erro.message);
        }
    }

    // ================= ERROS DO FORMULÁRIO =================
    function definirErroCampo(idCampo, idErro, mensagem) {
        $(idCampo)?.classList.toggle("input-erro", Boolean(mensagem));
        const erroEl = $(idErro);
        if (erroEl) erroEl.textContent = mensagem || "";
    }

    function limparErrosCampos() {
        definirErroCampo("cartao-numero", "erro-cartao-numero", "");
        definirErroCampo("cartao-nome", "erro-cartao-nome", "");
        definirErroCampo("cartao-validade", "erro-cartao-validade", "");
        definirErroCampo("cartao-cvv", "erro-cartao-cvv", "");
        definirErroCampo("cartao-cpf", "erro-cartao-cpf", "");
    }

    function esconderErroCartao() {
        el.erroGeral.style.display = "none";
        el.acoesErro.style.display = "none";
        limparErrosCampos();
    }

    function mostrarErroGeralCartao(mensagem) {
        el.erroGeralTexto.textContent = mensagem;
        el.erroGeral.style.display = "flex";
        el.acoesErro.style.display = "flex";
    }

    function definirProcessando(processando) {
        emProcessamento = processando;
        el.btnPagar.disabled = processando;
        if (processando) el.btnPagar.innerHTML = `<span class="spinner"></span> Processando...`;
        else el.btnPagar.textContent = rotuloPagar;
    }

    // ================= PAGAR COM CARTÃO =================
    async function pagarComCartao(e) {
        e.preventDefault();
        if (emProcessamento || finalizado) return;
        if (sessionStorage.getItem(`${chaveTentativa()}_cartao_desconhecido`) && !corpoCartaoPendente) {
            mostrarErroGeralCartao("Resultado anterior desconhecido. Consulte o status da locação ou contate o suporte antes de iniciar outro pagamento.");
            return;
        }
        esconderErroCartao();

        const salvo = modoCartao === "salvo" && Boolean(cartaoSalvoId);
        let titular = "";
        let cpf = "";

        if (!salvo) {
            // Número, validade e CVV são validados pelo próprio SDK ao tokenizar
            // (estão dentro de iframes — não temos acesso ao valor). Aqui só o que é nosso.
            titular = $("cartao-nome").value.trim();
            cpf = $("cartao-cpf")?.value || "";
            let valido = true;
            if (!titular) {
                definirErroCampo("cartao-nome", "erro-cartao-nome", "Informe o nome como está no cartão.");
                valido = false;
            }
            if (!G.validarCpf(cpf)) {
                definirErroCampo("cartao-cpf", "erro-cartao-cpf", "CPF inválido.");
                valido = false;
            }
            if (!valido) return;
        }

        definirProcessando(true);

        try {
            if (!corpoCartaoPendente) {
                const tk = salvo
                    ? await G.tokenizarCartaoSalvo(cartaoSalvoId)
                    : await G.tokenizarCartaoNovo({ titular, cpf });
                chaveCartao = gerarChave();
                corpoCartaoPendente = {
                    metodo: "cartao", token_cartao: tk.token,
                    payment_method_id: tk.paymentMethodId || undefined,
                    cartao_id: salvo ? cartaoSalvoId : undefined,
                    device_id: G.obterDeviceId()
                };
            }
            const pagamento = await API.criarPagamento(cfg.tipo, cfg.solicitacaoId, corpoCartaoPendente, chaveCartao);
            corpoCartaoPendente = null;
            sessionStorage.removeItem(`${chaveTentativa()}_cartao_desconhecido`);
            resolverPagamentoCartao(pagamento);
        } catch (erro) {
            tratarErroCartao(erro);
        }
    }

    function resolverPagamentoCartao(pagamento) {
        if (pagamento.status === "aprovado") {
            finalizar(pagamento);
        } else if (pagamento.status === "pendente") {
            // Em análise pelo emissor/antifraude (ou aguardando o desafio 3DS):
            // o botão continua travado e consultamos o status até sair de "pendente".
            const desafio3ds = pagamento.acao_necessaria?.tipo === "3ds" && pagamento.acao_necessaria.url;
            if (desafio3ds) abrirDesafio3ds(pagamento.acao_necessaria.url);

            el.btnPagar.innerHTML = `<span class="spinner"></span> ${desafio3ds ? "Aguardando confirmação do banco..." : "Confirmando pagamento..."}`;
            seguimentoCartao = acompanhar(pagamento.pagamento_id, {
                limiteMs: (desafio3ds ? 5 : 2) * 60 * 1000,
                aoFinalizar: (final) => {
                    if (final.status === "aprovado") finalizar(final);
                    else falharCartao(final.mensagem);
                },
                aoLimite: () => {
                    fecharDesafio3ds();
                    definirProcessando(false);
                    mostrarErroGeralCartao("Seu pagamento ainda está em análise. Avisaremos assim que for confirmado — não tente pagar de novo.");
                }
            });
        } else {
            falharCartao(pagamento.mensagem);
        }
    }

    function falharCartao(mensagem) {
        fecharDesafio3ds();
        chaveCartao = null;
        corpoCartaoPendente = null; // resultado definitivo
        sessionStorage.removeItem(`${chaveTentativa()}_cartao_desconhecido`);
        definirProcessando(false);
        mostrarErroGeralCartao(mensagem || "O cartão foi recusado pela operadora. Verifique os dados ou tente outro cartão.");
        prepararCartao(); // token é de uso único: remonta os campos pra digitar de novo
    }

    function tratarErroCartao(erro) {
        definirProcessando(false);

        if (erro instanceof API.ApiError) {
            // 4xx = negócio recusou de vez; rede/5xx = pode ter passado, então mantém a chave.
            if (erro.status === 0 || erro.status >= 500) sessionStorage.setItem(`${chaveTentativa()}_cartao_desconhecido`, "1");
            else { chaveCartao = null; corpoCartaoPendente = null; sessionStorage.removeItem(`${chaveTentativa()}_cartao_desconhecido`); }
            if (cfg.aoErro?.(erro)) return;
            mostrarErroGeralCartao(
                erro.codigo === "idempotencia_conflitante"
                    ? "Havia uma tentativa de pagamento anterior em andamento. Confira o status e tente novamente."
                    : ((erro.status === 0 || erro.status >= 500) ? "Resultado desconhecido. Use Tentar novamente para repetir a mesma operação; não digite outro cartão." : erro.message)
            );
            if (erro.status !== 0 && erro.status < 500) prepararCartao();
            return;
        }

        // Erro de tokenização (nada foi enviado ao back, os campos seguem preenchidos)
        const campos = erro.campos || {};
        if (modoCartao === "salvo" && cartaoSalvoId) {
            // no modo "cartão salvo" os campos com erro inline estão ocultos
            mostrarErroGeralCartao(campos.cvv || erro.message || "Confira o CVV e tente novamente.");
        } else if (Object.keys(campos).length > 0) {
            definirErroCampo("cartao-numero", "erro-cartao-numero", campos.numero);
            definirErroCampo("cartao-validade", "erro-cartao-validade", campos.validade);
            definirErroCampo("cartao-cvv", "erro-cartao-cvv", campos.cvv);
            definirErroCampo("cartao-nome", "erro-cartao-nome", campos.titular);
            definirErroCampo("cartao-cpf", "erro-cartao-cpf", campos.cpf);
        } else {
            mostrarErroGeralCartao(erro.message || "Não foi possível processar o pagamento. Verifique os dados e tente novamente.");
        }
    }

    // ================= INICIALIZAÇÃO =================
    // config: {
    //   tipo: "aluguel" | "multa",
    //   solicitacaoId,
    //   total,                    // só pra exibir; o back cobra o valor dele
    //   aoAprovar(pagamento),     // pagamento confirmado pelo back
    //   aoErro(erro) -> boolean   // true = a página tratou (ex.: objeto indisponível)
    // }
    function iniciar(config) {
        cfg = config;
        rotuloPagar = `Pagar ${preco(cfg.total)}`;

        el = {
            btnPix: $("metodo-pix"),
            btnCartao: $("metodo-cartao"),
            conteudoPix: $("conteudo-pix"),
            conteudoCartao: $("conteudo-cartao"),
            metodoVazio: $("metodo-vazio"),
            pixBox: $("pix-box"),
            pixExpirado: $("pix-expirado"),
            pixAguardando: $("pix-aguardando"),
            btnPagar: $("btn-pagar-cartao"),
            erroGeral: $("cartao-erro-geral"),
            erroGeralTexto: $("cartao-erro-geral-texto"),
            acoesErro: $("cartao-acoes-erro"),
            cartoesSalvosSecao: $("cartoes-salvos-secao"),
            cartoesSalvosLista: $("cartoes-salvos-lista"),
            camposCartaoNovo: $("campos-cartao-novo"),
            btnUsarCartaoSalvo: $("btn-usar-cartao-salvo")
        };

        el.btnPagar.textContent = rotuloPagar;
        $("pix-valor").textContent = preco(cfg.total);

        el.btnPix.addEventListener("click", () => selecionarMetodo("pix"));
        el.btnCartao.addEventListener("click", () => selecionarMetodo("cartao"));
        $("btn-tentar-outro-metodo")?.addEventListener("click", voltarParaEscolhaDeMetodo);
        $("btn-copiar-pix").addEventListener("click", copiarCodigoPix);
        $("btn-gerar-novo-pix").addEventListener("click", () => abrirPix(true));
        $("form-cartao").addEventListener("submit", pagarComCartao);

        $("btn-tentar-outro-cartao").addEventListener("click", () => {
            esconderErroCartao();
            prepararCartao(); // remonta os campos seguros (limpa o que foi digitado)
        });

        $("btn-usar-outro-cartao")?.addEventListener("click", () => {
            modoCartao = "novo";
            cartaoSalvoId = null;
            el.cartoesSalvosSecao.style.display = "none";
            el.camposCartaoNovo.style.display = "block";
            el.btnUsarCartaoSalvo.style.display = cartoesSalvos.length > 0 ? "inline-block" : "none";
            esconderErroCartao();
            prepararCartao();
        });

        el.btnUsarCartaoSalvo.addEventListener("click", renderizarCartoesSalvos);

        G.ligarMascaraCpf($("cartao-cpf"));

        // Não deixa fechar a aba no meio de um pagamento sem avisar.
        window.addEventListener("beforeunload", (ev) => {
            if (emProcessamento) { ev.preventDefault(); ev.returnValue = ""; }
        });

        carregarCartoesSalvos();
    }

    window.CheckoutVizin = { iniciar, pararTudo, mostrarToast };
})();