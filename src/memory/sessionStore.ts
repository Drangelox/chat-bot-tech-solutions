import { ChatMessage, SessionData, SessionState } from '../types';

const MAX_MESSAGES_BEFORE_SUMMARY = 10;

const createInitialState = (): SessionState => ({
  fallbackAttempts: 0,
});

class SessionStore {
  private sessions = new Map<string, SessionData>();

  getSession(sessionId: string): SessionData {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        summary: '',
        messages: [],
        state: createInitialState(),
      });
    }
    return this.sessions.get(sessionId)!;
  }

  updateState(sessionId: string, updater: (state: SessionState) => SessionState): SessionState {
    const session = this.getSession(sessionId);
    session.state = updater(session.state);
    return session.state;
  }

  appendMessage(sessionId: string, message: ChatMessage): SessionData {
    const session = this.getSession(sessionId);
    session.messages.push(message);
    this.trimMessages(session);
    return session;
  }

  resetState(sessionId: string, key: keyof SessionState): void {
    const session = this.getSession(sessionId);
    if (key === 'fallbackAttempts') {
      session.state.fallbackAttempts = 0;
      return;
    }
    if (key === 'lead') {
      delete session.state.lead;
    } else if (key === 'support') {
      delete session.state.support;
    } else if (key === 'schedule') {
      delete session.state.schedule;
    }
  }

  private trimMessages(session: SessionData): void {
    if (session.messages.length <= MAX_MESSAGES_BEFORE_SUMMARY) {
      return;
    }
    const userMessages = session.messages.filter((m) => m.role === 'user');
    const assistantMessages = session.messages.filter((m) => m.role === 'assistant');
    const latestUser = userMessages[userMessages.length - 1];
    const latestAssistant = assistantMessages[assistantMessages.length - 1];
    const snippetParts = [] as string[];
    if (session.summary) {
      snippetParts.push(session.summary);
    }
    if (latestUser) {
      snippetParts.push(`Última mensagem do usuário: ${latestUser.content}`);
    }
    if (latestAssistant) {
      snippetParts.push(`Última resposta do assistente: ${latestAssistant.content}`);
    }
    session.summary = snippetParts.join(' | ');
    session.messages = session.messages.slice(-MAX_MESSAGES_BEFORE_SUMMARY);
  }
}

export const sessionStore = new SessionStore();
