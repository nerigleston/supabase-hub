# BaseHub

Painel para gerenciar **várias contas e organizações do Supabase em um lugar só**: lista todos os projetos, mostra o limite de bancos grátis por e-mail, cria e reativa projetos, roda SQL, navega nas tabelas, mantém projetos do plano Free ativos (keep-alive diário) e deixa um assistente de IA controlar os bancos por MCP, só com o que você liberar.

> Projeto independente, **não afiliado nem endossado pela Supabase Inc.** "Supabase" é marca da Supabase Inc.

---

## Duas formas de usar

|                         | **Hub na nuvem (SaaS)**                  | **Self-hosted (este repositório)**              |
| ----------------------- | ---------------------------------------- | ----------------------------------------------- |
| Instalação              | Nenhuma: cria a conta e usa              | Você sobe na sua infraestrutura                 |
| Infra, backup, updates  | Por nossa conta                          | Por sua conta                                   |
| Keep-alive (cron)       | Incluído                                 | Você configura                                  |
| Organizações Supabase   | Grátis: até 2 · Pro e Business: ilimitadas | Ilimitadas                                    |
| IA (ajuda e descrições) | Incluída                                 | Opcional, com a sua `ANTHROPIC_API_KEY`         |
| MCP na nuvem            | Plano Business                           | Você hospeda o servidor MCP (repo `basehub-mcp`) |
| Custo                   | Grátis, Pro (R$ 29/mês) ou Business (R$ 39/mês) | Grátis (você paga a sua infra)        |
| Suporte                 | Por e-mail                               | Comunidade (issues e discussions)               |
| Código                  | O mesmo deste repositório                | O mesmo                                         |

👉 **Não quer cuidar de servidor?** Use a versão hospedada: **[basehub.nerifilho.com.br](https://basehub.nerifilho.com.br)**

👉 **Quer rodar por conta própria?** Siga o guia abaixo. Tudo que está aqui é seu para usar, estudar e modificar, nos termos da [licença](#licença).

---

## Funcionalidades

- **Várias contas Supabase**: conecte organizações por OAuth ou pelo Access Token da conta inteira (as organizações novas aparecem sozinhas). Cada organização tem uma página própria com os bancos dela e as vagas do e-mail.
- **Planos opcionais**: quem oferece como SaaS pode limitar as organizações do plano Grátis e cobrar Pro e Business por assinatura via AbacatePay (Pix ou cartão). Self-host sem configurar nada não tem limite.
- **Visão geral de projetos**: estado de cada banco (ativo, pausado, restaurando…), plano, região.
- **Limite do plano Free**: o Supabase permite 2 bancos grátis ligados **por e-mail** (somando todas as organizações dele). O painel mostra as vagas de cada e-mail e escolhe automaticamente onde criar o próximo.
- **Criar, pausar, reativar e excluir** projetos.
- **Editor SQL** e **navegador de tabelas**.
- **Conectar**: connection strings (pooler transaction/session e direta) e snippets prontos por aba: `.env`, psql, Node (pg), Prisma, Drizzle, Python, Go, JDBC, .NET, PHP e supabase-js.
- **Manter ativo (keep-alive)**: um `select 1` por dia nos projetos marcados, para o Supabase não pausar por inatividade.
- **Descrição de cada banco**: escrita à mão ou gerada por IA a partir do esquema (opcionalmente com 2 linhas de exemplo por tabela, colunas sensíveis ocultas). O usuário revisa antes de salvar, e o painel avisa quando tabelas ou colunas mudam. O MCP usa a descrição para saber qual banco é qual.
- **Minichat de ajuda** (IA): explica o sistema passo a passo, com guardrails de entrada e saída (segredos mascarados) e limites de uso.
- **MCP na nuvem** (plano Business): conecta o BaseHub ao Claude, ChatGPT, Cursor, Claude Code e Codex. O login é pelo próprio BaseHub (OAuth 2.1). Você liga cada ação no padrão ou por banco (padrão, personalizado ou bloqueado), e SQL de escrita é uma permissão à parte.
- **Compartilhar bancos** (Pro e Business): convide outras contas do BaseHub por e-mail para um banco, com papel Leitura, Editor ou Admin. O convite chega pelo Resend, vale 7 dias e é aceito pelo link. Dono e Admins mudam papéis, revogam acessos e escolhem, por pessoa, as ações que ela pode usar no MCP. Tudo fica no histórico do banco.
- **Atividade**: log de auditoria de quem fez o quê, inclusive convidados (expira sozinho).
- **Segurança**: tokens do Supabase criptografados (AES-256-GCM), CSP com nonce por requisição, rate limit por usuário, sessão em cookie `httpOnly`.

## Stack

| Camada         | Tecnologia                                                         |
| -------------- | ------------------------------------------------------------------ |
| App            | Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui       |
| Login          | AWS Cognito (User Pool)                                            |
| Dados          | AWS DynamoDB (tabela única, multi-tenant)                          |
| Hospedagem     | Vercel (funções Node.js + Cron) ou qualquer host Node.js           |
| Integração     | Supabase Management API (OAuth App ou Personal Access Token)       |
| IA (opcional)  | API da Anthropic (Claude Haiku por padrão), com prompt caching     |
| MCP            | Servidor em Python com [jangada-ai](https://docs.jangada.dev.br), hospedado na jangada Cloud |

---

## Self-hosting

### Pré-requisitos

- Node.js 22+ e npm
- Conta AWS (Cognito + DynamoDB cabem no free tier para uso pessoal)
- Uma conta Supabase (para criar o OAuth App)
- Opcional: conta na Vercel para hospedar e rodar o cron

### 1. Clonar e instalar

```bash
git clone https://github.com/nerigleston/supabase-hub.git
cd supabase-hub
npm install
cp .env.example .env.local
```

### 2. DynamoDB

Crie **uma tabela** com chave composta e TTL:

```bash
aws dynamodb create-table \
  --table-name supabase-hub \
  --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST

aws dynamodb update-time-to-live \
  --table-name supabase-hub \
  --time-to-live-specification Enabled=true,AttributeName=ttl
```

Coloque o nome em `DYNAMO_TABLE`.

<details>
<summary>Modelo de dados (referência)</summary>

| `pk`          | `sk`                     | Conteúdo                                      |
| ------------- | ------------------------ | --------------------------------------------- |
| `T#<tenant>`  | `CONN#<orgSlug>`         | Conexão com uma organização Supabase          |
| `T#<tenant>`  | `PAT#<email>`            | Access Token de uma conta Supabase inteira    |
| `T#<tenant>`  | `PWD#<ref>`              | Senha do banco conhecida pelo painel          |
| `T#<tenant>`  | `KA#<ref>`               | Configuração de keep-alive do projeto         |
| `T#<tenant>`  | `LOG#<iso>#<uuid>`       | Auditoria (expira via `ttl`)                  |
| `T#<tenant>`  | `RL#<ação>`              | Rate limit (expira via `ttl`)                 |
| `T#GLOBAL`    | `RL#<ação>-day`          | Teto diário geral de uso da IA                |
| `T#<tenant>`  | `PLAN`                   | Plano e assinatura                            |
| `T#<tenant>`  | `DESC#<ref>`             | Descrição do banco + impressão digital do esquema |
| `T#<tenant>`  | `DESCGEN#<ref>`          | Rascunhos de IA por versão do esquema (limite de custo) |
| `T#<tenant>`  | `MCPCFG`                 | Ações do MCP (padrão e por banco)             |
| `T#<tenant>`  | `MCPREFIDX`              | Cache ref -> organização (expira)             |
| `T#<dono>`    | `SHARE#<ref>#<email>`    | Membro de um banco compartilhado (pendente ou ativo, papel, ações do MCP) |
| `T#<convidado>` | `SHARED#<ref>`         | Banco que outra conta compartilhou com este usuário |
| `INVITE#<hash>` | `META`                 | Convite (token só como hash, expira em 7 dias) |
| `USER#<email>` | `META`                  | Índice e-mail -> conta (só se convida quem já tem conta) |
| `OAUTHCLIENT#<id>` / `OAUTHCODE#…` / `OAUTHTOK#<hash>` / `OAUTHREF#<hash>` | `META` | Servidor OAuth do MCP (tokens guardados só como hash) |

Hoje `tenant` = `sub` do usuário no Cognito. Tokens e senhas são gravados criptografados.

</details>

### 3. Cognito

1. Crie um **User Pool** com login por e-mail e verificação por código.
2. Crie um **App client** _com_ client secret e habilite o fluxo **`ALLOW_USER_PASSWORD_AUTH`**.
3. Preencha `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` e `COGNITO_CLIENT_SECRET`.

### 4. OAuth App no Supabase

1. No Supabase: **Organization Settings → OAuth Apps → Add application**.
2. **Authorization callback URL**: `<APP_URL>/api/supabase/callback` (ex.: `http://localhost:3000/api/supabase/callback`).
3. **Scopes**: Organizations (Read), Projects (Read e Write), Database (Read e Write), Secrets (Read).
4. Copie Client ID e Client Secret para `SUPABASE_OAUTH_CLIENT_ID` e `SUPABASE_OAUTH_CLIENT_SECRET`.

Um único OAuth App serve para conectar todas as contas. Sem ele, ainda dá para conectar contas pelo Access Token.

### 5. Segredos locais

```bash
# SESSION_SECRET (assina o cookie de sessão)
openssl rand -base64 48
# TOKEN_ENCRYPTION_KEY (precisa ter exatamente 32 bytes em base64)
openssl rand -base64 32
# CRON_SECRET (protege a rota do keep-alive)
openssl rand -hex 32
```

> ⚠️ Se perder a `TOKEN_ENCRYPTION_KEY`, os tokens salvos não podem mais ser lidos e as contas precisam ser reconectadas. Guarde-a num cofre de senhas.

### 6. Rodar

```bash
npm run dev        # http://localhost:3000
```

Em produção:

```bash
npm run build && npm start
```

### Variáveis de ambiente

| Variável                       | Obrigatória | Descrição                                                                 |
| ------------------------------ | :---------: | ------------------------------------------------------------------------- |
| `APP_URL`                      | ✅          | URL pública do app, sem barra no final                                    |
| `DYNAMO_TABLE`                 | ✅          | Nome da tabela DynamoDB                                                   |
| `HUB_AWS_REGION`               |             | Região da AWS (padrão `us-east-1`). Use esta na Vercel, onde `AWS_REGION` é reservada |
| `AWS_PROFILE`                  |             | Perfil local do AWS CLI (desenvolvimento)                                 |
| `AWS_ROLE_ARN`                 |             | Role assumida via OIDC na Vercel (sem chaves fixas)                       |
| `COGNITO_USER_POOL_ID`         | ✅          | ID do User Pool                                                           |
| `COGNITO_CLIENT_ID`            | ✅          | App client                                                                |
| `COGNITO_CLIENT_SECRET`        | ✅          | Secret do App client                                                      |
| `SESSION_SECRET`               | ✅          | Segredo de assinatura da sessão                                           |
| `TOKEN_ENCRYPTION_KEY`         | ✅          | Chave AES-256 (32 bytes em base64)                                        |
| `SUPABASE_OAUTH_CLIENT_ID`     |             | OAuth App do Supabase (sem ele, só conexão por Access Token)              |
| `SUPABASE_OAUTH_CLIENT_SECRET` |             | Secret do OAuth App                                                       |
| `CRON_SECRET`                  | ✅ (prod)   | Token exigido em `Authorization: Bearer` pela rota de keep-alive          |
| `SIGNUP_ENABLED`               |             | `true` abre o cadastro público. **Fechado por padrão**: abra para criar a sua conta e feche depois, se quiser |
| `ACCESS_REQUEST_URL`           |             | Com o cadastro fechado, destino do botão "Quero ser avisado" (`mailto:` ou URL) |
| `MCP_URL`                      |             | URL pública do servidor MCP mostrada na tela /mcp e na LP                  |

#### E-mails (opcional): convites e códigos do Cognito pelo Resend

| Variável                       | Descrição                                                                 |
| ------------------------------ | ------------------------------------------------------------------------- |
| `RESEND_API_KEY`               | Chave do [Resend](https://resend.com) (pode ser só de envio)             |
| `EMAIL_FROM`                   | Remetente, ex.: `BaseHub <convites@seudominio.com>`. O domínio precisa estar verificado no Resend |

Sem `RESEND_API_KEY`, o convite é criado mesmo assim e o link aparece na tela para você enviar.

Os códigos de cadastro e de troca de senha são do Cognito. Para eles também saírem pelo Resend (em vez do remetente padrão da AWS, limitado a 50 por dia), instale o gatilho Custom Email Sender com `infra/cognito-email-sender/deploy.sh`: ele cria uma chave KMS, uma Lambda e liga o gatilho no User Pool preservando o resto da configuração (`ROLLBACK=1` desfaz). Rode só depois de verificar o domínio no Resend.

#### IA (opcional): minichat de ajuda e descrição dos bancos

Sem `ANTHROPIC_API_KEY` a IA fica desligada: o botão do chat e o "Gerar com IA" nem aparecem (a descrição manual continua). Na versão hospedada a chave é a do BaseHub; no self-host, cada instalação usa a própria chave, criada em [console.anthropic.com](https://console.anthropic.com).

| Variável                       | Descrição                                                                 |
| ------------------------------ | ------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`            | Liga a IA. Fica só no servidor; o navegador fala com rotas do próprio app |
| `AI_MODEL`                     | Modelo (padrão `claude-haiku-5-5`, o mais barato)                          |
| `AI_DAILY_CHAT_LIMIT`          | Teto diário de mensagens do chat somando todos os usuários (padrão 2000)  |
| `AI_DAILY_DESCRIBE_LIMIT`      | Teto diário de descrições geradas somando todos (padrão 300)              |

Controle de custo já embutido: o guia do chat vai em cache (prompt caching), 30 mensagens a cada 10 min e 100 por dia por usuário; descrição só é gerada quando o banco não tem uma ou quando tabelas/colunas mudaram, até 3 rascunhos por versão do esquema, 5 por hora e 15 por dia por usuário. Em bancos grandes só as ~40 tabelas mais relevantes vão com colunas e o pedido tem teto fixo.

#### MCP (opcional)

O servidor MCP fica em outro repositório (`basehub-mcp`, Python + jangada-ai). Ele só repassa as chamadas para o BaseHub, que é o servidor OAuth (`/.well-known/oauth-authorization-server`, `/oauth/register`, `/oauth/authorize`, `/oauth/token`) e quem executa as ações (`/api/mcp/tools`, `/api/mcp/call`). No servidor MCP, defina `BASEHUB_URL` e `MCP_PUBLIC_URL`; no BaseHub, `MCP_URL`. O acesso exige o plano Business quando os planos estão ligados.

#### Planos e pagamento (opcional, para quem oferece como SaaS)

Sem `FREE_ORG_LIMIT` não existe plano nem limite: todo usuário conecta quantas organizações quiser e tem tudo liberado (inclusive o MCP). Com ela, o plano Grátis tem esse limite, o Pro é ilimitado e o Business inclui o MCP. Quem já passou do limite não perde nada; só não conecta organizações novas.

| Variável                       | Descrição                                                                 |
| ------------------------------ | ------------------------------------------------------------------------- |
| `FREE_ORG_LIMIT`               | Organizações no plano Grátis (ex.: `2`)                                   |
| `PAYMENTS_ENABLED`             | `true` libera as assinaturas. Sem isso os planos pagos aparecem como "Em breve" |
| `ABACATEPAY_API_KEY`           | Chave da API do [AbacatePay](https://abacatepay.com) (define sandbox ou produção) |
| `ABACATEPAY_WEBHOOK_SECRET`    | Segredo do webhook, o mesmo cadastrado no AbacatePay                      |
| `ABACATEPAY_PRODUCT_MONTHLY`   | ID do produto com ciclo `MONTHLY` (`prod_...`)                            |
| `ABACATEPAY_PRODUCT_YEARLY`    | ID do produto com ciclo `ANNUALLY` (opcional)                             |
| `ABACATEPAY_ACCEPT_DEV`        | `true` aceita eventos de sandbox (`devMode`). Nunca use em produção       |

No AbacatePay, crie os produtos de assinatura e um webhook apontando para `<APP_URL>/api/webhooks/abacatepay?webhookSecret=<ABACATEPAY_WEBHOOK_SECRET>` com os eventos `subscription.completed`, `subscription.renewed`, `subscription.cancelled` e `subscription.payment_failed`. Os preços exibidos ficam em `src/lib/plans.ts`.

---

## Deploy

### Vercel (recomendado)

1. Importe o repositório na Vercel.
2. Cadastre as variáveis acima em **Settings → Environment Variables** (use `HUB_AWS_REGION` no lugar de `AWS_REGION`).
3. Credenciais AWS sem chave fixa: configure uma role com OIDC da Vercel e defina `AWS_ROLE_ARN`. Rode `VERCEL_TEAM=<slug-do-seu-time> bash scripts/aws-oidc-vercel.sh` e copie o `AWS_ROLE_ARN` que ele imprime.
4. O cron do keep-alive já está em `vercel.ts` (todo dia às 09:00 UTC) e a Vercel envia o `CRON_SECRET` sozinha.

### Outros hosts (Docker, VPS, Railway, Fly…)

O app é um Next.js comum (`npm run build && npm start`). Duas diferenças:

- **Credenciais AWS**: use `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` de um usuário IAM com acesso **só** à tabela, ou a role da instância.
- **Cron**: agende uma chamada diária para a rota de keep-alive:

  ```bash
  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://hub.seudominio.com/api/cron/keepalive
  ```

Permissões IAM mínimas na tabela: `GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Query`, `Scan`. Para o Cognito, o app só usa as APIs públicas do App client.

---

## Segurança

- Encontrou uma vulnerabilidade? **Não abra issue pública.** Reporte de forma privada pela aba **Security → Report a vulnerability** do GitHub; respondemos em até 72 h.
- Nunca faça commit de `.env.local`. O `.gitignore` já ignora todos os `.env*`, exceto o `.env.example`.

## Contribuindo

1. Abra uma issue descrevendo o problema ou a ideia antes de PRs grandes.
2. Faça fork, crie um branch (`feat/minha-ideia`) e rode `npm run lint` antes do PR.
3. Ao enviar um PR, você concorda em licenciar sua contribuição nos termos da licença do projeto.

## Licença

[AGPL-3.0](LICENSE). Você pode usar, modificar e hospedar à vontade, inclusive em empresa. Se oferecer uma versão modificada **como serviço para terceiros**, precisa publicar o código dessa versão nos mesmos termos.

Precisa de outra licença (por exemplo, para embutir num produto fechado)? Fale comigo pelos contatos abaixo.

## Autor

Feito por **Neri Filho**.

- E-mail: [neri@lizardti.com](mailto:neri@lizardti.com)
- LinkedIn: [linkedin.com/in/nerigleston](https://www.linkedin.com/in/nerigleston/)
- Versão hospedada: [basehub.nerifilho.com.br](https://basehub.nerifilho.com.br)
