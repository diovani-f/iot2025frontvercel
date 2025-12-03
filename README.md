# IoT 2025 Frontend

Frontend em React + TypeScript (Tailwind + shadcn/ui) para monitoramento e gestão de dispositivos IoT, integrado ao backend via REST.

## Visão Geral
- Integração com backend (VITE_API_URL) para listar dispositivos e ler séries temporais  
- Atualização quase em tempo real via polling  
- UI moderna com métricas, gráficos, histórico, relatórios e automações locais  
- Design responsivo com tema dark e animações suaves  

## Principais Funcionalidades

### Dashboard
- Seleção de dispositivo e métrica  
- Gráfico temporal interativo  
- Cards e alertas calculados em cliente  
- Status online/offline em tempo real  

### Dispositivos
- Cadastro e gerenciamento de dispositivos ESP32  
- Configuração de componentes (sensores/atuadores)  
- Reenvio de configurações via MQTT  
- Monitoramento de status (online/offline)  

### Visualização de Dados
- Séries temporais de temperatura/umidade  
- Comparativo entre dispositivos  
- Atualização em "tempo real"  
- Filtros por período  

### Histórico
- Geração de eventos a partir de leituras  
- Filtros avançados (data/tipo/dispositivo)  
- Exportação CSV  

### Automação
- Regras locais (alertas e agendamentos)  
- Persistência em localStorage  
- Eventos ao acionar condições  
- Configurações personalizadas  

### Relatórios
- Geração em CSV, PDF e DOCX  
- Agregações por dispositivo/métrica  
- Estatísticas (count/min/max/avg)  
- Capa e sumário profissionais  

## Endpoints da API

### Dispositivos
- `POST /api/configure` — Configurar dispositivo ESP32  
- `POST /api/device/:espId/resend` — Reenviar configuração  

### Leituras
- `GET /api/readings/:espId` — Listar todas as leituras  
- `GET /api/readings/:espId/latest` — Última leitura do dispositivo  

### Atuadores
- `POST /api/actuator` — Enviar comando para atuador  

### Regras
- `GET /api/rules` — Listar regras de automação  
- `POST /api/rules` — Criar regra  
- `DELETE /api/rules/:id` — Deletar regra  

## Requisitos
- Node 18+  
- npm, yarn ou pnpm  
- Backend iot2025 rodando  

### Dependências de Relatórios
- jspdf, jspdf-autotable (para PDF)  
- docx (para DOCX) 

## Instalação e Execução

```bash
# Instalar dependências
npm install
# ou
pnpm install
# ou
yarn install

# Executar em desenvolvimento
npm run dev        # http://localhost:5173

# Build para produção
npm run build

# Preview da build
npm run preview
