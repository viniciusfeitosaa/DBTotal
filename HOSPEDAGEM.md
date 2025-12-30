# 📦 Guia de Hospedagem do Dashboard DBTotal

## ⚠️ **IMPORTANTE: Netlify NÃO é suficiente**

O Netlify é uma plataforma de hospedagem **apenas para sites estáticos** (HTML, CSS, JavaScript). Este projeto **NÃO pode funcionar apenas no Netlify** porque precisa de:

1. **Backend Node.js** (Express.js)
2. **Execução de scripts Python**
3. **Puppeteer** (automação de navegador)
4. **Selenium** (automação de navegador)
5. **Chrome/ChromeDriver** (para Selenium)

---

## 🏗️ Arquitetura do Projeto

### Componentes Necessários:

1. **Frontend** (pode ir no Netlify/Vercel):
   - `index.html`
   - `script.js`
   - `styles.css`

2. **Backend Node.js** (precisa de servidor):
   - `server.js` (Express.js)
   - Executa Puppeteer
   - Executa scripts Python
   - Precisa de variáveis de ambiente (`.env`)

3. **Script Python** (precisa de servidor):
   - `google_sheets_extractor.py`
   - Usa Selenium
   - Precisa de Chrome/ChromeDriver instalado

---

## 🎯 Opções de Hospedagem

### **Opção 1: Tudo em um Servidor (RECOMENDADO)**

Hospedar backend e frontend no mesmo lugar.

#### **1.1 Railway** ⭐ (Mais Fácil)
- ✅ Suporta Node.js e Python
- ✅ Variáveis de ambiente fáceis
- ✅ Deploy automático via Git
- ✅ Plano gratuito disponível
- ⚠️ Pode precisar configurar Chrome para Selenium

**Passos:**
1. Criar conta em [railway.app](https://railway.app)
2. Conectar repositório GitHub
3. Configurar variáveis de ambiente
4. Railway detecta automaticamente Node.js

**Custo:** Gratuito (com limites) ou $5/mês

---

#### **1.2 Render**
- ✅ Suporta Node.js e Python
- ✅ Deploy automático via Git
- ✅ Plano gratuito disponível
- ⚠️ Pode precisar configurar Chrome para Selenium

**Passos:**
1. Criar conta em [render.com](https://render.com)
2. Criar novo "Web Service"
3. Conectar repositório GitHub
4. Configurar variáveis de ambiente

**Custo:** Gratuito (com limites) ou $7/mês

---

#### **1.3 Fly.io**
- ✅ Suporta Node.js e Python
- ✅ Boa performance
- ⚠️ Configuração mais complexa

**Custo:** Gratuito (com limites)

---

#### **1.4 VPS (DigitalOcean, Linode, AWS EC2)**
- ✅ Controle total
- ✅ Pode instalar Chrome/Selenium facilmente
- ⚠️ Requer conhecimento de Linux
- ⚠️ Precisa configurar tudo manualmente

**Custo:** $5-10/mês

**Passos básicos:**
1. Criar servidor Ubuntu
2. Instalar Node.js, Python, Chrome
3. Configurar PM2 para manter Node.js rodando
4. Configurar Nginx como proxy reverso
5. Configurar SSL (Let's Encrypt)

---

### **Opção 2: Backend Separado + Frontend no Netlify**

#### **Backend:**
- Railway, Render, Fly.io, ou VPS (mesmas opções acima)

#### **Frontend:**
- Netlify ou Vercel (deploy automático)

**Vantagens:**
- Frontend gratuito e rápido
- Backend separado

**Desvantagens:**
- Precisa configurar CORS
- Mais complexo de gerenciar

---

## 📋 Checklist de Preparação

### **1. Variáveis de Ambiente (.env)**

Criar arquivo `.env` no servidor com:

```env
# Porta do servidor
PORT=3000

# Credenciais Viva Saúde (DoctorID)
VIVA_SAUDE_USERNAME=seu_usuario
VIVA_SAUDE_PASSWORD=sua_senha

# Credenciais Coop Vitta (RHID)
COOP_VITTA_USERNAME=seu_usuario
COOP_VITTA_PASSWORD=sua_senha

# Credenciais Delta (RHID)
DELTA_USERNAME=seu_usuario
DELTA_PASSWORD=sua_senha
```

### **2. Dependências do Sistema**

No servidor, instalar:

- **Node.js** (v18 ou superior)
- **Python** (v3.8 ou superior)
- **Chrome/Chromium** (para Selenium)
- **ChromeDriver** (gerenciado pelo webdriver-manager)

### **3. Arquivos Necessários**

Garantir que estão no repositório:
- ✅ `server.js`
- ✅ `package.json`
- ✅ `google_sheets_extractor.py`
- ✅ `requirements.txt`
- ✅ `index.html`
- ✅ `script.js`
- ✅ `styles.css`

### **4. Configurações Adicionais**

#### **Para Railway/Render/Fly.io:**

Criar arquivo `Procfile` ou `railway.json`:

```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node server.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

#### **Para VPS:**

Criar arquivo `ecosystem.config.js` (PM2):

```javascript
module.exports = {
  apps: [{
    name: 'dbtotal-dashboard',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

---

## 🚀 Deploy Recomendado: Railway

### **Passo a Passo:**

1. **Preparar repositório:**
   ```bash
   # Garantir que .env.example existe (sem credenciais reais)
   # Fazer commit de todas as alterações
   git add .
   git commit -m "Preparar para deploy"
   git push
   ```

2. **Criar conta no Railway:**
   - Acessar [railway.app](https://railway.app)
   - Fazer login com GitHub
   - Clicar em "New Project"
   - Selecionar "Deploy from GitHub repo"
   - Escolher seu repositório

3. **Configurar variáveis de ambiente:**
   - No projeto Railway, ir em "Variables"
   - Adicionar todas as variáveis do `.env`

4. **Configurar build:**
   - Railway detecta automaticamente Node.js
   - Pode precisar criar `railway.json` ou `nixpacks.toml`

5. **Instalar Chrome no Railway:**
   - Criar arquivo `nixpacks.toml`:
   ```toml
   [phases.setup]
   nixPkgs = ["nodejs_18", "python39", "chromium"]

   [phases.install]
   cmds = [
     "npm install",
     "pip install -r requirements.txt"
   ]

   [start]
   cmd = "node server.js"
   ```

6. **Deploy:**
   - Railway faz deploy automático
   - Verificar logs para erros

---

## 🔧 Ajustes Necessários no Código

### **1. Atualizar URL da API no Frontend**

No arquivo `script.js`, atualizar:

```javascript
// De:
const API_BASE_URL = 'http://localhost:3000';

// Para (exemplo Railway):
const API_BASE_URL = 'https://seu-projeto.railway.app';
```

### **2. Configurar CORS (se frontend separado)**

No `server.js`, já está configurado:
```javascript
app.use(cors());
```

Mas pode precisar ajustar para:
```javascript
app.use(cors({
  origin: ['https://seu-site.netlify.app', 'https://localhost:3000'],
  credentials: true
}));
```

### **3. Ajustar caminhos do Python**

No `server.js`, linha ~2141:
```javascript
const scriptPath = path.join(__dirname, 'google_sheets_extractor.py');
```

Isso deve funcionar automaticamente, mas verificar se o Python está no PATH.

---

## ⚠️ Problemas Comuns

### **1. Chrome não encontrado (Selenium)**

**Solução:**
- Instalar Chrome/Chromium no servidor
- Ou usar Chrome headless via Docker
- Ou usar `webdriver-manager` (já está no código)

### **2. Timeout do Python**

**Solução:**
- Aumentar timeout no `server.js` (já está em 3 minutos)
- Otimizar `google_sheets_extractor.py`

### **3. Variáveis de ambiente não carregadas**

**Solução:**
- Verificar se `.env` está no servidor
- Verificar se variáveis estão configuradas na plataforma
- Verificar se `dotenv` está instalado

### **4. Porta não configurada**

**Solução:**
- Railway/Render usam `PORT` da variável de ambiente
- Verificar se `server.js` usa `process.env.PORT || 3000`

---

## 📊 Comparação de Opções

| Plataforma | Facilidade | Custo | Suporte Python | Suporte Chrome |
|------------|------------|-------|----------------|----------------|
| **Railway** | ⭐⭐⭐⭐⭐ | Gratuito/$5 | ✅ | ⚠️ Configurar |
| **Render** | ⭐⭐⭐⭐ | Gratuito/$7 | ✅ | ⚠️ Configurar |
| **Fly.io** | ⭐⭐⭐ | Gratuito | ✅ | ⚠️ Configurar |
| **VPS** | ⭐⭐ | $5-10 | ✅ | ✅ Fácil |
| **Heroku** | ⭐⭐⭐ | $7+ | ✅ | ⚠️ Configurar |

---

## 🎯 Recomendação Final

**Para começar rápido:** **Railway**
- Mais fácil de configurar
- Deploy automático
- Plano gratuito disponível

**Para produção robusta:** **VPS (DigitalOcean)**
- Controle total
- Pode instalar tudo facilmente
- Mais barato a longo prazo

---

## 📝 Próximos Passos

1. ✅ Escolher plataforma de hospedagem
2. ✅ Criar conta e conectar repositório
3. ✅ Configurar variáveis de ambiente
4. ✅ Ajustar URLs no frontend
5. ✅ Fazer deploy
6. ✅ Testar todas as funcionalidades
7. ✅ Configurar domínio personalizado (opcional)

---

## 🔗 Links Úteis

- [Railway Docs](https://docs.railway.app)
- [Render Docs](https://render.com/docs)
- [Fly.io Docs](https://fly.io/docs)
- [DigitalOcean Tutorial](https://www.digitalocean.com/community/tutorials)

