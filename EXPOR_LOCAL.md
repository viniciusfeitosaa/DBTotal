# 🌐 Expor Backend Local para Internet

## ✅ Vantagens de Rodar Localmente

- ✅ **Performance melhor** - Sua máquina é mais rápida que servidores compartilhados
- ✅ **Sem limitações de timeout** - Não há limites do Render
- ✅ **Chrome já instalado** - Não precisa instalar durante build
- ✅ **Debug mais fácil** - Logs diretos no terminal
- ✅ **Gratuito** - Não precisa pagar por servidor

## ⚠️ Desvantagens

- ⚠️ **Precisa deixar computador ligado** - O backend precisa estar rodando
- ⚠️ **IP dinâmico** - Pode mudar (mas os túneis resolvem isso)
- ⚠️ **Depende da sua internet** - Se cair, o serviço cai

---

## 🚀 Opção 1: ngrok (RECOMENDADO - Mais Fácil)

### **Instalação:**

1. **Baixar ngrok:**
   - Acesse: https://ngrok.com/download
   - Baixe para Windows
   - Extraia o arquivo `ngrok.exe`

2. **Criar conta (gratuita):**
   - Acesse: https://dashboard.ngrok.com/signup
   - Crie uma conta gratuita
   - Copie seu **authtoken** do dashboard

3. **Configurar:**
   ```bash
   # No terminal, navegue até a pasta do ngrok.exe
   ngrok config add-authtoken SEU_TOKEN_AQUI
   ```

### **Uso:**

1. **Iniciar seu servidor local:**
   ```bash
   npm start
   ```
   O servidor deve estar rodando em `http://localhost:3000`

2. **Em outro terminal, iniciar ngrok:**
   ```bash
   ngrok http 3000
   ```

3. **Copiar a URL:**
   ```
   Forwarding: https://abc123.ngrok-free.app -> http://localhost:3000
   ```
   Copie a URL `https://abc123.ngrok-free.app`

4. **Atualizar script.js:**
   ```javascript
   const RENDER_BACKEND_URL = 'https://abc123.ngrok-free.app/api';
   ```

### **URLs Fixas (Plano Pago):**
- Plano gratuito: URL muda a cada reinício
- Plano pago ($8/mês): URL fixa personalizada

---

## 🔷 Opção 2: Cloudflare Tunnel (Gratuito e URL Fixa)

### **Instalação:**

1. **Instalar cloudflared:**
   - Baixe: https://github.com/cloudflare/cloudflared/releases
   - Extraia `cloudflared.exe`

2. **Autenticar:**
   ```bash
   cloudflared tunnel login
   ```
   Isso abrirá o navegador para autenticar

3. **Criar túnel:**
   ```bash
   cloudflared tunnel create dbtotal-backend
   ```

4. **Configurar:**
   ```bash
   cloudflared tunnel route dns create dbtotal-backend seu-backend.exemplo.com
   ```

5. **Iniciar túnel:**
   ```bash
   cloudflared tunnel run dbtotal-backend
   ```

### **Vantagens:**
- ✅ Gratuito
- ✅ URL fixa personalizada
- ✅ Muito confiável (Cloudflare)

---

## 🔧 Opção 3: localtunnel (Muito Simples)

### **Instalação:**

```bash
npm install -g localtunnel
```

### **Uso:**

1. **Iniciar servidor local:**
   ```bash
   npm start
   ```

2. **Criar túnel:**
   ```bash
   lt --port 3000
   ```

3. **Copiar URL:**
   ```
   your url is: https://random-name.loca.lt
   ```

### **URL Fixa:**
```bash
lt --port 3000 --subdomain dbtotal
# URL: https://dbtotal.loca.lt
```

---

## 📋 Passo a Passo Completo (ngrok)

### **1. Preparar Ambiente Local**

```bash
# Garantir que está na pasta do projeto
cd C:\Users\vinic\Desktop\DBTotal

# Instalar dependências (se ainda não instalou)
npm install

# Criar arquivo .env com suas credenciais
# (copie do .env.example e preencha)
```

### **2. Iniciar Servidor Local**

```bash
npm start
```

Deve aparecer:
```
🚀 Servidor rodando em http://localhost:3000
```

### **3. Instalar e Configurar ngrok**

1. Baixe ngrok de https://ngrok.com/download
2. Extraia `ngrok.exe` em uma pasta (ex: `C:\ngrok\`)
3. Crie conta em https://dashboard.ngrok.com
4. Copie o authtoken
5. Configure:
   ```bash
   cd C:\ngrok
   ngrok config add-authtoken SEU_TOKEN
   ```

### **4. Criar Túnel**

Em um **novo terminal** (deixe o servidor rodando no primeiro):

```bash
cd C:\ngrok
ngrok http 3000
```

Você verá algo como:
```
Forwarding: https://abc123-def456.ngrok-free.app -> http://localhost:3000
```

### **5. Atualizar Frontend (Netlify)**

1. Abra `script.js`
2. Atualize a linha 10:
   ```javascript
   const RENDER_BACKEND_URL = 'https://abc123-def456.ngrok-free.app/api';
   ```
3. Faça commit e push:
   ```bash
   git add script.js
   git commit -m "Atualizar URL do backend para ngrok"
   git push origin main
   ```

### **6. Testar**

1. Acesse seu site no Netlify
2. Abra o Console (F12)
3. Verifique se está usando a URL do ngrok
4. Teste os sistemas

---

## 🔄 Manter ngrok Rodando

### **Opção A: Terminal Manual**
- Deixe o terminal do ngrok aberto
- Se fechar, precisa iniciar novamente (URL muda)

### **Opção B: Script Automático (Windows)**

Crie arquivo `start-backend.bat`:

```batch
@echo off
echo Iniciando servidor...
start "Servidor Node" cmd /k "npm start"
timeout /t 5
echo Iniciando ngrok...
start "ngrok" cmd /k "C:\ngrok\ngrok.exe http 3000"
echo Pronto! Servidor e ngrok rodando.
pause
```

### **Opção C: Usar ngrok com URL Fixa (Plano Pago)**

Se tiver plano pago do ngrok:
```bash
ngrok http 3000 --domain=seu-backend.ngrok.app
```

---

## 🔒 Segurança

### **⚠️ IMPORTANTE:**

1. **Não exponha credenciais** - Use variáveis de ambiente (.env)
2. **ngrok gratuito mostra warning** - Usuários precisam clicar "Visit Site"
3. **Considere autenticação** - Adicione autenticação básica se necessário

### **Adicionar Autenticação Básica (Opcional):**

No `server.js`, adicione antes das rotas:

```javascript
// Autenticação básica (opcional)
app.use('/api', (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || auth !== 'Bearer SEU_TOKEN_SECRETO') {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    next();
});
```

E no `script.js`, adicione header:

```javascript
const response = await fetch(url, {
    headers: {
        'Authorization': 'Bearer SEU_TOKEN_SECRETO'
    }
});
```

---

## 📊 Comparação de Opções

| Opção | Gratuito | URL Fixa | Facilidade | Confiabilidade |
|-------|----------|----------|------------|-----------------|
| **ngrok** | ✅ Sim | ❌ Não (pago) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Cloudflare Tunnel** | ✅ Sim | ✅ Sim | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **localtunnel** | ✅ Sim | ⚠️ Parcial | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Render** | ✅ Sim | ✅ Sim | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

---

## 🎯 Recomendação

**Para começar rápido:** **ngrok**
- Mais fácil de configurar
- Funciona imediatamente
- Gratuito (URL muda, mas funciona)

**Para produção:** **Cloudflare Tunnel**
- Gratuito
- URL fixa
- Mais confiável

---

## 🆘 Troubleshooting

### **Problema: ngrok não conecta**

**Solução:**
1. Verificar se servidor local está rodando (`http://localhost:3000`)
2. Verificar se porta 3000 está correta
3. Verificar firewall do Windows

### **Problema: URL muda sempre**

**Solução:**
- Usar plano pago do ngrok ($8/mês)
- Ou usar Cloudflare Tunnel (gratuito com URL fixa)

### **Problema: Warning do ngrok no navegador**

**Solução:**
- É normal no plano gratuito
- Usuários precisam clicar "Visit Site"
- Ou usar plano pago para remover

---

## 📝 Checklist

- [ ] Servidor local rodando (`npm start`)
- [ ] ngrok instalado e configurado
- [ ] Túnel criado (`ngrok http 3000`)
- [ ] URL copiada do ngrok
- [ ] `script.js` atualizado com URL do ngrok
- [ ] Commit e push feito
- [ ] Netlify atualizado
- [ ] Testado no navegador

---

## 💡 Dica

Você pode criar um script que inicia tudo automaticamente:

**`start-all.bat`:**
```batch
@echo off
echo Iniciando servidor Node.js...
start "Servidor" cmd /k "npm start"
timeout /t 10
echo Iniciando ngrok...
start "ngrok" cmd /k "C:\ngrok\ngrok.exe http 3000"
echo Pronto! Acesse o dashboard do ngrok para ver a URL.
pause
```

