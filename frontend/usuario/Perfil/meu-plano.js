// ================= MEU PLANO (Perfil) =================
// Mostra o plano atual, o limite de anúncios (usados / disponíveis), a situação
// e até quando o plano vale. Os planos são pagos por período via PIX, SEM
// renovação automática: não existe "cancelar renovação". Contagem e limite
// vêm SEMPRE do back-end (a validação real ao publicar também é feita lá).
(function () {
    let iniciado = false;

    const $ = (id) => document.getElementById(id);

    function formatarData(valor) {
        if (!valor) return "-";
        const d = new Date(valor);
        return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
    }

    function mostrarErro(msg) {
        $("plano-carregando").style.display = "none";
        $("plano-conteudo").style.display = "none";
        $("plano-erro").textContent = msg;
        $("plano-erro").style.display = "block";
        rolarParaPlanoSeNecessario();
    }

    function renderizarOpcoes(planos, atualCodigo) {
        const box = $("plano-opcoes");
        box.innerHTML = "";

        planos.forEach(p => {
            const ehAtual = p.codigo === atualCodigo;
            const gratuito = !(p.preco_mensal > 0);

            const el = document.createElement("div");
            el.className = "plano-opcao" + (ehAtual ? " atual" : "");

            const nome = document.createElement("p");
            nome.className = "plano-opcao-nome";
            nome.textContent = p.nome;

            const preco = document.createElement("p");
            preco.className = "plano-opcao-preco";
            preco.textContent = gratuito ? "Grátis" : `${formatarPreco(p.preco_mensal)} por mês`;

            const limite = document.createElement("p");
            limite.className = "plano-opcao-limite";
            limite.textContent = `${p.limite} anúncio${p.limite > 1 ? "s" : ""} por período`;

            el.append(nome, preco, limite);

            if (ehAtual) {
                const tag = document.createElement("span");
                tag.className = "plano-status gratuito";
                tag.textContent = "Plano atual";
                el.append(tag);
            } else if (!gratuito) {
                const a = document.createElement("a");
                a.className = "btn btn-primary";
                a.href = `/finalizar-pagamento?plano=${encodeURIComponent(p.codigo)}`;
                a.textContent = "Assinar";
                el.append(a);
            }

            box.append(el);
        });
    }

    function renderizar(a, planos) {
        $("plano-nome").textContent = a.plano.nome;
        $("plano-preco").textContent = a.gratuito ? "Grátis" : `${formatarPreco(a.plano.preco_mensal)} por período`;

        const status = $("plano-status");
        status.className = "plano-status" + (a.gratuito ? " gratuito" : a.cancelarAoFinal ? " cancelando" : "");
        status.textContent = a.gratuito ? "Plano gratuito" : "Plano ativo";

        $("plano-usados").textContent = a.usados;
        $("plano-limite").textContent = a.limite;
        $("plano-disponiveis").textContent = a.disponiveis;

        const barra = $("plano-barra");
        barra.style.width = `${a.limite > 0 ? Math.min((a.usados / a.limite) * 100, 100) : 0}%`;
        barra.classList.toggle("cheio", a.atingiuLimite);

        // Período pago (só planos pagos)
        $("plano-linha-periodo").style.display = a.gratuito ? "none" : "flex";
        $("plano-periodo-fim").textContent = formatarData(a.fimPeriodo);

        // Limite atingido → orienta a contratar um plano com mais publicações
        $("plano-opcoes-titulo").textContent = a.atingiuLimite
            ? "Você atingiu o limite de anúncios — contrate um plano com mais publicações"
            : "Planos disponíveis";

        renderizarOpcoes(planos, a.plano.codigo);

        $("plano-carregando").style.display = "none";
        $("plano-erro").style.display = "none";
        $("plano-conteudo").style.display = "block";
        rolarParaPlanoSeNecessario();
    }

    // O card começa escondido e só aparece depois que o perfil carrega, então o
    // navegador não consegue rolar sozinho até "#plano": fazemos isso aqui.
    let jaRolou = false;
    function rolarParaPlanoSeNecessario() {
        if (jaRolou || window.location.hash !== "#plano") return;
        jaRolou = true;
        $("card-plano")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function carregar() {
        try {
            const [assinatura, planos] = await Promise.all([
                AssinaturasAPI.obterMinhaAssinatura(),
                AssinaturasAPI.listarPlanos()
            ]);
            renderizar(assinatura, planos);
        } catch (erro) {
            console.error(erro);
            mostrarErro(erro.message || "Não foi possível carregar seu plano. Tente novamente em instantes.");
        }
    }

    window.PlanoPerfilVizin = {
        iniciar() {
            if (iniciado) return;
            iniciado = true;
            carregar();
        },
        recarregar: carregar
    };
})();