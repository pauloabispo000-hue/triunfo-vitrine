# Triunfo — Vitrine de sobremesas

Aplicativo web estático em HTML, CSS e JavaScript. Não exige Node.js, servidor ou banco de dados para abrir a vitrine de demonstração.

## Publicação no GitHub Pages

Em **Settings → Pages → Build and deployment**, selecione **Deploy from a branch**, escolha **main** e **/(root)** e clique em **Save**. URL esperada: `https://pauloabispo000-hue.github.io/triunfo-vitrine/`.

## Executar localmente

Abra `index.html` no navegador.

## Login demonstrativo

Crie uma conta com e-mail e senha. Para testar administração, registre `admin@triunfo.local`. Isso concede papel administrativo apenas localmente e é inseguro.

## Limitações

Esta versão é estática. Contas, senhas, produtos, votos, carrinho, pedidos e configurações ficam no navegador e podem ser lidos, alterados ou apagados pelo usuário. O papel de administrador não é protegido pelo servidor. Não utilize dados pessoais, senhas reutilizadas, chave Pix real ou comprovantes verdadeiros. O envio de comprovante não confirma recebimento de Pix.

Para operação comercial, autenticação segura, administração real, dados compartilhados e pagamentos, será necessário backend ou serviço externo de autenticação e banco. O backend Node/PostgreSQL permanece como base futura, mas não é usado pela versão Pages.
