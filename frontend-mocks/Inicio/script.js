// ================= PROTEGER HOME =================
if (!localStorage.getItem("token")) {
 
    // Guarda um aviso pra tela de Login mostrar (ex: via toast lá),
    // já que aqui o redirecionamento é imediato e o usuário não teria
    // tempo de entender por que "caiu" na tela de login.
    sessionStorage.setItem(
        "mensagemLogin",
        "Você precisa estar logado para acessar essa página."
    );
 
    window.location.href = "../Login/index.html";
 
}
 
// ================= BOTÃO ANUNCIAR =================
const btnAdicionar = document.querySelector('.btn-adicionar');
 
if (btnAdicionar) {
 
    btnAdicionar.addEventListener('click', () => {
 
        window.location.href = "../Cadastrar-objeto/index.html";
 
    });
 
 
}
 
// ================= OBJETOS REAIS =================
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// let objetosCache = [];
// async function carregarObjetos() {
//     const response = await fetch("/api/objetos");
//     objetosCache = await response.json();
//     return objetosCache;
// }
function carregarObjetos() {
 
    if (!window.ObjetosVizin) return [];
 
    return window.ObjetosVizin.obterTodos().map(obj => {
 
        const avaliacao = window.AvaliacoesVizin
            ? window.AvaliacoesVizin.obterAvaliacoesDoProduto(obj.id)
            : { media: 0, total: 0 };
 
        return {
            id: obj.id,
            nome: obj.titulo,
            descricao: obj.descricao,
            categoria: obj.categoria,
            preco: obj.preco_dia,
            localizacao: obj.localizacao,
            imagem: obj.imagem || "../img/sem-imagem.jpg",
            media: avaliacao.media,
            totalAvaliacoes: avaliacao.total
        };
 
    });
 
}
 
// ================= BUSCA =================
const inputBusca = document.getElementById('inputBusca');
const inputLocal = document.getElementById('inputLocal');
const selectCategoria = document.getElementById('selectCategoria');
 
function buscarObjetos() {
 
    const busca = inputBusca.value.toLowerCase();
    const local = inputLocal.value.toLowerCase();
    const categoria = selectCategoria.value;
 
    const todos = carregarObjetos();
 
    const filtrados = todos.filter(obj => {
 
        return (
 
            obj.nome.toLowerCase().includes(busca) &&
            obj.localizacao.toLowerCase().includes(local) &&
            (categoria === "" || obj.categoria === categoria)
 
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
    card.href = `../Produto/index.html?id=${encodeURIComponent(obj.id)}`;
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
        img.src = '../img/sem-imagem.jpg';
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
            link.href = '../Cadastrar-objeto/index.html';
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
 
// Protegido contra JSON corrompido em localStorage.usuario (ex: dado
// truncado ou editado manualmente) — sem isso, um JSON.parse
// quebrado derrubava o script inteiro e travava busca, filtros etc.
let usuario = null;
 
try {
 
    usuario = JSON.parse(localStorage.getItem("usuario") || "null");
 
} catch (erro) {
 
    console.error("Dados de usuário corrompidos no localStorage:", erro);
    localStorage.removeItem("usuario");
 
}
 
if (usuario && boasVindas) {
 
    boasVindas.textContent = "👋 Bem-vindo(a), ";
 
    const nomeUsuario = document.createElement("strong");
    nomeUsuario.textContent = usuario.nome;
 
    boasVindas.appendChild(nomeUsuario);
 
}
 