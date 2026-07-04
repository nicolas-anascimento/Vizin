/* ---------- Upload de fotos (até 5, primeira = principal) ---------- */
const MAX_PHOTOS = 5;
const photosGrid = document.getElementById("photos-grid");
const addSlot = document.getElementById("add-photo-slot");
const photoInput = document.getElementById("photo-input");

// Guarda os arquivos reais selecionados (para enviar ao back-end)
let selectedFiles = [];

addSlot.addEventListener("click", () => photoInput.click());

photoInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files);
  const remainingSlots = MAX_PHOTOS - selectedFiles.length;

  files.slice(0, remainingSlots).forEach(file => {
    if (!file.type.startsWith("image/")) return;
    selectedFiles.push(file);
  });

  renderPhotos();
  photoInput.value = ""; // permite selecionar o mesmo arquivo de novo se removido
});

function renderPhotos() {
  // Remove todos os slots de preview (mantém o slot de "adicionar")
  photosGrid.querySelectorAll(".photo-slot.filled").forEach(el => el.remove());

  selectedFiles.forEach((file, index) => {
    const slot = document.createElement("div");
    slot.className = "photo-slot filled";

    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
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
      selectedFiles.splice(index, 1);
      renderPhotos();
    });
    slot.appendChild(removeBtn);

    photosGrid.insertBefore(slot, addSlot);
  });

  // Esconde o botão de adicionar quando atingir o limite
  addSlot.style.display = selectedFiles.length >= MAX_PHOTOS ? "none" : "flex";
}

/* ---------- Validação e envio do formulário ---------- */
const form = document.getElementById("form-cadastro-objeto");
const btnSubmit = document.getElementById("btn-submit");
const btnCancelar = document.getElementById("btn-cancelar");
const statusMsg = document.getElementById("status-msg");

const requiredFields = ["titulo", "descricao", "categoria", "preco", "localizacao"];

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

  // Monta o payload para envio ao back-end
  const formData = new FormData();
  formData.append("titulo", document.getElementById("titulo").value.trim());
  formData.append("descricao", document.getElementById("descricao").value.trim());
  formData.append("categoria", document.getElementById("categoria").value);
  formData.append("preco_dia", document.getElementById("preco").value);
  formData.append("localizacao", document.getElementById("localizacao").value.trim());
  formData.append("disponivel_imediato", document.getElementById("disponivel-imediato").checked);

  selectedFiles.forEach((file, i) => {
    formData.append("fotos", file, file.name); // primeira foto (index 0) = foto principal
  });

  btnSubmit.disabled = true;
  btnSubmit.textContent = "Cadastrando...";

  try {
    /* ============================================================
       PONTO DE INTEGRAÇÃO COM O BACK-END
       Ajuste a URL do endpoint abaixo conforme a API definida
       pela pessoa responsável pelo back-end.
       ============================================================ */
    const response = await fetch("/api/objetos", {
      method: "POST",
      body: formData
      // Não defina "Content-Type" manualmente: o navegador define
      // o boundary correto do multipart/form-data automaticamente.
    });

    if (!response.ok) {
      throw new Error(`Erro ${response.status} ao cadastrar objeto`);
    }

    const data = await response.json();

    statusMsg.textContent = "Objeto cadastrado com sucesso!";
    statusMsg.className = "status-msg success";

    form.reset();
    selectedFiles = [];
    renderPhotos();

    // Exemplo: redirecionar após cadastro
    // window.location.href = "/meus-objetos.html";

  } catch (err) {
    console.error(err);
    statusMsg.textContent = "Não foi possível cadastrar o objeto. Tente novamente.";
    statusMsg.className = "status-msg error";
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Cadastrar Objeto";
  }
});

btnCancelar.addEventListener("click", () => {
  window.location.href = "/meus-objetos.html";
});
