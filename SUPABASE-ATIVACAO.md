# Triunfo — validação Supabase em 08/11/2026

## Estado real

Projeto `omykabdlwtekyagvxipi`, organização Triunfo, plano Free confirmado no painel. Nenhum upgrade ou serviço pago contratado; nenhum pagamento real solicitado ou realizado.

A loja principal permanece em https://pauloabispo000-hue.github.io/triunfo-vitrine/ com `enabled: false` em `cloud-config.js`, usando o modo local. Somente `validacao.html` usa a integração conectada. Aparência, CSS, logotipo e imagens existentes foram preservados. O catálogo local não foi importado automaticamente.

## Banco e segurança existentes

Dez tabelas públicas preservadas: `triunfo_profiles`, `triunfo_products`, `triunfo_votes`, `triunfo_suggestions`, `triunfo_cart_items`, `triunfo_orders`, `triunfo_order_items`, `triunfo_receipts`, `triunfo_settings`, `triunfo_audit_events`. Todas têm RLS; configuração existente de 15 políticas e seis tabelas Realtime. Administradores ficam em `triunfo_private.admins`. Senhas pertencem ao Supabase Auth.

Preços em centavos e totais calculados no servidor, reserva de estoque com bloqueios, pedidos idempotentes, cancelamento com devolução única e voto único por usuário/produto. Bucket `triunfo-receipts` privado, leitura autorizada ao dono ou administrador. Upload exige Auth e propriedade do pedido, limite de 5 MB, validação estrutural da imagem e SHA-256 global único. Identificador de transação repetido é bloqueado quando registrado; alterar a imagem pode alterar seu hash, portanto a conferência bancária continua obrigatória.

Nenhuma tabela foi recriada. A migração aditiva `202611080003_validation_cleanup.sql` instala somente limpeza restrita a fixtures identificadas, exclusiva do serviço e sem acesso para clientes. Dados anteriores à rodada foram preservados.

## Testes e evidências

Resultado hospedado: **35 aprovados, zero reprovados**. Evidência detalhada: [tests/results/hosted-20261108.json](tests/results/hosted-20261108.json). Resultado local: **36 aprovados** (20 banco, sete handler, sete interface, dois parser OCR), com CI e Pages aprovados nos commits de implementação.

| Cenário | Resultado |
| --- | --- |
| Dois clientes com login e sessões independentes; Realtime | Aprovado em APIs reais; não equivale a dois aparelhos físicos |
| Isolamento de pedidos e documentos, inclusive download | Aprovado |
| Bloqueio de alteração de preço/estoque, autopromoção e confirmação de pagamento por cliente | Aprovado |
| Total no servidor, reserva de estoque e voto único | Aprovado nas verificações hospedadas e/ou locais conforme evidência |
| Upload autenticado, registro no banco e Storage privado, download pelo dono/admin | Aprovado |
| Duplicação no mesmo pedido e entre clientes; transação repetida | Bloqueados |
| Arquivo inválido, PNG truncado, arquivo acima de 5 MB | Bloqueados |
| Valor exato, inferior, complementar, soma exata, excedente e leitura inconclusiva | Aprovado com leituras administrativas fictícias; sem confirmação bancária automática |
| OCR real em imagem privada pela interface | R$ 1,25 sugerido corretamente |
| Layout mobile e desktop | Inspecionado; mobile de 390 px sem transbordamento da página |

As contas fictícias foram criadas pelo serviço administrativo e fizeram login real por senha. Entrega e confirmação de e-mail no cadastro público não foram testadas.

Limpeza concluída: duas contas, dois pedidos, um produto e seus comprovantes/arquivos desta rodada removidos. Consulta final confirmou zero contas/produtos do run, zero comprovantes e arquivos no bucket; bucket continua privado. Produtos arquivados e pedidos cancelados de rodadas anteriores foram preservados. A rotina temporária fica desabilitada para novos testes após a conclusão; limpeza administrativa restrita permanece disponível.

## Correções e arquivos

- `submit-receipt/core.mjs`: validação estrutural e CRC de PNG, verificação de JPEG/WebP, dimensões limitadas e resposta 413 para excesso de tamanho. Função implantada.
- `receipt-ocr.mjs`, `cloud-entry.mjs`: OCR local assistido e importação correta da exportação padrão do Tesseract.
- `validation-tools.mjs`, `supabase/functions/triunfo-validation/`, migração 003: testes isolados e limpeza identificada; senhas geradas somente em memória e dentro do limite de 72 caracteres.
- `scripts/build-site.mjs`, `.github/workflows/pages.yml`, dependências: OCR hospedado no próprio Pages e publicação somente dos arquivos estáticos permitidos.
- `index.html`, `validacao.html`: atualização de cache dos módulos, sem ativar a loja principal.
- Testes do banco, handler, interface e OCR atualizados; evidência e este relatório registrados no repositório.

Commits de implementação: `d7f602effa4323a794a489f58f7ac611ed10da84` e `c6648d2980515caaf1cb4a9f94d76b2f3c07c6ae`. O commit que contém este relatório registra o encerramento e a desativação da rotina temporária.

## Estado do OCR e Pix

Tesseract 6.0.1 executa localmente no navegador do administrador, com worker, núcleo e idioma português hospedados no próprio Pages. A imagem privada é obtida com autorização; não é enviada a serviço OCR externo. Limites: 5 MB, 12 megapixels e 90 segundos. Ensaios locais com imagens fictícias retornaram 125, 50 e 75 centavos; imagem sem valor retornou leitura inconclusiva. O ensaio hospedado em imagem privada sugeriu R$ 1,25.

O OCR apenas preenche uma sugestão. O administrador deve conferir a imagem e registrar a leitura. Não existe OCR automático confiável no envio nem confirmação bancária pela imagem. Estados: inferior mostra saldo; soma exata fica “Valor compatível — aguardando confirmação”; excesso/divergência/leitura inconclusiva exige análise. Confirmação final requer conferência explícita do crédito bancário pelo administrador. Não há Mercado Pago ou intermediador.

## Custos, limites e pendências

Plano confirmado Free, sem contratação. Cotas de referência consultadas em 08/11/2026: 500 MB de banco, 1 GB de Storage, 50 mil usuários ativos mensais, 5 GB de saída e 5 GB em cache, 200 conexões Realtime simultâneas, dois milhões de mensagens/mês e 500 mil invocações Edge. Projetos gratuitos podem pausar por inatividade; não há SLA gratuito. Referência: https://supabase.com/pricing. Acompanhar as cotas no painel; nunca contratar upgrade automaticamente.

Antes da ativação definitiva: aprovar catálogo e estoque compartilhados, cadastrar/conferir a chave Pix pelo administrador, validar cadastro público e limites de e-mail, experimentar documentos representativos e aparelhos reais, definir retenção/exportação privada dos comprovantes e obter aprovação para ativar a loja. Os testes sintéticos não constituem garantia geral de segurança ou autenticidade bancária. OCR automático de servidor continua não implementado.

Para repetir testes locais: Node 22+, `npm install --ignore-scripts`, `npm run test:supabase`. A rotina hospedada de fixtures foi encerrada; não reabilitar sem nova necessidade autorizada. Reversão do frontend pode ser feita por commit sem apagar dados do Supabase.
