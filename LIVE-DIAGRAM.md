# Live Diagram — fork do ChartDB self-hosted

Este fork adiciona ao ChartDB self-hosted a funcionalidade **Live Diagram**: uma URL
fixa que carrega automaticamente um diagrama a partir de um **JSON em disco**, sem import
manual e **sem conectar no banco**. O JSON é servido pelo Nginx do container a partir de
um volume montado.

- **Base do upstream**: `chartdb/chartdb` v1.20.1 (commit `c24936a`).
- **Upstream remoto**: `https://github.com/chartdb/chartdb.git` (remote `upstream`).

## Formato do JSON: export de diagrama (não é a magic query)

A página `/live/:schemaId` consome o **JSON de export de diagrama do próprio ChartDB**
(`diagramFromJSONInput`), o mesmo formato do botão **Export diagram → JSON** na UI. Ou
seja: você monta/importa o diagrama uma vez no ChartDB, exporta pra JSON, e joga o arquivo
no volume. Nada de rodar SQL no banco em runtime.

Como obter o JSON:
- **Pela UI**: abra um diagrama → menu **Export diagram** → **JSON**. O arquivo baixado é
  exatamente o que vai em `{id}.json`.
- **À mão**: veja `schema-data-sample/demo.json` neste repo — é um diagrama mínimo válido
  (2 tabelas + 1 relação) que serve de template.

## Como funciona

```
[voce/CI] --escreve--> /host/chartdb-schema/
                         ├── billing.json       (export de diagrama do ChartDB)
                         ├── auth.json
                         └── index.json          (lista os schemas + updatedAt)
                                │ (bind mount, read-only)
                                ▼
               container chartdb (este fork)
               Nginx serve tudo em /schema-data/*
                                │
        ┌───────────────────────┴──────────────────────┐
   rota /live                                  rota /live/:schemaId
   lista os schemas de                          fetch /schema-data/{id}.json,
   /schema-data/index.json                      diagramFromJSONInput(json),
   e linka pra /live/:schemaId                  grava no IndexedDB com id fixo
                                                "live-{id}", navega pro diagrama
```

Cada navegador importa o diagrama para o **seu próprio IndexedDB local**. O que é
centralizado é a *fonte* (`{id}.json`), não o diagrama. Resolve "abrir e já ver o schema
atualizado"; não é edição colaborativa em tempo real.

## O que mudou em relação ao upstream

| Arquivo | Mudança |
|---|---|
| `default.conf.template` | Bloco `location /schema-data/` servindo o volume montado |
| `Dockerfile` | `NODE_OPTIONS=--max-old-space-size=4096` (vite estoura heap padrão) |
| `src/router.tsx` | Rotas `live` e `live/:schemaId` (antes do catch-all `*`) |
| `src/lib/live-schemas.ts` | **novo** — fetch do índice, validação de id, id do diagrama |
| `src/pages/live-index-page/live-index-page.tsx` | **novo** — lista de schemas |
| `src/pages/live-diagram-page/live-diagram-page.tsx` | **novo** — import automático via `diagramFromJSONInput` |
| `schema-data-sample/` | Exemplos de `demo.json` + `index.json` para teste |

3 dos arquivos de código são **novos** (não conflitam em rebase), mas dependem de APIs
internas do ChartDB: `diagramFromJSONInput`, `useStorage`. Ver a seção de atualização.

## Como testar

### Teste local rápido (sem Coolify, sem banco)

```bash
docker build -t chartdb-live .
docker run -d -p 8080:80 \
  -v "$(pwd)/schema-data-sample:/usr/share/nginx/schema-data:ro" \
  --name chartdb-live chartdb-live
```

Abra `http://localhost:8080/live` numa aba anônima:
- Deve listar **Demo DB** (vindo de `index.json`).
- Clicar → importa e abre o diagrama sozinho, com as tabelas `users`/`orders` e a relação.

Para testar seu próprio diagrama: exporte um pela UI (Export diagram → JSON), salve como
`schema-data-sample/<seu-id>.json` e adicione a entrada em `index.json`. Refresh em `/live`.

### Teste no Coolify

Depois do deploy (abaixo), com o volume montado, é o mesmo fluxo: `/live` lista, clique
abre. Rode o job/atualize o `{id}.json` no host + refresh em `/live/{id}` → reflete a
mudança.

## Deploy no Coolify

Aponte o recurso do Coolify para **este fork** (em vez de `chartdb/chartdb`):

- **Repositório**: `mateusrovedaa/chartdb-with-storage`, branch `main`
- **Build Pack**: Dockerfile (o `Dockerfile` do fork)
- **Build Args**: os mesmos `VITE_*` de antes
- **Volume (read-only)**: `/host/chartdb-schema:/usr/share/nginx/schema-data:ro`

O `id` de cada schema precisa casar `^[a-z0-9-_]+$`. `index.json`:

```json
[
    { "id": "billing", "name": "Billing DB", "updatedAt": "2026-07-02T03:00:00Z" },
    { "id": "auth",    "name": "Auth DB",    "updatedAt": "2026-07-02T03:00:00Z" }
]
```

Escrita **atômica** ao atualizar (evita leitura parcial pela UI):

```bash
cp novo-billing.json "$DEST/billing.json.tmp" && mv "$DEST/billing.json.tmp" "$DEST/billing.json"
```

## Atualizar para uma versão nova do ChartDB

Fluxo git padrão de fork (remote `upstream` + merge de tag), sem force-push:

```bash
git fetch upstream --tags
git merge v1.21.0
# resolver conflitos (prováveis só em default.conf.template, Dockerfile e src/router.tsx)
```

**Dois níveis de quebra — o segundo é o traiçoeiro:**

| Nível | Sintoma | Detecção |
|---|---|---|
| Conflito textual | `git merge` para com conflito | Visível na hora |
| API interna mudou | Merge passa, mas `npm run build`/`tsc` quebra | **Só o build pega** |

Os arquivos novos nunca dão conflito textual, mas se o upstream mudar `diagramFromJSONInput`
ou `useStorage`, o merge passa e o build falha. **Teste de atualização inclui build:**

```bash
npm ci
NODE_OPTIONS=--max-old-space-size=4096 npm run build   # tem que passar
```

### Patch portátil

`patches/0001-live-diagram.patch` guarda todo o diff da feature (gerado com
`git format-patch` contra `c24936a`). Reaplicável num clone limpo do upstream:

```bash
git am patches/0001-live-diagram.patch      # preserva o commit
# ou
git apply patches/0001-live-diagram.patch   # aplica sem histórico
```

## Licença

Upstream é AGPL-3.0. Rodando este fork modificado como serviço acessível pela rede, a
AGPL pode exigir disponibilizar o código-fonte modificado para quem acessa o serviço —
confirmar com jurídico/compliance se aplicável.
