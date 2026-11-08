# Triunfo — proposta de política de comprovantes Pix

Estado: procedimento interno para aprovação do titular. Não autoriza exclusões, não configura um agendamento e não substitui o aviso de privacidade ao consumidor.

## Finalidade e acesso

- Use o comprovante para conciliar o pedido, verificar o recebimento e tratar divergências, reembolsos ou contestações. A leitura OCR local é uma sugestão; a confirmação depende de conferência bancária.
- Oriente o cliente a enviar somente a imagem do Pix relacionado ao pedido, evitando saldo, extrato completo e operações de terceiros. Não exija informações além do necessário.
- Mantenha o bucket privado. Cliente acessa os próprios comprovantes; contas administrativas verificadas têm acesso para conciliação. Não envie imagens por e-mail, mensageria, GitHub, link público ou OCR externo.
- Antes da ativação, publique aviso com identificação e contato do controlador, finalidades, critérios de retenção, destinatários e canal de exercício de direitos. Registre as bases legais aplicáveis à operação: execução do contrato para conciliação, obrigação legal/regulatória quando identificada e tratamento necessário ao exercício regular de direitos quando aplicável. Valide a classificação e os prazos com apoio contábil ou jurídico conforme o caso.

## Retenção e revisão

| Situação | Critério proposto |
| --- | --- |
| Pedido aberto, crédito não conciliado, reembolso ou contestação | Conservar enquanto necessário à resolução; revisão pelo responsável |
| Pedido encerrado e sem pendência | Avaliar se o documento original ainda é necessário; aplicar o prazo aprovado para a finalidade, contado do encerramento |
| Obrigação fiscal/regulatória ou preservação por disputa | Bloquear descarte, registrar fundamento, escopo, prazo e responsável; distinguir o registro fiscal da imagem do comprovante |
| Arquivos temporários ou cópias de exportação | Eliminar ao concluir a finalidade aprovada, observadas as mesmas exceções e o ciclo de backup |

Faça revisão mensal de elegibilidade. A frequência de revisão não é prazo legal de guarda. Defina a tabela de prazos por tipo de registro antes da ativação; não presuma que toda imagem deve ser mantida pelo mesmo prazo de um documento fiscal. Documente a decisão sem copiar conteúdo do Pix para o registro administrativo.

## Exportação privada

1. Confirme identidade, autorização, finalidade, escopo, pedidos e exceções. Para pedido de titular, proteja dados de terceiros e entregue somente o que for devido.
2. Use o download autorizado na interface ou a API de Storage autenticada. Gere manifesto mínimo com ID interno, hash para conferência, data e quantidade. Evite incluir chave Pix ou dados bancários no manifesto.
3. Guarde a exportação cifrada em local privado sob controle do titular, com acesso individual. Transmita senha por canal separado se houver entrega externa e registre destinatário, prazo e revogação de acesso. Não use repositório, pasta pública ou armazenamento compartilhado indiscriminado.
4. Confira integridade e restauração em local isolado. Programe revisão do acesso e descarte das cópias quando cessar sua finalidade, após aprovação.

## Exclusão segura — somente após aprovação

1. Prepare lista revisável de IDs de recibos e caminhos no bucket. Exclua da lista qualquer caso com retenção ativa ou pendência. Obtenha aprovação do titular para lote e escopo.
2. Antes de executar em produção, valide em ambiente de teste como manter integridade financeira e proteção contra reutilização após remover imagens. Preserve apenas os metadados cuja finalidade/base subsista. Um hash pode continuar sendo dado pessoal vinculável: não o retenha automaticamente.
3. Remova objetos pela API de Storage, nunca por DELETE direto em `storage.objects`. Confira a resposta e a ausência do objeto, trate falhas parciais e só então reconcilie o registro de arquivo no banco pelo fluxo aprovado. Não apague pedidos ou histórico financeiro por efeito colateral.
4. Revogue links e acessos, remova exportações temporárias e aplique o ciclo aprovado de backups. Registre responsável, aprovação, data, IDs mínimos, quantidade, resultado e exceções. Em restauração de backup, reaplique exclusões elegíveis antes de reabrir acesso.
5. Verifique que não há arquivos órfãos nem downloads ativos para imagens removidas. Esta versão não tem rotina de exclusão ou exportação em massa.

Referências: [LGPD — Câmara dos Deputados, arts. 6º, 7º, 15–16, 18 e 46](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-publicacaooriginal-156201-pl.html), [Supabase — exclusão de objetos](https://supabase.com/docs/guides/storage/management/delete-objects).
