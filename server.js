const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar CORS para aceitar requisições do Netlify e localhost
app.use(cors({
    origin: function (origin, callback) {
        // Permitir requisições sem origin (mobile apps, Postman, etc)
        if (!origin) {
            console.log('[CORS] Requisição sem origin, permitindo');
            return callback(null, true);
        }
        
        console.log(`[CORS] Verificando origem: ${origin}`);
        
        // Lista de origens permitidas
        const allowedPatterns = [
            'localhost',
            '127.0.0.1',
            '.netlify.app',
            'dashboardmonitor.netlify.app' // URL específica do Netlify
        ];
        
        // Verificar se a origem corresponde a algum padrão permitido
        const isAllowed = allowedPatterns.some(pattern => origin.includes(pattern));
        
        if (isAllowed) {
            console.log(`[CORS] ✅ Origem permitida: ${origin}`);
            callback(null, true);
        } else {
            // Em produção, permitir todas as origens por enquanto (ajustar se necessário)
            console.log(`[CORS] ⚠️ Origem não na lista, mas permitindo: ${origin}`);
            callback(null, true);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'X-Session-Id', 
        'X-Requested-With',
        'Cache-Control',
        'Pragma',
        'Accept',
        'Accept-Language',
        'User-Agent',
        'ngrok-skip-browser-warning'
    ],
    exposedHeaders: ['Content-Length', 'Content-Type'],
    maxAge: 86400 // 24 horas
}));
app.use(express.json());
app.use(express.static('.'));

// Criar diretório de downloads se não existir
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

// Armazenar sessões (em produção, use Redis ou similar)
const sessions = new Map();

// Sistema de Cache para pré-carregar dados no servidor
const cache = {
    // Cache de logins por sistema (cada sistema tem seu próprio cache)
    logins: new Map(), // { 'viva-saude': { data, timestamp }, 'coop-vitta': { data, timestamp }, 'delta': { data, timestamp } }
    // Cache de dados financeiros
    financeiro: {
        data: null,
        timestamp: null
    },
    // Configuração
    config: {
        TTL_LOGINS: 5 * 60 * 1000, // 5 minutos para logins
        TTL_FINANCEIRO: 10 * 60 * 1000, // 10 minutos para financeiro
        UPDATE_INTERVAL: 4 * 60 * 1000 // Atualizar a cada 4 minutos
    }
};

// Função para verificar se cache está válido
function isCacheValid(timestamp, ttl) {
    if (!timestamp) return false;
    return (Date.now() - timestamp) < ttl;
}

// Função para atualizar cache de um sistema específico em background
async function updateSystemCache(system) {
    try {
        console.log(`[CACHE] Atualizando cache de ${system} em background...`);
        const creds = CREDENTIALS[system];
        
        if (!creds || !creds.username || !creds.password) {
            console.log(`[CACHE] Credenciais não configuradas para ${system}`);
            return;
        }
        
        let loginResult;
        
        if (creds.system === 'rhid') {
            if (system === 'coop-vitta' || system === 'delta') {
                const systemName = system === 'coop-vitta' ? 'COOP-VITTA' : 'DELTA';
                loginResult = await loginRHIDAndExportCSV(creds.username, creds.password, systemName);
            } else {
                loginResult = await loginRHID(creds.username, creds.password);
            }
        } else if (creds.system === 'doctorid') {
            loginResult = await loginDoctorID(creds.username, creds.password);
        }
        
        // Salvar no cache com chave específica do sistema
        const cacheData = {
            success: loginResult.success !== false,
            message: loginResult.success !== false ? 'Login bem-sucedido' : 'Falha no login',
            system: creds.system,
            systemKey: system, // Garantir que sabemos qual sistema é
            data: loginResult.data || null
        };
        
        cache.logins.set(system, {
            data: cacheData,
            timestamp: Date.now()
        });
        
        // Log detalhado para garantir diferenciação
        const registros = loginResult.data?.total || loginResult.data?.registros || 'N/A';
        console.log(`[CACHE] ✅ Cache de ${system} atualizado: ${registros} registros`);
        console.log(`[CACHE] Sistema: ${creds.system}, Chave: ${system}`);
    } catch (error) {
        console.error(`[CACHE] ❌ Erro ao atualizar cache de ${system}:`, error.message);
    }
}

// Função para atualizar cache financeiro em background
async function updateFinanceiroCache() {
    try {
        console.log('[CACHE] Atualizando cache financeiro em background...');
        
        const scriptPath = path.join(__dirname, 'google_sheets_extractor.py');
        const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
        const fullCommand = `"${pythonCommand}" "${scriptPath}"`;
        
        const { stdout, stderr } = await Promise.race([
            execAsync(fullCommand, {
                maxBuffer: 10 * 1024 * 1024,
                timeout: 600000,
                cwd: __dirname,
                env: {
                    ...process.env,
                    PYTHONUNBUFFERED: '1'
                }
            }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout: Script Python demorou mais de 3 minutos')), 180000)
            )
        ]);
        
        let result;
        try {
            const stdoutClean = stdout.trim();
            const jsonMatch = stdoutClean.match(/\{[\s\S]*\}/);
            const jsonString = jsonMatch ? jsonMatch[0] : stdoutClean;
            
            if (!jsonString || jsonString.length < 10) {
                throw new Error('JSON não encontrado no stdout');
            }
            
            result = JSON.parse(jsonString);
        } catch (parseError) {
            console.error('[CACHE] Erro ao parsear JSON:', parseError.message);
            throw new Error(`Resposta inválida do script Python: ${parseError.message}`);
        }
        
        if (!result || typeof result !== 'object') {
            throw new Error('Resposta do script Python não é um objeto válido');
        }
        
        if (result.success === undefined) {
            result.success = true;
        }
        
        cache.financeiro.data = result;
        cache.financeiro.timestamp = Date.now();
        
        console.log('[CACHE] ✅ Cache financeiro atualizado com sucesso');
    } catch (error) {
        console.error('[CACHE] ❌ Erro ao atualizar cache financeiro:', error.message);
    }
}

// Iniciar atualização automática em background
function startBackgroundUpdates() {
    console.log('[CACHE] Iniciando pré-carregamento automático de dados...');
    
    // Atualizar todos os sistemas periodicamente
    setInterval(() => {
        console.log('[CACHE] Iniciando ciclo de atualização automática...');
        
        // Atualizar cada sistema individualmente
        Object.keys(CREDENTIALS).forEach(system => {
            const cached = cache.logins.get(system);
            // Atualizar se não há cache ou se está próximo de expirar
            if (!cached || !isCacheValid(cached.timestamp, cache.config.TTL_LOGINS - cache.config.UPDATE_INTERVAL)) {
                updateSystemCache(system).catch(err => {
                    console.error(`[CACHE] Erro ao atualizar ${system}:`, err.message);
                });
            }
        });
        
        // Atualizar financeiro
        if (!cache.financeiro.data || !isCacheValid(cache.financeiro.timestamp, cache.config.TTL_FINANCEIRO - cache.config.UPDATE_INTERVAL)) {
            updateFinanceiroCache().catch(err => {
                console.error('[CACHE] Erro ao atualizar financeiro:', err.message);
            });
        }
    }, cache.config.UPDATE_INTERVAL);
    
    // Atualização inicial imediata (após 10 segundos do servidor iniciar)
    setTimeout(() => {
        console.log('[CACHE] Executando pré-carregamento inicial...');
        Object.keys(CREDENTIALS).forEach(system => {
            updateSystemCache(system).catch(err => {
                console.error(`[CACHE] Erro no pré-carregamento inicial de ${system}:`, err.message);
            });
        });
        updateFinanceiroCache().catch(err => {
            console.error('[CACHE] Erro no pré-carregamento inicial financeiro:', err.message);
        });
    }, 10000); // 10 segundos após iniciar
}

// Iniciar pré-carregamento em background
startBackgroundUpdates();

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

// Em produção (Render), as credenciais vêm de variáveis de ambiente, não de .env
const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;

if (missingCredentials.length > 0) {
    if (isProduction) {
        // Em produção, apenas avisar mas não bloquear o servidor
        console.warn('⚠️  AVISO: Algumas credenciais não estão configuradas como variáveis de ambiente:');
        missingCredentials.forEach(key => {
            console.warn(`   - ${key}`);
        });
        console.warn('\n📝 Configure as variáveis de ambiente no painel do Render:');
        missingCredentials.forEach(key => {
            const envKey = key.toUpperCase().replace('-', '_');
            console.warn(`   - ${envKey}_USERNAME`);
            console.warn(`   - ${envKey}_PASSWORD`);
        });
        console.warn('\n⚠️  O servidor iniciará, mas os sistemas sem credenciais não funcionarão.');
    } else {
        // Em desenvolvimento, bloquear se não tiver .env
        console.error('⚠️  ERRO: Credenciais não configuradas no arquivo .env:');
        missingCredentials.forEach(key => {
            console.error(`   - ${key}`);
        });
        console.error('\n📝 Crie um arquivo .env baseado no .env.example e preencha as credenciais.');
        process.exit(1);
    }
}

// Helper function para delay (substitui waitForTimeout que foi removido)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Função wrapper para lançar Puppeteer com instalação automática do Chrome se necessário
async function launchPuppeteer(retries = 3) {
    const puppeteer = require('puppeteer');
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const options = getPuppeteerOptions();
            
            // No Render, verificar se Chrome está instalado
            if (process.env.RENDER) {
                try {
                    const executablePath = puppeteer.executablePath();
                    if (!executablePath || !fs.existsSync(executablePath)) {
                        console.log(`[PUPPETEER] Chrome não encontrado, tentando instalar...`);
                        const { execSync } = require('child_process');
                        const cacheDir = process.env.PUPPETEER_CACHE_DIR || '/opt/render/.cache/puppeteer';
                        
                        try {
                            execSync('npx puppeteer browsers install chrome', { 
                                stdio: 'pipe',
                                env: { ...process.env, PUPPETEER_CACHE_DIR: cacheDir },
                                timeout: 300000 // 5 minutos
                            });
                            console.log(`[PUPPETEER] ✅ Chrome instalado com sucesso`);
                            
                            // Atualizar caminho após instalação
                            const newPath = puppeteer.executablePath();
                            if (newPath && fs.existsSync(newPath)) {
                                options.executablePath = newPath;
                                console.log(`[PUPPETEER] Usando Chrome recém-instalado: ${newPath}`);
                            }
                        } catch (err) {
                            console.error(`[PUPPETEER] ⚠️ Erro ao instalar Chrome: ${err.message}`);
                            console.log(`[PUPPETEER] Tentando continuar sem especificar executablePath...`);
                        }
                    } else {
                        options.executablePath = executablePath;
                        console.log(`[PUPPETEER] ✅ Chrome encontrado: ${executablePath}`);
                    }
                } catch (err) {
                    console.warn(`[PUPPETEER] ⚠️ Erro ao verificar Chrome: ${err.message}`);
                }
            } else {
                // Em desenvolvimento local (Windows), verificar se Chrome está disponível
                try {
                    const executablePath = puppeteer.executablePath();
                    if (executablePath && fs.existsSync(executablePath)) {
                        options.executablePath = executablePath;
                        console.log(`[PUPPETEER] ✅ Chrome encontrado: ${executablePath}`);
                    } else {
                        console.warn(`[PUPPETEER] ⚠️ Chrome não encontrado no caminho padrão, tentando sem especificar...`);
                    }
                } catch (err) {
                    console.warn(`[PUPPETEER] ⚠️ Erro ao verificar Chrome: ${err.message}`);
                }
            }
            
            console.log(`[PUPPETEER] Tentativa ${attempt}/${retries} - Iniciando Chrome...`);
            const browser = await puppeteer.launch(options);
            
            // Verificar se o browser está realmente conectado
            const pages = await browser.pages();
            console.log(`[PUPPETEER] ✅ Chrome iniciado com sucesso! Páginas: ${pages.length}`);
            
            return browser;
        } catch (error) {
            console.error(`[PUPPETEER] ❌ Erro na tentativa ${attempt}/${retries}:`, error.message);
            
            if (attempt < retries) {
                const waitTime = attempt * 2000; // Esperar 2s, 4s, 6s...
                console.log(`[PUPPETEER] Aguardando ${waitTime}ms antes de tentar novamente...`);
                await delay(waitTime);
            } else {
                console.error(`[PUPPETEER] ❌ Falha após ${retries} tentativas`);
                throw new Error(`Não foi possível iniciar o Chrome após ${retries} tentativas: ${error.message}`);
            }
        }
    }
}

// Helper function para configurar Puppeteer (compatível com Render)
function getPuppeteerOptions() {
    const isWindows = process.platform === 'win32';
    
    const options = {
        headless: true,
        timeout: 120000, // 120 segundos para iniciar o Chrome (aumentado de 30s padrão)
        protocolTimeout: 300000, // 5 minutos para operações do protocolo
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            '--disable-hang-monitor',
            '--disable-prompt-on-repost',
            '--disable-sync',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--enable-features=NetworkService,NetworkServiceInProcess',
            '--ignore-certificate-errors',
            '--ignore-ssl-errors',
            '--ignore-certificate-errors-spki-list'
        ]
    };
    
    // No Windows, remover flags que podem causar problemas
    if (!isWindows) {
        options.args.push('--no-zygote', '--single-process');
    }
    
    // No Render, tentar encontrar Chrome
    if (process.env.RENDER) {
        const cacheDir = process.env.PUPPETEER_CACHE_DIR || '/opt/render/.cache/puppeteer';
        console.log(`[PUPPETEER] Procurando Chrome no Render (cache: ${cacheDir})...`);
        
        // Lista de possíveis caminhos do Chrome
        const possiblePaths = [];
        
        // 1. Caminho padrão do Puppeteer
        try {
            const puppeteer = require('puppeteer');
            const defaultPath = puppeteer.executablePath();
            if (defaultPath) {
                possiblePaths.push(defaultPath);
                // Também tentar variações do caminho
                possiblePaths.push(defaultPath.replace('/chrome-linux64/', '/chrome-linux/'));
                possiblePaths.push(defaultPath.replace('/chrome-linux/', '/chrome-linux64/'));
            }
        } catch (err) {
            console.warn(`[PUPPETEER] Erro ao obter caminho padrão: ${err.message}`);
        }
        
        // 2. Procurar no cache do Puppeteer
        if (fs.existsSync(cacheDir)) {
            try {
                const items = fs.readdirSync(cacheDir);
                for (const item of items) {
                    if (item.includes('chrome')) {
                        // Tentar diferentes estruturas de diretório
                        const paths = [
                            path.join(cacheDir, item, 'chrome-linux', 'chrome'),
                            path.join(cacheDir, item, 'chrome-linux64', 'chrome'),
                            path.join(cacheDir, item, 'chrome', 'chrome'),
                            path.join(cacheDir, item, 'chrome')
                        ];
                        possiblePaths.push(...paths);
                    }
                }
            } catch (err) {
                console.warn(`[PUPPETEER] Erro ao listar cache: ${err.message}`);
            }
        }
        
        // 3. Procurar recursivamente no cache
        function findChromeRecursive(dir, depth = 0) {
            if (depth > 3) return; // Limitar profundidade
            try {
                if (!fs.existsSync(dir)) return;
                const items = fs.readdirSync(dir);
                for (const item of items) {
                    const fullPath = path.join(dir, item);
                    const stat = fs.statSync(fullPath);
                    if (stat.isDirectory()) {
                        findChromeRecursive(fullPath, depth + 1);
                    } else if (item === 'chrome' && stat.isFile()) {
                        possiblePaths.push(fullPath);
                    }
                }
            } catch (err) {
                // Ignorar erros
            }
        }
        
        if (fs.existsSync(cacheDir)) {
            findChromeRecursive(cacheDir);
        }
        
        // 4. Tentar encontrar o primeiro caminho válido
        let chromeFound = false;
        for (const chromePath of possiblePaths) {
            try {
                if (chromePath && fs.existsSync(chromePath)) {
                    const stat = fs.statSync(chromePath);
                    if (stat.isFile()) {
                        options.executablePath = chromePath;
                        console.log(`[PUPPETEER] ✅ Chrome encontrado: ${chromePath}`);
                        chromeFound = true;
                        break;
                    }
                }
            } catch (err) {
                // Continuar procurando
            }
        }
        
        if (!chromeFound) {
            console.error(`[PUPPETEER] ❌ Chrome não encontrado!`);
            console.error(`[PUPPETEER] Caminhos testados: ${possiblePaths.slice(0, 5).join(', ')}...`);
            console.error(`[PUPPETEER] Cache dir existe? ${fs.existsSync(cacheDir)}`);
            if (fs.existsSync(cacheDir)) {
                try {
                    const items = fs.readdirSync(cacheDir);
                    console.error(`[PUPPETEER] Itens no cache: ${items.join(', ')}`);
                } catch (err) {
                    console.error(`[PUPPETEER] Erro ao listar cache: ${err.message}`);
                }
            }
            // Não definir executablePath - deixar Puppeteer tentar encontrar automaticamente
            console.warn(`[PUPPETEER] ⚠️ Tentando sem executablePath (Puppeteer tentará encontrar automaticamente)`);
        }
    }
    
    return options;
}

// Função para fazer login no RHID e exportar CSV (Coop Vitta e Delta)
async function loginRHIDAndExportCSV(username, password, systemName = 'COOP-VITTA') {
    let browser = null;
    try {
        // Configurar cliente do Puppeteer com download
        browser = await launchPuppeteer();
        
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
            waitUntil: 'domcontentloaded',
            timeout: 60000 // Aumentado para 60s (Render é mais lento)
        });

        await delay(1000);

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
            waitUntil: 'domcontentloaded',
            timeout: 60000 // Aumentado para 60s (Render é mais lento)
        });

        // Aguardar página carregar (reduzido)
        console.log(`[${systemName}] Aguardando página carregar...`);
        await delay(3000);

        // Clicar no botão de menu (três pontos)
        console.log(`[${systemName}] Procurando botão de menu...`);
        await page.waitForSelector('.m-dropdown__toggle', { timeout: 30000, visible: true }); // Aumentado para 30s
        console.log(`[${systemName}] Botão de menu encontrado, preparando para clicar...`);
        
        // Tentar clicar usando múltiplos métodos
        let menuClicked = false;
        try {
            // Método 1: Scroll para o elemento e clicar
            await page.evaluate(() => {
                const menuBtn = document.querySelector('.m-dropdown__toggle');
                if (menuBtn) {
                    menuBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
            await delay(500);
            
            // Método 2: Tentar clicar via Puppeteer
            try {
                await page.click('.m-dropdown__toggle', { timeout: 5000 });
                menuClicked = true;
                console.log(`[${systemName}] Botão de menu clicado via Puppeteer`);
            } catch (e) {
                console.log(`[${systemName}] Clique via Puppeteer falhou, tentando via evaluate...`);
                // Método 3: Clicar diretamente no DOM
                menuClicked = await page.evaluate(() => {
                    const menuBtn = document.querySelector('.m-dropdown__toggle');
                    if (menuBtn) {
                        // Verificar se está visível
                        const style = window.getComputedStyle(menuBtn);
                        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                            return false;
                        }
                        // Tentar clicar
                        menuBtn.click();
                        return true;
                    }
                    return false;
                });
                
                if (menuClicked) {
                    console.log(`[${systemName}] Botão de menu clicado via evaluate`);
                } else {
                    throw new Error('Não foi possível clicar no botão de menu');
                }
            }
        } catch (e) {
            console.log(`[${systemName}] Erro ao clicar no menu: ${e.message}`);
            throw new Error(`Erro ao clicar no botão de menu: ${e.message}`);
        }
        
        await delay(2000);

        // Clicar em "Exportar CSV" usando o seletor correto
        console.log(`[${systemName}] Procurando opção "Exportar CSV"...`);
        let csvLinkClicked = false;
        
        try {
            // Aguardar o dropdown aparecer
            await page.waitForSelector('a[ng-click="exportCSV()"]', { timeout: 30000, visible: true }); // Aumentado para 30s
            console.log(`[${systemName}] Link "Exportar CSV" encontrado, preparando para clicar...`);
            
            // Tentar clicar via Puppeteer
            try {
                await page.evaluate(() => {
                    const exportLink = document.querySelector('a[ng-click="exportCSV()"]');
                    if (exportLink) {
                        exportLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                });
                await delay(500);
                
                await page.click('a[ng-click="exportCSV()"]', { timeout: 5000 });
                csvLinkClicked = true;
                console.log(`[${systemName}] Link "Exportar CSV" clicado via Puppeteer`);
            } catch (e) {
                console.log(`[${systemName}] Clique via Puppeteer falhou, tentando via evaluate...`);
                // Método alternativo: clicar diretamente no DOM
                csvLinkClicked = await page.evaluate(() => {
                    // Procurar link com ng-click="exportCSV()"
                    const exportLink = document.querySelector('a[ng-click="exportCSV()"]');
                    if (exportLink) {
                        // Verificar se está visível
                        const style = window.getComputedStyle(exportLink);
                        if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                            exportLink.click();
                            return true;
                        }
                    }
                    return false;
                });
                
                if (csvLinkClicked) {
                    console.log(`[${systemName}] Link "Exportar CSV" clicado via evaluate`);
                }
            }
        } catch (e) {
            console.log(`[${systemName}] Tentando método alternativo para encontrar "Exportar CSV"...`);
        }
        
        // Se ainda não clicou, tentar método alternativo
        if (!csvLinkClicked) {
            csvLinkClicked = await page.evaluate(() => {
                // Procurar por texto "Exportar CSV" dentro de links
                const links = Array.from(document.querySelectorAll('a.m-nav__link, a[ng-click*="export"], a[ng-click*="CSV"]'));
                for (const link of links) {
                    const text = link.textContent || link.innerText || '';
                    if (text.toLowerCase().includes('exportar') && text.toLowerCase().includes('csv')) {
                        const style = window.getComputedStyle(link);
                        if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                            link.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            link.click();
                            return true;
                        }
                    }
                }
                return false;
            });

            if (csvLinkClicked) {
                console.log(`[${systemName}] Link "Exportar CSV" encontrado e clicado por texto`);
            } else {
                throw new Error('Não foi possível encontrar ou clicar no link "Exportar CSV"');
            }
        }

        console.log(`[${systemName}] Aguardando download do CSV...`);
        
        // CRÍTICO: Limpar TODOS os CSVs antigos antes do download para evitar conflitos entre sistemas
        try {
            const existingFiles = fs.readdirSync(downloadsDir);
            const csvFilesToDelete = existingFiles.filter(file => file.endsWith('.csv'));
            if (csvFilesToDelete.length > 0) {
                console.log(`[${systemName}] 🧹 Limpando ${csvFilesToDelete.length} CSV(s) antigo(s) para evitar conflitos...`);
                csvFilesToDelete.forEach(file => {
                    const filePath = path.join(downloadsDir, file);
                    try {
                        fs.unlinkSync(filePath);
                        console.log(`[${systemName}] ✅ CSV antigo removido: ${file}`);
                    } catch (e) {
                        console.log(`[${systemName}] ⚠️ Erro ao remover CSV antigo ${file}: ${e.message}`);
                    }
                });
            }
        } catch (e) {
            console.log(`[${systemName}] ⚠️ Erro ao limpar CSVs antigos: ${e.message}`);
        }
        
        // Registrar timestamp ANTES do download para pegar apenas arquivos novos
        const timestampAntesDownload = Date.now();
        console.log(`[${systemName}] ⏱️ Timestamp antes do download: ${new Date(timestampAntesDownload).toISOString()}`);
        
        // Aguardar download completar (dar tempo suficiente)
        await delay(8000);

        // Procurar arquivo CSV baixado (mais recente criado após o início do processo)
        const files = fs.readdirSync(downloadsDir);
        console.log(`[${systemName}] 📁 Arquivos encontrados no diretório de downloads: ${files.length}`);
        
        const csvFiles = files
            .filter(file => file.endsWith('.csv'))
            .map(file => {
                const filePath = path.join(downloadsDir, file);
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    path: filePath,
                    mtime: stats.mtime.getTime(),
                    birthtime: stats.birthtime.getTime()
                };
            })
            .filter(file => {
                // Arquivos criados/modificados após o início do processo (com margem mínima de 2s antes)
                const isRecent = file.mtime >= timestampAntesDownload - 2000;
                if (!isRecent) {
                    console.log(`[${systemName}] ⏭️ Arquivo ${file.name} ignorado (muito antigo: ${new Date(file.mtime).toISOString()})`);
                }
                return isRecent;
            })
            .sort((a, b) => b.mtime - a.mtime); // Ordenar por mais recente
        
        console.log(`[${systemName}] 📊 Arquivos CSV recentes encontrados: ${csvFiles.length}`);
        csvFiles.forEach((file, index) => {
            console.log(`[${systemName}]   ${index + 1}. ${file.name} - ${new Date(file.mtime).toISOString()}`);
        });
        
        if (csvFiles.length === 0) {
            throw new Error(`Arquivo CSV não foi baixado para ${systemName}. Verifique se o download foi concluído.`);
        }

        // Pegar APENAS o arquivo mais recente (que deve ser o que acabou de ser baixado)
        const csvFile = csvFiles[0];
        const csvPath = csvFile.path;
        console.log(`[${systemName}] ✅ Usando arquivo CSV: ${csvFile.name} (modificado em ${new Date(csvFile.mtime).toISOString()})`);

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

        console.log(`[${systemName}] ✅ CSV processado: ${data.length} registros, Ativos=${ativos}, Inativos=${inativos}`);
        console.log(`[${systemName}] 🔍 Validando dados: Primeiro registro - ${JSON.stringify(data[0] || {})}`);
        
        // Validação adicional: verificar se os dados fazem sentido para o sistema
        // (Alguns registros devem existir para garantir que não pegamos CSV errado)
        if (data.length === 0) {
            console.error(`[${systemName}] ⚠️ AVISO: CSV processado está vazio! Pode ter pego arquivo errado.`);
        }

        // Obter cookies antes de fechar o browser
        const cookies = await page.cookies();

        // Limpar arquivo CSV IMEDIATAMENTE após processar para evitar conflitos
        try {
            fs.unlinkSync(csvPath);
            console.log(`[${systemName}] 🗑️ CSV deletado: ${csvFile.name}`);
        } catch (e) {
            console.log(`[${systemName}] ⚠️ Erro ao deletar arquivo CSV: ${e.message}`);
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
        browser = await launchPuppeteer();
        
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
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
                page.waitForFunction(() => !window.location.href.includes('login'), { timeout: 30000 })
            ]);
        } catch (e) {
            // Se não houver navegação, aguardar um pouco para o JavaScript processar
            console.log('Aguardando processamento do login...');
            await delay(2000);
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
                waitUntil: 'domcontentloaded',
                timeout: 20000
            });
            console.log('Navegação para /list/person concluída');
        } catch (e) {
            console.log('Erro ao navegar, tentando via hash...');
            // Tentar mudar apenas o hash
            await page.evaluate(() => {
                window.location.hash = '#/list/person';
            });
            await delay(2000);
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
        browser = await launchPuppeteer();
        
        const page = await browser.newPage();
        
        // Definir cookies da sessão
        await page.setCookie(...cookies);
        
        console.log('Acessando página de listagem de pessoas...');
        // Acessar página de listagem de pessoas
        await page.goto('https://rhid.com.br/v2/#/list/person', {
            waitUntil: 'domcontentloaded',
            timeout: 60000 // Aumentado para 60s (Render é mais lento)
        });

        // Aguardar um pouco para o Angular renderizar (reduzido)
        console.log('Aguardando página carregar completamente...');
        await delay(3000);
        
        // Aguardar tabela aparecer
        console.log('Aguardando tabela #mydatatable aparecer...');
        let tableFound = false;
        
        // Tentar aguardar pela tabela
        try {
            await page.waitForSelector('#mydatatable', { timeout: 30000, visible: true }); // Aumentado para 30s
            tableFound = true;
            console.log('Tabela #mydatatable encontrada!');
        } catch (e) {
            console.log('Tabela não encontrada imediatamente, tentando outras seletores...');
            try {
                await page.waitForSelector('table[datatable], table.dataTable, table#mydatatable', { timeout: 30000, visible: true }); // Aumentado para 30s
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
        browser = await launchPuppeteer();
        
        const page = await browser.newPage();
        
        // Acessar página de login do website
        console.log('[DOCTORID] Acessando página de login (website)...');
        try {
            await page.goto('https://www.doctorid.com.br/website', {
                waitUntil: 'load', // Mais permissivo que domcontentloaded
                timeout: 120000 // Aumentado para 120s (DoctorID pode demorar muito)
            });
        } catch (error) {
            console.log('[DOCTORID] ⚠️ Timeout no goto, tentando continuar...');
            // Tentar aguardar um pouco e verificar se a página carregou
            await delay(5000);
            const currentUrl = page.url();
            console.log(`[DOCTORID] URL atual após timeout: ${currentUrl}`);
            if (!currentUrl.includes('doctorid.com.br')) {
                throw new Error('Página não carregou após timeout');
            }
        }

        await delay(3000); // Aumentado para 3s (Render é mais lento)

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

        await delay(500);

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
        try {
            await page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }); // Aumentado para 60s e mudado para 'load'
        } catch (e) {
            console.log('[DOCTORID] ⚠️ Timeout aguardando navegação, verificando se login foi bem-sucedido...');
            await delay(5000); // Aumentado para 5s
        }

        // Verificar se login foi bem-sucedido (com mais tempo e tentativas)
        await delay(3000); // Aguardar mais um pouco para garantir que carregou
        const currentUrl = page.url();
        console.log(`[DOCTORID] URL atual após login: ${currentUrl}`);
        
        // Tentar verificar login múltiplas vezes (pode demorar para carregar)
        let loginSuccess = false;
        for (let i = 0; i < 3; i++) {
            loginSuccess = await page.evaluate(() => {
                const isLoginPage = window.location.href.includes('login');
                const hasDashboard = document.querySelector('[class*="dashboard"], [class*="menu"], [id*="menu"], [class*="nav"]');
                return !isLoginPage || hasDashboard !== null;
            });
            
            if (loginSuccess) {
                console.log(`[DOCTORID] ✅ Login verificado na tentativa ${i + 1}`);
                break;
            }
            
            if (i < 2) {
                console.log(`[DOCTORID] ⚠️ Login não confirmado, aguardando mais... (tentativa ${i + 1}/3)`);
                await delay(5000);
            }
        }

        if (!loginSuccess) {
            console.log('[DOCTORID] ❌ Login não foi confirmado após múltiplas tentativas');
            await browser.close();
            return { success: false, cookies: [], data: null };
        }

        console.log('[DOCTORID] ✅ Login bem-sucedido!');
        
        // Navegar para a página personGroupCompany
        console.log('[DOCTORID] Navegando para página personGroupCompany...');
        try {
            await page.goto('https://www.doctorid.com.br/#personGroupCompany', {
                waitUntil: 'load', // Mais permissivo que domcontentloaded
                timeout: 120000 // Aumentado para 120s
            });
            console.log('[DOCTORID] Navegação para /#personGroupCompany concluída');
        } catch (e) {
            console.log('[DOCTORID] ⚠️ Erro ao navegar, tentando via hash...');
            try {
                await page.evaluate(() => {
                    window.location.hash = '#personGroupCompany';
                });
                await delay(5000); // Aumentado para 5s
                console.log('[DOCTORID] ✅ Navegação via hash concluída');
            } catch (hashError) {
                console.log('[DOCTORID] ⚠️ Erro ao navegar via hash, continuando mesmo assim...');
                await delay(5000);
            }
        }

        // Aguardar JavaScript/Angular renderizar (reduzido)
        console.log('[DOCTORID] Aguardando JavaScript/Angular renderizar...');
        await delay(3000);
        
        // Procurar e clicar no link "Filtro Avançado"
        console.log('[DOCTORID] Procurando link "Filtro Avançado"...');
        const filtroLink = await page.evaluate(() => {
            // Procurar pelo href exato
            let link = document.querySelector('a[href="#filtroAvancado"]');
            if (!link) {
                // Procurar por texto "Filtro Avançado"
                const links = Array.from(document.querySelectorAll('a'));
                link = links.find(a => {
                    const text = a.textContent || a.innerText;
                    return text.includes('Filtro Avançado');
                });
            }
            if (link) {
                link.click();
                return true;
            }
            return false;
        });

        if (!filtroLink) {
            throw new Error('Link "Filtro Avançado" não encontrado');
        }

        console.log('[DOCTORID] ✅ Link "Filtro Avançado" clicado com sucesso');
        await delay(3000); // Aumentado para 3s (Render é mais lento)
        
        // Aguardar elemento filtroComplexo_selecionar aparecer
        console.log('[DOCTORID] Aguardando elemento filtroComplexo_selecionar aparecer...');
        await page.waitForSelector('.filtroComplexo_selecionar', { timeout: 30000, visible: true }); // Aumentado para 30s
        console.log('[DOCTORID] ✅ Elemento filtroComplexo_selecionar encontrado');
        await delay(2000); // Aumentado para 2s (Render é mais lento)
        
        // Identificar o select dentro do filtroComplexo_selecionar
        console.log('[DOCTORID] Identificando select de tipo de filtro...');
        const selectInfo = await page.evaluate(() => {
            // Procurar pelo elemento filtroComplexo_selecionar
            const filtroContainer = document.querySelector('.filtroComplexo_selecionar');
            if (!filtroContainer) {
                return { encontrado: false, motivo: 'Container filtroComplexo_selecionar não encontrado' };
            }
            
            // Procurar o select dentro do container
            const select = filtroContainer.querySelector('select[name="criterios[][tipoFiltroComplexo]"]');
            if (!select) {
                return { encontrado: false, motivo: 'Select não encontrado dentro do container' };
            }
            
            // Verificar se existe a opção "Percentual do perfil"
            const options = Array.from(select.options);
            const percentualOption = options.find(opt => 
                opt.value === 'PercentualDoPerfil' || 
                opt.text.trim() === 'Percentual do perfil'
            );
            
            return {
                encontrado: true,
                selectId: select.id || null,
                selectName: select.name,
                selectClasses: select.className,
                totalOpcoes: options.length,
                percentualEncontrado: !!percentualOption,
                percentualValue: percentualOption ? percentualOption.value : null,
                percentualText: percentualOption ? percentualOption.text.trim() : null,
                valorAtual: select.value,
                textoAtual: select.options[select.selectedIndex]?.textContent?.trim() || null
            };
        });
        
        console.log('[DOCTORID] 📋 Informações do select:');
        console.log(`  - Container encontrado: ${selectInfo.encontrado}`);
        if (!selectInfo.encontrado) {
            console.log(`  - Motivo: ${selectInfo.motivo}`);
            throw new Error(`Select não encontrado: ${selectInfo.motivo}`);
        }
        console.log(`  - Total de opções: ${selectInfo.totalOpcoes}`);
        console.log(`  - Opção "Percentual do perfil" encontrada: ${selectInfo.percentualEncontrado}`);
        console.log(`  - Valor atual: "${selectInfo.valorAtual}"`);
        console.log(`  - Texto atual: "${selectInfo.textoAtual}"`);
        
        if (!selectInfo.percentualEncontrado) {
            throw new Error('Opção "Percentual do perfil" não encontrada no select');
        }
        
        // Selecionar "Percentual do perfil"
        console.log('[DOCTORID] Selecionando "Percentual do perfil"...');
        const selecaoResultado = await page.evaluate(() => {
            const select = document.querySelector('.filtroComplexo_selecionar select[name="criterios[][tipoFiltroComplexo]"]');
            if (!select) {
                return { sucesso: false, erro: 'Select não encontrado' };
            }
            
            // Procurar a opção "Percentual do perfil"
            const options = Array.from(select.options);
            const percentualOption = options.find(opt => 
                opt.value === 'PercentualDoPerfil' || 
                opt.text.trim() === 'Percentual do perfil'
            );
            
            if (!percentualOption) {
                return { sucesso: false, erro: 'Opção não encontrada' };
            }
            
            // Definir o valor
            select.value = percentualOption.value;
            
            // Disparar eventos nativos
            select.dispatchEvent(new Event('change', { bubbles: true }));
            select.dispatchEvent(new Event('input', { bubbles: true }));
            
            // Tentar atualizar via jQuery/Select2 se disponível
            if (window.jQuery && window.jQuery(select).data('select2')) {
                try {
                    window.jQuery(select).val(percentualOption.value).trigger('change');
                } catch (e) {
                    console.log(`[DOCTORID-BROWSER] Erro ao atualizar via jQuery: ${e.message}`);
                }
            }
            
            // Verificar se foi selecionado
            const valorSelecionado = select.value;
            const textoSelecionado = select.options[select.selectedIndex]?.textContent?.trim() || '';
            
            return {
                sucesso: true,
                valor: valorSelecionado,
                texto: textoSelecionado,
                esperado: percentualOption.value === 'PercentualDoPerfil'
            };
        });
        
        if (!selecaoResultado.sucesso) {
            throw new Error(`Erro ao selecionar: ${selecaoResultado.erro}`);
        }
        
        console.log(`[DOCTORID] ✅ "Percentual do perfil" selecionado: "${selecaoResultado.texto}" (valor: ${selecaoResultado.valor})`);
        await delay(1000);
        
        // Verificar se o Select2 visual foi atualizado
        const select2Atualizado = await page.evaluate(() => {
            const select = document.querySelector('.filtroComplexo_selecionar select[name="criterios[][tipoFiltroComplexo]"]');
            if (!select) return { atualizado: false };
            
            const select2Container = select.nextElementSibling;
            if (select2Container) {
                const rendered = select2Container.querySelector('.select2-selection__rendered');
                if (rendered) {
                    return {
                        atualizado: true,
                        textoVisual: rendered.textContent.trim()
                    };
                }
            }
            return { atualizado: false };
        });
        
        if (select2Atualizado.atualizado) {
            console.log(`[DOCTORID] ✅ Select2 visual atualizado: "${select2Atualizado.textoVisual}"`);
        } else {
            console.log('[DOCTORID] ⚠️ Select2 visual não foi atualizado automaticamente');
        }
        
        // Aguardar o select de operadores aparecer após selecionar o tipo de filtro
        console.log('[DOCTORID] Aguardando select de operadores aparecer...');
        await delay(1000);
        
        // Identificar o select de operadores
        console.log('[DOCTORID] Identificando select de operadores...');
        const operadorInfo = await page.evaluate(() => {
            // Procurar o select de operadores dentro do filtroComplexo_selecionar
            const selects = document.querySelectorAll('.filtroComplexo_selecionar select[name="criterios[][parametros[]]"]');
            
            // Procurar o select que tem a opção "MaiorOuIgual"
            for (const select of selects) {
                const options = Array.from(select.options);
                const hasMaiorOuIgual = options.some(opt => 
                    opt.value === 'MaiorOuIgual' || 
                    opt.text.toLowerCase().includes('maior ou igual')
                );
                
                if (hasMaiorOuIgual) {
                    return {
                        encontrado: true,
                        selectClasses: select.className,
                        totalOpcoes: options.length,
                        maiorOuIgualEncontrado: true,
                        valorAtual: select.value,
                        textoAtual: select.options[select.selectedIndex]?.textContent?.trim() || null,
                        opcoes: options.map(opt => ({
                            value: opt.value,
                            text: opt.text.trim()
                        }))
                    };
                }
            }
            
            return { encontrado: false, motivo: 'Select de operadores não encontrado' };
        });
        
        console.log('[DOCTORID] 📋 Informações do select de operadores:');
        console.log(`  - Select encontrado: ${operadorInfo.encontrado}`);
        if (!operadorInfo.encontrado) {
            console.log(`  - Motivo: ${operadorInfo.motivo}`);
            throw new Error(`Select de operadores não encontrado: ${operadorInfo.motivo}`);
        }
        console.log(`  - Total de opções: ${operadorInfo.totalOpcoes}`);
        console.log(`  - Opção "Maior ou igual" encontrada: ${operadorInfo.maiorOuIgualEncontrado}`);
        console.log(`  - Valor atual: "${operadorInfo.valorAtual}"`);
        console.log(`  - Texto atual: "${operadorInfo.textoAtual}"`);
        
        // Selecionar "Maior ou igual"
        console.log('[DOCTORID] Selecionando "Maior ou igual"...');
        const operadorSelecionado = await page.evaluate(() => {
            const selects = document.querySelectorAll('.filtroComplexo_selecionar select[name="criterios[][parametros[]]"]');
            
            for (const select of selects) {
                const options = Array.from(select.options);
                const maiorOuIgualOption = options.find(opt => 
                    opt.value === 'MaiorOuIgual' || 
                    opt.text.toLowerCase().includes('maior ou igual')
                );
                
                if (maiorOuIgualOption) {
                    // Definir o valor
                    select.value = maiorOuIgualOption.value;
                    
                    // Disparar eventos nativos
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    select.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    // Tentar atualizar via jQuery/Select2 se disponível
                    if (window.jQuery && window.jQuery(select).data('select2')) {
                        try {
                            window.jQuery(select).val(maiorOuIgualOption.value).trigger('change');
                        } catch (e) {
                            console.log(`[DOCTORID-BROWSER] Erro ao atualizar via jQuery: ${e.message}`);
                        }
                    }
                    
                    // Verificar se foi selecionado
                    const valorSelecionado = select.value;
                    const textoSelecionado = select.options[select.selectedIndex]?.textContent?.trim() || '';
                    
                    return {
                        sucesso: true,
                        valor: valorSelecionado,
                        texto: textoSelecionado,
                        esperado: maiorOuIgualOption.value === 'MaiorOuIgual'
                    };
                }
            }
            
            return { sucesso: false, erro: 'Opção "Maior ou igual" não encontrada' };
        });
        
        if (!operadorSelecionado.sucesso) {
            throw new Error(`Erro ao selecionar operador: ${operadorSelecionado.erro}`);
        }
        
        console.log(`[DOCTORID] ✅ "Maior ou igual" selecionado: "${operadorSelecionado.texto}" (valor: ${operadorSelecionado.valor})`);
        await delay(2000);
        
        // Verificar se o Select2 visual do operador foi atualizado
        const operadorSelect2Atualizado = await page.evaluate(() => {
            const selects = document.querySelectorAll('.filtroComplexo_selecionar select[name="criterios[][parametros[]]"]');
            
            for (const select of selects) {
                const options = Array.from(select.options);
                if (options.some(opt => opt.value === 'MaiorOuIgual')) {
                    const select2Container = select.nextElementSibling;
                    if (select2Container) {
                        const rendered = select2Container.querySelector('.select2-selection__rendered');
                        if (rendered) {
                            return {
                                atualizado: true,
                                textoVisual: rendered.textContent.trim()
                            };
                        }
                    }
                }
            }
            return { atualizado: false };
        });
        
        if (operadorSelect2Atualizado.atualizado) {
            console.log(`[DOCTORID] ✅ Select2 visual do operador atualizado: "${operadorSelect2Atualizado.textoVisual}"`);
        } else {
            console.log('[DOCTORID] ⚠️ Select2 visual do operador não foi atualizado automaticamente');
        }
        
        // Aguardar o campo de input aparecer após selecionar o operador
        console.log('[DOCTORID] Aguardando campo de input aparecer...');
        await delay(2000);
        
        // Identificar o campo de input
        console.log('[DOCTORID] Identificando campo de input de valor...');
        const inputInfo = await page.evaluate(() => {
            // Procurar o input dentro do filtroComplexo_selecionar
            const inputs = document.querySelectorAll('.filtroComplexo_selecionar input[name="criterios[][parametros[]]"][type="text"]');
            
            for (const input of inputs) {
                // Verificar se tem os atributos corretos
                if (input.hasAttribute('pattern') && 
                    input.getAttribute('max') === '100' &&
                    input.getAttribute('maxlength') === '5') {
                    return {
                        encontrado: true,
                        name: input.name,
                        type: input.type,
                        pattern: input.getAttribute('pattern'),
                        max: input.getAttribute('max'),
                        maxlength: input.getAttribute('maxlength'),
                        title: input.getAttribute('title'),
                        valorAtual: input.value,
                        classes: input.className
                    };
                }
            }
            
            return { encontrado: false, motivo: 'Input não encontrado com os atributos esperados' };
        });
        
        console.log('[DOCTORID] 📋 Informações do input:');
        console.log(`  - Input encontrado: ${inputInfo.encontrado}`);
        if (!inputInfo.encontrado) {
            console.log(`  - Motivo: ${inputInfo.motivo}`);
            throw new Error(`Input não encontrado: ${inputInfo.motivo}`);
        }
        console.log(`  - Pattern: "${inputInfo.pattern}"`);
        console.log(`  - Max: "${inputInfo.max}"`);
        console.log(`  - Valor atual: "${inputInfo.valorAtual}"`);
        
        // Preencher o campo com "40"
        console.log('[DOCTORID] Preenchendo campo de input com "40"...');
        const inputPreenchido = await page.evaluate(() => {
            const inputs = document.querySelectorAll('.filtroComplexo_selecionar input[name="criterios[][parametros[]]"][type="text"]');
            
            for (const input of inputs) {
                if (input.hasAttribute('pattern') && 
                    input.getAttribute('max') === '100' &&
                    input.getAttribute('maxlength') === '5') {
                    // Limpar o campo
                    input.value = '';
                    
                    // Preencher com "40"
                    input.value = '40';
                    
                    // Disparar eventos nativos
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.dispatchEvent(new Event('blur', { bubbles: true }));
                    
                    // Focar no campo
                    input.focus();
                    
                    return {
                        sucesso: true,
                        valor: input.value
                    };
                }
            }
            
            return { sucesso: false, erro: 'Input não encontrado' };
        });
        
        if (!inputPreenchido.sucesso) {
            throw new Error(`Erro ao preencher input: ${inputPreenchido.erro}`);
        }
        
        console.log(`[DOCTORID] ✅ Campo preenchido com: "${inputPreenchido.valor}"`);
        await delay(300);
        
        // Pressionar Enter no campo de input
        console.log('[DOCTORID] Pressionando Enter no campo de input...');
        await page.keyboard.press('Enter');
        console.log('[DOCTORID] ✅ Enter pressionado');
        await delay(1000);
        
        // Verificar se o valor foi mantido após pressionar Enter
        const valorVerificado = await page.evaluate(() => {
            const inputs = document.querySelectorAll('.filtroComplexo_selecionar input[name="criterios[][parametros[]]"][type="text"]');
            
            for (const input of inputs) {
                if (input.hasAttribute('pattern') && 
                    input.getAttribute('max') === '100' &&
                    input.getAttribute('maxlength') === '5') {
                    return {
                        valor: input.value,
                        correto: input.value === '40'
                    };
                }
            }
            return { valor: null, correto: false };
        });
        
        if (valorVerificado.correto) {
            console.log(`[DOCTORID] ✅ Valor verificado e correto: "${valorVerificado.valor}"`);
        } else {
            console.log(`[DOCTORID] ⚠️ Valor após Enter: "${valorVerificado.valor}" (esperado: "40")`);
        }
        
        // Aguardar processamento após pressionar Enter
        console.log('[DOCTORID] Aguardando processamento após pressionar Enter...');
        try {
            await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
            console.log('[DOCTORID] ✅ Página carregada após filtrar');
        } catch (e) {
            await delay(2000);
        }
        
        // Aguardar o elemento de alerta aparecer (com timeout reduzido)
        console.log('[DOCTORID] Aguardando elemento de alerta aparecer...');
        let alertaEncontrado = false;
        let registrosEncontrados = 0;
        let mensagemAlerta = null;
        
        // Tentar aguardar pelo elemento de alerta
        try {
            await page.waitForSelector('.alert.alert-dismissible.hidden-print.alert-info[role="alert"]', { 
                timeout: 30000, // Aumentado para 30s
                visible: true 
            });
            alertaEncontrado = true;
            console.log('[DOCTORID] ✅ Elemento de alerta encontrado');
        } catch (e) {
            console.log('[DOCTORID] ⚠️ Elemento de alerta não apareceu imediatamente, tentando aguardar mais...');
            await delay(3000);
        }
        
        // Extrair o número de registros do alerta
        console.log('[DOCTORID] Extraindo número de registros do alerta...');
        const dadosAlerta = await page.evaluate(() => {
            const result = {
                registros: 0,
                message: null,
                encontrado: false,
                elementoHTML: null
            };
            
            // Método 1: Procurar pelo elemento específico com as classes exatas
            const alertEspecifico = document.querySelector('div.alert.alert-dismissible.hidden-print.alert-info[data-requests-to-live=""][role="alert"]');
            if (alertEspecifico) {
                result.encontrado = true;
                const text = alertEspecifico.textContent || alertEspecifico.innerText || '';
                result.elementoHTML = alertEspecifico.outerHTML.substring(0, 500);
                
                // Procurar padrão: "X registro(s) encontrado(s)."
                const match = text.match(/(\d+)\s*registro\(s\)\s*encontrado\(s\)/i);
                if (match) {
                    result.registros = parseInt(match[1]);
                    result.message = text.trim();
                    console.log(`[DOCTORID-BROWSER] ✅ Registros encontrados no alert específico: ${result.registros}`);
                    return result;
                }
            }
            
            // Método 2: Procurar por qualquer alert com alert-info que contenha "registro(s) encontrado(s)"
            const alerts = Array.from(document.querySelectorAll('.alert.alert-info'));
            for (const alert of alerts) {
                const text = alert.textContent || alert.innerText || '';
                const match = text.match(/(\d+)\s*registro\(s\)\s*encontrado\(s\)/i);
                if (match) {
                    result.encontrado = true;
                    result.registros = parseInt(match[1]);
                    result.message = text.trim();
                    result.elementoHTML = alert.outerHTML.substring(0, 500);
                    console.log(`[DOCTORID-BROWSER] ✅ Registros encontrados em alert-info: ${result.registros}`);
                    return result;
                }
            }
            
            // Método 3: Procurar em qualquer alert com padrão mais flexível
            const allAlerts = Array.from(document.querySelectorAll('.alert'));
            for (const alert of allAlerts) {
                const text = alert.textContent || alert.innerText || '';
                const match = text.match(/(\d+)\s*registro/i);
                if (match) {
                    result.encontrado = true;
                    result.registros = parseInt(match[1]);
                    result.message = text.trim();
                    result.elementoHTML = alert.outerHTML.substring(0, 500);
                    console.log(`[DOCTORID-BROWSER] ✅ Registros encontrados em alert genérico: ${result.registros}`);
                    return result;
                }
            }
            
            console.log(`[DOCTORID-BROWSER] ❌ Nenhum alert com registros encontrado`);
            return result;
        });
        
        if (dadosAlerta.encontrado && dadosAlerta.registros > 0) {
            registrosEncontrados = dadosAlerta.registros;
            mensagemAlerta = dadosAlerta.message;
            console.log(`[DOCTORID] ✅ Registros encontrados: ${registrosEncontrados}`);
            console.log(`[DOCTORID] 📋 Mensagem: "${mensagemAlerta}"`);
        } else {
            console.log('[DOCTORID] ⚠️ Não foi possível extrair o número de registros do alerta');
        }
        
        // Finalizar processo
        const cookies = await page.cookies();
        await browser.close();
        
        console.log('[DOCTORID] ✅ Processo finalizado - Filtro Avançado configurado e registros extraídos');
        
        return { 
            success: true, 
            cookies,
            data: {
                message: 'Login bem-sucedido, Filtro Avançado configurado: "Percentual do perfil", "Maior ou igual" e valor "40"',
                filtroAvancadoAcessado: true,
                filtroAplicado: registrosEncontrados > 0,
                tipoFiltroSelecionado: {
                    valor: selecaoResultado.valor,
                    texto: selecaoResultado.texto
                },
                operadorSelecionado: {
                    valor: operadorSelecionado.valor,
                    texto: operadorSelecionado.texto
                },
                valorInput: {
                    valor: valorVerificado.valor || '40',
                    inserido: true
                },
                registros: registrosEncontrados,
                mensagemAlerta: mensagemAlerta
            }
        };
        
    } catch (error) {
        if (browser) await browser.close();
        console.error('[DOCTORID] Erro:', error);
        throw error;
    }
}

// Função para processar CSV e extrair valores financeiros
function processarCSVFinanceiro(csvContent) {
    const valores = {
        vivaRioEmAberto: null,
        setembro: null,
        outubro: null,
        novembro: null,
        total: null
    };
    
    try {
        // Parsear CSV
        const lines = csvContent.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
            console.log('[GOOGLE SHEETS] CSV vazio');
            return valores;
        }
        
        // Função para parsear linha CSV (lidar com vírgulas dentro de aspas)
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
        
        // Procurar por "VIVA RIO EM ABERTO"
        let linhaVivaRio = null;
        let indiceVivaRio = -1;
        
        for (let i = 0; i < lines.length; i++) {
            const linha = lines[i].toUpperCase();
            if (linha.includes('VIVA RIO EM ABERTO') || linha.includes('VIVA RIO')) {
                linhaVivaRio = parseCSVLine(lines[i]);
                indiceVivaRio = i;
                console.log(`[GOOGLE SHEETS] Linha "VIVA RIO EM ABERTO" encontrada na linha ${i + 1}`);
                break;
            }
        }
        
        if (linhaVivaRio) {
            valores.vivaRioEmAberto = 'Encontrado';
            
            // Procurar cabeçalhos de meses nas primeiras linhas
            let indiceSetembro = -1;
            let indiceOutubro = -1;
            let indiceNovembro = -1;
            let indiceTotal = -1;
            
            // Procurar cabeçalhos nas primeiras 10 linhas
            for (let i = 0; i < Math.min(10, lines.length); i++) {
                const linha = parseCSVLine(lines[i]);
                const linhaUpper = lines[i].toUpperCase();
                
                for (let j = 0; j < linha.length; j++) {
                    const coluna = linha[j].toUpperCase().trim();
                    if ((coluna.includes('SETEMBRO') || coluna.includes('SET')) && indiceSetembro === -1) {
                        indiceSetembro = j;
                        console.log(`[GOOGLE SHEETS] Coluna Setembro encontrada no índice ${j}`);
                    }
                    if ((coluna.includes('OUTUBRO') || coluna.includes('OUT')) && indiceOutubro === -1) {
                        indiceOutubro = j;
                        console.log(`[GOOGLE SHEETS] Coluna Outubro encontrada no índice ${j}`);
                    }
                    if ((coluna.includes('NOVEMBRO') || coluna.includes('NOV')) && indiceNovembro === -1) {
                        indiceNovembro = j;
                        console.log(`[GOOGLE SHEETS] Coluna Novembro encontrada no índice ${j}`);
                    }
                    if (coluna.includes('TOTAL') && indiceTotal === -1) {
                        indiceTotal = j;
                        console.log(`[GOOGLE SHEETS] Coluna Total encontrada no índice ${j}`);
                    }
                }
            }
            
            // Buscar valores na linha VIVA RIO usando os índices das colunas
            if (indiceSetembro >= 0 && indiceSetembro < linhaVivaRio.length) {
                valores.setembro = linhaVivaRio[indiceSetembro].trim();
                console.log(`[GOOGLE SHEETS] Setembro (coluna ${indiceSetembro}): ${valores.setembro}`);
            }
            if (indiceOutubro >= 0 && indiceOutubro < linhaVivaRio.length) {
                valores.outubro = linhaVivaRio[indiceOutubro].trim();
                console.log(`[GOOGLE SHEETS] Outubro (coluna ${indiceOutubro}): ${valores.outubro}`);
            }
            if (indiceNovembro >= 0 && indiceNovembro < linhaVivaRio.length) {
                valores.novembro = linhaVivaRio[indiceNovembro].trim();
                console.log(`[GOOGLE SHEETS] Novembro (coluna ${indiceNovembro}): ${valores.novembro}`);
            }
            if (indiceTotal >= 0 && indiceTotal < linhaVivaRio.length) {
                valores.total = linhaVivaRio[indiceTotal].trim();
                console.log(`[GOOGLE SHEETS] Total (coluna ${indiceTotal}): ${valores.total}`);
            }
            
            // Se não encontrou pelos cabeçalhos, procurar nas linhas seguintes
            if (!valores.setembro || !valores.outubro || !valores.novembro || !valores.total) {
                for (let i = indiceVivaRio; i < Math.min(indiceVivaRio + 5, lines.length); i++) {
                    const linha = parseCSVLine(lines[i]);
                    const linhaUpper = lines[i].toUpperCase();
                    
                    // Procurar por SETEMBRO
                    if (linhaUpper.includes('SETEMBRO') && !valores.setembro) {
                        for (let j = 0; j < linha.length; j++) {
                            const valor = linha[j].trim();
                            if (valor && valor.match(/[\d.,]+/)) {
                                valores.setembro = valor;
                                console.log(`[GOOGLE SHEETS] Setembro encontrado na linha ${i + 1}: ${valor}`);
                                break;
                            }
                        }
                    }
                    
                    // Procurar por OUTUBRO
                    if (linhaUpper.includes('OUTUBRO') && !valores.outubro) {
                        for (let j = 0; j < linha.length; j++) {
                            const valor = linha[j].trim();
                            if (valor && valor.match(/[\d.,]+/)) {
                                valores.outubro = valor;
                                console.log(`[GOOGLE SHEETS] Outubro encontrado na linha ${i + 1}: ${valor}`);
                                break;
                            }
                        }
                    }
                    
                    // Procurar por NOVEMBRO
                    if (linhaUpper.includes('NOVEMBRO') && !valores.novembro) {
                        for (let j = 0; j < linha.length; j++) {
                            const valor = linha[j].trim();
                            if (valor && valor.match(/[\d.,]+/)) {
                                valores.novembro = valor;
                                console.log(`[GOOGLE SHEETS] Novembro encontrado na linha ${i + 1}: ${valor}`);
                                break;
                            }
                        }
                    }
                    
                    // Procurar por TOTAL
                    if (linhaUpper.includes('TOTAL') && !valores.total) {
                        for (let j = 0; j < linha.length; j++) {
                            const valor = linha[j].trim();
                            if (valor && valor.match(/[\d.,]+/)) {
                                valores.total = valor;
                                console.log(`[GOOGLE SHEETS] Total encontrado na linha ${i + 1}: ${valor}`);
                                break;
                            }
                        }
                    }
                }
            }
        } else {
            console.log('[GOOGLE SHEETS] ⚠️ Linha "VIVA RIO EM ABERTO" não encontrada no CSV');
        }
        
        console.log('[GOOGLE SHEETS] Valores extraídos:', valores);
        return valores;
        
    } catch (error) {
        console.error('[GOOGLE SHEETS] Erro ao processar CSV:', error);
        return valores;
    }
}

// Função para acessar a planilha do Google Sheets
async function fetchGoogleSheetsFinanceiro() {
    let browser = null;
    try {
        const viewUrl = 'https://docs.google.com/spreadsheets/d/10vaVp0DcgOfjWW3_vat7M8mRVvMiBdtU9kAlDmjEioc/edit?usp=sharing';
        const spreadsheetId = '10vaVp0DcgOfjWW3_vat7M8mRVvMiBdtU9kAlDmjEioc';
        
        console.log('[GOOGLE SHEETS] Acessando planilha financeira...');
        console.log(`[GOOGLE SHEETS] URL: ${viewUrl}`);
        
        // Usar Puppeteer para acessar a planilha
        browser = await launchPuppeteer();
        
        const page = await browser.newPage();
        
        // Acessar a página da planilha
        console.log('[GOOGLE SHEETS] Carregando página da planilha...');
        await page.goto(viewUrl, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        // Verificar se a página carregou corretamente
        const pageTitle = await page.title();
        console.log(`[GOOGLE SHEETS] Título da página: ${pageTitle}`);
        
        // Verificar se há mensagens de erro de permissão
        const hasPermissionError = await page.evaluate(() => {
            const bodyText = document.body.textContent || '';
            return bodyText.includes('Você precisa de permissão') || 
                   bodyText.includes('permission') ||
                   bodyText.includes('acesso negado') ||
                   bodyText.includes('access denied');
        });
        
        if (hasPermissionError) {
            console.log('[GOOGLE SHEETS] ⚠️ Possível problema de permissão detectado');
        } else {
            console.log('[GOOGLE SHEETS] ✅ Nenhum erro de permissão detectado');
        }
        
        // Aguardar a planilha carregar completamente
        console.log('[GOOGLE SHEETS] Aguardando planilha renderizar...');
        await delay(5000);
        
        // Verificar se a planilha está visível
        const planilhaStatus = await page.evaluate(() => {
            const gridCells = document.querySelectorAll('[role="gridcell"]');
            const hasSheets = document.querySelectorAll('[role="tab"], .docs-sheet-tab').length > 0;
            return {
                celulasEncontradas: gridCells.length,
                abasEncontradas: hasSheets,
                urlAtual: window.location.href
            };
        });
        
        console.log(`[GOOGLE SHEETS] Status da planilha: ${planilhaStatus.celulasEncontradas} células encontradas`);
        console.log(`[GOOGLE SHEETS] Abas encontradas: ${planilhaStatus.abasEncontradas ? 'Sim' : 'Não'}`);
        console.log(`[GOOGLE SHEETS] URL atual: ${planilhaStatus.urlAtual}`);
        
        // Primeiro, identificar a aba "RELATÓRIO CYLLA" e obter seu gid
        console.log('[GOOGLE SHEETS] Procurando aba "RELATÓRIO CYLLA"...');
        const abaInfo = await page.evaluate(() => {
            const result = {
                encontrada: false,
                gid: null,
                nome: null
            };
            
            // Procurar pela aba "RELATÓRIO CYLLA"
            // Google Sheets usa diferentes seletores para abas
            const abaSelectors = [
                '[data-sheet-name="RELATÓRIO CYLLA"]',
                '[aria-label*="RELATÓRIO CYLLA"]',
                'button[aria-label*="RELATÓRIO CYLLA"]',
                '.docs-sheet-tab[aria-label*="RELATÓRIO CYLLA"]'
            ];
            
            let abaElement = null;
            for (const selector of abaSelectors) {
                abaElement = document.querySelector(selector);
                if (abaElement) break;
            }
            
            // Se não encontrou por seletor, procurar por texto
            if (!abaElement) {
                const allTabs = document.querySelectorAll('[role="tab"], .docs-sheet-tab, button[data-sheet-name]');
                for (const tab of allTabs) {
                    const text = tab.textContent || tab.innerText || tab.getAttribute('aria-label') || '';
                    if (text.includes('RELATÓRIO CYLLA') || text.includes('CYLLA')) {
                        abaElement = tab;
                        break;
                    }
                }
            }
            
            if (abaElement) {
                result.encontrada = true;
                result.nome = abaElement.textContent || abaElement.innerText || 'RELATÓRIO CYLLA';
                
                // Tentar obter o gid da aba
                const gid = abaElement.getAttribute('data-sheet-id') || 
                           abaElement.getAttribute('data-gid') ||
                           abaElement.getAttribute('id')?.match(/gid[=:](\d+)/)?.[1];
                
                if (gid) {
                    result.gid = gid;
                } else {
                    // Tentar extrair do href ou onclick
                    const href = abaElement.getAttribute('href') || '';
                    const gidMatch = href.match(/[#&]gid=(\d+)/);
                    if (gidMatch) {
                        result.gid = gidMatch[1];
                    }
                }
            }
            
            return result;
        });
        
        console.log(`[GOOGLE SHEETS] Aba encontrada: ${abaInfo.encontrada}, GID: ${abaInfo.gid || 'não encontrado'}`);
        
        // Se encontrou a aba, clicar nela para ativar
        if (abaInfo.encontrada) {
            console.log('[GOOGLE SHEETS] Ativando aba "RELATÓRIO CYLLA"...');
            await page.evaluate(() => {
                const abaSelectors = [
                    '[data-sheet-name="RELATÓRIO CYLLA"]',
                    '[aria-label*="RELATÓRIO CYLLA"]',
                    'button[aria-label*="RELATÓRIO CYLLA"]'
                ];
                
                let abaElement = null;
                for (const selector of abaSelectors) {
                    abaElement = document.querySelector(selector);
                    if (abaElement) break;
                }
                
                if (!abaElement) {
                    const allTabs = document.querySelectorAll('[role="tab"], .docs-sheet-tab, button[data-sheet-name]');
                    for (const tab of allTabs) {
                        const text = tab.textContent || tab.innerText || '';
                        if (text.includes('RELATÓRIO CYLLA') || text.includes('CYLLA')) {
                            abaElement = tab;
                            break;
                        }
                    }
                }
                
                if (abaElement) {
                    abaElement.click();
                    return true;
                }
                return false;
            });
            
            await delay(3000); // Aguardar aba carregar
            console.log('[GOOGLE SHEETS] ✅ Aba "RELATÓRIO CYLLA" ativada');
        } else {
            console.log('[GOOGLE SHEETS] ⚠️ Aba "RELATÓRIO CYLLA" não encontrada');
        }
        
        // Verificar status final da planilha
        const statusFinal = await page.evaluate(() => {
            const gridCells = document.querySelectorAll('[role="gridcell"]');
            const activeTab = document.querySelector('[role="tab"][aria-selected="true"], .docs-sheet-tab[aria-selected="true"]');
            return {
                celulasEncontradas: gridCells.length,
                abaAtiva: activeTab ? (activeTab.textContent || activeTab.getAttribute('aria-label') || '') : null,
                urlAtual: window.location.href
            };
        });
        
        console.log(`[GOOGLE SHEETS] Status final: ${statusFinal.celulasEncontradas} células encontradas`);
        console.log(`[GOOGLE SHEETS] Aba ativa: "${statusFinal.abaAtiva || 'nenhuma'}"`);
        
        // Acessar menu Arquivo e baixar CSV
        console.log('[GOOGLE SHEETS] Acessando menu Arquivo...');
        
        // Configurar download
        const downloadsDir = path.join(__dirname, 'downloads');
        if (!fs.existsSync(downloadsDir)) {
            fs.mkdirSync(downloadsDir, { recursive: true });
        }
        
        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadsDir
        });
        
        // Procurar e clicar no menu Arquivo
        const menuArquivoEncontrado = await page.evaluate(() => {
            const menuArquivo = document.querySelector('#docs-file-menu, [id="docs-file-menu"]');
            if (menuArquivo) {
                menuArquivo.click();
                return true;
            }
            return false;
        });
        
        if (!menuArquivoEncontrado) {
            // Tentar métodos alternativos
            await page.evaluate(() => {
                const menuArquivo = document.querySelector('[role="menuitem"][aria-label*="Arquivo"], [role="menuitem"]:contains("Arquivo")');
                if (menuArquivo) {
                    menuArquivo.click();
                } else {
                    // Tentar por texto
                    const elementos = Array.from(document.querySelectorAll('*'));
                    const arquivoElement = elementos.find(el => el.textContent && el.textContent.trim() === 'Arquivo');
                    if (arquivoElement) {
                        arquivoElement.click();
                    }
                }
            });
        }
        
        await delay(1000); // Aguardar menu abrir
        
        // Procurar opção "Baixar" no menu
        console.log('[GOOGLE SHEETS] Procurando opção "Baixar"...');
        const baixarEncontrado = await page.evaluate(() => {
            // Procurar por texto "Baixar" ou "Download"
            const elementos = Array.from(document.querySelectorAll('[role="menuitem"], [role="menu"] [role="menuitem"]'));
            const baixarElement = elementos.find(el => {
                const text = el.textContent || el.innerText || el.getAttribute('aria-label') || '';
                return text.includes('Baixar') || text.includes('Download') || text.includes('Download');
            });
            
            if (baixarElement) {
                baixarElement.click();
                return true;
            }
            return false;
        });
        
        if (!baixarEncontrado) {
            console.log('[GOOGLE SHEETS] ⚠️ Opção "Baixar" não encontrada, tentando métodos alternativos...');
            // Tentar usar teclado
            await page.keyboard.press('ArrowDown');
            await delay(500);
            await page.keyboard.press('ArrowDown');
            await delay(500);
        } else {
            await delay(1000); // Aguardar submenu abrir
        }
        
        // Procurar opção CSV no submenu
        console.log('[GOOGLE SHEETS] Procurando opção CSV...');
        const csvEncontrado = await page.evaluate(() => {
            const elementos = Array.from(document.querySelectorAll('[role="menuitem"]'));
            const csvElement = elementos.find(el => {
                const text = el.textContent || el.innerText || el.getAttribute('aria-label') || '';
                return text.includes('CSV') || text.includes('.csv') || text.toLowerCase().includes('valores separados');
            });
            
            if (csvElement) {
                csvElement.click();
                return true;
            }
            return false;
        });
        
        if (!csvEncontrado) {
            console.log('[GOOGLE SHEETS] ⚠️ Opção CSV não encontrada, tentando navegação por teclado...');
            // Tentar navegar com teclado até CSV
            await page.keyboard.press('ArrowDown');
            await delay(300);
            await page.keyboard.press('Enter');
        } else {
            console.log('[GOOGLE SHEETS] ✅ Opção CSV encontrada e clicada');
        }
        
        // Aguardar download iniciar
        await delay(2000);
        
        // Procurar arquivo CSV baixado
        console.log('[GOOGLE SHEETS] Procurando arquivo CSV baixado...');
        const arquivos = fs.readdirSync(downloadsDir);
        const arquivosCSV = arquivos.filter(f => f.endsWith('.csv'));
        
        if (arquivosCSV.length === 0) {
            console.log('[GOOGLE SHEETS] ⚠️ Nenhum arquivo CSV encontrado no diretório de downloads');
            await browser.close();
            browser = null;
            
            return {
                success: false,
                message: 'Download do CSV não foi iniciado',
                error: 'Nenhum arquivo CSV encontrado'
            };
        }
        
        // Pegar o arquivo mais recente
        const arquivoCSV = arquivosCSV.map(f => {
            const filePath = path.join(downloadsDir, f);
            const stats = fs.statSync(filePath);
            return {
                name: f,
                path: filePath,
                mtime: stats.mtime.getTime()
            };
        }).sort((a, b) => b.mtime - a.mtime)[0];
        
        console.log(`[GOOGLE SHEETS] ✅ Arquivo CSV encontrado: ${arquivoCSV.name}`);
        
        await browser.close();
        browser = null;
        
        // Ler conteúdo do CSV
        const csvContent = fs.readFileSync(arquivoCSV.path, 'utf-8');
        console.log(`[GOOGLE SHEETS] CSV lido: ${csvContent.length} caracteres`);
        
        // Processar CSV e extrair valores específicos
        console.log('[GOOGLE SHEETS] Processando CSV para extrair valores...');
        const valores = processarCSVFinanceiro(csvContent);
        
        return {
            success: true,
            message: 'CSV baixado com sucesso',
            abaEncontrada: abaInfo.encontrada,
            abaNome: abaInfo.nome || 'RELATÓRIO CYLLA',
            abaGid: abaInfo.gid,
            arquivoCSV: arquivoCSV.name,
            csvContent: csvContent,
            valores: valores,
            lastUpdate: new Date().toISOString()
        };
        
    } catch (error) {
        if (browser) {
            await browser.close();
        }
        console.error('[GOOGLE SHEETS] Erro:', error);
        return {
            success: false,
            error: error.message,
            message: 'Erro ao acessar planilha'
        };
    }
}

// Rota para buscar dados financeiros do Google Sheets (usando Python)
app.get('/api/financeiro/viva-saude', async (req, res) => {
    // Verificar cache primeiro
    if (cache.financeiro.data && isCacheValid(cache.financeiro.timestamp, cache.config.TTL_FINANCEIRO)) {
        console.log(`[CACHE] ✅ Retornando dados financeiros do cache (${Math.round((Date.now() - cache.financeiro.timestamp) / 1000)}s atrás)`);
        return res.json({
            ...cache.financeiro.data,
            cached: true
        });
    }
    
    // Se não há cache válido, atualizar em background e retornar cache antigo se houver
    if (cache.financeiro.data) {
        console.log(`[CACHE] ⚡ Cache expirado, retornando dados antigos enquanto atualiza...`);
        // Atualizar em background
        updateFinanceiroCache().catch(err => {
            console.error('[CACHE] Erro ao atualizar em background:', err.message);
        });
        return res.json({
            ...cache.financeiro.data,
            cached: true,
            updating: true
        });
    }
    
    // Se não há cache, fazer requisição síncrona (primeira vez)
    let pythonProcess = null;
    try {
        console.log('[GOOGLE SHEETS] Iniciando extração via Python...');
        
        // Executar script Python
        const scriptPath = path.join(__dirname, 'google_sheets_extractor.py');
        const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
        
        // Usar caminho absoluto e garantir que está correto
        const fullCommand = `"${pythonCommand}" "${scriptPath}"`;
        
        console.log(`[GOOGLE SHEETS] Executando: ${fullCommand}`);
        console.log(`[GOOGLE SHEETS] Script path: ${scriptPath}`);
        console.log(`[GOOGLE SHEETS] Python command: ${pythonCommand}`);
        
        // Executar com opções mais robustas e tratamento de timeout
        const startTime = Date.now();
        
        const { stdout, stderr } = await Promise.race([
            execAsync(fullCommand, {
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
                timeout: 600000, // 10 minutos timeout (Render é muito lento e Google Sheets pode demorar)
                cwd: __dirname, // Executar no diretório do projeto
                env: {
                    ...process.env,
                    PYTHONUNBUFFERED: '1' // Desabilitar buffer do Python
                }
            }),
            // Timeout manual adicional
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout: Script Python demorou mais de 3 minutos')), 180000)
            )
        ]);
        
        const elapsedTime = Date.now() - startTime;
        console.log(`[GOOGLE SHEETS] Script executado em ${elapsedTime}ms`);
        
        // Logs do Python vão para stderr (usamos sys.stderr no script)
        if (stderr && stderr.trim()) {
            console.log('[GOOGLE SHEETS] Logs Python (stderr):');
            // Mostrar apenas últimas 2000 linhas para não sobrecarregar
            const stderrLines = stderr.split('\n');
            const lastLines = stderrLines.slice(-50).join('\n');
            console.log(lastLines);
        }
        
        // Verificar se stdout está vazio
        if (!stdout || !stdout.trim()) {
            console.error('[GOOGLE SHEETS] ⚠️ stdout vazio!');
            console.error('[GOOGLE SHEETS] stderr (últimas 20 linhas):', stderr.split('\n').slice(-20).join('\n'));
            throw new Error('Script Python não retornou dados. Verifique os logs acima.');
        }
        
        console.log(`[GOOGLE SHEETS] stdout recebido (${stdout.length} caracteres)`);
        
        // Parsear resultado JSON do stdout
        let result;
        try {
            // Limpar stdout (remover logs que possam estar misturados)
            const stdoutClean = stdout.trim();
            // Tentar encontrar JSON no stdout (pode ter logs antes)
            const jsonMatch = stdoutClean.match(/\{[\s\S]*\}/);
            const jsonString = jsonMatch ? jsonMatch[0] : stdoutClean;
            
            if (!jsonString || jsonString.length < 10) {
                throw new Error('JSON não encontrado no stdout');
            }
            
            result = JSON.parse(jsonString);
        } catch (parseError) {
            console.error('[GOOGLE SHEETS] Erro ao parsear JSON:', parseError.message);
            console.error('[GOOGLE SHEETS] stdout (primeiros 1000 chars):', stdout.substring(0, 1000));
            console.error('[GOOGLE SHEETS] stdout (últimos 1000 chars):', stdout.substring(Math.max(0, stdout.length - 1000)));
            throw new Error(`Resposta inválida do script Python: ${parseError.message}`);
        }
        
        console.log('[GOOGLE SHEETS] Resultado:', result.success ? '✅ Sucesso' : '❌ Falha');
        
        // Verificar se o resultado tem a nova estrutura com múltiplos contratos
        if (result.contratos) {
            console.log('[GOOGLE SHEETS] Dados de múltiplos contratos extraídos:', Object.keys(result.contratos));
            // Log detalhado de cada contrato
            for (const [contrato, dados] of Object.entries(result.contratos)) {
                const meses = dados.valores?.meses ? Object.keys(dados.valores.meses) : [];
                const mesesCount = meses.length;
                const valorAberto = dados.valores?.vivaRioEmAberto || 'N/A';
                
                if (dados.success) {
                    console.log(`[GOOGLE SHEETS] ✅ ${contrato}: ${mesesCount} meses (${meses.join(', ')}), valor aberto: ${valorAberto}`);
                } else {
                    console.log(`[GOOGLE SHEETS] ⚠️ ${contrato}: success=False mas ${mesesCount} meses encontrados (${meses.join(', ')}), valor aberto: ${valorAberto}, erro: ${dados.error || 'N/A'}`);
                    // Se há meses encontrados, corrigir success para True
                    if (mesesCount > 0) {
                        dados.success = true;
                        dados.message = `Dados extraídos com sucesso (${mesesCount} meses encontrados)`;
                        dados.error = null;
                        console.log(`[GOOGLE SHEETS] 🔧 ${contrato}: Corrigido success para True (${mesesCount} meses encontrados)`);
                    }
                }
            }
        } else if (result.valores) {
            console.log('[GOOGLE SHEETS] Valores extraídos (formato antigo):', JSON.stringify(result.valores, null, 2));
        }
        
        // Salvar no cache
        cache.financeiro.data = result;
        cache.financeiro.timestamp = Date.now();
        
        res.json({
            ...result,
            cached: false
        });
    } catch (error) {
        console.error('[GOOGLE SHEETS] Erro ao executar script Python:', error.message);
        console.error('[GOOGLE SHEETS] Tipo de erro:', error.constructor.name);
        
        // Se for timeout, fornecer mensagem mais clara
        if (error.message.includes('Timeout') || error.message.includes('timeout')) {
            console.error('[GOOGLE SHEETS] ⚠️ O script Python demorou muito para executar. Pode estar travado.');
        }
        
        res.status(500).json({ 
            success: false, 
            error: error.message,
            message: 'Erro ao executar extração via Python',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Rota para verificar login de um sistema específico
app.post('/api/check-login/:system', async (req, res) => {
    try {
        const { system } = req.params;
        const creds = CREDENTIALS[system];
        
        if (!creds) {
            return res.status(400).json({ error: 'Sistema não encontrado' });
        }

        // Verificar se as credenciais estão configuradas
        if (!creds.username || !creds.password) {
            return res.status(500).json({ 
                error: 'Credenciais não configuradas',
                message: `As credenciais para ${system} não estão configuradas. Configure as variáveis de ambiente ${system.toUpperCase().replace('-', '_')}_USERNAME e ${system.toUpperCase().replace('-', '_')}_PASSWORD no Render.`
            });
        }

        // Verificar cache primeiro (cada sistema tem seu próprio cache)
        const cached = cache.logins.get(system);
        if (cached && isCacheValid(cached.timestamp, cache.config.TTL_LOGINS)) {
            console.log(`[CACHE] ✅ Retornando dados do cache para ${system} (${Math.round((Date.now() - cached.timestamp) / 1000)}s atrás)`);
            // Verificar se os dados são do sistema correto
            if (cached.data.systemKey === system) {
                // Validação adicional: verificar se há dados válidos
                const totalRegistros = cached.data.data?.total || 0;
                console.log(`[CACHE] 📊 Cache válido para ${system}: ${totalRegistros} registros, systemKey=${cached.data.systemKey}, system=${system}`);
                return res.json({
                    ...cached.data,
                    cached: true
                });
            } else {
                console.log(`[CACHE] ⚠️ Cache de ${system} tem systemKey incorreto (esperado: ${system}, encontrado: ${cached.data.systemKey}), limpando...`);
                cache.logins.delete(system);
            }
        }

        // Se não há cache válido, atualizar em background e retornar cache antigo se houver
        if (cached) {
            console.log(`[CACHE] ⚡ Cache expirado para ${system}, retornando dados antigos enquanto atualiza...`);
            // Atualizar em background
            updateSystemCache(system).catch(err => {
                console.error(`[CACHE] Erro ao atualizar ${system} em background:`, err.message);
            });
            return res.json({
                ...cached.data,
                cached: true,
                updating: true
            });
        }

        // Se não há cache, fazer requisição síncrona (primeira vez)
        console.log(`[CACHE] ⏳ Buscando dados frescos para ${system} (primeira vez)...`);
        
        let loginResult;
        
        if (creds.system === 'rhid') {
            if (system === 'coop-vitta' || system === 'delta') {
                const systemName = system === 'coop-vitta' ? 'COOP-VITTA' : 'DELTA';
                loginResult = await loginRHIDAndExportCSV(creds.username, creds.password, systemName);
            } else {
                loginResult = await loginRHID(creds.username, creds.password);
            }
        } else if (creds.system === 'doctorid') {
            loginResult = await loginDoctorID(creds.username, creds.password);
        } else {
            return res.status(400).json({ error: 'Sistema não suportado' });
        }

        const result = {
            success: loginResult.success !== false,
            message: loginResult.success !== false ? 'Login bem-sucedido' : 'Falha no login',
            system: creds.system,
            systemKey: system, // Garantir que sabemos qual sistema é
            data: loginResult.data || null,
            cached: false
        };

        // Validação antes de salvar no cache
        const totalRegistros = loginResult.data?.total || 0;
        console.log(`[${system}] ✅ Dados obtidos: ${totalRegistros} registros, systemKey=${system}, system=${creds.system}`);

        // Salvar no cache com chave específica do sistema (garantir que não sobrescreva outro sistema)
        const previousCache = cache.logins.get(system);
        if (previousCache && previousCache.data.systemKey !== system) {
            console.log(`[CACHE] ⚠️ AVISO: Tentativa de sobrescrever cache de ${system} com dados incorretos! Prevendo: ${previousCache.data.systemKey}`);
        }
        
        cache.logins.set(system, {
            data: result,
            timestamp: Date.now()
        });

        // Verificar se foi salvo corretamente
        const verifyCache = cache.logins.get(system);
        if (verifyCache && verifyCache.data.systemKey === system) {
            console.log(`[CACHE] ✅ Dados de ${system} salvos no cache corretamente: ${verifyCache.data.data?.total || 0} registros`);
        } else {
            console.error(`[CACHE] ❌ ERRO: Cache de ${system} foi salvo incorretamente! systemKey=${verifyCache?.data?.systemKey || 'undefined'}`);
        }

        res.json(result);
    } catch (error) {
        console.error('Erro ao verificar login:', error);
        
        // Se houver cache, retornar ele mesmo com erro
        const cached = cache.logins.get(req.params.system);
        if (cached) {
            console.log(`[CACHE] ⚠️ Erro ao buscar dados de ${req.params.system}, retornando cache antigo...`);
            return res.json({
                ...cached.data,
                cached: true,
                error: true,
                errorMessage: error.message
            });
        }
        
        if (!res.headersSent) {
            res.status(500).json({ 
                error: error.message,
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }
});

// Rota para fazer login manual
app.post('/api/rhid/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
        }

        const loginResult = await loginRHID(username, password);
        
        if (loginResult.success) {
            const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            sessions.set(sessionId, {
                cookies: loginResult.cookies,
                createdAt: new Date()
            });
            
            res.json({ 
                success: true, 
                sessionId,
                message: 'Login realizado com sucesso'
            });
        } else {
            res.status(401).json({ 
                success: false, 
                error: 'Credenciais inválidas' 
            });
        }
    } catch (error) {
        console.error('Erro ao fazer login:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao fazer login',
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

