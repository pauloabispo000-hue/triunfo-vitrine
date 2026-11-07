# Triunfo — Vitrine de sobremesas

Protótipo web responsivo (HTML/CSS/JavaScript), inspirado em padrões de navegação de marketplaces e com identidade visual própria Triunfo. Inclui logo fornecido pelo proprietário.

## Executar

Abra `index.html` em um navegador ou sirva a pasta com `python -m http.server 8000` e acesse `http://localhost:8000`.

## Fluxos demonstráveis

- Vitrine, busca, carrinho, quantidades, checkout com chave Pix e anexo de comprovante (imagem até 2 MB).
- Cadastro e login fictícios, tela de recuperação por e-mail (captura de endereço apenas), histórico de pedidos.
- Sugestões com foto, moderação pelo administrador, votação única por usuário demonstrativo, aprovação por pelo menos 50% dos votos após mínimo configurável, análise de viabilidade, produção e publicação.
- Área administrativa para produtos, sugestões, etapas, comprovantes e configuração Pix.
- Login apenas para demonstração: e-mail `admin@triunfo.local`, senha `admin123`. Usuários comuns criam conta com e-mail e senha.

## AVISO: NÃO PUBLICAR PARA CLIENTES COMO ESTÁ

O protótipo usa `localStorage`, não tem autenticação segura, não valida CPF, não recupera senhas, não sincroniza dispositivos e não confirma pagamentos automaticamente. Os dados do navegador podem ser adulterados. Não cadastre CPF real, senha real, chave Pix real ou comprovante verdadeiro neste protótipo.

### Produção — requisitos antes de lançar

1. Backend autenticado, senhas com hash Argon2id e sessão segura; nunca usar CPF como segredo nem armazenar senhas no navegador.
2. Atribuir papel `admin` somente pelo servidor; políticas de acesso (RLS), auditoria e limitação de tentativas.
3. Cadastro CPF com validação de dígitos e e-mail verificado com recuperação por link/token de curta duração.
4. Armazenamento privado de imagens e comprovantes, URLs assinadas, varredura de arquivos e retenção compatível com LGPD.
5. Voto único com restrição de banco `UNIQUE(user_id, product_id)` e apuração transacional; 50% de votos positivos sobre válidos, com quórum mínimo.
6. Pix: gerar código copia e cola EMV válido com valor e identificador únicos por pedido, por PSP autorizado. Não marcar pagamento como quitado por OCR ou envio de comprovante. Verificar recebimento por extrato/PSP ou conferência humana autenticada.
7. OCR apenas sugere valor; divergência deve considerar créditos efetivamente confirmados.
8. Registrar pedidos com itens, quantidades, preços congelados, histórico de estados, comprovantes e datas, sem expor dados de outros clientes.
9. Segurança: HTTPS, CSRF/CSP, sanitização, backups, testes e monitoramento.
10. Publicar somente após testes ponta a ponta, política de privacidade, termos e adequação à LGPD.

GitHub Pages pode hospedar somente a demonstração estática, não um sistema de vendas real.

## Backend de autenticação (novo)

A autenticação usa Node.js/Express, PostgreSQL, bcrypt e sessões persistidas no banco. O navegador nunca escolhe o papel do usuário: o servidor consulta `users.role` em cada requisição protegida. O cadastro público sempre cria contas `customer`.

### Configuração de implantação

1. Disponibilize Node.js 20+ e PostgreSQL gerenciado.
2. Execute `database/schema.sql` no banco.
3. Configure as variáveis de ambiente a partir de `.env.example`. Gere segredos longos e aleatórios para `SESSION_SECRET` e `ADMIN_BOOTSTRAP_TOKEN`; não os coloque no GitHub.
4. Configure `DATABASE_URL`, `APP_ORIGIN` com a origem HTTPS do app e `NODE_ENV=production`.
5. Execute `npm install` e `npm start`.
6. Publique o frontend e a API na mesma origem HTTPS (ou configure CORS para a origem exata). A sessão usa cookie HttpOnly/Secure em produção.
7. Crie a conta do proprietário pelo formulário de cadastro. Promova somente esse e-mail a administrador usando o token secreto do servidor:
`curl -X POST https://SEU-DOMINIO/api/internal/bootstrap-admin -H "Content-Type: application/json" -H "x-bootstrap-token: SEU_TOKEN" -d '{"email":"SEU_EMAIL"}'`
8. Apague/rotacione o token de bootstrap após promover o administrador.

### Rotas

- `POST /api/auth/register` — cria conta comum; senha mínima de 10 caracteres e hash bcrypt.
- `POST /api/auth/login` — autentica e cria sessão HttpOnly.
- `GET /api/auth/me` — retorna usuário autenticado e papel confirmado no banco.
- `POST /api/auth/logout` — encerra sessão.
- `GET /api/admin/session-check` — exemplo de rota exclusiva para administrador.
- `POST /api/internal/bootstrap-admin` — promoção inicial protegida por segredo de ambiente.

### Limites atuais

Esta entrega protege cadastro, login, sessão e verificação de papel. Ainda não migra produtos, votos, carrinho, sugestões, pedidos, comprovantes ou configurações Pix para PostgreSQL; esses fluxos permanecem demonstrativos no navegador e não devem ser usados com dados reais. Recuperação de senha e verificação de e-mail também precisam de provedor de e-mail e fluxo de tokens antes do lançamento público. Configure HTTPS, backups, monitoramento e política de privacidade antes de produção.
