# Instalação do Processo Google Sheets (Python)

## Pré-requisitos

1. Python 3.7+ instalado (já verificado: Python 3.14.2)
2. Chrome/Chromium instalado no sistema

## Instalação das Dependências Python

Execute no terminal:

```bash
pip install -r requirements.txt
```

Ou instale manualmente:

```bash
pip install selenium webdriver-manager
```

## Como Funciona

O processo do Google Sheets agora usa Python com Selenium para:

1. Acessar a planilha do Google Sheets
2. Navegar até a aba "RELATÓRIO CYLLA"
3. Extrair os dados financeiros (VIVA RIO EM ABERTO, Setembro, Outubro, Novembro, Total)
4. Retornar os dados via JSON

## Teste Manual

Para testar o script Python diretamente:

```bash
python google_sheets_extractor.py
```

O script retornará um JSON com os dados extraídos.

## Notas

- O script usa Chrome em modo headless (sem interface gráfica)
- O webdriver-manager baixa automaticamente o ChromeDriver necessário
- O processo é executado via API: `GET /api/financeiro/viva-saude`




