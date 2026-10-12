// =====================================================
// CONFIGURAÇÕES DO ADMIN
// Usa as MESMAS rotas do perfil e da troca de senha do usuário:
//   GET    /usuarios/me
//   PATCH  /usuarios/me        { nome, bio, telefone }
//   PUT    /usuarios/email     { email, senha }  (link de confirmação no novo e-mail)
//   POST   /usuarios/avatar    FormData "avatar" -> { avatarUrl }
//   DELETE /usuarios/avatar
//   PUT    /usuarios/senha     (alterarSenha do api.js)
// Depende de: utils/config.js, utils/api-client.js (window.ApiVizin) e Login/api.js
// =====================================================

const $ = (id) => document.getElementById(id);
const AVATAR_MAX_MB = 5;
let perfil = null; // dados vindos do back (GET /usuarios/me); null = não carregou

// ---------- helpers ----------
function mostrarMsg(id, texto, tipo) {
    const el = $(id);
    el.textContent = texto;
    el.classList.remove("erro", "sucesso", "info");
    if (tipo) el.classList.add(tipo);
}

function somenteNumeros(v) { return (v || "").replace(/\D/g, ""); }

function formatarTelefone(v) {
    let n = somenteNumeros(v).slice(0, 11);
    n = n.replace(/^(\d{2})(\d)/, "($1) $2");
    return n.replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

function validarEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

function validarSenha(s) {
    if (!s || s.length < 8) return "A nova senha deve ter no mínimo 8 caracteres";
    if (!/[A-Za-z]/.test(s)) return "A nova senha deve conter ao menos uma letra";
    if (!/[0-9]/.test(s)) return "A nova senha deve conter ao menos um número";
    return "";
}

// 401 = sessão expirada: volta pro login com aviso (mesmo texto do api.js)
function sessaoExpirou(err) {
    if (err?.status !== 401) return false;
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    sessionStorage.setItem("mensagemLogin", "Sua sessão expirou. Faça login novamente.");
    window.location.href = LOGIN_INDEX_URL;
    return true;
}

function textoErro(err, padrao) {
    if (err instanceof TypeError) return "Sem conexão. Verifique sua internet e tente novamente.";
    if (err?.status === 403) return "Você não tem permissão para realizar esta ação.";
    return err?.message || padrao;
}

function atualizarCacheEBarra(dados) {
    const cache = JSON.parse(localStorage.getItem("usuario") || "{}");
    atualizarCacheUsuario({ ...cache, ...dados });
    window.atualizarPerfilSidebar?.(dados); // sidebar muda na hora
}

// ---------- abas ----------
document.querySelector(".cfg-tab.active")?.setAttribute("aria-selected", "true");
document.querySelectorAll(".cfg-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".cfg-tab").forEach(t => {
            t.classList.toggle("active", t === tab);
            t.setAttribute("aria-selected", t === tab);
        });
        document.querySelectorAll(".cfg-panel").forEach(p => p.classList.toggle("active", p.id === `painel-${tab.dataset.tab}`));
    });
});

// ---------- estado do formulário de perfil ----------
function valoresForm() {
    return {
        nome: $("perfilNome").value.trim(),
        email: $("perfilEmail").value.trim(),
        telefone: somenteNumeros($("perfilTelefone").value)
    };
}

function perfilAlterado() {
    if (!perfil) return false;
    const v = valoresForm();
    return v.nome !== (perfil.nome || "") || v.email !== (perfil.email || "") || v.telefone !== somenteNumeros(perfil.telefone);
}

function atualizarBotaoPerfil() {
    $("btnPerfilSalvar").disabled = !perfilAlterado();
}

function mostrarAvatar(url) {
    const box = $("avatarPreview");
    box.replaceChildren();
    if (url) {
        const img = document.createElement("img");
        img.src = url;
        img.alt = "Foto do administrador";
        box.appendChild(img);
    } else {
        const i = document.createElement("i");
        i.className = "bi bi-person";
        box.appendChild(i);
    }
}

function renderPerfil() {
    $("perfilNome").value = perfil.nome || "";
    $("perfilEmail").value = perfil.email || "";
    $("perfilTelefone").value = formatarTelefone(perfil.telefone || "");
    mostrarAvatar(perfil.avatarUrl);
    $("btnRemoverFoto").hidden = !perfil.avatarUrl;
    $("emailPendente").hidden = !perfil.emailPendente;
    $("emailPendenteValor").textContent = perfil.emailPendente || "";
    atualizarBotaoPerfil();
}

// Falhou ao carregar: trava o formulário pra ninguém salvar em cima de dados vazios
function bloquearPerfil(bloquear) {
    document.querySelectorAll("#painel-perfil input, #painel-perfil button").forEach(el => { el.disabled = bloquear; });
    if (!bloquear) atualizarBotaoPerfil();
}

async function carregar() {
    $("avisoCarga").hidden = true;
    try {
        const me = await window.ApiVizin.get("/usuarios/me");
        // emailPendente: o back deve devolver o e-mail aguardando confirmação (ou null)
        perfil = { ...me, emailPendente: me.emailPendente || null };
        bloquearPerfil(false);
        renderPerfil();
    } catch (err) {
        if (sessaoExpirou(err)) return;
        perfil = null;
        bloquearPerfil(true);
        $("avisoCargaTexto").textContent = textoErro(err, "Não foi possível carregar seu perfil.");
        $("avisoCarga").hidden = false;
    }
}

$("btnRecarregar").addEventListener("click", carregar);
carregar();

// ---------- alterações não salvas ----------
window.addEventListener("beforeunload", (e) => {
    if (perfilAlterado()) { e.preventDefault(); e.returnValue = ""; }
});

// ---------- pedir senha (troca de e-mail) ----------
function pedirSenha() {
    return new Promise((resolve) => {
        const modal = $("modalEmail");
        const input = $("modalEmailSenha");
        const fechar = (valor) => {
            modal.hidden = true;
            input.value = "";
            mostrarMsg("msgModalEmail", "");
            resolve(valor);
        };
        $("btnModalEmailCancelar").onclick = () => fechar(null);
        $("btnModalEmailOk").onclick = () => {
            if (!input.value) return mostrarMsg("msgModalEmail", "Informe sua senha atual", "erro");
            fechar(input.value);
        };
        modal.onkeydown = (e) => {
            if (e.key === "Escape") fechar(null);
            if (e.key === "Enter") { e.preventDefault(); $("btnModalEmailOk").click(); }
        };
        modal.hidden = false;
        input.focus();
    });
}

// ---------- PERFIL ----------
["perfilNome", "perfilEmail", "perfilTelefone"].forEach(id => $(id).addEventListener("input", atualizarBotaoPerfil));
$("perfilTelefone").addEventListener("input", (e) => { e.target.value = formatarTelefone(e.target.value); atualizarBotaoPerfil(); });

$("btnPerfilCancelar").addEventListener("click", () => {
    if (!perfil) return;
    renderPerfil();
    mostrarMsg("msgPerfil", "");
});

$("formPerfil").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!perfil || !perfilAlterado()) return;

    const { nome, email, telefone } = valoresForm();
    if (!nome) return mostrarMsg("msgPerfil", "Informe seu nome", "erro");
    if (!validarEmail(email)) return mostrarMsg("msgPerfil", "Informe um email válido", "erro");
    if (telefone && telefone.length < 10) return mostrarMsg("msgPerfil", "Informe um telefone válido, com DDD", "erro");

    // Trocar e-mail pede a senha e só vale depois do link enviado ao novo endereço
    const emailMudou = email !== perfil.email;
    let senha = null;
    if (emailMudou) {
        senha = await pedirSenha();
        if (!senha) return mostrarMsg("msgPerfil", "Alteração de e-mail cancelada.", "info");
    }

    const botao = $("btnPerfilSalvar");
    const htmlBotao = botao.innerHTML;
    botao.disabled = true;
    botao.textContent = "Salvando...";
    mostrarMsg("msgPerfil", "");

    let dadosSalvos = false;
    try {
        // Mesmo corpo do perfil do usuário (telefone com máscara; bio preservada)
        const novo = await window.ApiVizin.patch("/usuarios/me", { nome, bio: perfil.bio || "", telefone: $("perfilTelefone").value.trim() });
        Object.assign(perfil, { nome: novo?.nome ?? nome, telefone: novo?.telefone ?? telefone, bio: novo?.bio ?? perfil.bio });
        dadosSalvos = true;
        atualizarCacheEBarra({ nome: perfil.nome });

        if (emailMudou) {
            await window.ApiVizin.put("/usuarios/email", { email, senha });
            perfil.emailPendente = email;
        }

        renderPerfil();
        mostrarMsg("msgPerfil", emailMudou
            ? `Enviamos um link de confirmação para ${email}. Seu e-mail de acesso só muda depois da confirmação.`
            : "Perfil atualizado com sucesso!", "sucesso");
    } catch (err) {
        if (sessaoExpirou(err)) return;
        const prefixo = dadosSalvos ? "Seus dados foram salvos, mas o e-mail não foi alterado: " : "";
        const padrao = err?.status === 409 ? "Este e-mail já está em uso." : "Não foi possível salvar as alterações.";
        mostrarMsg("msgPerfil", prefixo + textoErro(err, padrao), "erro");
    } finally {
        botao.innerHTML = htmlBotao;
        atualizarBotaoPerfil();
    }
});

// ---------- FOTO ----------
$("btnFoto").addEventListener("click", () => $("inputFoto").click());

$("inputFoto").addEventListener("change", async (e) => {
    const arquivo = e.target.files[0];
    e.target.value = "";
    if (!arquivo || !perfil) return;
    if (!/^image\/(png|jpeg|webp)$/.test(arquivo.type)) return mostrarMsg("msgPerfil", "Use uma imagem JPG, PNG ou WEBP", "erro");
    if (arquivo.size > AVATAR_MAX_MB * 1024 * 1024) return mostrarMsg("msgPerfil", `Essa imagem é muito grande. O tamanho máximo é ${AVATAR_MAX_MB}MB.`, "erro");

    const preview = URL.createObjectURL(arquivo); // preview imediato, como no perfil do usuário
    mostrarAvatar(preview);
    mostrarMsg("msgPerfil", "Enviando foto...", "info");
    try {
        const form = new FormData();
        form.append("avatar", arquivo, arquivo.name);
        const data = await window.ApiVizin.post("/usuarios/avatar", form);
        perfil.avatarUrl = data.avatarUrl;
        atualizarCacheEBarra({ avatarUrl: data.avatarUrl });
        mostrarMsg("msgPerfil", "Foto atualizada!", "sucesso");
    } catch (err) {
        if (sessaoExpirou(err)) return;
        mostrarMsg("msgPerfil", textoErro(err, "Não foi possível atualizar a foto de perfil."), "erro");
    } finally {
        URL.revokeObjectURL(preview);
        renderPerfil();
    }
});

$("btnRemoverFoto").addEventListener("click", async () => {
    const botao = $("btnRemoverFoto");
    botao.disabled = true;
    try {
        await window.ApiVizin.delete("/usuarios/avatar");
        perfil.avatarUrl = null;
        atualizarCacheEBarra({ avatarUrl: null });
        mostrarMsg("msgPerfil", "Foto removida.", "sucesso");
        renderPerfil();
    } catch (err) {
        if (sessaoExpirou(err)) return;
        mostrarMsg("msgPerfil", textoErro(err, "Não foi possível remover a foto."), "erro");
    } finally {
        botao.disabled = false;
    }
});

// ---------- SEGURANÇA (mesmo fluxo da tela "Alterar senha" do usuário) ----------
document.querySelectorAll(".toggle-senha").forEach(botao => botao.addEventListener("click", () => {
    const input = botao.parentElement.querySelector("input");
    const visivel = input.type === "text";
    const icone = botao.querySelector("i");
    input.type = visivel ? "password" : "text";
    icone.classList.toggle("bi-eye-slash", visivel);
    icone.classList.toggle("bi-eye", !visivel);
}));

$("formSenha").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const botao = form.querySelector('button[type="submit"]');
    const htmlBotao = botao.innerHTML;
    const atual = $("senhaAtual").value;
    const nova = $("senhaNova").value;
    const confirmar = $("senhaConfirmar").value;

    mostrarMsg("msgSenha", "");
    if (!atual) return mostrarMsg("msgSenha", "Informe sua senha atual", "erro");
    const erroSenha = validarSenha(nova);
    if (erroSenha) return mostrarMsg("msgSenha", erroSenha, "erro");
    if (nova === atual) return mostrarMsg("msgSenha", "A nova senha deve ser diferente da atual.", "erro");
    if (nova !== confirmar) return mostrarMsg("msgSenha", "As senhas não coincidem.", "erro");

    botao.disabled = true;
    botao.textContent = "Salvando...";
    try {
        // O back valida a senha atual e a regra da nova, e encerra as outras sessões.
        // Se responder { loginNecessario: true }, o admin precisa entrar de novo.
        const resposta = await alterarSenha(atual, nova); // PUT /usuarios/senha
        form.reset();
        if (resposta?.loginNecessario) {
            localStorage.removeItem("token");
            localStorage.removeItem("usuario");
            sessionStorage.setItem("mensagemLogin", "Senha alterada com sucesso. Entre novamente.");
            mostrarMsg("msgSenha", "Senha alterada. Entre novamente com a nova senha.", "sucesso");
            setTimeout(() => { window.location.href = LOGIN_INDEX_URL; }, 1200);
        } else {
            mostrarMsg("msgSenha", "Senha alterada com sucesso!", "sucesso");
        }
    } catch (err) {
        // ex: "Senha atual incorreta." — o texto exato precisa vir assim do back (o api.js depende dele)
        mostrarMsg("msgSenha", textoErro(err, "Não foi possível alterar sua senha. Tente novamente."), "erro");
    } finally {
        botao.disabled = false;
        botao.innerHTML = htmlBotao;
    }
});