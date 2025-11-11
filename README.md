# TS Assistente – Chatbot Tech Solutions

Chatbot completo (Node.js + Express + TypeScript) para a empresa fictícia Tech Solutions. O assistente "TS Assistente" atende FAQs, qualifica leads, abre tickets de suporte, agenda demonstrações e encaminha para humanos quando necessário.

## Funcionalidades

- Roteamento de intenções (FAQ, Lead, Suporte, Agendamento, Handoff).
- Base de conhecimento inicial em `data/faq.json`.
- Qualificação de leads com envio para CRM mock (`POST /api/leads`).
- Abertura de tickets de suporte (`POST /api/tickets`).
- Agendamento de demonstrações com slots em memória (`POST /api/slots`, `/api/book`).
- Memória por sessão com resumo a cada 10 mensagens.
- Política de privacidade explícita nas coletas de dados.
- Widget web simples para embutir em qualquer site.
- Testes básicos com Jest + Supertest.

## Pré-requisitos

- Node.js 18+
- NPM 9+
- Chave da OpenAI (opcional para modo live – em testes é utilizado fallback heurístico)

## Instalação

```bash
npm install
```

Crie o arquivo `.env` baseado em `.env.example`:

```
OPENAI_API_KEY=coloque_sua_chave_aqui
PORT=3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

## Execução

### Desenvolvimento

```bash
npm run dev
```

O servidor ficará disponível em `http://localhost:3000`.

### Produção

```bash
npm run build
npm start
```

## Endpoints principais

- `POST /api/chat` – Entrada principal do chatbot `{ message, sessionId }`.
- `POST /api/leads` – Mock de CRM que persiste em `data/leads.json`.
- `POST /api/tickets` – Mock de suporte que persiste em `data/tickets.json`.
- `POST /api/slots` – Retorna os próximos 6 slots disponíveis em horário comercial BRT.
- `POST /api/book` – Confirma agendamento e salva em `data/bookings.json`.
- `GET /health` – Health check.
- `GET /web/index.html` – Widget de chat pronto para embed.

## Testes

```bash
npm test
```

Os testes rodam com fallback heurístico de NLU e garantem fluxos de FAQ, lead, suporte e agendamento.

## Embutindo o widget

Inclua o seguinte snippet na página do site da Tech Solutions:

```html
<iframe
  src="http://localhost:3000/web/index.html"
  style="width: 340px; height: 500px; border: none; border-radius: 12px;"
  title="TS Assistente"
></iframe>
```

Ajuste `src` para o domínio onde a aplicação estiver hospedada.

## Testes manuais sugeridos

1. Pergunte "Quais serviços vocês oferecem?" → Deve retornar a resposta da FAQ.
2. Diga "Quero um orçamento para app mobile" → Informe nome, e-mail, empresa, equipe e confirme o envio do lead.
3. Relate "Estou com erro 500 na integração" → Informe severidade e contato para abrir ticket.
4. Peça "Quero agendar uma demo" → Escolha um slot sugerido, informe contato e confirme.
5. Faça uma pergunta fora de escopo ("me conte fofoca") → O bot deve recusar e oferecer humano.

## Estrutura de diretórios

```
├── data/            # Base inicial, leads/tickets/bookings persistidos
├── src/
│   ├── logic/       # Regras de negócio por intenção
│   ├── memory/      # Store em memória por sessão
│   ├── nlu/         # Integração com OpenAI (com fallback)
│   ├── utils/       # Funções utilitárias
│   └── server.ts    # Aplicação Express
├── tests/           # Testes com Jest + Supertest
└── web/             # Widget HTML/JS simples
```

## Notas adicionais

- Os logs usam Winston com nível `info`/`error` e não gravam dados sensíveis.
- Limite de 60 requisições/minuto por IP com `express-rate-limit`.
- CORS restrito aos domínios definidos em `ALLOWED_ORIGINS`.
- Em ambientes sem OpenAI, o módulo NLU usa heurísticas suficientes para desenvolvimento e testes.
