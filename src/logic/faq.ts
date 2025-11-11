import fs from 'fs';
import path from 'path';
import { sanitizeInput } from '../utils/sanitize';

interface FAQ {
  pergunta: string;
  resposta: string;
}

interface FAQData {
  empresa: {
    nome: string;
    missao: string;
    contatos: {
      email: string;
      telefone: string;
      horario: string;
    };
  };
  servicos: string[];
  faqs: FAQ[];
}

const loadFaq = (): FAQData => {
  const filePath = path.join(__dirname, '../../data/faq.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as FAQData;
};

const faqData = loadFaq();

export const findFaqAnswer = (question: string): string | null => {
  const normalized = sanitizeInput(question).toLowerCase();
  const direct = faqData.faqs.find((item) => normalized.includes(item.pergunta.toLowerCase().split('?')[0]));
  if (direct) {
    return direct.resposta;
  }

  if (/servi[çc]os?/.test(normalized)) {
    return `Atualmente oferecemos: ${faqData.servicos.join(', ')}.`;
  }

  if (/contat|telefone|email/.test(normalized)) {
    const { contatos } = faqData.empresa;
    return `Você pode falar conosco pelo e-mail ${contatos.email} ou pelo telefone ${contatos.telefone} (${contatos.horario}).`;
  }

  if (/miss[aã]o|sobre/.test(normalized)) {
    return `Nossa missão: ${faqData.empresa.missao}`;
  }

  return null;
};

export const faqFallback = 'Ainda não tenho essa informação aqui. Posso encaminhar para alguém da Tech Solutions ajudar melhor?';
