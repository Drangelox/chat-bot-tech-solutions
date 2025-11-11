import path from 'path';
import fs from 'fs/promises';
import request from 'supertest';
import app from '../src/server';

const dataDir = path.join(__dirname, '../data');
const leadsFile = path.join(dataDir, 'leads.json');
const ticketsFile = path.join(dataDir, 'tickets.json');
const bookingsFile = path.join(dataDir, 'bookings.json');

const resetFile = async (file: string) => {
  await fs.writeFile(file, '[]', 'utf8');
};

describe('TS Assistente API', () => {
  beforeEach(async () => {
    await Promise.all([resetFile(leadsFile), resetFile(ticketsFile), resetFile(bookingsFile)]);
  });

  it('responde FAQ usando base local', async () => {
    const response = await request(app)
      .post('/api/chat')
      .send({ message: 'Quais serviços vocês oferecem?', sessionId: 'faq-test' })
      .expect(200);

    expect(response.body.reply).toContain('Oferecemos');
    expect(response.body.intent).toBe('faq');
  });

  it('coleta dados de lead e confirma envio', async () => {
    const sessionId = 'lead-test';

    await request(app).post('/api/chat').send({ message: 'Quero um orçamento para app mobile', sessionId });
    await request(app).post('/api/chat').send({ message: 'Meu nome é João Silva', sessionId });
    await request(app).post('/api/chat').send({ message: 'joao@empresa.com', sessionId });
    await request(app).post('/api/chat').send({ message: 'Empresa XPTO', sessionId });
    await request(app).post('/api/chat').send({ message: 'Equipe de 12 pessoas', sessionId });
    const resumo = await request(app).post('/api/chat').send({ message: 'Orçamento estimado 50000', sessionId });
    expect(resumo.body.reply).toContain('Resumo do que anotei');
    await request(app).post('/api/chat').send({ message: 'Sim, pode enviar', sessionId });

    const leadsRaw = await fs.readFile(leadsFile, 'utf8');
    const leads = JSON.parse(leadsRaw) as Array<Record<string, unknown>>;
    expect(leads.length).toBe(1);
    expect(leads[0].nome).toBe('João Silva');
    expect(leads[0].email).toBe('joao@empresa.com');
  });

  it('abre ticket de suporte', async () => {
    const sessionId = 'support-test';

    await request(app).post('/api/chat').send({ message: 'Estou com erro 500 na integração', sessionId });
    await request(app).post('/api/chat').send({ message: 'Alta', sessionId });
    await request(app).post('/api/chat').send({ message: 'Contato suporte@empresa.com', sessionId });
    const confirm = await request(app).post('/api/chat').send({ message: 'Sim, por favor', sessionId });

    expect(confirm.body.reply).toContain('Posso ajudar com algo mais?');
    const ticketsRaw = await fs.readFile(ticketsFile, 'utf8');
    const tickets = JSON.parse(ticketsRaw) as Array<Record<string, unknown>>;
    expect(tickets.length).toBe(1);
  });

  it('lista slots e confirma agendamento', async () => {
    const sessionId = 'schedule-test';

    const first = await request(app).post('/api/chat').send({ message: 'Quero agendar uma demo', sessionId });
    expect(first.body.reply).toContain('opções nos próximos dias');
    const slotsResponse = await request(app).post('/api/slots').send({});
    expect(slotsResponse.body.slots).toHaveLength(6);
    await request(app).post('/api/chat').send({ message: '1', sessionId });
    await request(app).post('/api/chat').send({ message: 'meuemail@empresa.com', sessionId });
    await request(app).post('/api/chat').send({ message: 'Sim, confirme', sessionId });

    const bookingsRaw = await fs.readFile(bookingsFile, 'utf8');
    const bookings = JSON.parse(bookingsRaw) as Array<Record<string, unknown>>;
    expect(bookings.length).toBeGreaterThan(0);
    expect(bookings[0].slot).toBeDefined();
  });
});
