# Triunfo — preparação comercial e homologação

O Supabase `omykabdlwtekyagvxipi` permanece no plano Free. Custo adicional desta etapa: US$ 0. Nenhum pagamento real, nova contratação, exclusão de dados legítimos ou recriação de tabelas. A [loja principal](https://pauloabispo000-hue.github.io/triunfo-vitrine/) conserva o endereço, o modo local e `enabled: false`. O trabalho de interface afeta a [página de validação](https://pauloabispo000-hue.github.io/triunfo-vitrine/validacao.html).

## Catálogo

| Produto | Evidência no protótipo | Registro compartilhado | A confirmar |
| --- | --- | --- | --- |
| Mousse de maracujá — 110 g | Mousse em votação na sessão inspecionada; R$ 12 no catálogo inicial do código | Arquivado, estoque 0, sem preço comercial | Preço, composição, estoque e foto do pote plástico de 110 g |
| Mousse de chocolate — 110 g | Mousse em votação na sessão inspecionada; R$ 12 no catálogo inicial do código | Arquivado, estoque 0, sem preço comercial | Preço, composição, estoque e foto do pote plástico de 110 g |
| Trufa | Maracujá, Tradicional, Morango e “Bejinho” no protótipo, a R$ 5,00 e sem estoque informado | Um rascunho arquivado, estoque 0, sem preço comercial | Sabores e grafia, peso, composição, foto, preço e estoque por sabor |
| Pudim de leite | Em votação; R$ 14 no catálogo inicial do código | Fora do lote comercial | Se deve entrar em rodada futura |

Os preços do protótipo são referências, não valores aprovados. O banco exige um número; zero centavos nos rascunhos indica preço ainda não definido. A restrição do banco impede disponibilização com preço zero. As fichas inspecionadas usavam emojis, sem foto de produto vinculada; os arquivos de marca e imagens existentes não foram alterados. Não foram importados dados pessoais, votos ou pedidos locais. Os dois registros técnicos arquivados do Supabase foram preservados.

## Estoque, Pix e comprovantes

No banco hospedado, em subtransação revertida, foram aprovados criação, edição, duplicação com estoque zero, arquivamento, contagem, baixa de 3 para 1, total de 250 centavos apesar de valor adulterado na entrada, e devolução para 3 em cancelamento repetido. Sem resíduo do teste e sem alterar o estoque dos produtos comerciais. Esse ensaio exercitou o papel de administrador, as permissões e as funções hospedadas, sem novo pedido persistido nem execução da antiga Edge Function de testes.

A área Administração → Configurações mostrou o campo Chave Pix vazio. O campo está preparado para o titular informar e salvar a chave; nenhum valor foi inserido. A configuração atual permite leitura da chave pela API pública; antes de preencher, confirmar uma chave comercial destinada à divulgação (preferir aleatória quando adequado) ou restringir a leitura a quem precisa recebê-la. Nunca usar a leitura de comprovante como confirmação bancária.

O Tesseract local em português foi executado novamente em cinco imagens fictícias: R$ 1,25, R$ 0,50, R$ 0,75 e R$ 9,99 foram lidos corretamente; imagem sem valor legível ficou inconclusiva. A etapa anterior comprovou upload, download privado e OCR assistido na interface. Nesta etapa não houve novo upload hospedado nem transferência de dinheiro. O administrador confere a leitura sugerida e, em passo separado, confirma o recebimento pelo banco.

## Cadastro e recuperação

A validação passou a solicitar retorno para a própria página pública de validação, para cadastro e recuperação. A URL exata foi adicionada aos redirecionamentos permitidos no Supabase; a URL principal permaneceu como Site URL. O fluxo de recuperação ganhou formulário para solicitar e-mail e definir nova senha após o evento de recuperação do Supabase, com novo login após a alteração. A lógica foi aprovada em teste automatizado com Auth simulado. O login administrativo existente foi verificado na validação.

Não foi usado endereço de cliente ou conta administrativa para disparar e-mails de teste. Confirmação de cadastro, chegada dos e-mails, abertura dos links e login com senha nova permanecem pendentes com caixa de teste autorizada. A confirmação por e-mail não foi desativada. O projeto está com o serviço de e-mail padrão: limitado a membros da organização e duas mensagens por hora no projeto. Isso permite ensaio com destinatário elegível, mas não cadastro do público geral. Para ativar cadastro público, é necessário homologar entrega com SMTP próprio ou outra solução autorizada que respeite US$ 0 de custo adicional. Nenhum serviço foi contratado.

## Evidências, limites e próximos passos

- 37 testes automatizados locais aprovados (20 banco, sete upload, oito interface, dois OCR).
- Homologação hospedada desta etapa: três rascunhos confirmados na administração, ciclo do estoque aprovado e revertido, chave Pix vazia verificada, redirecionamento exato permitido. Não foi reativada a rotina temporária.
- Layout hospedado inspecionado em desktop e tela estreita simulada, sem transbordamento horizontal da página. CSS, imagens e loja principal preservados; aparelhos físicos e fluxo de e-mail em dispositivos independentes continuam pendentes.
- Evidência anterior: [35 verificações hospedadas](tests/results/hosted-20261108.json).
- [Proposta de privacidade, retenção, exportação e exclusão](PRIVACIDADE-COMPROVANTES.md). Prazos e exclusões dependem de aprovação e validação das obrigações aplicáveis; nenhuma exclusão foi programada.
- Plano Free: 500 MB de banco, 1 GB de arquivos, 50 mil usuários ativos mensais, 5 GB de saída e 5 GB em cache, 500 mil invocações Edge Functions, 200 conexões Realtime simultâneas e dois milhões de mensagens Realtime. Pode pausar por inatividade. Fontes: [cotas](https://supabase.com/docs/guides/platform/billing-on-supabase), [planos](https://supabase.com/pricing), [limites do e-mail padrão](https://supabase.com/docs/guides/auth/auth-smtp).
- Arquivos de implementação: `cloud-entry.mjs`, `supabase-api.mjs`, `validacao.html` e `tests/cloud-interface.test.mjs`. O painel da rotina temporária foi removido da interface. `cloud-config.js`, `app.js`, `index.html` e a função temporária não foram alterados nesta etapa.

Antes de ativar: confirmar os dados comerciais e fotos, escolher a chave Pix, aprovar a política e o aviso de privacidade, comprovar cadastro e recuperação reais com entrega pública sem custo adicional, e obter aprovação expressa do titular para ligar a loja principal.
