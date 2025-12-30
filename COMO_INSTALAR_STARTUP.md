# 🚀 Como Instalar Inicialização Automática

## 📋 Passo a Passo

### 1. Abrir Pasta de Inicialização

1. Pressione `Win + R`
2. Digite: `shell:startup`
3. Pressione Enter

Uma pasta será aberta. Esta é a pasta onde programas iniciam automaticamente com o Windows.

---

### 2. Copiar Script

1. Copie o arquivo `startup.bat` para esta pasta
2. Ou crie um atalho do `startup.bat` nesta pasta

---

### 3. Testar

1. Reinicie o computador
2. Após o login, você verá 2 janelas abrindo automaticamente:
   - **DBTotal - Servidor** (com `npm start`)
   - **DBTotal - Cloudflare Tunnel** (com o tunnel)

---

## ✅ Pronto!

Agora, sempre que você ligar o computador:
- ✅ Servidor inicia automaticamente
- ✅ Tunnel inicia automaticamente
- ✅ Dashboard funciona de qualquer lugar!

---

## 🔧 Personalizar

Se quiser mudar o comportamento, edite o `startup.bat`:

- **Aguardar mais tempo:** Aumente o `timeout /t 5`
- **Não mostrar janelas:** Use `start /min` em vez de `start`
- **Adicionar mais comandos:** Adicione antes do `pause`

---

## 🆘 Problemas

### **Janelas não abrem**

**Solução:**
1. Verifique se o arquivo está na pasta correta (`shell:startup`)
2. Teste executando `startup.bat` manualmente
3. Verifique se o caminho está correto no script

### **Servidor não inicia**

**Solução:**
1. Verifique se o Node.js está instalado
2. Execute `npm install` na pasta do projeto
3. Teste `npm start` manualmente

### **Tunnel não inicia**

**Solução:**
1. Verifique se `cloudflared.exe` está na pasta do projeto
2. Teste executando `.\cloudflared.exe tunnel --url http://localhost:3000` manualmente

---

## 💡 Alternativa: Task Scheduler

Se preferir usar o Agendador de Tarefas:

1. Abra o **Agendador de Tarefas** (Task Scheduler)
2. Clique em **Criar Tarefa Básica**
3. Configure:
   - **Nome**: "DBTotal - Iniciar Servidor e Tunnel"
   - **Gatilho**: "Quando eu fizer logon"
   - **Ação**: "Iniciar um programa"
   - **Programa**: `C:\Users\vinic\Desktop\DBTotal\startup.bat`
4. Marque: **Executar com os mais altos privilégios**
5. Salve

---

## ✅ Checklist

- [ ] `startup.bat` copiado para `shell:startup`
- [ ] Testado manualmente (executar `startup.bat`)
- [ ] Reiniciado o computador
- [ ] Janelas abrem automaticamente
- [ ] Servidor está rodando (porta 3000)
- [ ] Tunnel está rodando (URL aparece)
- [ ] Dashboard funciona de qualquer lugar

