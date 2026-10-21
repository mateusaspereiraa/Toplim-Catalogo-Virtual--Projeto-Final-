# Toplim — Catálogo Virtual

Catálogo de produtos com **login, cadastro e recuperação de senha**.
Abra `index.html` (de preferência publicado em https, ex.: Netlify ou GitHub Pages).

## Estrutura

```
index.html          tela de acesso + catálogo (o catálogo só é carregado após o login)
manifest.json       app instalável (PWA)
css/styles.css      todos os estilos (tema claro/escuro, responsivo)
js/auth.js          contas, sessão, hash de senha, código de recuperação
js/login.js         tela de acesso: entrar · criar conta · esqueci minha senha
js/conta.js         botão "Minha conta": alterar senha e sair
js/app.js           catálogo: busca, filtros, cards, painel Administrador, PDF
js/data.js          produtos e lista de fotos
assets/             logos e ícones
img-produtos/       fotos dos produtos: <código>.webp
docs/               material de referência (não é usado pelo site; pode apagar)
```

## Como funciona o acesso

| Ação | Como |
|---|---|
| Criar conta | Aba **Criar conta**: nome, e-mail, senha (mín. 8, letras e números). |
| Entrar | E-mail e senha; "Manter conectado" guarda a sessão por 30 dias. |
| Esqueci minha senha | E-mail + **código de recuperação** + nova senha. |
| Código de recuperação | Gerado no cadastro e mostrado **uma única vez** (copiar ou baixar .txt). Ao usar, um código novo é emitido. |
| Perdi o código | Um administrador gera outro em **Administrador → Usuários → Novo código**. |
| Perfis | O 1º cadastro vira **Administrador**; os demais, **Cliente** (sem acesso ao painel). |
| Segurança básica | Hash PBKDF2-SHA256 com sal; 5 tentativas erradas bloqueiam por 60 s; CSP restritiva. |

## Limite importante

O site é estático (sem servidor), então **as contas ficam guardadas no navegador de cada aparelho**:

- uma conta criada no celular não existe no computador;
- não há envio de e-mail (por isso a recuperação usa o código);
- quem controla o navegador consegue alterar os dados locais, e `js/data.js` é público.

Para contas compartilhadas entre aparelhos, recuperação por e-mail e proteção real do catálogo é preciso um
back-end (servidor ou serviço de autenticação). `js/auth.js` concentra toda a lógica de contas justamente
para ser trocado por um.

## Fotos
Salve como `img-produtos/<código>.webp` e inclua o código em `IMAGENS_DISPONIVEIS` (`js/data.js`).
