import fs from 'fs/promises';
import path from 'path';
import { ScheduleData } from '../types';
import { sanitizeInput } from '../utils/sanitize';

const dataFile = path.join(__dirname, '../../data/bookings.json');
const BUSINESS_HOURS = [9, 11, 14, 16];
const MAX_SLOTS = 6;

type ScheduleField = 'interesse' | 'slotSelecionado' | 'contato';

interface BookingRecord {
  slot: string;
  interesse: string;
  contato: string;
  criadoEm: string;
}

export const loadBookings = async (): Promise<BookingRecord[]> => {
  try {
    const raw = await fs.readFile(dataFile, 'utf8');
    return JSON.parse(raw) as BookingRecord[];
  } catch (error) {
    return [];
  }
};

const saveBookings = async (bookings: BookingRecord[]): Promise<void> => {
  await fs.writeFile(dataFile, JSON.stringify(bookings, null, 2));
};

const formatSlot = (date: Date): string => {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date) + ' BRT';
};

export const generateSlots = async (): Promise<string[]> => {
  const bookings = await loadBookings();
  const bookedSet = new Set(bookings.map((booking) => booking.slot));
  const now = new Date();
  const slots: string[] = [];

  for (let dayOffset = 0; dayOffset < 7 && slots.length < MAX_SLOTS; dayOffset += 1) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + dayOffset + 1);
    const weekday = candidate.getUTCDay();
    if (weekday === 0 || weekday === 6) {
      continue;
    }
    for (const hour of BUSINESS_HOURS) {
      const slotDate = new Date(candidate);
      slotDate.setUTCHours(hour + 3, 0, 0, 0); // Ajusta para BRT (UTC-3)
      const formatted = formatSlot(slotDate);
      if (!bookedSet.has(formatted)) {
        slots.push(formatted);
      }
      if (slots.length >= MAX_SLOTS) break;
    }
  }

  return slots;
};

export const persistBooking = async (record: BookingRecord): Promise<void> => {
  const bookings = await loadBookings();
  bookings.push(record);
  await saveBookings(bookings);
};

const parseSlotSelection = (message: string, options: string[]): string | undefined => {
  const indexMatch = message.match(/\b([1-6])\b/);
  if (indexMatch) {
    const index = Number(indexMatch[1]) - 1;
    return options[index];
  }
  const normalized = message.toLowerCase();
  return options.find((slot) => normalized.includes(slot.slice(0, 10)) || normalized.includes(slot.slice(11, 16)));
};

const parseConfirmation = (text: string): boolean => /sim|confirmo|pode marcar|fechar|ok/i.test(text);

const parseContact = (text: string): string | undefined => {
  const email = text.match(/[\w-.]+@([\w-]+\.)+[\w-]{2,}/);
  if (email) return email[0];
  const phone = text.match(/\+?\d[\d\s-]{7,}/);
  return phone?.[0];
};

export const handleSchedule = async (
  current: ScheduleData | undefined,
  message: string,
  entities: Record<string, string> = {}
): Promise<{ reply: string; schedule: ScheduleData; done: boolean; }> => {
  const schedule: ScheduleData = {
    ...current,
    interesse: current?.interesse ?? entities.interesse,
  };

  if (!schedule.interesse) {
    schedule.interesse = sanitizeInput(message);
  }

  if (!schedule.opcoes || schedule.opcoes.length === 0) {
    schedule.opcoes = await generateSlots();
  }

  if (!schedule.slotSelecionado) {
    const selected = parseSlotSelection(message, schedule.opcoes);
    if (selected) {
      schedule.slotSelecionado = selected;
    }
  }

  if (!schedule.contato) {
    const contact = parseContact(message);
    if (contact) {
      schedule.contato = contact;
    }
  }

  if (schedule.confirmado) {
    return {
      reply: 'Agendamento confirmado anteriormente. Se precisar alterar, posso verificar disponibilidade. Posso ajudar com algo mais?',
      schedule,
      done: true,
    };
  }

  const fields: ScheduleField[] = ['interesse', 'slotSelecionado', 'contato'];
  const missing: ScheduleField[] = fields.filter((field: ScheduleField) => !schedule[field]);

  if (missing.length === 0 && schedule.confirmacaoSolicitada) {
    if (parseConfirmation(message)) {
      schedule.confirmado = true;
      schedule.confirmacaoSolicitada = false;
      await persistBooking({
        slot: schedule.slotSelecionado!,
        interesse: schedule.interesse ?? 'Demonstração',
        contato: schedule.contato ?? 'não informado',
        criadoEm: new Date().toISOString(),
      });
      return {
        reply: 'Agenda confirmada! Você receberá o convite por e-mail em breve. Posso ajudar com mais alguma coisa?',
        schedule,
        done: true,
      };
    }
    return {
      reply: 'Tudo certo para eu confirmar esse horário? Se preferir outro, é só mencionar.',
      schedule,
      done: false,
    };
  }

  if (!schedule.slotSelecionado) {
    const lista = schedule.opcoes
      .map((slot, index) => `${index + 1}. ${slot}`)
      .join('\n');
    return {
      reply: `Tenho essas opções nos próximos dias:\n${lista}\nQual deles prefere? Basta indicar o número.`,
      schedule,
      done: false,
    };
  }

  if (!schedule.contato) {
    return {
      reply: 'Qual e-mail ou telefone podemos usar para confirmar o convite? Os dados serão usados apenas para esse agendamento.',
      schedule,
      done: false,
    };
  }

  schedule.confirmacaoSolicitada = true;
  const resumo = `Ótimo! Anotei o interesse em ${schedule.interesse} e o horário ${schedule.slotSelecionado}. Podemos confirmar usando o contato ${schedule.contato}?`;
  return {
    reply: `${resumo}\nPosso finalizar o agendamento?`,
    schedule,
    done: false,
  };
};
