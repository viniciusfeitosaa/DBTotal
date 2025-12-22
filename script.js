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

// Buscar dados financeiros do Viva Saúde
async function fetchFinanceiroVivaSaude() {
    try {
        const response = await fetch(`${API_BASE_URL}/financeiro/viva-saude`);
        const data = await response.json();
        
        if (data.success && data.data) {
            // Atualizar elementos financeiros
            const totalEl = document.getElementById('viva-saude-financeiro-total');
            const updateEl = document.getElementById('viva-saude-financeiro-update');
            const statusEl = document.getElementById('viva-saude-financeiro-status');
            
            if (totalEl) {
                // Formatar valor total
                const valorFormatado = new Intl.NumberFormat('pt-BR', {
                    style: 'currency',
                    currency: 'BRL'
                }).format(data.valorTotal || 0);
                totalEl.textContent = valorFormatado;
            }
            
            if (updateEl) {
                const updateDate = new Date(data.lastUpdate);
                updateEl.textContent = updateDate.toLocaleString('pt-BR');
            }
            
            if (statusEl) {
                statusEl.textContent = 'Atualizado';
                statusEl.style.color = '#10b981';
            }
            
            console.log('[FRONTEND] Dados financeiros atualizados:', data);
        } else {
            // Atualizar status de erro
            const statusEl = document.getElementById('viva-saude-financeiro-status');
            if (statusEl) {
                statusEl.textContent = 'Erro ao carregar';
                statusEl.style.color = '#ef4444';
            }
            console.error('[FRONTEND] Erro ao buscar dados financeiros:', data.error);
        }
    } catch (error) {
        console.error('[FRONTEND] Erro ao buscar dados financeiros:', error);
        const statusEl = document.getElementById('viva-saude-financeiro-status');
        if (statusEl) {
            statusEl.textContent = 'Erro de conexão';
            statusEl.style.color = '#ef4444';
        }
    }
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    checkServerHealth();
    
    // Mostrar apenas o card geral por padrão
    const allCards = document.querySelectorAll('.system-card');
    allCards.forEach(card => {
        if (card.id === 'geral-card') {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
    
    // Inicializar card geral
    updateGeralCard();
    
    checkAllLogins();
    
    // Buscar dados financeiros do Viva Saúde
    fetchFinanceiroVivaSaude();
    
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
    addLog('Iniciando verificação de todos os sistemas...', 'info');
    
    // Verificar sistemas em paralelo, mas Coop Vitta e Delta sequencialmente
    // (para evitar conflito no diretório de downloads de CSV)
    await Promise.all([
        checkLogin('viva-saude'),
        (async () => {
            await checkLogin('coop-vitta');
            await checkLogin('delta');
        })()
    ]);
    
    addLog('Verificação de todos os sistemas concluída', 'success');
}

// Verificar login de um sistema específico
async function checkLogin(systemKey) {
    const system = systems[systemKey];
    if (!system) return;

    const startTime = Date.now();
    updateSiteStatus(systemKey, 'checking', 'Verificando login...');
    
    // Atualizar status no card geral (verificando)
    sistemasStatus[systemKey] = {
        success: null,
        lastUpdate: null,
        registros: null
    };
    updateGeralCard();

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
                // Mensagem simples do DoctorID
                if (data.data.message) {
                    infoText += `\n\n📝 ${data.data.message}`;
                }
                
                // Informação sobre Filtro Avançado
                if (data.data.filtroAvancadoAcessado) {
                    infoText += `\n\n🔍 Filtro Avançado: ✅ Acessado`;
                    
                    // Informação sobre tipo de filtro selecionado
                    if (data.data.tipoFiltroSelecionado) {
                        infoText += `\n  • Tipo de Filtro: "${data.data.tipoFiltroSelecionado.texto}"`;
                        infoText += `\n  • Valor: ${data.data.tipoFiltroSelecionado.valor}`;
                    }
                    
                    // Informação sobre operador selecionado
                    if (data.data.operadorSelecionado) {
                        infoText += `\n  • Operador: "${data.data.operadorSelecionado.texto}"`;
                        infoText += `\n  • Valor: ${data.data.operadorSelecionado.valor}`;
                    }
                    
                    // Informação sobre valor inserido
                    if (data.data.valorInput) {
                        infoText += `\n  • Valor inserido: "${data.data.valorInput.valor}"`;
                    }
                    
                    // Informação sobre filtro aplicado
                    if (data.data.filtroAplicado !== undefined) {
                        infoText += `\n  • Filtro aplicado: ${data.data.filtroAplicado ? '✅ Sim' : '❌ Não'}`;
                    }
                    
                    // Mensagem do alerta
                    if (data.data.mensagemAlerta) {
                        infoText += `\n  • Mensagem: ${data.data.mensagemAlerta}`;
                    }
                }
                
                // Compatibilidade com outros sistemas (registros)
                if (data.data.registros !== undefined) {
                    registrosValue = data.data.registros;
                    infoText += `\n\n📊 Registros encontrados: ${data.data.registros}`;
                }
                
                // Coop Vitta e Delta retornam total do CSV
                if (data.data.total !== undefined) {
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
            
            const lastUpdateTimestamp = Date.now();
            const lastUpdate = new Date(lastUpdateTimestamp).toLocaleString('pt-BR');
            
            updateSiteData(systemKey, {
                loginStatus: 'Login bem-sucedido',
                lastUpdate: lastUpdate,
                responseTime: `${responseTime}ms`,
                success: true,
                registros: registrosValue
            });
            
            // Atualizar status no card geral
            sistemasStatus[systemKey] = {
                success: true,
                lastUpdate: lastUpdate,
                lastUpdateTimestamp: lastUpdateTimestamp,
                registros: registrosValue
            };
            updateGeralCard();
            
            // Criar mensagem de log
            let logMessage = `${system.name}: Login bem-sucedido`;
            if (data.data?.registros !== undefined) {
                logMessage += ` - ${data.data.registros} registros`;
            } else if (data.data?.total !== undefined) {
                logMessage += ` - ${data.data.total} registros`;
            }
            logMessage += ` (${responseTime}ms)`;
            addLog(logMessage, 'success');
        } else {
            const lastUpdateTimestamp = Date.now();
            const lastUpdate = new Date(lastUpdateTimestamp).toLocaleString('pt-BR');
            
            updateSiteStatus(systemKey, 'offline', 'Login falhou');
            updateSiteData(systemKey, {
                loginStatus: 'Falha no login',
                lastUpdate: lastUpdate,
                responseTime: `${responseTime}ms`,
                success: false
            });
            
            // Atualizar status no card geral
            sistemasStatus[systemKey] = {
                success: false,
                lastUpdate: lastUpdate,
                lastUpdateTimestamp: lastUpdateTimestamp,
                registros: null
            };
            updateGeralCard();
            
            addLog(`${system.name}: Falha no login - ${data.message || 'Erro desconhecido'}`, 'error');
        }
    } catch (error) {
        const responseTime = Date.now() - startTime;
        const lastUpdateTimestamp = Date.now();
        const lastUpdate = new Date(lastUpdateTimestamp).toLocaleString('pt-BR');
        
        updateSiteStatus(systemKey, 'offline', 'Erro de conexão');
        updateSiteData(systemKey, {
            loginStatus: 'Erro de conexão',
            lastUpdate: lastUpdate,
            responseTime: `${responseTime}ms`,
            success: false
        });
        
        // Atualizar status no card geral
        sistemasStatus[systemKey] = {
            success: false,
            lastUpdate: lastUpdate,
            lastUpdateTimestamp: lastUpdateTimestamp,
            registros: null
        };
        updateGeralCard();
        
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
    
    // Mostrar registros/opções se disponível
    if (data.registros !== null && data.registros !== undefined) {
        if (registrosEl) {
            registrosEl.textContent = data.registros;
        }
        if (registrosItemEl) {
            registrosItemEl.style.display = 'flex';
            // Atualizar label se for DoctorID
            const labelEl = registrosItemEl.querySelector('.stat-label');
            if (labelEl && siteKey === 'viva-saude') {
                labelEl.textContent = 'Registros Encontrados';
            }
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
            
            // Mostrar/esconder cards conforme seleção
            const allCards = document.querySelectorAll('.system-card');
            allCards.forEach(card => {
                card.style.display = 'none';
            });
            
            if (system === 'geral') {
                // Mostrar apenas o card geral
                const geralCard = document.getElementById('geral-card');
                if (geralCard) {
                    geralCard.style.display = 'block';
                    geralCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            } else {
                // Mostrar o card do sistema selecionado e seus cards relacionados
                const systemCard = document.getElementById(`${system}-card`);
                const financeiroCard = document.getElementById(`${system}-financeiro-card`);
                const contratosCard = document.getElementById(`${system}-contratos-card`);
                
                if (systemCard) {
                    systemCard.style.display = 'block';
                    systemCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                
                // Mostrar card de contratos apenas para Viva Saúde
                if (contratosCard && system === 'viva-saude') {
                    contratosCard.style.display = 'block';
                } else if (contratosCard) {
                    contratosCard.style.display = 'none';
                }
                
                if (financeiroCard) {
                    financeiroCard.style.display = 'block';
                    
                    // Se for Viva Saúde, buscar dados financeiros quando o card for exibido
                    if (system === 'viva-saude') {
                        fetchFinanceiroVivaSaude();
                    }
                }
            }
        }
    });
});

// Estado dos sistemas para o card geral
const sistemasStatus = {
    'viva-saude': { success: null, lastUpdate: null, lastUpdateTimestamp: null, registros: null },
    'coop-vitta': { success: null, lastUpdate: null, lastUpdateTimestamp: null, registros: null },
    'delta': { success: null, lastUpdate: null, lastUpdateTimestamp: null, registros: null }
};

// Atualizar card geral com informações consolidadas
function updateGeralCard() {
    const sistemas = Object.keys(sistemasStatus);
    let operacionais = 0;
    let problemas = 0;
    let todosVerificados = true;
    let ultimaVerificacao = null;
    
    const resumoHTML = [];
    
    sistemas.forEach(systemKey => {
        const status = sistemasStatus[systemKey];
        const system = systems[systemKey];
        
        if (status.success === null) {
            todosVerificados = false;
        } else if (status.success) {
            operacionais++;
        } else {
            problemas++;
        }
        
        // Atualizar última verificação (usar timestamp se disponível)
        if (status.lastUpdateTimestamp || status.lastUpdate) {
            const timestamp = status.lastUpdateTimestamp || (status.lastUpdate ? new Date(status.lastUpdate).getTime() : null);
            if (timestamp && (!ultimaVerificacao || timestamp > ultimaVerificacao)) {
                ultimaVerificacao = timestamp;
            }
        }
        
        // Criar resumo do sistema
        const statusIcon = status.success === null ? '⏳' : status.success ? '✅' : '❌';
        const statusText = status.success === null ? 'Aguardando...' : status.success ? 'Operacional' : 'Com Problemas';
        const registrosText = status.registros !== null && status.registros !== undefined ? ` - ${status.registros} registros` : '';
        
        // Formatar hora da última atualização
        let horaFormatada = '';
        if (status.lastUpdateTimestamp) {
            try {
                const dataObj = new Date(status.lastUpdateTimestamp);
                horaFormatada = dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            } catch (e) {
                horaFormatada = status.lastUpdate || '';
            }
        } else if (status.lastUpdate) {
            try {
                const dataObj = new Date(status.lastUpdate);
                if (!isNaN(dataObj.getTime())) {
                    horaFormatada = dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                } else {
                    // Tentar extrair hora da string
                    const match = status.lastUpdate.match(/(\d{2}):(\d{2}):(\d{2})/);
                    if (match) {
                        horaFormatada = `${match[1]}:${match[2]}:${match[3]}`;
                    } else {
                        horaFormatada = status.lastUpdate.split(' ')[1] || status.lastUpdate;
                    }
                }
            } catch (e) {
                horaFormatada = status.lastUpdate;
            }
        }
        
        resumoHTML.push(`
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 6px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 18px;">${statusIcon}</span>
                    <span style="font-weight: 500;">${system.name}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <span style="font-size: 14px; color: rgba(255,255,255,0.7);">${statusText}${registrosText}</span>
                    ${horaFormatada ? `<span style="font-size: 12px; color: rgba(255,255,255,0.5);">${horaFormatada}</span>` : ''}
                </div>
            </div>
        `);
    });
    
    // Atualizar elementos do card geral
    const operacionaisEl = document.getElementById('geral-operacionais');
    const problemasEl = document.getElementById('geral-problemas');
    const statusGeralEl = document.getElementById('geral-status-geral');
    const lastUpdateEl = document.getElementById('geral-last-update');
    const statusBadge = document.getElementById('geral-status');
    const statusText = document.getElementById('geral-status-text');
    const resumoEl = document.getElementById('geral-sistemas-resumo');
    
    if (operacionaisEl) operacionaisEl.textContent = operacionais;
    if (problemasEl) problemasEl.textContent = problemas;
    
    // Formatar última verificação (ultimaVerificacao agora é timestamp)
    let ultimaVerificacaoFormatada = '-';
    if (ultimaVerificacao) {
        try {
            const dataObj = new Date(ultimaVerificacao);
            if (!isNaN(dataObj.getTime())) {
                ultimaVerificacaoFormatada = dataObj.toLocaleString('pt-BR');
            }
        } catch (e) {
            ultimaVerificacaoFormatada = '-';
        }
    }
    if (lastUpdateEl) lastUpdateEl.textContent = ultimaVerificacaoFormatada;
    if (resumoEl) resumoEl.innerHTML = resumoHTML.join('');
    
    // Atualizar status geral
    if (!todosVerificados) {
        if (statusGeralEl) {
            statusGeralEl.textContent = 'Verificando...';
            statusGeralEl.style.color = '#f59e0b';
        }
        if (statusBadge) {
            statusBadge.className = 'status-indicator-modern checking';
        }
        if (statusText) {
            statusText.textContent = 'Verificando sistemas...';
        }
    } else if (problemas === 0) {
        if (statusGeralEl) {
            statusGeralEl.textContent = 'Todos Operacionais';
            statusGeralEl.style.color = '#10b981';
        }
        if (statusBadge) {
            statusBadge.className = 'status-indicator-modern online';
        }
        if (statusText) {
            statusText.textContent = 'Todos os sistemas estão operacionais';
        }
    } else {
        if (statusGeralEl) {
            statusGeralEl.textContent = 'Alguns Sistemas com Problemas';
            statusGeralEl.style.color = '#ef4444';
        }
        if (statusBadge) {
            statusBadge.className = 'status-indicator-modern offline';
        }
        if (statusText) {
            statusText.textContent = `${problemas} sistema(s) com problemas`;
        }
    }
}

// Verificação inicial
setTimeout(() => {
    addLog('Sistema pronto. Verificando logins...', 'info');
}, 1000);
