/**
 * admin-preferencias.js — tema + idioma do painel admin.
 * Carregar no <head> de TODA página do admin (aplica o tema antes de pintar a tela).
 * Idioma: as telas são escritas em pt-BR; em en-US o texto é trocado pelo
 * dicionário abaixo (chave = texto em português). Para traduzir uma tela nova,
 * basta acrescentar os textos dela em EN. Para outro idioma, criar outro dicionário.
 */
(function () {
    const K = { tema: "temaAdmin", idioma: "idiomaAdmin" };
    const EN = {
        // sidebar
        "Início":"Home","Histórico de ações":"Action history","Usuários":"Users","Anúncios / Itens":"Listings / Items","Pagamentos":"Payments","Avaliações":"Reviews",
        "Denúncias / Suporte":"Reports / Support","Categorias":"Categories","Notificações":"Notifications",
        "Administrador":"Administrator","Carregando...":"Loading...","SAIR":"LOG OUT","Abrir menu":"Open menu",
        // página
        "Configurações":"Settings","Gerencie as configurações da plataforma e seu perfil":"Manage platform settings and your profile",
        "Seções de configurações":"Settings sections","Perfil Admin":"Admin Profile","Segurança":"Security",
        "Políticas":"Policies","Preferências":"Preferences","Perfil do Administrador":"Administrator Profile","Alterar Foto":"Change Photo",
        "JPG, PNG ou GIF. Tamanho máximo 2MB.":"JPG, PNG or GIF. Max size 2MB.","Nome Completo":"Full Name","Email":"Email",
        "Telefone":"Phone","Cancelar":"Cancel","Salvar Alterações":"Save Changes","Alterar Senha":"Change Password",
        "Senha Atual":"Current Password","Nova Senha":"New Password","Confirmar Nova Senha":"Confirm New Password",
        "Digite sua senha atual":"Enter your current password","Digite sua nova senha":"Enter your new password",
        "Confirme sua nova senha":"Confirm your new password","Autenticação em Duas Etapas":"Two-Factor Authentication",
        "2FA via SMS":"2FA via SMS","Receba códigos de verificação por SMS":"Receive verification codes by SMS",
        "Políticas da Plataforma":"Platform Policies","Termos de Uso":"Terms of Use","Política de Privacidade":"Privacy Policy",
        "Taxas da Plataforma (%)":"Platform Fees (%)","Salvar Políticas":"Save Policies",
        "Formatação: use ## no início da linha para títulos de seção, - para itens de lista e uma linha em branco para separar parágrafos.":"Formatting: start a line with ## for section titles, - for list items, and leave a blank line between paragraphs.",
        "Última publicação:":"Last published:","Ver Termos de Uso":"View Terms of Use","Ver Política de Privacidade":"View Privacy Policy",
        "Digite os termos de uso da plataforma...":"Enter the platform terms of use...",
        "Digite a política de privacidade...":"Enter the privacy policy...","Ex: 10":"E.g.: 10",
        "Preferências do Sistema":"System Preferences","Novos usuários cadastrados":"New registered users",
        "Novos anúncios publicados":"New listings published","Denúncias recebidas":"Reports received",
        "Pagamentos processados":"Payments processed","Avaliações negativas":"Negative reviews","Aparência":"Appearance",
        "Tema":"Theme","Automático":"Automatic","Claro":"Light","Escuro":"Dark","Idioma":"Language",
        "Restaurar Padrão":"Restore Defaults","Salvar Preferências":"Save Preferences",
        // notificações recebidas / início / histórico
        "Notificações recebidas":"Received notifications","Marcar todas como lidas":"Mark all as read",
        "Não lidas":"Unread","Urgentes":"Urgent","Hoje":"Today","Urgente":"Urgent","Todas":"All","Lidas":"Read",
        "Tudo em dia!":"All caught up!","Ver detalhes":"View details","Limpar filtros":"Clear filters",
        "Entrar novamente":"Sign in again","Precisa de atenção":"Needs attention","Sistema":"System",
        "Verificações":"Verifications","Categoria":"Category","Leitura":"Read status","Filtros":"Filters",
        "Criar Notificação":"Create Notification","Teste":"Test","Remover foto":"Remove photo","Foto removida.":"Photo removed.",
        "JPG, PNG ou WEBP. Tamanho máximo 5MB.":"JPG, PNG or WEBP. Max size 5MB.","Use uma imagem JPG, PNG ou WEBP":"Use a JPG, PNG or WEBP image","Somente urgentes":"Urgent only",
        // mensagens
        "Salvando...":"Saving...","Enviando foto...":"Uploading photo...","Foto atualizada!":"Photo updated!",
        "Use uma imagem JPG, PNG ou GIF":"Use a JPG, PNG or GIF image","A imagem deve ter no máximo 2MB":"Image must be at most 2MB",
        "Informe seu nome":"Enter your name","Informe um email válido":"Enter a valid email",
        "Informe um telefone válido, com DDD":"Enter a valid phone number with area code",
        "Perfil atualizado com sucesso!":"Profile updated successfully!","Informe sua senha atual":"Enter your current password",
        "A senha deve ter no mínimo 8 caracteres":"Password must have at least 8 characters",
        "A senha deve conter ao menos uma letra":"Password must contain at least one letter",
        "A senha deve conter ao menos um número":"Password must contain at least one number",
        "As senhas não coincidem":"Passwords do not match","Senha alterada com sucesso!":"Password changed successfully!",
        "2FA ativado.":"2FA enabled.","2FA desativado.":"2FA disabled.","A taxa deve estar entre 0 e 100":"The fee must be between 0 and 100","Políticas salvas com sucesso!":"Policies saved successfully!",
        "Padrão restaurado. Clique em Salvar Preferências para confirmar.":"Defaults restored. Click Save Preferences to confirm.",
        "Preferências salvas com sucesso!":"Preferences saved successfully!"
    };

    let idioma = localStorage.getItem(K.idioma) || "pt-BR";
    const root = document.documentElement;
    root.dataset.tema = localStorage.getItem(K.tema) || "auto";
    root.lang = idioma;

    const orig = new WeakMap();
    const ATTRS = ["placeholder", "aria-label"];
    let obs;

    function traduzir() {
        if (obs) obs.disconnect();
        const en = idioma === "en-US";
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = w.nextNode())) {
            const pt = orig.has(n) ? orig.get(n) : n.nodeValue;
            const c = pt.trim();
            if (!c) continue;
            if ((en && EN[c]) || orig.has(n)) {
                orig.set(n, pt);
                n.nodeValue = en && EN[c] ? pt.replace(c, EN[c]) : pt;
            }
        }
        document.body.querySelectorAll("[placeholder],[aria-label]").forEach(el => ATTRS.forEach(a => {
            if (!el.hasAttribute(a)) return;
            const k = "pt_" + a;
            if (el.dataset[k] === undefined) el.dataset[k] = el.getAttribute(a);
            const pt = el.dataset[k];
            el.setAttribute(a, en && EN[pt] ? EN[pt] : pt);
        }));
        if (obs) obs.observe(document.body, { childList: true, subtree: true });
    }

    window.AdminPrefs = {
        get: () => ({ tema: localStorage.getItem(K.tema) || "auto", idioma }),
        aplicar(p = {}) {
            if (p.tema) { localStorage.setItem(K.tema, p.tema); root.dataset.tema = p.tema; }
            if (p.idioma) { idioma = p.idioma; localStorage.setItem(K.idioma, idioma); root.lang = idioma; }
            if (document.body) traduzir();
        }
    };

    document.addEventListener("DOMContentLoaded", () => {
        let agendado = false;
        obs = new MutationObserver(() => {
            if (agendado) return;
            agendado = true;
            requestAnimationFrame(() => { agendado = false; traduzir(); });
        });
        traduzir();
    });
})();