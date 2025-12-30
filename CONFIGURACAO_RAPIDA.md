# ⚡ Configuração Rápida: Netlify + Render

## 🎯 Objetivo
Conectar o frontend (Netlify) com o backend (Render).

---

## 📝 Checklist Rápido

### **1. Backend no Render** (5-10 minutos)

- [ ] Criar conta no [Render.com](https://render.com)
- [ ] Criar novo "Web Service"
- [ ] Conectar repositório GitHub
- [ ] Configurar:
  - **Build Command:** `npm install && pip install -r requirements.txt`
  - **Start Command:** `node server.js`
- [ ] Adicionar variáveis de ambiente (veja `.env.example`)
- [ ] Aguardar deploy e **copiar a URL do backend**
  - Exemplo: `https://dbtotal-backend.onrender.com`

### **2. Frontend no Netlify** (2 minutos)

- [ ] Abrir `script.js` linha 7
- [ ] Substituir `'https://seu-backend.onrender.com/api'` pela URL real do Render
- [ ] Fazer commit e push:
  ```bash
  git add script.js
  git commit -m "Configurar URL do backend Render"
  git push origin main
  ```
- [ ] Netlify fará deploy automático

### **3. Testar** (1 minuto)

- [ ] Abrir site no Netlify
- [ ] Abrir Console (F12)
- [ ] Verificar se não há erros de CORS
- [ ] Testar login em um sistema

---

## 🔗 URLs Importantes

**Frontend (Netlify):**
```
https://seu-site.netlify.app
```

**Backend (Render):**
```
https://seu-backend.onrender.com
```

**API Endpoint:**
```
https://seu-backend.onrender.com/api
```

---

## ⚠️ Variáveis de Ambiente no Render

No painel do Render, adicione estas variáveis:

```
VIVA_SAUDE_USERNAME=seu_usuario
VIVA_SAUDE_PASSWORD=sua_senha
COOP_VITTA_USERNAME=seu_usuario
COOP_VITTA_PASSWORD=sua_senha
DELTA_USERNAME=seu_usuario
DELTA_PASSWORD=sua_senha
FRONTEND_URL=https://seu-site.netlify.app
NETLIFY_URL=https://seu-site.netlify.app
```

---

## 🆘 Problemas?

1. **CORS bloqueando:** Verifique se `FRONTEND_URL` está configurada no Render
2. **Backend não responde:** Verifique logs no Render
3. **Frontend não atualiza:** Limpe cache do navegador (Ctrl+Shift+R)

---

## 📚 Documentação Completa

Veja `DEPLOY_RENDER.md` para instruções detalhadas.

