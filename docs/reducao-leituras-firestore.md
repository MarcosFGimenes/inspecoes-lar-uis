# Estratégias para Reduzir Leituras do Firestore

Abaixo estão **estratégias eficazes** para reduzir as **leituras** (e, portanto, o custo):

---

## 🔹 1. Evite leituras em tempo real desnecessárias

**Problema:** `onSnapshot()` mantém uma conexão aberta e cobra leitura toda vez que há atualização.
**Solução:**

* Use `getDocs()` quando não precisar de atualização em tempo real.
* Use `onSnapshot()` **apenas** para coleções críticas (por exemplo, alertas ao vivo).
* Em painéis, atualize manualmente com um botão “Recarregar” ou intervalos maiores (ex: a cada 5 minutos).

```js
// Use somente quando necessário
const snapshot = await getDocs(collection(db, "usuarios"));
```

---

## 🔹 2. Filtrar e paginar as consultas

**Problema:** Painéis costumam carregar coleções inteiras (milhares de docs).
**Solução:**

* Utilize **`limit()`** e **paginação** com `startAfter()`.
* Combine com filtros (`where`) para reduzir os dados retornados.

```js
const q = query(collection(db, "agendamentos"), where("status", "==", "pendente"), limit(20));
```

---

## 🔹 3. Cache e persistência local

**Solução:**
Ative **cache offline** e reaproveite dados já carregados, evitando leituras repetidas em páginas que o usuário revisita.

```js
enableIndexedDbPersistence(db);
```

---

## 🔹 4. Consolidar dados agregados

**Problema:** Painéis com estatísticas (ex: total de usuários, total de vendas) fazem várias leituras para contar.
**Solução:**

* Mantenha **documentos agregados** (com totais atualizados por Cloud Functions).
* Assim, você lê **1 documento com resumo** em vez de milhares.

```js
// Exemplo de documento agregado
{
  totalUsuarios: 1823,
  totalAtivos: 1732,
  totalInativos: 91
}
```

---

## 🔹 5. Agrupar subcoleções em snapshots otimizados

Evite múltiplos `getDocs()` dentro de loops.
Em vez de buscar subcoleções uma a uma, mantenha índices ou referências no documento pai.

---

## 🔹 6. Usar cache de API (proxy/backend)

Se o painel for web, crie um **backend intermediário (Node/Express, Cloud Functions, etc.)**:

* Ele faz a leitura do Firestore **apenas uma vez**, guarda em cache (Redis, memória, etc.), e o painel consome via API.
* Ideal para dashboards acessados com frequência.

---

## 🔹 7. Atualizações diferenciais

Quando for necessário atualizar dados, carregue apenas **mudanças recentes**:

```js
const q = query(collection(db, "pedidos"), where("updatedAt", ">", ultimaConsulta));
```

---

## 🔹 8. Limite os campos retornados

Se estiver usando Firestore com SDK Admin ou REST API, selecione apenas os campos necessários (`select()`).

```js
const q = query(collection(db, "usuarios")).select("nome", "email");
```

---

## 🔹 9. Pré-processar relatórios

Para gráficos ou relatórios, use **Cloud Functions agendadas** (via `pub/sub`) que geram documentos de resumo diários. Assim o painel lê apenas dados prontos.

---

## 🔹 10. Monitorar com Firestore Usage Dashboard

No console do Firebase → *Usage → Cloud Firestore → Reads by collection*
→ Identifique as coleções com maior custo e otimize apenas onde realmente pesa.

---

> Estas recomendações ajudam a reduzir custos e otimizar a performance de aplicações que utilizam o Firestore em dashboards e painéis administrativos.
