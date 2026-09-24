// ================= BOTÃO ANUNCIAR =================
const btnAdicionar = document.querySelector('.btn-adicionar');
 
if (btnAdicionar) {
 
    btnAdicionar.addEventListener('click', () => {
 
        window.location.href = "/cadastrar-objeto";
 
    });
 
 
}
 
// ================= OBJETOS REAIS =================
// window.ObjetosVizin.obterTodos() já bate em GET /api/objetos de verdade
// (ver objetos-shared.js) — não é mais mock. `categoriaSlug` já bate com
// os values do <select> de filtro (ferramentas, eletronicos, camping,
// esportes, festas, casajardim, transportes, outros).
//
// PENDÊNCIA a levar pro back-end: media/totalAvaliacoes ainda são buscados
// objeto por objeto aqui embaixo (window.AvaliacoesVizin.obterAvaliacoesDoProduto),
// o que agora é uma requisição de rede REAL por objeto (N+1) — antes, com o
// mock em localStorage, isso era "grátis". Se a lista crescer, isso vira um
// problema de performance de verdade. O ideal é GET /api/objetos já
// devolver media/totalAvaliacoes prontos por objeto, e essa chamada extra
// deixar de existir.
//
// Também não filtra mais no servidor: busca/local/categoria continuam
// sendo aplicados no front sobre a lista inteira (ver buscarObjetos()) —
// considerar aceitar esses três como query params (?busca=&local=&categoria=)
// se a base de objetos crescer.
async function carregarObjetos() {

    if (!window.ObjetosVizin) return [];

    // Tanto ObjetosVizin quanto AvaliacoesVizin já batem numa API real
    // agora (nenhum dos dois é mais síncrono/local) — por isso o await nas
    // duas chamadas e o Promise.all no lugar do .map() simples de antes.
    const objetos = await window.ObjetosVizin.obterTodos();

    return Promise.all(objetos.map(async obj => {

        let avaliacao = { media: 0, total: 0 };
        if (window.AvaliacoesVizin) {
            try {
                avaliacao = await window.AvaliacoesVizin.obterAvaliacoesDoProduto(obj.id);
            } catch (erro) {
                console.error("Não foi possível carregar a avaliação de um objeto:", erro);
            }
        }

        return {
            id: obj.id,
            nome: obj.titulo,
            descricao: obj.descricao,
            // categoria agora pode vir como objeto { id, nome, slug } —
            // `categoria` fica com o nome pra exibição no card,
            // `categoriaSlug` com o slug pra bater com o value do <select>
            // de filtro (que usa ferramentas/eletronicos/... como value).
            categoria: obj.categoria?.nome || obj.categoria_nome || obj.categoria || "",
            categoriaSlug: obj.categoria?.slug || obj.categoria_slug || obj.categoria || "",
            preco: obj.preco_dia ?? obj.preco ?? obj.preco_por_dia,
            localizacao: obj.localizacao,
            imagem: obj.imagem || "/assets/usuario/img/sem-imagem.jpg",
            media: avaliacao.media,
            totalAvaliacoes: avaliacao.total
        };

    }));

}
 
// ================= BUSCA =================
const inputBusca = document.getElementById('inputBusca');
const inputLocal = document.getElementById('inputLocal');
const selectCategoria = document.getElementById('selectCategoria');

window.CategoriasVizin.carregar(selectCategoria, { rotuloVazio: 'Todas' })
    .catch(erro => {
        console.error('Não foi possível carregar as categorias:', erro);
        selectCategoria.replaceChildren(new Option('Categorias indisponíveis', ''));
        selectCategoria.disabled = true;
    });
 
async function buscarObjetos() {
 
    const busca = inputBusca.value.toLowerCase();
    const local = inputLocal.value.toLowerCase();
    const categoria = selectCategoria.value;
 
    mostrarCarregando();
 
    let todos;
 
    try {
 
        todos = await carregarObjetos();
 
    } catch (erro) {
 
        // Cobre o caso do fetch real falhar (rede caiu, API fora do ar
        // etc). Com o mock atual isso nunca deve disparar, mas o estado
        // já fica pronto pra quando a chamada virar de verdade.
        console.error("Erro ao carregar objetos:", erro);
        mostrarErroCarregamento();
        return;
 
    }
 
    const filtrados = todos.filter(obj => {
 
        return (
 
            obj.nome.toLowerCase().includes(busca) &&
            obj.localizacao.toLowerCase().includes(local) &&
            (categoria === "" || obj.categoriaSlug === categoria)
 
        );
 
    });
 
    // Distingue "ainda não existe nenhum objeto cadastrado" de
    // "existem objetos, mas os filtros não bateram com nenhum" —
    // pra mostrar uma mensagem (e uma ação) diferente em cada caso.
    renderizarObjetos(filtrados, {
        baseVazia: todos.length === 0,
        filtrosAtivos: busca !== "" || local !== "" || categoria !== ""
    });
 
}
 
// Usado pelo botão "Limpar filtros" no estado de busca sem resultado.
function limparFiltros() {
 
    inputBusca.value = "";
    inputLocal.value = "";
    selectCategoria.value = "";
 
    buscarObjetos();
 
}
 
// ================= DEBOUNCE =================
let timeout;
 
function debounceBusca() {
 
    clearTimeout(timeout);
 
    timeout = setTimeout(() => {
 
        buscarObjetos();
 
    }, 400);
 
}
 
// ================= EVENTOS =================
if (inputBusca) {
 
    inputBusca.addEventListener('input', debounceBusca);
 
}
 
if (inputLocal) {
 
    inputLocal.addEventListener('input', debounceBusca);
 
}
 
if (selectCategoria) {
 
    selectCategoria.addEventListener('change', buscarObjetos);
 
}
 
// ================= ESTADOS DE CARREGAMENTO / ERRO =================
// Skeleton enquanto os objetos carregam. Com o mock atual isso passa
// quase instantâneo, mas fica pronto pro tempo real de uma chamada de
// API - sem isso a lista simplesmente "pisca" vazia até os dados
// chegarem.
function mostrarCarregando() {

    const container = document.getElementById('lista-objetos');

    if (!container) return;

    container.innerHTML = "";
    container.setAttribute('aria-busy', 'true');

    const contador = document.getElementById('contadorResultados');
    if (contador) contador.classList.add('contador-resultados--oculto');

    for (let i = 0; i < 6; i++) {

        const skeleton = document.createElement('div');
        skeleton.className = 'skeleton-card';
        skeleton.setAttribute('aria-hidden', 'true');

        const img = document.createElement('div');
        img.className = 'skeleton-img';
        skeleton.appendChild(img);

        const body = document.createElement('div');
        body.className = 'skeleton-body';

        const titulo = document.createElement('div');
        titulo.className = 'skeleton-linha skeleton-linha--titulo';
        body.appendChild(titulo);

        const texto = document.createElement('div');
        texto.className = 'skeleton-linha skeleton-linha--texto';
        body.appendChild(texto);

        skeleton.appendChild(body);
        container.appendChild(skeleton);

    }

}

// Estado de falha ao carregar (rede caiu, API fora do ar, timeout etc).
function mostrarErroCarregamento() {

    const container = document.getElementById('lista-objetos');

    if (!container) return;

    container.innerHTML = "";
    container.removeAttribute('aria-busy');

    const contador = document.getElementById('contadorResultados');
    if (contador) contador.classList.add('contador-resultados--oculto');

    const erro = document.createElement('div');
    erro.className = 'erro-carregamento';

    const icone = document.createElement('i');
    icone.className = 'bi bi-exclamation-triangle';
    erro.appendChild(icone);

    const texto = document.createElement('p');
    texto.textContent = "Não foi possível carregar os objetos agora.";
    erro.appendChild(texto);

    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'btn-limpar';
    botao.textContent = 'Tentar novamente';
    botao.addEventListener('click', buscarObjetos);
    erro.appendChild(botao);

    container.appendChild(erro);

}

// ================= CONTADOR DE RESULTADOS =================
function atualizarContador(quantidade, opcoes = {}) {
 
    const contador = document.getElementById('contadorResultados');
 
    if (!contador) return;
 
    const texto = contador.querySelector('span');
 
    // Sem objeto nenhum cadastrado ainda: o card de "sem-resultado"
    // já explica a situação, o chip do contador some.
    if (opcoes.baseVazia) {
        contador.classList.add('contador-resultados--oculto');
        if (texto) texto.textContent = "";
        return;
    }
 
    contador.classList.remove('contador-resultados--oculto');
 
    if (texto) {
        texto.textContent = quantidade === 1
            ? "1 objeto encontrado"
            : `${quantidade} objetos encontrados`;
    }
 
}
 
// ================= CARD DE PRODUTO (via DOM, não innerHTML) =================
// Monta o card criando elementos e usando textContent para todo dado
// vindo do objeto (nome, categoria, localização, imagem). Isso evita
// que qualquer um desses campos precise ser escapado manualmente e
// fecha a brecha que existia antes: a URL da imagem ia direto pro
// atributo src via template string, sem escapar aspas, o que abriria
// espaço pra injeção de atributo se algum dia esse dado vier de uma
// API/usuário malicioso.
function criarCardObjeto(obj) {
 
    const card = document.createElement('a');
    card.href = `/produto?id=${encodeURIComponent(obj.id)}`;
    card.className = 'card-produto';
    card.setAttribute('aria-label', `Ver detalhes de ${obj.nome}`);
 
    // -- imagem --
    const imgContainer = document.createElement('div');
    imgContainer.className = 'card-img-container';
 
    const img = document.createElement('img');
    img.src = obj.imagem;
    img.alt = obj.nome;
    img.className = 'card-img';
    img.loading = 'lazy';
 
    // Fallback se a imagem quebrar (URL inválida, arquivo removido etc).
    // Remove o próprio listener antes de trocar o src, pra não entrar
    // em loop caso a imagem de fallback também falhe.
    img.addEventListener('error', function aoFalhar() {
        img.removeEventListener('error', aoFalhar);
        img.src = '/assets/usuario/img/sem-imagem.jpg';
    });
 
    imgContainer.appendChild(img);
 
    const preco = document.createElement('span');
    preco.className = 'preco';
    preco.textContent = obj.preco === 0
        ? "Grátis"
        : `${formatarPreco(obj.preco)}/dia`;
    imgContainer.appendChild(preco);
 
    card.appendChild(imgContainer);
 
    // -- corpo --
    const body = document.createElement('div');
    body.className = 'card-body';
 
    const titulo = document.createElement('h3');
    titulo.textContent = obj.nome;
    body.appendChild(titulo);
 
    const meta = document.createElement('div');
    meta.className = 'card-meta';
 
    const categoriaTag = document.createElement('span');
    categoriaTag.className = 'categoria-tag';
    categoriaTag.innerHTML = '<i class="bi bi-tag"></i> ';
    categoriaTag.append(obj.categoria); // texto seguro (append, não innerHTML)
    meta.appendChild(categoriaTag);
 
    const localizacaoTag = document.createElement('span');
    localizacaoTag.className = 'localizacao';
    localizacaoTag.innerHTML = '<i class="bi bi-geo-alt"></i> ';
    localizacaoTag.append(obj.localizacao);
    meta.appendChild(localizacaoTag);
 
    body.appendChild(meta);
    body.appendChild(document.createElement('hr'));
 
    const footer = document.createElement('div');
    footer.className = 'card-footer';
 
    const rating = document.createElement('span');
    rating.className = 'card-rating';
 
    if (obj.totalAvaliacoes > 0) {
        // media/totalAvaliacoes são números vindos do próprio app,
        // não texto livre, então não há risco de injeção aqui.
        rating.innerHTML = `⭐ ${obj.media.toFixed(1)} <small>(${obj.totalAvaliacoes})</small>`;
    } else {
        rating.textContent = "⭐ Novo";
    }
 
    footer.appendChild(rating);
    body.appendChild(footer);
 
    card.appendChild(body);
 
    return card;
 
}
 
// ================= RENDER DOS PRODUTOS =================
function renderizarObjetos(lista, opcoes = {}) {
 
    const container = document.getElementById('lista-objetos');
 
    if (!container) return;
 
    container.innerHTML = "";
    container.removeAttribute('aria-busy');
 
    atualizarContador(lista.length, opcoes);
 
    // sem resultados
    if (lista.length === 0) {
 
        const semResultado = document.createElement('div');
        semResultado.className = 'sem-resultado';
 
        const icone = document.createElement('i');
        icone.className = 'bi bi-search';
        semResultado.appendChild(icone);
 
        const texto = document.createElement('p');
 
        if (opcoes.baseVazia) {
 
            // Ainda não existe nenhum objeto cadastrado no app —
            // mensagem convida a cadastrar o primeiro, em vez de sugerir
            // "tentar outra busca" (que não faria sentido aqui).
            texto.textContent = "Ainda não há objetos cadastrados por aqui.";
            semResultado.appendChild(texto);
 
            const link = document.createElement('a');
            link.href = '/cadastrar-objeto';
            link.className = 'btn-limpar';
            link.textContent = 'Anunciar o primeiro objeto';
            semResultado.appendChild(link);
 
        } else {
 
            texto.textContent = "Nenhum objeto encontrado com esses filtros.";
            semResultado.appendChild(texto);
 
            if (opcoes.filtrosAtivos) {
 
                const botaoLimpar = document.createElement('button');
                botaoLimpar.type = 'button';
                botaoLimpar.className = 'btn-limpar';
                botaoLimpar.textContent = 'Limpar filtros';
                botaoLimpar.addEventListener('click', limparFiltros);
                semResultado.appendChild(botaoLimpar);
 
            }
 
        }
 
        container.appendChild(semResultado);
 
        return;
 
    }
 
    // renderizar cards
    // Card inteiro é um <a> semântico: melhora acessibilidade
    // (navegação por teclado, leitor de tela, "abrir em nova guia").
    lista.forEach(obj => {
 
        container.appendChild(criarCardObjeto(obj));
 
    });
 
}
 
// ================= LOAD INICIAL =================
buscarObjetos();
 
// Mantém os cards em dia se um objeto novo for cadastrado ou uma
// avaliação for enviada enquanto esta aba estiver aberta.
// "objetosAtualizados" fica sem efeito por enquanto: objetos-shared.js não
// dispara mais esse evento (não existe mais localStorage próprio pra
// vigiar). Deixado registrado por segurança, caso um dia exista um canal
// em tempo real que reaproveite esse mesmo nome de evento. Sem isso, a
// lista só atualiza de novo quando a pessoa recarregar a página.
document.addEventListener("objetosAtualizados", buscarObjetos);
document.addEventListener("avaliacoesAtualizadas", buscarObjetos);
 
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
 
// ================= BOAS VINDAS =================
const boasVindas = document.getElementById("boasVindas");
 
window.SessaoVizin?.pronto.then(usuario => {
    if (!usuario || !boasVindas) return;
    boasVindas.textContent = "👋 Bem-vindo(a), ";
    const nomeUsuario = document.createElement("strong");
    nomeUsuario.textContent = usuario.nome;
    boasVindas.appendChild(nomeUsuario);
});
