# 🔧 Troubleshooting: Dashboard não busca dados

## 🎯 Problema
O dashboard no Netlify não está buscando dados do backend no Render.

---

## 📋 Checklist de Verificação

### **1. Verificar URL do Backend no script.js**

Abra o Console do navegador (F12) e verifique os logs:

```
[CONFIG] Ambiente: PRODUÇÃO
[CONFIG] API Base URL: https://dbtotal.onrender.com/api
```

**Problema comum:** URL sem `/api` no final
- ❌ `https://dbtotal.onrender.com`
- ✅ `https://dbtotal.onrender.com/api`

**Solução:**
1. Abra `script.js` linha 9
2. Certifique-se que a URL termina com `/api`:
   ```javascript
   const RENDER_BACKEND_URL = 'https://dbtotal.onrender.com/api';
   ```
3. Faça commit e push

---

### **2. Verificar se o Backend está rodando**

**Teste 1: Acessar URL diretamente no navegador**

Abra: `https://seu-backend.onrender.com/api/health`

Deve retornar:
```json
{"status":"ok","timestamp":"..."}
```

**Se não funcionar:**
- Verifique os logs no Render
- Verifique se o deploy foi concluído com sucesso
- Verifique se as variáveis de ambiente estão configuradas

---

### **3. Verificar CORS**

**Sintoma:** Erro no console:
```
Access to fetch at 'https://...' from origin 'https://...' has been blocked by CORS policy
```

**Solução:**
1. No Render, adicione variável de ambiente:
   ```
   FRONTEND_URL=https://seu-site.netlify.app
   NETLIFY_URL=https://seu-site.netlify.app
   ```
2. Faça novo deploy no Render
3. Verifique se o `server.js` tem CORS configurado (já está configurado)

---

### **4. Verificar Console do Navegador**

Abra o Console (F12) e procure por:

#### **Logs de Configuração:**
```
[CONFIG] Ambiente: PRODUÇÃO
[CONFIG] API Base URL: https://...
```

#### **Logs de Requisições:**
```
[FETCH] Buscando dados financeiros: https://...
[LOGIN] Verificando login viva-saude: https://...
[HEALTH] Verificando saúde do servidor: https://...
```

#### **Erros Comuns:**

**Erro 1: Failed to fetch**
```
[FRONTEND] Erro ao buscar dados financeiros: TypeError: Failed to fetch
```
- **Causa:** Backend não está acessível ou CORS bloqueando
- **Solução:** Verificar se backend está rodando e CORS configurado

**Erro 2: 404 Not Found**
```
[FETCH] Erro na resposta: 404 Not Found
```
- **Causa:** URL incorreta ou rota não existe
- **Solução:** Verificar URL no `script.js` e rotas no `server.js`

**Erro 3: 500 Internal Server Error**
```
[FETCH] Erro na resposta: 500 Internal Server Error
```
- **Causa:** Erro no backend (credenciais não configuradas, etc)
- **Solução:** Verificar logs no Render

---

### **5. Verificar Logs no Render**

1. Acesse o dashboard do Render
2. Clique no seu serviço
3. Vá em **"Logs"**
4. Procure por erros

**Erros comuns:**

**Erro: Credenciais não configuradas**
```
⚠️  AVISO: Algumas credenciais não estão configuradas
```
- **Solução:** Adicionar variáveis de ambiente no Render

**Erro: Port already in use**
```
Error: listen EADDRINUSE: address already in use :::10000
```
- **Solução:** Render usa porta automática, não precisa configurar PORT

---

### **6. Verificar Network Tab**

1. Abra DevTools (F12)
2. Vá em **"Network"** (Rede)
3. Recarregue a página
4. Procure por requisições para o backend

**Verificar:**
- ✅ Status: 200 OK (sucesso)
- ❌ Status: 404 (URL incorreta)
- ❌ Status: 500 (erro no backend)
- ❌ Status: CORS error (problema de CORS)
- ❌ Status: Failed (backend não acessível)

---

## 🔍 Passo a Passo de Debug

### **Passo 1: Verificar Configuração**

1. Abra o site no Netlify
2. Abra Console (F12)
3. Procure por `[CONFIG]`
4. Verifique se a URL está correta

### **Passo 2: Testar Backend Diretamente**

1. Abra nova aba
2. Acesse: `https://seu-backend.onrender.com/api/health`
3. Deve retornar JSON com `{"status":"ok"}`

### **Passo 3: Verificar Requisições**

1. No Console, procure por `[FETCH]` ou `[LOGIN]`
2. Veja se há erros
3. Copie a URL e teste diretamente no navegador

### **Passo 4: Verificar CORS**

1. No Console, procure por erros de CORS
2. Se houver, verifique variáveis de ambiente no Render
3. Faça novo deploy

---

## 🛠️ Soluções Rápidas

### **Solução 1: URL Incorreta**

**Problema:** URL sem `/api` ou URL errada

**Solução:**
```javascript
// script.js linha 9
const RENDER_BACKEND_URL = 'https://dbtotal.onrender.com/api'; // ✅ Com /api
```

### **Solução 2: Backend não está rodando**

**Problema:** Deploy falhou ou backend parou

**Solução:**
1. Verificar logs no Render
2. Verificar se variáveis de ambiente estão configuradas
3. Fazer novo deploy se necessário

### **Solução 3: CORS bloqueando**

**Problema:** Frontend não consegue acessar backend

**Solução:**
1. No Render, adicionar:
   ```
   FRONTEND_URL=https://seu-site.netlify.app
   NETLIFY_URL=https://seu-site.netlify.app
   ```
2. Fazer novo deploy

### **Solução 4: Credenciais não configuradas**

**Problema:** Backend inicia mas não funciona

**Solução:**
1. No Render, adicionar todas as credenciais:
   ```
   VIVA_SAUDE_USERNAME=...
   VIVA_SAUDE_PASSWORD=...
   COOP_VITTA_USERNAME=...
   COOP_VITTA_PASSWORD=...
   DELTA_USERNAME=...
   DELTA_PASSWORD=...
   ```
2. Fazer novo deploy

---

## 📞 Informações para Suporte

Se precisar de ajuda, forneça:

1. **URL do Frontend (Netlify):** `https://...`
2. **URL do Backend (Render):** `https://...`
3. **Logs do Console (F12):** Copie todos os logs que começam com `[CONFIG]`, `[FETCH]`, `[LOGIN]`, `[HEALTH]`
4. **Logs do Render:** Últimas 50 linhas dos logs
5. **Screenshot do Network Tab:** Mostrando as requisições falhando

---

## ✅ Checklist Final

- [ ] URL do backend está correta no `script.js` (termina com `/api`)
- [ ] Backend está rodando (teste `/api/health`)
- [ ] Variáveis de ambiente configuradas no Render
- [ ] CORS configurado (variáveis `FRONTEND_URL` e `NETLIFY_URL`)
- [ ] Console do navegador não mostra erros de CORS
- [ ] Network tab mostra requisições com status 200
- [ ] Logs do Render não mostram erros críticos

