import fs from 'fs/promises';
import path from 'path';
import { SupportData } from '../types';
import { sanitizeInput } from '../utils/sanitize';

const dataFile = path.join(__dirname, '../../data/tickets.json');

type SupportField = 'severidade' | 'descricao' | 'contato';

const prompts: Record<SupportField, string> = {
  severidade: 'Pode me informar a severidade? (baixa, média ou alta)',
  descricao: 'Poderia descrever rapidamente o que está ocorrendo?',
  contato: 'Qual e-mail ou telefone podemos usar para retorno?',
};

const parseSeverity = (text: string): SupportData['severidade'] | undefined => {
  const normalized = text.toLowerCase();
  if (/alta|cr[ií]tico|parado|urgente/.test(normalized)) return 'alta';
  if (/m[eé]dia|intermedi[aá]ria/.test(normalized)) return 'media';
  if (/baixa|leve|informativo/.test(normalized)) return 'baixa';
  return undefined;
};

const parseContact = (text: string): string | undefined => {
  const email = text.match(/[\w-.]+@([\w-]+\.)+[\w-]{2,}/);
  if (email) return email[0];
  const phone = text.match(/\+?\d[\d\s-]{7,}/);
  return phone?.[0];
};

const parseConfirmation = (text: string): boolean => /sim|pode enviar|ok|confirmo|isso mesmo/i.test(text);

export const loadTickets = async (): Promise<SupportData[]> => {
  try {
    const raw = await fs.readFile(dataFile, 'utf8');
    return JSON.parse(raw) as SupportData[];
  } catch (error) {
    return [];
  }
};

const saveTickets = async (tickets: SupportData[]): Promise<void> => {
  await fs.writeFile(dataFile, JSON.stringify(tickets, null, 2));
};

export const persistTicket = async (ticket: SupportData & { criadoEm: string }): Promise<void> => {
  const tickets = await loadTickets();
  tickets.push(ticket);
  await saveTickets(tickets);
};

export const handleSupport = async (
  current: SupportData | undefined,
  message: string,
  entities: Record<string, string> = {}
): Promise<{ reply: string; ticket: SupportData; done: boolean; }> => {
  const ticket: SupportData = {
    ...current,
    descricao: current?.descricao ?? entities.descricao,
  };

  if (!ticket.descricao) {
    ticket.descricao = sanitizeInput(message);
  }

  if (!ticket.severidade) {
    const severity = parseSeverity(message);
    if (severity) {
      ticket.severidade = severity;
    }
  }

  if (!ticket.contato) {
    const contact = parseContact(message);
    if (contact) {
      ticket.contato = contact;
    }
  }

  if (ticket.confirmado) {
    return {
      reply: 'O ticket já foi encaminhado ao suporte. Assim que possível retornaremos. Posso ajudar em mais algo?',
      ticket,
      done: true,
    };
  }

  const fields: SupportField[] = ['severidade', 'descricao', 'contato'];
  const missing: SupportField[] = fields.filter((field: SupportField) => !ticket[field]);

  if (missing.length === 0 && ticket.confirmacaoSolicitada) {
    if (parseConfirmation(message)) {
      ticket.confirmado = true;
      ticket.confirmacaoSolicitada = false;
      await persistTicket({ ...ticket, criadoEm: new Date().toISOString() });
      return {
        reply: 'Perfeito, abri o ticket com nossa equipe de suporte. Retornaremos no contato informado. Posso ajudar com mais algo?',
        ticket,
        done: true,
      };
    }
    return {
      reply: 'Se precisar ajustar alguma informação do ticket é só avisar. Posso prosseguir com o envio para o suporte?',
      ticket,
      done: false,
    };
  }

  if (missing.length === 0) {
    ticket.confirmacaoSolicitada = true;
    const resumo = `Resumo do ticket:\n- Severidade: ${ticket.severidade}\n- Descrição: ${ticket.descricao}\n- Contato: ${ticket.contato}`;
    return {
      reply: `${resumo}\nPosso registrar isso com o suporte agora? Usaremos os dados apenas para esse atendimento.`,
      ticket,
      done: false,
    };
  }

  const next = missing[0];
  return {
    reply: prompts[next] ?? 'Pode me detalhar um pouco mais, por favor?',
    ticket,
    done: false,
  };
};
