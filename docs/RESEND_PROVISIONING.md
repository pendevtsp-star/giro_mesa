# Resend do GiroMesa

O GiroMesa usa a API HTTP da Resend para boas-vindas, convites, recuperação de senha e notificações. O provider não depende de SMTP local nem guarda a chave no repositório.

## Preparação na Resend

1. Adicione e verifique um domínio de envio, preferencialmente `giromesa.com.br` ou `mail.giromesa.com.br`.
2. Publique os registros SPF e DKIM indicados pela Resend. DMARC deve ser configurado depois que o domínio estiver enviando corretamente.
3. Crie uma API key com escopo mínimo para envio e guarde-a uma única vez em um gerenciador de segredos.
4. Use um remetente desse domínio, por exemplo `no-reply@giromesa.com.br`.

## Variáveis na VPS

Grave os valores somente em `/srv/apps/giro_mesa/.env`:

```dotenv
EMAIL_PROVIDER=resend
EMAIL_FROM=no-reply@giromesa.com.br
RESEND_API_URL=https://api.resend.com
RESEND_API_KEY=re_<segredo-da-resend>
```

Não configure `RESEND_API_KEY` no Git, no frontend ou em logs. A API usa `Authorization: Bearer` e uma chave de idempotência por envio; retries de rede, HTTP 429 e erros 5xx reutilizam a mesma chave.

## Homologação

Após provisionar a chave, reinicie somente a API e teste nesta ordem:

1. Solicitação de reset de senha.
2. Convite de usuário para um perfil operacional.
3. Convite de novo tenant pela área de plataforma.
4. Mensagem de boas-vindas de um novo trial.
5. Recebimento na caixa real e inspeção de SPF/DKIM/DMARC.

O reset em produção nunca devolve o token no JSON. O token só deve chegar pelo e-mail.

## Checklist de aceite

- [ ] Domínio verificado na Resend.
- [ ] SPF e DKIM publicados; DMARC planejado.
- [ ] API key criada com escopo mínimo e fora do repositório.
- [ ] `EMAIL_PROVIDER=resend` e remetente configurados na VPS.
- [ ] API reiniciada sem erro de configuração.
- [ ] Reset recebido e concluído.
- [ ] Convite recebido e aceito.
- [ ] Falha da Resend aparece em log sanitizado, sem chave, token ou conteúdo sensível.
- [ ] Chave antiga revogada após uma rotação validada.
