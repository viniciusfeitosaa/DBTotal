// Configuração da API
// Detecta automaticamente se está em produção (Netlify) ou desenvolvimento (localhost)
const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

// ⚠️ CONFIGURAÇÃO IMPORTANTE ⚠️
// Substitua a URL abaixo pela URL do seu backend no Render
// Exemplo: Se seu backend no Render é 'https://dbtotal-backend.onrender.com'
// Então use: 'https://dbtotal-backend.onrender.com/api'
// ⚠️ IMPORTANTE: A URL deve terminar com /api
const RENDER_BACKEND_URL = 'https://holds-declare-plans-used.trycloudflare.com/api'; // URL do Cloudflare Tunnel (backend local)

const API_BASE_URL = isProduction 
    ? (window.API_BASE_URL || RENDER_BACKEND_URL)
    : 'http://localhost:3000/api';

// Log de debug para verificar configuração
console.log('[CONFIG] Ambiente:', isProduction ? 'PRODUÇÃO' : 'DESENVOLVIMENTO');
console.log('[CONFIG] API Base URL:', API_BASE_URL);
console.log('[CONFIG] Hostname:', window.location.hostname);

// Função helper para fazer fetch com headers do ngrok
async function fetchWithNgrokHeaders(url, options = {}) {
    const defaultHeaders = {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true', // Bypass do interstício do ngrok
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', // Evitar bloqueio do ngrok
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    };
    
    const mergedOptions = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...(options.headers || {})
        }
    };
    
    try {
        const response = await fetch(url, mergedOptions);
        
        // Verificar se a resposta é HTML (página de interstício do ngrok)
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
            const text = await response.text();
            if (text.includes('<!DOCTYPE') || text.includes('ngrok')) {
                console.error('[NGROK] ⚠️ Resposta HTML detectada (página de interstício do ngrok)');
                console.error('[NGROK] URL:', url);
                console.error('[NGROK] Primeiros 200 caracteres:', text.substring(0, 200));
                throw new Error('ngrok está retornando página HTML em vez de JSON. Acesse a URL manualmente uma vez no navegador para autorizar.');
            }
        }
        
        return response;
    } catch (error) {
        console.error('[NGROK] Erro na requisição:', error);
        throw error;
    }
}

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
        const url = `${API_BASE_URL}/financeiro/viva-saude`;
        console.log('[FETCH] Buscando dados financeiros:', url);
        
        const response = await fetchWithNgrokHeaders(url);
        
        if (!response.ok) {
            console.error('[FETCH] Erro na resposta:', response.status, response.statusText);
            throw new Error(`Erro HTTP: ${response.status} ${response.statusText}`);
        }
        
        // Verificar se a resposta é realmente JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('[FETCH] Resposta não é JSON. Content-Type:', contentType);
            console.error('[FETCH] Primeiros 200 caracteres:', text.substring(0, 200));
            throw new Error('Resposta não é JSON. Possível página de interstício do ngrok.');
        }
        
        const data = await response.json();
        console.log('[FETCH] Dados recebidos:', data);

        if (data.success) {
            // Atualizar elementos financeiros
            const totalEl = document.getElementById('viva-saude-financeiro-total');
            const updateEl = document.getElementById('viva-saude-financeiro-update');
            const statusEl = document.getElementById('viva-saude-financeiro-status');
            
            // Exibir detalhes dos meses (UPAs, Valores, Datas, Situações) - Para o contrato UPAS
            if (data.valores && data.valores.meses) {
                // Atualizar seção do contrato UPAS se estiver visível
                const financeiroUPASContent = document.getElementById('financeiro-UPAS-content');
                const detalhesMesesContainer = document.getElementById('viva-saude-financeiro-detalhes-meses');
                
                if (Object.keys(data.valores.meses).length > 0) {
                    let htmlDetalhes = '<div style="margin-bottom: 30px;">';
                    htmlDetalhes += '<h3 style="font-size: 18px; font-weight: 600; color: rgba(255,255,255,0.9); margin-bottom: 20px; border-bottom: 2px solid rgba(255,255,255,0.1); padding-bottom: 10px;">Detalhes por Mês - UPAS</h3>';
                    
                    // Ordenar meses (Janeiro a Dezembro)
                    const ordemMeses = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 
                                       'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
                    const mesesOrdenados = Object.keys(data.valores.meses).sort((a, b) => {
                        return ordemMeses.indexOf(a) - ordemMeses.indexOf(b);
                    });
                    
                    mesesOrdenados.forEach(mesNome => {
                        const mesData = data.valores.meses[mesNome];
                        
                        // Filtrar valores que são cabeçalhos ou vazios
                        const valoresValidos = (mesData.valores_recebidos || []).filter(item => {
                            const valor = item.valor ? item.valor.trim().toUpperCase() : '';
                            return valor && valor !== '' && valor !== 'VALOR RECEDIDO' && valor !== 'VALOR RECEBIDO';
                        });
                        
                        const datasValidas = (mesData.datas || []).filter(item => {
                            const data = item.data ? item.data.trim().toUpperCase() : '';
                            return data && data !== '' && data !== 'DATA';
                        });
                        
                        const situacoesValidas = (mesData.situacoes || []).filter(item => {
                            if (!item.situacao) return false;
                            const situacao = item.situacao.trim();
                            if (!situacao || situacao === '') return false;
                            
                            // Remover apenas "SITUAO" (com encoding incorreto)
                            // Verificar se contém caracteres de encoding incorreto e se é exatamente "SITUAO"
                            if (situacao.includes('') || situacao.includes('')) {
                                // Verificar se é exatamente "SITUAO" (sem acento, com encoding incorreto)
                                const situacaoUpper = situacao.toUpperCase();
                                // Normalizar removendo caracteres especiais para comparação
                                const situacaoNormalizada = situacaoUpper.replace(/[^A-Z0-9]/g, '');
                                if (situacaoNormalizada === 'SITUAO' || situacaoNormalizada === 'SITUACAO') {
                                    return false; // Remover apenas "SITUAO" com encoding incorreto
                                }
                                // Se contém caracteres especiais mas não é "SITUAO", manter (pode ser outro valor válido)
                            }
                            
                            return true;
                        });
                        
                        const upasValidas = (mesData.upas || []).filter(upa => {
                            return upa && upa.trim() !== '';
                        });
                        
                        const valoresNFValidos = (mesData.valores_nf || []).filter(item => {
                            const valor = item.valor ? item.valor.trim() : '';
                            if (!valor || valor === '') return false;
                            // Remover cabeçalho "VALOR NF." e variações
                            const valorUpper = valor.toUpperCase().trim();
                            const valoresInvalidos = ['VALOR NF', 'VALOR NF.', 'VALORNF', 'VALORNF.'];
                            return !valoresInvalidos.includes(valorUpper);
                        });
                        
                        // Determinar número máximo de linhas
                        const maxLinhas = Math.max(
                            valoresValidos.length,
                            valoresNFValidos.length,
                            datasValidas.length,
                            situacoesValidas.length,
                            upasValidas.length
                        );
                        
                        if (maxLinhas > 0) {
                            htmlDetalhes += `
                                <div style="background: rgba(255,255,255,0.05); padding: 20px; border-radius: 12px; margin-bottom: 20px; border-left: 4px solid #3b82f6;">
                                    <div style="font-size: 20px; font-weight: 700; color: #3b82f6; margin-bottom: 20px; text-transform: capitalize;">
                                        ${mesNome.charAt(0) + mesNome.slice(1).toLowerCase()}
                                    </div>
                                    
                                    <div class="table-container">
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>UPAs</th>
                                                    <th>VALOR NF</th>
                                                    <th>Valor Recebido</th>
                                                    <th>Data</th>
                                                    <th>Situação</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                            `;
                            
                            // Criar linhas da tabela
                            for (let i = 0; i < maxLinhas; i++) {
                                const upa = upasValidas[i] || '';
                                const valorNF = valoresNFValidos[i] ? valoresNFValidos[i].valor : '';
                                const valor = valoresValidos[i] ? valoresValidos[i].valor : '';
                                const data = datasValidas[i] ? datasValidas[i].data : '';
                                let situacao = situacoesValidas[i] ? situacoesValidas[i].situacao.trim() : '';
                                
                                // Verificação final: remover apenas "SITUAO" com encoding incorreto
                                if (situacao) {
                                    // Verificar se contém caracteres de encoding incorreto
                                    if (situacao.includes('') || situacao.includes('')) {
                                        // Verificar se é exatamente "SITUAO" (sem acento, com encoding incorreto)
                                        const situacaoUpper = situacao.toUpperCase();
                                        const situacaoNormalizada = situacaoUpper.replace(/[^A-Z0-9]/g, '');
                                        if (situacaoNormalizada === 'SITUAO' || situacaoNormalizada === 'SITUACAO') {
                                            situacao = ''; // Remover apenas "SITUAO" com encoding incorreto
                                        }
                                        // Se contém caracteres especiais mas não é "SITUAO", manter (pode ser outro valor válido)
                                    }
                                }
                                
                                // Determinar cor da situação
                                let corSituacao = '#f59e0b'; // Amarelo padrão
                                if (situacao) {
                                    const situacaoUpper = situacao.toUpperCase();
                                    if (situacaoUpper.includes('PAGO') || situacaoUpper.includes('OK') || situacaoUpper.includes('CONCLUÍDO')) {
                                        corSituacao = '#10b981'; // Verde
                                    } else if (situacaoUpper.includes('PENDENTE') || situacaoUpper.includes('AGUARDANDO')) {
                                        corSituacao = '#f59e0b'; // Amarelo
                                    } else if (situacaoUpper.includes('CANCELADO') || situacaoUpper.includes('ERRO')) {
                                        corSituacao = '#ef4444'; // Vermelho
                                    }
                                }
                                
                                htmlDetalhes += `
                                    <tr class="${i % 2 === 0 ? 'even-row' : 'odd-row'}">
                                        <td style="color: rgba(255,255,255,0.9);">
                                            ${upa ? escapeHtml(upa) : 'TOTAL'}
                                        </td>
                                        <td style="color: #f59e0b; font-weight: 600;">
                                            ${valorNF ? escapeHtml(valorNF) : '-'}
                                        </td>
                                        <td style="color: #10b981; font-weight: 600;">
                                            ${valor ? escapeHtml(valor) : '-'}
                                        </td>
                                        <td style="color: #a78bfa;">
                                            ${data ? escapeHtml(data) : '-'}
                                        </td>
                                        <td>
                                            ${situacao ? `
                                                <span class="situacao-badge" style="background: rgba(${corSituacao === '#10b981' ? '16, 185, 129' : corSituacao === '#ef4444' ? '239, 68, 68' : '245, 158, 11'}, 0.2); padding: 4px 10px; border-radius: 4px; font-size: 12px; color: ${corSituacao}; border: 1px solid rgba(${corSituacao === '#10b981' ? '16, 185, 129' : corSituacao === '#ef4444' ? '239, 68, 68' : '245, 158, 11'}, 0.3);">
                                                    ${escapeHtml(situacao)}
                                                </span>
                                            ` : '-'}
                                        </td>
                                    </tr>
                                `;
                            }
                            
                            htmlDetalhes += `
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            `;
                        }
                    });
                    
                    htmlDetalhes += '</div>';
                    
                    // Atualizar container de detalhes
                    if (detalhesMesesContainer) {
                        detalhesMesesContainer.innerHTML = htmlDetalhes;
                    }
                    
                    // Atualizar seção do contrato UPAS se existir e estiver visível
                    const financeiroUPASContent = document.getElementById('financeiro-UPAS-content');
                    if (financeiroUPASContent) {
                        // Verificar se já tem resumo dos meses
                        const valoresContainer = document.getElementById('viva-saude-financeiro-valores');
                        let htmlUPAS = '';
                        
                        // Se houver resumo dos meses, adicionar primeiro
                        if (valoresContainer && valoresContainer.innerHTML) {
                            htmlUPAS = valoresContainer.innerHTML;
                        }
                        
                        // Adicionar detalhes dos meses depois
                        htmlUPAS += htmlDetalhes;
                        
                        financeiroUPASContent.innerHTML = htmlUPAS;
                    }
                } else {
                    if (detalhesMesesContainer) {
                        detalhesMesesContainer.innerHTML = '';
                    }
                    if (financeiroUPASContent) {
                        financeiroUPASContent.innerHTML = '<p style="color: rgba(255,255,255,0.5);">Nenhum dado disponível.</p>';
                    }
                }
            }
            
            // Exibir valores extraídos do CSV
            if (data.valores) {
                const valoresContainer = document.getElementById('viva-saude-financeiro-valores');
                const financeiroUPASContent = document.getElementById('financeiro-UPAS-content');
                
                if (valoresContainer) {
                    // Layout em coluna (um abaixo do outro)
                    let html = '<div style="display: flex; flex-direction: column; gap: 15px; margin-top: 20px;">';
                    
                    // Função para formatar valor monetário
                    const formatarValor = (valor) => {
                        // Se for número, formatar diretamente
                        if (typeof valor === 'number') {
                            return new Intl.NumberFormat('pt-BR', {
                                style: 'currency',
                                currency: 'BRL'
                            }).format(valor);
                        }
                        
                        // Se for string, processar
                        if (!valor || (typeof valor === 'string' && (valor.trim() === '' || valor.trim() === 'R$'))) {
                            return 'R$ 0,00';
                        }
                        
                        // Remover "R$" se já tiver e limpar espaços
                        let valorLimpo = valor.toString().replace(/R\$\s*/g, '').trim();
                        // Se estiver vazio após limpar, retornar zero
                        if (!valorLimpo || valorLimpo === '') {
                            return 'R$ 0,00';
                        }
                        // Tentar formatar como número
                        try {
                            // Remover pontos e substituir vírgula por ponto para parseFloat
                            let numero = valorLimpo.replace(/\./g, '').replace(',', '.');
                            numero = parseFloat(numero);
                            if (isNaN(numero)) {
                                return valor; // Retornar original se não for número
                            }
                            return new Intl.NumberFormat('pt-BR', {
                                style: 'currency',
                                currency: 'BRL'
                            }).format(numero);
                        } catch (e) {
                            return valor; // Retornar original se houver erro
                        }
                    };
                    
                    // Função auxiliar para converter valor para número
                    const converterValor = (valor) => {
                        if (!valor) return 0;
                        const valorStr = String(valor).trim();
                        // Remover R$, pontos, espaços e converter vírgula para ponto
                        const valorLimpo = valorStr.replace(/R\$\s*/g, '').replace(/\./g, '').replace(',', '.').trim();
                        try {
                            return parseFloat(valorLimpo) || 0;
                        } catch {
                            return 0;
                        }
                    };
                    
                    // Função para calcular valor total de um mês baseado na situação
                    const calcularValorMes = (mesNome) => {
                        const mesData = data.valores.meses?.[mesNome];
                        if (!mesData) return { valor: 0, negativo: false };
                        
                        // Filtrar valores recebidos (remover cabeçalhos) - mesma lógica da tabela
                        const valoresValidos = (mesData.valores_recebidos || []).filter(item => {
                            if (!item.valor) return false;
                            const valor = item.valor.trim().toUpperCase();
                            return valor && valor !== '' && valor !== 'VALOR RECEDIDO' && valor !== 'VALOR RECEBIDO';
                        });
                        
                        // Filtrar situações (remover cabeçalhos e inválidas) - mesma lógica da tabela
                        const situacoesValidas = (mesData.situacoes || []).filter(item => {
                            if (!item.situacao) return false;
                            const situacao = item.situacao.trim();
                            if (!situacao || situacao === '') return false;
                            
                            // Remover "SITUAO" com encoding incorreto
                            if (situacao.includes('') || situacao.includes('')) {
                                const situacaoUpper = situacao.toUpperCase();
                                const situacaoNormalizada = situacaoUpper.replace(/[^A-Z0-9]/g, '');
                                if (situacaoNormalizada === 'SITUAO' || situacaoNormalizada === 'SITUACAO') {
                                    return false; // Remover apenas "SITUAO" com encoding incorreto
                                }
                                // Se contém caracteres especiais mas não é "SITUAO", manter (pode ser outro valor válido)
                            }
                            
                            return true;
                        });
                        
                        let total = 0;
                        const valoresProcessados = [];
                        
                        // Usar correspondência por índice do array (mesma lógica da tabela)
                        // A tabela usa valoresValidos[i] e situacoesValidas[i] para correspondência
                        const maxLinhas = Math.max(valoresValidos.length, situacoesValidas.length);
                        
                        for (let i = 0; i < maxLinhas; i++) {
                            const itemValor = valoresValidos[i];
                            const itemSituacao = situacoesValidas[i];
                            
                            if (!itemSituacao || !itemSituacao.situacao) continue;
                            
                            let situacao = itemSituacao.situacao.trim();
                            
                            // Verificação final: remover apenas "SITUAO" com encoding incorreto (mesma lógica da tabela)
                            if (situacao) {
                                if (situacao.includes('') || situacao.includes('')) {
                                    const situacaoUpper = situacao.toUpperCase();
                                    const situacaoNormalizada = situacaoUpper.replace(/[^A-Z0-9]/g, '');
                                    if (situacaoNormalizada === 'SITUAO' || situacaoNormalizada === 'SITUACAO') {
                                        situacao = ''; // Remover apenas "SITUAO" com encoding incorreto
                                    }
                                }
                            }
                            
                            const situacaoUpper = situacao ? situacao.toUpperCase() : '';
                            
                            // Se tem situação e não é "OK", processar
                            if (situacaoUpper && situacaoUpper !== 'OK') {
                                // Verificar se a situação contém um valor monetário
                                const valorMonetarioNaSituacao = converterValor(situacao);
                                
                                if (valorMonetarioNaSituacao > 0) {
                                    // Se a situação contém um valor monetário, usar esse valor
                                    total += valorMonetarioNaSituacao;
                                    valoresProcessados.push({
                                        indice: i,
                                        linha: itemSituacao.linha,
                                        valor: valorMonetarioNaSituacao,
                                        situacao: situacaoUpper,
                                        valorOriginal: situacao,
                                        origem: 'situacao'
                                    });
                                } else if (itemValor) {
                                    // Se não tem valor monetário na situação, usar o valor recebido
                                    const valor = converterValor(itemValor.valor);
                                    if (valor > 0) {
                                        total += valor;
                                        valoresProcessados.push({
                                            indice: i,
                                            linha: itemValor.linha,
                                            valor: valor,
                                            situacao: situacaoUpper,
                                            valorOriginal: itemValor.valor,
                                            origem: 'valor_recebido'
                                        });
                                    }
                                }
                            }
                        }
                        
                        // Se há valores em aberto (total > 0), retornar como negativo
                        // Valores em aberto são sempre negativos
                        const resultado = {
                            valor: total > 0 ? -total : 0, // Tornar negativo se há valores
                            negativo: total > 0 // Se há valores somados, são negativos (em aberto)
                        };
                        
                        // Debug detalhado
                        console.log(`[DEBUG ${mesNome}]`, {
                            totalCalculado: total,
                            resultado: resultado,
                            valoresProcessados: valoresProcessados,
                            totalValoresValidos: valoresValidos.length,
                            totalSituacoesValidas: situacoesValidas.length,
                            maxLinhas: maxLinhas
                        });
                        
                        return resultado;
                    };
                    
                    // Calcular valores dos meses a partir da situação
                    const setembroCalc = calcularValorMes('SETEMBRO');
                    const outubroCalc = calcularValorMes('OUTUBRO');
                    const novembroCalc = calcularValorMes('NOVEMBRO');
                    
                    // Total já calcula somando os valores (que já vêm negativos se houver valores em aberto)
                    // Removido totalCalc separado - será calculado diretamente abaixo
                    
                    // SETEMBRO - sempre exibir (0 se não houver valores em aberto)
                    const setembroNegativo = setembroCalc.negativo;
                    const setembroValorAbsoluto = Math.abs(setembroCalc.valor); // Valor absoluto (sem sinal de menos)
                    const setembroFormatado = formatarValor(setembroValorAbsoluto);
                    const corValorSetembro = setembroNegativo ? '#ef4444' : '#10b981';
                    const corBordaSetembro = setembroNegativo ? '#ef4444' : 'transparent';
                    html += `
                        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; border-left: 3px solid ${corBordaSetembro};">
                            <div style="font-size: 14px; color: rgba(255,255,255,0.7); margin-bottom: 8px;">SETEMBRO</div>
                            <div style="font-size: 20px; font-weight: 600; color: ${corValorSetembro};">
                                ${setembroFormatado}
                            </div>
                        </div>
                    `;
                    
                    // OUTUBRO - sempre exibir (0 se não houver valores em aberto)
                    const outubroNegativo = outubroCalc.negativo;
                    const outubroValorAbsoluto = Math.abs(outubroCalc.valor); // Valor absoluto (sem sinal de menos)
                    const outubroFormatado = formatarValor(outubroValorAbsoluto);
                    const corValorOutubro = outubroNegativo ? '#ef4444' : '#10b981';
                    const corBordaOutubro = outubroNegativo ? '#ef4444' : 'transparent';
                    html += `
                        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; border-left: 3px solid ${corBordaOutubro};">
                            <div style="font-size: 14px; color: rgba(255,255,255,0.7); margin-bottom: 8px;">OUTUBRO</div>
                            <div style="font-size: 20px; font-weight: 600; color: ${corValorOutubro};">
                                ${outubroFormatado}
                            </div>
                        </div>
                    `;
                    
                    // NOVEMBRO - sempre exibir (0 se não houver valores em aberto)
                    const novembroNegativo = novembroCalc.negativo;
                    const novembroValorAbsoluto = Math.abs(novembroCalc.valor); // Valor absoluto (sem sinal de menos)
                    const novembroFormatado = formatarValor(novembroValorAbsoluto);
                    const corValorNovembro = novembroNegativo ? '#ef4444' : '#10b981';
                    const corBordaNovembro = novembroNegativo ? '#ef4444' : 'transparent';
                    html += `
                        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; border-left: 3px solid ${corBordaNovembro};">
                            <div style="font-size: 14px; color: rgba(255,255,255,0.7); margin-bottom: 8px;">NOVEMBRO</div>
                            <div style="font-size: 20px; font-weight: 600; color: ${corValorNovembro};">
                                ${novembroFormatado}
                            </div>
                        </div>
                    `;
                    
                    // TOTAL - sempre exibir (0 se não houver valores em aberto)
                    const totalValor = setembroCalc.valor + outubroCalc.valor + novembroCalc.valor;
                    const totalNegativo = totalValor < 0; // Negativo se há valores em aberto
                    const totalValorAbsoluto = Math.abs(totalValor); // Valor absoluto (sem sinal de menos)
                    const totalFormatado = formatarValor(totalValorAbsoluto);
                    const corValorTotal = totalNegativo ? '#ef4444' : '#10b981';
                    const corBordaTotal = totalNegativo ? '#ef4444' : '#10b981';
                    html += `
                        <div style="background: ${totalNegativo ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)'}; padding: 15px; border-radius: 8px; border: 2px solid ${corBordaTotal};">
                            <div style="font-size: 14px; color: rgba(255,255,255,0.7); margin-bottom: 8px; font-weight: 600;">TOTAL EM ABERTO VIVA RIO</div>
                            <div style="font-size: 24px; font-weight: 700; color: ${corValorTotal};">
                                ${totalFormatado}
                            </div>
                        </div>
                    `;
                    
                    html += '</div>';
                    valoresContainer.innerHTML = html;
                    
                    // Também atualizar na seção do contrato UPAS se estiver visível
                    const financeiroUPASContent = document.getElementById('financeiro-UPAS-content');
                    if (financeiroUPASContent) {
                        // Verificar se já tem conteúdo (detalhes dos meses)
                        const detalhesMesesContainer = document.getElementById('viva-saude-financeiro-detalhes-meses');
                        let htmlUPAS = html;
                        
                        // Se houver detalhes dos meses, adicionar depois do resumo
                        if (detalhesMesesContainer && detalhesMesesContainer.innerHTML) {
                            htmlUPAS += detalhesMesesContainer.innerHTML;
                        }
                        
                        financeiroUPASContent.innerHTML = htmlUPAS;
                    }
                }
            }
            
            // Atualizar dados por mês se disponível (manter compatibilidade)
            const dadosPorMesContainer = document.getElementById('viva-saude-financeiro-meses');
            if (dadosPorMesContainer && data.dadosPorMes) {
                const meses = Object.values(data.dadosPorMes).sort((a, b) => a.mes - b.mes);
                let htmlMeses = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 20px;">';
                
                meses.forEach(mesData => {
                    const valorFormatado = new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL'
                    }).format(mesData.total);
                    
                    htmlMeses += `
                        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px;">
                            <div style="font-size: 12px; color: rgba(255,255,255,0.6); margin-bottom: 8px; text-transform: capitalize;">${mesData.mesNome}</div>
                            <div style="font-size: 20px; font-weight: 600; color: #10b981;">${valorFormatado}</div>
                            <div style="font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 5px;">${mesData.valores.length} item(ns)</div>
                        </div>
                    `;
                });
                
                htmlMeses += '</div>';
                dadosPorMesContainer.innerHTML = htmlMeses;
            }
            
            if (totalEl) {
                // Formatar valor total (usar valor do CSV se disponível, senão usar valorTotal)
                let valorTotal = data.valores?.total || data.valorTotal || '0';
                
                // Limpar e formatar valor
                if (typeof valorTotal === 'string') {
                    valorTotal = valorTotal.replace(/R\$\s*/g, '').trim();
                    if (valorTotal === '' || valorTotal === 'R$') {
                        valorTotal = '0';
                    }
                    // Converter para número
                    valorTotal = parseFloat(valorTotal.replace(/\./g, '').replace(',', '.')) || 0;
                }
                
                const valorFormatado = new Intl.NumberFormat('pt-BR', {
                    style: 'currency',
                    currency: 'BRL'
                }).format(valorTotal);
                totalEl.textContent = valorFormatado;
            }
            
            if (updateEl) {
                if (data.lastUpdate) {
                    const updateDate = new Date(data.lastUpdate);
                    updateEl.textContent = updateDate.toLocaleString('pt-BR');
                } else {
                    updateEl.textContent = new Date().toLocaleString('pt-BR');
                }
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
        console.error('[FRONTEND] Tipo de erro:', error.name);
        console.error('[FRONTEND] Mensagem:', error.message);
        console.error('[FRONTEND] URL tentada:', `${API_BASE_URL}/financeiro/viva-saude`);
        
        // Verificar se é erro de CORS
        if (error.message.includes('CORS') || error.message.includes('Failed to fetch') || error.name === 'TypeError') {
            console.error('[FRONTEND] ⚠️ Possível erro de CORS. Verifique:');
            console.error('[FRONTEND] 1. URL do backend está correta?', API_BASE_URL);
            console.error('[FRONTEND] 2. Backend está rodando?');
            console.error('[FRONTEND] 3. CORS está configurado no backend?');
        }
        
        const statusEl = document.getElementById('viva-saude-financeiro-status');
        if (statusEl) {
            statusEl.textContent = `Erro: ${error.message.substring(0, 30)}...`;
            statusEl.style.color = '#ef4444';
        }
    }
}

// Gerenciar Contratos Viva Saúde
function initializeContratosVivaSaude() {
    const financeiroContratosContainer = document.getElementById('viva-saude-financeiro-contratos');
    
    if (!financeiroContratosContainer) {
        console.warn('[CONTRATOS] Container não encontrado');
        return;
    }
    
    // Usar event delegation para garantir que funcione mesmo se os botões forem criados dinamicamente
    const contratosCard = document.getElementById('viva-saude-contratos-card');
    if (!contratosCard) {
        console.warn('[CONTRATOS] Card de contratos não encontrado');
        return;
    }
    
    // Função para processar clique/toque no contrato
    function handleContratoClick(e) {
        const btn = e.target.closest('.contrato-btn');
        if (!btn) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const contrato = btn.getAttribute('data-contrato');
        console.log('[CONTRATOS] Clique/toque no contrato:', contrato);
        
        // Toggle active state
        btn.classList.toggle('active');
        
        // Mostrar/ocultar seção de financeiro do contrato
        let section = document.getElementById(`financeiro-${contrato}`);
        
        if (!section) {
            // Criar seção se não existir
            section = document.createElement('div');
            section.id = `financeiro-${contrato}`;
            section.className = 'financeiro-contrato-section';
            section.innerHTML = `
                <h4 style="font-size: 16px; font-weight: 600; color: rgba(255,255,255,0.9); margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                    Financeiro - ${contrato}
                </h4>
                <div id="financeiro-${contrato}-content">
                    ${contrato === 'UPAS' ? '<p style="color: rgba(255,255,255,0.7);">Carregando dados...</p>' : '<p style="color: rgba(255,255,255,0.5);">Dados ainda não disponíveis para este contrato.</p>'}
                </div>
            `;
            financeiroContratosContainer.appendChild(section);
        }
        
        // Toggle visibility
        section.classList.toggle('active');
        
        // Se for UPAS e estiver sendo mostrado, carregar dados
        if (contrato === 'UPAS' && section.classList.contains('active')) {
            loadFinanceiroContrato('UPAS');
        }
    }
    
    // Adicionar eventos para desktop e mobile
    contratosCard.addEventListener('click', handleContratoClick);
    contratosCard.addEventListener('touchend', (e) => {
        e.preventDefault();
        handleContratoClick(e);
    });
    
    console.log('[CONTRATOS] Event listeners configurados');
}

// Carregar financeiro de um contrato específico
function loadFinanceiroContrato(contrato) {
    if (contrato !== 'UPAS') {
        // Por enquanto só temos dados do UPAS
        return;
    }
    
    const contentContainer = document.getElementById(`financeiro-${contrato}-content`);
    if (!contentContainer) return;
    
    // Se já temos dados carregados, usar eles
    const detalhesMesesContainer = document.getElementById('viva-saude-financeiro-detalhes-meses');
    const valoresContainer = document.getElementById('viva-saude-financeiro-valores');
    
    let html = '';
    
    // Adicionar resumo dos meses em aberto (se disponível)
    if (valoresContainer && valoresContainer.innerHTML) {
        html += valoresContainer.innerHTML;
    }
    
    // Adicionar detalhes dos meses (se disponível)
    if (detalhesMesesContainer && detalhesMesesContainer.innerHTML) {
        html += detalhesMesesContainer.innerHTML;
    }
    
    if (html) {
        contentContainer.innerHTML = html;
    } else {
        // Se não tem dados, buscar
        fetchFinanceiroVivaSaude();
    }
}

// Menu Mobile
function initializeMobileMenu() {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
    
    function toggleMenu() {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
        mobileMenuBtn.classList.toggle('active');
    }
    
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', toggleMenu);
    }
    
    overlay.addEventListener('click', toggleMenu);
    
    // Fechar menu ao clicar em um item
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                toggleMenu();
            }
        });
    });
    
    // Fechar menu ao redimensionar para desktop
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            mobileMenuBtn.classList.remove('active');
        }
    });
}

// Botão de Atualizar Página (limpar cache)
function initializeRefreshButton() {
    const refreshBtn = document.getElementById('refreshPageBtn');
    if (!refreshBtn) return;
    
    refreshBtn.addEventListener('click', () => {
        // Forçar atualização sem cache
        // Método 1: location.reload(true) - funciona na maioria dos navegadores
        // Método 2: Adicionar timestamp à URL e recarregar
        if (window.location.reload) {
            // Tentar reload forçado
            window.location.reload(true);
        } else {
            // Fallback: adicionar timestamp e recarregar
            const url = new URL(window.location.href);
            url.searchParams.set('_refresh', Date.now());
            window.location.href = url.toString();
        }
    });
    
    // Também adicionar suporte a touch para mobile
    refreshBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (window.location.reload) {
            window.location.reload(true);
        } else {
            const url = new URL(window.location.href);
            url.searchParams.set('_refresh', Date.now());
            window.location.href = url.toString();
        }
    });
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    initializeMobileMenu();
    initializeRefreshButton();
    initializeContratosVivaSaude();
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
    
    // Verificar todos os logins
    checkAllLogins();
    
    // Buscar dados financeiros do Viva Saúde (Google Sheets - pausado temporariamente)
    // fetchFinanceiroVivaSaude();
    
    // Iniciar auto-refresh automático a cada 24 horas
    startAutoRefresh();
});

// Verificar saúde do servidor
async function checkServerHealth() {
    try {
        const url = `${API_BASE_URL}/health`;
        console.log('[HEALTH] Verificando saúde do servidor:', url);
        
        const response = await fetchWithNgrokHeaders(url);
        
        if (response.ok) {
            const data = await response.json();
            console.log('[HEALTH] Servidor OK:', data);
            addLog('Servidor conectado com sucesso', 'success');
        } else {
            console.error('[HEALTH] Servidor respondeu com erro:', response.status, response.statusText);
            addLog('Servidor não está respondendo corretamente', 'warning');
        }
    } catch (error) {
        console.error('[HEALTH] Erro ao conectar:', error);
        console.error('[HEALTH] URL tentada:', `${API_BASE_URL}/health`);
        
        // Se for erro do ngrok, mostrar mensagem mais clara
        if (error.message.includes('ngrok') || error.message.includes('HTML')) {
            addLog('⚠️ ngrok bloqueando requisições. Acesse a URL manualmente uma vez no navegador.', 'warning');
        } else {
            addLog(`Erro ao conectar com o servidor: ${error.message}`, 'error');
        }
    }
}

// Event listeners
function initializeEventListeners() {
    // Botões de refresh individuais (se ainda existirem)
    // TEMPORÁRIO: Desabilitado para focar apenas no Google Sheets
    document.querySelectorAll('.refresh-btn-modern').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const site = e.target.closest('.refresh-btn-modern').dataset.site;
            if (site) {
                checkLogin(site);
                
                // Buscar dados financeiros apenas para Viva Saúde (Google Sheets - pausado temporariamente)
                // if (site === 'viva-saude') {
                //     fetchFinanceiroVivaSaude();
                // }
            }
        });
    });
}

// Verificar todos os logins
async function checkAllLogins() {
    addLog('Verificando todos os sistemas...', 'info');
    
    // Verificar todos os processos
    await Promise.all([
        checkLogin('viva-saude'),
        (async () => {
            await checkLogin('coop-vitta');
            await checkLogin('delta');
        })()
    ]);
    
    // Buscar dados financeiros do Google Sheets
    addLog('Buscando dados financeiros do Google Sheets...', 'info');
    fetchFinanceiroVivaSaude();
    
    addLog('Verificação concluída', 'success');
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
        const url = `${API_BASE_URL}${system.apiEndpoint}`;
        console.log(`[LOGIN] Verificando login ${systemKey}:`, url);
        
        const response = await fetchWithNgrokHeaders(url, {
            method: 'POST'
        });

        if (!response.ok) {
            console.error(`[LOGIN] Erro na resposta para ${systemKey}:`, response.status, response.statusText);
            const errorText = await response.text();
            console.error(`[LOGIN] Resposta de erro:`, errorText);
        }

        const data = await response.json();
        console.log(`[LOGIN] Resposta para ${systemKey}:`, data);
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
        addLog('Auto-refresh: Atualizando todos os sistemas...', 'info');
        checkAllLogins();
        
        // Buscar dados financeiros do Viva Saúde (Google Sheets - pausado temporariamente)
        // fetchFinanceiroVivaSaude();
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
                
                if (systemCard) {
                    systemCard.style.display = 'block';
                    systemCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                
                // Nota: O card de contratos agora está dentro do card principal, não precisa ser controlado separadamente
                
                if (financeiroCard) {
                    financeiroCard.style.display = 'block';
                    
                    // Se for Viva Saúde, buscar dados financeiros quando o card for exibido
                    // (Google Sheets - pausado temporariamente)
                    // if (system === 'viva-saude' || system === 'geral') {
                    //     fetchFinanceiroVivaSaude();
                    // }
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
