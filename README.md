# TikTok Ops Admin Site

Projeto isolado do painel admin em modo gratuito:
- um unico site no Cloudflare Pages
- login via Supabase Auth
- operacoes sensiveis via funcoes RPC com `security definer`
- sem Worker
- sem R2

## Deploy

1. Instale dependencias:
   - `npm install`
2. Crie `.env.production.local` usando `.env.production.example`
3. Configure:
   - `VITE_SUPABASE_URL=https://seu-projeto.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=...`
   - `VITE_ADMIN_ORIGIN=https://tiktokops.pages.dev`
4. Aplique no Supabase as migracoes:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_build_upload_support.sql`
   - `supabase/migrations/0003_free_admin_site.sql`
5. Crie pelo menos um usuario admin no Supabase Auth.
6. Insira o email desse admin em `public.admin_roles` com role `owner` ou `admin`.
7. Rode o build:
   - `npm run build`
8. Publique no Cloudflare Pages:
   - comando de build: `npm run build`
   - output: `dist`

## O que esta incluso

- criar cliente
- criar licenca e mostrar a key real no instante da geracao
- gerar chave de cadastro por licenca
- criar login do cliente por licenca
- ver maquinas anonimas assim que o programa abre
- banir e desbloquear maquinas
- vincular licenca em maquina
- trocar usuario/senha do cliente
- gerar nova key real da licenca
- registrar updates por URL publica

## Limites desta versao gratuita

- nao faz upload direto de arquivo
- a presenca anonima usa TTL de 24h no banco em vez de canal realtime dedicado
- atualizacoes entram por URL publica que voce informar
