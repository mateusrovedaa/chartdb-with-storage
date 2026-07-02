# Live Diagram — fork do ChartDB self-hosted

Este fork adiciona ao ChartDB self-hosted a funcionalidade **Live Diagram**: uma URL
fixa que carrega automaticamente o diagrama mais recente de um schema, sem import
manual. O JSON do schema é gerado por um job externo, gravado em disco e servido pelo
Nginx do container.

- **Base do upstream**: `chartdb/chartdb` v1.20.1 (commit `c24936a`).
- **Upstream remoto**: `https://github.com/chartdb/chartdb.git` (remote `upstream`).

## Como funciona

```
[job cron/CI] --escreve--> /host/chartdb-schema/
                             ├── billing.json
                             ├── auth.json
                             └── index.json      (lista os schemas + updatedAt)
                                    │ (bind mount, read-only)
                                    ▼
                   container chartdb (este fork)
                   Nginx serve tudo em /schema-data/*
                                    │
        ┌───────────────────────────┴──────────────────────────┐
   rota /live                                        rota /live/:schemaId
   lista os schemas de                                fetch /schema-data/{id}.json,
   /schema-data/index.json                            importa via loadFromDatabaseMetadata,
   e linka pra /live/:schemaId                        grava no IndexedDB com id fixo
                                                       "live-{id}", navega pro diagrama
```

Cada navegador importa o schema para o **seu próprio IndexedDB local**. O que é
centralizado é a *fonte* (`{id}.json`), não o diagrama. Resolve "abrir e já ver o schema
atualizado"; não é edição colaborativa em tempo real.

## O que mudou em relação ao upstream

| Arquivo | Mudança |
|---|---|
| `default.conf.template` | Bloco `location /schema-data/` servindo o volume montado |
| `src/router.tsx` | Rotas `live` e `live/:schemaId` (antes do catch-all `*`) |
| `src/lib/live-schemas.ts` | **novo** — helpers: fetch do índice, validação de id, id do diagrama |
| `src/pages/live-index-page/live-index-page.tsx` | **novo** — lista de schemas |
| `src/pages/live-diagram-page/live-diagram-page.tsx` | **novo** — import automático |

3 dos 5 arquivos são **novos** (não conflitam em rebase), mas dependem de APIs internas
do ChartDB: `loadFromDatabaseMetadata`, `loadDatabaseMetadata`, `useStorage`,
`DatabaseType`. Ver a seção de atualização.

## Deploy no Coolify

Aponte o recurso do Coolify para **este fork** (em vez de `chartdb/chartdb`):

- **Repositório**: `mateusrovedaa/chartdb-with-storage`
- **Branch**: `main`
- **Build Pack**: Dockerfile (o `Dockerfile` do fork, já existente)
- **Build Args**: os mesmos `VITE_*` de antes (`VITE_OPENAI_API_KEY`, etc.)
- **Volume (read-only)**: monte o diretório de schemas do host em
  `/usr/share/nginx/schema-data`:
  ```
  /host/chartdb-schema:/usr/share/nginx/schema-data:ro
  ```

Como o fork carrega o código, não há wrapper nem `git apply` no deploy — o Dockerfile do
próprio fork builda a versão já com o patch.

> Se o build estourar memória no Coolify, aumente o heap do Node no build:
> `NODE_OPTIONS=--max-old-space-size=6144` (o `npm run build` do ChartDB é pesado).

### Job que gera os arquivos

Para cada banco monitorado, rodando em cron/CI/systemd timer:

1. Roda a "magic query" do ChartDB no banco (a mesma que o wizard de import mostra na UI,
   por tipo de banco). O resultado é o mesmo JSON de metadata que a UI consome.
2. Escrita **atômica** (evita leitura de arquivo parcial pela UI):
   ```bash
   for db in billing auth analytics; do
     run_magic_query "$db" > "$DEST/$db.json.tmp"
     mv "$DEST/$db.json.tmp" "$DEST/$db.json"
   done
   ```
3. Regenera o índice:
   ```json
   [
     { "id": "billing", "name": "Billing DB", "databaseType": "postgresql", "updatedAt": "2026-07-02T03:00:00Z" },
     { "id": "auth",    "name": "Auth DB",    "databaseType": "postgresql", "updatedAt": "2026-07-02T03:00:00Z" }
   ]
   ```
   `databaseType` é opcional (default `generic`); use um dos valores do enum `DatabaseType`
   (`postgresql`, `mysql`, `sql_server`, `mariadb`, `sqlite`, `clickhouse`, `cockroachdb`,
   `oracle`, `generic`). O `id` precisa casar `^[a-z0-9-_]+$`.

## Atualizar para uma versão nova do ChartDB

Este fork usa o fluxo git padrão de fork (remote `upstream` + merge de tag). **Não é
force-push**, então a branch que o Coolify acompanha não quebra.

```bash
git fetch upstream --tags
git merge v1.21.0        # a tag nova do upstream
# resolver conflitos (prováveis só em default.conf.template e src/router.tsx)
git commit               # se o merge pausou em conflito
```

**Existem dois níveis de quebra numa atualização — o segundo é o traiçoeiro:**

| Nível | Sintoma | Detecção |
|---|---|---|
| Conflito textual | `git merge` para com conflito | Visível na hora |
| API interna mudou | Merge passa, mas `npm run build`/`tsc` quebra | **Só o build pega** |

Os arquivos novos (`live-schemas.ts`, as duas páginas) nunca dão conflito textual, mas se
o upstream renomear/alterar `loadFromDatabaseMetadata`, `loadDatabaseMetadata`,
`useStorage` ou `DatabaseType`, o merge passa e o build falha. **Portanto o teste de
atualização obrigatoriamente inclui build**, não só o merge:

```bash
npm ci
NODE_OPTIONS=--max-old-space-size=6144 npm run build   # tem que passar
npx tsc --noEmit                                        # tem que passar (exit 0)
```

Só depois de o build passar, `git push` e deixar o Coolify rebuildar.

### Patch portátil (opcional)

`patches/0001-live-diagram.patch` guarda o diff isolado das mudanças (gerado com
`git format-patch`). Útil para reaplicar em um clone limpo ou revisar o diff sem o ruído
do merge:

```bash
git apply patches/0001-live-diagram.patch     # aplica sem histórico
# ou
git am patches/0001-live-diagram.patch        # aplica preservando o commit
```

## Validação pós-deploy

- `/live` numa aba anônima → lista todos os schemas do `index.json`.
- Clicar num schema → importa e abre o diagrama sozinho, sem clique adicional.
- Rodar o job com uma alteração + refresh em `/live/{id}` → diagrama reflete a mudança.
- `/live/{id}` acessado várias vezes → só um registro `live-{id}` no IndexedDB
  (o `deleteDiagram` antes do `addDiagram` garante isso).
- `schemaId` inexistente na URL → erro tratado com link de volta pra `/live`, não quebra.

## Licença

Upstream é AGPL-3.0. Rodando este fork modificado como serviço acessível pela rede, a
AGPL pode exigir disponibilizar o código-fonte modificado para quem acessa o serviço —
confirmar com jurídico/compliance se aplicável.
