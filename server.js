const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Criar diretório de downloads se não existir
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

// Armazenar sessões (em produção, use Redis ou similar)
const sessions = new Map();

// Credenciais carregadas do arquivo .env
const CREDENTIALS = {
    'viva-saude': {
        system: 'doctorid',
        username: process.env.VIVA_SAUDE_USERNAME,
        password: process.env.VIVA_SAUDE_PASSWORD
    },
    'coop-vitta': {
        system: 'rhid',
        username: process.env.COOP_VITTA_USERNAME,
        password: process.env.COOP_VITTA_PASSWORD
    },
    'delta': {
        system: 'rhid',
        username: process.env.DELTA_USERNAME,
        password: process.env.DELTA_PASSWORD
    }
};

// Validar se todas as credenciais estão configuradas
const missingCredentials = [];
Object.keys(CREDENTIALS).forEach(key => {
    if (!CREDENTIALS[key].username || !CREDENTIALS[key].password) {
        missingCredentials.push(key);
    }
});

if (missingCredentials.length > 0) {
    console.error('⚠️  ERRO: Credenciais não configuradas no arquivo .env:');
    missingCredentials.forEach(key => {
        console.error(`   - ${key}`);
    });
    console.error('\n📝 Crie um arquivo .env baseado no .env.example e preencha as credenciais.');
    process.exit(1);
}

// Helper function para delay (substitui waitForTimeout que foi removido)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Função para fazer login no RHID e exportar CSV (Coop Vitta e Delta)
async function loginRHIDAndExportCSV(username, password, systemName = 'COOP-VITTA') {
    let browser = null;
    try {
        // Configurar cliente do Puppeteer com download
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const context = browser.defaultBrowserContext();
        await context.overridePermissions('https://rhid.com.br', []);
        
        const page = await browser.newPage();
        
        // Configurar download
        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadsDir
        });
        
        // Fazer login (mesma lógica do loginRHID)
        console.log(`[${systemName}] Acessando página de login...`);
        await page.goto('https://rhid.com.br/v2/#/login', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        await delay(2000);

        // Preencher credenciais
        console.log(`[${systemName}] Preenchendo credenciais...`);
        const usernameField = await page.$('input[type="text"], input[type="email"]');
        const passwordField = await page.$('input[type="password"]');

        if (usernameField && passwordField) {
            await usernameField.type(username, { delay: 100 });
            await passwordField.type(password, { delay: 100 });
        } else {
            // Método alternativo
            await page.evaluate((user, pass) => {
                const inputs = Array.from(document.querySelectorAll('input'));
                const userInput = inputs.find(input => input.type !== 'password');
                const passInput = inputs.find(input => input.type === 'password');
                
                if (userInput) {
                    userInput.value = user;
                    userInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
                if (passInput) {
                    passInput.value = pass;
                    passInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }, username, password);
        }

        await delay(500);

        // Clicar no botão de login
        console.log(`[${systemName}] Clicando no botão de login...`);
        let loginClicked = false;
        
        try {
            const loginButton = await page.$('button[type="submit"], button.btn-primary, input[type="submit"]');
            if (loginButton) {
                await loginButton.click();
                loginClicked = true;
            }
        } catch (e) {
            // Tentar por texto
            await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const loginBtn = buttons.find(btn => {
                    const text = btn.textContent.toLowerCase().trim();
                    return text.includes('entrar') || text.includes('login');
                });
                if (loginBtn) {
                    loginBtn.click();
                    return true;
                }
                return false;
            });
            loginClicked = true;
        }

        if (!loginClicked) {
            await page.keyboard.press('Enter');
        }

        // Aguardar login
        console.log(`[${systemName}] Aguardando processamento do login...`);
        await delay(5000);

        // Verificar se login foi bem-sucedido
        const currentUrl = page.url();
        console.log(`[${systemName}] URL atual após login: ${currentUrl}`);
        
        if (currentUrl.includes('login')) {
            throw new Error('Falha no login - ainda na página de login');
        }

        // Navegar para a página de listagem de pessoas
        console.log(`[${systemName}] Navegando para página de listagem de pessoas...`);
        await page.goto('https://rhid.com.br/v2/#/list/person', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Aguardar página carregar
        console.log(`[${systemName}] Aguardando página carregar...`);
        await page.waitForFunction(() => {
            return document.readyState === 'complete';
        }, { timeout: 20000 });
        
        await delay(5000);

        // Clicar no botão de menu (três pontos)
        console.log(`[${systemName}] Procurando botão de menu...`);
        await page.waitForSelector('.m-dropdown__toggle', { timeout: 15000 });
        console.log(`[${systemName}] Botão de menu encontrado, clicando...`);
        await page.click('.m-dropdown__toggle');
        await delay(2000);

        // Clicar em "Exportar CSV" usando o seletor correto
        console.log(`[${systemName}] Procurando opção "Exportar CSV"...`);
        try {
            // Aguardar o dropdown aparecer
            await page.waitForSelector('a[ng-click="exportCSV()"]', { timeout: 10000 });
            console.log(`[${systemName}] Link "Exportar CSV" encontrado, clicando...`);
            await page.click('a[ng-click="exportCSV()"]');
            console.log(`[${systemName}] Link "Exportar CSV" clicado com sucesso`);
        } catch (e) {
            console.log(`[${systemName}] Tentando método alternativo para encontrar "Exportar CSV"...`);
            // Método alternativo: procurar por texto
            const csvLinkClicked = await page.evaluate(() => {
                // Procurar link com ng-click="exportCSV()"
                const exportLink = document.querySelector('a[ng-click="exportCSV()"]');
                if (exportLink) {
                    exportLink.click();
                    return true;
                }
                
                // Procurar por texto "Exportar CSV" dentro de links
                const links = Array.from(document.querySelectorAll('a.m-nav__link'));
                for (const link of links) {
                    const span = link.querySelector('span.m-nav__link-text');
                    if (span && span.textContent.trim().includes('Exportar CSV')) {
                        link.click();
                        return true;
                    }
                }
                return false;
            });

            if (!csvLinkClicked) {
                throw new Error('Não foi possível encontrar o link "Exportar CSV"');
            }
        }

        console.log(`[${systemName}] Aguardando download do CSV...`);
        await delay(5000);

        // Procurar arquivo CSV baixado
        const files = fs.readdirSync(downloadsDir);
        const csvFile = files.find(file => file.endsWith('.csv'));
        
        if (!csvFile) {
            throw new Error('Arquivo CSV não foi baixado');
        }

        const csvPath = path.join(downloadsDir, csvFile);
        console.log(`[${systemName}] Arquivo CSV encontrado: ${csvFile}`);

        // Ler e processar CSV
        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        const lines = csvContent.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
            throw new Error('Arquivo CSV está vazio');
        }

        // Função para parsear CSV corretamente (lidando com vírgulas dentro de aspas)
        function parseCSVLine(line) {
            const result = [];
            let current = '';
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            result.push(current.trim());
            return result;
        }

        // Parsear CSV
        const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ''));
        const data = [];
        let ativos = 0;
        let inativos = 0;

        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]).map(v => v.replace(/^"|"$/g, ''));
            if (values.length === 0 || values.every(v => !v)) continue;

            const rowData = {};
            headers.forEach((header, index) => {
                rowData[header] = values[index] || '';
            });
            data.push(rowData);

            // Contar status - procurar em qualquer coluna
            for (const [key, value] of Object.entries(rowData)) {
                if (value && typeof value === 'string') {
                    const lowerValue = value.toLowerCase();
                    if (lowerValue === 'ativo' || lowerValue === 'active') {
                        ativos++;
                        break;
                    } else if (lowerValue === 'inativo' || lowerValue === 'inactive') {
                        inativos++;
                        break;
                    }
                }
            }
        }

        console.log(`[${systemName}] CSV processado: ${data.length} registros, Ativos=${ativos}, Inativos=${inativos}`);

        // Obter cookies antes de fechar o browser
        const cookies = await page.cookies();

        // Limpar arquivo CSV
        try {
            fs.unlinkSync(csvPath);
        } catch (e) {
            console.log(`[${systemName}] Erro ao deletar arquivo CSV: ${e.message}`);
        }

        await browser.close();

        return {
            success: true,
            cookies: cookies,
            data: {
                csvData: data,
                total: data.length,
                ativos: ativos,
                inativos: inativos,
                headers: headers
            }
        };
    } catch (error) {
        if (browser) await browser.close();
        console.error(`[${systemName}] Erro:`, error);
        throw error;
    }
}

// Função para fazer login no RHID
async function loginRHID(username, password) {
    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        
        // Acessar página de login
        console.log('Acessando página de login...');
        await page.goto('https://rhid.com.br/v2/#/login', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Aguardar um pouco para o JavaScript carregar (aplicações SPA)
        await delay(2000);

        // Aguardar campos de login aparecerem - tentar múltiplos seletores
        console.log('Procurando campos de login...');
        let usernameField = null;
        let passwordField = null;

        const usernameSelectors = [
            'input[type="text"]',
            'input[type="email"]',
            'input[name*="user"]',
            'input[name*="login"]',
            'input[name*="username"]',
            'input[id*="user"]',
            'input[id*="login"]',
            'input[placeholder*="usuário" i]',
            'input[placeholder*="email" i]',
            'input[placeholder*="login" i]'
        ];
        
        const passwordSelectors = [
            'input[type="password"]',
            'input[name*="pass"]',
            'input[name*="password"]',
            'input[id*="pass"]',
            'input[placeholder*="senha" i]'
        ];

        // Tentar encontrar campo de usuário
        let usernameSelector = null;
        for (const selector of usernameSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 2000, visible: true });
                const element = await page.$(selector);
                if (element) {
                    const isVisible = await element.isIntersectingViewport();
                    if (isVisible) {
                        usernameField = element;
                        usernameSelector = selector;
                        console.log(`Campo de usuário encontrado: ${selector}`);
                        break;
                    }
                }
            } catch (e) {
                // Continuar tentando
            }
        }

        // Tentar encontrar campo de senha
        let passwordSelector = null;
        for (const selector of passwordSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 2000, visible: true });
                const element = await page.$(selector);
                if (element) {
                    const isVisible = await element.isIntersectingViewport();
                    if (isVisible) {
                        passwordField = element;
                        passwordSelector = selector;
                        console.log(`Campo de senha encontrado: ${selector}`);
                        break;
                    }
                }
            } catch (e) {
                // Continuar tentando
            }
        }

        if (!usernameField || !passwordField) {
            // Se não encontrou, tentar método alternativo
            console.log('Tentando método alternativo para encontrar campos...');
            const allInputs = await page.$$('input');
            console.log(`Total de inputs encontrados: ${allInputs.length}`);
            
            if (allInputs.length >= 2) {
                // Verificar qual é qual
                for (let i = 0; i < allInputs.length; i++) {
                    const input = allInputs[i];
                    const inputType = await page.evaluate(el => el.type, input);
                    if (inputType === 'text' || inputType === 'email') {
                        usernameField = input;
                        usernameSelector = `input:nth-of-type(${i + 1})`;
                    } else if (inputType === 'password') {
                        passwordField = input;
                        passwordSelector = `input:nth-of-type(${i + 1})`;
                    }
                }
            }
            
            if (!usernameField || !passwordField) {
                throw new Error('Não foi possível encontrar os campos de login');
            }
        }

        // Preencher campos usando evaluate (mais confiável para SPAs)
        console.log('Preenchendo campos de login...');
        
        // Preencher usuário
        await page.evaluate((selector, value) => {
            const input = document.querySelector(selector);
            if (input) {
                // Limpar campo
                input.value = '';
                // Preencher
                input.value = value;
                // Disparar eventos para frameworks JavaScript
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new Event('blur', { bubbles: true }));
                // Focar no campo
                input.focus();
            }
        }, usernameSelector || 'input[type="text"]', username);
        await delay(300);
        console.log('Usuário preenchido');
        
        // Preencher senha
        await page.evaluate((selector, value) => {
            const input = document.querySelector(selector);
            if (input) {
                // Limpar campo
                input.value = '';
                // Preencher
                input.value = value;
                // Disparar eventos para frameworks JavaScript
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new Event('blur', { bubbles: true }));
                // Focar no campo
                input.focus();
            }
        }, passwordSelector || 'input[type="password"]', password);
        await delay(300);
        console.log('Senha preenchida');

        // Aguardar um pouco após preencher
        await delay(500);

        // Encontrar e clicar no botão de login
        console.log('Procurando botão de login...');
        let loginClicked = false;
        
        // Método 1: Tentar seletores CSS comuns
        const buttonSelectors = [
            'button[type="submit"]',
            'button.btn-primary',
            'button.btn',
            '.btn-primary',
            'button[class*="btn"]',
            'input[type="submit"]',
            'button:not([disabled])'
        ];
        
        for (const selector of buttonSelectors) {
            try {
                const buttons = await page.$$(selector);
                if (buttons.length > 0) {
                    // Pegar o último botão (geralmente é o de submit)
                    const button = buttons[buttons.length - 1];
                    const isVisible = await button.isIntersectingViewport();
                    if (isVisible) {
                        await button.click();
                        console.log(`Botão clicado: ${selector}`);
                        loginClicked = true;
                        break;
                    }
                }
            } catch (e) {
                // Continuar tentando
            }
        }
        
        // Método 2: Se não encontrou, buscar por texto
        if (!loginClicked) {
            try {
                const clicked = await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a[class*="btn"]'));
                    const loginButton = buttons.find(btn => {
                        const text = btn.textContent.toLowerCase().trim();
                        return text.includes('entrar') || 
                               text.includes('login') || 
                               text.includes('acessar') ||
                               text.includes('sign in') ||
                               text === 'entrar' ||
                               text === 'login';
                    });
                    if (loginButton) {
                        loginButton.click();
                        return true;
                    }
                    return false;
                });
                if (clicked) {
                    console.log('Botão encontrado por texto e clicado');
                    loginClicked = true;
                }
            } catch (e) {
                console.log('Erro ao buscar botão por texto:', e.message);
            }
        }

        // Método 3: Tentar pressionar Enter no campo de senha
        if (!loginClicked) {
            console.log('Tentando pressionar Enter...');
            await passwordField.focus();
            await page.keyboard.press('Enter');
            loginClicked = true;
        }
        
        // Aguardar navegação ou mudança na página após login
        console.log('Aguardando resposta do login...');
        try {
            // Aguardar navegação ou mudança de URL
            await Promise.race([
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
                page.waitForFunction(() => !window.location.href.includes('login'), { timeout: 15000 })
            ]);
        } catch (e) {
            // Se não houver navegação, aguardar um pouco para o JavaScript processar
            console.log('Aguardando processamento do login...');
            await delay(5000);
        }

        // Verificar se login foi bem-sucedido
        const currentUrl = page.url();
        console.log(`URL atual após login: ${currentUrl}`);
        
        // Verificar também se há elementos que indicam login bem-sucedido
        const loginSuccess = await page.evaluate(() => {
            // Verificar se ainda está na página de login
            const isLoginPage = window.location.href.includes('login') || 
                               window.location.href.includes('auth');
            
            // Verificar se há elementos que indicam dashboard/logado
            const dashboardIndicators = document.querySelectorAll('[class*="dashboard"], [class*="menu"], [id*="menu"]');
            
            return !isLoginPage || dashboardIndicators.length > 0;
        });

        if (currentUrl.includes('login') && !loginSuccess) {
            // Verificar se há mensagem de erro
            const errorMessage = await page.evaluate(() => {
                const errorElements = document.querySelectorAll('[class*="error"], [class*="alert"], [class*="message"]');
                for (const el of errorElements) {
                    const text = el.textContent.toLowerCase();
                    if (text.includes('erro') || text.includes('inválid') || text.includes('incorret')) {
                        return el.textContent.trim();
                    }
                }
                return null;
            });
            
            throw new Error(errorMessage || 'Credenciais inválidas ou falha no login. Verifique usuário e senha.');
        }

        // Aguardar um pouco para garantir que o login foi processado
        await delay(2000);

        // Navegar para a página de listagem de pessoas
        console.log('[RHID] Navegando para página de listagem de pessoas...');
        try {
            await page.goto('https://rhid.com.br/v2/#/list/person', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
            console.log('Navegação para /list/person concluída');
        } catch (e) {
            console.log('Erro ao navegar, tentando via hash...');
            // Tentar mudar apenas o hash
            await page.evaluate(() => {
                window.location.hash = '#/list/person';
            });
            await delay(3000);
        }

        // Obter cookies da sessão
        const cookies = await page.cookies();
        console.log(`[RHID] Login bem-sucedido! Cookies obtidos: ${cookies.length}`);
        
        // Fechar browser
        await browser.close();
        
        return { cookies, success: true };
    } catch (error) {
        if (browser) {
            await browser.close();
        }
        console.error('Erro detalhado no login:', error);
        throw error;
    }
}

// Função para buscar dados da tabela HTML
async function fetchPersonList(cookies) {
    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        
        // Definir cookies da sessão
        await page.setCookie(...cookies);
        
        console.log('Acessando página de listagem de pessoas...');
        // Acessar página de listagem de pessoas
        await page.goto('https://rhid.com.br/v2/#/list/person', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Aguardar página carregar completamente
        console.log('Aguardando página carregar completamente...');
        await page.waitForFunction(() => {
            return document.readyState === 'complete';
        }, { timeout: 15000 });
        
        // Aguardar um pouco mais para o Angular renderizar
        await delay(5000);
        
        // Aguardar tabela aparecer
        console.log('Aguardando tabela #mydatatable aparecer...');
        let tableFound = false;
        
        // Tentar aguardar pela tabela
        try {
            await page.waitForSelector('#mydatatable', { timeout: 15000, visible: true });
            tableFound = true;
            console.log('Tabela #mydatatable encontrada!');
        } catch (e) {
            console.log('Tabela não encontrada imediatamente, tentando outras seletores...');
            try {
                await page.waitForSelector('table[datatable], table.dataTable, table#mydatatable', { timeout: 10000, visible: true });
                tableFound = true;
                console.log('Tabela encontrada por seletor alternativo!');
            } catch (e2) {
                console.log('Aguardando mais tempo para tabela carregar...');
                await delay(5000);
                // Verificar se a tabela existe
                const tableExists = await page.evaluate(() => {
                    return !!document.querySelector('#mydatatable') || 
                           !!document.querySelector('table[datatable]') ||
                           !!document.querySelector('table.dataTable');
                });
                if (tableExists) {
                    tableFound = true;
                    console.log('Tabela encontrada após espera adicional!');
                }
            }
        }
        
        // Aguardar mais um pouco para garantir que os dados estão renderizados
        await delay(3000);
        
        // Extrair dados da tabela
        console.log('Extraindo dados da tabela...');
        const tableData = await page.evaluate(() => {
            const result = {
                data: [],
                total: 0,
                ativos: 0,
                inativos: 0,
                error: null
            };

            // Procurar pela tabela específica
            let table = document.querySelector('#mydatatable');
            
            // Tentativa 2: Atributo datatable
            if (!table) {
                table = document.querySelector('table[datatable]');
            }
            
            // Tentativa 3: Classe dataTable
            if (!table) {
                table = document.querySelector('table.dataTable');
            }
            
            // Tentativa 4: Qualquer tabela com tbody
            if (!table) {
                const tables = document.querySelectorAll('table');
                for (let t of tables) {
                    if (t.querySelector('tbody') && t.querySelector('tbody tr')) {
                        table = t;
                        break;
                    }
                }
            }

            if (!table) {
                result.error = 'Tabela não encontrada no DOM';
                console.log('Tabela não encontrada. Elementos disponíveis:', document.querySelectorAll('table').length);
                return result;
            }
            
            console.log('Tabela encontrada!', table.id || table.className);

            // Extrair cabeçalhos
            const headers = [];
            const headerRows = table.querySelectorAll('thead tr');
            if (headerRows.length > 0) {
                const headerCells = headerRows[0].querySelectorAll('th');
                headerCells.forEach((th) => {
                    const text = th.textContent.trim();
                    // Ignorar colunas de ação (editar/excluir)
                    if (text && !th.classList.contains('edit-delete-table-th')) {
                        headers.push(text);
                    }
                });
            }

            // Extrair dados das linhas
            const rows = table.querySelectorAll('tbody tr');
            result.total = rows.length;

            rows.forEach((row) => {
                const cells = row.querySelectorAll('td');
                const rowData = {};
                
                let headerIndex = 0;
                cells.forEach((cell) => {
                    // Ignorar colunas de ação (editar/excluir)
                    if (!cell.classList.contains('edit-delete-table-th')) {
                        const header = headers[headerIndex] || `Coluna${headerIndex + 1}`;
                        const cellText = cell.textContent.trim();
                        rowData[header] = cellText;
                        
                        // Contar status
                        if (header.toLowerCase().includes('status') || 
                            header.toLowerCase() === 'status') {
                            const status = cellText.toLowerCase();
                            if (status === 'ativo' || status === 'active') {
                                result.ativos++;
                            } else if (status === 'inativo' || status === 'inactive') {
                                result.inativos++;
                            }
                        }
                        
                        headerIndex++;
                    }
                });
                
                if (Object.keys(rowData).length > 0) {
                    result.data.push(rowData);
                }
            });

            // Se não conseguiu contar status, tentar calcular
            if (result.total > 0 && result.ativos === 0 && result.inativos === 0) {
                result.data.forEach(item => {
                    const statusValue = Object.values(item).find(val => 
                        val && (val.toString().toLowerCase() === 'ativo' || 
                               val.toString().toLowerCase() === 'inativo' ||
                               val.toString().toLowerCase() === 'active' ||
                               val.toString().toLowerCase() === 'inactive')
                    );
                    if (statusValue) {
                        const status = statusValue.toString().toLowerCase();
                        if (status === 'ativo' || status === 'active') {
                            result.ativos++;
                        } else {
                            result.inativos++;
                        }
                    }
                });
            }

            return result;
        });

        if (tableData.error) {
            throw new Error(tableData.error);
        }

        console.log(`Dados extraídos: ${tableData.data.length} registros, Total=${tableData.total}, Ativos=${tableData.ativos}, Inativos=${tableData.inativos}`);

        await browser.close();
        
        return {
            data: tableData.data,
            total: tableData.total || tableData.data.length,
            ativos: tableData.ativos,
            inativos: tableData.inativos
        };
    } catch (error) {
        if (browser) {
            await browser.close();
        }
        console.error('Erro ao buscar dados:', error);
        throw error;
    }
}

// Função para fazer login no DoctorID
async function loginDoctorID(username, password) {
    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        
        // Acessar página de login do website
        console.log('[DOCTORID] Acessando página de login (website)...');
        await page.goto('https://www.doctorid.com.br/website', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        await delay(3000);

        // Preencher credenciais usando os campos específicos
        console.log('[DOCTORID] Preenchendo credenciais...');
        await page.evaluate((user, pass) => {
            // Campo de usuário (CRM ou E-mail)
            const userInput = document.querySelector('input[name="S_IDENTIFIER"]');
            if (userInput) {
                userInput.value = user;
                userInput.dispatchEvent(new Event('input', { bubbles: true }));
                userInput.dispatchEvent(new Event('change', { bubbles: true }));
                userInput.dispatchEvent(new Event('blur', { bubbles: true }));
            }
            
            // Campo de senha
            const passInput = document.querySelector('input[name="S_PASSWORD"]');
            if (passInput) {
                passInput.value = pass;
                passInput.dispatchEvent(new Event('input', { bubbles: true }));
                passInput.dispatchEvent(new Event('change', { bubbles: true }));
                passInput.dispatchEvent(new Event('blur', { bubbles: true }));
            }
        }, username, password);

        await delay(1000);

        // Clicar no botão de login
        console.log('[DOCTORID] Clicando no botão de login...');
        const buttonClicked = await page.evaluate(() => {
            // Procurar botão de submit ou botão com texto de login
            const submitBtn = document.querySelector('button[type="submit"], input[type="submit"]');
            if (submitBtn) {
                submitBtn.click();
                return true;
            }
            
            // Procurar por botões com texto "Login", "Entrar", etc.
            const buttons = Array.from(document.querySelectorAll('button, input[type="button"]'));
            const loginBtn = buttons.find(btn => {
                const text = btn.textContent.toLowerCase().trim();
                return text.includes('entrar') || 
                       text.includes('login') || 
                       text.includes('acessar') ||
                       text === 'entrar' ||
                       text === 'login';
            });
            
            if (loginBtn) {
                loginBtn.click();
                return true;
            }
            return false;
        });

        if (!buttonClicked) {
            // Tentar pressionar Enter
            console.log('[DOCTORID] Tentando pressionar Enter...');
            await page.keyboard.press('Enter');
        }

        // Aguardar processamento do login
        console.log('[DOCTORID] Aguardando processamento do login...');
        await delay(5000);

        // Verificar se login foi bem-sucedido
        const currentUrl = page.url();
        console.log(`URL atual após login: ${currentUrl}`);
        
        const loginSuccess = await page.evaluate(() => {
            const isLoginPage = window.location.href.includes('login');
            const hasDashboard = document.querySelector('[class*="dashboard"], [class*="menu"], [id*="menu"]');
            return !isLoginPage || hasDashboard !== null;
        });

        if (!loginSuccess) {
            await browser.close();
            return { success: false, cookies: [], data: null };
        }

        console.log('[DOCTORID] ✅ Login bem-sucedido!');
        
        // Navegar para a página de groupCompany/users
        console.log('[DOCTORID] Navegando para página groupCompany/users...');
        try {
            await page.goto('https://www.doctorid.com.br/#groupCompany/users', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
            console.log('[DOCTORID] Navegação para /#groupCompany/users concluída');
        } catch (e) {
            console.log('[DOCTORID] Erro ao navegar, tentando via hash...');
            await page.evaluate(() => {
                window.location.hash = '#groupCompany/users';
            });
            await delay(5000);
        }

        // Aguardar página carregar completamente
        console.log('[DOCTORID] Aguardando página carregar...');
        await page.waitForFunction(() => {
            return document.readyState === 'complete';
        }, { timeout: 20000 });
        
        // Aguardar JavaScript/Angular renderizar
        console.log('[DOCTORID] Aguardando JavaScript/Angular renderizar...');
        await delay(8000);
        
        // Procurar e clicar no botão "Filtrar" (id="gerarTela")
        console.log('[DOCTORID] Procurando botão Filtrar (id="gerarTela")...');
        try {
            await page.waitForSelector('#gerarTela', { timeout: 15000 });
            console.log('[DOCTORID] Botão Filtrar encontrado!');
            
            // Clicar no botão
            await page.click('#gerarTela');
            console.log('[DOCTORID] Botão Filtrar clicado com sucesso');
            
            // Aguardar processamento após clicar
            console.log('[DOCTORID] Aguardando processamento após clicar no botão...');
            await delay(5000);
            
            // Aguardar elemento #mensagens aparecer
            console.log('[DOCTORID] Aguardando elemento #mensagens aparecer...');
            try {
                await page.waitForSelector('#mensagens', { timeout: 15000 });
                console.log('[DOCTORID] Elemento #mensagens encontrado');
            } catch (e) {
                console.log('[DOCTORID] Aguardando mais tempo para #mensagens aparecer...');
                await delay(5000);
            }
            
            // Extrair dados do elemento #mensagens
            console.log('[DOCTORID] Extraindo dados do elemento #mensagens...');
            const data = await page.evaluate(() => {
                const result = {
                    registros: 0,
                    message: null,
                    source: null,
                    selector: null
                };

                // Tentar o caminho específico primeiro
                const specificElement = document.querySelector('#mensagens > div:nth-child(6) > div');
                if (specificElement) {
                    const text = specificElement.textContent || specificElement.innerText;
                    const match = text.match(/(\d+)\s*registro/i);
                    if (match) {
                        result.registros = parseInt(match[1]);
                        result.message = text.trim();
                        result.source = 'Element #mensagens > div:nth-child(6) > div';
                        result.selector = '#mensagens > div:nth-child(6) > div';
                        return result;
                    }
                }

                // Se não encontrou, procurar em #mensagens
                const mensagensElement = document.querySelector('#mensagens');
                if (mensagensElement) {
                    const text = mensagensElement.textContent || mensagensElement.innerText;
                    const match = text.match(/(\d+)\s*registro/i);
                    if (match) {
                        result.registros = parseInt(match[1]);
                        result.message = text.trim();
                        result.source = 'Element #mensagens';
                        result.selector = '#mensagens';
                        return result;
                    }
                }

                // Última tentativa: procurar qualquer alert na página
                const alerts = Array.from(document.querySelectorAll('.alert'));
                for (const alert of alerts) {
                    const text = alert.textContent || alert.innerText;
                    const match = text.match(/(\d+)\s*registro/i);
                    if (match) {
                        result.registros = parseInt(match[1]);
                        result.message = text.trim();
                        result.source = 'Alert element';
                        result.selector = '.alert';
                        return result;
                    }
                }

                return result;
            });

            console.log(`[DOCTORID] Dados extraídos: ${data.registros} registros encontrados`);
            if (data.registros > 0) {
                console.log(`[DOCTORID] Fonte: ${data.source} | Seletor: ${data.selector}`);
            }

            const cookies = await page.cookies();
            await browser.close();
            
            console.log('[DOCTORID] ✅ Processo completo finalizado!');

            return { 
                success: true, 
                cookies,
                data: {
                    registros: data.registros || 0,
                    message: data.message || 'Nenhum registro encontrado',
                    source: data.source || 'Não encontrado',
                    selector: data.selector || 'N/A'
                }
            };
            
        } catch (e) {
            console.log(`[DOCTORID] Erro ao encontrar/clicar no botão: ${e.message}`);
            const cookies = await page.cookies();
            await browser.close();
            return { 
                success: true, 
                cookies,
                data: {
                    registros: 0,
                    message: `Erro ao extrair dados: ${e.message}`,
                    source: 'Erro',
                    selector: 'N/A'
                }
            };
        }
    } catch (error) {
        if (browser) await browser.close();
        console.error('Erro no login DoctorID:', error);
        throw error;
    }
}


// Rota para verificar login de um sistema específico
app.post('/api/check-login/:system', async (req, res) => {
    try {
        const { system } = req.params;
        const creds = CREDENTIALS[system];
        
        if (!creds) {
            return res.status(400).json({ error: 'Sistema não encontrado' });
        }

        let loginResult;
        
        if (creds.system === 'rhid') {
            // Se for coop-vitta ou delta, usar função que exporta CSV
            if (system === 'coop-vitta' || system === 'delta') {
                const systemName = system === 'coop-vitta' ? 'COOP-VITTA' : 'DELTA';
                loginResult = await loginRHIDAndExportCSV(creds.username, creds.password, systemName);
            } else {
                // Para outros sistemas RHID, apenas fazer login
                loginResult = await loginRHID(creds.username, creds.password);
            }
        } else if (creds.system === 'doctorid') {
            loginResult = await loginDoctorID(creds.username, creds.password);
        } else {
            return res.status(400).json({ error: 'Sistema não suportado' });
        }

        // Retornar status do login e dados (se disponível)
        res.json({ 
            success: loginResult.success !== false,
            message: loginResult.success !== false ? 'Login bem-sucedido' : 'Falha no login',
            system: creds.system,
            data: loginResult.data || null
        });
    } catch (error) {
        console.error('Erro ao verificar login:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao verificar login', 
            message: error.message 
        });
    }
});

// Rota de login (mantida para compatibilidade)
app.post('/api/rhid/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
        }

        const loginResult = await loginRHID(username, password);
        
        // Criar sessão
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        sessions.set(sessionId, {
            cookies: loginResult.cookies,
            username,
            createdAt: new Date()
        });

        res.json({ 
            success: true, 
            sessionId,
            message: 'Login realizado com sucesso'
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(401).json({ 
            error: 'Falha no login', 
            message: error.message 
        });
    }
});

// Rota para buscar lista de pessoas
app.get('/api/rhid/persons', async (req, res) => {
    try {
        const sessionId = req.headers['x-session-id'];
        
        if (!sessionId) {
            return res.status(401).json({ error: 'Sessão não encontrada. Faça login primeiro.' });
        }

        const session = sessions.get(sessionId);
        if (!session) {
            return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
        }

        const result = await fetchPersonList(session.cookies);
        
        res.json({ 
            success: true, 
            data: result.data,
            total: result.total,
            ativos: result.ativos,
            inativos: result.inativos,
            count: result.data.length
        });
    } catch (error) {
        console.error('Erro ao buscar pessoas:', error);
        res.status(500).json({ 
            error: 'Erro ao buscar dados', 
            message: error.message 
        });
    }
});

// Rota de logout
app.post('/api/rhid/logout', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    if (sessionId) {
        sessions.delete(sessionId);
    }
    res.json({ success: true, message: 'Logout realizado com sucesso' });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📊 Dashboard disponível em http://localhost:${PORT}`);
});

