import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import winston from 'winston';
import { classifyAndRespond } from './nlu/openai';
import { faqFallback, findFaqAnswer } from './logic/faq';
import { handleLead, persistLead } from './logic/lead';
import { handleSupport, persistTicket } from './logic/support';
import { generateSlots, handleSchedule, persistBooking } from './logic/schedule';
import { handoffMessage } from './logic/handoff';
import { sanitizeInput } from './utils/sanitize';
import { sessionStore } from './memory/sessionStore';
import { LeadData, SupportData } from './types';

const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'];

const logger = winston.createLogger({
  level: 'info',
  transports: [new winston.transports.Console()],
  format: winston.format.combine(winston.format.timestamp(), winston.format.simple()),
});

app.use(express.json({ limit: '1mb' }));
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, origin ?? allowedOrigins[0]);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: false,
  })
);
app.use(helmet());

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use('/web', express.static(path.join(__dirname, '../web')));

const privacyNotice = 'Usamos os dados compartilhados apenas para contato e atendimento, conforme solicitado.';

app.post('/api/chat', async (req: Request, res: Response) => {
  const { message, sessionId } = req.body ?? {};
  if (typeof message !== 'string' || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'message e sessionId são obrigatórios.' });
  }

  const sanitizedMessage = sanitizeInput(message);
  const session = sessionStore.appendMessage(sessionId, {
    role: 'user',
    content: sanitizedMessage,
    timestamp: Date.now(),
  });

  const context = {
    sessionId,
    message: sanitizedMessage,
    history: session.messages,
    summary: session.summary,
  };

  const classification = await classifyAndRespond(context);
  const entities = classification.entities ?? {};
  let reply = '';

  if (classification.intent === 'other') {
    const lowered = sanitizedMessage.toLowerCase();
    if (/or[çc]amento|proposta|pre[çc]o/.test(lowered)) {
      classification.intent = 'lead';
    } else if (/erro|bug|falha|problema|incidente/.test(lowered)) {
      classification.intent = 'support';
    } else if (/agend|reuni[aã]o|demo|calend[aá]rio/.test(lowered)) {
      classification.intent = 'schedule';
    } else if (/servi[çc]o|produto|faq|pergunta/.test(lowered)) {
      classification.intent = 'faq';
    }
  }

  if (classification.intent === 'other') {
    if (session.state.lead && !session.state.lead.confirmado) {
      classification.intent = 'lead';
    } else if (session.state.support && !session.state.support.confirmado) {
      classification.intent = 'support';
    } else if (session.state.schedule && !session.state.schedule.confirmado) {
      classification.intent = 'schedule';
    }
  }

  switch (classification.intent) {
    case 'faq': {
      const answer = findFaqAnswer(sanitizedMessage);
      reply = answer ?? faqFallback;
      session.state.fallbackAttempts = 0;
      break;
    }
    case 'lead': {
      const { reply: leadReply, lead, done } = await handleLead(session.state.lead, sanitizedMessage, entities);
      session.state.lead = lead;
      reply = leadReply + (leadReply.includes('Usaremos') ? '' : `\n${privacyNotice}`);
      if (done) {
        sessionStore.resetState(sessionId, 'lead');
      }
      session.state.fallbackAttempts = 0;
      break;
    }
    case 'support': {
      const { reply: supportReply, ticket, done } = await handleSupport(session.state.support, sanitizedMessage, entities);
      session.state.support = ticket;
      reply = supportReply + (supportReply.includes('dados') ? '' : `\n${privacyNotice}`);
      if (done) {
        sessionStore.resetState(sessionId, 'support');
      }
      session.state.fallbackAttempts = 0;
      break;
    }
    case 'schedule': {
      const { reply: scheduleReply, schedule, done } = await handleSchedule(session.state.schedule, sanitizedMessage, entities);
      session.state.schedule = schedule;
      reply = scheduleReply + (scheduleReply.includes('dados') ? '' : `\n${privacyNotice}`);
      if (done) {
        sessionStore.resetState(sessionId, 'schedule');
      }
      session.state.fallbackAttempts = 0;
      break;
    }
    case 'handoff': {
      reply = handoffMessage;
      session.state.fallbackAttempts = 0;
      break;
    }
    default: {
      session.state.fallbackAttempts += 1;
      if (session.state.fallbackAttempts >= 2) {
        reply = `${handoffMessage}\nSe preferir posso registrar seu contato.`;
        session.state.fallbackAttempts = 0;
      } else {
        reply = 'Não tenho certeza se entendi. Poderia reformular ou detalhar um pouco mais?';
      }
      break;
    }
  }

  if (reply) {
    sessionStore.appendMessage(sessionId, {
      role: 'assistant',
      content: reply.endsWith('Posso ajudar com algo mais?') ? reply : `${reply}\nPosso ajudar com algo mais?`,
      timestamp: Date.now(),
    });
  }

  logger.info(`session=${sessionId} intent=${classification.intent} action=${classification.action}`);
  return res.json({
    reply: reply.endsWith('Posso ajudar com algo mais?') ? reply : `${reply}\nPosso ajudar com algo mais?`,
    intent: classification.intent,
    privacy: privacyNotice,
  });
});

app.post('/api/leads', async (req: Request, res: Response) => {
  const lead: LeadData = req.body;
  if (!lead?.nome || !lead?.email) {
    return res.status(400).json({ error: 'Campos mínimos não informados.' });
  }
  await persistLead({ ...lead, criadoEm: new Date().toISOString() });
  logger.info('Lead salvo via webhook mock');
  return res.json({ status: 'ok' });
});

app.post('/api/tickets', async (req: Request, res: Response) => {
  const ticket: SupportData = req.body;
  if (!ticket?.descricao || !ticket?.contato) {
    return res.status(400).json({ error: 'Campos mínimos não informados.' });
  }
  await persistTicket({ ...ticket, criadoEm: new Date().toISOString() });
  logger.info('Ticket salvo via webhook mock');
  return res.json({ status: 'ok' });
});

app.post('/api/slots', async (_req: Request, res: Response) => {
  const slots = await generateSlots();
  return res.json({ slots });
});

app.post('/api/book', async (req: Request, res: Response) => {
  const { slot, interesse, contato } = req.body as { slot?: string; interesse?: string; contato?: string };
  if (!slot || !interesse || !contato) {
    return res.status(400).json({ error: 'slot, interesse e contato são obrigatórios.' });
  }
  await persistBooking({ slot, interesse, contato, criadoEm: new Date().toISOString() });
  return res.json({ status: 'ok' });
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`TS Assistente rodando em http://localhost:${PORT}`);
  });
}

export default app;
