/* ==========================================================================
   Toplim — Catálogo Virtual · Lógica da aplicação
   --------------------------------------------------------------------------
   1. Configuração          5. Cards e renderização
   2. Utilitários           6. Eventos do catálogo
   3. Estado e dados        7. Painel administrativo
   4. Filtros               8. Tema, PDF e inicialização
   Depende de js/data.js (PRODUTOS_ORIGINAIS e IMAGENS_DISPONIVEIS).
   ========================================================================== */

(() => {
  'use strict';

  /* ========================================================================
     1. Configuração
     ======================================================================== */
  const POR_PAGINA  = 60;
  const PASTA_IMG   = 'img-produtos/';
  const CHAVE_DADOS = 'toplim:produtos:v1';
  const CHAVE_TEMA  = 'toplim:tema';
  const COM_FOTO    = new Set(IMAGENS_DISPONIVEIS);

  const CATALOGOS = [
    ['todos', 'Catálogo completo'],
    ['foto',  'Somente com foto']
  ];


  /* ========================================================================
     2. Utilitários
     ======================================================================== */
  const $ = (seletor, raiz = document) => raiz.querySelector(seletor);

  const esc = (texto) => String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  /* minúsculas e sem acento, para busca tolerante */
  const norm = (texto) => String(texto ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const unicos = (lista) => [...new Set(lista)].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const armazenar = {
    ler(chave) {
      try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) : null; }
      catch { return null; }
    },
    gravar(chave, valor) {
      try { localStorage.setItem(chave, JSON.stringify(valor)); return true; }
      catch { return false; }
    },
    apagar(chave) {
      try { localStorage.removeItem(chave); } catch { /* sem armazenamento */ }
    }
  };

  let temporizadorToast;
  function aviso(mensagem) {
    let el = $('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = mensagem;
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => el.remove(), 2600);
  }


  /* ========================================================================
     3. Estado e dados
     ======================================================================== */
  const el = {
    busca: $('#q'),  catalogo: $('#cs'), tema: $('#th'),   admin: $('#ad'),  pdf: $('#pdf'),
    chips: $('#chips'), sub: $('#sub'),  ordem: $('#so'),  visao: $('#vw'),
    contagem: $('#cnt'), saida: $('#out'), mais: $('#mo'), painel: $('#adm')
  };

  const estado = {
    produtos: carregarProdutos(),
    busca: '',
    catalogo: 'todos',
    cat: '',
    sub: '',
    ordem: 'n',
    visao: 'g',
    limite: POR_PAGINA,
    imprimindo: false
  };

  function copiaOriginal() {
    return PRODUTOS_ORIGINAIS.map((p) => ({ ...p }));
  }

  function produtoValido(p) {
    return p && typeof p === 'object' && p.cod && p.nome && p.cat;
  }

  function carregarProdutos() {
    const salvos = armazenar.ler(CHAVE_DADOS);
    return Array.isArray(salvos) && salvos.every(produtoValido) ? salvos : copiaOriginal();
  }

  function salvarProdutos() {
    if (!armazenar.gravar(CHAVE_DADOS, estado.produtos)) {
      aviso('Não foi possível salvar neste navegador.');
    }
  }


  /* ========================================================================
     4. Filtros
     ======================================================================== */
  const comparadores = {
    n: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
    c: (a, b) => String(a.cod).localeCompare(String(b.cod), 'pt-BR', { numeric: true }),
    m: (a, b) => (a.marca || '').localeCompare(b.marca || '', 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR')
  };

  function filtrar() {
    const termos = norm(estado.busca).split(/\s+/).filter(Boolean);

    return estado.produtos
      .filter((p) => {
        if (estado.catalogo === 'foto' && !COM_FOTO.has(String(p.cod))) return false;
        if (estado.cat && p.cat !== estado.cat) return false;
        if (estado.sub && p.sub !== estado.sub) return false;
        if (!termos.length) return true;
        const alvo = norm(`${p.cod} ${p.nome} ${p.marca}`);
        return termos.every((t) => alvo.includes(t));
      })
      .sort(comparadores[estado.ordem]);
  }


  /* ========================================================================
     5. Cards e renderização
     ======================================================================== */
  function cardHTML(p) {
    const cod = String(p.cod);
    const midia = COM_FOTO.has(cod)
      ? `<div class="media"><img src="${PASTA_IMG}${esc(cod)}.webp" alt="${esc(p.nome)}" width="400" height="250" loading="${estado.imprimindo ? 'eager' : 'lazy'}" decoding="async"></div>`
      : '<div class="media vazio" aria-hidden="true"></div>';

    const tags = [p.cat, p.sub, p.marca]
      .filter(Boolean)
      .map((t) => `<span class="tag">${esc(t)}</span>`)
      .join('');

    return `
      <article class="card">
        ${midia}
        <div class="info">
          <span class="cod">Cód. ${esc(cod)}</span>
          <h3>${esc(p.nome)}</h3>
          <div class="row">${tags}</div>
        </div>
      </article>`;
  }

  function renderizarChips() {
    const contagem = {};
    estado.produtos.forEach((p) => { contagem[p.cat] = (contagem[p.cat] || 0) + 1; });

    const botao = (cat, rotulo) =>
      `<button type="button" data-cat="${esc(cat)}" class="${estado.cat === cat ? 'on' : ''}">${esc(rotulo)}</button>`;

    el.chips.innerHTML = botao('', `Todos (${estado.produtos.length})`) +
      unicos(Object.keys(contagem)).map((c) => botao(c, `${c} (${contagem[c]})`)).join('');
  }

  function renderizarSubcategorias() {
    const base = estado.cat ? estado.produtos.filter((p) => p.cat === estado.cat) : estado.produtos;
    const subs = unicos(base.map((p) => p.sub).filter(Boolean));
    if (!subs.includes(estado.sub)) estado.sub = '';

    el.sub.innerHTML = '<option value="">Todas as subcategorias</option>' +
      subs.map((s) => `<option value="${esc(s)}"${s === estado.sub ? ' selected' : ''}>${esc(s)}</option>`).join('');
  }

  function renderizarLista() {
    const lista = filtrar();
    const visiveis = lista.slice(0, estado.limite);

    el.saida.className = estado.visao === 'l' ? 'list' : '';
    el.saida.innerHTML = visiveis.length
      ? `<div class="grid">${visiveis.map(cardHTML).join('')}</div>`
      : '<p class="mt">Nenhum produto encontrado.</p>';

    el.contagem.textContent = `${lista.length} produto(s) encontrado(s)`;
    el.mais.hidden = lista.length <= estado.limite;
  }

  function renderizarTudo() {
    renderizarChips();
    renderizarSubcategorias();
    renderizarLista();
  }


  /* ========================================================================
     6. Eventos do catálogo
     ======================================================================== */
  function filtroMudou() {
    estado.limite = POR_PAGINA;
    renderizarLista();
  }

  let temporizadorBusca;
  el.busca.addEventListener('input', () => {
    clearTimeout(temporizadorBusca);
    temporizadorBusca = setTimeout(() => { estado.busca = el.busca.value; filtroMudou(); }, 150);
  });

  el.chips.addEventListener('click', (ev) => {
    const botao = ev.target.closest('button[data-cat]');
    if (!botao) return;
    estado.cat = botao.dataset.cat;
    estado.sub = '';
    estado.limite = POR_PAGINA;
    renderizarTudo();
  });

  el.catalogo.addEventListener('change', () => { estado.catalogo = el.catalogo.value; filtroMudou(); });
  el.sub.addEventListener('change',      () => { estado.sub = el.sub.value;           filtroMudou(); });
  el.ordem.addEventListener('change',    () => { estado.ordem = el.ordem.value;       filtroMudou(); });
  el.visao.addEventListener('change',    () => { estado.visao = el.visao.value;       renderizarLista(); });

  el.mais.addEventListener('click', () => {
    estado.limite += POR_PAGINA;
    renderizarLista();
  });


  /* ========================================================================
     7. Painel administrativo
     ======================================================================== */
  let abaAtual = 'produtos';
  let editando = null;          // código do produto em edição (null = novo)
  let buscaAdmin = '';

  let codigoGerado = null;      // código de recuperação recém-gerado (aba Usuários)

  const ABAS = [['produtos', 'Produtos'], ['categorias', 'Categorias'], ['usuarios', 'Usuários'], ['dados', 'Dados']];
  const LIMITE_ADMIN = 40;

  const ehAdmin = () => { const u = Auth.sessao(); return !!u && u.papel === 'admin'; };

  function abrirAdmin() {
    if (!ehAdmin()) return;
    el.painel.hidden = false;
    document.body.style.overflow = 'hidden';
    renderizarAdmin();
  }

  function fecharAdmin() {
    el.painel.hidden = true;
    document.body.style.overflow = '';
    editando = null;
    buscaAdmin = '';
    codigoGerado = null;
  }

  function aposAlterar(mensagem) {
    salvarProdutos();
    renderizarTudo();
    renderizarAdmin();
    if (mensagem) aviso(mensagem);
  }

  function renderizarAdmin() {
    const corpo = { produtos: abaProdutos, categorias: abaCategorias, usuarios: abaUsuarios, dados: abaDados }[abaAtual]();

    el.painel.innerHTML = `
      <div class="in">
        <div class="adm-topo">
          <h1>Administração</h1>
          <button type="button" class="s" data-acao="fechar">Fechar ✕</button>
        </div>
        <div class="tabs">
          ${ABAS.map(([id, nome]) =>
            `<button type="button" data-aba="${id}" class="${id === abaAtual ? 'on' : ''}">${nome}</button>`).join('')}
        </div>
        ${corpo}
      </div>`;
  }

  /* ---------- Aba: Produtos ---------- */
  function abaProdutos() {
    const atual = editando !== null ? estado.produtos.find((p) => String(p.cod) === editando) : null;
    const v = atual || { cod: '', nome: '', cat: '', sub: '', marca: '' };

    const termos = norm(buscaAdmin).split(/\s+/).filter(Boolean);
    const achados = estado.produtos
      .filter((p) => !termos.length || termos.every((t) => norm(`${p.cod} ${p.nome} ${p.marca}`).includes(t)))
      .sort(comparadores.n);

    const linhas = achados.slice(0, LIMITE_ADMIN).map((p) => `
      <div class="it">
        <div>
          <strong>${esc(p.nome)}</strong><br>
          <small>Cód. ${esc(p.cod)} · ${esc(p.cat)}${p.sub ? ' › ' + esc(p.sub) : ''}${p.marca ? ' · ' + esc(p.marca) : ''}</small>
        </div>
        <div class="row">
          <button type="button" class="s" data-editar="${esc(p.cod)}">Editar</button>
          <button type="button" class="s d" data-excluir="${esc(p.cod)}">Excluir</button>
        </div>
      </div>`).join('');

    const rodape = achados.length > LIMITE_ADMIN
      ? `<p class="mt">Mostrando ${LIMITE_ADMIN} de ${achados.length}. Use a busca para refinar.</p>` : '';

    const opcoes = (lista) => lista.map((x) => `<option value="${esc(x)}">`).join('');

    return `
      <div class="pn">
        <h2>${atual ? 'Editar produto' : 'Novo produto'}</h2>
        <form id="form-produto" autocomplete="off">
          <div class="f">
            <div><label for="f-cod">Código *</label><input id="f-cod" value="${esc(v.cod)}" required></div>
            <div><label for="f-nome">Nome *</label><input id="f-nome" value="${esc(v.nome)}" required></div>
            <div><label for="f-cat">Categoria *</label><input id="f-cat" list="dl-cat" value="${esc(v.cat)}" required></div>
            <div><label for="f-sub">Subcategoria</label><input id="f-sub" list="dl-sub" value="${esc(v.sub)}"></div>
            <div><label for="f-marca">Marca</label><input id="f-marca" value="${esc(v.marca)}"></div>
          </div>
          <datalist id="dl-cat">${opcoes(unicos(estado.produtos.map((p) => p.cat)))}</datalist>
          <datalist id="dl-sub">${opcoes(unicos(estado.produtos.map((p) => p.sub).filter(Boolean)))}</datalist>
          <div class="row">
            <button type="submit" class="p">${atual ? 'Salvar alterações' : 'Adicionar produto'}</button>
            ${atual ? '<button type="button" data-acao="cancelar">Cancelar</button>' : ''}
          </div>
        </form>
      </div>

      <div class="pn">
        <h2>Produtos (${estado.produtos.length})</h2>
        <div class="f"><input id="busca-admin" type="search" placeholder="Buscar produto…" value="${esc(buscaAdmin)}"></div>
        ${linhas || '<p class="mt">Nenhum produto encontrado.</p>'}
        ${rodape}
      </div>`;
  }

  function salvarFormulario() {
    const novo = {
      cod:   $('#f-cod').value.trim(),
      nome:  $('#f-nome').value.trim(),
      cat:   $('#f-cat').value.trim(),
      sub:   $('#f-sub').value.trim(),
      marca: $('#f-marca').value.trim()
    };
    if (!novo.cod || !novo.nome || !novo.cat) return aviso('Preencha código, nome e categoria.');

    const repetido = estado.produtos.some((p) => String(p.cod) === novo.cod && String(p.cod) !== editando);
    if (repetido) return aviso(`Já existe um produto com o código ${novo.cod}.`);

    if (editando !== null) {
      const i = estado.produtos.findIndex((p) => String(p.cod) === editando);
      estado.produtos[i] = novo;
    } else {
      estado.produtos.push(novo);
    }
    const mensagem = editando !== null ? 'Produto atualizado.' : 'Produto adicionado.';
    editando = null;
    aposAlterar(mensagem);
  }

  function excluirProduto(cod) {
    const p = estado.produtos.find((x) => String(x.cod) === cod);
    if (!p || !confirm(`Excluir "${p.nome}"?`)) return;
    estado.produtos = estado.produtos.filter((x) => String(x.cod) !== cod);
    if (editando === cod) editando = null;
    aposAlterar('Produto excluído.');
  }

  /* ---------- Aba: Categorias ---------- */
  function abaCategorias() {
    const cats = unicos(estado.produtos.map((p) => p.cat));

    const paineis = cats.map((cat) => {
      const doGrupo = estado.produtos.filter((p) => p.cat === cat);
      const subs = unicos(doGrupo.map((p) => p.sub).filter(Boolean));

      const linhaSub = subs.map((s) => `
        <div class="it">
          <div>${esc(s)} <small>(${doGrupo.filter((p) => p.sub === s).length})</small></div>
          <div class="row">
            <input data-novo-sub="${esc(s)}" data-de-cat="${esc(cat)}" value="${esc(s)}" aria-label="Renomear subcategoria ${esc(s)}">
            <button type="button" class="s" data-renomear-sub="${esc(s)}" data-de-cat="${esc(cat)}">Renomear</button>
          </div>
        </div>`).join('');

      return `
        <div class="pn">
          <h2>${esc(cat)} <small class="mt">(${doGrupo.length})</small></h2>
          <div class="it">
            <div>Nome da categoria</div>
            <div class="row">
              <input data-novo-cat="${esc(cat)}" value="${esc(cat)}" aria-label="Renomear categoria ${esc(cat)}">
              <button type="button" class="s p" data-renomear-cat="${esc(cat)}">Renomear</button>
            </div>
          </div>
          ${linhaSub}
        </div>`;
    }).join('');

    return paineis || '<div class="pn"><p>Nenhuma categoria cadastrada.</p></div>';
  }

  function renomearCategoria(antigo) {
    const novo = $(`[data-novo-cat="${CSS.escape(antigo)}"]`).value.trim();
    if (!novo || novo === antigo) return;
    estado.produtos.forEach((p) => { if (p.cat === antigo) p.cat = novo; });
    if (estado.cat === antigo) estado.cat = novo;
    aposAlterar('Categoria renomeada.');
  }

  function renomearSubcategoria(antigo, cat) {
    const campo = [...el.painel.querySelectorAll('[data-novo-sub]')]
      .find((i) => i.dataset.novoSub === antigo && i.dataset.deCat === cat);
    const novo = campo ? campo.value.trim() : '';
    if (!novo || novo === antigo) return;
    estado.produtos.forEach((p) => { if (p.cat === cat && p.sub === antigo) p.sub = novo; });
    if (estado.sub === antigo) estado.sub = novo;
    aposAlterar('Subcategoria renomeada.');
  }

  /* ---------- Aba: Usuários ---------- */
  function abaUsuarios() {
    let lista;
    try { lista = Auth.listarUsuarios(); }
    catch { return '<div class="pn"><p>Sem permissão para ver os usuários.</p></div>'; }

    const eu = Auth.sessao();
    const papeis = { admin: 'Administrador', cliente: 'Cliente' };

    const linhas = lista.map((u) => `
      <div class="it">
        <div>
          <strong>${esc(u.nome)}</strong> <span class="tag">${papeis[u.papel] || esc(u.papel)}</span><br>
          <small>${esc(u.email)} · desde ${new Date(u.criadoEm).toLocaleDateString('pt-BR')}</small>
        </div>
        <div class="row">
          <button type="button" class="s" data-gerar-codigo="${esc(u.id)}">Novo código</button>
          ${u.id !== eu.id ? `<button type="button" class="s d" data-excluir-usuario="${esc(u.id)}">Excluir</button>` : ''}
        </div>
      </div>`).join('');

    const caixa = codigoGerado ? `
      <div class="pn">
        <h2>Código gerado para ${esc(codigoGerado.nome)}</h2>
        <p>Entregue este código à pessoa. Ele aparece só agora e permite redefinir a senha em <strong>Esqueci minha senha</strong>. O código anterior deixou de valer.</p>
        <div class="codigo">${esc(codigoGerado.codigo)}</div>
      </div>` : '';

    return `
      ${caixa}
      <div class="pn">
        <h2>Usuários (${lista.length})</h2>
        <p>Contas cadastradas neste aparelho. Use <em>Novo código</em> quando alguém perder o código de recuperação.</p>
        ${linhas}
      </div>`;
  }

  async function gerarCodigoUsuario(id) {
    try {
      const { usuario, codigo } = await Auth.gerarNovoCodigo(id);
      codigoGerado = { nome: usuario.nome, codigo };
      renderizarAdmin();
      el.painel.scrollTo(0, 0);
    } catch (e) {
      aviso(e.message || 'Não foi possível gerar o código.');
    }
  }

  function excluirUsuario(id) {
    if (!confirm('Excluir este usuário? Ele perderá o acesso.')) return;
    try {
      Auth.excluirUsuario(id);
      codigoGerado = null;
      renderizarAdmin();
      aviso('Usuário excluído.');
    } catch (e) {
      aviso(e.message || 'Não foi possível excluir.');
    }
  }

  /* ---------- Aba: Dados ---------- */
  function abaDados() {
    return `
      <div class="pn">
        <h2>Backup e restauração</h2>
        <p>As alterações ficam salvas neste navegador. Exporte um backup para guardar ou levar para outro aparelho.</p>
        <div class="row">
          <button type="button" class="p" data-acao="exportar">Exportar JSON</button>
          <button type="button" data-acao="importar">Importar JSON</button>
          <button type="button" class="d" data-acao="restaurar">Restaurar dados originais</button>
        </div>
        <input id="arquivo" type="file" accept="application/json,.json" hidden>
      </div>`;
  }

  function exportarJSON() {
    const blob = new Blob([JSON.stringify(estado.produtos, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'toplim-produtos.json';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function importarJSON(arquivo) {
    const leitor = new FileReader();
    leitor.onload = () => {
      try {
        const lista = JSON.parse(leitor.result);
        if (!Array.isArray(lista) || !lista.length || !lista.every(produtoValido)) throw new Error('formato');
        estado.produtos = lista.map((p) => ({
          cod: String(p.cod), nome: p.nome, cat: p.cat, sub: p.sub || '', marca: p.marca || ''
        }));
        aposAlterar(`${lista.length} produtos importados.`);
      } catch {
        aviso('Arquivo inválido. Use um JSON exportado por este painel.');
      }
    };
    leitor.readAsText(arquivo);
  }

  function restaurarOriginais() {
    if (!confirm('Descartar todas as alterações e voltar aos dados originais?')) return;
    armazenar.apagar(CHAVE_DADOS);
    estado.produtos = copiaOriginal();
    estado.cat = '';
    estado.sub = '';
    aposAlterar('Dados originais restaurados.');
  }

  /* ---------- Eventos do painel (delegação) ---------- */
  el.painel.addEventListener('click', (ev) => {
    const alvo = ev.target.closest('button');
    if (!alvo) return;
    const d = alvo.dataset;

    if (d.aba)             { abaAtual = d.aba; editando = null; codigoGerado = null; return renderizarAdmin(); }
    if (d.gerarCodigo)     return gerarCodigoUsuario(d.gerarCodigo);
    if (d.excluirUsuario)  return excluirUsuario(d.excluirUsuario);
    if (d.editar)          { editando = d.editar; renderizarAdmin(); return el.painel.scrollTo(0, 0); }
    if (d.excluir)         return excluirProduto(d.excluir);
    if (d.renomearCat)     return renomearCategoria(d.renomearCat);
    if (d.renomearSub)     return renomearSubcategoria(d.renomearSub, d.deCat);

    switch (d.acao) {
      case 'fechar':    return fecharAdmin();
      case 'cancelar':  editando = null; return renderizarAdmin();
      case 'exportar':  return exportarJSON();
      case 'importar':  return $('#arquivo').click();
      case 'restaurar': return restaurarOriginais();
    }
  });

  el.painel.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (ev.target.id === 'form-produto') salvarFormulario();
  });

  el.painel.addEventListener('input', (ev) => {
    if (ev.target.id !== 'busca-admin') return;
    buscaAdmin = ev.target.value;
    const posicao = ev.target.selectionStart;
    renderizarAdmin();
    const campo = $('#busca-admin');
    campo.focus();
    campo.setSelectionRange(posicao, posicao);
  });

  el.painel.addEventListener('change', (ev) => {
    if (ev.target.id === 'arquivo' && ev.target.files[0]) importarJSON(ev.target.files[0]);
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !el.painel.hidden) fecharAdmin();
  });

  el.admin.addEventListener('click', abrirAdmin);


  /* ========================================================================
     8. Tema, PDF e inicialização
     ======================================================================== */
  const raiz = document.documentElement;
  const temaDoSistema = () => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  el.tema.addEventListener('click', () => {
    const novo = raiz.dataset.theme === 'dark' ? 'light' : 'dark';
    raiz.dataset.theme = novo;
    armazenar.gravar(CHAVE_TEMA, novo);
  });

  /* PDF: mostra todos os produtos filtrados, espera as fotos e abre a impressão */
  let limiteAntesDeImprimir = POR_PAGINA;

  function prepararImpressao() {
    if (estado.imprimindo) return;
    estado.imprimindo = true;
    limiteAntesDeImprimir = estado.limite;
    estado.limite = Infinity;
    renderizarLista();
  }

  function encerrarImpressao() {
    if (!estado.imprimindo) return;
    estado.imprimindo = false;
    estado.limite = limiteAntesDeImprimir;
    renderizarLista();
  }

  el.pdf.addEventListener('click', async () => {
    prepararImpressao();
    await Promise.all([...el.saida.querySelectorAll('img')].map((i) => i.decode().catch(() => {})));
    window.print();
  });

  window.addEventListener('beforeprint', prepararImpressao);
  window.addEventListener('afterprint', encerrarImpressao);

  function iniciar() {
    raiz.dataset.theme = armazenar.ler(CHAVE_TEMA) || temaDoSistema();

    el.catalogo.innerHTML = CATALOGOS
      .map(([valor, rotulo]) => `<option value="${valor}">${rotulo}</option>`).join('');

    el.admin.hidden = !ehAdmin();      // só administradores veem o painel
    renderizarTudo();
  }

  iniciar();
})();
