# 🚀 Instruções Rápidas - Cloudflare Tunnel

## ✅ cloudflared já está na pasta!

## 📋 Passos para iniciar:

### 1. Abra um NOVO terminal PowerShell

**IMPORTANTE:** Abra um terminal separado (não feche o que tem o servidor rodando)

### 2. Navegue até a pasta do projeto:

```powershell
cd C:\Users\vinic\Desktop\DBTotal
```

### 3. Execute o script:

```powershell
.\iniciar-tunnel.ps1
```

**OU execute diretamente:**

```powershell
.\cloudflared.exe tunnel --url http://localhost:3000
```

### 4. Você verá algo como:

```
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at:                                         |
|  https://abc123-def456-ghi789.trycloudflare.com                                           |
|+--------------------------------------------------------------------------------------------+
```

### 5. COPIE essa URL e me envie!

Depois eu atualizo o `script.js` para você.

---

## ⚠️ IMPORTANTE:

- **Mantenha o terminal do tunnel aberto** enquanto usar
- **Não feche** o terminal onde o tunnel está rodando
- A URL só funciona enquanto o tunnel estiver rodando

---

## 🔄 Se precisar parar:

Pressione `Ctrl+C` no terminal do tunnel.

---

## 🆘 Problemas?

### "cloudflared não encontrado"
Execute: `.\cloudflared.exe` (com o `.\` no início)

### "Servidor não está rodando"
Execute `npm start` em outro terminal primeiro

### "URL não aparece"
Aguarde alguns segundos, a URL aparece após o tunnel iniciar

