# ⚡ Início Rápido - Deploy em Cloud (Solução Definitiva)

## 🎯 Objetivo

Mover o backend do seu PC para a nuvem (Render) para resolver o problema de performance definitivamente.

---

## 📋 Checklist Rápido (5 passos)

### 1. ✅ Criar Conta e Serviço no Render (5 min)

1. Acesse: https://dashboard.render.com
2. Clique em **"New +"** → **"Web Service"**
3. Conecte GitHub e selecione o repositório
4. Configure:
   - **Name:** `dbtotal-backend`
   - **Build Command:** `export PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer && npm install && npx puppeteer browsers install chrome`
   - **Start Command:** `node server.js`
5. Clique em **"Create Web Service"**

### 2. ✅ Adicionar Variáveis de Ambiente (3 min)

No painel do serviço → **"Environment"** → Adicione:

```env
NODE_ENV=production
PORT=10000
VIVA_SAUDE_USERNAME=seu_usuario
VIVA_SAUDE_PASSWORD=sua_senha
COOP_VITTA_USERNAME=seu_usuario
COOP_VITTA_PASSWORD=sua_senha
DELTA_USERNAME=seu_usuario
DELTA_PASSWORD=sua_senha
```

### 3. ✅ Aguardar Deploy (10-15 min)

Aguarde o build completar. Copie a URL gerada (ex: `https://dbtotal-backend.onrender.com`)

### 4. ✅ Atualizar Frontend (2 min)

Abra `script.js`, linha 10, e substitua:

```javascript
const RENDER_BACKEND_URL = 'https://SUA-URL-DO-RENDER.onrender.com/api';
```

### 5. ✅ Testar

Acesse o dashboard e verifique se está funcionando!

---

## 🎉 Pronto!

Agora:
- ✅ Zero carga no seu PC
- ✅ Múltiplos dispositivos funcionam perfeitamente
- ✅ Dashboard funciona 24/7
- ✅ Performance muito melhor

---

**📖 Para mais detalhes, veja: `SOLUCAO_DEFINITIVA_PERFORMANCE.md`**
