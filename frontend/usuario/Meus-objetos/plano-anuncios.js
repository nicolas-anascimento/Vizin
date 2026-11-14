// ================= PLANO DE ANÚNCIOS — CARD DE LIMITE (compartilhado) =================
// Usado em Meus Objetos e Cadastrar Objeto. Mostra o plano atual, o limite
// mensal, quantos anúncios já foram usados e quantos ainda estão disponíveis.
// A contagem e o limite vêm SEMPRE do back-end (a regra de "o que conta como
// anúncio usado" é única e fica lá); o bloqueio real de novas publicações
// também é feito no back — aqui é só orientação ao usuário.
//
// Depende de: utils/assinaturas-api.js (AssinaturasAPI.obterMinhaAssinatura).
const PlanoAnunciosVizin = (function () {
    "use strict";

    let ultimo = null;

    async function carregar() {
        const a = await AssinaturasAPI.obterMinhaAssinatura();
        ultimo = {
            planoNome: a.plano.nome,
            gratuito: a.gratuito,
            limite: a.limite,
            usados: a.usados,
            disponiveis: a.disponiveis,
            atingiuLimite: a.atingiuLimite
        };
        return ultimo;
    }

    function criarLinha(rotulo, valor) {
        const li = document.createElement("span");
        li.className = "plano-anuncios-item";
        const r = document.createElement("small");
        r.textContent = rotulo;
        const v = document.createElement("strong");
        v.textContent = valor;
        li.append(r, v);
        return li;
    }

    // Preenche o container (elemento ou id) com o card. Em caso de erro, some
    // em silêncio (o backend continua sendo quem barra a publicação).
    async function renderizar(container) {
        const el = typeof container === "string" ? document.getElementById(container) : container;
        if (!el) return null;

        let info;
        try {
            info = await carregar();
        } catch (erro) {
            console.error("Não foi possível carregar o plano de anúncios:", erro);
            el.style.display = "none";
            return null;
        }

        el.innerHTML = "";
        el.className = "plano-anuncios-card" + (info.atingiuLimite ? " limite-atingido" : "");

        const topo = document.createElement("div");
        topo.className = "plano-anuncios-topo";
        const titulo = document.createElement("strong");
        titulo.textContent = `Plano ${info.planoNome}`;
        const link = document.createElement("a");
        link.href = "/planos";
        link.textContent = "Gerenciar plano";
        topo.append(titulo, link);

        const itens = document.createElement("div");
        itens.className = "plano-anuncios-itens";
        itens.append(
            criarLinha("Limite mensal", info.limite),
            criarLinha("Utilizados", info.usados),
            criarLinha("Disponíveis", info.disponiveis)
        );

        const barra = document.createElement("div");
        barra.className = "plano-anuncios-barra";
        const preench = document.createElement("div");
        preench.style.width = `${info.limite > 0 ? Math.min((info.usados / info.limite) * 100, 100) : 0}%`;
        barra.append(preench);

        el.append(topo, itens, barra);

        if (info.atingiuLimite) {
            const aviso = document.createElement("p");
            aviso.className = "plano-anuncios-aviso";
            aviso.append("Você atingiu o limite de anúncios do seu plano neste mês. ");
            const a = document.createElement("a");
            a.href = "/planos";
            a.textContent = info.gratuito
                ? "Contrate um plano com mais publicações."
                : "Contrate um plano com mais publicações.";
            aviso.append(a);
            el.append(aviso);
        }

        el.style.display = "block";
        return info;
    }

    return { carregar, renderizar, obterUltimo: () => ultimo };
})();

window.PlanoAnunciosVizin = PlanoAnunciosVizin;