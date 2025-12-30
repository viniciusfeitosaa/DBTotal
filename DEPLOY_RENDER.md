# 🚀 Guia de Deploy do Backend no Render

## 📋 Pré-requisitos

1. ✅ Conta no [Render.com](https://render.com)
2. ✅ Repositório GitHub conectado
3. ✅ URL do frontend no Netlify

---

## 🔧 Passo a Passo

### **1. Criar Novo Web Service no Render**

1. Acesse [dashboard.render.com](https://dashboard.render.com)
2. Clique em **"New +"** → **"Web Service"**
3. Conecte seu repositório GitHub (se ainda não conectou)
4. Selecione o repositório **DBTotal**

### **2. Configurar o Serviço**

**Configurações básicas:**
- **Name:** `dbtotal-backend` (ou o nome que preferir)
- **Region:** Escolha a região mais próxima (ex: `Oregon (US West)`)
- **Branch:** `main`
- **Root Directory:** Deixe vazio (raiz do projeto)
- **Runtime:** `Node`
- **Build Command:** `npm install && pip install -r requirements.txt`
- **Start Command:** `node server.js`

### **3. Configurar Variáveis de Ambiente**

No painel do Render, vá em **"Environment"** e adicione:

#### **Variáveis Obrigatórias:**

```env
NODE_ENV=production
PORT=10000
```

#### **Credenciais dos Sistemas:**

```env
VIVA_SAUDE_USERNAME=seu_usuario_doctorid
VIVA_SAUDE_PASSWORD=sua_senha_doctorid

COOP_VITTA_USERNAME=seu_usuario_rhid
COOP_VITTA_PASSWORD=sua_senha_rhid

DELTA_USERNAME=seu_usuario_rhid
DELTA_PASSWORD=sua_senha_rhid
```

#### **URL do Frontend (Netlify):**

```env
FRONTEND_URL=https://seu-site.netlify.app
NETLIFY_URL=https://seu-site.netlify.app
```

⚠️ **IMPORTANTE:** Substitua `seu-site.netlify.app` pela URL real do seu site no Netlify!

### **4. Configurar Plano**

- **Free Plan:** Gratuito, mas pode ter limitações de performance
- **Starter Plan ($7/mês):** Melhor para produção

### **5. Deploy**

1. Clique em **"Create Web Service"**
2. O Render começará a fazer o build automaticamente
3. Aguarde o deploy completar (pode levar 5-10 minutos na primeira vez)

### **6. Obter URL do Backend**

Após o deploy, você verá uma URL como:
```
https://dbtotal-backend.onrender.com
```

**Copie esta URL!** Você precisará dela para configurar o frontend.

---

## 🔗 Configurar Frontend (Netlify)

### **1. Atualizar script.js**

No arquivo `script.js`, linha 6-7, atualize:

```javascript
const API_BASE_URL = isProduction 
    ? 'https://dbtotal-backend.onrender.com/api' // ⚠️ SUA URL DO RENDER AQUI
    : 'http://localhost:3000/api';
```

### **2. Fazer Commit e Push**

```bash
git add script.js
git commit -m "Configurar URL do backend Render"
git push origin main
```

O Netlify fará deploy automático.

---

## ⚠️ Problemas Comuns

### **1. Chrome não encontrado (Selenium)**

O Render não tem Chrome instalado por padrão. Você pode:

**Opção A:** Usar apenas a exportação CSV via URL (já implementado no código)
**Opção B:** Adicionar Chrome no build:

Criar arquivo `render-build.sh`:
```bash
#!/bin/bash
# Instalar Chrome
apt-get update
apt-get install -y chromium-browser

# Instalar dependências
npm install
pip install -r requirements.txt
```

E atualizar **Build Command** no Render:
```bash
chmod +x render-build.sh && ./render-build.sh
```

### **2. Timeout do Python**

Se o script Python demorar muito:
- Aumentar timeout no `server.js` (já está em 3 minutos)
- Otimizar `google_sheets_extractor.py`

### **3. CORS bloqueando requisições**

Se o frontend não conseguir acessar o backend:
- Verificar se `FRONTEND_URL` está configurada corretamente
- Verificar logs do Render para erros de CORS
- O código já permite `.netlify.app`, mas verifique se a URL está correta

### **4. Variáveis de ambiente não carregadas**

- Verificar se todas as variáveis estão configuradas no Render
- Verificar se não há espaços extras nos valores
- Fazer novo deploy após adicionar variáveis

---

## 📊 Verificar se está funcionando

### **1. Testar Backend diretamente:**

```bash
curl https://seu-backend.onrender.com/api/health
```

Deve retornar:
```json
{"status":"ok","timestamp":"..."}
```

### **2. Testar do Frontend:**

1. Abra o site no Netlify
2. Abra o Console do navegador (F12)
3. Verifique se há erros de CORS ou conexão
4. Tente fazer login em um dos sistemas

---

## 🔄 Atualizações Futuras

Após configurar tudo, qualquer commit no GitHub:
- **Backend:** Render faz deploy automático
- **Frontend:** Netlify faz deploy automático

---

## 📝 Checklist Final

- [ ] Backend deployado no Render
- [ ] URL do backend obtida
- [ ] Variáveis de ambiente configuradas
- [ ] `script.js` atualizado com URL do Render
- [ ] Frontend atualizado no Netlify
- [ ] Testado conexão entre frontend e backend
- [ ] Testado login em todos os sistemas

---

## 🆘 Suporte

Se tiver problemas:
1. Verificar logs no Render (aba "Logs")
2. Verificar logs no Netlify (aba "Deploys" → "Functions Logs")
3. Verificar Console do navegador (F12)

