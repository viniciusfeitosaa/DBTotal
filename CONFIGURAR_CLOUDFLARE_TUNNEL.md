# 🚀 Configurar Cloudflare Tunnel (Zero Trust)

## ✅ Vantagens sobre ngrok:
- ✅ **Gratuito** (plano free)
- ✅ **URL fixa** (não muda)
- ✅ **Sem página de interstício** (sem bloqueios)
- ✅ **Mais rápido e confiável**
- ✅ **Sem limites de requisições**

---

## 📋 Passo 1: Instalar cloudflared

### Windows:
1. Baixe o instalador: https://github.com/cloudflare/cloudflared/releases/latest
2. Procure por `cloudflared-windows-amd64.exe` ou `cloudflared-windows-386.exe`
3. Renomeie para `cloudflared.exe`
4. Coloque em uma pasta no PATH (ex: `C:\Windows\System32`) ou adicione ao PATH

### Ou via PowerShell (como Admin):
```powershell
# Baixar cloudflared
Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "cloudflared.exe"

# Mover para pasta do sistema
Move-Item -Path "cloudflared.exe" -Destination "C:\Windows\System32\cloudflared.exe"
```

### Verificar instalação:
```bash
cloudflared --version
```

---

## 📋 Passo 2: Fazer login no Cloudflare

```bash
cloudflared tunnel login
```

Isso abrirá o navegador para você fazer login e autorizar o acesso.

---

## 📋 Passo 3: Criar um Tunnel

```bash
cloudflared tunnel create dbtotal-backend
```

Isso criará um tunnel chamado `dbtotal-backend` e retornará um **Tunnel ID**.

**⚠️ IMPORTANTE: Anote o Tunnel ID que aparecer!**

Exemplo de saída:
```
Created tunnel dbtotal-backend with id abc123-def456-ghi789
```

---

## 📋 Passo 4: Criar arquivo de configuração

Crie um arquivo `config.yml` na pasta do projeto:

```yaml
tunnel: abc123-def456-ghi789  # ⚠️ SUBSTITUA PELO SEU TUNNEL ID
credentials-file: C:\Users\vinic\Desktop\DBTotal\.cloudflared\abc123-def456-ghi789.json

ingress:
  - hostname: dbtotal-backend.your-domain.com  # ⚠️ SUBSTITUA PELO SEU DOMÍNIO
    service: http://localhost:3000
  - service: http_status:404
```

**⚠️ IMPORTANTE:**
- Substitua `abc123-def456-ghi789` pelo seu Tunnel ID
- Substitua `dbtotal-backend.your-domain.com` por um subdomínio do seu domínio no Cloudflare
- O arquivo `.json` será criado automaticamente no login

---

## 📋 Passo 5: Configurar DNS no Cloudflare

1. Acesse o painel do Cloudflare: https://dash.cloudflare.com
2. Selecione seu domínio
3. Vá em **DNS** > **Records**
4. Adicione um registro:
   - **Type**: `CNAME`
   - **Name**: `dbtotal-backend` (ou o que você escolheu)
   - **Target**: `abc123-def456-ghi789.cfargotunnel.com` (substitua pelo seu Tunnel ID)
   - **Proxy status**: 🟠 Proxied (laranja)
5. Salve

---

## 📋 Passo 6: Rodar o Tunnel

```bash
cloudflared tunnel run dbtotal-backend
```

Ou usando o arquivo de configuração:

```bash
cloudflared tunnel --config config.yml run
```

**✅ Você verá algo como:**
```
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable): |
|  https://dbtotal-backend.your-domain.com                                                  |
|+--------------------------------------------------------------------------------------------+
```

---

## 📋 Passo 7: Atualizar script.js

1. Abra `script.js`
2. Vá na linha 10
3. Substitua:
   ```javascript
   const RENDER_BACKEND_URL = 'https://unapperceived-unmiasmatic-tiera.ngrok-free.dev/api';
   ```
   
   Por:
   ```javascript
   const RENDER_BACKEND_URL = 'https://dbtotal-backend.your-domain.com/api';
   ```
   (Use a URL do seu tunnel)

4. Salve e faça commit:
   ```bash
   git add script.js
   git commit -m "Atualizar URL do backend para Cloudflare Tunnel"
   git push origin main
   ```

---

## 📋 Passo 8: Testar

1. Certifique-se de que o servidor está rodando:
   ```bash
   npm start
   ```

2. Certifique-se de que o tunnel está rodando:
   ```bash
   cloudflared tunnel run dbtotal-backend
   ```

3. Teste a URL no navegador:
   ```
   https://dbtotal-backend.your-domain.com/api/health
   ```

4. Teste o frontend no Netlify

---

## 🔄 Manter Rodando

### Opção 1: Rodar manualmente (desenvolvimento)

Abra **2 terminais**:

**Terminal 1 - Servidor:**
```bash
npm start
```

**Terminal 2 - Tunnel:**
```bash
cloudflared tunnel run dbtotal-backend
```

### Opção 2: Rodar como serviço do Windows (produção)

```bash
cloudflared service install
cloudflared service start
```

---

## 🆘 Problemas Comuns

### **Erro: "tunnel not found"**

**Solução:** Verifique se o Tunnel ID está correto no `config.yml`

### **Erro: "credentials file not found"**

**Solução:** 
1. Execute `cloudflared tunnel login` novamente
2. Verifique o caminho do arquivo `.json` no `config.yml`

### **Erro: "DNS not configured"**

**Solução:**
1. Verifique se o registro CNAME foi criado no Cloudflare
2. Aguarde alguns minutos para propagação do DNS

### **Erro: "502 Bad Gateway"**

**Solução:**
1. Verifique se o servidor está rodando na porta 3000
2. Verifique se o tunnel está apontando para `http://localhost:3000`

---

## ✅ Checklist

- [ ] cloudflared instalado
- [ ] Login feito (`cloudflared tunnel login`)
- [ ] Tunnel criado (`cloudflared tunnel create`)
- [ ] Tunnel ID anotado
- [ ] `config.yml` criado e configurado
- [ ] DNS configurado no Cloudflare
- [ ] Tunnel rodando (`cloudflared tunnel run`)
- [ ] Servidor rodando (`npm start`)
- [ ] `script.js` atualizado com nova URL
- [ ] Commit e push feito
- [ ] Testado no navegador
- [ ] Testado no Netlify

---

## 💡 Dica: Script de Inicialização

Crie um arquivo `start-tunnel.bat`:

```batch
@echo off
echo ========================================
echo   Iniciando Cloudflare Tunnel
echo ========================================
echo.
echo Verificando se servidor está rodando...
netstat -ano | findstr :3000 >nul
if %errorlevel% neq 0 (
    echo [ERRO] Servidor não está rodando na porta 3000!
    echo Execute 'npm start' primeiro.
    pause
    exit /b 1
)

echo [OK] Servidor detectado na porta 3000
echo.
echo Iniciando Cloudflare Tunnel...
echo.
cloudflared tunnel run dbtotal-backend
```

---

## 🎯 Resultado Final

- ✅ **Backend**: Rodando localmente na porta 3000
- ✅ **Tunnel**: Expondo via Cloudflare (URL pública)
- ✅ **Frontend**: Netlify conectando ao backend via Cloudflare Tunnel
- ✅ **Sem bloqueios**: Sem página de interstício
- ✅ **URL fixa**: Não muda a cada reinício

