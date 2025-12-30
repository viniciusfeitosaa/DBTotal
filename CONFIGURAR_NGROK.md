# 🚀 Configuração Rápida do ngrok

## ✅ ngrok já está configurado!

O token foi salvo com sucesso.

---

## 📋 Próximos Passos

### **1. Verificar se o servidor está rodando**

Abra um terminal e execute:
```bash
npm start
```

Deve aparecer:
```
🚀 Servidor rodando em http://localhost:3000
```

**Deixe esse terminal aberto!**

---

### **2. Iniciar ngrok (em outro terminal)**

Abra um **novo terminal** e execute:
```bash
ngrok http 3000
```

Você verá algo como:
```
ngrok                                                                              
                                                                                   
Session Status                online                                               
Account                       seu-email@exemplo.com (Plan: Free)                  
Version                       3.x.x                                                
Region                        United States (us)                                   
Latency                       45ms                                                 
Web Interface                 http://127.0.0.1:4040                                
Forwarding                    https://abc123-def456.ngrok-free.app -> http://localhost:3000
                                                                                   
Connections                   ttl     opn     rt1     rt5     p50     p90         
                              0       0       0.00    0.00    0.00    0.00         
```

**Copie a URL do "Forwarding":**
```
https://abc123-def456.ngrok-free.app
```

---

### **3. Atualizar script.js**

1. Abra `script.js`
2. Vá na linha 10
3. Substitua:
   ```javascript
   const RENDER_BACKEND_URL = 'https://dbtotal.onrender.com/api';
   ```
   
   Por:
   ```javascript
   const RENDER_BACKEND_URL = 'https://abc123-def456.ngrok-free.app/api';
   ```
   (Use a URL que você copiou do ngrok)

4. Salve o arquivo

---

### **4. Fazer commit e push**

```bash
git add script.js
git commit -m "Atualizar URL do backend para ngrok"
git push origin main
```

---

### **5. Testar**

1. Aguarde o Netlify fazer deploy (automático)
2. Acesse seu site no Netlify
3. Abra o Console (F12)
4. Verifique se aparece:
   ```
   [CONFIG] API Base URL: https://abc123-def456.ngrok-free.app/api
   ```
5. Teste os sistemas

---

## 🔄 Manter Rodando

### **Importante:**

1. **Servidor Node.js** deve estar rodando (`npm start`)
2. **ngrok** deve estar rodando (`ngrok http 3000`)
3. **Ambos** devem ficar abertos enquanto usar

### **Se fechar o ngrok:**

- A URL muda
- Precisa atualizar `script.js` novamente
- Fazer commit e push

---

## 💡 Dica: Interface Web do ngrok

Enquanto o ngrok estiver rodando, você pode acessar:
```
http://localhost:4040
```

Lá você verá:
- URL do túnel
- Requisições em tempo real
- Logs de acesso

---

## ⚠️ URL Muda?

No plano gratuito do ngrok, a URL muda a cada reinício.

**Soluções:**
1. **Não fechar o ngrok** - Deixe sempre rodando
2. **Usar URL fixa** - Plano pago do ngrok ($8/mês)
3. **Cloudflare Tunnel** - Gratuito com URL fixa (veja `EXPOR_LOCAL.md`)

---

## 🆘 Problemas?

### **Erro: "port 3000 is already in use"**

**Solução:** O servidor já está rodando. Tudo certo!

### **Erro: "tunnel session failed"**

**Solução:** 
1. Verificar se o servidor está rodando
2. Verificar se a porta 3000 está correta
3. Tentar reiniciar o ngrok

### **URL não funciona no Netlify**

**Solução:**
1. Verificar se ngrok está rodando
2. Verificar se a URL no `script.js` está correta (deve terminar com `/api`)
3. Verificar Console do navegador para erros

---

## ✅ Checklist

- [ ] Servidor rodando (`npm start`)
- [ ] ngrok rodando (`ngrok http 3000`)
- [ ] URL copiada do ngrok
- [ ] `script.js` atualizado
- [ ] Commit e push feito
- [ ] Netlify atualizado
- [ ] Testado no navegador

