export type Intent = 'faq' | 'lead' | 'support' | 'schedule' | 'handoff' | 'other';

export interface ClassifiedMessage {
  intent: Intent;
  confidence: number;
  entities?: Record<string, string>;
  action?: 'ask' | 'answer' | 'confirm' | 'handoff';
  notes?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface LeadData {
  nome?: string;
  email?: string;
  empresa?: string;
  tamanhoEquipe?: string;
  interesse?: string;
  orcamento?: string;
  confirmado?: boolean;
  confirmacaoSolicitada?: boolean;
}

export interface SupportData {
  severidade?: 'baixa' | 'media' | 'alta';
  descricao?: string;
  contato?: string;
  confirmado?: boolean;
  confirmacaoSolicitada?: boolean;
}

export interface ScheduleData {
  interesse?: string;
  slotSelecionado?: string;
  contato?: string;
  confirmado?: boolean;
  confirmacaoSolicitada?: boolean;
  opcoes?: string[];
}

export interface SessionState {
  lead?: LeadData;
  support?: SupportData;
  schedule?: ScheduleData;
  fallbackAttempts: number;
}

export interface SessionData {
  summary: string;
  messages: ChatMessage[];
  state: SessionState;
}

export interface NLUContext {
  sessionId: string;
  message: string;
  history: ChatMessage[];
  summary: string;
}
