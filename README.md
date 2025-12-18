# DBTotal - Dashboard Pessoal

Dashboard web para buscar e visualizar dados do RHID e DoctorID.

## 🚀 Funcionalidades

- **Autenticação no RHID**: Login seguro com credenciais
- **Listagem de Pessoas**: Visualização completa dos dados da lista de pessoas do RHID
- **Tabela Interativa**: Dados organizados em tabela responsiva
- **Auto-Refresh**: Atualização automática a cada 60 segundos
- **Log de Atividades**: Registro completo de todas as operações
- **Interface Moderna**: Design responsivo e intuitivo

## 📋 Pré-requisitos

- Node.js (versão 14 ou superior)
- npm ou yarn
- Credenciais de acesso ao RHID

## 🛠️ Como Usar

### 1. Instalar Dependências

```bash
npm install
```

### 2. Configurar Credenciais

Copie o arquivo `.env.example` para `.env` e preencha com suas credenciais:

```bash
cp .env.example .env
```

Edite o arquivo `.env` e adicione suas credenciais reais:

```env
VIVA_SAUDE_USERNAME=seu_email@exemplo.com
VIVA_SAUDE_PASSWORD=sua_senha
COOP_VITTA_USERNAME=seu_email@exemplo.com
COOP_VITTA_PASSWORD=sua_senha
DELTA_USERNAME=seu_email@exemplo.com
DELTA_PASSWORD=sua_senha
```

⚠️ **IMPORTANTE**: O arquivo `.env` não será commitado no Git por questões de segurança.

### 3. Iniciar o Servidor

```bash
npm start
```

Ou para desenvolvimento com auto-reload:

```bash
npm run dev
```

### 4. Acessar o Dashboard

Abra seu navegador e acesse: `http://localhost:3000`

### 5. Fazer Login

1. No dashboard, você verá um formulário de login do RHID
2. Digite suas credenciais (usuário e senha)
3. Clique em "Entrar"
4. Após o login bem-sucedido, os dados serão carregados automaticamente

## 🔧 Como Funciona

O dashboard utiliza:

- **Backend Node.js**: Servidor Express que faz autenticação e busca de dados
- **Puppeteer**: Automação do navegador para fazer login e extrair dados do RHID
- **Frontend**: Interface web que consome a API do backend

### Fluxo de Dados

1. Usuário faz login através do formulário
2. Backend autentica no RHID usando Puppeteer
3. Backend acessa a página de listagem de pessoas
4. Dados são extraídos e retornados via API
5. Frontend exibe os dados em uma tabela

## 🔧 Personalização

### Alterar Intervalo de Auto-Refresh

No arquivo `script.js`, altere a constante:

```javascript
const AUTO_REFRESH_INTERVAL = 60000; // Em milissegundos (60000 = 60 segundos)
```

### Alterar Porta do Servidor

No arquivo `.env`, altere a variável:

```
PORT=3000
```

## 📁 Estrutura do Projeto

```
DBTotal/
├── index.html      # Estrutura HTML do dashboard
├── styles.css      # Estilos e design
├── script.js       # Lógica do frontend
├── server.js       # Servidor backend (Express + Puppeteer)
├── package.json    # Dependências do projeto
├── .gitignore      # Arquivos ignorados pelo Git
└── README.md       # Este arquivo
```

## 🎨 Recursos Visuais

- Design moderno com gradiente
- Cards responsivos para cada site
- Indicadores de status em tempo real
- Logs coloridos por tipo de mensagem
- Animações suaves e transições

## 🔒 Segurança

- Este dashboard é para uso interno
- Não armazena dados sensíveis
- Todas as verificações são feitas em tempo real
- Logs são mantidos apenas na sessão do navegador

## 📝 Notas

- O dashboard funciona melhor com um servidor local devido a restrições CORS
- Para acesso real aos dados dos sites, considere implementar um backend
- Os logs são limitados a 50 entradas para manter performance

## 🤝 Contribuindo

Sinta-se à vontade para personalizar e adaptar este dashboard às suas necessidades!

## 📄 Licença

Uso interno e pessoal.

