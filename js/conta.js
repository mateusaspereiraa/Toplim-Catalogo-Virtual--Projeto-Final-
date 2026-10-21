/* ==========================================================================
   Toplim — Catálogo Virtual · Minha conta
   --------------------------------------------------------------------------
   Botão com a inicial do usuário, painel de conta (alterar senha, sair) e
   verificação de sessão expirada. Carregado após o login.
   Depende de js/auth.js.
   ========================================================================== */

(() => {
  'use strict';

  const $ = (seletor, raiz = document) => raiz.querySelector(seletor);

  const esc = (texto) => String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const painel = $('#cta');
  const botao = $('#conta');
  const PAPEIS = { admin: 'Administrador', cliente: 'Cliente' };

  const usuario = Auth.sessao();
  if (!usuario) { location.reload(); return; }

  $('#conta-ini').textContent = (usuario.nome.trim()[0] || '?').toUpperCase();
  botao.title = `Minha conta — ${usuario.nome}`;


  /* ========================================================================
     Painel
     ======================================================================== */
  function renderizar(aviso = null) {
    painel.innerHTML = `
      <div class="in">
        <div class="adm-topo">
          <h1>Minha conta</h1>
          <button type="button" class="s" data-acao="fechar">Fechar ✕</button>
        </div>

        <div class="pn conta-dados">
          <div class="avatar avatar-g" aria-hidden="true">${esc((usuario.nome.trim()[0] || '?').toUpperCase())}</div>
          <div>
            <strong>${esc(usuario.nome)}</strong><br>
            <small class="mt">${esc(usuario.email)}</small><br>
            <span class="tag">${esc(PAPEIS[usuario.papel] || usuario.papel)}</span>
          </div>
        </div>

        <div class="pn">
          <h2>Alterar senha</h2>
          ${aviso ? `<div class="msg ${aviso.tipo}" role="alert">${esc(aviso.texto)}</div>` : ''}
          <form id="form-senha" autocomplete="off" novalidate>
            <div class="f">
              <div><label for="s-atual">Senha atual</label><input id="s-atual" type="password" autocomplete="current-password" required></div>
              <div><label for="s-nova">Nova senha</label><input id="s-nova" type="password" autocomplete="new-password" required></div>
              <div><label for="s-conf">Confirmar nova senha</label><input id="s-conf" type="password" autocomplete="new-password" required></div>
            </div>
            <small class="dica">Mínimo de 8 caracteres, com letras e números.</small>
            <div class="row conta-acoes"><button type="submit" class="p">Salvar nova senha</button></div>
          </form>
        </div>

        <div class="pn">
          <h2>Sessão</h2>
          <p class="mt">Saia se estiver usando um aparelho compartilhado.</p>
          <button type="button" class="d" data-acao="sair">Sair da conta</button>
        </div>
      </div>`;
  }

  function abrir() {
    renderizar();
    painel.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function fechar() {
    painel.hidden = true;
    document.body.style.overflow = '';
  }

  function sair() {
    Auth.sair();
    location.reload();
  }

  async function salvarSenha() {
    const atual = $('#s-atual').value;
    const nova = $('#s-nova').value;

    if (!atual) return renderizar({ tipo: 'erro', texto: 'Informe sua senha atual.' });
    const { erros } = Auth.validarSenha(nova);
    if (erros.length) return renderizar({ tipo: 'erro', texto: erros[0] });
    if (nova !== $('#s-conf').value) return renderizar({ tipo: 'erro', texto: 'As senhas não coincidem.' });

    const enviar = $('#form-senha button[type="submit"]');
    enviar.disabled = true;
    try {
      await Auth.alterarSenha({ atual, nova });
      renderizar({ tipo: 'ok', texto: 'Senha alterada com sucesso.' });
    } catch (e) {
      renderizar({ tipo: 'erro', texto: e instanceof Auth.ErroAuth ? e.message : 'Algo deu errado. Tente novamente.' });
    }
  }


  /* ========================================================================
     Eventos
     ======================================================================== */
  botao.addEventListener('click', abrir);

  painel.addEventListener('click', (ev) => {
    const alvo = ev.target.closest('[data-acao]');
    if (!alvo) return;
    if (alvo.dataset.acao === 'fechar') fechar();
    if (alvo.dataset.acao === 'sair') sair();
  });

  painel.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (ev.target.id === 'form-senha') salvarSenha();
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !painel.hidden) fechar();
  });

  /* Sessão expirada (ou conta removida) enquanto a aba estava aberta */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !Auth.sessao()) location.reload();
  });
})();
