# Inventário de Dados

## Visão geral

O projeto usa exclusivamente o Firestore (SDK Admin no backend e SDK Web nas telas) para persistir inspeções, máquinas, mantenedores, assinaturas e a programação de manutenções. A maioria das entidades principais fica em coleções na raiz do banco, com alguns campos complexos (objetos/arrays) armazenando relacionamentos e estados derivados. Não existem ORMs adicionais; toda a leitura e escrita é feita diretamente pelos handlers HTTP do Next.js ou por componentes client-side que consomem o Firestore.

Abaixo está o mapa das coleções identificadas, seus campos e onde são manipuladas. As referências de código utilizam `arquivo:linha` (linhas aproximadas extraídas via `nl -ba`).

## Coleções

### `machines` (coleção primária) e `maquinas` (legado)
- **Descrição:** catálogo de ativos/ máquinas inspecionadas. A coleção `maquinas` é lida como fallback para dados antigos.
- **Campos principais:**
  - `tag: string` (única, pode ser string numérica) — chave usada pelos mantenedores (`api/inspecoes`, `api/inspecao/context`).
  - `nome: string`, `setor: string`, `unidade: string`, `localUnidade: string`, `lac: string`.
  - `fotoUrl?: string`, `templateId?: string`, `ativo?: boolean`, `codTarefa?: string`, `createdAt?: string`.
- **Uso em código:**
  - CRUD administrativo: `src/app/api/maquinas/route.ts:59-76` cria documentos; `GET` usa `listAllMachines` (`src/lib/db/machines.ts`).
  - Resolução/compatibilidade com coleções legadas: `src/lib/db/machines.ts:5-320` acessa `machines` e `maquinas` por ID/tag, gera índices para programação.
  - Listagem para mantenedores: `src/app/api/me/machines/route.ts:15-55`.
  - Importação de programação cruza máquinas por tag/ID: `src/app/api/programacao/upload/route.ts:105-208`.
  - UI administrativa usa SDK client: `src/app/admin/checklists/page.tsx:151-190`, `src/app/admin/nc/page.tsx:184-210`.

### `mantenedores`
- **Descrição:** usuários operadores (manutenção). Guarda credenciais, atribuições e metadados.
- **Campos principais:**
  - `matricula: string` (única), `nome: string`, `setor: string`, `lac: string`, `ativo: boolean`.
  - `passwordHash: string`, `createdAt: string`, `updatedAt?: string`.
  - `machines?: string[]` (lista de IDs de máquinas atribuídas).
- **Uso em código:**
  - CRUD administrativo: `src/app/api/mantenedores/route.ts:39-104` (listagem/criação); `src/app/api/mantenedores/[id]/route.ts:49-173` (edição/remoção).
  - Atribuição de máquinas: `src/app/api/mantenedores/[id]/machines/route.ts:78-188`.
  - Autenticação e sessão: `src/app/api/auth/maint/login/route.ts:18-48`.
  - Contexto de inspeção e acesso: `src/app/api/inspecao/context/route.ts:27-53`, `src/app/api/inspecoes/route.ts:131-143`, `src/app/api/me/machines/route.ts:15-45`.
  - Importação de programação carrega mantenedores: `src/app/api/programacao/upload/route.ts:158-208`.
  - UI administrativa (SDK client): `src/app/admin/checklists/page.tsx:152-190`.

### `templates`
- **Descrição:** checklists e itens de inspeção.
- **Campos principais:**
  - `nome: string`, `imagemUrl?: string`, `createdAt: string`.
  - `itens: { id: string; componente: string; oQueChecar: string; instrumento: string; criterio: string; oQueFazer: string; imagemItemUrl?: string; ordem: number; createdAt: string; }[]`.
- **Uso em código:**
  - CRUD administrativo: `src/app/api/templates/route.ts:23-94`, `src/app/api/templates/[id]/route.ts:37-123`.
  - Resolução de template em inspeções: `src/app/api/inspecao/context/route.ts:45-74`, `src/app/api/inspecoes/route.ts:149-176`, `src/app/api/inspecoes/[id]/route.ts:165-233`, `src/app/api/inspecoes/[id]/pdf/route.ts:135-169`.
  - Drafts reutilizam itens do template: `src/app/api/inspecoes/drafts/[tag]/route.ts:110-210`.
  - UI administrativa consulta via SDK client: `src/app/admin/checklists/page.tsx:153-190`, `src/app/admin/nc/page.tsx:185-205`.

### `inspectionDrafts`
- **Descrição:** rascunhos de inspeção salvos por mantenedores antes de finalizar.
- **Campos principais (salvos em `PUT`):** `maintainerId`, `machineId`, `machineTag`, `machineNome`, `machineSetor`, `machineUnidade`, `templateId`, `templateNome`, `osNumero?`, `observacoes?`, `assinaturaDataUrl?`, `itens` (mapa `templateItemId -> { resultado, observacao?, osNumero?, fotos: DraftFoto[] }`), `totalItens`, `answeredItens`, `progressPercent`, `resolveIssues: string[]`, `updatedAt`, `createdAt`.
- **Uso em código:**
  - Listagem para mantenedor: `src/app/api/inspecoes/drafts/route.ts:25-63`.
  - CRUD por máquina/tag: `src/app/api/inspecoes/drafts/[tag]/route.ts:178-360` (GET/PUT/DELETE).

### `inspecoes`
- **Descrição:** registros completos de inspeções (respostas, assinaturas, NCs, vínculos com programação/OS).
- **Campos principais:**
  - `machine: { machineId, tag, nome, setor, unidade, localUnidade, lac, fotoUrl?, templateId }`.
  - `template: { id, nome }`.
  - `maintainer: { maintId, nome?, matricula? }`.
  - `osNumero?: string`, `programacaoId?: string`, `programacaoBatchId?: string`, `prazoProgramado?: string`, `prazoProgramadoTimestamp?: Timestamp`, `observacoes?: string`.
  - `assinaturaUrl?: string` (mantenedor). `pcmSign?: { nome: string; cargo?: string; matricula: string; assinaturaUrl: string; signedAt: string }`.
  - `itens: { templateItemId; resultado; observacaoItem?; fotos: string[]; osNumeroItem?: string }[]` (estrutura original).
  - `answers: { questionId; questionText?; response: "c" | "nc" | "na"; observation?; photoUrls: string[]; itemOsNumero?: string; recurrence?: boolean }[]` (formato novo).
  - `nonConformityTreatments: { questionId; status: "open" | "resolved" | ...; createdAt: string; updatedAt?: string; summary?; responsible?; dueDate? }[]`.
  - `qtdNC: number`, `issuesCriadas: string[]`, `issuesResolvidas: string[]`.
  - Timestamps: `createdAt`, `createdAtTimestamp`, `iniciadaEm`, `iniciadaEmTimestamp`, `finalizadaEm`, `finalizadaEmTimestamp`, `updatedAt?`.
- **Uso em código:**
  - Criação de inspeção e abertura de issues: `src/app/api/inspecoes/route.ts:211-436`.
  - Edição/Admin (tratativas, anexos, assinatura PCM): `src/app/api/inspecoes/[id]/route.ts:146-488`, `src/app/api/inspecoes/[id]/pcm-sign/route.ts:33-112`.
  - Listagens: mantenedor (`src/app/api/me/inspecoes/route.ts:35-120`), pendentes de assinatura (`src/app/api/inspecoes/pending-sign/route.ts:33-116`), relatórios (páginas em `/admin` consultam via SDK client: `src/app/admin/checklists/page.tsx:154-338`, `src/app/admin/nc/page.tsx:184-360`, `src/app/admin/inspecoes/page.tsx:70-140`).
  - Geração de PDF: `src/app/api/inspecoes/[id]/pdf/route.ts:103-260`.
  - KPI programação vincula inspeções concluídas: `src/app/api/programacao/kpis/route.ts:118-198`.

### `issues`
- **Descrição:** não conformidades abertas por item (NC) associadas à máquina/inspeção. Usadas para reabrir/atualizar NCs e resolver pendências.
- **Campos principais:**
  - `machineId: string`, `tag?: string`, `templateItemId: string`.
  - `descricao: string`, `osNumero?: string`, `fotos: string[]`.
  - `status: "aberta" | "resolvida"`.
  - `abertaEmInspecaoId: string`, `resolvidaEmInspecaoId?: string`.
  - `createdAt: string`, `resolvedAt?: string`.
- **Uso em código:**
  - Pré-carregamento de contexto da inspeção (mostrar NCs abertas): `src/app/api/inspecao/context/route.ts:56-92`.
  - Criação/atualização ao salvar inspeção: `src/app/api/inspecoes/route.ts:305-377`.
  - Edição de inspeção atualiza/resolve issues existentes: `src/app/api/inspecoes/[id]/route.ts:256-400`.

### `assinaturas`
- **Descrição:** perfis de assinatura para PCM (administrativo) e mantenedores (autosalvos).
- **Campos principais:**
  - Com `type: "pcm"`: `nome`, `nomeNormalized`, `matricula`, `assinaturaUrl?`, `createdAt`, `updatedAt`.
  - Com `type: "maintainer"`: `maintainerId`, `nome?`, `assinaturaUrl?`, `createdAt`, `updatedAt`.
- **Uso em código:**
  - Gestão de perfis PCM: `src/app/api/assinaturas/pcm/route.ts:29-124`.
  - Assinatura do mantenedor (self-service): `src/app/api/assinaturas/maint/route.ts:25-108`.
  - Validação de assinatura em inspeções: `src/app/api/inspecoes/route.ts:217-236`, `src/app/api/inspecoes/[id]/pcm-sign/route.ts:45-84`.

### `programacoes_inspecao`
- **Descrição:** programação importada de O.S. vinculadas às inspeções (backlog preventivo). Serve como “agenda” atual.
- **Campos principais:**
  - `batchId: string` (identifica lote importado), `osNumero: string`.
  - `machine: { tag; nome; machineId?; templateId?; codTarefaConfigurado?; machineNotFound: boolean }`.
  - `manutencao: { tipo?: string; criticidade?: string; descricaoTarefa?: string; codTarefa: string; periodicidade?: number }`.
  - `manutencao.severity?: SeverityState` (novo) — mantém criticidades do mantenedor/assinador e `effective`.
  - `datas: { emissao?: string; emissaoDate?: number; vencimento: string; vencimentoDate: number; fechamento?: string; fechamentoDate?: number }`.
  - `datas.programada?: string`, `datas.prazo?: string` — datas definidas na programação manual.
  - `responsavel: { nome?: string; nomeNormalizado?: string | null; maintId?: string | null; matricula?: string | null; origem?: "machine" | "nome" | "csv" | null }`.
  - `responsaveis: Array<{ maintId?: string | null; nome?: string | null; matricula?: string | null; origem?: string | null }>`.
  - `responsavelIds: string[]`, `responsavelNomesNormalizados: string[]`.
  - `oficinaDestino?: string`, `gut?: number`, `tempoPrevistoHoras?: number`, `tipoOS?: string`, `situacaoOS?: string`.
  - `horasEstimadas: { eletrica?: number | null; mecanica?: number | null; outras?: number | null }`.
  - Estados: `status: "PENDENTE" | "CONCLUIDA"`, `atrasada: boolean`, `createdAt` (server timestamp), `updatedAt`.
  - `agendamento: { status: "programado" | string; programadoEm: string; programadoPor?: { tipo: string }; programadoPara?: string; prazo?: string | null }` — registro do agendamento manual.
  - Após inspeção: `concluidaEm?: string`, `concluidaEmTimestamp?: Timestamp`, `inspecaoId?: string`, `prazoProgramado?: string`, `prazoProgramadoTimestamp?: Timestamp`, `finalizadaNoPrazo?: boolean`.
- **Uso em código:**
  - Importação CSV + criação em lote: `src/app/api/programacao/upload/route.ts:230-520`.
  - Consulta resumo para dashboard admin: `src/app/api/programacao/programacoes/route.ts:32-128`.
  - Indicadores/KPIs: `src/app/api/programacao/kpis/route.ts:96-230`.
  - Status geral: `src/app/api/programacao/status/route.ts:35-106`.
  - Programação do mantenedor (filtro por responsável): `src/app/api/me/programacoes/route.ts:31-118`.
  - Vinculação quando inspeção é concluída: `src/app/api/inspecoes/route.ts:180-234`, `src/app/api/inspecoes/route.ts:421-434`.

### `config_programacao`
- **Descrição:** guarda a configuração do lote de programação ativo.
- **Campos principais (`activeBatch` doc):** `batchIdAtual?: string`, `uploadedAt?: Timestamp|string`, `uploadedBy?: { uid: string; name?: string | null }`.
- **Uso em código:** `src/app/api/programacao/upload/route.ts:304-342`, `src/app/api/programacao/programacoes/route.ts:32-44`, `src/app/api/programacao/status/route.ts:35-62`.

## Relações e fluxos observados
- **Inspeções ↔ Programação:** `inspecoes.programacaoId` liga à `programacoes_inspecao`. Ao concluir uma inspeção, o handler marca a programação como `CONCLUIDA`, grava `inspecaoId` e calcula `finalizadaNoPrazo` (`src/app/api/inspecoes/route.ts:421-434`).
- **Inspeções ↔ Issues:** cada resposta `NC` abre/atualiza um documento em `issues` e adiciona referências `issuesCriadas` / `issuesResolvidas` na inspeção (`src/app/api/inspecoes/route.ts:305-377`).
- **Tratativas de NC:** administradores editam `inspecoes.nonConformityTreatments` (ex.: resumo, responsável, prazo) via `/admin/nc` (`src/app/admin/nc/page.tsx:320-360`), sem coleção separada.
- **Assinaturas:** mantenedores salvam assinatura em `assinaturas` (perfil `maint__ID`); PCM assina inspeções usando perfil `pcm__` ou upload direto (`src/app/api/inspecoes/[id]/pcm-sign/route.ts`).
- **Programações atrasadas:** diversos endpoints filtram `programacoes_inspecao.datas.vencimento` e `status` para relatórios (`src/app/api/programacao/status/route.ts`, `src/app/api/programacao/kpis/route.ts`).
- **Agendamentos manuais:** `src/app/api/programacao/agendamento/schedule/route.ts` atualiza `programacoes_inspecao` com `datas.programada`, `datas.prazo`, `responsavel(responsaveis)` e `agendamento.status`.
- **Consultas para programação:**
  - `/api/programacao/agendamento/ncs` lista NCs abertas com severidade efetiva e vínculos de OS (`src/app/api/programacao/agendamento/ncs/route.ts`).
  - `/api/programacao/agendamento/agenda` retorna programações agendadas com filtros por período/área/severidade (`src/app/api/programacao/agendamento/agenda/route.ts`).
  - `/api/programacao/agendamento/export` exporta a visão filtrada para Excel (`src/app/api/programacao/agendamento/export/route.ts`).

## Sugestões para novas funcionalidades
- **Criticidade (mantenedor/PCM):**
  - Usar `issues` como entidade central de NC (há um documento por item aberto). Adicionar campo opcional `severity: { maintainer?: Severity; maintainerAt?: Timestamp; signer?: Severity | null; signerAt?: Timestamp | null; effective?: Severity; updatedBy?: { role: "maint" | "pcm"; id: string }; updatedAt?: Timestamp }`.
  - Em inspeções, armazenar snapshot da criticidade efetiva dentro de cada entrada relevante (`answers` ou `nonConformityTreatments`) para histórico, sem remover campos existentes.
  - Adapter pode derivar `effective = signer ?? maintainer` e expor helpers `getEffectiveSeverity(issueDoc)` e `propagateSeverityToWO(issueDoc.id)` para sincronizar com programação/OS.

- **Propagação para programação/OS:**
  - `programacoes_inspecao.manutencao.criticidade` já existe como string; preservar valor original e acrescentar `severity?: SeverityState` contendo os dois papéis. Atualizar quando o assinador definir criticidade e expor no adapter para os componentes novos.
  - Salvar também a criticidade efetiva no documento da inspeção (`inspecoes.nonConformityTreatments[].severity`) para que relatórios históricos permaneçam coerentes.

- **Programar manutenção (nova tela):**
  - Buscar NCs abertas consultando `issues` join com dados da inspeção (`inspecoes`) e da programação vinculada (`programacoes_inspecao` via `osNumero` / `inspecoes.programacaoId`). O adapter pode montar DTOs agregando `machine`, `descricao`, `severity.effective` e filtros por área (usar `machines.setor` ou `programacoes_inspecao.manutencao.tipo`, conforme hoje).
  - Armazenar responsáveis selecionados reutilizando campos existentes em `programacoes_inspecao` (`responsavel` principal, `responsaveis`, `responsavelIds`). Para “Mantenedor 1/2”, usar `responsaveis[0/1]` mantendo compatibilidade.
  - Registrar datas planejadas usando `programacoes_inspecao.datas` (`vencimento` como data programada) e campos adicionais opcionais `datas.programada`/`datas.prazo` se necessário.

- **Agenda/Lista + Exportação:**
  - Basear-se em `programacoes_inspecao` como fonte; aplicar filtros por área via `manutencao.tipo` ou metadado do ativo. Exportação pode utilizar `lib/csv.ts`/`xlsx` (não há lib atual para XLSX; caso precise, adicionar mantendo padrão do projeto).

Essas extensões preservam as coleções existentes, adicionando apenas campos opcionais e lógica no adapter (`src/lib/adapters/dataAdapter.ts`) para unificar leitura/escrita sem quebrar fluxos já em produção.
