@AGENTS.md

# BaseHub: guia para agentes

Painel multi-tenant para gerenciar várias contas e organizações do Supabase. Produção em `https://basehub.nerifilho.com.br` (Vercel). Código aberto (AGPL-3.0); o README explica o self-host.

**Sempre que mudar uma funcionalidade, atualize o README.md e este arquivo no mesmo trabalho.** Se a mudança afeta o que o usuário vê, atualize também o guia do minichat em `src/lib/assistant-knowledge.ts`.

## Stack

Next.js 16 (App Router, `src/proxy.ts` no lugar de middleware), React 19, Tailwind 4, shadcn/ui, lucide-react. AWS Cognito (login com telas próprias, sem hosted UI) e DynamoDB (tabela única). Supabase Management API (OAuth App ou Access Token). Anthropic SDK (opcional). Deploy: `npx vercel@latest deploy --prod --yes` (build remoto).

## Mapa do código

| Onde | O quê |
| --- | --- |
| `src/app/(painel)/` | Telas logadas: `painel` (visão geral), `novo`, `contas` e `contas/[org]` (página da organização), `p/[org]/[ref]` (projeto: Conexão, Tabelas, SQL), `mcp`, `atividade`, `assinar`, `ajuda` |
| `src/app/(auth)/` | Login, cadastro, esqueci a senha (Cognito) |
| `src/app/page.tsx` | Landing page |
| `src/app/actions.ts` | Server actions (todas checam sessão, várias têm rate limit e gravam `addLog`) |
| `src/lib/hub.ts` | `loadHub`: lê todas as contas em paralelo e calcula as vagas grátis **por e-mail** |
| `src/lib/db.ts` | Acesso ao DynamoDB (chaves `T#<tenant>` / `CONN#`, `PAT#`, `PWD#`, `KA#`, `LOG#`, `RL#`, `DESC#`, `DESCGEN#`...) |
| `src/lib/supabase-api.ts` | Cliente da Management API (`clientFor(conn)`) |
| `src/lib/mcp.ts` | Catálogo de ações do MCP, permissões (padrão + por banco), `executeTool`, `resolveProject` (confere o banco ao vivo) |
| `src/lib/oauth.ts` + `src/app/oauth/*` + `src/app/.well-known/*` | Servidor OAuth 2.1 do MCP (PKCE, registro dinâmico) |
| `src/app/api/mcp/{tools,call}` | Endpoints que o servidor MCP (repo `basehub-mcp`) chama |
| `src/lib/describe.ts` | Descrição dos bancos: leitura do esquema, impressão digital, rascunho por IA |
| `src/app/api/assistant` + `src/components/assistant-chat.tsx` | Minichat de ajuda (streaming) |
| `src/lib/assistant-knowledge.ts` | Guia do sistema usado pelo minichat (vai em prompt caching) |
| `src/lib/redact.ts` | Mascara segredos (entrada e saída da IA) |
| `src/lib/plans.ts` | Planos Grátis/Pro/Business, `hasMcp`, limites de organizações |
| `src/lib/access.ts` | **Porteiro de banco**: `resolveAccess`/`requireAccess` dizem se o usuário é dono ou convidado e com qual papel; `tenant` é sempre o dono |
| `src/lib/roles.ts` | Papéis (Leitura, Editor, Admin), o que cada um pode (`can`) e o teto de ações do MCP por papel |
| `src/lib/shares.ts` + `src/app/share-actions.ts` | Compartilhamento: convites, aceitar, papéis, revogar, ações do MCP por pessoa |
| `src/lib/email.ts` | Envio pelo Resend e moldura dos e-mails |
| `src/lib/users.ts` | Índice e-mail -> conta (gravado no login) |
| `src/lib/email-codes.ts` | Códigos de cadastro e troca de senha do próprio BaseHub (hash, 15 min, 5 tentativas), enviados pelo Resend; o app confirma/define a senha no Cognito via APIs de admin |

## Regras de negócio que não podem quebrar

- **Vagas grátis do Supabase são por e-mail (login)**: 2 bancos ligados somando todas as orgs Free daquele e-mail. Org paga não conta. Use `loadHub` (`freeSlots`, `logins`), nunca conte por organização.
- **MCP sempre confere o banco ao vivo** (`resolveProject`) antes de agir, ignora projetos REMOVED e responde com o nome do banco afetado.
- **Permissões do MCP**: ações padrão + override por banco (padrão / personalizado / bloqueado). `sql_write` é permissão (não ferramenta): sem ela, `run_sql` com `read_only=false` é recusado no servidor.
- **IA é opcional**: tudo depende de `env.aiEnabled` (`ANTHROPIC_API_KEY`). Sem a chave, nada de IA aparece na tela.
- **Custo da IA**: descrição só é gerada sem descrição salva ou com esquema mudado; até 3 rascunhos por versão do esquema; limites por usuário e teto diário GERAL (`rateLimit("GLOBAL", ...)`). Bancos grandes: só ~40 tabelas detalhadas, pedido com teto fixo. Não remova esses limites.
- **Dados sensíveis**: tokens e senhas criptografados (AES-256-GCM); linhas de exemplo para a IA só com opt-in e com colunas sensíveis ocultas; segredos mascarados com `redactSecrets`.

- **Toda ação ou tela de um banco passa por `requireAccess`/`resolveAccess`** com a permissão mínima (`view`, `write`, `secrets`, `manage`, `delete`). Nunca use `session.tenantId` direto para dados de um banco: use `access.tenant` (o dono). Logs vão para o dono com `actor(access)`.
- **O Cognito não envia e-mail**: cadastro e troca de senha usam `lib/email-codes` + `adminConfirm`/`adminSetPassword`. Não volte a usar `ForgotPassword`/`ResendConfirmationCode` do Cognito.
- **Compartilhar é Pro/Business** (plano do DONO) e só para quem já tem conta no BaseHub. O MCP do convidado vê o banco compartilhado, limitado pelo que o dono/Admin liberou para aquela pessoa (dentro do teto do papel).

## Convenções

- Textos da interface em português do Brasil, **sem travessão (—)**: use vírgula, dois-pontos ou parênteses.
- Heurísticas de Nielsen: confirmação em ações destrutivas (`ConfirmAction`), mensagens de erro que dizem como resolver, estados vazios com ação.
- Layout precisa funcionar em monitor largo e no celular.
- O SSD do projeto é exFAT: arquivos `._*` quebram o cache do Turbopack; o cache em disco está desligado em `next.config.ts`. Apague `._*` e `.next` se o dev quebrar.
- Antes de publicar: `npx tsc --noEmit` e `npx eslint <arquivos alterados>`.
