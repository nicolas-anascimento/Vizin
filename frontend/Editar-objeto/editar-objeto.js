/* ===================================================
   IDENTIFICAR QUAL OBJETO ESTÁ SENDO EDITADO
   Espera uma URL do tipo: editar-objeto.html?id=123
   =================================================== */
const params = new URLSearchParams(window.location.search);
const objetoId = params.get("id");

if (!objetoId) {
  alert("Objeto não informado.");
  window.location.href = "meus-objetos.html";
}

/* ---------- Referências dos elementos ---------- */
const loadingMsg = document.getElementById("loading-msg");
const form = document.getElementById("form-editar-objeto");

const MAX_PHOTOS = 5;
const photosGrid = document.getElementById("photos-grid");
const addSlot = document.getElementById("add-photo-slot");
const photoInput = document.getElementById("photo-input");

const btnSubmit = document.getElementById("btn-submit");
const btnCancelar = document.getElementById("btn-cancelar");
const btnExcluir = document.getElementById("btn-excluir-objeto");
const statusMsg = document.getElementById("status-msg");

const requiredFields = ["titulo", "descricao", "categoria", "preco", "localizacao"];

/* ---------- Estado das fotos ----------
   Cada item pode ser:
   { type: "existing", id: <id_da_foto_no_back>, url: <url_atual> }
   { type: "new", file: <File> }
   A ordem do array define a foto principal (index 0).
------------------------------------------- */
let photoItems = [];

/* ===================================================
   1) CARREGAR OS DADOS ATUAIS DO OBJETO
   =================================================== */
async function carregarObjeto() {
  try {
    /* ============================================================
       PONTO DE INTEGRAÇÃO COM O BACK-END (leitura)
       Ajuste a URL conforme o endpoint real da API.
       Espera-se um retorno JSON parecido com:
       {
         "titulo": "...",
         "descricao": "...",
         "categoria": "ferramentas",
         "preco_dia": 25,
         "localizacao": "Sorocaba",
         "disponivel_imediato": true,
         "fotos": [
           { "id": 1, "url": "img/objetos/1.jpg" },
           { "id": 2, "url": "img/objetos/2.jpg" }
         ]
       }
       ============================================================ */
    const response = await fetch(`/api/objetos/${objetoId}`, {
      headers: {
        "Authorization": `Bearer ${localStorage.getItem("token")}`
      }
    });

    if (!response.ok) {
      throw new Error(`Erro ${response.status} ao buscar objeto`);
    }

    const data = await response.json();
    preencherFormulario(data);

  } catch (err) {
    console.error(err);
    loadingMsg.textContent = "Não foi possível carregar este objeto.";
  }
}

let objetoAtual = null;

function preencherFormulario(data) {
  objetoAtual = data;

  document.getElementById("titulo").value = data.titulo || "";
  document.getElementById("descricao").value = data.descricao || "";
  document.getElementById("categoria").value = data.categoria || "";
  document.getElementById("preco").value = data.preco_dia ?? "";
  document.getElementById("localizacao").value = data.localizacao || "";
  document.getElementById("disponivel-imediato").checked = !!data.disponivel_imediato;

  photoItems = (data.fotos || []).map(foto => ({
    type: "existing",
    id: foto.id,
    url: foto.url
  }));

  renderPhotos();

  loadingMsg.style.display = "none";
  form.style.display = "block";
}

/* ===================================================
   2) GERENCIAR FOTOS (existentes + novas)
   =================================================== */
addSlot.addEventListener("click", () => photoInput.click());

photoInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files);
  const remainingSlots = MAX_PHOTOS - photoItems.length;

  files.slice(0, remainingSlots).forEach(file => {
    if (!file.type.startsWith("image/")) return;
    photoItems.push({ type: "new", file });
  });

  renderPhotos();
  photoInput.value = "";
});

function renderPhotos() {
  photosGrid.querySelectorAll(".photo-slot.filled").forEach(el => el.remove());

  photoItems.forEach((item, index) => {
    const slot = document.createElement("div");
    slot.className = "photo-slot filled" + (item.type === "existing" ? " existing" : "");

    const img = document.createElement("img");
    img.src = item.type === "existing" ? item.url : URL.createObjectURL(item.file);
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
    removeBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      photoItems.splice(index, 1);
      renderPhotos();
    });
    slot.appendChild(removeBtn);

    photosGrid.insertBefore(slot, addSlot);
  });

  addSlot.style.display = photoItems.length >= MAX_PHOTOS ? "none" : "flex";
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

  if (!validateForm()) {
    if (!statusMsg.textContent) {
      statusMsg.textContent = "Verifique os campos destacados.";
      statusMsg.className = "status-msg error";
    }
    return;
  }

  const formData = new FormData();
  formData.append("titulo", document.getElementById("titulo").value.trim());
  formData.append("descricao", document.getElementById("descricao").value.trim());
  formData.append("categoria", document.getElementById("categoria").value);
  formData.append("preco_dia", document.getElementById("preco").value);
  formData.append("localizacao", document.getElementById("localizacao").value.trim());
  formData.append("disponivel_imediato", document.getElementById("disponivel-imediato").checked);

  // IDs das fotos antigas que o usuário optou por manter, na ordem final
  const fotosMantidas = photoItems
    .filter(item => item.type === "existing")
    .map(item => item.id);
  formData.append("fotos_mantidas", JSON.stringify(fotosMantidas));

  // Arquivos novos (ainda não existem no back-end)
  photoItems
    .filter(item => item.type === "new")
    .forEach(item => formData.append("fotos_novas", item.file, item.file.name));

  // Índice, dentro da lista final de fotos, que deve virar a foto principal
  formData.append("foto_principal_index", "0");

  btnSubmit.disabled = true;
  btnSubmit.textContent = "Salvando...";

  try {
    /* ============================================================
       PONTO DE INTEGRAÇÃO COM O BACK-END (atualização)
       Ajuste o método/URL conforme a API definida pelo back-end.
       ============================================================ */
    const response = await fetch(`/api/objetos/${objetoId}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${localStorage.getItem("token")}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Erro ${response.status} ao salvar alterações`);
    }

    statusMsg.textContent = "Alterações salvas com sucesso!";
    statusMsg.className = "status-msg success";

    setTimeout(() => {
      window.location.href = "../Meus-objetos/index.html";
    }, 1200);

  } catch (err) {
    console.error(err);
    statusMsg.textContent = "Não foi possível salvar as alterações. Tente novamente.";
    statusMsg.className = "status-msg error";
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Salvar Alterações";
  }
});

btnCancelar.addEventListener("click", () => {
  window.location.href = "../Meus-objetos/index.html";
});

/* ===================================================
   5) EXCLUIR OBJETO (via modal de confirmação)
   =================================================== */
const modalExcluir = document.getElementById("modal-excluir");
const modalExcluirNome = document.getElementById("modal-excluir-nome");
const modalExcluirCancelar = document.getElementById("modal-excluir-cancelar");
const modalExcluirConfirmar = document.getElementById("modal-excluir-confirmar");

function abrirModalExcluir() {
  modalExcluirNome.textContent = objetoAtual?.titulo || "este objeto";
  // Mesma classe usada em meus-objetos.js para abrir/fechar o modal.
  modalExcluir.classList.add("show");
}

function fecharModalExcluir() {
  modalExcluir.classList.remove("show");
}

btnExcluir.addEventListener("click", abrirModalExcluir);

modalExcluirCancelar.addEventListener("click", fecharModalExcluir);

// Fecha ao clicar fora da caixa do modal (na área escurecida)
modalExcluir.addEventListener("click", (e) => {
  if (e.target === modalExcluir) fecharModalExcluir();
});

modalExcluirConfirmar.addEventListener("click", async () => {

  modalExcluirConfirmar.disabled = true;
  modalExcluirConfirmar.textContent = "Excluindo...";

  try {
    /* ============================================================
       PONTO DE INTEGRAÇÃO COM O BACK-END (exclusão)
       ============================================================ */
    const response = await fetch(`/api/objetos/${objetoId}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${localStorage.getItem("token")}`
      }
    });

    if (!response.ok) {
      throw new Error(`Erro ${response.status} ao excluir objeto`);
    }

    window.location.href = "../Meus-objetos/index.html";

  } catch (err) {
    console.error(err);
    fecharModalExcluir();
    statusMsg.textContent = "Não foi possível excluir o objeto.";
    statusMsg.className = "status-msg error";
  } finally {
    modalExcluirConfirmar.disabled = false;
    modalExcluirConfirmar.textContent = "Excluir";
  }

});

/* ===================================================
   INICIALIZAÇÃO
   =================================================== */
carregarObjeto();
