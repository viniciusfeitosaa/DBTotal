// Configuração da API
const API_BASE_URL = 'http://localhost:3000/api';

// Configuração dos sistemas
const systems = {
    'viva-saude': {
        name: 'Viva Saúde',
        system: 'doctorid',
        apiEndpoint: '/check-login/viva-saude'
    },
    'coop-vitta': {
        name: 'Coop Vitta',
        system: 'rhid',
        apiEndpoint: '/check-login/coop-vitta'
    },
    'delta': {
        name: 'Delta',
        system: 'rhid',
        apiEndpoint: '/check-login/delta'
    }
};

// Estado da aplicação
let autoRefreshInterval = null;
const AUTO_REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24 horas

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    checkServerHealth();
    checkAllLogins();
    // Iniciar auto-refresh automático a cada 24 horas
    startAutoRefresh();
});

// Verificar saúde do servidor
async function checkServerHealth() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        if (response.ok) {
            addLog('Servidor conectado com sucesso', 'success');
        } else {
            addLog('Servidor não está respondendo corretamente', 'warning');
        }
    } catch (error) {
        addLog('Erro ao conectar com o servidor. Certifique-se de que o servidor está rodando na porta 3000', 'error');
    }
}

// Event listeners
function initializeEventListeners() {
    // Botões de refresh individuais (se ainda existirem)
    document.querySelectorAll('.refresh-btn-modern').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const site = e.target.closest('.refresh-btn-modern').dataset.site;
            if (site) {
                checkLogin(site);
            }
        });
    });
}

// Verificar todos os logins
async function checkAllLogins() {
    addLog('Iniciando verificação de todos os logins...', 'info');
    
    // Executar sequencialmente para evitar conflitos
    // Priorizar DoctorID primeiro
    const systemKeys = Object.keys(systems);
    
    // Ordenar: DoctorID primeiro, depois os outros
    systemKeys.sort((a, b) => {
        if (a === 'viva-saude') return -1; // DoctorID primeiro
        if (b === 'viva-saude') return 1;
        return 0;
    });
    
    // Executar um por vez (sequencial)
    for (const systemKey of systemKeys) {
        await checkLogin(systemKey);
        // Pequeno delay entre execuções para evitar conflitos
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    addLog('Verificação completa de todos os logins', 'success');
}

// Verificar login de um sistema específico
async function checkLogin(systemKey) {
    const system = systems[systemKey];
    if (!system) return;

    const startTime = Date.now();
    updateSiteStatus(systemKey, 'checking', 'Verificando login...');

    try {
        const response = await fetch(`${API_BASE_URL}${system.apiEndpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        const responseTime = Date.now() - startTime;

        if (response.ok && data.success) {
            updateSiteStatus(systemKey, 'online', 'Login OK');
            
            // Se houver dados, exibir informações
            let infoText = `✅ Login verificado com sucesso em ${responseTime}ms`;
            let registrosValue = null;
            
            if (data.data) {
                // DoctorID retorna registros diretamente
                if (data.data.registros !== undefined) {
                    registrosValue = data.data.registros;
                    infoText += `\n\n📊 Registros encontrados: ${data.data.registros}`;
                    if (data.data.message) {
                        infoText += `\n📝 Mensagem: ${data.data.message}`;
                    }
                    if (data.data.source) {
                        infoText += `\n📍 Fonte: ${data.data.source}`;
                    }
                    if (data.data.selector) {
                        infoText += `\n🔍 Seletor CSS: ${data.data.selector}`;
                    }
                    if (data.data.elementInfo) {
                        infoText += `\n\n📋 Detalhes do elemento:`;
                        infoText += `\n  • Classe: ${data.data.elementInfo.className}`;
                        if (data.data.elementInfo.id !== 'sem id') {
                            infoText += `\n  • ID: ${data.data.elementInfo.id}`;
                        }
                        if (data.data.elementInfo.dataAttributes) {
                            infoText += `\n  • Atributos data: ${data.data.elementInfo.dataAttributes}`;
                        }
                    }
                }
                // Coop Vitta e Delta retornam total do CSV
                else if (data.data.total !== undefined) {
                    registrosValue = data.data.total;
                    infoText += `\n\n📊 Total de registros: ${data.data.total}`;
                    if (data.data.ativos !== undefined) {
                        infoText += `\n✅ Ativos: ${data.data.ativos}`;
                    }
                    if (data.data.inativos !== undefined) {
                        infoText += `\n❌ Inativos: ${data.data.inativos}`;
                    }
                }
            }
            
            updateSiteData(systemKey, {
                loginStatus: 'Login bem-sucedido',
                lastUpdate: new Date().toLocaleString('pt-BR'),
                responseTime: `${responseTime}ms`,
                success: true,
                registros: registrosValue
            });
            
            // Criar mensagem de log com registros
            let logMessage = `${system.name}: Login bem-sucedido`;
            if (data.data?.registros !== undefined) {
                logMessage += ` - ${data.data.registros} registros`;
            } else if (data.data?.total !== undefined) {
                logMessage += ` - ${data.data.total} registros`;
            }
            logMessage += ` (${responseTime}ms)`;
            addLog(logMessage, 'success');
        } else {
            updateSiteStatus(systemKey, 'offline', 'Login falhou');
            updateSiteData(systemKey, {
                loginStatus: 'Falha no login',
                lastUpdate: new Date().toLocaleString('pt-BR'),
                responseTime: `${responseTime}ms`,
                success: false
            });
            addLog(`${system.name}: Falha no login - ${data.message || 'Erro desconhecido'}`, 'error');
        }
    } catch (error) {
        const responseTime = Date.now() - startTime;
        updateSiteStatus(systemKey, 'offline', 'Erro de conexão');
        updateSiteData(systemKey, {
            loginStatus: 'Erro de conexão',
            lastUpdate: new Date().toLocaleString('pt-BR'),
            responseTime: `${responseTime}ms`,
            success: false
        });
        addLog(`${system.name}: Erro de conexão - ${error.message}`, 'error');
    }
}

// Atualizar status do site
function updateSiteStatus(siteKey, status, text) {
    const statusDot = document.getElementById(`${siteKey}-status`);
    const statusText = document.getElementById(`${siteKey}-status-text`);
    
    if (statusDot && statusText) {
        statusDot.className = `status-indicator-modern ${status}`;
        statusText.textContent = text;
    }
}

// Atualizar dados do site
function updateSiteData(siteKey, data) {
    const lastUpdateEl = document.getElementById(`${siteKey}-last-update`);
    const loginStatusEl = document.getElementById(`${siteKey}-login-status`);
    const registrosEl = document.getElementById(`${siteKey}-registros`);
    const registrosItemEl = document.getElementById(`${siteKey}-registros-item`);
    
    if (lastUpdateEl) lastUpdateEl.textContent = data.lastUpdate;
    if (loginStatusEl) {
        loginStatusEl.textContent = data.loginStatus;
        loginStatusEl.style.color = data.success ? '#10b981' : '#ef4444';
        loginStatusEl.style.fontWeight = '600';
    }
    
    // Mostrar registros se disponível (DoctorID)
    if (data.registros !== null && data.registros !== undefined) {
        if (registrosEl) {
            registrosEl.textContent = data.registros;
        }
        if (registrosItemEl) {
            registrosItemEl.style.display = 'flex';
        }
    } else {
        if (registrosItemEl) {
            registrosItemEl.style.display = 'none';
        }
    }
}

// Adicionar log (função mantida para compatibilidade, mas logs não são mais exibidos)
function addLog(message, type = 'info') {
    // Logs não são mais exibidos na interface, mas a função é mantida para não quebrar o código
    console.log(`[${type.toUpperCase()}] ${message}`);
}

// Iniciar auto-refresh automático
function startAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    
    autoRefreshInterval = setInterval(() => {
        addLog('Auto-refresh: Verificando todos os sistemas...', 'info');
        checkAllLogins();
    }, AUTO_REFRESH_INTERVAL);
    
    addLog(`Auto-refresh automático ativado (24 horas)`, 'success');
}

// Escape HTML para segurança
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Navegação sidebar
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const system = item.dataset.system;
        if (system) {
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            // Scroll para o card correspondente
            const card = document.getElementById(`${system}-card`);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    });
});

// Verificação inicial
setTimeout(() => {
    addLog('Sistema pronto. Verificando logins...', 'info');
}, 1000);
