// Página de escolha de plano. Dados 100% do back (planos públicos + assinatura atual).
(async function () {
    const $ = (id) => document.getElementById(id);

    const BENEFICIOS = {
        gratuito: ["Ideal para começar", "Mensagens e avaliações", "Registro de retirada e devolução"],
        pago: ["Tudo do plano gratuito", "Mais anúncios publicados", "Pagamento via PIX"]
    };

    function formatarData(valor) {
        const d = new Date(valor);
        return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
    }

    function renderizarAtual(a) {
        $("planos-atual").hidden = false;
        $("atual-nome").textContent = a.plano.nome;
        $("atual-validade").textContent = a.gratuito
            ? "Plano gratuito"
            : (a.fimPeriodo ? `Válido até ${formatarData(a.fimPeriodo)}` : "");
        const barra = $("atual-barra");
        barra.style.width = `${a.limite > 0 ? Math.min((a.usados / a.limite) * 100, 100) : 0}%`;
        barra.classList.toggle("cheio", a.atingiuLimite);
        $("atual-uso").innerHTML = `<b>${a.usados}</b> de <b>${a.limite}</b> anúncios usados · ${a.disponiveis} disponível(is)`;
        $("atual-aviso").hidden = !a.atingiuLimite;
    }

    function criar(tag, classe, texto) {
        const el = document.createElement(tag);
        if (classe) el.className = classe;
        if (texto != null) el.textContent = texto;
        return el;
    }

    function cartao(p, atualCodigo) {
        const gratuito = !(p.preco_mensal > 0);
        const ehAtual = p.codigo === atualCodigo;
        const card = criar("article", "plano-card" + (ehAtual ? " atual" : ""));
        if (ehAtual) card.append(criar("span", "plano-selo", "Seu plano"));

        card.append(criar("h2", "", p.nome));
        const preco = criar("div", "plano-preco", gratuito ? "R$ 0" : formatarPreco(p.preco_mensal));
        if (!gratuito) preco.append(criar("small", "", " / período"));
        card.append(preco);
        card.append(criar("p", "plano-anuncios", `Até ${p.limite} anúncio${p.limite > 1 ? "s" : ""}`));

        const ul = criar("ul");
        (gratuito ? BENEFICIOS.gratuito : BENEFICIOS.pago).forEach(t => {
            const li = criar("li");
            li.append(criar("i", "bi bi-check-lg"), document.createTextNode(t));
            ul.append(li);
        });
        card.append(ul);

        if (ehAtual) {
            const b = criar("button", "btn btn-secondary", "Plano atual");
            b.disabled = true;
            card.append(b);
        } else if (gratuito) {
            card.append(criar("p", "plano-nota-btn", "Você volta a este plano quando o período pago termina."));
        } else {
            const a = criar("a", "btn btn-primary", "Assinar");
            a.href = `/finalizar-pagamento?plano=${encodeURIComponent(p.codigo)}`;
            card.append(a);
        }
        return card;
    }

    try {
        const [atual, planos] = await Promise.all([
            AssinaturasAPI.obterMinhaAssinatura(),
            AssinaturasAPI.listarPlanos()
        ]);
        renderizarAtual(atual);
        const grade = $("planos-grade");
        planos.sort((a, b) => a.preco_mensal - b.preco_mensal)
              .forEach(p => grade.append(cartao(p, atual.plano.codigo)));
    } catch (erro) {
        console.error(erro);
        $("planos-erro").textContent = erro.message || "Não foi possível carregar os planos. Tente novamente em instantes.";
        $("planos-erro").hidden = false;
    } finally {
        $("planos-carregando").hidden = true;
    }
})();