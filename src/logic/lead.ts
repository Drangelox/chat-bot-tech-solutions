import fs from 'fs/promises';
import path from 'path';
import { LeadData } from '../types';
import { sanitizeInput } from '../utils/sanitize';

type LeadField = 'nome' | 'email' | 'empresa' | 'tamanhoEquipe' | 'interesse' | 'orcamento';

const REQUIRED_FIELDS: LeadField[] = ['nome', 'email', 'empresa', 'tamanhoEquipe', 'interesse'];
const OPTIONAL_FIELDS: LeadField[] = ['orcamento'];

const prompts: Record<LeadField, string> = {
  nome: 'Perfeito! Qual é o seu nome completo?',
  email: 'Obrigado. Pode compartilhar seu e-mail corporativo?',
  empresa: 'Qual é o nome da sua empresa?',
  tamanhoEquipe: 'Quantas pessoas aproximadas compõem a equipe ou squad que usaria a solução?',
  interesse: 'Poderia detalhar rapidamente o que você busca? (ex: tipo de projeto, objetivo)',
  orcamento: 'Se já tiver uma estimativa de orçamento, posso registrar. Caso não tenha, é só dizer que ainda não definiu.',
};

const dataFile = path.join(__dirname, '../../data/leads.json');

const parseEmail = (text: string): string | undefined => {
  const match = text.match(/[\w-.]+@([\w-]+\.)+[\w-]{2,}/);
  return match?.[0];
};

const parseBudget = (text: string): string | undefined => {
  const match = text.match(/\d+[\d\.,]*/);
  return match?.[0];
};

const parseTeamSize = (text: string): string | undefined => {
  const normalized = text.toLowerCase();
  const match = normalized.match(/\d+/);
  if (match) {
    return match[0];
  }
  if (/pequena|startup/.test(normalized)) return 'Pequena';
  if (/m[eé]dia/.test(normalized)) return 'Média';
  if (/grande|enterprise|corp/.test(normalized)) return 'Grande';
  return undefined;
};

const parseConfirmation = (text: string): boolean => /sim|correto|isso mesmo|perfeito|ok/i.test(text);

export const loadLeads = async (): Promise<LeadData[]> => {
  try {
    const raw = await fs.readFile(dataFile, 'utf8');
    return JSON.parse(raw) as LeadData[];
  } catch (error) {
    return [];
  }
};

const saveLeads = async (leads: LeadData[]): Promise<void> => {
  await fs.writeFile(dataFile, JSON.stringify(leads, null, 2), 'utf8');
};

export const persistLead = async (lead: LeadData & { criadoEm: string }): Promise<void> => {
  const leads = await loadLeads();
  leads.push(lead);
  await saveLeads(leads);
};

const extractFieldValue = (field: LeadField, message: string): string | undefined => {
  const sanitized = sanitizeInput(message);
  switch (field) {
    case 'email':
      return parseEmail(sanitized);
    case 'tamanhoEquipe':
      return parseTeamSize(sanitized);
    case 'orcamento':
      return parseBudget(sanitized);
    case 'nome':
      if (/nome/i.test(sanitized)) {
        return sanitized.replace(/.*nome\s*(e|é)\s*/i, '') || undefined;
      }
      return undefined;
    case 'empresa':
      if (/empresa/i.test(sanitized)) {
        return sanitized.replace(/.*empresa\s*/i, '').trim() || undefined;
      }
      return undefined;
    case 'interesse':
    default:
      return sanitized || undefined;
  }
};

export const handleLead = async (
  current: LeadData | undefined,
  message: string,
  entities: Record<string, string> = {}
): Promise<{ reply: string; lead: LeadData; done: boolean; }> => {
  const lead: LeadData = {
    ...current,
    interesse: current?.interesse ?? entities.interesse,
  };

  let updated = false;
  const fields = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];
  for (const field of fields) {
    if (!lead[field]) {
      const extracted = extractFieldValue(field, message);
      if (extracted) {
        lead[field] = extracted;
        updated = true;
      }
    }
  }

  if (lead.confirmado) {
    return {
      reply: 'Dados já confirmados e enviados ao time comercial. Posso ajudar com algo mais?',
      lead,
      done: true,
    };
  }

  const missing = REQUIRED_FIELDS.filter((field) => !lead[field]);

  if (missing.length === 0 && lead.confirmacaoSolicitada) {
    if (parseConfirmation(message)) {
      lead.confirmado = true;
      lead.confirmacaoSolicitada = false;
      await persistLead({ ...lead, criadoEm: new Date().toISOString() });
      return {
        reply: 'Perfeito, encaminhei os dados ao time comercial. Eles entrarão em contato em breve. Posso ajudar com algo mais?',
        lead,
        done: true,
      };
    }
    if (updated) {
      // Usuário corrigiu alguma informação
      lead.confirmacaoSolicitada = false;
    } else {
      return {
        reply: 'Se precisar ajustar alguma informação é só me avisar. Está tudo correto para eu enviar ao time comercial?',
        lead,
        done: false,
      };
    }
  }

  if (missing.length === 0) {
    lead.confirmacaoSolicitada = true;
    const resumo = `Resumo do que anotei:\n- Nome: ${lead.nome}\n- E-mail: ${lead.email}\n- Empresa: ${lead.empresa}\n- Tamanho da equipe: ${lead.tamanhoEquipe}\n- Interesse: ${lead.interesse}${lead.orcamento ? `\n- Orçamento estimado: ${lead.orcamento}` : ''}`;
    const reply = `${resumo}\nPosso registrar esses dados no CRM para nosso time comercial? Usaremos somente para contato e acompanhamento.`;
    return { reply, lead, done: false };
  }

  const nextField = missing[0];
  const reply = prompts[nextField];
  return {
    reply: reply ?? 'Poderia me contar um pouco mais?',
    lead,
    done: false,
  };
};
