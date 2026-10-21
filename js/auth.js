/* ==========================================================================
   Toplim — Catálogo Virtual · Autenticação
   --------------------------------------------------------------------------
   Contas, sessão e recuperação de senha, 100% no navegador (site estático).

   · Senhas e códigos de recuperação NUNCA são guardados em texto puro:
     só o hash PBKDF2-SHA256 (210 mil iterações) com sal aleatório.
   · Recuperação de senha: código de 16 caracteres gerado no cadastro.
   · O 1º cadastro feito neste aparelho vira Administrador; os demais, Cliente.
   · 5 tentativas erradas bloqueiam o acesso por 60 segundos.

   LIMITE IMPORTANTE: como não existe servidor, as contas valem apenas para
   este navegador/aparelho e o bloqueio é uma barreira de interface, não de
   segurança forte. Para contas compartilhadas entre aparelhos, e-mail de
   recuperação e proteção real dos dados, este módulo deve ser trocado por um
   back-end — a interface pública abaixo (Auth.*) foi pensada para isso.
   ========================================================================== */

const Auth = (() => {
  'use strict';

  /* ========================================================================
     1. Configuração
     ======================================================================== */
  const CHAVES = {
    usuarios:  'toplim:auth:usuarios:v1',
    sessao:    'toplim:auth:sessao:v1',
    bloqueios: 'toplim:auth:bloqueios:v1'
  };

  const ITERACOES        = 210000;
  const MAX_TENTATIVAS   = 5;
  const BLOQUEIO_MS      = 60 * 1000;
  const SESSAO_LONGA_MS  = 30 * 24 * 60 * 60 * 1000;   // "manter conectado"
  const SESSAO_CURTA_MS  = 12 * 60 * 60 * 1000;
  const ALFABETO_CODIGO  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 32 símbolos, sem 0/O/1/I
  const SAL_FALSO        = new Uint8Array(16);

  class ErroAuth extends Error {
    constructor(mensagem) { super(mensagem); this.name = 'ErroAuth'; }
  }


  /* ========================================================================
     2. Utilitários
     ======================================================================== */
  const guarda = {
    ler(store, chave, padrao) {
      try { const v = store.getItem(chave); return v ? JSON.parse(v) : padrao; }
      catch { return padrao; }
    },
    gravar(store, chave, valor) {
      try { store.setItem(chave, JSON.stringify(valor)); return true; }
      catch { return false; }
    },
    apagar(store, chave) {
      try { store.removeItem(chave); } catch { /* sem armazenamento */ }
    }
  };

  const normEmail = (e) => String(e ?? '').trim().toLowerCase();
  const normTexto = (s) => String(s ?? '').normalize('NFKC');
  const normCodigo = (c) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  const bytesParaB64 = (bytes) => btoa(String.fromCharCode(...bytes));
  const b64ParaBytes = (txt) => Uint8Array.from(atob(txt), (c) => c.charCodeAt(0));

  function iguais(a, b) {            // comparação sem curto-circuito
    if (a.length !== b.length) return false;
    let dif = 0;
    for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return dif === 0;
  }

  function aleatorio(n) {
    return crypto.getRandomValues(new Uint8Array(n));
  }

  function novoId() {
    return (crypto.randomUUID && crypto.randomUUID()) ||
      [...aleatorio(16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function derivar(texto, sal, iteracoes = ITERACOES) {
    const material = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(texto), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteracoes }, material, 256
    );
    return bytesParaB64(new Uint8Array(bits));
  }

  function gerarCodigo() {
    const bytes = aleatorio(16);     // 256 é múltiplo de 32: sem viés ao usar & 31
    const bruto = [...bytes].map((b) => ALFABETO_CODIGO[b & 31]).join('');
    return formatarCodigo(bruto);
  }

  function formatarCodigo(bruto) {
    return normCodigo(bruto).replace(/(.{4})(?=.)/g, '$1-');
  }

  const publico = (u) => ({ id: u.id, nome: u.nome, email: u.email, papel: u.papel, criadoEm: u.criadoEm });


  /* ========================================================================
     3. Armazenamento de usuários e bloqueios
     ======================================================================== */
  const lerUsuarios = () => guarda.ler(localStorage, CHAVES.usuarios, []);

  function salvarUsuarios(lista) {
    if (!guarda.gravar(localStorage, CHAVES.usuarios, lista)) {
      throw new ErroAuth('Não foi possível salvar os dados neste navegador. Verifique se ele permite armazenamento.');
    }
  }

  function checarBloqueio(chave) {
    const b = guarda.ler(localStorage, CHAVES.bloqueios, {})[chave];
    if (b && b.ate > Date.now()) {
      const s = Math.ceil((b.ate - Date.now()) / 1000);
      throw new ErroAuth(`Muitas tentativas. Tente novamente em ${s} s.`);
    }
  }

  function registrarFalha(chave) {
    const todos = guarda.ler(localStorage, CHAVES.bloqueios, {});
    const b = todos[chave] || { falhas: 0, ate: 0 };
    b.falhas += 1;
    if (b.falhas >= MAX_TENTATIVAS) { b.ate = Date.now() + BLOQUEIO_MS; b.falhas = 0; }
    todos[chave] = b;
    guarda.gravar(localStorage, CHAVES.bloqueios, todos);
  }

  function limparFalhas(chave) {
    const todos = guarda.ler(localStorage, CHAVES.bloqueios, {});
    if (chave in todos) {
      delete todos[chave];
      guarda.gravar(localStorage, CHAVES.bloqueios, todos);
    }
  }


  /* ========================================================================
     4. Validações
     ======================================================================== */
  const validarEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normEmail(e));

  /* Retorna os erros que impedem o cadastro e uma força de 0 a 4 */
  function validarSenha(senha) {
    const s = normTexto(senha);
    const erros = [];
    if (s.length < 8)   erros.push('Use pelo menos 8 caracteres.');
    if (!/[A-Za-z]/.test(s)) erros.push('Inclua ao menos uma letra.');
    if (!/\d/.test(s))  erros.push('Inclua ao menos um número.');

    const pontos = [
      s.length >= 8,
      s.length >= 12,
      /[a-z]/.test(s) && /[A-Z]/.test(s),
      /\d/.test(s),
      /[^A-Za-z0-9]/.test(s)
    ].filter(Boolean).length;

    return { erros, forca: erros.length ? Math.min(pontos, 1) : Math.min(pontos, 4) };
  }

  function exigirSenhaValida(senha) {
    const { erros } = validarSenha(senha);
    if (erros.length) throw new ErroAuth(erros[0]);
  }


  /* ========================================================================
     5. Sessão
     ======================================================================== */
  function abrirSessao(id, lembrar = false) {
    guarda.apagar(sessionStorage, CHAVES.sessao);
    guarda.apagar(localStorage, CHAVES.sessao);
    const dados = { id, exp: Date.now() + (lembrar ? SESSAO_LONGA_MS : SESSAO_CURTA_MS) };
    const destino = lembrar ? localStorage : sessionStorage;
    if (!guarda.gravar(destino, CHAVES.sessao, dados)) {
      throw new ErroAuth('Não foi possível iniciar a sessão neste navegador.');
    }
  }

  function sair() {
    guarda.apagar(sessionStorage, CHAVES.sessao);
    guarda.apagar(localStorage, CHAVES.sessao);
  }

  function sessao() {
    const d = guarda.ler(sessionStorage, CHAVES.sessao, null) || guarda.ler(localStorage, CHAVES.sessao, null);
    if (!d || d.exp < Date.now()) { if (d) sair(); return null; }
    const u = lerUsuarios().find((x) => x.id === d.id);
    if (!u) { sair(); return null; }
    return publico(u);
  }

  function exigirSessao() {
    const u = sessao();
    if (!u) throw new ErroAuth('Sua sessão expirou. Entre novamente.');
    return u;
  }

  function exigirAdmin() {
    const u = exigirSessao();
    if (u.papel !== 'admin') throw new ErroAuth('Apenas administradores podem fazer isso.');
    return u;
  }


  /* ========================================================================
     6. Cadastro, entrada e recuperação
     ======================================================================== */
  async function registrar({ nome, email, senha }) {
    const nomeLimpo = String(nome ?? '').trim().replace(/\s+/g, ' ');
    const em = normEmail(email);

    if (nomeLimpo.length < 2 || nomeLimpo.length > 60) throw new ErroAuth('Informe seu nome (de 2 a 60 caracteres).');
    if (!validarEmail(em)) throw new ErroAuth('Informe um e-mail válido.');
    exigirSenhaValida(senha);

    const usuarios = lerUsuarios();
    if (usuarios.some((u) => u.email === em)) {
      throw new ErroAuth('Este e-mail já está cadastrado. Entre ou recupere a senha.');
    }

    const sal = aleatorio(16);
    const salCodigo = aleatorio(16);
    const codigo = gerarCodigo();

    const usuario = {
      id: novoId(),
      nome: nomeLimpo,
      email: em,
      papel: usuarios.length === 0 ? 'admin' : 'cliente',
      criadoEm: new Date().toISOString(),
      iter: ITERACOES,
      sal: bytesParaB64(sal),
      hash: await derivar(normTexto(senha), sal),
      salCodigo: bytesParaB64(salCodigo),
      hashCodigo: await derivar(normCodigo(codigo), salCodigo)
    };

    salvarUsuarios([...usuarios, usuario]);
    return { usuario: publico(usuario), codigo };
  }

  async function entrar({ email, senha, lembrar = false }) {
    const em = normEmail(email);
    if (!em || !senha) throw new ErroAuth('Informe e-mail e senha.');

    const chave = 'login:' + em;
    checarBloqueio(chave);

    const u = lerUsuarios().find((x) => x.email === em);
    const calculado = await derivar(normTexto(senha), u ? b64ParaBytes(u.sal) : SAL_FALSO, u ? u.iter : ITERACOES);

    if (!u || !iguais(calculado, u.hash)) {
      registrarFalha(chave);
      throw new ErroAuth('E-mail ou senha incorretos.');
    }

    limparFalhas(chave);
    abrirSessao(u.id, lembrar);
    return publico(u);
  }

  /* Esqueci minha senha: e-mail + código de recuperação → nova senha e novo código */
  async function redefinir({ email, codigo, novaSenha }) {
    const em = normEmail(email);
    if (!validarEmail(em)) throw new ErroAuth('Informe o e-mail da sua conta.');
    if (normCodigo(codigo).length !== 16) throw new ErroAuth('O código de recuperação tem 16 caracteres.');
    exigirSenhaValida(novaSenha);

    const chave = 'rec:' + em;
    checarBloqueio(chave);

    const usuarios = lerUsuarios();
    const u = usuarios.find((x) => x.email === em);
    const calculado = await derivar(normCodigo(codigo), u ? b64ParaBytes(u.salCodigo) : SAL_FALSO, u ? u.iter : ITERACOES);

    if (!u || !iguais(calculado, u.hashCodigo)) {
      registrarFalha(chave);
      throw new ErroAuth('E-mail ou código de recuperação inválidos.');
    }

    const sal = aleatorio(16);
    const salCodigo = aleatorio(16);
    const novoCodigo = gerarCodigo();
    u.iter = ITERACOES;
    u.sal = bytesParaB64(sal);
    u.hash = await derivar(normTexto(novaSenha), sal);
    u.salCodigo = bytesParaB64(salCodigo);
    u.hashCodigo = await derivar(normCodigo(novoCodigo), salCodigo);

    salvarUsuarios(usuarios);
    limparFalhas(chave);
    limparFalhas('login:' + em);
    return { usuario: publico(u), codigo: novoCodigo };
  }

  async function alterarSenha({ atual, nova }) {
    const eu = exigirSessao();
    exigirSenhaValida(nova);

    const chave = 'senha:' + eu.id;
    checarBloqueio(chave);

    const usuarios = lerUsuarios();
    const u = usuarios.find((x) => x.id === eu.id);
    const calculado = await derivar(normTexto(atual), b64ParaBytes(u.sal), u.iter);
    if (!iguais(calculado, u.hash)) {
      registrarFalha(chave);
      throw new ErroAuth('A senha atual está incorreta.');
    }

    const sal = aleatorio(16);
    u.iter = ITERACOES;
    u.sal = bytesParaB64(sal);
    u.hash = await derivar(normTexto(nova), sal);
    salvarUsuarios(usuarios);
    limparFalhas(chave);
  }


  /* ========================================================================
     7. Gestão de usuários (somente administrador)
     ======================================================================== */
  function listarUsuarios() {
    exigirAdmin();
    return lerUsuarios().map(publico);
  }

  /* Gera um código novo para a pessoa usar em "Esqueci minha senha" */
  async function gerarNovoCodigo(id) {
    exigirAdmin();
    const usuarios = lerUsuarios();
    const u = usuarios.find((x) => x.id === id);
    if (!u) throw new ErroAuth('Usuário não encontrado.');

    const salCodigo = aleatorio(16);
    const codigo = gerarCodigo();
    u.iter = u.iter || ITERACOES;
    u.salCodigo = bytesParaB64(salCodigo);
    u.hashCodigo = await derivar(normCodigo(codigo), salCodigo, u.iter);
    salvarUsuarios(usuarios);
    limparFalhas('rec:' + u.email);
    return { usuario: publico(u), codigo };
  }

  function excluirUsuario(id) {
    const eu = exigirAdmin();
    if (id === eu.id) throw new ErroAuth('Você não pode excluir a própria conta.');
    const usuarios = lerUsuarios();
    if (!usuarios.some((u) => u.id === id)) throw new ErroAuth('Usuário não encontrado.');
    salvarUsuarios(usuarios.filter((u) => u.id !== id));
  }


  /* ========================================================================
     8. Suporte do navegador
     ======================================================================== */
  function suportado() {
    try {
      const k = 'toplim:auth:teste';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return !!(window.crypto && crypto.subtle && crypto.getRandomValues);
    } catch {
      return false;
    }
  }


  /* ========================================================================
     Interface pública
     ======================================================================== */
  return {
    ErroAuth,
    suportado,
    validarEmail,
    validarSenha,
    formatarCodigo,
    registrar,
    entrar,
    redefinir,
    alterarSenha,
    abrirSessao,
    sessao,
    sair,
    listarUsuarios,
    gerarNovoCodigo,
    excluirUsuario
  };
})();
