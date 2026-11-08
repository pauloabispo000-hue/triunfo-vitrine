# Triunfo no Supabase Free — preparação e estado real

## Situação em 08/11/2026

A organização Triunfo aparece no plano Free e com **zero projetos**. O formulário
do projeto triunfo-vitrine está preenchido, mas a senha do banco ainda não foi
definida e o projeto não foi criado. Portanto, nenhuma tabela, política ou função
deste pacote foi aplicada ao Supabase hospedado.

O aplicativo público permanece em
https://pauloabispo000-hue.github.io/triunfo-vitrine/.
index.html, app.js, style.css e as imagens não foram alterados por este pacote.
O site ainda usa armazenamento local e não deve ser anunciado como sistema
centralizado ou de confirmação de pagamentos.

## O que este pacote prepara

- Migração transacional e aditiva em supabase/migrations/202611080001_triunfo.sql.
- Dez tabelas públicas com RLS: triunfo_profiles, triunfo_products,
  triunfo_votes, triunfo_suggestions, triunfo_cart_items, triunfo_orders,
  triunfo_order_items, triunfo_receipts, triunfo_settings e triunfo_audit_events.
- Membros administrativos em triunfo_private.admins, fora do esquema da API.
- Perfis vinculados a auth.users. Não há tabela própria de senhas.
- Preços inteiros em centavos; pedidos calculados pelo banco, reservas de estoque
  sob locks ordenados e chave de idempotência para reenvio da mesma compra.
- A reserva de estoque ocorre na criação do pedido, antes da exibição do Pix.
  Cancelamentos permitidos devolvem a reserva uma única vez. Pedidos com arquivo
  enviado dependem de cancelamento administrativo; não há expiração automática.
- Produtos são arquivados, sem destruir o histórico de pedidos.
- Voto único pela chave composta usuário/produto; totais sem expor identidades.
- Revisão de sugestões transacional e trilha de operações administrativas.
- Bucket privado triunfo-receipts; leitura pelo proprietário ou administrador.
  Upload direto pelo navegador é negado: a Edge Function valida usuário,
  propriedade do pedido, limite de 5 MB, MIME/assinatura e calcula SHA-256.
- Hash único global e identificador de transação único quando extraído/conferido.
  Alterar a imagem muda o hash: a conferência bancária continua obrigatória.
- Limite de dez arquivos por pedido e cinquenta por usuário em 24 horas.
- Camada de transporte supabase-api.mjs para Auth, produtos, votos, sugestões,
  carrinho, pedidos, arquivos privados, operações administrativas e Realtime.
  **Ainda não conectada à interface existente.**

## Inspeção e incompatibilidades do backend anterior

server.js usa Express, sessões em cookies e connect-pg-simple, bcrypt,
multer, diretório persistente e Tesseract no Node.js. Supabase não executa esse
servidor persistente diretamente e GitHub Pages serve somente conteúdo estático.
Não basta trocar DATABASE_URL.

database/schema.sql referencia public.users e password_hash. Não deve ser usado
para esta implantação Auth. O novo esquema usa nomes distintos e não altera ou
apaga as tabelas anteriores.

app.js contém contas, permissões, produtos, estoque, votos, carrinhos e
comprovantes locais. Suas verificações de administrador não são segurança de
servidor e não podem autorizar acessos no Supabase. O adaptador deverá substituir
esses manipuladores e impedir fallback local em caso de falha do serviço.
BACKEND-ATIVACAO.md descreve a opção anterior com hospedagem Node.js.

## Etapas de ativação — sem contratação

1. Na aba Supabase, o titular define a senha do banco e conclui Create new project,
   mantendo a organização Free. Não enviar a senha pelo chat nem ao repositório.
2. Inspecionar schemas, políticas, buckets e dados reais antes de executar a
   migração. Este arquivo é de execução única e aborta transacionalmente em caso
   de conflito; não usa DROP nem redefine tabelas legadas.
3. Aplicar a migração e verificar os grants, políticas e bucket no ambiente real.
4. Configurar Auth Site URL e redirecionamento permitido para o endereço público
   atual. Manter confirmação de e-mail; verificar os limites do serviço de
   envio padrão antes de liberar cadastro ao público. Não contratar SMTP.
5. Cadastrar a conta do titular pelo Auth. Promover SOMENTE o UUID verificado
   dessa conta por operação privada no SQL Editor, nunca por metadados enviados
   pelo cliente. Registrar a concessão em triunfo_audit_events.
   Não copiar a senha Admin local nem promover uma conta só pelo nome exibido.
6. Implantar submit-receipt. SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são
   variáveis internas da função. A validação JWT é feita por Auth.getUser no
   handler mesmo com verify_jwt=false no gateway. Não expor service_role no Pages.
7. Configurar o SDK do navegador somente com URL e chave publishable/anon.
   Integrar os manipuladores existentes com supabase-api.mjs, mantendo CSS,
   imagens, rotas e o endereço atual. Não importar contas, pedidos ou recibos
   locais automaticamente; dados de protótipo podem ser fictícios e privados.
8. Implementar e testar OCR confiável gratuito antes de ativar sua classificação
   automática. O upload atualmente retorna ocr_status=pending: não simula OCR.
   A leitura manual administrativa permite registrar valores provisórios.
9. Reexecutar os testes abaixo no projeto hospedado com duas contas de teste
   autorizadas, depois testar duas sessões independentes e a interface mobile
   e desktop. Publicar a integração somente após esses testes passarem.

## Pix e OCR

Não há Mercado Pago ou outro intermediador. O administrador informa a chave Pix.
O banco calcula o pedido e o cliente paga externamente.

Os RPCs preparam a soma de comprovantes complementares e os estados:

| Estado | Mensagem na interface |
| --- | --- |
| awaiting_receipt | Aguardando comprovante |
| under_review | Comprovante recebido — aguardando leitura |
| amount_pending | Valor inferior — mostrar saldo pendente |
| amount_matches | Valor compatível — aguardando confirmação |
| manual_review | Leitura inconclusiva ou divergência — análise administrativa |
| confirmed | Recebimento bancário confirmado pelo administrador |
| cancelled | Pedido cancelado |

O RPC triunfo_record_receipt_reading só pode ser chamado pelo serviço confiável.
Um trabalhador OCR ainda precisa ser implementado e validado. O Tesseract do
backend Node.js não foi transplantado para Edge Functions: há limites de CPU,
memória e duração e ainda não foi demonstrado que funciona ali no plano Free.
Nenhum serviço OCR pago foi configurado. Até essa validação, todos os uploads
exigem leitura manual; não existe alegação de reconhecimento automático.

O administrador pode corrigir a leitura de um recibo e informar seu identificador
de transação via triunfo_admin_read_receipt. A confirmação exige valor exato e
confirmação explícita da conferência bancária via triunfo_confirm_payment.

## Validação executada e pendente

Testes executados com PostgreSQL/WASM PGlite e schemas Auth/Storage simulados,
mais testes do handler com clientes de serviço simulados. São verificações
locais; não são testes dos serviços hospedados.

Cobertura local: RLS, isolamento, impedimento de autopromoção, voto único,
preços do servidor, checkout idempotente, quantidades inválidas, estoque
insuficiente, cancelamento único, restrição de arquivos, SHA-256, duplicação,
valor inferior, complemento exato, leitura nula, excedente e confirmação
administrativa auditada.

Pendente no ambiente real: cadastro/login de duas contas, envio de e-mail,
promoção do titular, Storage real, deploy Deno, Realtime entre dispositivos,
concorrência entre conexões reais, OCR em documentos, interface completa e
ativação pública.

Para repetir os testes locais: Node 22+, npm install --ignore-scripts e
npm run test:supabase. A validação usa @electric-sql/pglite 0.5.15.

## Custos e limites verificados

Nenhum upgrade, assinatura ou cobrança autorizado. Organização Free: US$ 0/mês.
Referência consultada em 08/11/2026: https://supabase.com/pricing.

- 500 MB de banco, 1 GB de arquivos e 50.000 usuários ativos mensais.
- 5 GB de tráfego de saída e 5 GB de saída em cache.
- 200 conexões Realtime simultâneas e 2 milhões de mensagens/mês.
- 500.000 invocações Edge Functions incluídas.
- Até dois projetos ativos; projetos gratuitos podem pausar após uma semana
  sem atividade. Não há SLA gratuito nem backups diários gerenciados incluídos.

Ao atingir limites, interromper novas operações afetadas ou solicitar decisão
do titular; não contratar upgrade automaticamente. Recibos e fotos ocupam cota;
definir retenção e exportação privada antes do uso comercial.

## Reversão

Este pacote adiciona arquivos e não ativa a integração no site. Sua reversão
no GitHub não exige apagar dados. Após a aplicação do banco, manter as tabelas
e desativar apenas a integração em caso de problema; qualquer exclusão de dados
dependerá de autorização explícita e cópia privada.
