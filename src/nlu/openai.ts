import fs from 'fs';
import path from 'path';
import { OpenAI } from 'openai';
import { ClassifiedMessage, Intent, NLUContext } from '../types';

const systemPrompt = `Você é o TS Assistente, ajudante da Tech Solutions. Sempre em pt-BR. Seja objetivo, cordial e útil. Se a pergunta for fora do escopo ou sensível, diga que não pode ajudar e ofereça contato humano. Extraia e confirme dados quando for lead, suporte ou agendamento. Nunca invente fatos; use faq.json. Se não souber, diga que verificará com a equipe. Responda apenas com JSON no formato {"intent": "faq|lead|support|schedule|handoff|other", "confidence": 0-1, "action": "ask|answer|confirm|handoff", "entities": {...}, "notes": ""}.`;

const fewShots = [
  {
    role: 'user' as const,
    content: 'Quero entender os serviços de vocês.'
  },
  {
    role: 'assistant' as const,
    content: '{"intent":"faq","confidence":0.8,"action":"answer","entities":{},"notes":"Usuário pediu lista de serviços"}'
  },
  {
    role: 'user' as const,
    content: 'Preciso de um orçamento para um app mobile personalizado.'
  },
  {
    role: 'assistant' as const,
    content: '{"intent":"lead","confidence":0.9,"action":"ask","entities":{"interesse":"app mobile"},"notes":"Iniciar coleta de lead"}'
  },
  {
    role: 'user' as const,
    content: 'Estou enfrentando erro 500 na integração com ERP.'
  },
  {
    role: 'assistant' as const,
    content: '{"intent":"support","confidence":0.85,"action":"ask","entities":{"descricao":"erro 500 na integração com ERP"},"notes":"Coletar severidade e contato"}'
  },
  {
    role: 'user' as const,
    content: 'Quero agendar uma demonstração na próxima semana.'
  },
  {
    role: 'assistant' as const,
    content: '{"intent":"schedule","confidence":0.8,"action":"ask","entities":{"periodo":"próxima semana"},"notes":"Oferecer slots"}'
  },
  {
    role: 'user' as const,
    content: 'Me conte uma fofoca qualquer.'
  },
  {
    role: 'assistant' as const,
    content: '{"intent":"other","confidence":0.9,"action":"handoff","entities":{},"notes":"Fora do escopo, sugerir humano"}'
  }
];

const readFAQ = () => {
  const faqPath = path.join(__dirname, '../../data/faq.json');
  const raw = fs.readFileSync(faqPath, 'utf8');
  return JSON.parse(raw) as unknown;
};

const faqData = readFAQ();

const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
const client = hasApiKey ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : undefined;

const fallbackClassify = (input: string): ClassifiedMessage => {
  const text = input.toLowerCase();
  const result: ClassifiedMessage = {
    intent: 'other',
    confidence: 0.4,
    action: 'ask',
    entities: {},
  };

  if (/servi[çc]o|oferecem|produtos/.test(text)) {
    return { ...result, intent: 'faq', confidence: 0.7, action: 'answer' };
  }
  if (/or[çc]amento|proposta|pre[çc]o|cot[aã]?[cç][aã]o/.test(text)) {
    return {
      intent: 'lead',
      confidence: 0.75,
      action: 'ask',
      entities: { interesse: input },
    };
  }
  if (/erro|bug|falha|problema|parou/.test(text)) {
    return {
      intent: 'support',
      confidence: 0.7,
      action: 'ask',
      entities: { descricao: input },
    };
  }
  if (/agend|marcar|reuni[aã]o|demo/.test(text)) {
    return {
      intent: 'schedule',
      confidence: 0.72,
      action: 'ask',
      entities: { interesse: input },
    };
  }
  if (/humano|atendente|pessoa/.test(text)) {
    return { intent: 'handoff', confidence: 0.8, action: 'handoff', entities: {} };
  }

  return result;
};

const parseResponse = (content: string): ClassifiedMessage => {
  try {
    const parsed = JSON.parse(content);
    return {
      intent: parsed.intent as Intent,
      confidence: Number(parsed.confidence ?? 0.5),
      action: parsed.action,
      entities: parsed.entities ?? {},
      notes: parsed.notes,
    };
  } catch (error) {
    return fallbackClassify(content);
  }
};

export const classifyAndRespond = async (context: NLUContext): Promise<ClassifiedMessage> => {
  if (!hasApiKey || !client) {
    return fallbackClassify(context.message);
  }

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...fewShots,
  ];

  if (context.summary) {
    messages.push({ role: 'user' as const, content: `Resumo até aqui: ${context.summary}` });
    messages.push({ role: 'assistant' as const, content: '{"intent":"faq","confidence":0.5,"action":"answer","entities":{},"notes":"Contexto recebido"}' });
  }

  context.history.slice(-6).forEach((msg) => {
    messages.push({ role: msg.role, content: msg.content } as { role: 'user' | 'assistant'; content: string });
  });

  messages.push({ role: 'user' as const, content: context.message });

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages,
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return fallbackClassify(context.message);
    }
    return parseResponse(content);
  } catch (error) {
    return fallbackClassify(context.message);
  }
};

export { systemPrompt, faqData };
