#!/bin/bash
# Script de build para Render - Instala Chrome e dependências

set -e

echo "🔧 Instalando dependências do sistema..."

# Instalar Chrome e dependências necessárias
apt-get update
apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils

# Baixar e instalar Google Chrome
echo "📥 Baixando Google Chrome..."
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -
echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
apt-get update
apt-get install -y google-chrome-stable

# Verificar instalação do Chrome
CHROME_PATH=$(which google-chrome-stable || which chromium-browser || echo "")
if [ -z "$CHROME_PATH" ]; then
    echo "⚠️ Chrome não encontrado após instalação"
    exit 1
fi

echo "✅ Chrome instalado em: $CHROME_PATH"

# Instalar dependências Node.js
echo "📦 Instalando dependências Node.js..."
npm install

# Instalar dependências Python
echo "🐍 Instalando dependências Python..."
pip install -r requirements.txt

# Instalar Chrome para Puppeteer
echo "🌐 Instalando Chrome para Puppeteer..."
npx puppeteer browsers install chrome

echo "✅ Build concluído com sucesso!"

