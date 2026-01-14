# 🔧 Corrigir Erros do Cloudflare Tunnel

## ⚠️ Erros Identificados

### 1. **Avisos de Certificado** (NÃO CRÍTICOS)

```
ERR Cannot determine default origin certificate path
INF cloudflared does not support loading the system root certificate pool on Windows
```

**Status:** ✅ **Podem ser ignorados** - são apenas avisos informativos, não afetam o funcionamento.

---

### 2. **Erros Críticos: "context canceled"** ⚠️

```
ERR error="Incoming request ended abruptly: context canceled"
ERR Request failed error="Incoming request ended abruptly: context canceled"
```

**Status:** ❌ **CRÍTICO** - As requisições estão sendo canceladas antes de completar.

---

## 🎯 Causa do Problema

Os erros "context canceled" acontecem quando:

1. **Servidor demora muito para responder** (30-60+ segundos)
2. **Cloudflare Tunnel tem timeout padrão** (~90 segundos)
3. **Requisições com Puppeteer são muito lentas**
4. **Servidor sobrecarregado** (450+ processos)

**O que acontece:**
- Requisição chega no Cloudflare Tunnel
- Tunnel encaminha para `localhost:3000`
- Servidor processa (demora 30-60s com Puppeteer)
- Cloudflare cancela a conexão antes de receber a resposta
- Erro "context canceled"

---

## ✅ Soluções

### **Solução 1: Usar Cache (RECOMENDADO)** ⭐

As otimizações implementadas (sistema de fila + cache) devem resolver isso:

**Como funciona:**
- ✅ 99% das requisições retornam do cache (< 1ms)
- ✅ Apenas primeira requisição executa Puppeteer
- ✅ Respostas instantâneas = sem timeout

**Verificar se está funcionando:**
1. Reinicie o servidor: `npm start`
2. Aguarde 10 segundos (cache pré-carregado)
3. Teste novamente - requisições devem ser instantâneas

---

### **Solução 2: Aumentar Timeout do Cloudflare** ⚙️

Adicione timeout maior ao comando do tunnel:

```bash
# ANTES
cloudflared tunnel --url http://localhost:3000

# DEPOIS (com timeout maior)
cloudflared tunnel --url http://localhost:3000 --connect-timeout 300s --grace-period 30s
```

**Observação:** O timeout padrão é ~90s. Aumentar para 300s pode ajudar, mas a melhor solução é usar cache (Solução 1).

---

### **Solução 3: Aumentar TTL do Cache** ⏱️

Se ainda tiver problemas, aumente o tempo de cache:

**Edite `server.js`, linha ~176-179:**

```javascript
config: {
    TTL_LOGINS: 15 * 60 * 1000, // 15 minutos (era 5)
    TTL_FINANCEIRO: 30 * 60 * 1000, // 30 minutos (era 10)
    UPDATE_INTERVAL: 14 * 60 * 1000 // 14 minutos (era 4)
}
```

Isso reduz ainda mais a frequência de processos Puppeteer.

---

### **Solução 4: Deploy em Cloud (DEFINITIVA)** 🚀

Os erros "context canceled" acontecem porque:
- Servidor local está sobrecarregado
- Processos Puppeteer são muito pesados
- Cloudflare Tunnel tem timeout limitado

**Solução definitiva:** Fazer deploy em cloud (Railway, Fly.io, VPS)

**Benefícios:**
- ✅ Recursos dedicados
- ✅ Sem timeout de tunnel
- ✅ Performance melhor
- ✅ Zero carga no PC

Veja: `ALTERNATIVAS_HOSPEDAGEM.md`

---

## 📊 Diagnóstico

### **Verificar se Cache está Funcionando:**

1. Abra o console do servidor (terminal onde roda `npm start`)
2. Procure por logs como:
   ```
   [CACHE] ✅ Retornando dados do cache para viva-saude
   [CACHE] ✅ Retornando dados do cache para coop-vitta
   ```
3. Se ver esses logs = cache funcionando ✅
4. Se não ver = cache não está sendo usado ❌

### **Verificar Tempo de Resposta:**

1. Acesse diretamente: `http://localhost:3000/api/health`
2. Se responder instantaneamente (< 1s) = OK ✅
3. Se demorar > 5s = problema ⚠️

### **Verificar se Puppeteer está Rodando:**

1. Olhe o console do servidor
2. Se ver logs como `[PUPPETEER] Tentativa X/Y - Iniciando Chrome...` = Puppeteer rodando (demora)
3. Se não ver = usando cache (rápido) ✅

---

## 🔍 Ordem de Prioridade para Resolver

1. **✅ PRIMEIRO:** Verificar se cache está funcionando (Solução 1)
2. **✅ SEGUNDO:** Se cache não estiver funcionando, verificar configuração
3. **⚠️ TERCEIRO:** Aumentar timeout do Cloudflare (Solução 2)
4. **⏱️ QUARTO:** Aumentar TTL do cache (Solução 3)
5. **🚀 QUINTO:** Fazer deploy em cloud (Solução 4 - definitiva)

---

## 🆘 Se Nada Funcionar

Se mesmo com cache você ainda ver erros "context canceled":

1. **Verifique logs do servidor:**
   - Requisições devem aparecer instantaneamente no log
   - Se demorar > 1s, cache não está funcionando

2. **Verifique se servidor está respondendo:**
   - Teste: `http://localhost:3000/api/health`
   - Deve responder em < 1 segundo

3. **Considere deploy em cloud:**
   - É a única forma de garantir performance constante
   - Veja: `ALTERNATIVAS_HOSPEDAGEM.md`

---

## ✅ Checklist de Verificação

- [ ] Cache está funcionando (logs mostram "Retornando dados do cache")
- [ ] Requisições locais são rápidas (< 1s)
- [ ] Servidor não está sobrecarregado (CPU < 50%)
- [ ] Timeout do Cloudflare aumentado (se necessário)
- [ ] TTL do cache aumentado (se necessário)

---

## 📝 Resumo

**Problema:** Cloudflare Tunnel cancela requisições porque servidor demora muito.

**Solução Imediata:** 
- ✅ Usar cache (já implementado)
- ✅ Verificar se cache está funcionando
- ✅ Requisições devem ser instantâneas (< 1ms)

**Solução Definitiva:**
- 🚀 Deploy em cloud (Railway, Fly.io, VPS)

---

## 🎯 Resultado Esperado

Após implementar as soluções:
- ✅ Requisições instantâneas (cache)
- ✅ Sem erros "context canceled"
- ✅ Cloudflare Tunnel funcionando perfeitamente
- ✅ Servidor estável
