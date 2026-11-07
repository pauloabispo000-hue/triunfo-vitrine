# Triunfo — Vitrine de sobremesas

Protótipo web responsivo (HTML/CSS/JavaScript), inspirado em padrões de navegação de marketplaces e com identidade visual própria Triunfo. Inclui logo fornecido pelo proprietário.

## Executar

Abra `index.html` em um navegador ou sirva a pasta com `python -m http.server 8000` e acesse `http://localhost:8000`.

## Fluxos demonstráveis

- Vitrine, busca, carrinho, quantidades, checkout com chave Pix e anexo de comprovante (imagem até 2 MB).
- Cadastro e login fictícios, tela de recuperação por e-mail (captura de endereço apenas), histórico de pedidos.
- Sugestões com foto, moderação pelo administrador, votação única por usuário demonstrativo, aprovação por pelo menos 50% dos votos após mínimo configurável, análise de viabilidade, produção e publicação.
- Área administrativa para produtos, sugestões, etapas, comprovantes e configuração Pix.
- Login apenas para demonstração: CPF `00000000000`, senha `admin123`.

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
