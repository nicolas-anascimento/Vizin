// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    window.location.href = "../Login/index.html";
}
 
// ================= LER DADOS DA URL =================
const params = new URLSearchParams(window.location.search);
const produtoId = params.get("produtoId") || "1";
const dataRetirada = params.get("retirada");
const dataDevolucao = params.get("devolucao");
 
document.getElementById("link-voltar").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = `../Produto/index.html?id=${produtoId}`;
});
 
document.getElementById("btn-cancelar").addEventListener("click", () => {
    window.location.href = `../Produto/index.html?id=${produtoId}`;
});
 
// ================= MOCK DO PRODUTO =================
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Buscar o objeto e os dados do pedido/aluguel real via GET /api/objetos/:id
// (e possivelmente GET /api/pedidos/:id para confirmar que o pagamento foi aprovado).
const produto = {
    id: produtoId,
    titulo: "Furadeira Profissional Bosch",
    categoria: "Ferramentas",
    imagem: "../img/sem-imagem.jpg",
    proprietario: "Maria Santos"
};
 
document.getElementById("produto-mini-imagem").src = produto.imagem;
document.getElementById("produto-mini-nome").textContent = produto.titulo;
document.getElementById("produto-mini-categoria").textContent = produto.categoria;
document.getElementById("produto-mini-proprietario").textContent = produto.proprietario;
 
/* ---------- Upload de fotos (até 5) ---------- */
const MAX_FOTOS = 5;
const fotosGrid = document.getElementById("fotos-grid");
const fotoSlotAdd = document.getElementById("foto-slot-add");
const fotoInput = document.getElementById("foto-input");
const fotosTitulo = document.getElementById("fotos-titulo");
const btnConfirmar = document.getElementById("btn-confirmar-retirada");
 
let arquivosSelecionados = [];
 
fotoSlotAdd.addEventListener("click", () => fotoInput.click());
 
fotoInput.addEventListener("change", (e) => {
    adicionarArquivos(Array.from(e.target.files));
    fotoInput.value = "";
});
 
// Drag & drop
["dragenter", "dragover"].forEach(evento => {
    fotoSlotAdd.addEventListener(evento, (e) => {
        e.preventDefault();
        fotoSlotAdd.classList.add("arrastando");
    });
});
 
["dragleave", "drop"].forEach(evento => {
    fotoSlotAdd.addEventListener(evento, (e) => {
        e.preventDefault();
        fotoSlotAdd.classList.remove("arrastando");
    });
});
 
fotoSlotAdd.addEventListener("drop", (e) => {
    const arquivos = Array.from(e.dataTransfer.files);
    adicionarArquivos(arquivos);
});
 
function adicionarArquivos(arquivos) {
    const espacoRestante = MAX_FOTOS - arquivosSelecionados.length;
 
    arquivos.slice(0, espacoRestante).forEach(arquivo => {
        if (!arquivo.type.startsWith("image/")) return;
        arquivosSelecionados.push(arquivo);
    });
 
    renderizarFotos();
}
 
function renderizarFotos() {
    fotosGrid.querySelectorAll(".foto-slot.foto-preenchida").forEach(el => el.remove());
 
    arquivosSelecionados.forEach((arquivo, index) => {
        const slot = document.createElement("div");
        slot.className = "foto-slot foto-preenchida";
 
        const img = document.createElement("img");
        img.src = URL.createObjectURL(arquivo);
        slot.appendChild(img);
 
        const removerBtn = document.createElement("button");
        removerBtn.type = "button";
        removerBtn.className = "foto-remover-btn";
        removerBtn.innerHTML = "&times;";
        removerBtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            arquivosSelecionados.splice(index, 1);
            renderizarFotos();
        });
        slot.appendChild(removerBtn);
 
        fotosGrid.insertBefore(slot, fotoSlotAdd);
    });
 
    fotosTitulo.textContent = `Adicionar Fotos (${arquivosSelecionados.length}/${MAX_FOTOS})`;
    fotoSlotAdd.style.display = arquivosSelecionados.length >= MAX_FOTOS ? "none" : "flex";
    btnConfirmar.disabled = arquivosSelecionados.length === 0;
}
 
/* ---------- Confirmar retirada ---------- */
btnConfirmar.addEventListener("click", async () => {
    if (arquivosSelecionados.length === 0) return;
 
    btnConfirmar.disabled = true;
    btnConfirmar.innerHTML = `<span class="spinner"></span> Confirmando...`;
 
    const observacoes = document.getElementById("observacoes").value.trim();
 
    try {
        // PONTO DE INTEGRAÇÃO COM O BACK-END:
        // const formData = new FormData();
        // formData.append("objeto_id", produto.id);
        // formData.append("observacoes", observacoes);
        // arquivosSelecionados.forEach(arquivo => formData.append("fotos", arquivo, arquivo.name));
        //
        // const response = await fetch("/api/retiradas", {
        //     method: "POST",
        //     headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` },
        //     body: formData
        // });
        // if (!response.ok) throw new Error("Erro ao confirmar retirada");
 
        await new Promise(resolve => setTimeout(resolve, 1200)); // simula envio
 
        // OBS: ainda não existe uma tela própria de "retirada confirmada" neste
        // recorte do projeto. Por enquanto volta para a home com um aviso de sucesso;
        // quando essa tela for criada, troque o redirecionamento abaixo.
        alert("Retirada confirmada! Aproveite o objeto.");
        window.location.href = "/";
 
    } catch (err) {
        console.error(err);
        alert("Não foi possível confirmar a retirada. Tente novamente.");
        btnConfirmar.disabled = false;
        btnConfirmar.innerHTML = `<i class="bi bi-check-circle"></i> Confirmar Retirada`;
    }
});
 





