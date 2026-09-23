// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
 
    sessionStorage.setItem(
        "mensagemLogin",
        "Você precisa estar logado para acessar essa página."
    );
 
    window.location.href = "/login";
 
}
 
// Protegido contra JSON corrompido em localStorage.usuario.
let usuarioLogado = null;
 
try {
 
    usuarioLogado = JSON.parse(localStorage.getItem("usuario") || "null");
 
} catch (erro) {
 
    console.error("Dados de usuário corrompidos no localStorage:", erro);
    localStorage.removeItem("usuario");
 
}
 
/* ===================================================
   IDENTIFICAR QUAL OBJETO ESTÁ SENDO EDITADO
   Espera uma URL do tipo: /editar-objeto?id=<uuid>
   =================================================== */
const params = new URLSearchParams(window.location.search);
const objetoId = params.get("id");
 
if (!objetoId) {
  window.location.href = "/meus-objetos";
}
 
/* ---------- Referências dos elementos ---------- */
const loadingMsg = document.getElementById("loading-msg");
const form = document.getElementById("form-editar-objeto");
 
const MAX_PHOTOS = 5;
const MAX_FILE_SIZE_MB = 15;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
 
const photosGrid = document.getElementById("photos-grid");
const addSlot = document.getElementById("add-photo-slot");
const photoInput = document.getElementById("photo-input");
 
const btnSubmit = document.getElementById("btn-submit");
const btnCancelar = document.getElementById("btn-cancelar");
const btnExcluir = document.getElementById("btn-excluir-objeto");
const statusMsg = document.getElementById("status-msg");
 
const checkboxDisponivel = document.getElementById("disponivel-imediato");
const disponibilidadeDesc = document.getElementById("disponibilidade-desc");
 
const requiredFields = ["titulo", "descricao", "categoria", "preco", "localizacao"];
 
// A partir desse valor, pedimos confirmação extra antes de salvar — mesmo
// limite usado no Cadastro. Ajustável.
const LIMITE_PRECO_CONFIRMACAO = 1000;
 
let objetoAtual = null;
 
// true quando existe uma locação realmente ativa OU uma solicitação
// pendente pra esse objeto (ver ObjetosVizin.temLocacaoAtiva /
// temSolicitacaoPendente). Enquanto for true, todo o formulário fica
// travado: título, descrição, categoria, preço, localização, fotos,
// disponibilidade, salvar e excluir.
let formBloqueado = false;
 
// Qual dos dois motivos causou o bloqueio acima — usado só pra escolher a
// mensagem certa pro usuário ("locacao" = locação em andamento, "pendente"
// = solicitação ainda não respondida). Bloqueio por locação é mais grave
// (o objeto está de fato em uso); por isso ele tem prioridade quando os
// dois acontecem ao mesmo tempo.
let motivoBloqueio = null;
 
// true quando o objeto foi excluído em outra aba/janela enquanto esta tela
// de edição estava aberta. Nesse caso não faz sentido nem tentar salvar.
let objetoExcluidoAlhures = false;
 
// ================= ALTERAÇÕES NÃO SALVAS =================
let formSujo = false;
 
form.addEventListener("input", () => { formSujo = true; });
form.addEventListener("change", () => { formSujo = true; });
 
window.addEventListener("beforeunload", (e) => {
  if (!formSujo) return;
  e.preventDefault();
  e.returnValue = "";
});
 
// ================= CONTADOR DE CARACTERES =================
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
 
const atualizarContadorTitulo = ligarContadorCaracteres(document.getElementById("titulo"), 80);
const atualizarContadorDescricao = ligarContadorCaracteres(document.getElementById("descricao"), 1000);
 
/* ---------- Estado das fotos ----------
   Cada item pode ser:
   { type: "existing", id: <index>, url: <base64 ou url atual> }
   { type: "new", file: <File> }
   A ordem do array define a foto principal (index 0).
------------------------------------------- */
let photoItems = [];
 
// URLs de blob criadas pra pré-visualizar fotos NOVAS (as "existing" usam
// o base64/url que já vinha salvo, então não geram blob nenhum). Revogadas
// a cada re-render pra não vazar memória.
let photoPreviewURLs = [];
 
/* ===================================================
   1) CARREGAR OS DADOS ATUAIS DO OBJETO
   =================================================== */
async function carregarObjeto() {
  await window.CategoriasVizin.carregar(document.getElementById("categoria"));
  // As solicitações do usuário (cache do back) alimentam a trava de locação/pendência.
  if (window.SolicitacoesVizin) await window.SolicitacoesVizin.pronto;

  let objeto = null;
  try {
    objeto = window.ObjetosVizin ? await window.ObjetosVizin.obterPorId(objetoId) : null;
  } catch (erro) {
    console.error("Não foi possível carregar o objeto:", erro);
  }

  // Mesma mensagem tanto pra "objeto não existe" quanto para "objeto
  // existe, mas não é seu" — não revela pra quem tentar editar um id
  // alheio que aquele objeto existe e pertence a outra pessoa. (O back
  // também valida o dono pelo token ao salvar.)
  const meuId = window.SolicitacoesVizin?.usuarioId?.() || usuarioLogado?.id;
  const pertenceAoUsuario = objeto && meuId && objeto.proprietarioId === String(meuId);

  if (!pertenceAoUsuario) {
    loadingMsg.textContent = "Este objeto não foi encontrado.";
    return;
  }
 
  preencherFormulario(objeto);
}
 
function preencherFormulario(data) {
  objetoAtual = data;
 
  document.getElementById("titulo").value = data.titulo || "";
  document.getElementById("descricao").value = data.descricao || "";
  document.getElementById("categoria").value = data.categoria_slug || data.categoria_id || "";
  document.getElementById("preco").value = data.preco_dia ?? "";
  document.getElementById("localizacao").value = data.localizacao || "";
  checkboxDisponivel.checked = !!data.disponivel;
 
  // Setar .value não dispara "input" sozinho — atualiza os contadores na mão.
  atualizarContadorTitulo();
  atualizarContadorDescricao();
 
  // Trava de verdade: existe locação em andamento se houver uma
  // solicitação nos estados aprovado/pago/retirado/aguardando_devolucao
  // (ver ObjetosVizin.temLocacaoAtiva), OU existe uma solicitação PENDENTE
  // ainda não respondida (ver ObjetosVizin.temSolicitacaoPendente) — nesse
  // segundo caso, editar preço/disponibilidade no meio do caminho faria o
  // interessado ver uma informação diferente da que ele pediu. Um objeto
  // simplesmente pausado pelo dono (disponivel: false, sem solicitação
  // nenhuma) continua editável normalmente.
  const locacaoAtiva = window.ObjetosVizin.temLocacaoAtiva(data);
  const temPendente = window.ObjetosVizin.temSolicitacaoPendente(data);
 
  formBloqueado = locacaoAtiva || temPendente;
  motivoBloqueio = locacaoAtiva ? "locacao" : (temPendente ? "pendente" : null);
 
  if (disponibilidadeDesc) {
    disponibilidadeDesc.textContent = motivoBloqueio === "locacao"
      ? "Este objeto está em locação no momento — a disponibilidade só pode ser alterada depois que o aluguel atual for concluído."
      : motivoBloqueio === "pendente"
        ? "Este objeto tem uma solicitação pendente — a disponibilidade só pode ser alterada depois que ela for respondida."
        : "Controle se este objeto pode ser solicitado para aluguel agora.";
  }
 
  const fotosAtuais = Array.isArray(data.fotos) ? data.fotos : [];

  photoItems = fotosAtuais.map((foto) => ({
    type: "existing",
    id: String(foto.id),
    url: foto.url
  }));
 
  renderPhotos();
 
  if (formBloqueado) {
    aplicarBloqueioFormulario(motivoBloqueio);
  }
 
  loadingMsg.style.display = "none";
  form.style.display = "block";
}
 
// Mensagens específicas pra cada motivo de bloqueio — locação ativa é mais
// grave (o objeto está de fato em uso por alguém); pendente é mais brando
// (ainda dá pra recusar o pedido), mas trava do mesmo jeito pra não deixar
// o interessado ver dados diferentes dos que ele solicitou.
const MENSAGENS_BLOQUEIO = {
  locacao: {
    checkbox: "Não é possível alterar a disponibilidade durante uma locação em andamento",
    submit: "Não é possível editar um objeto em locação no momento",
    excluir: "Não é possível excluir um objeto em locação no momento",
    aviso: "Este objeto está em locação no momento. Para preservar as informações combinadas com o locatário, a edição e a exclusão ficam bloqueadas até o aluguel atual ser concluído.",
    icone: "bi-lock-fill"
  },
  pendente: {
    checkbox: "Não é possível alterar a disponibilidade enquanto houver uma solicitação pendente",
    submit: "Não é possível editar um objeto com solicitação pendente — responda a solicitação antes",
    excluir: "Não é possível excluir um objeto com solicitação pendente — responda a solicitação antes",
    aviso: "Este objeto tem uma solicitação de aluguel pendente. Para evitar que o interessado veja informações diferentes das que ele pediu, a edição e a exclusão ficam bloqueadas até você responder à solicitação.",
    icone: "bi-hourglass-split"
  }
};
 
// Trava título, descrição, categoria, preço, localização, fotos e
// disponibilidade. Salvar/Excluir NÃO usam o atributo disabled: os
// handlers de submit/clique já checam formBloqueado e mostram uma
// mensagem clara — desabilitar de verdade impediria esse aviso de
// aparecer no toque (sem hover, o title sozinho não ajuda no celular).
function aplicarBloqueioFormulario(motivo) {
  const msg = MENSAGENS_BLOQUEIO[motivo] || MENSAGENS_BLOQUEIO.locacao;
 
  requiredFields.forEach(id => {
    const input = document.getElementById(id);
    input.disabled = true;
    document.getElementById(`field-${id}`).classList.add("bloqueado");
  });
 
  checkboxDisponivel.disabled = true;
  checkboxDisponivel.closest(".checkbox-row").title = msg.checkbox;
 
  photosGrid.classList.add("bloqueado");
  addSlot.setAttribute("tabindex", "-1");
  addSlot.setAttribute("aria-disabled", "true");
 
  btnSubmit.classList.add("bloqueado-visual");
  btnSubmit.title = msg.submit;
 
  btnExcluir.classList.add("bloqueado-visual");
  btnExcluir.title = msg.excluir;
 
  const aviso = document.getElementById("aviso-bloqueio-locacao");
  if (aviso) {
    aviso.style.display = "flex";
 
    const icone = aviso.querySelector("i");
    if (icone) icone.className = `bi ${msg.icone}`;
 
    const texto = aviso.querySelector("span");
    if (texto) texto.textContent = msg.aviso;
  }
}
 
// Trava tudo de um jeito parecido, mas pro caso de o objeto ter sido
// EXCLUÍDO (não apenas alugado) em outra aba enquanto esta tela estava
// aberta. Mensagem e title diferentes, já que o motivo é outro.
function aplicarBloqueioPorExclusao() {
  requiredFields.forEach(id => {
    const input = document.getElementById(id);
    input.disabled = true;
    document.getElementById(`field-${id}`).classList.add("bloqueado");
  });
 
  checkboxDisponivel.disabled = true;
  photosGrid.classList.add("bloqueado");
  addSlot.setAttribute("tabindex", "-1");
  addSlot.setAttribute("aria-disabled", "true");
 
  btnSubmit.classList.add("bloqueado-visual");
  btnSubmit.title = "Este objeto não existe mais";
 
  btnExcluir.classList.add("bloqueado-visual");
  btnExcluir.title = "Este objeto não existe mais";
 
  statusMsg.textContent = "Este objeto foi excluído (talvez em outra aba). Não é possível editá-lo.";
  statusMsg.className = "status-msg error";
 
  // Não faz mais sentido avisar de "alterações não salvas" pra um objeto
  // que não existe mais.
  formSujo = false;
}
 
// Reavalia se o objeto passou a estar em locação DEPOIS do carregamento
// inicial — ex: o dono está com essa tela aberta e, enquanto isso, uma
// solicitação é aprovada (na mesma aba, ou em outra). Sem isso, o
// formulário continuava destravado mesmo depois do objeto entrar em
// locação de verdade.
function reavaliarBloqueio() {
  if (!objetoAtual || formBloqueado || objetoExcluidoAlhures) return;
 
  const locacaoAtiva = window.ObjetosVizin.temLocacaoAtiva(objetoAtual);
  const temPendente = window.ObjetosVizin.temSolicitacaoPendente(objetoAtual);
 
  if (locacaoAtiva || temPendente) {
    formBloqueado = true;
    motivoBloqueio = locacaoAtiva ? "locacao" : "pendente";
 
    if (disponibilidadeDesc) {
      disponibilidadeDesc.textContent = locacaoAtiva
        ? "Este objeto está em locação no momento — a disponibilidade só pode ser alterada depois que o aluguel atual for concluído."
        : "Este objeto tem uma solicitação pendente — a disponibilidade só pode ser alterada depois que ela for respondida.";
    }
 
    aplicarBloqueioFormulario(motivoBloqueio);
 
    statusMsg.textContent = locacaoAtiva
      ? "Este objeto entrou em locação enquanto você editava. As alterações foram bloqueadas."
      : "Este objeto recebeu uma solicitação enquanto você editava. As alterações foram bloqueadas até ela ser respondida.";
    statusMsg.className = "status-msg error";
  }
}
 
// Reavalia se o próprio objeto foi EXCLUÍDO em outra aba/janela enquanto
// esta tela de edição estava aberta. Sem isso, salvar depois disso não dá
// erro nenhum (ObjetosVizin.atualizar simplesmente não encontra o id pra
// atualizar) e a página mostrava "Alterações salvas com sucesso!" mesmo
// sem ter salvo nada de verdade.
async function reavaliarExistencia() {
  if (!objetoAtual || objetoExcluidoAlhures) return;

  try {
    if (!(await window.ObjetosVizin.obterPorId(objetoId))) {
      objetoExcluidoAlhures = true;
      aplicarBloqueioPorExclusao();
    }
  } catch (erro) {
    console.error("Não foi possível reconferir o objeto:", erro);
  }
}
 
document.addEventListener("solicitacoesAtualizadas", reavaliarBloqueio);
document.addEventListener("objetosAtualizados", () => {
  reavaliarExistencia();
  reavaliarBloqueio();
});
 
// (Objetos e solicitações vêm da API: as solicitações se atualizam por polling e
// disparam "solicitacoesAtualizadas"; não há mais localStorage nem evento "storage".)

/* ===================================================
   2) GERENCIAR FOTOS (existentes + novas)
   =================================================== */
addSlot.addEventListener("click", () => {
  if (formBloqueado) return;
  photoInput.click();
});
 
// Acessibilidade: o slot é uma <div role="button">, não um <button> de
// verdade — precisa responder a Enter/Espaço manualmente.
addSlot.addEventListener("keydown", (e) => {
  if (formBloqueado) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    addSlot.click();
  }
});
 
photoInput.addEventListener("change", (e) => {
  if (formBloqueado) return;
 
  const files = Array.from(e.target.files);
  const remainingSlots = MAX_PHOTOS - photoItems.length;
 
  let ignoradosPorTipo = 0;
  let ignoradosPorTamanho = 0;
 
  const aceitas = files.filter(file => {
    if (!file.type.startsWith("image/")) {
      ignoradosPorTipo++;
      return false;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      ignoradosPorTamanho++;
      return false;
    }
    return true;
  });
 
  aceitas.slice(0, remainingSlots).forEach(file => photoItems.push({ type: "new", file }));
  const ignoradosPorLimite = Math.max(0, aceitas.length - remainingSlots);
 
  renderPhotos();
  photoInput.value = "";
 
  avisarFotosIgnoradas(ignoradosPorTipo, ignoradosPorTamanho, ignoradosPorLimite);
});
 
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
  photoPreviewURLs.forEach(url => URL.revokeObjectURL(url));
  photoPreviewURLs = [];
 
  photosGrid.querySelectorAll(".photo-slot.filled").forEach(el => el.remove());
 
  photoItems.forEach((item, index) => {
    const slot = document.createElement("div");
    slot.className = "photo-slot filled" + (item.type === "existing" ? " existing" : "");
 
    let src;
    if (item.type === "existing") {
      src = item.url;
    } else {
      src = URL.createObjectURL(item.file);
      photoPreviewURLs.push(src);
    }
 
    const img = document.createElement("img");
    img.src = src;
    img.alt = index === 0 ? "Foto principal do objeto" : `Foto ${index + 1} do objeto`;
    slot.appendChild(img);
 
    if (index === 0) {
      const tag = document.createElement("span");
      tag.className = "main-tag";
      tag.textContent = "Principal";
      slot.appendChild(tag);
    }
 
    if (!formBloqueado) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove-btn";
      removeBtn.innerHTML = "&times;";
      removeBtn.setAttribute("aria-label", "Remover foto");
      removeBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        photoItems.splice(index, 1);
        formSujo = true;
        renderPhotos();
      });
      slot.appendChild(removeBtn);
    }
 
    photosGrid.insertBefore(slot, addSlot);
  });
 
  addSlot.style.display = (formBloqueado || photoItems.length >= MAX_PHOTOS) ? "none" : "flex";
}
 
// Redimensiona/comprime fotos NOVAS antes de guardar — mesma função usada
// no Cadastro. Antes, a edição convertia o arquivo pra base64 sem
// redimensionar nada, o que reabria o mesmo risco de estourar a cota do
// localStorage que o Cadastro já havia corrigido.
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
 
/* ===================================================
   3) VALIDAÇÃO
   =================================================== */
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
 
  if (photoItems.length === 0) {
    valid = false;
    statusMsg.textContent = "Adicione ao menos uma foto do objeto.";
    statusMsg.className = "status-msg error";
  }
 
  return valid;
}
 
/* ===================================================
   4) ENVIAR ATUALIZAÇÃO
   =================================================== */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  statusMsg.className = "status-msg";
  statusMsg.textContent = "";
 
  if (formBloqueado) {
    statusMsg.textContent = motivoBloqueio === "pendente"
      ? "Não é possível editar um objeto com solicitação pendente — responda a solicitação antes."
      : "Não é possível editar um objeto em locação no momento.";
    statusMsg.className = "status-msg error";
    return;
  }
 
  if (objetoExcluidoAlhures) {
    statusMsg.textContent = "Este objeto foi excluído e não pode mais ser editado.";
    statusMsg.className = "status-msg error";
    return;
  }
 
  if (!validateForm()) {
    if (!statusMsg.textContent) {
      statusMsg.textContent = "Verifique os campos destacados.";
      statusMsg.className = "status-msg error";
    }
    return;
  }
 
  const precoDigitado = Number(document.getElementById("preco").value);
  if (precoDigitado >= LIMITE_PRECO_CONFIRMACAO) {
    const formatado = precoDigitado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const confirmado = confirm(`Confirma que o valor é ${formatado}/dia? Esse preço é bem mais alto que o comum.`);
    if (!confirmado) return;
  }
 
  btnSubmit.disabled = true;
  btnSubmit.textContent = "Salvando...";
 
  try {
    // Fotos existentes seguem como URLs (imagens_mantidas); as novas são reduzidas no
    // navegador e sobem por multipart. O back define a foto principal a partir da ordem
    // (mantidas primeiro, depois as novas).
    //
    // Quando o checkbox de disponibilidade está desabilitado (locação em andamento),
    // reenviamos o valor atual do objeto em vez do valor do checkbox, pra não
    // sobrescrever a trava por engano.
    const imagensMantidas = photoItems.filter(item => item.type === "existing").map(item => item.id);
    const fotosNovas = await Promise.all(
      photoItems.filter(item => item.type !== "existing").map(item => redimensionarImagem(item.file))
    );

    const disponivelFinal = checkboxDisponivel.disabled
      ? objetoAtual.disponivel
      : checkboxDisponivel.checked;

    await window.ObjetosVizin.atualizar(objetoId, {
      titulo: document.getElementById("titulo").value.trim(),
      descricao: document.getElementById("descricao").value.trim(),
      categoria: document.getElementById("categoria").value,
      preco_dia: Number(document.getElementById("preco").value),
      localizacao: document.getElementById("localizacao").value.trim(),
      disponivel: disponivelFinal
    }, { fotosNovas, imagensMantidas });

    statusMsg.textContent = "Alterações salvas com sucesso!";
    statusMsg.className = "status-msg success";
 
    formSujo = false;
 
    setTimeout(() => {
      window.location.href = "/meus-objetos";
    }, 900);
 
  } catch (err) {
    console.error(err);
 
    // ObjetosVizin.atualizar agora recusa a escrita (mesma trava de
    // corrida que excluir() já tinha) se o objeto entrou em locação ou
    // recebeu uma solicitação pendente entre a tela carregar destravada e
    // este clique em "Salvar" — normalmente reavaliarBloqueio() já pega
    // isso ao vivo via evento, mas o redimensionamento de fotos (await
    // acima) abre uma janela onde o evento pode chegar sem o handler de
    // submit reconferir formBloqueado antes de chamar atualizar(). Sem
    // tratar esses dois códigos aqui, a pessoa via só "Não foi possível
    // salvar as alterações. Tente novamente." — sem saber que tentar de
    // novo vai falhar do mesmo jeito até a causa (locação/pendente) mudar.
    if (err && err.message === "OBJETO_EM_LOCACAO") {
      formBloqueado = true;
      motivoBloqueio = "locacao";
      aplicarBloqueioFormulario("locacao");
      statusMsg.textContent = "Este objeto entrou em locação enquanto você editava. As alterações não foram salvas.";
    } else if (err && err.message === "OBJETO_COM_SOLICITACAO_PENDENTE") {
      formBloqueado = true;
      motivoBloqueio = "pendente";
      aplicarBloqueioFormulario("pendente");
      statusMsg.textContent = "Este objeto recebeu uma solicitação pendente enquanto você editava. As alterações não foram salvas — responda a solicitação antes.";
    } else if (err && err.status === 404) {
      // O objeto foi excluído (em outra aba/dispositivo) antes de este clique em "Salvar".
      objetoExcluidoAlhures = true;
      aplicarBloqueioPorExclusao();
      statusMsg.textContent = "Este objeto foi excluído e não pôde ser salvo.";
    } else if (err && err.status >= 400 && err.status < 500 && err.status !== 401) {
      statusMsg.textContent = err.message; // validação do back (campo/foto inválidos)
    } else {
      statusMsg.textContent = "Não foi possível salvar as alterações. Tente novamente.";
    }
    statusMsg.className = "status-msg error";
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Salvar Alterações";
  }
});
 
btnCancelar.addEventListener("click", () => {
  if (formSujo) {
    abrirModal(modalSairSemSalvar);
    return;
  }
  window.location.href = "/meus-objetos";
});
 
/* ===================================================
   MODAL: HELPERS DE ABRIR/FECHAR (Esc + foco preso)
   Mesmo padrão usado em Meus Objetos.
   =================================================== */
let modalAtualAberto = null;
 
function obterFocaveis(modalBox) {
  return Array.from(modalBox.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ));
}
 
function abrirModal(overlayEl) {
  modalAtualAberto = overlayEl;
  overlayEl.classList.add("show");
 
  const box = overlayEl.querySelector(".modal-box");
  const focaveis = box ? obterFocaveis(box) : [];
  if (focaveis.length) focaveis[0].focus();
}
 
function fecharModalGenerico(overlayEl) {
  overlayEl.classList.remove("show");
  if (modalAtualAberto === overlayEl) modalAtualAberto = null;
}
 
document.addEventListener("keydown", (e) => {
  if (!modalAtualAberto) return;
 
  if (e.key === "Escape") {
    fecharModalGenerico(modalAtualAberto);
    return;
  }
 
  if (e.key === "Tab") {
    const box = modalAtualAberto.querySelector(".modal-box");
    const focaveis = box ? obterFocaveis(box) : [];
    if (!focaveis.length) return;
 
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
 
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }
});
 
/* ===================================================
   5) EXCLUIR OBJETO (via modal de confirmação)
   =================================================== */
const modalExcluir = document.getElementById("modal-excluir");
const modalExcluirNome = document.getElementById("modal-excluir-nome");
const modalExcluirCancelar = document.getElementById("modal-excluir-cancelar");
const modalExcluirConfirmar = document.getElementById("modal-excluir-confirmar");
 
function abrirModalExcluir() {
  // Trava de verdade: só bloqueia exclusão se houver locação realmente
  // ativa. Um objeto simplesmente pausado (disponivel: false) pode ser
  // excluído normalmente.
  if (window.ObjetosVizin.temLocacaoAtiva(objetoId)) {
    statusMsg.textContent = "Não é possível excluir um objeto em locação no momento.";
    statusMsg.className = "status-msg error";
    return;
  }
 
  // Também bloqueia se existe uma solicitação PENDENTE (ainda não
  // respondida): excluir agora deixaria essa solicitação órfã, apontando
  // pra um objeto que não existe mais na tela de quem pediu. Mesma trava
  // já aplicada em Meus Objetos — faltava aqui.
  if (window.ObjetosVizin.temSolicitacaoPendente(objetoId)) {
    statusMsg.textContent = "Você tem uma solicitação pendente para este objeto — responda antes de excluir.";
    statusMsg.className = "status-msg error";
    return;
  }
 
  modalExcluirNome.textContent = objetoAtual?.titulo || "este objeto";
  abrirModal(modalExcluir);
}
 
function fecharModalExcluir() {
  fecharModalGenerico(modalExcluir);
}
 
btnExcluir.addEventListener("click", abrirModalExcluir);
 
modalExcluirCancelar.addEventListener("click", fecharModalExcluir);
 
modalExcluir.addEventListener("click", (e) => {
  if (e.target === modalExcluir) fecharModalExcluir();
});
 
modalExcluirConfirmar.addEventListener("click", async () => {
  modalExcluirConfirmar.disabled = true;
  modalExcluirConfirmar.textContent = "Excluindo...";
 
  try {
    // DELETE /objetos/:id — o back também recusa (409) se há locação ou pendência.
    await window.ObjetosVizin.excluir(objetoId);
    formSujo = false;
    window.location.href = "/meus-objetos";
  } catch (err) {
    console.error(err);
    fecharModalExcluir();
 
    // abrirModalExcluir() já barra os dois casos ANTES de abrir o modal,
    // mas isso só olha o estado no instante em que o modal abre — entre
    // abrir e a pessoa efetivamente clicar em "Excluir" (modal fica aberto
    // esperando confirmação) uma solicitação nova pode chegar ou uma
    // pendente pode ser aprovada em outra aba. excluir() protege a fonte
    // da verdade contra isso (mesmo raciocínio do comentário dela em
    // objetos-shared.js) — aqui só precisamos mostrar o motivo certo em
    // vez do genérico, e travar o resto do formulário já que agora
    // sabemos, de fato, que o objeto está bloqueado.
    if (err && err.message === "OBJETO_EM_LOCACAO") {
      formBloqueado = true;
      motivoBloqueio = "locacao";
      aplicarBloqueioFormulario("locacao");
      statusMsg.textContent = "Este objeto entrou em locação antes da exclusão ser confirmada. A exclusão foi cancelada.";
    } else if (err && err.message === "OBJETO_COM_SOLICITACAO_PENDENTE") {
      formBloqueado = true;
      motivoBloqueio = "pendente";
      aplicarBloqueioFormulario("pendente");
      statusMsg.textContent = "Este objeto recebeu uma solicitação pendente antes da exclusão ser confirmada — responda a solicitação antes de excluir.";
    } else {
      statusMsg.textContent = "Não foi possível excluir o objeto.";
    }
    statusMsg.className = "status-msg error";
  } finally {
    modalExcluirConfirmar.disabled = false;
    modalExcluirConfirmar.textContent = "Excluir";
  }
});
 
/* ===================================================
   6) SAIR SEM SALVAR (via modal de confirmação)
   Substitui o confirm() nativo (feio, sem estilo possível) por um modal
   no mesmo visual do resto do site, reaproveitando os helpers de
   abrir/fechar modal já usados na exclusão. O aviso nativo do navegador
   ao fechar a aba/atualizar a página (beforeunload, lá no topo do
   arquivo) continua existindo à parte: esse diálogo é controlado pelo
   próprio navegador e nenhum site consegue customizar seu texto ou
   visual (trava de segurança contra sites que tentam imitar avisos do
   sistema).
   =================================================== */
const modalSairSemSalvar = document.getElementById("modal-sair-sem-salvar");
const modalSairContinuar = document.getElementById("modal-sair-continuar");
const modalSairConfirmar = document.getElementById("modal-sair-confirmar");
 
modalSairContinuar.addEventListener("click", () => fecharModalGenerico(modalSairSemSalvar));
 
modalSairSemSalvar.addEventListener("click", (e) => {
  if (e.target === modalSairSemSalvar) fecharModalGenerico(modalSairSemSalvar);
});
 
modalSairConfirmar.addEventListener("click", () => {
  formSujo = false;
  window.location.href = "/meus-objetos";
});
 
/* ===================================================
   INICIALIZAÇÃO
   =================================================== */
carregarObjeto().catch(erro => {
  console.error(erro);
  loadingMsg.textContent = "Não foi possível carregar este objeto agora. Tente novamente.";
});
