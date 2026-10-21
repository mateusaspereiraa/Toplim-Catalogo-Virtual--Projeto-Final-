/* ==========================================================================
   Toplim — Catálogo Virtual · Tela de acesso
   --------------------------------------------------------------------------
   1. Utilitários e tema        4. Cadastro, entrada e recuperação
   2. Telas (entrar/criar/…)    5. Código de recuperação
   3. Campos de senha           6. Inicialização do site
   Depende de js/auth.js.
   ========================================================================== */

(() => {
  'use strict';

  /* ========================================================================
     1. Utilitários e tema
     ======================================================================== */
  const $  = (seletor, raiz = document) => raiz.querySelector(seletor);
  const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];

  const CHAVE_TEMA = 'toplim:tema';
  const raiz = document.documentElement;

  const lerTema = () => { try { return JSON.parse(localStorage.getItem(CHAVE_TEMA)); } catch { return null; } };
  const temaDoSistema = () => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  raiz.dataset.theme = lerTema() || temaDoSistema();

  $('#auth-tema').addEventListener('click', () => {
    const novo = raiz.dataset.theme === 'dark' ? 'light' : 'dark';
    raiz.dataset.theme = novo;
    try { localStorage.setItem(CHAVE_TEMA, JSON.stringify(novo)); } catch { /* sem armazenamento */ }
  });

  const el = {
    auth: $('#auth'), app: $('#app'),
    abas: $('#auth-abas'), titulo: $('#auth-titulo'), sub: $('#auth-sub'), msg: $('#auth-msg'),
    entrar: $('#f-entrar'), criar: $('#f-criar'), recuperar: $('#f-recuperar'), codigo: $('#v-codigo')
  };


  /* ========================================================================
     2. Telas (entrar · criar · recuperar · código)
     ======================================================================== */
  const TELAS = {
    entrar: {
      form: el.entrar, foco: '#e-email', abas: true,
      titulo: 'Bem-vindo de volta',
      sub: 'Entre para acessar o catálogo de produtos.'
    },
    criar: {
      form: el.criar, foco: '#c-nome', abas: true,
      titulo: 'Crie sua conta',
      sub: 'É rápido: nome, e-mail e uma senha.'
    },
    recuperar: {
      form: el.recuperar, foco: '#r-email', abas: false,
      titulo: 'Recuperar senha',
      sub: 'Informe seu e-mail e o código de recuperação gerado quando você criou a conta.'
    },
    codigo: {
      form: el.codigo, foco: '#cod-ok', abas: false,
      titulo: 'Guarde seu código de recuperação',
      sub: 'Ele é a única forma de redefinir sua senha caso você a esqueça e aparece somente agora.'
    }
  };

  function ir(nome, { focar = true } = {}) {
    const tela = TELAS[nome];

    Object.values(TELAS).forEach((t) => { t.form.hidden = t.form !== tela.form; });
    el.abas.hidden = !tela.abas;
    $$('button', el.abas).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ir === nome)));
    el.titulo.textContent = tela.titulo;
    el.sub.textContent = tela.sub;
    limparMensagem();

    if (focar) $(tela.foco).focus();
  }

  function mensagem(texto, tipo) {
    el.msg.textContent = texto;
    el.msg.className = `msg ${tipo}`;
    el.msg.hidden = false;
  }

  function limparMensagem() {
    el.msg.hidden = true;
    el.msg.textContent = '';
    $$('[aria-invalid]').forEach((c) => c.removeAttribute('aria-invalid'));
  }

  /* Mostra o erro e leva o foco ao campo com problema */
  function falha(texto, campo) {
    mensagem(texto, 'erro');
    if (campo) {
      const c = $(campo);
      c.setAttribute('aria-invalid', 'true');
      c.focus();
    }
    return false;
  }

  function ocupado(form, sim, textoOcupado) {
    const botao = $('button[type="submit"]', form);
    if (sim) { botao.dataset.rotulo = botao.textContent; botao.textContent = textoOcupado; }
    else if (botao.dataset.rotulo) { botao.textContent = botao.dataset.rotulo; }
    botao.disabled = sim;
  }

  /* Links e abas: qualquer elemento com data-ir troca de tela */
  document.addEventListener('click', (ev) => {
    const alvo = ev.target.closest('[data-ir]');
    if (!alvo || !el.auth.contains(alvo)) return;

    const origem = $('#e-email').value.trim();
    ir(alvo.dataset.ir);
    if (alvo.dataset.ir === 'recuperar' && origem && !$('#r-email').value) $('#r-email').value = origem;
  });


  /* ========================================================================
     3. Campos de senha (mostrar/ocultar e medidor de força)
     ======================================================================== */
  document.addEventListener('click', (ev) => {
    const botao = ev.target.closest('[data-ver]');
    if (!botao) return;
    const campo = document.getElementById(botao.dataset.ver);
    const mostrar = campo.type === 'password';
    campo.type = mostrar ? 'text' : 'password';
    botao.textContent = mostrar ? 'Ocultar' : 'Mostrar';
    botao.setAttribute('aria-pressed', String(mostrar));
  });

  $$('[data-forca]').forEach((medidor) => {
    const campo = document.getElementById(medidor.dataset.forca);
    campo.addEventListener('input', () => {
      medidor.dataset.n = campo.value ? Math.max(1, Auth.validarSenha(campo.value).forca) : 0;   // senha fraca mostra ao menos 1 barra
    });
  });

  /* O código de recuperação é digitado em blocos: formata enquanto escreve */
  $('#r-codigo').addEventListener('input', (ev) => {
    ev.target.value = Auth.formatarCodigo(ev.target.value);
  });


  /* ========================================================================
     4. Cadastro, entrada e recuperação
     ======================================================================== */
  const erroGenerico = 'Algo deu errado. Tente novamente.';

  function tratarErro(e) {
    mensagem(e instanceof Auth.ErroAuth ? e.message : erroGenerico, 'erro');
  }

  el.entrar.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limparMensagem();

    const email = $('#e-email').value.trim();
    const senha = $('#e-senha').value;
    if (!Auth.validarEmail(email)) return falha('Informe um e-mail válido.', '#e-email');
    if (!senha) return falha('Informe sua senha.', '#e-senha');

    ocupado(el.entrar, true, 'Entrando…');
    try {
      await Auth.entrar({ email, senha, lembrar: $('#e-lembrar').checked });
      el.entrar.reset();
      iniciarSite();
    } catch (e) {
      tratarErro(e);
      $('#e-senha').value = '';
      $('#e-senha').focus();
    } finally {
      ocupado(el.entrar, false);
    }
  });

  el.criar.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limparMensagem();

    const nome = $('#c-nome').value;
    const email = $('#c-email').value.trim();
    const senha = $('#c-senha').value;

    if (nome.trim().length < 2)     return falha('Informe seu nome.', '#c-nome');
    if (!Auth.validarEmail(email))  return falha('Informe um e-mail válido.', '#c-email');
    const { erros } = Auth.validarSenha(senha);
    if (erros.length)               return falha(erros[0], '#c-senha');
    if (senha !== $('#c-conf').value) return falha('As senhas não coincidem.', '#c-conf');

    ocupado(el.criar, true, 'Criando conta…');
    try {
      const { usuario, codigo } = await Auth.registrar({ nome, email, senha });
      el.criar.reset();
      zerarMedidores();
      mostrarCodigo(codigo, usuario);
    } catch (e) {
      tratarErro(e);
    } finally {
      ocupado(el.criar, false);
    }
  });

  el.recuperar.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limparMensagem();

    const email = $('#r-email').value.trim();
    const codigo = $('#r-codigo').value;
    const senha = $('#r-senha').value;

    if (!Auth.validarEmail(email))   return falha('Informe o e-mail da sua conta.', '#r-email');
    if (!codigo.trim())              return falha('Informe o código de recuperação.', '#r-codigo');
    const { erros } = Auth.validarSenha(senha);
    if (erros.length)                return falha(erros[0], '#r-senha');
    if (senha !== $('#r-conf').value) return falha('As senhas não coincidem.', '#r-conf');

    ocupado(el.recuperar, true, 'Redefinindo…');
    try {
      const { usuario, codigo: novoCodigo } = await Auth.redefinir({ email, codigo, novaSenha: senha });
      el.recuperar.reset();
      zerarMedidores();
      mostrarCodigo(novoCodigo, usuario, true);
    } catch (e) {
      tratarErro(e);
    } finally {
      ocupado(el.recuperar, false);
    }
  });

  function zerarMedidores() {
    $$('[data-forca]').forEach((m) => { m.dataset.n = 0; });
  }


  /* ========================================================================
     5. Código de recuperação
     ======================================================================== */
  let pendente = null;     // { codigo, usuario } enquanto a pessoa não confirmou que guardou

  function mostrarCodigo(codigo, usuario, aposRedefinir = false) {
    pendente = { codigo, usuario };
    $('#cod-valor').textContent = codigo;
    $('#cod-ok').checked = false;
    $('#cod-ir').disabled = true;
    $('#cod-copiar').textContent = 'Copiar';
    ir('codigo', { focar: false });
    if (aposRedefinir) mensagem('Senha alterada! Este é o seu novo código de recuperação; o anterior deixou de valer.', 'ok');
  }

  $('#cod-ok').addEventListener('change', (ev) => { $('#cod-ir').disabled = !ev.target.checked; });

  $('#cod-copiar').addEventListener('click', async () => {
    const botao = $('#cod-copiar');
    try {
      await navigator.clipboard.writeText(pendente.codigo);
      botao.textContent = 'Copiado ✓';
    } catch {
      const faixa = document.createRange();           // sem permissão: seleciona para copiar à mão
      faixa.selectNodeContents($('#cod-valor'));
      getSelection().removeAllRanges();
      getSelection().addRange(faixa);
      botao.textContent = 'Selecionado: Ctrl+C';
    }
  });

  $('#cod-baixar').addEventListener('click', () => {
    const texto = [
      'Toplim — Catálogo Virtual',
      'Código de recuperação de senha',
      '',
      `Conta:  ${pendente.usuario.email}`,
      `Código: ${pendente.codigo}`,
      `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
      '',
      'Guarde este arquivo em local seguro. Quem tiver este código consegue redefinir a senha da conta.'
    ].join('\n');

    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' }));
    link.download = 'toplim-codigo-de-recuperacao.txt';
    link.click();
    URL.revokeObjectURL(link.href);
  });

  $('#cod-ir').addEventListener('click', () => {
    const { usuario } = pendente;
    pendente = null;
    try {
      Auth.abrirSessao(usuario.id, true);
      iniciarSite();
    } catch (e) {
      ir('entrar');
      tratarErro(e);
    }
  });

  /* Evita fechar a aba antes de guardar o código */
  window.addEventListener('beforeunload', (ev) => {
    if (!pendente) return;
    ev.preventDefault();
    ev.returnValue = '';
  });


  /* ========================================================================
     6. Inicialização do site
     ======================================================================== */
  const SCRIPTS_DO_CATALOGO = ['js/data.js', 'js/app.js', 'js/conta.js'];
  let siteIniciado = false;

  function carregarScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
      document.body.appendChild(s);
    });
  }

  /* O catálogo só é carregado depois de autenticado */
  async function iniciarSite() {
    if (siteIniciado) return;
    siteIniciado = true;

    el.auth.hidden = true;
    el.app.hidden = false;
    window.scrollTo(0, 0);

    try {
      for (const src of SCRIPTS_DO_CATALOGO) await carregarScript(src);
    } catch (e) {
      console.error(e);
      el.app.hidden = true;
      el.auth.hidden = false;
      siteIniciado = false;
      ir('entrar', { focar: false });
      mensagem('Não foi possível carregar o catálogo. Verifique sua conexão e tente de novo.', 'erro');
    }
  }

  function mostrarAcesso() {
    el.auth.hidden = false;
    ir('entrar', { focar: false });
  }

  function iniciar() {
    if (!Auth.suportado()) {
      el.auth.hidden = false;
      ir('entrar', { focar: false });
      $$('form button, form input').forEach((c) => { c.disabled = true; });
      el.abas.hidden = true;
      mensagem('Este navegador está bloqueando o armazenamento ou abriu o site sem conexão segura (use https). Ative o armazenamento ou troque de navegador.', 'erro');
      return;
    }

    if (Auth.sessao()) iniciarSite();
    else mostrarAcesso();
  }

  iniciar();
})();
