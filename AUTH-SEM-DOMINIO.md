# Cadastro Triunfo sem domínio próprio

A solução escolhida para validação é Entrar com Google via Supabase Auth. O cliente Google retorna ao callback do Supabase e o Supabase volta para a página `validacao.html` no GitHub Pages. A validação usa PKCE. Abra o link e conclua o fluxo no mesmo navegador. O cliente OAuth fica em projeto Google Cloud separado, `triunfo-vitrine-auth`.

| Provedor | Plano e condição de remetente | Avaliação |
| --- | --- | --- |
| Brevo | 300 mensagens por dia no plano gratuito. Endereço verificado de webmail pode ter o domínio substituído temporariamente por `brevosend.com`. | Tem SMTP para Supabase, mas a substituição temporária, a verificação do remetente e possíveis recusas de entrega impedem tratar a opção como homologada. |
| Mailjet | 200 mensagens por dia e 6.000 por mês. O serviço alerta sobre falhas de DMARC e entrega ao usar webmail. | Tem SMTP, mas depender de um remetente de webmail compromete a entrega de links de acesso. |
| SendGrid | 100 mensagens por dia durante um teste de 60 dias. | O envio contínuo exige plano pago. |
| SMTP padrão do Supabase | Duas mensagens por hora, apenas para endereços da equipe do projeto. | Útil para testes internos, insuficiente para cadastro público. |

Fontes oficiais: [Brevo Free](https://help.brevo.com/hc/pt/articles/208580669), [Brevo e domínio](https://help.brevo.com/hc/en-us/articles/16045394674066), [Brevo SMTP](https://help.brevo.com/hc/en-us/articles/115000188150), [Mailjet Free](https://documentation.mailjet.com/hc/en-us/articles/19154256993051), [Mailjet e webmail](https://documentation.mailjet.com/hc/en-us/articles/19308800104091), [SendGrid](https://www.twilio.com/docs/sendgrid/ui/account-and-settings/upgrading-your-plan), [SMTP Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

## Acesso e recuperação

- Para clientes que criaram a conta pelo Google, o primeiro login provisiona a conta no Supabase. O cliente volta com a mesma conta Google. Se perder acesso, usa a recuperação do Google.
- O acesso por senha preserva a confirmação de e-mail. A recuperação por senha continua sujeita ao limite do SMTP padrão. O OAuth não substitui esse fluxo para clientes sem uma conta Google.
- O aplicativo não usa APIs do Gmail ou do Drive. O consentimento usa a identidade básica de login. O segredo do cliente deve ficar apenas nas configurações do Supabase. O cliente web usa a chave publicável.
- A audiência foi configurada como Externa, em teste. O Google documenta uma exceção para login com escopos básicos, que pode aceitar usuários fora da lista de teste. A aceitação de uma conta externa deve ser comprovada na validação. Antes de divulgar o acesso, confirme o contato de suporte, publique o aviso de privacidade e revise as exigências de marca apresentadas no console.
- O GitHub Pages mantém o endereço atual. A configuração `enabled: false` deixa a loja principal em modo local. As tabelas, dados, catálogo e estilos permanecem preservados.

Referências: [Supabase com Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [política de dados do Google](https://developers.google.com/terms/api-services-user-data-policy), [verificação de marca](https://developers.google.com/identity/verification/authentication-verification), [audiência OAuth](https://support.google.com/cloud/answer/15549945).

## Verificações

38 testes automatizados locais aprovados, incluindo destino do OAuth e ausência da opção fora da validação. Custo adicional US$ 0. Nenhum serviço de envio foi contratado.

O cliente Web foi criado e o provedor Google está habilitado no Supabase. A origem autorizada é `https://pauloabispo000-hue.github.io`. O callback do Google é `https://omykabdlwtekyagvxipi.supabase.co/auth/v1/callback`. A opção de ignorar a verificação de nonce e o login sem e-mail ficaram desativados. A confirmação de e-mail por senha não foi modificada.
