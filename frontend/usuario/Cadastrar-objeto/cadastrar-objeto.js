// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
 
    sessionStorage.setItem(
        "mensagemLogin",
        "Você precisa estar logado para acessar essa página."
    );
 
    window.location.href = "/login";
 
}
 
// Protegido contra JSON corrompido em localStorage.usuario — sem isso, um
// JSON.parse quebrado derrubava o script inteiro (nem o formulário
// funcionaria).
let usuarioLogado = null;
 
try {
 
    usuarioLogado = JSON.parse(localStorage.getItem("usuario") || "null");
 
} catch (erro) {
 
    console.error("Dados de usuário corrompidos no localStorage:", erro);
    localStorage.removeItem("usuario");
 
}
 
/* ---------- Upload de fotos (até 5, primeira = principal) ---------- */
const MAX_PHOTOS = 5;
const MAX_FILE_SIZE_MB = 15;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
 
const photosGrid = document.getElementById("photos-grid");
const addSlot = document.getElementById("add-photo-slot");
const photoInput = document.getElementById("photo-input");
 
// Guarda os arquivos reais selecionados (para enviar ao back-end)
let selectedFiles = [];
 
// URLs de blob (URL.createObjectURL) criadas pra pré-visualização — cada
// renderPhotos() revoga as da chamada anterior antes de criar novas, senão
// elas se acumulam na memória do navegador até a página ser fechada.
let photoPreviewURLs = [];
 
addSlot.addEventListener("click", () => photoInput.click());
 
// Acessibilidade: o slot é uma <div role="button">, não um <button> de
// verdade, então precisa responder a Enter/Espaço manualmente pra quem
// navega só por teclado conseguir abrir o seletor de arquivos.
addSlot.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        addSlot.click();
    }
});
 
photoInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files);
  const remainingSlots = MAX_PHOTOS - selectedFiles.length;
 
  let ignoradosPorTipo = 0;
  let ignoradosPorTamanho = 0;
 
  const aceitas = files.filter(file => {
    if (!file.type.startsWith("image/")) {
      ignoradosPorTipo++;
      return false;
    }
    // Um arquivo de 20-30MB pode travar o canvas.drawImage por um instante
    // perceptível em celulares mais fracos — melhor recusar antes de tentar
    // processar do que deixar a página travar sem explicação.
    if (file.size > MAX_FILE_SIZE_BYTES) {
      ignoradosPorTamanho++;
      return false;
    }
    return true;
  });
 
  aceitas.slice(0, remainingSlots).forEach(file => selectedFiles.push(file));
  const ignoradosPorLimite = Math.max(0, aceitas.length - remainingSlots);
 
  renderPhotos();
  photoInput.value = ""; // permite selecionar o mesmo arquivo de novo se removido
 
  avisarFotosIgnoradas(ignoradosPorTipo, ignoradosPorTamanho, ignoradosPorLimite);
});
 
// Antes esses casos (arquivo não-imagem, arquivo grande demais, ou seleção
// além do espaço restante) simplesmente "sumiam" sem explicação nenhuma
// pro usuário.
function avisarFotosIgnoradas(ignoradosPorTipo, ignoradosPorTamanho, ignoradosPorLimite) {
  const partes = [];
 
  if (ignoradosPorTipo > 0) {
    partes.push(`${ignoradosPorTipo} arquivo${ignoradosPorTipo > 1 ? "s" : ""} ignorado${ignoradosPorTipo > 1 ? "s" : ""} (apenas imagens são aceitas)`);
  }
 
  if (ignoradosPorTamanho > 0) {
    partes.push(`${ignoradosPorTamanho} arquivo${ignoradosPorTamanho > 1 ? "s" : ""} ignorado${ignoradosPorTamanho > 1 ? "s" : ""} (máximo de ${MAX_FILE_SIZE_MB}MB por foto)`);
  }
 
  if (ignoradosPorLimite > 0) {
    partes.push(`${ignoradosPorLimite} foto${ignoradosPorLimite > 1 ? "s" : ""} não adicionada${ignoradosPorLimite > 1 ? "s" : ""} (máximo de ${MAX_PHOTOS} fotos)`);
  }
 
  if (partes.length) {
    statusMsg.textContent = partes.join(". ") + ".";
    statusMsg.className = "status-msg error";
  }
}
 
function renderPhotos() {
  // Revoga as URLs de blob da renderização anterior antes de criar as novas.
  photoPreviewURLs.forEach(url => URL.revokeObjectURL(url));
  photoPreviewURLs = [];
 
  // Remove todos os slots de preview (mantém o slot de "adicionar")
  photosGrid.querySelectorAll(".photo-slot.filled").forEach(el => el.remove());
 
  selectedFiles.forEach((file, index) => {
    const slot = document.createElement("div");
    slot.className = "photo-slot filled";
 
    const url = URL.createObjectURL(file);
    photoPreviewURLs.push(url);
 
    const img = document.createElement("img");
    img.src = url;
    img.alt = index === 0 ? "Foto principal do objeto" : `Foto ${index + 1} do objeto`;
    slot.appendChild(img);
 
    if (index === 0) {
      const tag = document.createElement("span");
      tag.className = "main-tag";
      tag.textContent = "Principal";
      slot.appendChild(tag);
    }
 
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-btn";
    removeBtn.innerHTML = "&times;";
    removeBtn.setAttribute("aria-label", "Remover foto");
    removeBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      selectedFiles.splice(index, 1);
      formSujo = true;
      renderPhotos();
    });
    slot.appendChild(removeBtn);
 
    photosGrid.insertBefore(slot, addSlot);
  });
 
  // Esconde o botão de adicionar quando atingir o limite
  addSlot.style.display = selectedFiles.length >= MAX_PHOTOS ? "none" : "flex";
}
 
// Em vez de guardar a foto em base64 no tamanho original (o que faz
// arquivos de celular — 3 a 5MB cada — estourarem a cota do localStorage,
// que costuma ser só 5 a 10MB no total), redimensionamos pra no máximo
// 1280px no lado maior e comprimimos como JPEG. Isso reduz o tamanho em
// geral pra algumas dezenas/centenas de KB por foto, e foi a causa mais
// provável do "Não foi possível cadastrar o objeto" acontecer só às vezes
// (só quando as fotos somadas passavam do limite).
function redimensionarImagem(file, maxLado = 1280, qualidade = 0.75) {
  // Devolve um File JPEG já reduzido (lado maior até 1280 px) — sobe por multipart,
  // sem base64 e sem localStorage. Mantém o envio bem abaixo de limites de tamanho.
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxLado || height > maxLado) {
        const escala = maxLado / Math.max(width, height);
        width = Math.round(width * escala);
        height = Math.round(height * escala);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error("Não foi possível processar uma das imagens."));
        const nome = (file.name || "foto").replace(/\.[^.]+$/, "") + ".jpg";
        resolve(new File([blob], nome, { type: "image/jpeg" }));
      }, "image/jpeg", qualidade);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler uma das imagens."));
    };
    img.src = url;
  });
}
 
/* ---------- Validação e envio do formulário ---------- */
const form = document.getElementById("form-cadastro-objeto");
const btnSubmit = document.getElementById("btn-submit");
const btnCancelar = document.getElementById("btn-cancelar");
const statusMsg = document.getElementById("status-msg");
 
const requiredFields = ["titulo", "descricao", "categoria", "preco", "localizacao"];
 
// A partir desse valor, pedimos uma confirmação extra antes de enviar —
// evita erro de dedo tipo "99999" onde a intenção era "99". Ajustável.
const LIMITE_PRECO_CONFIRMACAO = 1000;
 
// ================= CONTADOR DE CARACTERES =================
// Sem isso, o campo simplesmente para de aceitar input ao bater o
// maxlength, sem nenhuma pista visual de quanto falta — parece bug pra
// quem não repara.
function ligarContadorCaracteres(inputEl, max) {
  const contador = document.createElement("div");
  contador.className = "char-counter";
  inputEl.insertAdjacentElement("afterend", contador);
 
  function atualizar() {
    const tamanho = inputEl.value.length;
    contador.textContent = `${tamanho}/${max}`;
    contador.classList.toggle("char-counter--limite", tamanho >= max);
  }
 
  inputEl.addEventListener("input", atualizar);
  atualizar();
 
  return atualizar;
}
 
ligarContadorCaracteres(document.getElementById("titulo"), 80);
ligarContadorCaracteres(document.getElementById("descricao"), 1000);
 
// ================= ALTERAÇÕES NÃO SALVAS =================
// Marca o formulário como "sujo" assim que o usuário mexe em algo, pra
// avisar antes de sair sem salvar (Cancelar, fechar a aba, dar voltar).
let formSujo = false;
 
window.addEventListener("beforeunload", (e) => {
  if (!formSujo) return;
  e.preventDefault();
  e.returnValue = "";
});
 
// ================= RASCUNHO AUTOMÁTICO =================
// Salva os campos de texto (não as fotos, que não cabem bem em
// localStorage) a cada alteração, e oferece continuar de onde parou se a
// pessoa voltar a esta página sem ter enviado o formulário. Chave inclui o
// email do usuário pra não misturar rascunhos entre contas no mesmo
// navegador.
const CHAVE_RASCUNHO = `rascunho_cadastro_objeto_${usuarioLogado?.id || usuarioLogado?.email || "anonimo"}`;
 
function camposParaRascunho() {
  return {
    titulo: document.getElementById("titulo").value,
    descricao: document.getElementById("descricao").value,
    categoria: document.getElementById("categoria").value,
    preco: document.getElementById("preco").value,
    localizacao: document.getElementById("localizacao").value,
    disponivelImediato: document.getElementById("disponivel-imediato").checked
  };
}
 
function salvarRascunho() {
  try {
    localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(camposParaRascunho()));
  } catch (erro) {
    // O rascunho é um "nice to have" — se falhar (cota cheia etc.), não
    // deve interromper o preenchimento do formulário.
    console.warn("Não foi possível salvar o rascunho:", erro);
  }
}
 
function limparRascunho() {
  localStorage.removeItem(CHAVE_RASCUNHO);
}
 
function aplicarRascunho(dados) {
  document.getElementById("titulo").value = dados.titulo || "";
  document.getElementById("descricao").value = dados.descricao || "";
  document.getElementById("categoria").value = dados.categoria || "";
  document.getElementById("preco").value = dados.preco || "";
  document.getElementById("localizacao").value = dados.localizacao || "";
  document.getElementById("disponivel-imediato").checked = dados.disponivelImediato !== false;
 
  // Dispara os contadores de caracteres manualmente, já que setar
  // .value não dispara o evento "input" sozinho.
  document.getElementById("titulo").dispatchEvent(new Event("input"));
  document.getElementById("descricao").dispatchEvent(new Event("input"));
 
  formSujo = true;
}
 
function mostrarBannerRascunho(dados) {
  const banner = document.createElement("div");
  banner.className = "rascunho-banner";
 
  const texto = document.createElement("span");
  texto.textContent = "Você tem um formulário não enviado. Deseja continuar de onde parou?";
  banner.appendChild(texto);
 
  const acoes = document.createElement("div");
  acoes.className = "rascunho-banner-acoes";
 
  const btnContinuar = document.createElement("button");
  btnContinuar.type = "button";
  btnContinuar.textContent = "Continuar rascunho";
  btnContinuar.addEventListener("click", async () => {
    try {
      await categoriasProntas;
      aplicarRascunho(dados);
      banner.remove();
    } catch (_) {
      statusMsg.textContent = "Não foi possível carregar as categorias. Recarregue a página.";
    }
  });
 
  const btnDescartar = document.createElement("button");
  btnDescartar.type = "button";
  btnDescartar.textContent = "Descartar";
  btnDescartar.addEventListener("click", () => {
    limparRascunho();
    banner.remove();
  });
 
  acoes.appendChild(btnContinuar);
  acoes.appendChild(btnDescartar);
  banner.appendChild(acoes);
 
  form.insertBefore(banner, form.firstChild);
}
 
// Verifica, já no carregamento da página, se existe um rascunho salvo com
// conteúdo relevante (ignora rascunhos vazios/só de checkbox).
(function verificarRascunhoExistente() {
  let dadosSalvos = null;
 
  try {
    const bruto = localStorage.getItem(CHAVE_RASCUNHO);
    if (bruto) dadosSalvos = JSON.parse(bruto);
  } catch (erro) {
    console.warn("Rascunho corrompido, descartando:", erro);
    localStorage.removeItem(CHAVE_RASCUNHO);
  }
 
  if (!dadosSalvos) return;
 
  const temConteudo = [dadosSalvos.titulo, dadosSalvos.descricao, dadosSalvos.categoria, dadosSalvos.preco, dadosSalvos.localizacao]
    .some(v => v && String(v).trim() !== "");
 
  if (temConteudo) {
    mostrarBannerRascunho(dadosSalvos);
  } else {
    localStorage.removeItem(CHAVE_RASCUNHO);
  }
})();
 
// Salva o rascunho com um pequeno atraso (debounce) pra não escrever no
// localStorage a cada tecla digitada.
let rascunhoTimeout = null;
 
function agendarSalvarRascunho() {
  clearTimeout(rascunhoTimeout);
  rascunhoTimeout = setTimeout(salvarRascunho, 500);
}
 
form.addEventListener("input", () => { formSujo = true; agendarSalvarRascunho(); });
form.addEventListener("change", () => { formSujo = true; agendarSalvarRascunho(); });
 
function validateForm() {
  let valid = true;
 
  requiredFields.forEach(id => {
    const input = document.getElementById(id);
    const fieldWrapper = document.getElementById(`field-${id}`);
    const value = input.value.trim();
 
    const isInvalid = !value || (input.type === "number" && Number(value) <= 0);
 
    fieldWrapper.classList.toggle("invalid", isInvalid);
    if (isInvalid) valid = false;
  });
 
  if (selectedFiles.length === 0) {
    valid = false;
    statusMsg.textContent = "Adicione ao menos uma foto do objeto.";
    statusMsg.className = "status-msg error";
  }
 
  return valid;
}
 
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  statusMsg.className = "status-msg";
  statusMsg.textContent = "";
 
  if (!validateForm()) {
    if (!statusMsg.textContent) {
      statusMsg.textContent = "Verifique os campos destacados.";
      statusMsg.className = "status-msg error";
    }
    return;
  }
 
  if (!usuarioLogado) {
    statusMsg.textContent = "Você precisa estar logado para cadastrar um objeto.";
    statusMsg.className = "status-msg error";
    return;
  }
 
  const precoDigitado = Number(document.getElementById("preco").value);
  if (precoDigitado >= LIMITE_PRECO_CONFIRMACAO) {
    const formatado = precoDigitado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const confirmado = confirm(`Confirma que o valor é ${formatado}/dia? Esse preço é bem mais alto que o comum.`);
    if (!confirmado) return;
  }
 
  btnSubmit.disabled = true;
  btnSubmit.textContent = "Cadastrando...";
 
  try {
    // As fotos são reduzidas no navegador (JPEG) e sobem por multipart junto com os
    // campos. O dono é definido pelo back a partir do token (não enviamos e-mail/nome).
    const fotos = await Promise.all(selectedFiles.map(f => redimensionarImagem(f)));

    const novoObjeto = await window.ObjetosVizin.criar({
      titulo: document.getElementById("titulo").value.trim(),
      descricao: document.getElementById("descricao").value.trim(),
      categoria: document.getElementById("categoria").value,
      preco_dia: Number(Number(document.getElementById("preco").value).toFixed(2)),
      localizacao: document.getElementById("localizacao").value.trim(),
      disponivel: document.getElementById("disponivel-imediato").checked
    }, { fotos });

    statusMsg.textContent = "Objeto cadastrado com sucesso!";
    statusMsg.className = "status-msg success";
 
    // Já salvou — não faz sentido mais avisar de "alterações não salvas",
    // nem manter o rascunho.
    formSujo = false;
    limparRascunho();
 
    form.reset();
    selectedFiles = [];
    renderPhotos();
 
    // Leva direto pra página pública do Produto recém-criado, funcionando
    // como um preview rápido — permite pegar erro de digitação/foto errada
    // antes de divulgar o anúncio pra alguém.
    setTimeout(() => {
      window.location.href = `/produto?id=${novoObjeto.id}`;
    }, 900);
 
  } catch (err) {
    console.error(err);
    // Erros de validação do back (campo inválido, foto grande demais...) trazem uma
    // mensagem pronta; falha de rede/servidor cai na mensagem genérica.
    const erroDeValidacao = err && err.status >= 400 && err.status < 500 && err.status !== 401;
    statusMsg.textContent = erroDeValidacao
      ? err.message
      : (err?.codigo === "rede" ? err.message : "Não foi possível cadastrar o objeto. Tente novamente.");
    statusMsg.className = "status-msg error";
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Cadastrar Objeto";
  }
});
 
/* ===================================================
   MODAL: SAIR SEM SALVAR
   Substitui o confirm() nativo (feio, sem estilo possível) por um modal
   no mesmo visual do resto do site, reaproveitando as classes .modal-*
   que já existem em objeto-form.css. Usado só pelo clique no botão
   Cancelar — o aviso nativo do navegador ao fechar a aba/atualizar a
   página (beforeunload, lá em cima) continua existindo à parte: aquele
   diálogo é controlado pelo próprio navegador e nenhum site consegue
   customizar seu texto ou visual (trava de segurança contra sites que
   tentam imitar avisos do sistema).
   =================================================== */
const modalSairSemSalvar = document.getElementById("modal-sair-sem-salvar");
const modalSairContinuar = document.getElementById("modal-sair-continuar");
const modalSairConfirmar = document.getElementById("modal-sair-confirmar");
 
function abrirModalSairSemSalvar() {
  if (!modalSairSemSalvar) return;
  modalSairSemSalvar.classList.add("show");
  modalSairConfirmar?.focus();
}
 
function fecharModalSairSemSalvar() {
  modalSairSemSalvar?.classList.remove("show");
}
 
modalSairContinuar?.addEventListener("click", fecharModalSairSemSalvar);
 
modalSairSemSalvar?.addEventListener("click", (e) => {
  if (e.target === modalSairSemSalvar) fecharModalSairSemSalvar();
});
 
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modalSairSemSalvar?.classList.contains("show")) {
    fecharModalSairSemSalvar();
  }
});
 
modalSairConfirmar?.addEventListener("click", () => {
  formSujo = false;
  window.location.href = "/meus-objetos";
});
 
btnCancelar.addEventListener("click", () => {
  if (formSujo) {
    abrirModalSairSemSalvar();
    return;
  }
  window.location.href = "/meus-objetos";
});

const categoriasProntas = window.CategoriasVizin.carregar(document.getElementById("categoria"))
  .catch(erro => {
    console.error("Não foi possível carregar categorias:", erro);
    statusMsg.textContent = "Não foi possível carregar as categorias. Recarregue a página.";
    btnSubmit.disabled = true;
  });
