#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script Python para extrair dados do Google Sheets
Foco: Extrair dados financeiros da planilha
Usa Selenium para acessar a planilha pública
"""

import json
import sys
import time
import csv
import io
import os
import urllib.request
import urllib.parse
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from webdriver_manager.chrome import ChromeDriverManager
import re

def setup_driver():
    """Configurar o driver do Chrome"""
    chrome_options = Options()
    chrome_options.add_argument('--headless')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    chrome_options.add_argument('--disable-gpu')
    chrome_options.add_argument('--window-size=1920,1080')
    chrome_options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    chrome_options.add_argument('--disable-blink-features=AutomationControlled')
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option('useAutomationExtension', False)
    
    # Tentar encontrar o Chrome em locais comuns no Windows
    chrome_paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Users\{}\AppData\Local\Google\Chrome\Application\chrome.exe".format(os.getenv('USERNAME', '')),
        r"C:\Users\{}\AppData\Local\Google\Chrome\Application\chrome.exe".format(os.getenv('USERPROFILE', '').split('\\')[-1] if os.getenv('USERPROFILE') else ''),
    ]
    
    # Também tentar buscar no registro do Windows ou variáveis de ambiente
    import shutil
    chrome_binary = shutil.which("chrome") or shutil.which("google-chrome") or shutil.which("chromium")
    
    if not chrome_binary:
        for path in chrome_paths:
            if os.path.exists(path):
                chrome_binary = path
                break
    
    if chrome_binary:
        chrome_options.binary_location = chrome_binary
        print(f"[GOOGLE SHEETS] Chrome encontrado em: {chrome_binary}", file=sys.stderr)
    else:
        print("[GOOGLE SHEETS] ⚠️ Chrome não encontrado nos locais padrão. Tentando sem especificar caminho...", file=sys.stderr)
    
    try:
        # Usar webdriver-manager para gerenciar automaticamente o ChromeDriver
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)
        
        # Executar script para ocultar webdriver
        driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {
            'source': '''
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined
                })
            '''
        })
        
        return driver
    except Exception as e:
        print(f"Erro ao configurar driver: {e}", file=sys.stderr)
        # Tentar sem webdriver-manager como fallback
        try:
            driver = webdriver.Chrome(options=chrome_options)
            return driver
        except Exception as e2:
            print(f"Erro ao configurar driver (fallback): {e2}", file=sys.stderr)
            return None

def extract_financial_data(driver, url):
    """Extrair dados financeiros do Google Sheets"""
    result = {
        "success": False,
        "message": "",
        "valores": {
            "vivaRioEmAberto": None,
            "setembro": None,
            "outubro": None,
            "novembro": None,
            "total": None,
            "meses": {}  # Dados organizados por mês
        },
        "error": None
    }
    
    try:
        print(f"[GOOGLE SHEETS] Acessando planilha: {url}", file=sys.stderr)
        driver.get(url)
        
        # Aguardar página carregar
        print("[GOOGLE SHEETS] Aguardando página carregar...", file=sys.stderr)
        time.sleep(5)
        
        # Verificar se há erro de permissão
        page_text = driver.find_element(By.TAG_NAME, "body").text
        if "permissão" in page_text.lower() or "permission" in page_text.lower() or "acesso negado" in page_text.lower():
            result["error"] = "Problema de permissão detectado"
            result["message"] = "A planilha requer permissão de acesso"
            return result
        
        # Aguardar planilha renderizar
        print("[GOOGLE SHEETS] Aguardando planilha renderizar...", file=sys.stderr)
        time.sleep(5)
        
        # Tentar encontrar a aba "RELATÓRIO CYLLA"
        print("[GOOGLE SHEETS] Procurando aba 'RELATÓRIO CYLLA'...", file=sys.stderr)
        try:
            # Procurar por abas (sheets tabs)
            aba_encontrada = False
            wait = WebDriverWait(driver, 10)
            
            # Tentar diferentes seletores para encontrar as abas
            aba_selectors = [
                "//div[contains(@class, 'sheet-tab') and contains(text(), 'RELATÓRIO CYLLA')]",
                "//div[contains(@class, 'docs-sheet-tab') and contains(text(), 'RELATÓRIO CYLLA')]",
                "//div[@role='tab' and contains(text(), 'RELATÓRIO CYLLA')]",
                "//span[contains(text(), 'RELATÓRIO CYLLA')]"
            ]
            
            for selector in aba_selectors:
                try:
                    aba_element = wait.until(EC.presence_of_element_located((By.XPATH, selector)))
                    if aba_element:
                        print(f"[GOOGLE SHEETS] Aba encontrada com seletor: {selector}", file=sys.stderr)
                        aba_element.click()
                        aba_encontrada = True
                        time.sleep(3)
                        break
                except:
                    continue
            
            if not aba_encontrada:
                print("[GOOGLE SHEETS] ⚠️ Aba 'RELATÓRIO CYLLA' não encontrada, tentando continuar...", file=sys.stderr)
        except Exception as e:
            print(f"[GOOGLE SHEETS] Erro ao procurar aba: {e}", file=sys.stderr)
        
        # Aguardar mais um pouco para garantir que a aba carregou
        time.sleep(5)
        
        # Método 0: Tentar obter CSV diretamente via URL de exportação (mais confiável)
        print("[GOOGLE SHEETS] Tentando obter CSV via URL de exportação...", file=sys.stderr)
        csv_content = None
        
        try:
            # Tentar diferentes GIDs e formatos
            spreadsheet_id = "10vaVp0DcgOfjWW3_vat7M8mRVvMiBdtU9kAlDmjEioc"
            
            # Tentar obter o GID da aba atual via JavaScript
            try:
                gid = driver.execute_script("""
                    // Tentar encontrar o GID da aba ativa
                    const tabs = document.querySelectorAll('[role="tab"], [data-sheet-id], .docs-sheet-tab');
                    for (let tab of tabs) {
                        if (tab.getAttribute('aria-selected') === 'true' || 
                            tab.classList.contains('docs-sheet-active') ||
                            tab.classList.contains('docs-sheet-tab-active')) {
                            const sheetId = tab.getAttribute('data-sheet-id') || 
                                          tab.getAttribute('data-sheetid') ||
                                          tab.getAttribute('data-gid');
                            if (sheetId) return sheetId;
                        }
                    }
                    // Tentar encontrar na URL
                    const urlMatch = window.location.href.match(/[#&]gid=([0-9]+)/);
                    if (urlMatch) return urlMatch[1];
                    return '0';
                """)
                print(f"[GOOGLE SHEETS] GID encontrado via JS: {gid}", file=sys.stderr)
            except:
                gid = '0'
                print("[GOOGLE SHEETS] Não foi possível obter GID via JS, usando '0'", file=sys.stderr)
            
            # Tentar diferentes URLs de exportação e GIDs
            gids_to_try = [gid, '0', '1', '2', '3']
            export_urls = []
            
            for g in gids_to_try:
                export_urls.extend([
                    f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/export?format=csv&gid={g}",
                    f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/gviz/tq?tqx=out:csv&gid={g}",
                ])
            
            # Adicionar URL sem GID
            export_urls.append(f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/export?format=csv")
            
            for export_url in export_urls:
                try:
                    print(f"[GOOGLE SHEETS] Tentando URL: {export_url}", file=sys.stderr)
                    # Usar urllib para fazer requisição HTTP direta
                    req = urllib.request.Request(export_url)
                    req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
                    
                    response = urllib.request.urlopen(req, timeout=15)
                    csv_data = response.read().decode('utf-8')
                    
                    # Verificar se é CSV válido (não HTML)
                    if csv_data and len(csv_data) > 50 and ',' in csv_data and not csv_data.strip().startswith('<'):
                        csv_content = csv_data
                        print(f"[GOOGLE SHEETS] ✅ CSV obtido via URL de exportação ({len(csv_data)} caracteres)", file=sys.stderr)
                        print(f"[GOOGLE SHEETS] Primeiras 200 chars do CSV: {csv_data[:200]}", file=sys.stderr)
                        break
                except Exception as e:
                    print(f"[GOOGLE SHEETS] Erro ao tentar URL {export_url}: {str(e)[:100]}", file=sys.stderr)
                    continue
                    
        except Exception as e:
            print(f"[GOOGLE SHEETS] Erro ao tentar obter CSV via URL: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
        
        # Extrair dados diretamente da página renderizada (método alternativo)
        if not csv_content:
            print("[GOOGLE SHEETS] Extraindo dados diretamente da planilha renderizada...", file=sys.stderr)
        
        try:
            # Aguardar células da planilha carregarem
            wait = WebDriverWait(driver, 15)
            print("[GOOGLE SHEETS] Aguardando planilha carregar completamente...", file=sys.stderr)
            time.sleep(8)  # Aguardar mais tempo para planilha renderizar completamente
            
            # Método 1: Tentar acessar célula A2 diretamente usando JavaScript
            print("[GOOGLE SHEETS] Tentando acessar célula A2 via JavaScript...", file=sys.stderr)
            try:
                # Usar JavaScript para acessar células do Google Sheets
                cell_data_js = driver.execute_script("""
                    // Procurar células do Google Sheets
                    const cells = [];
                    const gridCells = document.querySelectorAll('[role="gridcell"]');
                    
                    gridCells.forEach((cell, index) => {
                        const row = cell.getAttribute('data-row') || cell.getAttribute('aria-rowindex') || '';
                        const col = cell.getAttribute('data-col') || cell.getAttribute('aria-colindex') || '';
                        const text = cell.textContent || cell.innerText || '';
                        
                        if (row && col) {
                            cells.push({
                                row: parseInt(row) || 0,
                                col: parseInt(col) || 0,
                                text: text.trim(),
                                index: index
                            });
                        }
                    });
                    
                    // Procurar especificamente A2 (linha 2, coluna 1 no sistema do Google Sheets)
                    const a2_cell = Array.from(gridCells).find(cell => {
                        const row = parseInt(cell.getAttribute('data-row') || cell.getAttribute('aria-rowindex') || '0');
                        const col = parseInt(cell.getAttribute('data-col') || cell.getAttribute('aria-colindex') || '0');
                        // A2 = linha 2, coluna 1 (ou linha 1, coluna 0 em índice 0-based)
                        return (row === 2 && col === 1) || (row === 1 && col === 0);
                    });
                    
                    return {
                        cells: cells.slice(0, 100), // Primeiras 100 células
                        a2_text: a2_cell ? (a2_cell.textContent || a2_cell.innerText || '').trim() : null,
                        total_cells: gridCells.length
                    };
                """)
                
                if cell_data_js:
                    print(f"[GOOGLE SHEETS] Encontradas {cell_data_js.get('total_cells', 0)} células via JavaScript", file=sys.stderr)
                    if cell_data_js.get('a2_text'):
                        print(f"[GOOGLE SHEETS] ✅ Célula A2 encontrada via JS: '{cell_data_js['a2_text']}'", file=sys.stderr)
                    
                    # Organizar células em matriz
                    cells_list = cell_data_js.get('cells', [])
                    if cells_list:
                        matrix = {}
                        for cell_info in cells_list:
                            row = cell_info.get('row', 0)
                            col = cell_info.get('col', 0)
                            text = cell_info.get('text', '')
                            if row not in matrix:
                                matrix[row] = {}
                            matrix[row][col] = text
                        
                        # Converter para CSV
                        if matrix:
                            max_row = max(matrix.keys(), default=0)
                            max_col = max([max(row.keys(), default=0) for row in matrix.values()], default=0) if matrix else 0
                            
                            csv_rows = []
                            for row_idx in range(max_row + 1):
                                if row_idx in matrix:
                                    csv_row = []
                                    for col_idx in range(max_col + 1):
                                        csv_row.append(matrix[row_idx].get(col_idx, ""))
                                    csv_rows.append(",".join(csv_row))
                            
                            if csv_rows:
                                csv_content = "\n".join(csv_rows)
                                print(f"[GOOGLE SHEETS] ✅ Dados extraídos via JavaScript: {len(csv_rows)} linhas", file=sys.stderr)
                
            except Exception as e:
                print(f"[GOOGLE SHEETS] Erro ao acessar células via JavaScript: {e}", file=sys.stderr)
            
            # Método 2: Tentar acessar célula A2 diretamente usando seletores
            if not csv_content:
                print("[GOOGLE SHEETS] Tentando acessar célula A2 via seletores CSS...", file=sys.stderr)
                try:
                    # Procurar células usando diferentes métodos
                    # Google Sheets usa atributos data-row e data-col
                    cell_a2 = None
                    
                    # Tentar encontrar célula na linha 1 (índice 0) e coluna 0 (A)
                    cell_selectors = [
                        "[data-row='1'][data-col='0']",
                        "[data-row='1'][data-col='1']",  # Às vezes começa em 1
                        "[aria-rowindex='2'][aria-colindex='1']",  # A2 = linha 2, coluna 1
                        "[aria-rowindex='2'][aria-colindex='2']",
                    ]
                    
                    for selector in cell_selectors:
                        try:
                            cells = driver.find_elements(By.CSS_SELECTOR, selector)
                            if cells:
                                cell_a2 = cells[0]
                                print(f"[GOOGLE SHEETS] Célula A2 encontrada com seletor: {selector}", file=sys.stderr)
                                break
                        except:
                            continue
                    
                    # Se não encontrou, tentar método alternativo: procurar todas as células e filtrar
                    if not cell_a2:
                        print("[GOOGLE SHEETS] Procurando todas as células e organizando...", file=sys.stderr)
                        all_cells = driver.find_elements(By.CSS_SELECTOR, "[role='gridcell']")
                        
                        if all_cells:
                            print(f"[GOOGLE SHEETS] Encontradas {len(all_cells)} células", file=sys.stderr)
                            
                            # Organizar células em matriz
                            matrix = {}
                            for cell in all_cells:
                                try:
                                    # Tentar obter coordenadas
                                    row_attr = cell.get_attribute("data-row") or cell.get_attribute("aria-rowindex")
                                    col_attr = cell.get_attribute("data-col") or cell.get_attribute("aria-colindex")
                                    
                                    if row_attr and col_attr:
                                        # Converter para índices (pode começar em 0 ou 1)
                                        try:
                                            row_idx = int(row_attr) - 1  # Ajustar para índice 0-based
                                            col_idx = int(col_attr) - 1
                                            
                                            text = cell.text.strip()
                                            if row_idx not in matrix:
                                                matrix[row_idx] = {}
                                            matrix[row_idx][col_idx] = text
                                            
                                            # Se for A2 (linha 1, coluna 0 no índice 0-based)
                                            if row_idx == 1 and col_idx == 0:
                                                print(f"[GOOGLE SHEETS] ✅ Célula A2 encontrada: '{text}'", file=sys.stderr)
                                        except ValueError:
                                            continue
                                except:
                                    continue
                            
                            # Se temos uma matriz, converter para CSV
                            if matrix:
                                max_row = max(matrix.keys(), default=0)
                                max_col = max([max(row.keys(), default=0) for row in matrix.values()], default=0)
                                
                                csv_rows = []
                                for row_idx in range(max_row + 1):
                                    if row_idx in matrix:
                                        csv_row = []
                                        for col_idx in range(max_col + 1):
                                            csv_row.append(matrix[row_idx].get(col_idx, ""))
                                        csv_rows.append(",".join(csv_row))
                                
                                if csv_rows:
                                    csv_content = "\n".join(csv_rows)
                                    print(f"[GOOGLE SHEETS] ✅ Dados extraídos da matriz: {len(csv_rows)} linhas", file=sys.stderr)
                
                except Exception as e:
                    print(f"[GOOGLE SHEETS] Erro ao acessar célula A2: {e}", file=sys.stderr)
            
            # Método 2: Se não conseguiu, tentar extrair texto completo e processar
            if not csv_content:
                print("[GOOGLE SHEETS] Tentando método alternativo: extrair texto completo...", file=sys.stderr)
                try:
                    # Focar na área da planilha
                    sheet_container = driver.find_element(By.CSS_SELECTOR, "[role='grid'], [id*='grid'], .kix-appview-editor")
                    page_text = sheet_container.text if sheet_container else driver.find_element(By.TAG_NAME, "body").text
                    
                    print(f"[GOOGLE SHEETS] Texto extraído (primeiros 500 chars): {page_text[:500]}", file=sys.stderr)
                    
                    # Procurar por padrões específicos no texto
                    if "VIVA RIO" in page_text.upper() or "SETEMBRO" in page_text.upper():
                        print("[GOOGLE SHEETS] Texto relevante encontrado, processando...", file=sys.stderr)
                        # Dividir em linhas e tentar identificar estrutura
                        lines = page_text.split("\n")
                        csv_rows = []
                        for line in lines:
                            line_clean = line.strip()
                            if line_clean and (any(char.isdigit() for char in line_clean) or "VIVA" in line_clean.upper() or "RIO" in line_clean.upper() or "SETEMBRO" in line_clean.upper() or "OUTUBRO" in line_clean.upper() or "NOVEMBRO" in line_clean.upper()):
                                # Tentar separar por espaços múltiplos ou tabs
                                parts = [p.strip() for p in line_clean.split() if p.strip()]
                                if len(parts) > 1:
                                    csv_rows.append(",".join(parts))
                        
                        if csv_rows:
                            csv_content = "\n".join(csv_rows)
                            print(f"[GOOGLE SHEETS] ✅ Dados extraídos via texto: {len(csv_rows)} linhas", file=sys.stderr)
                except Exception as e:
                    print(f"[GOOGLE SHEETS] Erro no método alternativo: {e}", file=sys.stderr)
                        
        except Exception as e:
            print(f"[GOOGLE SHEETS] Erro ao extrair dados da página: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
        
        # Processar CSV se obtido
        if csv_content:
            print("[GOOGLE SHEETS] Processando CSV...", file=sys.stderr)
            valores = process_csv(csv_content)
            
            # Se temos driver, verificar cores das células para identificar valores negativos
            if driver:
                print("[GOOGLE SHEETS] Verificando cores das células para identificar valores negativos...", file=sys.stderr)
                try:
                    # Verificar cor das células B34, B35, B36, B37 (linhas 34-37, coluna B = índice 1)
                    cores_celulas = driver.execute_script("""
                        const cores = {};
                        // Procurar células nas linhas 34-37, coluna B
                        const linhas = [34, 35, 36, 37];
                        
                        linhas.forEach(linha => {
                            // Tentar encontrar célula por data-row e data-col
                            const cell = document.querySelector(`[data-row="${linha}"][data-col="1"]`) ||
                                       document.querySelector(`[aria-rowindex="${linha}"][aria-colindex="2"]`) ||
                                       document.querySelector(`[role="gridcell"][data-row="${linha}"]`);
                            
                            if (cell) {
                                const style = window.getComputedStyle(cell);
                                const color = style.color;
                                const backgroundColor = style.backgroundColor;
                                
                                // Verificar se a cor é vermelha (RGB ou hex)
                                const isRed = color.includes('rgb(255') || 
                                             color.includes('rgb(220') ||
                                             color.includes('rgb(239') ||
                                             color.includes('#ff') ||
                                             color.includes('#ef') ||
                                             color.includes('#dc');
                                
                                cores[linha] = {
                                    color: color,
                                    backgroundColor: backgroundColor,
                                    isRed: isRed
                                };
                            }
                        });
                        
                        return cores;
                    """)
                    
                    # Aplicar informações de cor aos valores
                    if cores_celulas:
                        if 34 in cores_celulas and cores_celulas[34].get('isRed'):
                            valores["setembroNegativo"] = True
                            print("[GOOGLE SHEETS] ⚠️ Setembro está em vermelho (negativo)", file=sys.stderr)
                        
                        if 35 in cores_celulas and cores_celulas[35].get('isRed'):
                            valores["outubroNegativo"] = True
                            print("[GOOGLE SHEETS] ⚠️ Outubro está em vermelho (negativo)", file=sys.stderr)
                        
                        if 36 in cores_celulas and cores_celulas[36].get('isRed'):
                            valores["novembroNegativo"] = True
                            print("[GOOGLE SHEETS] ⚠️ Novembro está em vermelho (negativo)", file=sys.stderr)
                        
                        if 37 in cores_celulas and cores_celulas[37].get('isRed'):
                            valores["totalNegativo"] = True
                            print("[GOOGLE SHEETS] ⚠️ Total está em vermelho (negativo)", file=sys.stderr)
                except Exception as e:
                    print(f"[GOOGLE SHEETS] Erro ao verificar cores: {e}", file=sys.stderr)
            
            result["valores"] = valores
            result["success"] = True
            result["message"] = "Dados extraídos com sucesso"
            result["csv_content"] = csv_content[:1000]  # Primeiros 1000 caracteres para debug
        else:
            result["error"] = "Não foi possível obter o conteúdo CSV"
            result["message"] = "Falha ao extrair dados da planilha"
        
    except Exception as e:
        result["error"] = str(e)
        result["message"] = f"Erro ao processar: {e}"
        print(f"[GOOGLE SHEETS] Erro: {e}", file=sys.stderr)
    
    return result

def process_csv(csv_content):
    """Processar CSV e extrair valores financeiros
    Estrutura esperada:
    - A33: VIVA RIO EM ABERTO
    - A34: SETEMBRO | B34: valor
    - A35: OUTUBRO | B35: valor
    - A36: NOVEMBRO | B36: valor
    - A37: Total | B37: valor total
    
    Nova funcionalidade:
    - Identificar meses na coluna A (ex: "Junho" em A4)
    - Quando encontrar um mês, coletar:
      - Nome das UPAs em B3, B4, B5 (relativo à linha do mês)
      - Valor recebido em D2 a D6 (relativo à linha do mês)
      - Data em E2 a E6 (relativo à linha do mês)
      - Situação em H2 até H5 (relativo à linha do mês)
    """
    valores = {
        "vivaRioEmAberto": None,
        "setembro": None,
        "outubro": None,
        "novembro": None,
        "total": None,
        "meses": {}  # Nova estrutura para dados por mês
    }
    
    # Lista de meses em português
    meses_pt = [
        "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
        "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"
    ]
    
    try:
        # Parsear CSV - tentar diferentes delimitadores
        csv_content_clean = csv_content.strip()
        
        # Tentar detectar delimitador
        delimiter = ','
        if ';' in csv_content_clean[:100]:
            delimiter = ';'
        elif '\t' in csv_content_clean[:100]:
            delimiter = '\t'
        
        csv_reader = csv.reader(io.StringIO(csv_content_clean), delimiter=delimiter)
        rows = list(csv_reader)
        
        if not rows:
            print("[GOOGLE SHEETS] CSV vazio ou inválido", file=sys.stderr)
            return valores
        
        print(f"[GOOGLE SHEETS] CSV parseado: {len(rows)} linhas encontradas", file=sys.stderr)
        
        # NOVA FUNCIONALIDADE: Identificar meses na coluna A e coletar dados relacionados
        print("[GOOGLE SHEETS] Procurando meses na coluna A...", file=sys.stderr)
        for i, row in enumerate(rows):
            if not row or len(row) == 0:
                continue
            
            # Verificar se a célula A (índice 0) contém um mês
            cell_a = str(row[0]).strip().upper() if len(row) > 0 else ""
            
            # Verificar se é um mês
            mes_encontrado = None
            for mes in meses_pt:
                if mes in cell_a:
                    mes_encontrado = mes
                    break
            
            if mes_encontrado:
                print(f"[GOOGLE SHEETS] ✅ Mês '{mes_encontrado}' encontrado na linha {i+1} (índice {i})", file=sys.stderr)
                
                # Inicializar estrutura do mês se não existir
                if mes_encontrado not in valores["meses"]:
                    valores["meses"][mes_encontrado] = {
                        "linha": i + 1,  # Linha no Excel (1-based)
                        "indice": i,     # Índice no array (0-based)
                        "upas": [],
                        "valores_recebidos": [],
                        "datas": [],
                        "situacoes": []
                    }
                
                mes_data = valores["meses"][mes_encontrado]
                
                # Coletar dados baseado no exemplo: mês em A4
                # - UPAs em B3, B4, B5 (linhas 3, 4, 5 do Excel = índices 2, 3, 4)
                # - Valores em D2 a D6 (linhas 2 a 6 do Excel = índices 1 a 5)
                # - Datas em E2 a E6 (linhas 2 a 6 do Excel = índices 1 a 5)
                # - Situações em H2 até H5 (linhas 2 a 5 do Excel = índices 1 a 4)
                
                # Se o mês está na linha i+1 (Excel), coletar dados das linhas próximas
                # Vamos coletar dados das linhas próximas ao mês (antes e depois)
                
                # Coletar UPAs em B3, B4, B5 (coluna B = índice 1)
                # Se mês está na linha i+1, coletar linhas i-1, i, i+1 (B3, B4, B5)
                linhas_upas = [i-1, i, i+1]  # Índices para B3, B4, B5
                for idx_upa in linhas_upas:
                    if 0 <= idx_upa < len(rows):
                        if len(rows[idx_upa]) > 1:  # Coluna B existe
                            upa = str(rows[idx_upa][1]).strip() if len(rows[idx_upa]) > 1 else ""
                            if upa and upa not in mes_data["upas"]:
                                mes_data["upas"].append(upa)
                                print(f"[GOOGLE SHEETS]   UPA encontrada em B{idx_upa+1}: '{upa}'", file=sys.stderr)
                
                # Coletar Valores Recebidos em D2 a D6 (coluna D = índice 3)
                # Se mês está na linha i+1, coletar linhas i-2, i-1, i, i+1, i+2 (D2 a D6)
                linhas_valores = range(max(0, i-2), min(len(rows), i+3))  # Índices para D2 a D6
                for idx_valor in linhas_valores:
                    if len(rows[idx_valor]) > 3:  # Coluna D existe
                        valor = str(rows[idx_valor][3]).strip() if len(rows[idx_valor]) > 3 else ""
                        if valor:
                            mes_data["valores_recebidos"].append({
                                "linha": idx_valor + 1,
                                "valor": valor
                            })
                            print(f"[GOOGLE SHEETS]   Valor recebido encontrado em D{idx_valor+1}: '{valor}'", file=sys.stderr)
                
                # Coletar Datas em E2 a E6 (coluna E = índice 4)
                # Se mês está na linha i+1, coletar linhas i-2, i-1, i, i+1, i+2 (E2 a E6)
                linhas_datas = range(max(0, i-2), min(len(rows), i+3))  # Índices para E2 a E6
                for idx_data in linhas_datas:
                    if len(rows[idx_data]) > 4:  # Coluna E existe
                        data = str(rows[idx_data][4]).strip() if len(rows[idx_data]) > 4 else ""
                        if data:
                            mes_data["datas"].append({
                                "linha": idx_data + 1,
                                "data": data
                            })
                            print(f"[GOOGLE SHEETS]   Data encontrada em E{idx_data+1}: '{data}'", file=sys.stderr)
                
                # Coletar Situações em H2 até H5 (coluna H = índice 7)
                # Se mês está na linha i+1, coletar linhas i-2, i-1, i, i+1 (H2 até H5)
                linhas_situacoes = range(max(0, i-2), min(len(rows), i+2))  # Índices para H2 até H5
                for idx_situacao in linhas_situacoes:
                    if len(rows[idx_situacao]) > 7:  # Coluna H existe
                        situacao = str(rows[idx_situacao][7]).strip() if len(rows[idx_situacao]) > 7 else ""
                        if situacao:
                            mes_data["situacoes"].append({
                                "linha": idx_situacao + 1,
                                "situacao": situacao
                            })
                            print(f"[GOOGLE SHEETS]   Situação encontrada em H{idx_situacao+1}: '{situacao}'", file=sys.stderr)
        
        # Debug: imprimir linhas 30-40 (próximo das linhas que procuramos)
        print(f"[GOOGLE SHEETS] Linhas 30-40 (índices 29-39):", file=sys.stderr)
        for i in range(29, min(40, len(rows))):
            print(f"  Linha {i+1} (índice {i}): {rows[i]}", file=sys.stderr)
        
        # Buscar especificamente nas linhas 33-37 (índices 32-36)
        # A33: VIVA RIO EM ABERTO
        # A34: SETEMBRO | B34: valor
        # A35: OUTUBRO | B35: valor
        # A36: NOVEMBRO | B36: valor
        # A37: Total | B37: valor total
        
        # Procurar linha 33 (índice 32) - VIVA RIO EM ABERTO
        if len(rows) > 32:
            linha_33 = rows[32]  # A33 (índice 32)
            if linha_33 and len(linha_33) > 0:
                cell_a33 = str(linha_33[0]).strip().upper() if len(linha_33) > 0 else ""
                if "VIVA RIO" in cell_a33 or "VIVA RIO EM ABERTO" in cell_a33:
                    valores["vivaRioEmAberto"] = "Encontrado"
                    print(f"[GOOGLE SHEETS] ✅ Linha 33 (A33) encontrada: '{linha_33[0]}'", file=sys.stderr)
        
        # Função auxiliar para verificar se valor é negativo
        def is_negative_value(valor_str):
            if not valor_str:
                return False
            # Remover espaços e caracteres de formatação
            valor_clean = valor_str.strip().replace('R$', '').replace('$', '').replace('.', '').replace(',', '.').replace(' ', '')
            # Verificar se começa com menos ou parênteses (formato contábil)
            if valor_clean.startswith('-') or valor_clean.startswith('('):
                return True
            # Tentar converter para número
            try:
                num_valor = float(valor_clean.replace('(', '').replace(')', ''))
                return num_valor < 0
            except:
                return False
        
        # Procurar linha 34 (índice 33) - SETEMBRO
        if len(rows) > 33:
            linha_34 = rows[33]  # A34 (índice 33)
            if linha_34 and len(linha_34) > 1:
                cell_a34 = str(linha_34[0]).strip().upper() if len(linha_34) > 0 else ""
                cell_b34 = str(linha_34[1]).strip() if len(linha_34) > 1 else ""
                if "SETEMBRO" in cell_a34:
                    valores["setembro"] = cell_b34 if cell_b34 else None
                    # Verificar se é negativo pelo valor
                    if cell_b34 and is_negative_value(cell_b34):
                        valores["setembroNegativo"] = True
                    print(f"[GOOGLE SHEETS] ✅ Setembro encontrado na linha 34, coluna B: '{cell_b34}'", file=sys.stderr)
        
        # Procurar linha 35 (índice 34) - OUTUBRO
        if len(rows) > 34:
            linha_35 = rows[34]  # A35 (índice 34)
            if linha_35 and len(linha_35) > 1:
                cell_a35 = str(linha_35[0]).strip().upper() if len(linha_35) > 0 else ""
                cell_b35 = str(linha_35[1]).strip() if len(linha_35) > 1 else ""
                if "OUTUBRO" in cell_a35:
                    valores["outubro"] = cell_b35 if cell_b35 else None
                    # Verificar se é negativo pelo valor
                    if cell_b35 and is_negative_value(cell_b35):
                        valores["outubroNegativo"] = True
                    print(f"[GOOGLE SHEETS] ✅ Outubro encontrado na linha 35, coluna B: '{cell_b35}'", file=sys.stderr)
        
        # Procurar linha 36 (índice 35) - NOVEMBRO
        if len(rows) > 35:
            linha_36 = rows[35]  # A36 (índice 35)
            if linha_36 and len(linha_36) > 1:
                cell_a36 = str(linha_36[0]).strip().upper() if len(linha_36) > 0 else ""
                cell_b36 = str(linha_36[1]).strip() if len(linha_36) > 1 else ""
                if "NOVEMBRO" in cell_a36:
                    valores["novembro"] = cell_b36 if cell_b36 else None
                    # Verificar se é negativo pelo valor
                    if cell_b36 and is_negative_value(cell_b36):
                        valores["novembroNegativo"] = True
                    print(f"[GOOGLE SHEETS] ✅ Novembro encontrado na linha 36, coluna B: '{cell_b36}'", file=sys.stderr)
        
        # Procurar linha 37 (índice 36) - Total
        if len(rows) > 36:
            linha_37 = rows[36]  # A37 (índice 36)
            if linha_37 and len(linha_37) > 1:
                cell_a37 = str(linha_37[0]).strip().upper() if len(linha_37) > 0 else ""
                cell_b37 = str(linha_37[1]).strip() if len(linha_37) > 1 else ""
                if "TOTAL" in cell_a37:
                    valores["total"] = cell_b37 if cell_b37 else None
                    # Verificar se é negativo pelo valor
                    if cell_b37 and is_negative_value(cell_b37):
                        valores["totalNegativo"] = True
                    print(f"[GOOGLE SHEETS] ✅ Total encontrado na linha 37, coluna B: '{cell_b37}'", file=sys.stderr)
        
        # Se não encontrou nas linhas específicas, tentar busca genérica
        if not any([valores["setembro"], valores["outubro"], valores["novembro"], valores["total"]]):
            print("[GOOGLE SHEETS] ⚠️ Não encontrado nas linhas específicas, tentando busca genérica...", file=sys.stderr)
            linha_viva_rio = None
            indice_viva_rio = -1
            
            for i, row in enumerate(rows):
                row_text = " ".join([str(cell) for cell in row]).upper()
                if "VIVA RIO EM ABERTO" in row_text or ("VIVA" in row_text and "RIO" in row_text and "ABERTO" in row_text):
                    linha_viva_rio = row
                    indice_viva_rio = i
                    valores["vivaRioEmAberto"] = "Encontrado"
                    print(f"[GOOGLE SHEETS] ✅ Linha 'VIVA RIO EM ABERTO' encontrada na linha {i + 1}: {row}", file=sys.stderr)
                    break
            
            if not linha_viva_rio:
                # Tentar procurar apenas "VIVA RIO"
                for i, row in enumerate(rows):
                    row_text = " ".join([str(cell) for cell in row]).upper()
                    if "VIVA RIO" in row_text:
                        linha_viva_rio = row
                        indice_viva_rio = i
                        valores["vivaRioEmAberto"] = "Encontrado"
                        print(f"[GOOGLE SHEETS] ✅ Linha 'VIVA RIO' encontrada na linha {i + 1}: {row}", file=sys.stderr)
                        break
        
        if linha_viva_rio:
            # Procurar cabeçalho com meses (pode estar antes ou depois da linha VIVA RIO)
            header_row = None
            header_index = -1
            
            # Procurar nas linhas próximas (até 10 linhas antes e depois)
            search_range = range(max(0, indice_viva_rio - 10), min(len(rows), indice_viva_rio + 10))
            
            for i in search_range:
                row = rows[i]
                row_text = " ".join([str(cell) for cell in row]).upper()
                # Verificar se contém nomes de meses
                if any(month in row_text for month in ["SETEMBRO", "OUTUBRO", "NOVEMBRO", "TOTAL"]):
                    header_row = row
                    header_index = i
                    print(f"[GOOGLE SHEETS] ✅ Cabeçalho encontrado na linha {i + 1}: {row}", file=sys.stderr)
                    break
            
            if header_row:
                # Encontrar índices das colunas
                indice_setembro = -1
                indice_outubro = -1
                indice_novembro = -1
                indice_total = -1
                
                for j, cell in enumerate(header_row):
                    cell_upper = str(cell).upper().strip()
                    if "SETEMBRO" in cell_upper and indice_setembro == -1:
                        indice_setembro = j
                        print(f"[GOOGLE SHEETS] Coluna Setembro encontrada no índice {j}", file=sys.stderr)
                    elif "OUTUBRO" in cell_upper and indice_outubro == -1:
                        indice_outubro = j
                        print(f"[GOOGLE SHEETS] Coluna Outubro encontrada no índice {j}", file=sys.stderr)
                    elif "NOVEMBRO" in cell_upper and indice_novembro == -1:
                        indice_novembro = j
                        print(f"[GOOGLE SHEETS] Coluna Novembro encontrada no índice {j}", file=sys.stderr)
                    elif "TOTAL" in cell_upper and indice_total == -1:
                        indice_total = j
                        print(f"[GOOGLE SHEETS] Coluna Total encontrada no índice {j}", file=sys.stderr)
                
                # Extrair valores da linha VIVA RIO
                print(f"[GOOGLE SHEETS] Extraindo valores da linha VIVA RIO (índices: Set={indice_setembro}, Out={indice_outubro}, Nov={indice_novembro}, Tot={indice_total})", file=sys.stderr)
                
                if indice_setembro != -1 and indice_setembro < len(linha_viva_rio):
                    valores["setembro"] = str(linha_viva_rio[indice_setembro]).strip()
                    print(f"[GOOGLE SHEETS] Setembro: {valores['setembro']}", file=sys.stderr)
                
                if indice_outubro != -1 and indice_outubro < len(linha_viva_rio):
                    valores["outubro"] = str(linha_viva_rio[indice_outubro]).strip()
                    print(f"[GOOGLE SHEETS] Outubro: {valores['outubro']}", file=sys.stderr)
                
                if indice_novembro != -1 and indice_novembro < len(linha_viva_rio):
                    valores["novembro"] = str(linha_viva_rio[indice_novembro]).strip()
                    print(f"[GOOGLE SHEETS] Novembro: {valores['novembro']}", file=sys.stderr)
                
                if indice_total != -1 and indice_total < len(linha_viva_rio):
                    valores["total"] = str(linha_viva_rio[indice_total]).strip()
                    print(f"[GOOGLE SHEETS] Total: {valores['total']}", file=sys.stderr)
            
            # Se ainda não encontrou valores, procurar nas linhas próximas
            if not all([valores["setembro"], valores["outubro"], valores["novembro"], valores["total"]]):
                print("[GOOGLE SHEETS] Procurando valores nas linhas próximas...", file=sys.stderr)
                for i in range(max(0, indice_viva_rio - 2), min(len(rows), indice_viva_rio + 5)):
                    row = rows[i]
                    row_text = " ".join([str(cell) for cell in row]).upper()
                    
                    # Procurar valores numéricos na mesma linha ou próxima
                    for j, cell in enumerate(row):
                        cell_clean = str(cell).strip()
                        # Verificar se é um valor numérico (pode ter vírgula, ponto, R$, etc)
                        if cell_clean and re.search(r'[\d.,]+', cell_clean):
                            # Verificar contexto
                            if i > 0:
                                prev_row = rows[i-1]
                                prev_row_text = " ".join([str(c) for c in prev_row]).upper()
                                
                                if "SETEMBRO" in prev_row_text and not valores["setembro"]:
                                    valores["setembro"] = cell_clean
                                    print(f"[GOOGLE SHEETS] Setembro encontrado na linha {i + 1}, coluna {j}: {cell_clean}", file=sys.stderr)
                                elif "OUTUBRO" in prev_row_text and not valores["outubro"]:
                                    valores["outubro"] = cell_clean
                                    print(f"[GOOGLE SHEETS] Outubro encontrado na linha {i + 1}, coluna {j}: {cell_clean}", file=sys.stderr)
                                elif "NOVEMBRO" in prev_row_text and not valores["novembro"]:
                                    valores["novembro"] = cell_clean
                                    print(f"[GOOGLE SHEETS] Novembro encontrado na linha {i + 1}, coluna {j}: {cell_clean}", file=sys.stderr)
                                elif "TOTAL" in prev_row_text and not valores["total"]:
                                    valores["total"] = cell_clean
                                    print(f"[GOOGLE SHEETS] Total encontrado na linha {i + 1}, coluna {j}: {cell_clean}", file=sys.stderr)
        else:
            print("[GOOGLE SHEETS] ⚠️ Linha 'VIVA RIO EM ABERTO' não encontrada no CSV", file=sys.stderr)
            
    except Exception as e:
        print(f"[GOOGLE SHEETS] Erro ao processar CSV: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
    
    return valores

def main():
    """Função principal"""
    url = "https://docs.google.com/spreadsheets/d/10vaVp0DcgOfjWW3_vat7M8mRVvMiBdtU9kAlDmjEioc/edit?usp=sharing"
    
    driver = None
    result = None
    
    # Garantir que qualquer saída seja enviada imediatamente
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
    
    try:
        print("[GOOGLE SHEETS] Iniciando processo...", file=sys.stderr)
        sys.stderr.flush()
        
        driver = setup_driver()
        if not driver:
            # Tentar método alternativo sem Selenium (apenas URL de exportação)
            print("[GOOGLE SHEETS] Chrome não encontrado, tentando método alternativo (URL direta)...", file=sys.stderr)
            sys.stderr.flush()
            
            try:
                spreadsheet_id = "10vaVp0DcgOfjWW3_vat7M8mRVvMiBdtU9kAlDmjEioc"
                # Tentar diferentes GIDs
                for gid in ['0', '1', '2', '3']:
                    try:
                        export_url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/export?format=csv&gid={gid}"
                        req = urllib.request.Request(export_url)
                        req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
                        response = urllib.request.urlopen(req, timeout=10)
                        csv_data = response.read().decode('utf-8')
                        
                        if csv_data and len(csv_data) > 50 and ',' in csv_data and not csv_data.strip().startswith('<'):
                            valores = process_csv(csv_data)
                            result = {
                                "success": True,
                                "message": "Dados extraídos via URL direta (sem Selenium)",
                                "valores": valores,
                                "method": "url_direct"
                            }
                            break
                    except:
                        continue
                
                if not result:
                    result = {
                        "success": False,
                        "error": "Não foi possível configurar o driver do Chrome e método alternativo falhou",
                        "message": "Erro ao inicializar Selenium e método alternativo"
                    }
            except Exception as alt_error:
                result = {
                    "success": False,
                    "error": f"Chrome não encontrado e método alternativo falhou: {str(alt_error)}",
                    "message": "Erro ao inicializar Selenium"
                }
            
            # Garantir que JSON vai para stdout
            json_output = json.dumps(result, ensure_ascii=False)
            print(json_output, file=sys.stdout)
            sys.stdout.flush()
            
            if not result.get("success"):
                sys.exit(1)
            else:
                sys.exit(0)
        
        print("[GOOGLE SHEETS] Driver configurado, extraindo dados...", file=sys.stderr)
        sys.stderr.flush()
        
        result = extract_financial_data(driver, url)
        
        # Garantir que JSON vai para stdout (sem indent para evitar problemas)
        json_output = json.dumps(result, ensure_ascii=False)
        print(json_output, file=sys.stdout)
        sys.stdout.flush()
        
    except KeyboardInterrupt:
        result = {
            "success": False,
            "error": "Processo interrompido pelo usuário",
            "message": "Interrupção manual"
        }
        json_output = json.dumps(result, ensure_ascii=False)
        print(json_output, file=sys.stdout)
        sys.stdout.flush()
        sys.exit(1)
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        result = {
            "success": False,
            "error": str(e),
            "message": f"Erro geral: {e}",
            "traceback": error_trace
        }
        # Garantir que JSON vai para stdout
        json_output = json.dumps(result, ensure_ascii=False)
        print(json_output, file=sys.stdout)
        sys.stdout.flush()
        sys.exit(1)
    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass

if __name__ == "__main__":
    main()

