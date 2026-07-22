// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    window.location.href = "../Login/index.html";
}
 
// ================= USUÁRIO LOGADO (sessão local) =================
// login.js salva os dados básicos do usuário (id, nome, email) no
// localStorage após o login/cadastro. Usamos só o id daqui para saber se a
// página é o próprio perfil ou o de outra pessoa — todo o resto dos dados
// exibidos (bio, avatar, estatísticas, avaliações) vem do back-end abaixo.
const usuarioSalvo = JSON.parse(localStorage.getItem("usuario") || "null") || {};
const idUsuarioLogado = usuarioSalvo.id || usuarioSalvo.email;
 
// ================= DETERMINAR MODO (PRÓPRIO PERFIL X OUTRO USUÁRIO) =================
const params = new URLSearchParams(window.location.search);
const idParam = params.get("id");
 
const ehProprioPerfil = !idParam || idParam === idUsuarioLogado;
 
let usuarioExibido = null;
 
// ================= ELEMENTOS ================
const elAvatarImg = document.getElementById("perfil-avatar-img");
const elAvatarInicial = document.getElementById("perfil-avatar-inicial");
const elNomeView = document.getElementById("perfil-nome-view");
const elEmail = document.getElementById("perfil-email");
const elAvaliacaoMedia = document.getElementById("perfil-avaliacao-media");
const elAvaliacaoTotal = document.getElementById("perfil-avaliacao-total");
const elMembroDesde = document.getElementById("perfil-membro-desde");
const elVerificado = document.getElementById("perfil-verificado");
const elBioView = document.getElementById("perfil-bio-view");
const elStatAlugados = document.getElementById("stat-alugados");
const elStatAnunciados = document.getElementById("stat-anunciados");
const elStatResposta = document.getElementById("stat-resposta");
const elListaAvaliacoes = document.getElementById("lista-avaliacoes");
 
const btnEditarPerfil = document.getElementById("btn-editar-perfil");
const perfilEditActions = document.getElementById("perfil-edit-actions");
const avatarCameraBtn = document.getElementById("btn-trocar-foto");
 
// ================= CARREGAR PERFIL =================
async function carregarPerfil() {
    /* ============================================================
       PONTO DE INTEGRAÇÃO COM O BACK-END (leitura)
       Próprio perfil: GET /api/usuarios/perfil
       Perfil de outra pessoa: GET /api/usuarios/:id
       Espera-se um retorno JSON parecido com:
       {
         "id": "...",
         "nome": "...",
         "email": "...",
         "bio": "...",
         "avatarUrl": null,
         "avaliacaoMedia": 4.8,
         "avaliacaoTotal": 24,
         "membroDesde": "14/01/2025",
         "verificado": true,
         "stats": { "alugados": 12, "anunciados": 3, "taxaResposta": 98 },
         "avaliacoes": [
           { "nome": "Maria Santos", "data": "12/03/2026", "nota": 5.0, "comentario": "..." }
         ]
       }
       ============================================================ */
    try {
        const url = ehProprioPerfil ? "/api/usuarios/perfil" : `/api/usuarios/${idParam}`;
        const response = await fetch(url, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
        });
 
        if (!response.ok) {
            throw new Error(`Erro ${response.status} ao carregar perfil`);
        }
 
        usuarioExibido = await response.json();
        renderizarPerfil(usuarioExibido);
 
        if (!ehProprioPerfil) {
            btnEditarPerfil.style.display = "none";
            avatarCameraBtn.style.display = "none";
        }
    } catch (err) {
        console.error(err);
        alert("Não foi possível carregar este perfil.");
    }
}
 
// ================= RENDERIZAR DADOS =================
function renderizarPerfil(usuario) {
    if (usuario.avatarUrl) {
        elAvatarImg.src = usuario.avatarUrl;
        elAvatarImg.style.display = "block";
        elAvatarInicial.style.display = "none";
    } else {
        elAvatarImg.style.display = "none";
        elAvatarInicial.style.display = "block";
        elAvatarInicial.textContent = usuario.nome.charAt(0).toUpperCase();
    }
 
    elNomeView.textContent = usuario.nome;
    elEmail.textContent = usuario.email;
    elAvaliacaoMedia.textContent = usuario.avaliacaoMedia.toFixed(1);
    elAvaliacaoTotal.textContent = usuario.avaliacaoTotal;
    elMembroDesde.textContent = usuario.membroDesde;
    elVerificado.style.display = usuario.verificado ? "inline-flex" : "none";
    elBioView.textContent = usuario.bio;
 
    elStatAlugados.textContent = usuario.stats.alugados;
    elStatAnunciados.textContent = usuario.stats.anunciados;
    elStatResposta.textContent = `${usuario.stats.taxaResposta}%`;
 
    elListaAvaliacoes.innerHTML = "";
    if (usuario.avaliacoes.length === 0) {
        elListaAvaliacoes.innerHTML = `<p class="perfil-bio-view">Ainda não recebeu avaliações.</p>`;
    } else {
        usuario.avaliacoes.forEach(av => {
            const item = document.createElement("div");
            item.className = "avaliacao-item";
            item.innerHTML = `
                <div class="avaliacao-avatar">${av.nome.charAt(0).toUpperCase()}</div>
                <div>
                    <div class="avaliacao-topo">
                        <div>
                            <p class="avaliacao-nome">${av.nome}</p>
                            <p class="avaliacao-data">${av.data}</p>
                        </div>
                        <span class="avaliacao-nota"><i class="bi bi-star-fill"></i> ${av.nota.toFixed(1)}</span>
                    </div>
                    <p class="avaliacao-comentario">${av.comentario}</p>
                </div>
            `;
            elListaAvaliacoes.appendChild(item);
        });
    }
}
 
// ================= MODO EDIÇÃO =================
const nomeInputEl = document.getElementById("input-nome");
const bioInputEl = document.getElementById("input-bio");
const campoNomeEdicao = document.getElementById("campo-nome-edicao");
const campoBioEdicao = document.getElementById("campo-bio-edicao");
 
function entrarModoEdicao() {
    nomeInputEl.value = usuarioExibido.nome;
    bioInputEl.value = usuarioExibido.bio;
 
    campoNomeEdicao.style.display = "block";
    campoBioEdicao.style.display = "block";
    elBioView.style.display = "none";
 
    btnEditarPerfil.style.display = "none";
    perfilEditActions.style.display = "flex";
}
 
function sairModoEdicao() {
    campoNomeEdicao.style.display = "none";
    campoBioEdicao.style.display = "none";
    elBioView.style.display = "block";
 
    btnEditarPerfil.style.display = "inline-flex";
    perfilEditActions.style.display = "none";
}
 
btnEditarPerfil.addEventListener("click", entrarModoEdicao);
 
document.getElementById("btn-cancelar-edicao").addEventListener("click", () => {
    sairModoEdicao();
});
 
document.getElementById("btn-salvar-edicao").addEventListener("click", async () => {
    const novoNome = nomeInputEl.value.trim();
    const novaBio = bioInputEl.value.trim();
 
    if (!novoNome) {
        alert("O nome não pode ficar vazio.");
        return;
    }
 
    const btnSalvar = document.getElementById("btn-salvar-edicao");
    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando...";
 
    try {
        /* ============================================================
           PONTO DE INTEGRAÇÃO COM O BACK-END (atualização)
           ============================================================ */
        const response = await fetch("/api/usuarios/perfil", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            },
            body: JSON.stringify({ nome: novoNome, bio: novaBio })
        });
 
        if (!response.ok) {
            throw new Error(`Erro ${response.status} ao salvar perfil`);
        }
 
        usuarioExibido.nome = novoNome;
        usuarioExibido.bio = novaBio;
 
        // Mantém o localStorage sincronizado, já que outras páginas leem "usuario" de lá
        if (ehProprioPerfil) {
            const usuarioLocal = JSON.parse(localStorage.getItem("usuario") || "{}");
            localStorage.setItem("usuario", JSON.stringify({ ...usuarioLocal, nome: novoNome, bio: novaBio }));
        }
 
        renderizarPerfil(usuarioExibido);
        sairModoEdicao();
 
    } catch (err) {
        console.error(err);
        alert("Não foi possível salvar as alterações. Tente novamente.");
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Salvar";
    }
});
 
// ================= TROCAR FOTO DE PERFIL =================
const inputAvatar = document.getElementById("input-avatar");
 
avatarCameraBtn.addEventListener("click", () => inputAvatar.click());
 
inputAvatar.addEventListener("change", async (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo || !arquivo.type.startsWith("image/")) return;
 
    // Preview imediato local, enquanto o upload não termina
    const preview = URL.createObjectURL(arquivo);
    elAvatarImg.src = preview;
    elAvatarImg.style.display = "block";
    elAvatarInicial.style.display = "none";
 
    try {
        /* ============================================================
           PONTO DE INTEGRAÇÃO COM O BACK-END (upload de avatar)
           Espera-se um retorno JSON: { "avatarUrl": "https://..." }
           ============================================================ */
        const formData = new FormData();
        formData.append("avatar", arquivo, arquivo.name);
 
        const response = await fetch("/api/usuarios/avatar", {
            method: "POST",
            headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` },
            body: formData
        });
 
        if (!response.ok) {
            throw new Error(`Erro ${response.status} ao enviar foto`);
        }
 
        const data = await response.json();
        usuarioExibido.avatarUrl = data.avatarUrl;
        elAvatarImg.src = data.avatarUrl;
    } catch (err) {
        console.error(err);
        alert("Não foi possível atualizar a foto de perfil.");
        // reverte para o avatar anterior em caso de erro
        renderizarPerfil(usuarioExibido);
    }
 
    inputAvatar.value = "";
});
 
// ================= INICIALIZAÇÃO =================
carregarPerfil();
 