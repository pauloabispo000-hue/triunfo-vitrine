# Ativação do backend centralizado — Triunfo

## Estado atual
A interface pública em GitHub Pages continua operando como **protótipo local**. O backend em `server.js` e o esquema PostgreSQL foram adicionados ao repositório, mas **não estão hospedados nem conectados à interface**. Nenhum pagamento deve ser considerado validado pelo aplicativo atual.

## Requisitos
- Node.js 20+ e PostgreSQL 15+.
- Hospedagem HTTPS persistente para Node.js (não GitHub Pages).
- Banco PostgreSQL privado e armazenamento persistente protegido para `RECEIPT_DIR`.
- Domínio de API com HTTPS; preferir subdomínio sob o mesmo domínio da interface para minimizar restrições de cookies. GitHub Pages em `github.io` pode exigir tratamento específico de cookies de terceiros.
- Variáveis de ambiente no provedor, nunca em arquivos publicados:
  - `DATABASE_URL`
  - `SESSION_SECRET` (32+ caracteres aleatórios)
  - `APP_ORIGIN=https://pauloabispo000-hue.github.io`
  - `NODE_ENV=production`
  - `RECEIPT_DIR=/caminho/privado/persistente`
  - `PGSSL=disable` **somente** em rede interna com transporte seguro; fora disso, configurar TLS válido.

## Implantação
1. Provisionar PostgreSQL, aplicar `database/schema.sql`.
2. Provisionar Node.js, configurar as variáveis e executar `npm install && npm start`.
3. Criar o primeiro administrador **por processo privado e auditável no banco**: cadastrar um usuário normalmente e promover sua função somente com acesso restrito ao banco. Não existe rota pública de criação de administrador.
4. Definir domínio da API e testar autenticação/sessões entre a origem do GitHub Pages e a API.
5. **Migrar o frontend** de `localStorage` para endpoints autenticados. Até essa migração, o site público não usa o banco compartilhado.
6. Habilitar backups, alertas, retenção/remoção de comprovantes e revisão de permissões antes de vendas reais.
7. Testar envio de comprovante legível, ilegível, duplicado, adulterado e com valor inferior/superior; conferir o status no painel.

## Fluxo Pix sem integração
O administrador cadastra a chave Pix. O cliente efetua o pagamento externamente e envia o comprovante (JPEG, PNG ou WebP, até 5 MB). O backend salva o arquivo em diretório privado, extrai texto com OCR e tenta identificar o valor. Se identificar um valor único, compara-o com o pedido.

Estados: `awaiting_receipt`, `amount_matches`, `amount_pending`, `manual_review`, `confirmed`. O OCR **não comprova que a transferência foi efetivada**: somente o administrador pode confirmar o recebimento, após verificar a conta bancária. Comprovantes complementares em imagens são somados para calcular o saldo pendente. PDF ainda exige desenvolvimento adicional. Se o total exceder o pedido ou houver leitura inconclusiva, o pedido segue para análise manual.

## Segurança e privacidade
- Não publicar recibos ou fotos pessoais no repositório ou em URLs públicas.
- Proteger os arquivos por autenticação e autorização; o servidor atual **ainda não possui rota de consulta/download** de comprovantes.
- A API bloqueia reenvio de arquivos idênticos pelo SHA-256; comprovantes visualmente alterados ou diferentes para a mesma transação ainda exigem análise e controles adicionais.
- Configurar política LGPD, consentimento, retenção, exclusão e auditoria.
- A implementação atual de eventos envia aviso periódico de atualização a cada 5 segundos; **a interface ainda não consome esses eventos**.
- Antes da produção: reforçar CSRF protection (a API já exige Origin para operações de escrita), proteção de upload e rate limiting adicional, testes automatizados, monitoramento e validação das configurações de TLS/cookies.

## Endpoints disponíveis no código
`GET /api/health`, `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`, `GET /api/products`, `GET /api/admin/products`, `POST /api/admin/products`, `PATCH /api/admin/products/:id`, `POST /api/votes`, `GET /api/admin/summary`, `GET /api/settings/pix`, `PUT /api/admin/settings/pix`, `POST /api/orders`, `GET /api/orders`, `POST /api/orders/:id/receipts`, `POST /api/admin/orders/:id/confirm`, `GET /api/events`.

**Atenção:** este é um backend inicial, não uma implantação pronta para vendas reais.
