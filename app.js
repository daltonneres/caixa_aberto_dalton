/* =======================================================
   CAIXA ABERTO — controle financeiro de clientes
   Interface e regras de negócio aqui. Login e dados ficam
   no Firebase (Auth + Firestore) — veja firebase-config.js.
   ======================================================= */

/* Os dados agora vivem no Firebase (Firestore), não mais no localStorage.
   Veja a seção "cache local + sincronização" logo abaixo. */

// ---------- helpers gerais ----------
const qs = (sel, el = document) => el.querySelector(sel);
const qsa = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
// data de HOJE no fuso do aparelho (não em UTC — senão, depois das 21h no Brasil, já viraria o dia seguinte)
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function formatCurrency(v) {
  const n = Number(v) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatDateBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function formatDateLongPT(date = new Date()) {
  const str = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  return str.charAt(0).toUpperCase() + str.slice(1);
}
function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}
function daysUntil(dateISO) {
  const hoje = new Date(todayISO() + 'T00:00:00');
  const alvo = new Date(dateISO + 'T00:00:00');
  return Math.round((alvo - hoje) / 86400000);
}
function daysUntilLabel(d) {
  if (d == null || d < 0) return null;
  if (d === 0) return 'Hoje';
  if (d === 1) return 'Amanhã';
  return `Em ${d} dias`;
}
function vencimentoRelativoLabel(vencimentoISO) {
  const d = daysUntil(vencimentoISO);
  if (d === 0) return 'vence *hoje*';
  if (d === 1) return 'vence *amanhã*';
  if (d > 1) return `vence em *${d} dias*`;
  const atraso = Math.abs(d);
  return `venceu há *${atraso} dia${atraso > 1 ? 's' : ''}*`;
}
function meetingCountdownLabel(dateISO) {
  return daysUntilLabel(daysUntil(dateISO));
}
function daysUntilBirthday(dataNascimentoISO) {
  if (!dataNascimentoISO) return null;
  const hoje = new Date(todayISO() + 'T00:00:00');
  const [, m, d] = dataNascimentoISO.split('-').map(Number);
  let proximo = new Date(hoje.getFullYear(), m - 1, d);
  if (proximo < hoje) proximo = new Date(hoje.getFullYear() + 1, m - 1, d);
  return Math.round((proximo - hoje) / 86400000);
}
function formatDataAniversario(dataISO) {
  if (!dataISO) return '';
  const [, m, d] = dataISO.split('-');
  return `${d}/${m}`;
}
function aniversarioContrato(clienteDesdeISO) {
  if (!clienteDesdeISO) return null;
  const hoje = new Date(todayISO() + 'T00:00:00');
  const [anoInicio, m, d] = clienteDesdeISO.split('-').map(Number);
  const anos = hoje.getFullYear() - anoInicio;
  if (anos < 1) return null;
  let proximo = new Date(hoje.getFullYear(), m - 1, d);
  if (proximo < hoje) proximo = new Date(hoje.getFullYear() + 1, m - 1, d);
  const dias = Math.round((proximo - hoje) / 86400000);
  const anosCompletos = proximo.getFullYear() - anoInicio;
  return { dias, anos: anosCompletos };
}
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function onlyDigits(str) {
  return String(str || '').replace(/\D/g, '');
}

// ---------- MENSALIDADES (planos de suporte, editáveis pelo menu "Mensalidades") ----------
// Essa lista é só a sugestão inicial usada pra popular o catálogo na primeira vez.
// Os ids fixos (base/dominio/firebase/completo) mantêm compatibilidade com clientes
// que já tinham um desses planos escolhidos antes desse catálogo virar editável.
const MENSALIDADES_SUGERIDAS = [
  // Site com Painel Administrativo
  { id: 'base', nome: 'Site c/ Painel — Base', valor: 90.90, descricao: 'Site com painel administrativo. Hospedagem simples, Firebase gratuito, manutenção técnica e suporte.' },
  { id: 'dominio', nome: 'Site c/ Painel — Domínio', valor: 111.90, descricao: 'Tudo do Base, mais domínio personalizado incluso, registro, renovação e configuração de DNS.' },
  { id: 'firebase', nome: 'Site c/ Painel — Firebase', valor: 123.90, descricao: 'Tudo do Base, mais Firebase com maior capacidade e gerenciamento do banco de dados.' },
  { id: 'completo', nome: 'Site c/ Painel — Completo', valor: 140.90, descricao: 'Hospedagem completa, domínio, Firebase com gerenciamento completo, manutenção contínua e suporte prioritário.' },
  // Site Institucional
  { id: 'site-inst-base', nome: 'Site Institucional — Base', valor: 50.90, descricao: 'Indicado para sites institucionais e projetos de menor complexidade. Hospedagem simples, Firebase gratuito, manutenção e suporte.' },
  { id: 'site-inst-dominio', nome: 'Site Institucional — Domínio', valor: 82.90, descricao: 'Tudo do Base, mais domínio personalizado incluso, registro, renovação e configuração de DNS.' },
  { id: 'site-inst-firebase', nome: 'Site Institucional — Firebase', valor: 92.00, descricao: 'Tudo do Base, mais Firebase com maior capacidade e gerenciamento do banco de dados.' },
  { id: 'site-inst-completo', nome: 'Site Institucional — Completo', valor: 120.90, descricao: 'Hospedagem completa, domínio, Firebase com gerenciamento completo, manutenção contínua e suporte prioritário.' },
  // Landing Page
  { id: 'landing-page', nome: 'Landing Page — Base', valor: 29.90, descricao: 'Hospedagem simples, Firebase gratuito, manutenção técnica e suporte.' },
  { id: 'landing-dominio', nome: 'Landing Page — Domínio', valor: 60.90, descricao: 'Tudo do Base, mais domínio personalizado incluso, registro, renovação e configuração de DNS.' },
  { id: 'landing-firebase', nome: 'Landing Page — Firebase', valor: 70.90, descricao: 'Tudo do Base, mais Firebase com maior capacidade e gerenciamento do banco de dados.' },
  { id: 'landing-completo', nome: 'Landing Page — Completo', valor: 100.00, descricao: 'Hospedagem completa, domínio, Firebase com gerenciamento completo, manutenção contínua e suporte prioritário.' },
  // Sistema Web de Vendas
  { id: 'vendas-base', nome: 'Sistema Vendas — Base', valor: 56.90, descricao: 'Sem DBA e sem domínio — ideal para começar de forma simples. Hospedagem simples, manutenção e suporte técnico.' },
  { id: 'vendas-dominio', nome: 'Sistema Vendas — Domínio', valor: 116.60, descricao: 'Tudo do Base, mais domínio personalizado incluso, registro, renovação e configuração de DNS.' },
  { id: 'vendas-dba', nome: 'Sistema Vendas — DBA', valor: 131.50, descricao: 'Tudo do Base, mais gerenciamento do banco de dados, otimização de performance e monitoramento de recursos.' },
  { id: 'vendas-api', nome: 'Sistema Vendas — API', valor: 141.10, descricao: 'Tudo do Base, mais integração com APIs externas, webhooks e suporte à conexão com sistemas de terceiros.' },
  { id: 'vendas-completo', nome: 'Sistema Vendas — Completo', valor: 162.10, descricao: 'Domínio, banco de dados, APIs, hospedagem completa, manutenção contínua e suporte prioritário — tudo incluso.' },
  // E-Commerce
  { id: 'ecommerce-base', nome: 'E-Commerce — Base', valor: 79.90, descricao: 'Sem DBA e sem domínio — ideal para começar de forma simples. Hospedagem simples, manutenção e suporte técnico.' },
  { id: 'ecommerce-dominio', nome: 'E-Commerce — Domínio', valor: 149.90, descricao: 'Tudo do Base, mais domínio personalizado incluso, registro, renovação e configuração de DNS.' },
  { id: 'ecommerce-dba', nome: 'E-Commerce — DBA', valor: 179.90, descricao: 'Tudo do Base, mais gerenciamento do banco de dados, otimização de performance e monitoramento de recursos.' },
  { id: 'ecommerce-api', nome: 'E-Commerce — API', valor: 219.90, descricao: 'Tudo do Base, mais integração com APIs externas, ERP e gateways de pagamento.' },
  { id: 'ecommerce-marketplace', nome: 'E-Commerce — Marketplace', valor: 259.90, descricao: 'Tudo do Base, mais integração com marketplaces (Mercado Livre e outros), sincronização de catálogo e estoque entre canais.' },
  { id: 'ecommerce-completo', nome: 'E-Commerce — Completo', valor: 349.90, descricao: 'Domínio, DBA completo, APIs, ERP, gateways, marketplaces, hospedagem completa, manutenção contínua e suporte prioritário — tudo incluso.' }
];
function planoById(id) { return getMensalidades().find(p => p.id === id); }

// ---------- STATUS DE ACOMPANHAMENTO DO ORÇAMENTO ----------
const STATUS_ORCAMENTO = [
  { id: 'nao_enviado', label: 'Não enviado', classe: 'stamp-pausado' },
  { id: 'enviado', label: 'Enviado', classe: 'stamp-pendente' },
  { id: 'aguardando_retorno', label: 'Aguardando retorno', classe: 'stamp-pendente' },
  { id: 'sem_retorno', label: 'Sem retorno', classe: 'stamp-pausado' },
  { id: 'desistiu', label: 'Desistiu', classe: 'stamp-atrasado' },
  { id: 'fechado', label: 'Fechado (virou cliente)', classe: 'stamp-pago' }
];
function statusOrcamentoInfo(id) {
  return STATUS_ORCAMENTO.find(s => s.id === id) || STATUS_ORCAMENTO[0];
}
function updateOrcamentoStatus(id, status) {
  const list = getOrcamentos();
  const idx = list.findIndex(o => o.id === id);
  if (idx > -1) {
    list[idx] = { ...list[idx], status, atualizadoEm: todayISO() };
    saveOrcamentos(list);
  }
}

// ---------- DESCONTOS POR PERIODICIDADE (pagamento antecipado) ----------
const DESCONTOS_PERIODICIDADE = [
  { meses: 3, label: 'Trimestral', desconto: 0.02 },
  { meses: 6, label: 'Semestral', desconto: 0.04 },
  { meses: 12, label: 'Anual', desconto: 0.08 }
];
function calcularAntecipado(valorMensal, meses, desconto) {
  const semDesconto = valorMensal * meses;
  const comDesconto = semDesconto * (1 - desconto);
  return { semDesconto, comDesconto, economia: semDesconto - comDesconto };
}

// ---------- CATÁLOGO SUGERIDO DE SERVIÇOS ----------
// Os que já têm preço definido vêm preenchidos; os outros ficam com preço
// em branco pra você definir na hora de adicionar ao catálogo.
const SERVICOS_SUGERIDOS = [
  { nome: 'Site com Painel Administrativo', precoUnico: 400, precoMensal: null, descricao: 'Site completo com painel admin, área de login, integração com Firebase e chatbot. Mensalidade de suporte à parte — veja as opções na aba Mensalidades.' },
  { nome: 'Site Institucional', precoUnico: null, precoMensal: null, descricao: 'Site institucional sem painel administrativo, mais simples e direto. Mensalidade de suporte à parte — veja as opções na aba Mensalidades.' },
  { nome: 'Landing Page', precoUnico: 250, precoMensal: null, descricao: 'Página única e objetiva, focada em conversão (ex: divulgar um curso ou produto). Mensalidade de suporte à parte — veja as opções na aba Mensalidades.' },
  { nome: 'Sistema Web de Vendas', precoUnico: 380, precoMensal: null, descricao: 'Sistema de vendas sob medida (pagamento em 2x: 50% no início, 50% na entrega). Mensalidade de suporte à parte — veja as opções na aba Mensalidades.' },
  { nome: 'E-Commerce', precoUnico: 1490, precoMensal: null, descricao: 'Plataforma completa de e-commerce: loja virtual, pagamentos, estoque, integrações com ERP e marketplaces (pagamento em 2x: 50% no início, 50% na entrega). Mensalidade de suporte à parte — veja as opções na aba Mensalidades.' },
  { nome: 'Desenvolvimento de Sites', precoUnico: null, precoMensal: null, descricao: 'Sites modernos, rápidos e responsivos, focados em conversão e presença digital.' },
  { nome: 'Sistemas Web', precoUnico: null, precoMensal: null, descricao: 'APIs, dashboards e sistemas completos sob medida.' },
  { nome: 'Desenvolvimento de Games', precoUnico: null, precoMensal: null, descricao: 'Criação de jogos web e experiências interativas com foco em engajamento.' },
  { nome: 'Automação & Chatbots', precoUnico: null, precoMensal: null, descricao: 'Automação de atendimentos e processos com integração ao WhatsApp.' },
  { nome: 'Design & Identidade Visual', precoUnico: null, precoMensal: null, descricao: 'Criação de artes, banners, posts e identidade visual profissional.' },
  { nome: 'Banco de Dados', precoUnico: null, precoMensal: null, descricao: 'Estruturação, otimização e manutenção de bancos de dados seguros.' },
  { nome: 'Coleta de Leads', precoUnico: null, precoMensal: null, descricao: 'Captação inteligente com formulários, WhatsApp e automações.' },
  { nome: 'Recuperação de iPhone', precoUnico: null, precoMensal: null, descricao: 'Suporte para desbloqueio, recuperação de acesso e reset com segurança.' },
  { nome: 'Remoção de Vírus', precoUnico: null, precoMensal: null, descricao: 'Limpeza completa de vírus e malwares, com ou sem formatação.' },
  { nome: 'Desbloqueio Android', precoUnico: null, precoMensal: null, descricao: 'Recuperação de acesso em aparelhos bloqueados por conta Google.' },
  { nome: 'Formatação Completa', precoUnico: null, precoMensal: null, descricao: 'Instalação do Windows, drivers, Office e otimização total do sistema.' }
];
function formatDocumento(digits) {
  if (!digits) return '';
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return digits;
}
function formatTelefoneBR(value) {
  const digits = onlyDigits(value).replace(/^55(?=\d{10,11}$)/, '');
  if (digits.length <= 2) return digits ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}
function validarCpf(digits) {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const calc = limite => {
    let soma = 0;
    for (let i = 0; i < limite - 1; i++) soma += Number(digits[i]) * (limite - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calc(10) === Number(digits[9]) && calc(11) === Number(digits[10]);
}
function validarCnpj(digits) {
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
  const calc = posicao => {
    const pesos = posicao === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    const soma = pesos.reduce((total, peso, i) => total + Number(digits[i]) * peso, 0);
    return soma % 11 < 2 ? 0 : 11 - (soma % 11);
  };
  return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13]);
}
function documentoValido(digits, tipo) {
  return tipo === 'pj' ? validarCnpj(digits) : validarCpf(digits);
}
function dataPorExtenso(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(ano, mes - 1, dia)));
}
function somarDias(iso, dias) {
  if (!iso || !Number.isFinite(dias)) return '';
  const [ano, mes, dia] = iso.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia + dias));
  return data.toISOString().slice(0, 10);
}
function distribuirCronograma(inicio, totalDias) {
  if (!inicio || !Number.isFinite(totalDias) || totalDias < 0) return Array(8).fill('');
  return Array.from({ length: 8 }, (_, i) => formatDateBR(somarDias(inicio, Math.round(totalDias * i / 7))));
}

// ---------- CACHE LOCAL + SINCRONIZAÇÃO COM O FIRESTORE ----------
// Ideia: o resto do app continua chamando getClients()/saveClients() etc.
// exatamente como antes (por isso quase nada mudou nas telas). A diferença
// é que agora esses dados vêm de/vão para o Firestore, na nuvem.
let _clients = [];
let _charges = [];
let _meetings = [];
let _servicos = [];
let _orcamentos = [];
let _contratos = [];
let _mensalidades = [];
let _colaboradores = [];
let _negociacoes = [];
let _saidas = [];
let _settings = {};
let _docRef = null;
let _unsubscribeSnapshot = null;
let _saveTimer = null;
let _meuUid = null;
let _syncTargetUid = null;

function getClients() { return _clients; }
function getCharges() { return _charges; }
function getMeetings() { return _meetings; }
function getServicos() { return _servicos; }
function getOrcamentos() { return _orcamentos; }
function getContratos() { return _contratos; }
function getMensalidades() { return _mensalidades; }
function getColaboradores() { return _colaboradores; }
function getNegociacoes() { return _negociacoes; }
function getSaidas() { return _saidas; }
function getSettings() { return _settings; }

function saveClients(list) { _clients = list; queuePersist(); }
function saveCharges(list) { _charges = list; queuePersist(); }
function saveMeetings(list) { _meetings = list; queuePersist(); }
function saveServicos(list) { _servicos = list; queuePersist(); }
function saveOrcamentos(list) { _orcamentos = list; queuePersist(); }
function saveContratos(list) { _contratos = list; queuePersist(); }
function saveMensalidades(list) { _mensalidades = list; queuePersist(); }
function saveColaboradores(list) { _colaboradores = list; queuePersist(); }
function saveNegociacoes(list) { _negociacoes = list; queuePersist(); }
function saveSaidas(list) { _saidas = list; queuePersist(); }
function saveSettings(s) { _settings = s; queuePersist(); }

function clientById(id) { return getClients().find(c => c.id === id); }

// status real da cobrança (calcula atraso na hora)
function chargeStatus(charge) {
  if (charge.status === 'pago') return 'pago';
  if (charge.vencimento < todayISO()) return 'atrasado';
  return 'pendente';
}


// ---------- PIX: chave própria por cliente + QR Code (BRCode) ----------
// Cada cliente (principalmente os de mensalidade recorrente) pode ter uma chave
// Pix diferente da chave geral das Configurações. O QR Code é um Pix "copia e
// cola" estático, já com o valor da cobrança, gerado aqui no navegador.
function cpfValido(d) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  for (let t = 9; t < 11; t++) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(d[t])) return false;
  }
  return true;
}
// Deixa a chave no formato que o Pix exige dentro do QR Code.
function normalizarChavePix(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.includes('@')) return s.toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return s.toLowerCase();
  const d = onlyDigits(s);
  if (s.startsWith('+')) return '+' + d;
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(s) || /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(s)) return d;
  if (d.length === 14) return d;
  if (d.length === 11 && cpfValido(d) && !/[()]/.test(s)) return d;
  if (d.length === 10 || d.length === 11) return '+55' + d;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return '+' + d;
  return s;
}
function pixCampo(id, valor) {
  const v = String(valor);
  return id + String(v.length).padStart(2, '0') + v;
}
function pixTextoSeguro(txt, max) {
  return String(txt || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, max);
}
function pixCRC16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? (((crc << 1) ^ 0x1021) & 0xFFFF) : ((crc << 1) & 0xFFFF);
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
function gerarPixPayload({ chave, nome, cidade, valor, txid }) {
  const conta = pixCampo('00', 'br.gov.bcb.pix') + pixCampo('01', chave);
  let p = pixCampo('00', '01') + pixCampo('01', '11') + pixCampo('26', conta) +
    pixCampo('52', '0000') + pixCampo('53', '986');
  if (Number(valor) > 0) p += pixCampo('54', Number(valor).toFixed(2));
  p += pixCampo('58', 'BR') +
    pixCampo('59', pixTextoSeguro(nome, 25) || 'RECEBEDOR') +
    pixCampo('60', pixTextoSeguro(cidade, 15) || 'BRASIL') +
    pixCampo('62', pixCampo('05', (txid || '').replace(/[^A-Za-z0-9]/g, '').slice(-25) || '***'));
  p += '6304';
  return p + pixCRC16(p);
}
// Qual chave/titular/cidade usar numa cobrança: a do cliente, se tiver; senão a geral.
function pixConfigParaCliente(client) {
  const s = getSettings();
  const propria = !!(client && client.pixChave);
  return {
    propria,
    chaveExibida: propria ? client.pixChave : (s.pix || ''),
    chave: normalizarChavePix(propria ? client.pixChave : s.pix),
    nome: (propria && client.pixTitular) || s.empresaNome || s.seuNome || '',
    cidade: s.pixCidade || ''
  };
}
function chargeAceitaPix(charge, client) {
  const f = charge.formasPagamento;
  if (!f) return true;
  if (f.includes('pix')) return true;
  return f.length === 0 && !!(client && client.pixChave);
}
function pixPayloadDaCobranca(charge) {
  const client = charge.clientId ? clientById(charge.clientId) : null;
  const cfg = pixConfigParaCliente(client);
  if (!cfg.chave) return null;
  return gerarPixPayload({ chave: cfg.chave, nome: cfg.nome, cidade: cfg.cidade, valor: charge.valor, txid: charge.id });
}
function pixQrCanvas(payload, escala = 8, margem = 4) {
  if (typeof qrcode !== 'function') return null;
  const qr = qrcode(0, 'M');
  qr.addData(payload);
  qr.make();
  const n = qr.getModuleCount();
  const c = document.createElement('canvas');
  c.width = c.height = (n + margem * 2) * escala;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) {
    if (qr.isDark(r, col)) ctx.fillRect((col + margem) * escala, (r + margem) * escala, escala, escala);
  }
  return c;
}
function copiarTexto(txt) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(txt);
  return new Promise((resolve) => {
    const ta = document.createElement('textarea');
    ta.value = txt; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove(); resolve();
  });
}
function openPixQrModal(chargeId) {
  const charge = getCharges().find(c => c.id === chargeId);
  if (!charge) return;
  const client = charge.clientId ? clientById(charge.clientId) : null;
  const nome = client ? client.nome : (charge.avulsoNome || 'Cliente');
  const cfg = pixConfigParaCliente(client);
  const payload = pixPayloadDaCobranca(charge);
  if (!payload) { alert('Cadastre uma chave Pix (no cliente ou em Configurações) pra gerar o QR Code.'); return; }
  const canvas = pixQrCanvas(payload);
  if (!canvas) { alert('Não consegui carregar o gerador de QR Code. Confira a conexão e recarregue a página.'); return; }
  openModal(`
    <div class="modal-title">QR Code Pix — ${escapeHtml(nome)}</div>
    <div class="pix-qr-box">
      <img class="pix-qr-img" id="pixQrImg" alt="QR Code Pix" src="${canvas.toDataURL('image/png')}">
      <div class="pix-qr-valor">${formatCurrency(charge.valor)}</div>
      <div class="view-desc" style="margin:0; text-align:center;">${escapeHtml(charge.descricao)} · vence ${formatDateBR(charge.vencimento)}</div>
      <div class="view-desc" style="margin:0; text-align:center;">${cfg.propria ? '🔑 Chave própria do cliente' : '🔑 Chave geral'}: <b>${escapeHtml(cfg.chaveExibida)}</b></div>
    </div>
    <div class="field" style="margin-top:14px;">
      <label class="field-label">Pix copia e cola</label>
      <textarea class="input pix-code" id="pixCodigo" readonly rows="4">${escapeHtml(payload)}</textarea>
    </div>
    <div class="modal-actions" style="flex-wrap:wrap;">
      <button type="button" class="btn btn-ghost" id="btnPixFechar">Fechar</button>
      <button type="button" class="btn btn-ghost" id="btnPixBaixar">⬇️ Baixar QR (PNG)</button>
      <button type="button" class="btn btn-ghost hidden" id="btnPixCompartilhar">📤 Compartilhar imagem</button>
      <button type="button" class="btn btn-primary" id="btnPixCopiar">📋 Copiar código</button>
    </div>
  `);
  const nomeArq = `pix-${nome.replace(/\s+/g, '-').toLowerCase()}-${charge.vencimento}.png`;
  qs('#btnPixFechar').onclick = closeModal;
  qs('#btnPixCopiar').onclick = () => {
    copiarTexto(payload).then(() => {
      const b = qs('#btnPixCopiar');
      if (b) { b.textContent = '✅ Copiado!'; setTimeout(() => { if (qs('#btnPixCopiar')) qs('#btnPixCopiar').textContent = '📋 Copiar código'; }, 1800); }
    });
  };
  qs('#btnPixBaixar').onclick = () => {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = nomeArq;
    a.click();
  };
  canvas.toBlob(blob => {
    if (!blob) return;
    const file = new File([blob], nomeArq, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && qs('#btnPixCompartilhar')) {
      const b = qs('#btnPixCompartilhar');
      b.classList.remove('hidden');
      b.onclick = () => navigator.share({ files: [file], text: `Pix de ${formatCurrency(charge.valor)} — ${charge.descricao}` }).catch(() => {});
    }
  });
}

// ---------- MENSALIDADES RECORRENTES + INDICAÇÕES ----------
// Cliente com "recorrente = true" ganha uma cobrança de mensalidade lançada
// sozinha a cada mês (valor = valorPlano, vence no diaVencimento).
// Indicação: quando o cliente INDICADO paga a 1ª mensalidade, quem indicou
// ganha 1 mensalidade isenta, que é usada na próxima cobrança recorrente
// gerada (ou manualmente, no botão "Isentar" de uma mensalidade em aberto).
function proximoMesISO(mes) {
  let [a, m] = mes.split('-').map(Number);
  m++;
  if (m > 12) { m = 1; a++; }
  return `${a}-${String(m).padStart(2, '0')}`;
}
function competenciaLabel(mes) {
  const [a, m] = mes.split('-');
  return `${m}/${a}`;
}
function diaVencimentoValido(d) {
  const n = Math.round(Number(d));
  return Number.isFinite(n) ? Math.min(28, Math.max(1, n)) : 5;
}

// Como cada cliente recorrente paga a mensalidade: 'pix' (padrão), 'boleto' ou 'cartao'.
// Boleto e cartão são gerados por você a cada ciclo (depois que o anterior foi pago),
// então a cobrança nasce sozinha, mas "sem os dados" até você anexar o boleto/link.
function formaRecorrenciaDoCliente(c) {
  const f = c && c.formaPagamentoRecorrente;
  return ['pix', 'boleto', 'cartao'].includes(f) ? f : 'pix';
}
function formasDaRecorrencia(cli, settings) {
  const f = formaRecorrenciaDoCliente(cli);
  if (f === 'boleto') return ['boleto'];
  if (f === 'cartao') return ['cartao'];
  return (settings.pix || cli.pixChave) ? ['pix'] : [];
}
// Quais dados de pagamento ainda faltam anexar numa cobrança em aberto.
function chargeFaltaDados(c) {
  if (!c || c.status === 'pago' || c.isenta || !(Number(c.valor) > 0)) return [];
  const f = c.formasPagamento || [];
  const falta = [];
  if (f.includes('boleto') && !c.boletoLink && !c.boletoCodigo) falta.push('boleto');
  if (f.includes('cartao') && !c.linkPagamentoCartao) falta.push('cartao');
  return falta;
}
const FALTA_LABEL = { boleto: 'boleto', cartao: 'link do cartão' };

// Lança as mensalidades que faltam (do mês de início até o mês atual).
// É idempotente: o id da cobrança é fixo (rec-<cliente>-<mês>), então rodar
// várias vezes nunca duplica. Retorna quantas cobranças foram criadas.
function gerarMensalidadesRecorrentes() {
  if (!_docRef) return 0;
  const mesHoje = todayISO().slice(0, 7);
  const settings = getSettings();
  const charges = getCharges().slice();
  const ids = new Set(charges.map(c => c.id));
  let criadas = 0;
  let mudouClientes = false;

  const clients = getClients().map(c => {
    if (!c.recorrente || !(Number(c.valorPlano) > 0)) return c;
    let mes = c.recorrenciaInicio || mesHoje;
    if (c.recorrenciaUltimoMes && proximoMesISO(c.recorrenciaUltimoMes) > mes) mes = proximoMesISO(c.recorrenciaUltimoMes);
    if (mes > mesHoje) return c;

    let cli = { ...c };
    let guard = 0;
    while (mes <= mesHoje && guard++ < 36) {
      const id = `rec-${cli.id}-${mes}`;
      if (!ids.has(id)) {
        const venc = `${mes}-${String(diaVencimentoValido(cli.diaVencimento)).padStart(2, '0')}`;
        const planoTxt = cli.plano || 'plano';
        const base = {
          id, clientId: cli.id, avulsoNome: null, avulsoTelefone: null,
          tipo: 'mensalidade', competencia: mes, recorrente: true,
          vencimento: venc, createdAt: todayISO(), linkPagamentoCartao: null, boletoLink: null, boletoCodigo: null
        };
        if ((Number(cli.isencoesDisponiveis) || 0) > 0) {
          charges.push({
            ...base,
            descricao: `Mensalidade ${competenciaLabel(mes)} — ${planoTxt} (isenta por indicação)`,
            valor: 0, valorOriginal: Number(cli.valorPlano),
            status: 'pago', dataPagamento: todayISO(), isenta: true, formasPagamento: []
          });
          cli.isencoesDisponiveis = Number(cli.isencoesDisponiveis) - 1;
          cli.isencoesUsadas = (Number(cli.isencoesUsadas) || 0) + 1;
        } else {
          charges.push({
            ...base,
            descricao: `Mensalidade ${competenciaLabel(mes)} — ${planoTxt}`,
            valor: Number(cli.valorPlano),
            status: 'pendente', dataPagamento: null,
            formasPagamento: formasDaRecorrencia(cli, settings)
          });
        }
        ids.add(id);
        criadas++;
      }
      cli.recorrenciaUltimoMes = mes;
      mes = proximoMesISO(mes);
    }
    mudouClientes = true;
    return cli;
  });

  if (criadas > 0 || mudouClientes) {
    _clients = clients;
    _charges = charges;
    queuePersist();
  }
  return criadas;
}

// Chamado quando uma cobrança é marcada como paga. Se for a 1ª mensalidade
// paga de um cliente indicado por outro cliente, premia quem indicou.
// Retorna o nome de quem ganhou a isenção (ou null).
function concederIsencaoPorIndicacao(charge) {
  if (!charge || !charge.clientId || charge.tipo !== 'mensalidade' || charge.isenta) return null;
  const indicado = clientById(charge.clientId);
  if (!indicado || !indicado.indicadoPor || indicado.indicacaoPremiada) return null;
  const indicador = clientById(indicado.indicadoPor);
  if (!indicador) return null;
  const jaPagouAntes = getCharges().some(ch =>
    ch.id !== charge.id && ch.clientId === indicado.id && ch.tipo === 'mensalidade' && !ch.isenta && ch.status === 'pago');
  if (jaPagouAntes) return null;

  saveClients(getClients().map(c => {
    if (c.id === indicador.id) {
      return { ...c, isencoesDisponiveis: (Number(c.isencoesDisponiveis) || 0) + 1, isencoesGanhas: (Number(c.isencoesGanhas) || 0) + 1 };
    }
    if (c.id === indicado.id) {
      return { ...c, indicacaoPremiada: true, indicacaoPremiadaEm: todayISO() };
    }
    return c;
  }));
  return indicador.nome;
}

// Troca uma mensalidade em aberto por isenta, gastando 1 isenção do cliente.
function isentarCobranca(chargeId) {
  const charge = getCharges().find(c => c.id === chargeId);
  if (!charge || !charge.clientId) return;
  const cli = clientById(charge.clientId);
  if (!cli || (Number(cli.isencoesDisponiveis) || 0) < 1) { alert('Esse cliente não tem mensalidade isenta disponível.'); return; }
  if (!confirm(`Usar 1 mensalidade isenta de ${cli.nome} nesta cobrança (${formatCurrency(charge.valor)})? Ela vai ficar como paga, com valor zero.`)) return;
  saveCharges(getCharges().map(c => c.id !== chargeId ? c : {
    ...c, valorOriginal: Number(c.valor), valor: 0, status: 'pago', dataPagamento: todayISO(), isenta: true,
    descricao: c.descricao + ' (isenta por indicação)'
  }));
  saveClients(getClients().map(c => c.id !== cli.id ? c : {
    ...c, isencoesDisponiveis: Number(c.isencoesDisponiveis) - 1, isencoesUsadas: (Number(c.isencoesUsadas) || 0) + 1
  }));
  navigate(currentView);
}

// agrupa várias mudanças rápidas seguidas numa única escrita no Firestore
function queuePersist() {
  if (!_docRef) return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _docRef.set({
      clients: _clients,
      charges: _charges,
      meetings: _meetings,
      servicos: _servicos,
      orcamentos: _orcamentos,
      contratos: _contratos,
      mensalidades: _mensalidades,
      colaboradores: _colaboradores.map(c => c.uid),
      colaboradoresInfo: _colaboradores,
      negociacoes: _negociacoes,
      saidas: _saidas,
      settings: _settings,
      updatedAt: new Date().toISOString()
    }, { merge: true }).catch(err => {
      console.error('Erro ao salvar no Firebase:', err);
      showSyncError();
    });
  }, 300);
}

function showSyncError() {
  let el = qs('#syncError');
  if (!el) {
    el = document.createElement('div');
    el.id = 'syncError';
    el.className = 'sync-banner';
    document.body.appendChild(el);
  }
  el.textContent = 'Não consegui salvar na nuvem agora. Confira sua internet — a última alteração pode não ter sido salva.';
  el.classList.add('show');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => el.classList.remove('show'), 6000);
}

// mantém a página onde o usuário estava, mesmo quando os dados
// chegam de novo pelo Firestore (própria escrita ou outro aparelho)
let currentDetailClientId = null;
let _orcamentoView = 'lista';
let _servicosTab = 'catalogo'; // catalogo | mensalidades | orcamentos
let _mensSubtab = 'planos';    // planos | recorrentes | indicacoes

let _recorrenciaTimer = null;
function startFirestoreSync(donoUid) {
  _syncTargetUid = donoUid;
  // se o app ficar aberto na virada do mês, lança a nova mensalidade sozinho
  if (!_recorrenciaTimer) _recorrenciaTimer = setInterval(() => { gerarMensalidadesRecorrentes(); }, 60 * 60 * 1000);
  _docRef = db.collection('users').doc(donoUid).collection('app').doc('data');
  _unsubscribeSnapshot = _docRef.onSnapshot(snap => {
    const data = snap.data() || {};
    _clients = data.clients || [];
    _charges = data.charges || [];
    _meetings = data.meetings || [];
    _servicos = data.servicos || [];
    _orcamentos = data.orcamentos || [];
    _contratos = data.contratos || [];
    _mensalidades = data.mensalidades || [];
    _colaboradores = data.colaboradoresInfo || (data.colaboradores || []).map(uid => ({ uid, apelido: '' }));
    _negociacoes = data.negociacoes || [];
    _saidas = data.saidas || [];
    _settings = data.settings || {};
    if (_settings.tema) {
      localStorage.setItem('ca_tema', _settings.tema);
      applyTheme(_settings.tema);
    }
    refreshBrandBar();
    // lança as mensalidades recorrentes que faltam (só com dados vindos do servidor,
    // pra nunca gerar em cima de um cache desatualizado)
    if (!snap.metadata.fromCache) gerarMensalidadesRecorrentes();
    if (currentDetailClientId && clientById(currentDetailClientId)) {
      renderClienteDetalhe(currentDetailClientId);
    } else {
      navigate(currentView);
    }
  }, err => {
    console.error('Erro ao sincronizar com o Firebase:', err);
    if (err.code === 'permission-denied') {
      const estavaVinculado = _syncTargetUid && _meuUid && _syncTargetUid !== _meuUid;
      if (estavaVinculado) {
        alert('Ainda não consigo acessar esses dados. Isso costuma acontecer quando o dono ainda não te adicionou como colaborador(a), ou quando as regras do Firestore ainda não foram atualizadas. O vínculo continua salvo — assim que isso for resolvido, é só recarregar a página que volta a funcionar sozinho. Por enquanto vou te mostrar seus próprios dados (vazios).');
        if (_unsubscribeSnapshot) _unsubscribeSnapshot();
        _unsubscribeSnapshot = null;
        _docRef = null;
        startFirestoreSync(_meuUid); // fallback só na tela, sem apagar o vínculo salvo no Firestore
      } else {
        showSyncError();
      }
    } else {
      showSyncError();
    }
  });
}

// Descobre se este usuário é "dono" dos próprios dados ou está vinculado
// como colaborador(a) de outra conta, e retorna o UID de quem sincronizar.
async function resolveSyncTarget(meuUid) {
  try {
    const linkDoc = await db.collection('users').doc(meuUid).collection('link').doc('dono').get();
    if (linkDoc.exists && linkDoc.data().donoUid) {
      return linkDoc.data().donoUid;
    }
  } catch (err) {
    console.error('Erro ao verificar vínculo:', err);
  }
  return meuUid;
}

async function vincularConta(donoUid) {
  donoUid = donoUid.trim();
  if (!donoUid) { alert('Cole o UID da conta que você quer acompanhar.'); return; }
  if (donoUid === _meuUid) { alert('Esse é o seu próprio UID — não precisa vincular.'); return; }
  try {
    await db.collection('users').doc(_meuUid).collection('link').doc('dono').set({ donoUid });
    stopFirestoreSync();
    startFirestoreSync(donoUid);
    alert('Vinculado! Se os dados não aparecerem, confira se o dono já te adicionou como colaborador(a) nas Configurações dele.');
    navigate('config');
  } catch (err) {
    console.error(err);
    alert('Não consegui vincular agora: ' + err.message);
  }
}

async function desvincularConta(silencioso) {
  try {
    await db.collection('users').doc(_meuUid).collection('link').doc('dono').delete();
  } catch (err) {
    console.error(err);
  }
  stopFirestoreSync();
  startFirestoreSync(_meuUid);
  if (!silencioso) navigate('config');
}

function stopFirestoreSync() {
  if (_unsubscribeSnapshot) _unsubscribeSnapshot();
  _unsubscribeSnapshot = null;
  _docRef = null;
  _clients = []; _charges = []; _meetings = []; _servicos = []; _orcamentos = []; _contratos = []; _mensalidades = []; _colaboradores = []; _negociacoes = []; _saidas = []; _settings = {};
}

// ---------- AUTENTICAÇÃO (Firebase Auth — e-mail e senha de verdade) ----------
let authMode = 'login'; // 'login' ou 'signup'

function initLockScreen() {
  const subtitle = qs('#lockSubtitle');
  const confirmInput = qs('#lockPasswordConfirm');
  const submitBtn = qs('#lockSubmit');
  const switchBtn = qs('#lockSwitchMode');
  const forgotBtn = qs('#lockForgot');
  const errorMsg = qs('#lockError');

  function paintMode() {
    if (authMode === 'signup') {
      subtitle.textContent = 'Crie sua conta pra começar a usar o Caixa Aberto.';
      confirmInput.classList.remove('hidden');
      confirmInput.required = true;
      submitBtn.textContent = 'Criar conta';
      switchBtn.textContent = 'Já tenho conta — entrar';
    } else {
      subtitle.textContent = 'Entre com seu e-mail e senha.';
      confirmInput.classList.add('hidden');
      confirmInput.required = false;
      submitBtn.textContent = 'Entrar';
      switchBtn.textContent = 'Ainda não tenho conta — criar conta';
    }
    errorMsg.classList.add('hidden');
  }
  paintMode();

  switchBtn.onclick = () => { authMode = authMode === 'login' ? 'signup' : 'login'; paintMode(); };

  forgotBtn.onclick = async () => {
    const email = qs('#lockEmail').value.trim();
    if (!email) {
      errorMsg.textContent = 'Digite seu e-mail no campo acima primeiro.';
      errorMsg.classList.remove('hidden');
      return;
    }
    try {
      await auth.sendPasswordResetEmail(email);
      errorMsg.style.color = 'var(--emerald)';
      errorMsg.textContent = 'Te mandamos um e-mail com o link pra trocar a senha.';
      errorMsg.classList.remove('hidden');
    } catch (err) {
      errorMsg.style.color = '';
      errorMsg.textContent = traduzErroFirebase(err);
      errorMsg.classList.remove('hidden');
    }
  };

  qs('#lockForm').onsubmit = async (e) => {
    e.preventDefault();
    errorMsg.style.color = '';
    errorMsg.classList.add('hidden');
    const email = qs('#lockEmail').value.trim();
    const pass = qs('#lockPassword').value;
    submitBtn.disabled = true;
    try {
      if (authMode === 'signup') {
        if (pass !== confirmInput.value) throw { code: '', message: 'As senhas não coincidem.' };
        await auth.createUserWithEmailAndPassword(email, pass);
      } else {
        await auth.signInWithEmailAndPassword(email, pass);
      }
      // o resto (mostrar o app, carregar os dados) acontece no onAuthStateChanged
    } catch (err) {
      errorMsg.textContent = traduzErroFirebase(err);
      errorMsg.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
    }
  };
}

function traduzErroFirebase(err) {
  const map = {
    'auth/email-already-in-use': 'Esse e-mail já tem uma conta. Tenta entrar em vez de criar.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/weak-password': 'Senha muito fraca — use pelo menos 6 caracteres.',
    'auth/user-not-found': 'Não achei uma conta com esse e-mail.',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/too-many-requests': 'Muitas tentativas seguidas. Espera um pouco e tenta de novo.',
    'auth/network-request-failed': 'Sem conexão com a internet.'
  };
  return (err && map[err.code]) || (err && err.message) || 'Algo deu errado. Tenta de novo.';
}

function enterApp() {
  qs('#lockScreen').classList.add('hidden');
  qs('#app').classList.remove('hidden');
  qs('#lockForm').reset();
  currentDetailClientId = null;
  navigate('dashboard');
  refreshBrandBar();
}

function showLockScreen() {
  qs('#app').classList.add('hidden');
  qs('#lockScreen').classList.remove('hidden');
  initLockScreen();
}

// ---------- MODAL genérico ----------
function openModal(html) {
  const root = qs('#modalRoot');
  root.innerHTML = `<div class="modal-backdrop" id="modalBackdrop"><div class="modal">${html}</div></div>`;
  qs('#modalBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modalBackdrop') closeModal();
  });
}
function closeModal() { qs('#modalRoot').innerHTML = ''; }

// ---------- NAVEGAÇÃO ----------
let currentView = 'dashboard';

function navigate(view) {
  currentDetailClientId = null;
  currentView = view;
  qsa('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === (view === 'mensalidades' ? 'servicos' : view)));
  const renderers = {
    dashboard: renderDashboard,
    clientes: renderClientes,
    calculadora: renderCalculadora,
    cobrancas: renderCobrancas,
    saidas: renderSaidas,
    agenda: renderAgenda,
    servicos: renderServicos,
    mensalidades: renderMensalidades, // atalho antigo: abre a aba dentro de Serviços
    negociacoes: renderNegociacoes,
    relatorios: renderRelatorios,
    contratos: renderContratos,
    config: renderConfig
  };
  (renderers[view] || renderDashboard)();
}

function refreshBrandBar() {
  const s = getSettings();
  qs('#brandEmpresa').textContent = s.empresaNome ? s.empresaNome : 'seu financeiro';
}

// Nome usado na saudação da tela inicial — é pessoal (fica salvo no login de
// cada um, via Firebase Auth), então cada colaborador(a) vê o próprio nome,
// mesmo estando vinculado(a) aos dados de outra conta.
function getNomeSaudacao() {
  if (auth.currentUser && auth.currentUser.displayName) return auth.currentUser.displayName;
  // Compatibilidade: se ainda não configurou o nome pessoal e é o dono da
  // própria conta, mantém o comportamento antigo (usava o "Seu nome" das
  // Configurações, que era compartilhado).
  if (!_syncTargetUid || _syncTargetUid === _meuUid) {
    const s = getSettings();
    if (s.seuNome) return s.seuNome;
  }
  return '';
}

// ---------- CALCULADORA ----------
let calc = { display: '0', prev: null, operator: null, waitingForOperand: false };

function calcParse(str) {
  const n = parseFloat(String(str).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function calcFormatDisplay(str) {
  if (str === 'Erro') return 'Erro';
  // enquanto digita, só troca o ponto por vírgula (padrão BR), sem mexer no resto
  return String(str).replace('.', ',');
}

function calcCompute(a, b, op) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '×': return a * b;
    case '÷': return b === 0 ? NaN : a / b;
    default: return b;
  }
}

function calcRefresh() {
  const el = qs('#calcDisplay');
  if (el) el.textContent = calcFormatDisplay(calc.display);
  const opEl = qs('#calcPendente');
  if (opEl) {
    opEl.textContent = (calc.operator && calc.prev != null)
      ? `${calc.prev.toLocaleString('pt-BR', { maximumFractionDigits: 8 })} ${calc.operator}`
      : '';
  }
}

function calcInputDigit(d) {
  if (calc.display === 'Erro' || calc.waitingForOperand) {
    calc.display = d === ',' ? '0,' : d;
    calc.waitingForOperand = false;
  } else {
    calc.display = calc.display === '0' ? d : calc.display + d;
  }
  calcRefresh();
}

function calcInputDot() {
  if (calc.display === 'Erro' || calc.waitingForOperand) {
    calc.display = '0.';
    calc.waitingForOperand = false;
  } else if (!calc.display.includes('.')) {
    calc.display += '.';
  }
  calcRefresh();
}

function calcToggleSign() {
  if (calc.display === 'Erro') return;
  calc.display = calc.display.startsWith('-') ? calc.display.slice(1) : (calc.display === '0' ? '0' : '-' + calc.display);
  calcRefresh();
}

function calcPercent() {
  if (calc.display === 'Erro') return;
  const cur = calcParse(calc.display);
  if (calc.operator && calc.prev != null && (calc.operator === '+' || calc.operator === '-')) {
    calc.display = String(calc.prev * (cur / 100));
  } else {
    calc.display = String(cur / 100);
  }
  calc.waitingForOperand = false;
  calcRefresh();
}

function calcClear() {
  calc = { display: '0', prev: null, operator: null, waitingForOperand: false };
  calcRefresh();
}

function calcBackspace() {
  if (calc.display === 'Erro' || calc.waitingForOperand) { calcClear(); return; }
  calc.display = calc.display.length > 1 ? calc.display.slice(0, -1) : '0';
  calcRefresh();
}

function calcInputOperator(op) {
  if (calc.display === 'Erro') return;
  const cur = calcParse(calc.display);
  if (calc.operator && !calc.waitingForOperand) {
    const result = calcCompute(calc.prev, cur, calc.operator);
    calc.prev = result;
    calc.display = isFinite(result) ? String(result) : 'Erro';
  } else {
    calc.prev = cur;
  }
  calc.operator = op;
  calc.waitingForOperand = true;
  calcRefresh();
}

function calcEquals() {
  if (calc.operator == null || calc.prev == null) return;
  const cur = calcParse(calc.display);
  const result = calcCompute(calc.prev, cur, calc.operator);
  calc.display = isFinite(result) ? String(result) : 'Erro';
  calc.prev = null;
  calc.operator = null;
  calc.waitingForOperand = true;
  calcRefresh();
}

function calcHandleKey(key) {
  if (/^[0-9]$/.test(key)) return calcInputDigit(key);
  switch (key) {
    case ',': case '.': return calcInputDot();
    case '+': case '-': case '×': case '÷': return calcInputOperator(key);
    case '=': return calcEquals();
    case 'C': return calcClear();
    case '⌫': return calcBackspace();
    case '%': return calcPercent();
    case '±': return calcToggleSign();
  }
}

function renderCalculadora() {
  calc = { display: '0', prev: null, operator: null, waitingForOperand: false };

  qs('#main').innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">Calculadora</div>
        <div class="view-desc">Contas rápidas, porcentagem, descontos e parcelas</div>
      </div>
    </div>

    <div class="calc-layout">
      <div class="calc-card">
        <div class="calc-pendente" id="calcPendente"></div>
        <div class="calc-display" id="calcDisplay">0</div>
        <div class="calc-grid">
          <button class="calc-btn calc-btn-fn" data-calc-key="C">C</button>
          <button class="calc-btn calc-btn-fn" data-calc-key="±">±</button>
          <button class="calc-btn calc-btn-fn" data-calc-key="%">%</button>
          <button class="calc-btn calc-btn-op" data-calc-key="÷">÷</button>

          <button class="calc-btn" data-calc-key="7">7</button>
          <button class="calc-btn" data-calc-key="8">8</button>
          <button class="calc-btn" data-calc-key="9">9</button>
          <button class="calc-btn calc-btn-op" data-calc-key="×">×</button>

          <button class="calc-btn" data-calc-key="4">4</button>
          <button class="calc-btn" data-calc-key="5">5</button>
          <button class="calc-btn" data-calc-key="6">6</button>
          <button class="calc-btn calc-btn-op" data-calc-key="-">−</button>

          <button class="calc-btn" data-calc-key="1">1</button>
          <button class="calc-btn" data-calc-key="2">2</button>
          <button class="calc-btn" data-calc-key="3">3</button>
          <button class="calc-btn calc-btn-op" data-calc-key="+">+</button>

          <button class="calc-btn calc-btn-zero" data-calc-key="0">0</button>
          <button class="calc-btn" data-calc-key=",">,</button>
          <button class="calc-btn calc-btn-eq" data-calc-key="=">=</button>
        </div>
      </div>

      <div class="quick-calc-col">
        <div class="section-title" style="font-size:15px;">Ferramentas rápidas</div>

        <div class="quick-calc-card">
          <div class="quick-calc-title">Porcentagem de um valor</div>
          <div class="field-row">
            <div class="field">
              <label class="field-label">Percentual (%)</label>
              <input class="input" id="qcPctA" type="number" step="any" placeholder="Ex: 10">
            </div>
            <div class="field">
              <label class="field-label">Valor</label>
              <input class="input" id="qcPctB" type="number" step="any" placeholder="Ex: 500">
            </div>
          </div>
          <div class="quick-calc-result" id="qcPctResultado">Resultado: —</div>
        </div>

        <div class="quick-calc-card">
          <div class="quick-calc-title">Acréscimo ou desconto</div>
          <div class="field-row">
            <div class="field">
              <label class="field-label">Valor base</label>
              <input class="input" id="qcAdBase" type="number" step="any" placeholder="Ex: 1000">
            </div>
            <div class="field">
              <label class="field-label">Percentual (%)</label>
              <input class="input" id="qcAdPct" type="number" step="any" placeholder="Ex: 15">
            </div>
            <div class="field">
              <label class="field-label">Tipo</label>
              <select class="input" id="qcAdTipo">
                <option value="acrescimo">Acréscimo (+)</option>
                <option value="desconto">Desconto (−)</option>
              </select>
            </div>
          </div>
          <div class="quick-calc-result" id="qcAdResultado">Resultado: —</div>
        </div>

        <div class="quick-calc-card">
          <div class="quick-calc-title">Qual % um valor representa</div>
          <div class="field-row">
            <div class="field">
              <label class="field-label">Parte</label>
              <input class="input" id="qcRepParte" type="number" step="any" placeholder="Ex: 150">
            </div>
            <div class="field">
              <label class="field-label">Total</label>
              <input class="input" id="qcRepTotal" type="number" step="any" placeholder="Ex: 1000">
            </div>
          </div>
          <div class="quick-calc-result" id="qcRepResultado">Resultado: —</div>
        </div>

        <div class="quick-calc-card">
          <div class="quick-calc-title">Dividir em parcelas</div>
          <div class="field-row">
            <div class="field">
              <label class="field-label">Valor total</label>
              <input class="input" id="qcParTotal" type="number" step="any" placeholder="Ex: 1200">
            </div>
            <div class="field">
              <label class="field-label">Nº de parcelas</label>
              <input class="input" id="qcParN" type="number" step="1" min="1" placeholder="Ex: 12">
            </div>
          </div>
          <div class="quick-calc-result" id="qcParResultado">Resultado: —</div>
        </div>
      </div>
    </div>
  `;

  qsa('[data-calc-key]').forEach(b => b.addEventListener('click', () => calcHandleKey(b.dataset.calcKey)));
  calcRefresh();

  const qcOn = (ids, fn) => ids.forEach(id => qs('#' + id).addEventListener('input', fn));

  qcOn(['qcPctA', 'qcPctB'], () => {
    const pct = parseFloat(qs('#qcPctA').value);
    const base = parseFloat(qs('#qcPctB').value);
    const out = qs('#qcPctResultado');
    if (isNaN(pct) || isNaN(base)) { out.textContent = 'Resultado: —'; return; }
    out.textContent = `Resultado: ${pct}% de ${formatCurrency(base)} = ${formatCurrency(base * pct / 100)}`;
  });

  qcOn(['qcAdBase', 'qcAdPct', 'qcAdTipo'], () => {
    const base = parseFloat(qs('#qcAdBase').value);
    const pct = parseFloat(qs('#qcAdPct').value);
    const tipo = qs('#qcAdTipo').value;
    const out = qs('#qcAdResultado');
    if (isNaN(base) || isNaN(pct)) { out.textContent = 'Resultado: —'; return; }
    const diferenca = base * pct / 100;
    const final = tipo === 'acrescimo' ? base + diferenca : base - diferenca;
    out.textContent = `Resultado: ${formatCurrency(base)} ${tipo === 'acrescimo' ? '+' : '−'} ${pct}% (${formatCurrency(diferenca)}) = ${formatCurrency(final)}`;
  });

  qcOn(['qcRepParte', 'qcRepTotal'], () => {
    const parte = parseFloat(qs('#qcRepParte').value);
    const total = parseFloat(qs('#qcRepTotal').value);
    const out = qs('#qcRepResultado');
    if (isNaN(parte) || isNaN(total) || total === 0) { out.textContent = 'Resultado: —'; return; }
    out.textContent = `Resultado: ${formatCurrency(parte)} é ${(parte / total * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% de ${formatCurrency(total)}`;
  });

  qcOn(['qcParTotal', 'qcParN'], () => {
    const total = parseFloat(qs('#qcParTotal').value);
    const n = parseInt(qs('#qcParN').value, 10);
    const out = qs('#qcParResultado');
    if (isNaN(total) || !n || n < 1) { out.textContent = 'Resultado: —'; return; }
    out.textContent = `Resultado: ${n}x de ${formatCurrency(total / n)}`;
  });
}

// ---------- DASHBOARD ----------
function renderDashboard() {
  const clients = getClients();
  const charges = getCharges();
  const meetings = getMeetings();
  const settings = getSettings();

  const mesAtual = todayISO().slice(0, 7);
  // "A receber" e a lista de cobranças em aberto contam só o que vence NESTE mês.
  // Atrasos de meses anteriores continuam visíveis no card "Atrasado".
  const abertasMes = charges.filter(c => chargeStatus(c) !== 'pago' && (c.vencimento || '').slice(0, 7) === mesAtual);
  const aReceber = abertasMes.reduce((sum, c) => sum + Number(c.valor), 0);
  const atrasado = charges.filter(c => chargeStatus(c) === 'atrasado')
    .reduce((sum, c) => sum + Number(c.valor), 0);
  const recebidoMes = charges.filter(c => c.status === 'pago' && (c.dataPagamento || '').slice(0, 7) === mesAtual)
    .reduce((sum, c) => sum + Number(c.valor), 0);

  const pendentes = abertasMes
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    .slice(0, 8);

  const reunioesHoje = meetings.filter(m => m.data === todayISO() && m.status === 'agendada')
    .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
  const proximasReunioes = meetings.filter(m => m.status === 'agendada' && m.data >= todayISO())
    .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora))
    .slice(0, 5);

  const aniversariantesHoje = clients.filter(c => daysUntilBirthday(c.dataNascimento) === 0);
  const contratosHoje = clients
    .map(c => ({ c, info: aniversarioContrato(c.clienteDesde) }))
    .filter(x => x.info && x.info.dias === 0);

  const nomeUsuario = getNomeSaudacao() ? `, ${escapeHtml(getNomeSaudacao())}` : '';
  const proximaReuniao = proximasReunioes[0] || null;

  const abertas = charges.filter(c => chargeStatus(c) !== 'pago');
  const nAtrasadas = abertas.filter(c => chargeStatus(c) === 'atrasado').length;
  const recorrenteMes = clients.filter(c => c.recorrente).reduce((s, c) => s + (Number(c.valorPlano) || 0), 0);
  const nRecorrentes = clients.filter(c => c.recorrente).length;
  const orcAndamento = getOrcamentos().filter(o => ['enviado', 'aguardando_retorno'].includes(o.status || 'nao_enviado'));
  const orcSemNovidade = orcAndamento.filter(o => daysUntil(o.atualizadoEm || o.criadoEm) <= -3).length;
  const nNegociacoes = getNegociacoes();
  const comissoesPendentes =
    nNegociacoes.filter(n => !n.contratacaoPaga).reduce((s, n) => s + comissaoContratacao(n), 0) +
    nNegociacoes.filter(n => Number(n.valorMensalidade) > 0 && !mensalidadeEstaPagaEsteMes(n)).reduce((s, n) => s + comissaoMensal(n), 0);

  qs('#main').innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">${getGreeting()}${nomeUsuario} 👋</div>
        <div class="view-desc">${formatDateLongPT()}</div>
      </div>
      <div class="tab-actions">
        <button class="btn btn-primary btn-sm" id="qaCobranca">+ Cobrança</button>
        <button class="btn btn-ghost btn-sm" id="qaCliente">+ Cliente</button>
        <button class="btn btn-ghost btn-sm" id="qaReuniao">+ Reunião</button>
        <button class="btn btn-ghost btn-sm" id="qaOrcamento">+ Orçamento</button>
      </div>
    </div>

    ${aniversariantesHoje.length > 0 ? `
      <div class="today-banner birthday-banner">
        <strong>🎂 Aniversário hoje:</strong>
        ${aniversariantesHoje.map(c => `<span class="today-item"><a href="#" data-view-client="${c.id}">${escapeHtml(c.nome)}</a></span>`).join('')}
      </div>
    ` : ''}

    ${contratosHoje.length > 0 ? `
      <div class="today-banner contract-banner">
        <strong>🎉 Aniversário de contrato hoje:</strong>
        ${contratosHoje.map(x => `<span class="today-item"><a href="#" data-view-client="${x.c.id}">${escapeHtml(x.c.nome)} — ${x.info.anos} ano${x.info.anos > 1 ? 's' : ''}</a></span>`).join('')}
      </div>
    ` : ''}

    ${reunioesHoje.length > 0 ? `
      <div class="today-banner">
        <strong>Você tem ${reunioesHoje.length} reunião${reunioesHoje.length > 1 ? 'ões' : ''} hoje:</strong>
        ${reunioesHoje.map(m => {
          const cli = m.clientId ? clientById(m.clientId) : null;
          return `<span class="today-item">${m.hora ? m.hora + ' — ' : ''}${escapeHtml(m.titulo)}${cli ? ' (' + escapeHtml(cli.nome) + ')' : ''}</span>`;
        }).join('')}
      </div>
    ` : (proximaReuniao ? `
      <div class="countdown-banner">
        <div class="countdown-number">${daysUntil(proximaReuniao.data)}</div>
        <div class="countdown-text">
          <strong>${meetingCountdownLabel(proximaReuniao.data)}</strong> para sua próxima reunião
          <div class="countdown-sub">${escapeHtml(proximaReuniao.titulo)}${proximaReuniao.clientId && clientById(proximaReuniao.clientId) ? ' · ' + escapeHtml(clientById(proximaReuniao.clientId).nome) : ''} — ${formatDateBR(proximaReuniao.data)}${proximaReuniao.hora ? ' às ' + proximaReuniao.hora : ''}</div>
        </div>
      </div>
    ` : '')}

    <div class="cards-grid">
      <div class="stat-card stat-link" data-go="cobrancas">
        <div class="stat-label">A receber</div>
        <div class="stat-value">${formatCurrency(aReceber)}</div>
        <div class="stat-sub">${abertasMes.length} cobrança${abertasMes.length === 1 ? '' : 's'} em aberto · ${mesAnoLabel(mesAtual)}</div>
      </div>
      <div class="stat-card stat-link" data-go="cobrancas">
        <div class="stat-label">Recebido no mês</div>
        <div class="stat-value emerald">${formatCurrency(recebidoMes)}</div>
        <div class="stat-sub">${mesAnoLabel(mesAtual)}</div>
      </div>
      <div class="stat-card stat-link" data-go="cobrancas">
        <div class="stat-label">Atrasado</div>
        <div class="stat-value brick">${formatCurrency(atrasado)}</div>
        <div class="stat-sub">${nAtrasadas === 0 ? 'nada atrasado 👏' : nAtrasadas + ' cobrança' + (nAtrasadas === 1 ? '' : 's')}</div>
      </div>
      <div class="stat-card stat-link" data-go="clientes">
        <div class="stat-label">Recorrente / mês</div>
        <div class="stat-value">${formatCurrency(recorrenteMes)}</div>
        <div class="stat-sub">${nRecorrentes} de ${clients.length} cliente${clients.length === 1 ? '' : 's'}</div>
      </div>
    </div>

    <div class="dashboard-split">
      <div>
        <div class="section-title section-title-row"><span>Cobranças em aberto · ${mesAnoLabel(mesAtual)}</span><a href="#" class="section-link" data-go="cobrancas">ver todas →</a></div>
        ${renderChargeLedger(pendentes, { compact: true })}
      </div>
      <div>
        <div class="section-title section-title-row"><span>Próximas reuniões</span><a href="#" class="section-link" data-go="agenda">abrir agenda →</a></div>
        ${proximasReunioes.length === 0 ? emptyState('Nada marcado', 'Sua agenda está livre por enquanto.') : `
          <div class="ledger">
            ${proximasReunioes.map(m => {
              const cli = m.clientId ? clientById(m.clientId) : null;
              return `
              <div class="ledger-row">
                <div class="ledger-main">
                  <div class="ledger-title">${escapeHtml(m.titulo)}</div>
                  <div class="ledger-sub">${formatDateBR(m.data)}${m.hora ? ' às ' + m.hora : ''}${cli ? ' · ' + escapeHtml(cli.nome) : ''}</div>
                </div>
                <span class="stamp-badge stamp-pendente">${meetingCountdownLabel(m.data)}</span>
              </div>`;
            }).join('')}
          </div>
        `}
      </div>
    </div>

    ${(orcAndamento.length > 0 || comissoesPendentes > 0) ? `
      <div class="section-title" style="margin-top:30px;">De olho</div>
      <div class="cards-grid cards-grid-3 cards-grid-tight">
        ${orcAndamento.length > 0 ? `
        <div class="stat-card stat-link" data-go-orc="1">
          <div class="stat-label">Orçamentos esperando resposta</div>
          <div class="stat-value amber">${orcAndamento.length}</div>
          <div class="stat-sub">${orcSemNovidade > 0 ? `🔔 ${orcSemNovidade} sem novidade há 3+ dias` : 'todos recentes'}</div>
        </div>` : ''}
        ${comissoesPendentes > 0 ? `
        <div class="stat-card stat-link" data-go="negociacoes">
          <div class="stat-label">Comissões a pagar (parcerias)</div>
          <div class="stat-value brick">${formatCurrency(comissoesPendentes)}</div>
          <div class="stat-sub">contratação + mensalidades do mês</div>
        </div>` : ''}
      </div>
    ` : ''}
  `;

  bindChargeActions();
  qsa('[data-view-client]').forEach(a => a.onclick = (e) => { e.preventDefault(); renderClienteDetalhe(a.dataset.viewClient); });
  qsa('[data-go-orc]').forEach(el => el.onclick = () => { _servicosTab = 'orcamentos'; navigate('servicos'); });
  qsa('[data-go]').forEach(el => el.onclick = (e) => { e.preventDefault(); navigate(el.dataset.go); });
  qs('#qaCobranca').onclick = () => openChargeModal();
  qs('#qaCliente').onclick = () => openClientModal();
  qs('#qaReuniao').onclick = () => openMeetingModal(null, null, () => renderDashboard());
  qs('#qaOrcamento').onclick = () => { _servicosTab = 'orcamentos'; navigate('servicos'); };
}

// ---------- CLIENTES ----------
let _clientesFiltro = { busca: '', status: 'todos', ordem: 'nome' };

function semAcento(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function iniciaisNome(nome) {
  const p = String(nome || '?').trim().split(/\s+/).filter(Boolean);
  return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

function renderClientes() {
  const clients = getClients();
  const charges = getCharges();

  const aberto = {};
  const atrasados = new Set();
  charges.forEach(ch => {
    if (!ch.clientId || chargeStatus(ch) === 'pago') return;
    aberto[ch.clientId] = (aberto[ch.clientId] || 0) + Number(ch.valor || 0);
    if (chargeStatus(ch) === 'atrasado') atrasados.add(ch.clientId);
  });
  const nComAberto = clients.filter(c => aberto[c.id] > 0).length;
  const nRecorrentes = clients.filter(c => c.recorrente).length;

  qs('#main').innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">Clientes</div>
        <div class="view-desc">Quem você atende e cobra</div>
      </div>
      <button class="btn btn-primary" id="btnNovoCliente">+ Novo cliente</button>
    </div>

    ${clients.length === 0 ? emptyState('Nenhum cliente ainda', 'Cadastre o primeiro cliente para começar a lançar cobranças.') : `
      <div class="cards-grid">
        <div class="stat-card">
          <div class="stat-label">Clientes</div>
          <div class="stat-value">${clients.length}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Em dia</div>
          <div class="stat-value emerald">${clients.length - nComAberto}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Com valor em aberto</div>
          <div class="stat-value brick">${nComAberto}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Mensalidade automática</div>
          <div class="stat-value">${nRecorrentes}</div>
        </div>
      </div>

      <div class="filter-bar">
        <input class="input filter-search" id="cliBusca" type="search" placeholder="🔍 Buscar por nome, telefone, e-mail ou cidade" value="${escapeHtml(_clientesFiltro.busca)}">
        <select class="input filter-select" id="cliStatus">
          <option value="todos" ${_clientesFiltro.status === 'todos' ? 'selected' : ''}>Todos</option>
          <option value="aberto" ${_clientesFiltro.status === 'aberto' ? 'selected' : ''}>Com valor em aberto</option>
          <option value="atrasado" ${_clientesFiltro.status === 'atrasado' ? 'selected' : ''}>Com atraso</option>
          <option value="emdia" ${_clientesFiltro.status === 'emdia' ? 'selected' : ''}>Em dia</option>
          <option value="recorrente" ${_clientesFiltro.status === 'recorrente' ? 'selected' : ''}>Mensalidade automática</option>
        </select>
        <select class="input filter-select" id="cliOrdem">
          <option value="nome" ${_clientesFiltro.ordem === 'nome' ? 'selected' : ''}>Ordem: nome (A–Z)</option>
          <option value="aberto" ${_clientesFiltro.ordem === 'aberto' ? 'selected' : ''}>Ordem: maior valor em aberto</option>
        </select>
      </div>

      <div id="clientesLista"></div>
    `}
  `;

  qs('#btnNovoCliente').onclick = () => openClientModal();
  if (clients.length === 0) return;

  function pintarLista() {
    const termo = semAcento(_clientesFiltro.busca.trim());
    let lista = clients.filter(c => {
      if (termo) {
        const alvo = semAcento([c.nome, c.telefone, c.email, c.cidade, c.plano].join(' '));
        if (!alvo.includes(termo)) return false;
      }
      const v = aberto[c.id] || 0;
      switch (_clientesFiltro.status) {
        case 'aberto': return v > 0;
        case 'atrasado': return atrasados.has(c.id);
        case 'emdia': return v === 0;
        case 'recorrente': return !!c.recorrente;
        default: return true;
      }
    });
    lista = lista.slice().sort((a, b) => _clientesFiltro.ordem === 'aberto'
      ? ((aberto[b.id] || 0) - (aberto[a.id] || 0)) || a.nome.localeCompare(b.nome, 'pt-BR')
      : a.nome.localeCompare(b.nome, 'pt-BR'));

    qs('#clientesLista').innerHTML = lista.length === 0
      ? emptyState('Nenhum cliente encontrado', 'Tente outra busca ou mude o filtro.')
      : `
      <div class="ledger">
        ${lista.map(c => {
          const v = aberto[c.id] || 0;
          const contato = [c.telefone, c.email, c.cidade].filter(Boolean).map(escapeHtml).join(' · ') || 'sem contato';
          return `
          <div class="ledger-row client-row client-row-click" data-row-client="${c.id}">
            <div class="client-avatar">${escapeHtml(iniciaisNome(c.nome))}</div>
            <div class="ledger-main">
              <div class="ledger-title">${escapeHtml(c.nome)}${c.plano ? ` <span class="avulso-tag">${escapeHtml(c.plano)}</span>` : ''}</div>
              <div class="ledger-sub">${contato}</div>
            </div>
            <div class="client-status">
              ${c.recorrente ? `<span class="stamp-badge stamp-pausado">🔁 dia ${diaVencimentoValido(c.diaVencimento)}</span>` : ''}
              ${v > 0
                ? `<span class="stamp-badge ${atrasados.has(c.id) ? 'stamp-atrasado' : 'stamp-pendente'}">${formatCurrency(v)} em aberto</span>`
                : `<span class="stamp-badge stamp-pago">Em dia</span>`}
            </div>
            <div class="ledger-actions">
              <button class="btn btn-primary btn-sm" data-view-client="${c.id}">Ver</button>
              <button class="btn btn-ghost btn-sm" data-edit-client="${c.id}">Editar</button>
              <button class="btn btn-danger btn-sm" data-del-client="${c.id}">Excluir</button>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="view-desc" style="margin-top:10px;">${lista.length} de ${clients.length} cliente${clients.length > 1 ? 's' : ''}</div>
    `;

    qsa('[data-view-client]').forEach(b => b.onclick = (e) => { e.stopPropagation(); renderClienteDetalhe(b.dataset.viewClient); });
    qsa('[data-edit-client]').forEach(b => b.onclick = (e) => { e.stopPropagation(); openClientModal(b.dataset.editClient); });
    qsa('[data-del-client]').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      const id = b.dataset.delClient;
      const temCobranca = getCharges().some(ch => ch.clientId === id);
      const msg = temCobranca
        ? 'Este cliente tem cobranças lançadas. Excluir o cliente também vai apagar as cobranças dele. Confirma?'
        : 'Excluir este cliente?';
      if (confirm(msg)) {
        saveClients(getClients().filter(c => c.id !== id));
        saveCharges(getCharges().filter(ch => ch.clientId !== id));
        renderClientes();
      }
    });
    qsa('[data-row-client]').forEach(row => row.onclick = () => renderClienteDetalhe(row.dataset.rowClient));
  }

  qs('#cliBusca').oninput = (e) => { _clientesFiltro.busca = e.target.value; pintarLista(); };
  qs('#cliStatus').onchange = (e) => { _clientesFiltro.status = e.target.value; pintarLista(); };
  qs('#cliOrdem').onchange = (e) => { _clientesFiltro.ordem = e.target.value; pintarLista(); };
  pintarLista();
}

function openClientModal(id, onSaved) {
  const editing = id ? clientById(id) : null;
  const outrosClientes = getClients().filter(c => !editing || c.id !== editing.id);

  openModal(`
    <div class="modal-title">${editing ? 'Editar cliente' : 'Novo cliente'}</div>
    <form id="clientForm">
      <div class="field">
        <label class="field-label">Nome</label>
        <input class="input" id="cNome" required value="${editing ? escapeHtml(editing.nome) : ''}">
      </div>
      <div class="field">
        <label class="field-label">WhatsApp (com DDD e código do país)</label>
        <input class="input" id="cTelefone" placeholder="Ex: 55 45 99999-8888" required value="${editing ? escapeHtml(editing.telefone) : ''}">
      </div>
      <div class="field">
        <label class="field-label">E-mail (opcional)</label>
        <input class="input" type="email" id="cEmail" value="${editing ? escapeHtml(editing.email || '') : ''}">
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Tipo</label>
          <select class="input" id="cTipo">
            <option value="pf" ${editing && editing.tipo === 'pf' ? 'selected' : ''}>Pessoa física</option>
            <option value="pj" ${editing && editing.tipo === 'pj' ? 'selected' : ''}>Pessoa jurídica</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label">CPF / CNPJ (opcional)</label>
          <input class="input" id="cDocumento" placeholder="Só números" value="${editing ? escapeHtml(formatDocumento(editing.documento || '')) : ''}">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Cidade / UF (opcional)</label>
          <input class="input" id="cCidade" placeholder="Ex: Salto do Lontra/PR" value="${editing ? escapeHtml(editing.cidade || '') : ''}">
        </div>
        <div class="field">
          <label class="field-label">Cliente desde</label>
          <input class="input" type="date" id="cDesde" value="${editing ? (editing.clienteDesde || '') : todayISO()}">
        </div>
      </div>
      <div class="field">
        <label class="field-label">Endereço (opcional)</label>
        <input class="input" id="cEndereco" placeholder="Rua, número, bairro" value="${editing ? escapeHtml(editing.endereco || '') : ''}">
      </div>
      <div class="field">
        <label class="field-label">Pasta de documentos (link, opcional)</label>
        <input class="input" type="url" id="cPasta" placeholder="Ex: link do Google Drive, Dropbox..." value="${editing ? escapeHtml(editing.pastaDocumentos || '') : ''}">
      </div>

      <div class="field-row">
        <div class="field">
          <label class="field-label">Data de nascimento (opcional)</label>
          <input class="input" type="date" id="cNascimento" value="${editing ? (editing.dataNascimento || '') : ''}">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Contato de emergência — nome (opcional)</label>
          <input class="input" id="cEmergenciaNome" value="${editing ? escapeHtml(editing.emergenciaNome || '') : ''}">
        </div>
        <div class="field">
          <label class="field-label">Contato de emergência — telefone (opcional)</label>
          <input class="input" id="cEmergenciaTelefone" placeholder="Com DDD" value="${editing ? escapeHtml(editing.emergenciaTelefone || '') : ''}">
        </div>
      </div>

      <div class="field">
        <label class="field-label">Plano contratado</label>
        <select class="input" id="cPlanoId">
          <option value="">— nenhum —</option>
          ${getMensalidades().map(p => `<option value="${p.id}" ${editing && editing.planoId === p.id ? 'selected' : ''}>${p.nome} — ${formatCurrency(p.valor)}/mês</option>`).join('')}
          <option value="personalizado" ${editing && editing.planoId === 'personalizado' ? 'selected' : ''}>Personalizado</option>
        </select>
      </div>
      <div class="field-row" id="cPlanoPersonalizadoRow" style="${editing && editing.planoId === 'personalizado' ? '' : 'display:none;'}">
        <div class="field">
          <label class="field-label">Nome do plano personalizado</label>
          <input class="input" id="cPlanoPersonalizado" value="${editing && editing.planoId === 'personalizado' ? escapeHtml(editing.plano || '') : ''}">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Valor do plano (R$/mês)</label>
          <input class="input" type="number" min="0" step="0.01" id="cValorPlano" value="${editing && editing.valorPlano != null ? editing.valorPlano : ''}">
        </div>
      </div>

      <div class="field">
        <label style="display:flex; align-items:center; gap:8px; font-size:14px; cursor:pointer;">
          <input type="checkbox" id="cRecorrente" ${editing && editing.recorrente ? 'checked' : ''}>
          <span>🔁 Lançar a mensalidade automaticamente todo mês</span>
        </label>
      </div>
      <div class="field-row" id="cRecorrenciaRow" style="${editing && editing.recorrente ? '' : 'display:none;'}">
        <div class="field">
          <label class="field-label">Dia do vencimento (1 a 28)</label>
          <input class="input" type="number" min="1" max="28" id="cDiaVenc" value="${editing && editing.diaVencimento ? editing.diaVencimento : 5}">
        </div>
        <div class="field">
          <label class="field-label">Começar a lançar em</label>
          <input class="input" type="month" id="cRecInicio" value="${editing && editing.recorrenciaInicio ? editing.recorrenciaInicio : todayISO().slice(0, 7)}">
        </div>
      </div>

      <div class="field" id="cFormaRecRow" style="${editing && editing.recorrente ? '' : 'display:none;'}">
        <label class="field-label">Como este cliente paga a mensalidade</label>
        <select class="input" id="cFormaRec">
          <option value="pix" ${formaRecorrenciaDoCliente(editing) === 'pix' ? 'selected' : ''}>Pix (QR Code + copia e cola)</option>
          <option value="boleto" ${formaRecorrenciaDoCliente(editing) === 'boleto' ? 'selected' : ''}>Boleto (eu gero e anexo a cada mês)</option>
          <option value="cartao" ${formaRecorrenciaDoCliente(editing) === 'cartao' ? 'selected' : ''}>Cartão (link de pagamento a cada mês)</option>
        </select>
        <div class="view-desc" style="margin-top:4px;">Boleto e cartão: a mensalidade é lançada sozinha, mas fica marcada como "falta boleto/link" até você anexar. Aí a mensagem sai com os dados certos.</div>
      </div>
      <div id="cPixRow" style="${editing && editing.recorrente && formaRecorrenciaDoCliente(editing) === 'pix' ? '' : 'display:none;'}">
        <div class="field">
          <label class="field-label">🔑 Chave Pix deste cliente (opcional)</label>
          <input class="input" id="cPixChave" placeholder="CPF, CNPJ, e-mail, celular ou chave aleatória" value="${editing ? escapeHtml(editing.pixChave || '') : ''}">
          <div class="view-desc" style="margin-top:4px;">Se ficar vazio, usa a chave geral das Configurações. Celular: digite com +55 e DDD (ex: +5546999998888) pra não confundir com CPF.</div>
        </div>
        <div class="field">
          <label class="field-label">Nome do titular da chave (opcional)</label>
          <input class="input" id="cPixTitular" maxlength="25" placeholder="Aparece no app do banco ao pagar" value="${editing ? escapeHtml(editing.pixTitular || '') : ''}">
        </div>
      </div>

      <div class="field">
        <label class="field-label">Indicado por (opcional)</label>
        <select class="input" id="cIndicadoPor">
          <option value="">— ninguém / indicação externa —</option>
          ${outrosClientes.map(c => `<option value="${c.id}" ${editing && editing.indicadoPor === c.id ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field-label">Ou nome de quem indicou (se não for um cliente cadastrado)</label>
        <input class="input" id="cIndicadoPorTexto" placeholder="Ex: indicação de um amigo" value="${editing ? escapeHtml(editing.indicadoPorTexto || '') : ''}">
      </div>

      <div class="field">
        <label class="field-label">Observações (opcional)</label>
        <textarea class="input" id="cObs" style="min-height:60px; font-family:inherit; font-size:14px;">${editing ? escapeHtml(editing.obs || '') : ''}</textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="btnCancelClient">Cancelar</button>
        <button type="submit" class="btn btn-primary">${editing ? 'Salvar' : 'Cadastrar'}</button>
      </div>
    </form>
  `);
  qs('#btnCancelClient').onclick = closeModal;

  qs('#cTelefone').addEventListener('input', e => { e.target.value = formatTelefoneBR(e.target.value); });
  qs('#cEmergenciaTelefone').addEventListener('input', e => { e.target.value = formatTelefoneBR(e.target.value); });
  qs('#cDocumento').addEventListener('input', e => { e.target.value = formatDocumento(onlyDigits(e.target.value).slice(0, 14)); });
  qs('#cTipo').onchange = () => {
    const tipo = qs('#cTipo').value;
    const doc = qs('#cDocumento');
    doc.placeholder = tipo === 'pj' ? '00.000.000/0000-00' : '000.000.000-00';
    doc.value = formatDocumento(onlyDigits(doc.value).slice(0, tipo === 'pj' ? 14 : 11));
  };
  qs('#cTipo').dispatchEvent(new Event('change'));

  qs('#cPlanoId').onchange = () => {
    const id = qs('#cPlanoId').value;
    qs('#cPlanoPersonalizadoRow').style.display = id === 'personalizado' ? '' : 'none';
    const plano = planoById(id);
    if (plano) qs('#cValorPlano').value = plano.valor;
  };
  const atualizarRecVisivel = () => {
    const rec = qs('#cRecorrente').checked;
    qs('#cRecorrenciaRow').style.display = rec ? '' : 'none';
    qs('#cFormaRecRow').style.display = rec ? '' : 'none';
    qs('#cPixRow').style.display = rec && qs('#cFormaRec').value === 'pix' ? '' : 'none';
  };
  qs('#cRecorrente').onchange = atualizarRecVisivel;
  qs('#cFormaRec').onchange = atualizarRecVisivel;
  qs('#clientForm').onsubmit = (e) => {
    e.preventDefault();

    const nome = qs('#cNome').value.trim();
    if (nome.length < 2) {
      alert('Digite o nome completo do cliente.');
      return;
    }

    const telefoneDigits = onlyDigits(qs('#cTelefone').value);
    if (telefoneDigits.length !== 10 && telefoneDigits.length !== 11) {
      alert('Confira o telefone: informe DDD + número (ex.: (45) 99999-8888).');
      return;
    }

    const emailVal = qs('#cEmail').value.trim();
    if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      alert('Esse e-mail não parece válido. Confira ou deixe em branco.');
      return;
    }

    const documentoDigits = onlyDigits(qs('#cDocumento').value);
    const tipoCliente = qs('#cTipo').value;
    if (documentoDigits && !documentoValido(documentoDigits, tipoCliente)) {
      alert(tipoCliente === 'pj' ? 'Informe um CNPJ válido.' : 'Informe um CPF válido.');
      return;
    }

    let pastaDocumentos = qs('#cPasta').value.trim();
    if (pastaDocumentos && !/^https?:\/\//i.test(pastaDocumentos)) {
      pastaDocumentos = 'https://' + pastaDocumentos;
    }

    const planoId = qs('#cPlanoId').value;
    let planoNome = '';
    if (planoId === 'personalizado') {
      planoNome = qs('#cPlanoPersonalizado').value.trim();
      if (!planoNome) {
        alert('Digite o nome do plano personalizado.');
        return;
      }
    } else if (planoId) {
      planoNome = planoById(planoId).nome;
    }

    const valorPlanoRaw = qs('#cValorPlano').value;
    if (valorPlanoRaw !== '' && Number(valorPlanoRaw) < 0) {
      alert('O valor do plano não pode ser negativo.');
      return;
    }

    const recorrente = qs('#cRecorrente').checked;
    if (recorrente && !(Number(valorPlanoRaw) > 0)) {
      alert('Pra lançar a mensalidade todo mês, informe o valor do plano (R$/mês).');
      return;
    }

    const pixChaveRaw = qs('#cPixChave').value.trim();
    if (pixChaveRaw && !/^[\x21-\x7E]+$/.test(normalizarChavePix(pixChaveRaw))) {
      alert('A chave Pix não pode ter espaços ou caracteres especiais. Confira e tente de novo.');
      return;
    }

    const indicadoPor = qs('#cIndicadoPor').value;
    if (editing && indicadoPor === editing.id) {
      alert('Um cliente não pode ser indicado por ele mesmo.');
      return;
    }

    const clients = getClients();
    const extra = {
      tipo: tipoCliente,
      documento: documentoDigits,
      cidade: qs('#cCidade').value.trim(),
      endereco: qs('#cEndereco').value.trim(),
      pastaDocumentos,
      dataNascimento: qs('#cNascimento').value || null,
      emergenciaNome: qs('#cEmergenciaNome').value.trim(),
      emergenciaTelefone: onlyDigits(qs('#cEmergenciaTelefone').value) || null,
      clienteDesde: qs('#cDesde').value || null,
      planoId: planoId || null,
      plano: planoNome,
      valorPlano: valorPlanoRaw === '' ? null : Number(valorPlanoRaw),
      indicadoPor: indicadoPor || null,
      indicadoPorTexto: qs('#cIndicadoPorTexto').value.trim(),
      recorrente,
      diaVencimento: diaVencimentoValido(qs('#cDiaVenc').value),
      recorrenciaInicio: qs('#cRecInicio').value || todayISO().slice(0, 7),
      pixChave: pixChaveRaw,
      pixTitular: qs('#cPixTitular').value.trim(),
      formaPagamentoRecorrente: qs('#cFormaRec').value
    };
    if (editing) {
      const idx = clients.findIndex(c => c.id === editing.id);
      clients[idx] = { ...editing, nome, telefone: telefoneDigits, email: emailVal, obs: qs('#cObs').value.trim(), ...extra };
    } else {
      clients.push({ id: uid(), nome, telefone: telefoneDigits, email: emailVal, obs: qs('#cObs').value.trim(), projetos: [], ...extra });
    }
    saveClients(clients);
    closeModal();
    if (onSaved) onSaved(); else renderClientes();
  };
}

// ---------- DETALHE DO CLIENTE (dados + projetos + cobranças + reuniões) ----------
function renderClienteDetalhe(clientId) {
  const client = clientById(clientId);
  if (!client) { navigate('clientes'); return; }
  currentDetailClientId = clientId;
  if (!client.projetos) client.projetos = [];

  const charges = getCharges().filter(c => c.clientId === clientId).sort((a, b) => b.vencimento.localeCompare(a.vencimento));
  const meetings = getMeetings().filter(m => m.clientId === clientId).sort((a, b) => (b.data + (b.hora || '')).localeCompare(a.data + (a.hora || '')));

  const statusLabel = { andamento: 'Em andamento', concluido: 'Concluído', pausado: 'Pausado' };
  const statusClass = { andamento: 'stamp-pendente', concluido: 'stamp-pago', pausado: 'stamp-pausado' };

  const settings = getSettings();
  const indicadorNome = client.indicadoPor
    ? (clientById(client.indicadoPor) ? clientById(client.indicadoPor).nome : 'Cliente removido')
    : (client.indicadoPorTexto || '—');
  const indicados = getClients().filter(c => c.indicadoPor === client.id);
  const descontoPorIndicacao = Number(settings.valorDescontoIndicacao) || 0;
  const descontoTotal = indicados.length * descontoPorIndicacao;

  qs('#main').innerHTML = `
    <button class="btn btn-ghost btn-sm" id="btnVoltarClientes" style="margin-bottom:18px;">← Voltar para clientes</button>

    <div class="view-header">
      <div>
        <div class="view-title">${escapeHtml(client.nome)}</div>
        <div class="view-desc">
          ${escapeHtml(client.telefone)} ${client.email ? '· ' + escapeHtml(client.email) : ''}
          ${client.tipo ? '· ' + (client.tipo === 'pj' ? 'Pessoa jurídica' : 'Pessoa física') : ''}
          ${client.documento ? '· ' + escapeHtml(formatDocumento(client.documento)) : ''}
        </div>
        <div class="view-desc">
          ${client.cidade ? escapeHtml(client.cidade) : ''}${client.endereco ? (client.cidade ? ' · ' : '') + escapeHtml(client.endereco) : ''}
          ${client.clienteDesde ? (client.cidade || client.endereco ? ' · ' : '') + 'Cliente desde ' + formatDateBR(client.clienteDesde) : ''}
        </div>
        <div class="view-desc">
          ${client.dataNascimento ? '🎂 ' + formatDataAniversario(client.dataNascimento) : ''}
          ${client.emergenciaNome ? (client.dataNascimento ? ' · ' : '') + '🆘 ' + escapeHtml(client.emergenciaNome) + (client.emergenciaTelefone ? ' (' + escapeHtml(client.emergenciaTelefone) + ')' : '') : ''}
        </div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        ${client.pastaDocumentos ? `<a class="btn btn-ghost btn-sm" href="${escapeHtml(client.pastaDocumentos)}" target="_blank" rel="noopener">📁 Pasta de documentos</a>` : ''}
        ${client.dataNascimento ? `<button class="btn btn-whatsapp btn-sm" id="btnFelicitar">🎉 Enviar felicitações</button>` : ''}
        <button class="btn btn-ghost btn-sm" id="btnEditarNoDetalhe">Editar dados</button>
        <button class="btn btn-primary btn-sm" id="btnNovaReuniaoDetalhe">+ Reunião</button>
      </div>
    </div>

    ${client.obs ? `<p class="view-desc" style="margin:-14px 0 22px;">${escapeHtml(client.obs)}</p>` : ''}

    <div class="section-title">Plano e indicações</div>
    <div class="cards-grid cards-grid-3" style="margin-bottom:16px;">
      <div class="stat-card">
        <div class="stat-label">Plano</div>
        <div class="stat-value" style="font-size:16px;">${client.plano ? escapeHtml(client.plano) : '—'}</div>
        ${client.valorPlano != null ? `<div class="view-desc" style="margin-top:4px;">${formatCurrency(client.valorPlano)}/mês</div>` : ''}
        ${client.recorrente ? `<div class="view-desc" style="margin-top:4px;">🔁 Lançamento automático, vence dia ${diaVencimentoValido(client.diaVencimento)} · paga via ${{ pix: 'Pix', boleto: 'boleto', cartao: 'cartão' }[formaRecorrenciaDoCliente(client)]}</div>` : ''}
        ${client.pixChave ? `<div class="view-desc" style="margin-top:4px;">🔑 Pix próprio: ${escapeHtml(client.pixChave)}</div>` : ''}
      </div>
      <div class="stat-card">
        <div class="stat-label">Indicado por</div>
        <div class="stat-value" style="font-size:16px;">${escapeHtml(indicadorNome)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Indicações feitas</div>
        <div class="stat-value emerald" style="font-size:16px;">${indicados.length}</div>
        ${descontoTotal > 0 ? `<div class="view-desc" style="margin-top:4px;">${formatCurrency(descontoTotal)} em desconto acumulado</div>` : ''}
      </div>
      <div class="stat-card">
        <div class="stat-label">Mensalidades isentas</div>
        <div class="stat-value emerald" style="font-size:16px;">${Number(client.isencoesDisponiveis) || 0} disponível(is)</div>
        <div class="view-desc" style="margin-top:4px;">${Number(client.isencoesGanhas) || 0} ganha(s) · ${Number(client.isencoesUsadas) || 0} usada(s)</div>
      </div>
    </div>
    ${indicados.length > 0 ? `
      <div class="ledger" style="margin-bottom:30px;">
        ${indicados.map(c => `
          <div class="ledger-row">
            <div class="ledger-main">
              <div class="ledger-title">${escapeHtml(c.nome)}</div>
              <div class="ledger-sub">indicado(a) por ${escapeHtml(client.nome)}</div>
            </div>
            <button class="btn btn-ghost btn-sm" data-view-client="${c.id}">Ver</button>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${client.valorPlano ? `
      <div class="section-title">Pagamento antecipado (com desconto)</div>
      <div class="ledger" style="margin-bottom:30px;">
        ${DESCONTOS_PERIODICIDADE.map(d => {
          const calc = calcularAntecipado(client.valorPlano, d.meses, d.desconto);
          return `
          <div class="ledger-row">
            <div class="ledger-main">
              <div class="ledger-title">${d.label} (${d.meses} meses) — ${(d.desconto * 100).toFixed(0)}% de desconto</div>
              <div class="ledger-sub">De ${formatCurrency(calc.semDesconto)} por ${formatCurrency(calc.comDesconto)} · economia de ${formatCurrency(calc.economia)}</div>
            </div>
            <div class="ledger-value">${formatCurrency(calc.comDesconto)}</div>
            <div class="ledger-actions">
              <button class="btn btn-ghost btn-sm" data-lancar-antecipado="${d.meses}">Lançar cobrança</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    ` : ''}

    <div class="section-title" style="display:flex; align-items:center; justify-content:space-between;">
      <span>O que está sendo desenvolvido</span>
      <button class="btn btn-ghost btn-sm" id="btnNovoProjeto">+ Projeto</button>
    </div>
    ${client.projetos.length === 0 ? emptyState('Nada cadastrado ainda', 'Registre o que você está desenvolvendo ou já entregou para este cliente.') : `
      <div class="ledger" style="margin-bottom:30px;">
        ${client.projetos.slice().reverse().map(p => `
          <div class="ledger-row">
            <div class="ledger-main">
              <div class="ledger-title">${escapeHtml(p.titulo)}</div>
              ${p.descricao ? `<div class="ledger-sub">${escapeHtml(p.descricao)}</div>` : ''}
            </div>
            <span class="stamp-badge ${statusClass[p.status]}">${statusLabel[p.status]}</span>
            <div class="ledger-actions">
              <button class="btn btn-ghost btn-sm" data-edit-proj="${p.id}">Editar</button>
              <button class="btn btn-danger btn-sm" data-del-proj="${p.id}">Excluir</button>
            </div>
          </div>
        `).join('')}
      </div>
    `}

    <div class="section-title">Cobranças deste cliente</div>
    <div style="margin-bottom:30px;">
      ${charges.length === 0 ? emptyState('Nenhuma cobrança', 'Ainda não há cobranças lançadas para este cliente.') : renderChargesComPagas(charges, { compact: false })}
    </div>

    <div class="section-title">Reuniões com este cliente</div>
    ${meetings.length === 0 ? emptyState('Nenhuma reunião', 'Agende a primeira reunião com este cliente.') : `
      <div class="ledger">
        ${meetings.map(m => renderMeetingRow(m)).join('')}
      </div>
    `}
  `;

  qs('#btnVoltarClientes').onclick = () => navigate('clientes');
  qs('#btnEditarNoDetalhe').onclick = () => openClientModal(client.id, () => renderClienteDetalhe(client.id));
  const btnFelicitar = qs('#btnFelicitar');
  if (btnFelicitar) btnFelicitar.onclick = () => openSendWhatsappModal(`Enviar felicitações — ${client.nome}`, client, buildBirthdayMessage(client));
  qs('#btnNovoProjeto').onclick = () => openProjectModal(client.id);
  qs('#btnNovaReuniaoDetalhe').onclick = () => openMeetingModal(null, client.id, () => renderClienteDetalhe(client.id));
  qsa('[data-lancar-antecipado]').forEach(b => b.onclick = () => {
    const meses = Number(b.dataset.lancarAntecipado);
    const d = DESCONTOS_PERIODICIDADE.find(x => x.meses === meses);
    const calc = calcularAntecipado(client.valorPlano, d.meses, d.desconto);
    openChargeModal({
      clientId: client.id,
      descricao: `${d.label} (${d.meses} meses) — ${client.plano || 'plano'} com ${(d.desconto * 100).toFixed(0)}% de desconto`,
      tipo: 'mensalidade',
      valor: calc.comDesconto
    }, () => renderClienteDetalhe(client.id));
  });
  qsa('[data-view-client]').forEach(b => b.onclick = () => renderClienteDetalhe(b.dataset.viewClient));
  qsa('[data-edit-proj]').forEach(b => b.onclick = () => openProjectModal(client.id, b.dataset.editProj));
  qsa('[data-del-proj]').forEach(b => b.onclick = () => {
    if (confirm('Excluir este projeto?')) {
      const c = clientById(client.id);
      c.projetos = c.projetos.filter(p => p.id !== b.dataset.delProj);
      const clients = getClients();
      saveClients(clients.map(x => x.id === c.id ? c : x));
      renderClienteDetalhe(client.id);
    }
  });
  bindChargeActions();
  bindMeetingActions(() => renderClienteDetalhe(client.id));
}

function openProjectModal(clientId, projectId) {
  const client = clientById(clientId);
  const editing = projectId ? client.projetos.find(p => p.id === projectId) : null;

  openModal(`
    <div class="modal-title">${editing ? 'Editar projeto' : 'Novo projeto'}</div>
    <form id="projForm">
      <div class="field">
        <label class="field-label">Título</label>
        <input class="input" id="pTitulo" placeholder="Ex: Site institucional" required value="${editing ? escapeHtml(editing.titulo) : ''}">
      </div>
      <div class="field">
        <label class="field-label">Descrição (opcional)</label>
        <textarea class="input" id="pDescricao" style="min-height:70px; font-family:inherit; font-size:14px;">${editing ? escapeHtml(editing.descricao || '') : ''}</textarea>
      </div>
      <div class="field">
        <label class="field-label">Status</label>
        <select class="input" id="pStatus">
          <option value="andamento" ${editing && editing.status === 'andamento' ? 'selected' : ''}>Em andamento</option>
          <option value="concluido" ${editing && editing.status === 'concluido' ? 'selected' : ''}>Concluído</option>
          <option value="pausado" ${editing && editing.status === 'pausado' ? 'selected' : ''}>Pausado</option>
        </select>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="btnCancelProj">Cancelar</button>
        <button type="submit" class="btn btn-primary">${editing ? 'Salvar' : 'Adicionar'}</button>
      </div>
    </form>
  `);
  qs('#btnCancelProj').onclick = closeModal;
  qs('#projForm').onsubmit = (e) => {
    e.preventDefault();
    const titulo = qs('#pTitulo').value.trim();
    if (!titulo) return;
    if (!client.projetos) client.projetos = [];
    if (editing) {
      Object.assign(editing, { titulo, descricao: qs('#pDescricao').value.trim(), status: qs('#pStatus').value });
    } else {
      client.projetos.push({ id: uid(), titulo, descricao: qs('#pDescricao').value.trim(), status: qs('#pStatus').value });
    }
    saveClients(getClients().map(c => c.id === client.id ? client : c));
    closeModal();
    renderClienteDetalhe(client.id);
  };
}

// ---------- COBRANÇAS ----------
function renderCobrancas() {
  const charges = getCharges().sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  qs('#main').innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">Cobranças</div>
        <div class="view-desc">Lance cobranças de clientes ou vendas avulsas (quem não é cliente fixo)</div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-ghost" id="btnVerRecorrencias">🔁 Recorrências (${getClients().filter(c => c.recorrente).length})</button>
        <button class="btn btn-primary" id="btnNovaCobranca">+ Nova cobrança</button>
      </div>
    </div>
    ${charges.length === 0 ? emptyState('Nenhuma cobrança lançada', 'Clique em "Nova cobrança" para começar.') :
      renderChargesComPagas(charges, { compact: false })}
  `;

  qs('#btnNovaCobranca').onclick = () => openChargeModal();
  qs('#btnVerRecorrencias').onclick = () => { _servicosTab = 'mensalidades'; _mensSubtab = 'recorrentes'; navigate('servicos'); };
  bindChargeActions();
}

// Separa as cobranças: em aberto ficam à vista; as pagas "descem" pra uma
// seção recolhida no fim da lista (ainda dá pra abrir, buscar, ver recibo etc.).
function renderChargesComPagas(charges, opts = {}) {
  const abertas = charges.filter(c => chargeStatus(c) !== 'pago')
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const pagas = charges.filter(c => chargeStatus(c) === 'pago')
    .sort((a, b) => (b.dataPagamento || b.vencimento).localeCompare(a.dataPagamento || a.vencimento));
  const totalPagas = pagas.reduce((sum, c) => sum + Number(c.valor || 0), 0);

  const blocoAbertas = abertas.length
    ? renderChargeLedger(abertas, opts)
    : emptyState('Tudo em dia', 'Nenhuma cobrança em aberto.');

  const blocoPagas = pagas.length ? `
    <details class="pagas-box">
      <summary>✅ Cobranças pagas (${pagas.length}) · ${formatCurrency(totalPagas)}</summary>
      <input type="search" class="input pagas-busca" placeholder="Buscar nas pagas (cliente, descrição...)">
      <div class="pagas-lista">${renderChargeLedger(pagas, opts)}</div>
    </details>` : '';

  return blocoAbertas + blocoPagas;
}

function renderChargeLedger(charges, opts = {}) {
  if (charges.length === 0) return emptyState('Nada por aqui', 'Nenhuma cobrança encontrada.');
  return `
    <div class="ledger">
      ${charges.map(c => {
        const client = c.clientId ? clientById(c.clientId) : null;
        const nomeExibicao = client ? client.nome : (c.avulsoNome || 'Cliente removido');
        const temContato = !!(client || (c.avulsoTelefone && c.avulsoTelefone.length >= 10));
        const status = chargeStatus(c);
        const stampClass = { pago: 'stamp-pago', pendente: 'stamp-pendente', atrasado: 'stamp-atrasado' }[status];
        const stampLabel = c.isenta ? 'Isenta' : { pago: 'Pago', pendente: 'Pendente', atrasado: 'Atrasado' }[status];
        const podeIsentar = status !== 'pago' && c.tipo === 'mensalidade' && client && (Number(client.isencoesDisponiveis) || 0) > 0;
        return `
        <div class="ledger-row">
          <div class="ledger-main">
            <div class="ledger-title">${escapeHtml(nomeExibicao)}${!client && c.avulsoNome ? ' <span class="avulso-tag">avulsa</span>' : ''}${c.recorrente ? ' <span class="avulso-tag">🔁 mensal</span>' : ''}${chargeFaltaDados(c).length ? ` <span class="avulso-tag" style="background:var(--stamp-pendente-bg, #f3e3b3);">⏳ falta ${chargeFaltaDados(c).map(k => FALTA_LABEL[k]).join(' e ')}</span>` : ''}</div>
            <div class="ledger-sub">${escapeHtml(c.descricao)} · vence ${formatDateBR(c.vencimento)}${status === 'pago' && c.formaPagamentoUsada ? ' · pago via ' + formaPagamentoLabel(c.formaPagamentoUsada) : ''}</div>
          </div>
          <span class="stamp-badge ${stampClass}">${stampLabel}</span>
          <div class="ledger-value">${formatCurrency(c.valor)}</div>
          <div class="ledger-actions">
            ${status !== 'pago' && !c.isenta && (c.formasPagamento || []).some(f => f === 'boleto' || f === 'cartao') ? `<button class="btn btn-ghost btn-sm" data-dados-charge="${c.id}">${(c.formasPagamento || []).includes('boleto') && (c.formasPagamento || []).includes('cartao') ? '🧾 Boleto/cartão' : (c.formasPagamento || []).includes('boleto') ? '🧾 Boleto' : '💳 Link cartão'}</button>` : ''}
            ${status !== 'pago' && !c.isenta && Number(c.valor) > 0 && chargeAceitaPix(c, client) && pixConfigParaCliente(client).chave ? `<button class="btn btn-ghost btn-sm" data-pix-charge="${c.id}">QR Pix</button>` : ''}
            ${status !== 'pago' && temContato ? `<button class="btn btn-whatsapp btn-sm" data-send-charge="${c.id}">Enviar</button>` : ''}
            ${status !== 'pago' ? `<button class="btn btn-ghost btn-sm" data-pay-charge="${c.id}">Marcar pago</button>` : ''}
            ${podeIsentar ? `<button class="btn btn-ghost btn-sm" data-isentar-charge="${c.id}">🎁 Isentar</button>` : ''}
            ${status === 'pago' && !c.isenta ? `<button class="btn btn-ghost btn-sm" data-recibo-charge="${c.id}">🧾 Recibo</button>` : ''}
            ${status === 'pago' && !c.isenta && c.comprovanteLink ? `<a class="btn btn-ghost btn-sm" href="${escapeHtml(c.comprovanteLink)}" target="_blank" rel="noopener">📎 Comprovante</a>` : ''}
            ${status === 'pago' && !c.isenta && !c.comprovanteLink ? `<button class="btn btn-ghost btn-sm" data-add-comprovante="${c.id}">📎 + Comprovante</button>` : ''}
            ${!opts.compact ? `<button class="btn btn-danger btn-sm" data-del-charge="${c.id}">Excluir</button>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
}

function bindChargeActions() {
  qsa('.pagas-busca').forEach(inp => inp.oninput = () => {
    const termo = inp.value.trim().toLowerCase();
    inp.parentElement.querySelectorAll('.ledger-row').forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(termo) ? '' : 'none';
    });
  });
  qsa('[data-pix-charge]').forEach(b => b.onclick = () => openPixQrModal(b.dataset.pixCharge));
  qsa('[data-dados-charge]').forEach(b => b.onclick = () => openDadosPagamentoModal(b.dataset.dadosCharge));
  qsa('[data-send-charge]').forEach(b => b.onclick = () => openWhatsappModal(b.dataset.sendCharge));
  qsa('[data-pay-charge]').forEach(b => b.onclick = () => openMarkPaidModal(b.dataset.payCharge));
  qsa('[data-isentar-charge]').forEach(b => b.onclick = () => isentarCobranca(b.dataset.isentarCharge));
  qsa('[data-add-comprovante]').forEach(b => b.onclick = () => openComprovanteModal(b.dataset.addComprovante));
  qsa('[data-recibo-charge]').forEach(b => b.onclick = () => gerarReciboPDF(b.dataset.reciboCharge));
  qsa('[data-del-charge]').forEach(b => b.onclick = () => {
    if (confirm('Excluir esta cobrança?')) {
      saveCharges(getCharges().filter(c => c.id !== b.dataset.delCharge));
      navigate(currentView);
    }
  });
}

function formaPagamentoLabel(valor) {
  const labels = {
    pix: 'PIX', PIX: 'PIX',
    cartao_credito: 'Cartão de crédito',
    cartao_debito: 'Cartão de débito',
    boleto: 'Boleto bancário',
    dinheiro: 'Dinheiro',
    transferencia: 'Transferência bancária',
    outro: 'Outro'
  };
  return labels[valor] || valor || '';
}

// Anexa (ou corrige) o boleto / link do cartão de uma cobrança já criada —
// é o que você faz todo mês nas mensalidades de boleto e cartão.
function openDadosPagamentoModal(chargeId) {
  const charge = getCharges().find(c => c.id === chargeId);
  if (!charge) return;
  const f = charge.formasPagamento || [];
  const client = charge.clientId ? clientById(charge.clientId) : null;
  openModal(`
    <div class="modal-title">Dados de pagamento — ${escapeHtml(client ? client.nome : (charge.avulsoNome || ''))}</div>
    <p class="view-desc" style="margin:-8px 0 14px;">${escapeHtml(charge.descricao)} · ${formatCurrency(charge.valor)}</p>
    ${f.includes('boleto') ? `
    <div class="field">
      <label class="field-label">🧾 Link do boleto</label>
      <input class="input" id="dpBoletoLink" placeholder="https://..." value="${escapeHtml(charge.boletoLink || '')}">
    </div>
    <div class="field">
      <label class="field-label">🔢 Código de barras / linha digitável</label>
      <input class="input" id="dpBoletoCodigo" value="${escapeHtml(charge.boletoCodigo || '')}">
    </div>` : ''}
    ${f.includes('cartao') ? `
    <div class="field">
      <label class="field-label">💳 Link para pagar no cartão</label>
      <input class="input" id="dpCartaoLink" placeholder="https://..." value="${escapeHtml(charge.linkPagamentoCartao || '')}">
    </div>` : ''}
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" id="btnDpCancelar">Cancelar</button>
      <button type="button" class="btn btn-primary" id="btnDpSalvar">Salvar</button>
    </div>
  `);
  qs('#btnDpCancelar').onclick = closeModal;
  const normLink = (v) => { v = (v || '').trim(); return v && !/^https?:\/\//i.test(v) ? 'https://' + v : v; };
  qs('#btnDpSalvar').onclick = () => {
    const charges = getCharges();
    const idx = charges.findIndex(c => c.id === chargeId);
    if (idx < 0) return;
    if (qs('#dpBoletoLink')) {
      charges[idx].boletoLink = normLink(qs('#dpBoletoLink').value) || null;
      charges[idx].boletoCodigo = qs('#dpBoletoCodigo').value.trim() || null;
    }
    if (qs('#dpCartaoLink')) charges[idx].linkPagamentoCartao = normLink(qs('#dpCartaoLink').value) || null;
    saveCharges(charges);
    closeModal();
    navigate(currentView);
  };
}

function openMarkPaidModal(chargeId) {
  const charge = getCharges().find(c => c.id === chargeId);
  const aceitas = (charge && charge.formasPagamento) || [];
  // Sugere primeiro a(s) forma(s) que foram marcadas como aceitas nessa
  // cobrança, mas sempre deixa trocar — o cliente pode ter pago diferente
  // do combinado.
  const opcoes = [
    { valor: 'pix', label: 'PIX' },
    { valor: 'cartao_credito', label: 'Cartão de crédito' },
    { valor: 'cartao_debito', label: 'Cartão de débito' },
    { valor: 'boleto', label: 'Boleto bancário' },
    { valor: 'dinheiro', label: 'Dinheiro' },
    { valor: 'transferencia', label: 'Transferência bancária' },
    { valor: 'outro', label: 'Outro' }
  ];
  const sugerida = aceitas.includes('pix') ? 'pix'
    : aceitas.includes('cartao') ? 'cartao_credito'
    : aceitas.includes('boleto') ? 'boleto'
    : aceitas.includes('dinheiro') ? 'dinheiro'
    : 'pix';

  openModal(`
    <div class="modal-title">Marcar como pago</div>
    <div class="field">
      <label class="field-label">Forma de pagamento usada</label>
      <select class="input" id="mpForma">
        ${opcoes.map(o => `<option value="${o.valor}" ${o.valor === sugerida ? 'selected' : ''}>${o.label}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label class="field-label">Data do pagamento</label>
      <input class="input" type="date" id="mpData" value="${todayISO()}">
    </div>
    <div class="field">
      <label class="field-label">Link do comprovante (opcional)</label>
      <input class="input" type="url" id="mpComprovante" placeholder="Ex: print do comprovante no Google Drive/Fotos">
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" id="btnCancelPago">Cancelar</button>
      <button type="button" class="btn btn-primary" id="btnConfirmPago">Confirmar</button>
    </div>
  `);
  qs('#btnCancelPago').onclick = closeModal;
  qs('#btnConfirmPago').onclick = () => {
    let link = qs('#mpComprovante').value.trim();
    if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
    const charges = getCharges();
    const idx = charges.findIndex(c => c.id === chargeId);
    charges[idx].status = 'pago';
    charges[idx].dataPagamento = qs('#mpData').value || todayISO();
    charges[idx].comprovanteLink = link || null;
    charges[idx].formaPagamentoUsada = qs('#mpForma').value;
    saveCharges(charges);
    const premiado = concederIsencaoPorIndicacao(charges[idx]);
    closeModal();
    if (premiado) alert(`🎁 ${premiado} ganhou 1 mensalidade isenta por essa indicação! Ela será usada na próxima mensalidade recorrente dele(a) — ou use o botão "Isentar" numa mensalidade em aberto.`);
    const cliPago = charges[idx].clientId ? clientById(charges[idx].clientId) : null;
    if (charges[idx].recorrente && cliPago && formaRecorrenciaDoCliente(cliPago) !== 'pix') {
      const oque = formaRecorrenciaDoCliente(cliPago) === 'boleto' ? 'o boleto' : 'o link do cartão';
      alert(`✅ Pago! Agora é a hora de gerar ${oque} da próxima mensalidade de ${cliPago.nome}. Quando ela for lançada, vai aparecer em Cobranças com o aviso "falta ${oque.replace('o ', '')}" e o botão pra anexar.`);
    }
    navigate(currentView);
  };
}

function openComprovanteModal(chargeId) {
  openModal(`
    <div class="modal-title">Adicionar comprovante</div>
    <p class="view-desc" style="margin:-8px 0 14px;">Cole o link de onde o print/nota está salvo (Google Drive, Google Fotos, Dropbox...).</p>
    <div class="field">
      <label class="field-label">Link do comprovante</label>
      <input class="input" type="url" id="cpLink" required>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" id="btnCancelComprovante">Cancelar</button>
      <button type="button" class="btn btn-primary" id="btnSalvarComprovante">Salvar</button>
    </div>
  `);
  qs('#btnCancelComprovante').onclick = closeModal;
  qs('#btnSalvarComprovante').onclick = () => {
    let link = qs('#cpLink').value.trim();
    if (!link) { alert('Cole o link do comprovante.'); return; }
    if (!/^https?:\/\//i.test(link)) link = 'https://' + link;
    const charges = getCharges();
    const idx = charges.findIndex(c => c.id === chargeId);
    charges[idx].comprovanteLink = link;
    saveCharges(charges);
    closeModal();
    navigate(currentView);
  };
}

async function gerarReciboPDF(chargeId) {
  const charge = getCharges().find(c => c.id === chargeId);
  const client = charge.clientId ? clientById(charge.clientId) : null;
  const nomeCliente = client ? client.nome : (charge.avulsoNome || 'Cliente avulso');
  const settings = getSettings();

  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  const page = doc.addPage([420, 560]);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const inkColor = rgb(0.086, 0.137, 0.122);
  const softColor = rgb(0.29, 0.35, 0.32);
  let y = 500;

  page.drawText('RECIBO', { x: 40, y, size: 22, font: fontBold, color: inkColor });
  y -= 18;
  page.drawText(settings.empresaNome || settings.seuNome || 'Caixa Aberto', { x: 40, y, size: 11, font: fontRegular, color: softColor });
  y -= 40;

  function linha(label, valor, tamanho = 11) {
    page.drawText(label, { x: 40, y, size: 9, font: fontBold, color: softColor });
    y -= 15;
    page.drawText(valor, { x: 40, y, size: tamanho, font: fontRegular, color: inkColor });
    y -= 28;
  }

  linha('RECEBEMOS DE', nomeCliente);
  linha('REFERENTE A', charge.descricao);
  linha('VALOR', formatCurrency(charge.valor), 16);
  linha('DATA DO PAGAMENTO', formatDateBR(charge.dataPagamento || todayISO()));
  if (charge.formaPagamentoUsada) {
    linha('FORMA DE PAGAMENTO', formaPagamentoLabel(charge.formaPagamentoUsada));
    if (charge.formaPagamentoUsada === 'pix' && settings.pix) linha('CHAVE PIX', settings.pix);
  } else if (settings.pix) {
    // Compatibilidade: recibos de cobranças antigas, marcadas como pagas
    // antes de existir o campo "forma de pagamento usada".
    linha('CHAVE PIX', settings.pix);
  }

  page.drawLine({ start: { x: 40, y: y - 4 }, end: { x: 380, y: y - 4 }, thickness: 0.5, color: softColor });
  y -= 24;
  page.drawText(`Emitido em ${formatDateBR(todayISO())} pelo Caixa Aberto.`, { x: 40, y, size: 8, font: fontRegular, color: softColor });

  const bytes = await doc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `recibo-${nomeCliente.replace(/\s+/g, '-').toLowerCase()}-${charge.dataPagamento || todayISO()}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

function openChargeModal(presets, onSaved) {
  presets = presets || {};
  const clients = getClients();
  const temClientes = clients.length > 0;
  const modoAvulso = presets.avulso || !temClientes;

  openModal(`
    <div class="modal-title">Nova cobrança</div>
    <form id="chargeForm">
      ${temClientes ? `
        <div class="field">
          <label class="field-label">Cobrar de</label>
          <select class="input" id="chTipo">
            <option value="cliente" ${!modoAvulso ? 'selected' : ''}>Cliente cadastrado</option>
            <option value="avulso" ${modoAvulso ? 'selected' : ''}>Venda avulsa (não é cliente fixo)</option>
          </select>
        </div>
      ` : `<p class="view-desc" style="margin:-4px 0 14px;">Você ainda não tem clientes cadastrados — essa cobrança vai ser uma venda avulsa.</p>`}

      <div class="field" id="chClienteRow" style="${modoAvulso ? 'display:none;' : ''}">
        <label class="field-label">Cliente</label>
        <select class="input" id="chCliente" ${modoAvulso ? '' : 'required'}>
          ${clients.map(c => `<option value="${c.id}" ${presets.clientId === c.id ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`).join('')}
        </select>
        <div id="chPlanoHint" style="margin-top:8px;"></div>
      </div>

      <div class="field-row" id="chAvulsoRow" style="${modoAvulso ? '' : 'display:none;'}">
        <div class="field">
          <label class="field-label">Nome</label>
          <input class="input" id="chAvulsoNome" ${modoAvulso ? 'required' : ''} placeholder="Ex: vizinho, familiar...">
        </div>
        <div class="field">
          <label class="field-label">WhatsApp (opcional)</label>
          <input class="input" id="chAvulsoTelefone" placeholder="Só se quiser poder enviar a cobrança">
        </div>
      </div>

      <div class="field">
        <label class="field-label">Descrição</label>
        <input class="input" id="chDescricao" placeholder="Ex: Mensalidade de agosto" required value="${presets.descricao ? escapeHtml(presets.descricao) : ''}">
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Valor (R$)</label>
          <input class="input" id="chValor" type="number" min="0" step="0.01" required value="${presets.valor != null ? presets.valor.toFixed(2) : ''}">
        </div>
        <div class="field">
          <label class="field-label">Vencimento</label>
          <input class="input" id="chVencimento" type="date" required value="${todayISO()}">
        </div>
      </div>

      <div class="field" id="chRecRow" style="${modoAvulso ? 'display:none;' : ''}">
        <label style="display:flex; align-items:center; gap:8px; font-size:14px; cursor:pointer;">
          <input type="checkbox" id="chRecorrente">
          <span>🔁 Repetir todo mês</span>
        </label>
        <div class="view-desc" id="chRecNote" style="margin-top:4px;"></div>
      </div>

      <div class="field">
        <label class="field-label">Formas de pagamento aceitas nesta cobrança</label>
        <div class="payment-check-group">
          <label class="service-check" style="border-bottom:none; padding:8px 10px;">
            <input type="checkbox" id="chPagPix" ${getSettings().pix ? 'checked' : ''}>
            <span>Pix ${getSettings().pix ? '' : '<span class="quick-calc-result" style="color:var(--ink-soft); display:inline;">(cadastre sua chave em Configurações ou no cadastro do cliente)</span>'}</span>
          </label>
          <label class="service-check" style="border-bottom:none; padding:8px 10px;">
            <input type="checkbox" id="chPagCartao">
            <span>Cartão de crédito/débito</span>
          </label>
          <label class="service-check" style="border-bottom:none; padding:8px 10px;">
            <input type="checkbox" id="chPagBoleto">
            <span>Boleto</span>
          </label>
          <label class="service-check" style="border-bottom:none; padding:8px 10px;">
            <input type="checkbox" id="chPagDinheiro">
            <span>Dinheiro</span>
          </label>
        </div>
      </div>

      <div class="field-row hidden" id="chCartaoLinkRow">
        <div class="field">
          <label class="field-label">Link de pagamento (cartão) — opcional</label>
          <input class="input" id="chCartaoLink" type="url" placeholder="Ex: link do Mercado Pago, PagSeguro, Stripe...">
        </div>
      </div>

      <div class="field-row hidden" id="chBoletoFieldsRow">
        <div class="field">
          <label class="field-label">Link do boleto — opcional</label>
          <input class="input" id="chBoletoLink" type="url" placeholder="Link pra abrir/baixar o boleto">
        </div>
        <div class="field">
          <label class="field-label">Código de barras / linha digitável — opcional</label>
          <input class="input" id="chBoletoCodigo" placeholder="Cole aqui a linha digitável">
        </div>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="btnCancelCharge">Cancelar</button>
        <button type="submit" class="btn btn-primary">Lançar cobrança</button>
      </div>
    </form>
  `);

  function atualizarRecorrenciaUI() {
    const row = qs('#chRecRow');
    if (!row) return;
    const avulso = temClientes ? qs('#chTipo').value === 'avulso' : true;
    const box = qs('#chRecorrente');
    if (avulso) { row.style.display = 'none'; box.checked = false; return; }
    row.style.display = '';
    const cli = clientById(qs('#chCliente').value);
    if (cli && cli.recorrente) {
      box.checked = false; box.disabled = true;
      qs('#chRecNote').textContent = `Este cliente já tem mensalidade automática (${formatCurrency(cli.valorPlano)}, vence todo dia ${diaVencimentoValido(cli.diaVencimento)}).`;
    } else {
      box.disabled = false;
      qs('#chRecNote').textContent = 'As próximas cobranças serão lançadas sozinhas todo mês, com este valor e no mesmo dia do vencimento, a partir do mês que vem.';
    }
  }

  function atualizarHintPlano() {
    atualizarRecorrenciaUI();
    const cliPix = qs('#chCliente') ? clientById(qs('#chCliente').value) : null;
    if (cliPix && cliPix.pixChave && qs('#chPagPix')) qs('#chPagPix').checked = true;
    const hintEl = qs('#chPlanoHint');
    if (!hintEl) return;
    const clienteSelect = qs('#chCliente');
    const client = clienteSelect ? clientById(clienteSelect.value) : null;
    if (client && client.valorPlano != null) {
      hintEl.innerHTML = `<button type="button" class="btn btn-ghost btn-sm" id="btnUsarPlano">📋 Usar mensalidade do plano${client.plano ? ' — ' + escapeHtml(client.plano) : ''} (${formatCurrency(client.valorPlano)})</button>`;
      qs('#btnUsarPlano').onclick = () => {
        qs('#chDescricao').value = `Mensalidade${client.plano ? ' — ' + client.plano : ''}`;
        qs('#chValor').value = client.valorPlano.toFixed(2);
      };
    } else {
      hintEl.innerHTML = '';
    }
  }
  if (!modoAvulso) atualizarHintPlano();
  if (temClientes && !modoAvulso) qs('#chCliente').onchange = atualizarHintPlano;

  if (temClientes) {
    qs('#chTipo').onchange = () => {
      const avulso = qs('#chTipo').value === 'avulso';
      qs('#chClienteRow').style.display = avulso ? 'none' : '';
      qs('#chAvulsoRow').style.display = avulso ? '' : 'none';
      qs('#chCliente').required = !avulso;
      qs('#chAvulsoNome').required = avulso;
      if (!avulso) { qs('#chCliente').onchange = atualizarHintPlano; atualizarHintPlano(); }
      atualizarRecorrenciaUI();
    };
  }

  qs('#btnCancelCharge').onclick = closeModal;

  qs('#chPagCartao').onchange = () => {
    qs('#chCartaoLinkRow').classList.toggle('hidden', !qs('#chPagCartao').checked);
  };
  qs('#chPagBoleto').onchange = () => {
    qs('#chBoletoFieldsRow').classList.toggle('hidden', !qs('#chPagBoleto').checked);
  };

  qs('#chargeForm').onsubmit = (e) => {
    e.preventDefault();
    const tipo = temClientes ? qs('#chTipo').value : 'avulso';
    let extra;
    if (tipo === 'avulso') {
      const avulsoNome = qs('#chAvulsoNome').value.trim();
      if (!avulsoNome) { alert('Digite o nome da pessoa.'); return; }
      const avulsoTelefoneDigits = onlyDigits(qs('#chAvulsoTelefone').value);
      extra = { clientId: null, avulsoNome, avulsoTelefone: avulsoTelefoneDigits || null };
    } else {
      const clientId = qs('#chCliente').value;
      if (!clientId) { alert('Selecione um cliente.'); return; }
      extra = { clientId, avulsoNome: null, avulsoTelefone: null };
    }

    const formasPagamento = [];
    if (qs('#chPagPix').checked) formasPagamento.push('pix');
    if (qs('#chPagCartao').checked) formasPagamento.push('cartao');
    if (qs('#chPagBoleto').checked) formasPagamento.push('boleto');
    if (qs('#chPagDinheiro').checked) formasPagamento.push('dinheiro');

    let cartaoLink = qs('#chCartaoLink').value.trim();
    if (cartaoLink && !/^https?:\/\//i.test(cartaoLink)) cartaoLink = 'https://' + cartaoLink;
    let boletoLink = qs('#chBoletoLink').value.trim();
    if (boletoLink && !/^https?:\/\//i.test(boletoLink)) boletoLink = 'https://' + boletoLink;
    const boletoCodigo = qs('#chBoletoCodigo').value.trim();

    const charges = getCharges();
    const descricao = qs('#chDescricao').value.trim();
    const valor = Number(qs('#chValor').value);
    const vencimento = qs('#chVencimento').value;

    // 🔁 Repetir todo mês: liga a recorrência no cliente e já registra esta
    // cobrança como a mensalidade do mês, pra não duplicar com a automática.
    let recExtra = {};
    const querRecorrer = tipo !== 'avulso' && qs('#chRecorrente') && qs('#chRecorrente').checked;
    if (querRecorrer) {
      if (!(valor > 0)) { alert('Pra repetir todo mês, informe um valor maior que zero.'); return; }
      const cli = clientById(extra.clientId);
      const mesVenc = vencimento.slice(0, 7);
      const mesHoje = todayISO().slice(0, 7);
      const base = mesVenc > mesHoje ? mesVenc : mesHoje;
      const diaVenc = diaVencimentoValido(Number(vencimento.slice(8, 10)));
      saveClients(getClients().map(x => x.id === cli.id ? {
        ...x,
        recorrente: true,
        formaPagamentoRecorrente: formasPagamento.includes('pix') ? 'pix' : formasPagamento.includes('boleto') ? 'boleto' : formasPagamento.includes('cartao') ? 'cartao' : formaRecorrenciaDoCliente(x),
        valorPlano: valor,
        plano: x.plano || descricao,
        diaVencimento: diaVenc,
        recorrenciaInicio: proximoMesISO(base),
        recorrenciaUltimoMes: base
      } : x));
      const idRec = `rec-${cli.id}-${mesVenc}`;
      recExtra = {
        tipo: 'mensalidade', competencia: mesVenc, recorrente: true,
        ...(charges.some(ch => ch.id === idRec) ? {} : { id: idRec })
      };
    }

    charges.push({
      id: uid(),
      ...extra,
      descricao,
      valor,
      vencimento,
      status: 'pendente',
      dataPagamento: null,
      createdAt: todayISO(),
      ...(presets.tipo ? { tipo: presets.tipo } : {}),
      ...recExtra,
      formasPagamento,
      linkPagamentoCartao: cartaoLink || null,
      boletoLink: boletoLink || null,
      boletoCodigo: boletoCodigo || null
    });
    saveCharges(charges);
    closeModal();
    if (onSaved) onSaved(); else navigate(currentView);
  };
}

// ---------- AGENDA / REUNIÕES ----------
// ---------- CALENDÁRIO DA AGENDA (reuniões + vencimentos) ----------
let _agendaMes = null;  // 'AAAA-MM'
let _agendaDia = null;  // 'AAAA-MM-DD'
const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DIAS_SEMANA_CURTO = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function agendaEventosDoMes(mes) {
  const porDia = {};
  const add = (dia, ev) => { (porDia[dia] = porDia[dia] || []).push(ev); };
  getMeetings().forEach(m => {
    if (m.data && m.data.startsWith(mes) && m.status !== 'cancelada') add(m.data, { tipo: m.status === 'realizada' ? 'reuniao-feita' : 'reuniao' });
  });
  getCharges().forEach(c => {
    if (!c.vencimento || !c.vencimento.startsWith(mes) || c.isenta || !(Number(c.valor) > 0)) return;
    const st = chargeStatus(c);
    add(c.vencimento, { tipo: st === 'pago' ? 'venc-pago' : (st === 'atrasado' ? 'venc-atrasado' : 'venc-pendente') });
  });
  return porDia;
}

function renderAgendaCalendario() {
  const hoje = todayISO();
  if (!_agendaMes) _agendaMes = hoje.slice(0, 7);
  if (!_agendaDia && _agendaMes === hoje.slice(0, 7)) _agendaDia = hoje;
  const [ano, mesNum] = _agendaMes.split('-').map(Number);
  const primeiroDow = new Date(ano, mesNum - 1, 1).getDay();
  const diasNoMes = new Date(ano, mesNum, 0).getDate();
  const porDia = agendaEventosDoMes(_agendaMes);

  const aReceber = getCharges().filter(c => c.vencimento && c.vencimento.startsWith(_agendaMes) && !c.isenta && chargeStatus(c) !== 'pago')
    .reduce((t, c) => t + (Number(c.valor) || 0), 0);

  let celulas = '';
  for (let i = 0; i < primeiroDow; i++) celulas += '<div class="cal-cell cal-vazio"></div>';
  for (let d = 1; d <= diasNoMes; d++) {
    const iso = `${_agendaMes}-${String(d).padStart(2, '0')}`;
    const evs = porDia[iso] || [];
    const dots = evs.slice(0, 5).map(e => `<span class="cal-dot ${e.tipo}"></span>`).join('') + (evs.length > 5 ? `<span class="cal-mais">+${evs.length - 5}</span>` : '');
    celulas += `<button type="button" class="cal-cell${iso === hoje ? ' cal-hoje' : ''}${iso === _agendaDia ? ' cal-sel' : ''}" data-cal-dia="${iso}">
      <span class="cal-num">${d}</span><span class="cal-dots">${dots}</span></button>`;
  }

  return `
    <div class="cal-card">
      <div class="cal-head">
        <button type="button" class="btn btn-ghost btn-sm" id="calPrev" aria-label="Mês anterior">‹</button>
        <div class="cal-titulo">${MESES_PT[mesNum - 1]} de ${ano}</div>
        <button type="button" class="btn btn-ghost btn-sm" id="calNext" aria-label="Próximo mês">›</button>
        <button type="button" class="btn btn-ghost btn-sm" id="calHoje">Hoje</button>
      </div>
      <div class="cal-grid">
        ${DIAS_SEMANA_CURTO.map(n => `<div class="cal-dow">${n}</div>`).join('')}
        ${celulas}
      </div>
      <div class="cal-legenda">
        <span><i class="cal-dot reuniao"></i> Reunião</span>
        <span><i class="cal-dot venc-pendente"></i> Vencimento</span>
        <span><i class="cal-dot venc-atrasado"></i> Atrasado</span>
        <span><i class="cal-dot venc-pago"></i> Pago</span>
        ${aReceber > 0 ? `<span class="cal-total">A receber no mês: <strong>${formatCurrency(aReceber)}</strong></span>` : ''}
      </div>
    </div>
    <div id="agendaDia"></div>
  `;
}

function renderAgendaDia() {
  const box = qs('#agendaDia');
  if (!box) return;
  if (!_agendaDia) { box.innerHTML = ''; return; }
  const [a, m, d] = _agendaDia.split('-').map(Number);
  const titulo = new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const reunioes = getMeetings().filter(x => x.data === _agendaDia)
    .sort((x, y) => (x.hora || '').localeCompare(y.hora || ''));
  const cobrancas = getCharges().filter(c => c.vencimento === _agendaDia && !c.isenta);
  box.innerHTML = `
    <div class="cal-dia-head">
      <div class="section-title" style="margin:0; text-transform:capitalize;">${titulo}</div>
      <button type="button" class="btn btn-ghost btn-sm" id="calNovaReuniao">+ Reunião neste dia</button>
    </div>
    ${reunioes.length === 0 && cobrancas.length === 0 ? '<div class="view-desc" style="margin-bottom:26px;">Nada marcado para este dia.</div>' : ''}
    ${reunioes.length ? `<div class="field-label" style="margin:8px 0 6px;">Reuniões</div><div class="ledger" style="margin-bottom:18px;">${reunioes.map(x => renderMeetingRow(x)).join('')}</div>` : ''}
    ${cobrancas.length ? `<div class="field-label" style="margin:8px 0 6px;">Vencimentos</div><div style="margin-bottom:26px;">${renderChargeLedger(cobrancas, { compact: true })}</div>` : ''}
  `;
  // o modal de nova reunião abre com a data de hoje; aqui já vem com o dia selecionado
  const btn = qs('#calNovaReuniao');
  btn.onclick = () => {
    openMeetingModal(null, null, () => renderAgenda());
    const campo = qs('#mData');
    if (campo) campo.value = _agendaDia;
  };
  bindMeetingActions(() => renderAgenda());
  bindChargeActions();
}

function bindAgendaCalendario() {
  const mudaMes = (delta) => {
    let [a, m] = _agendaMes.split('-').map(Number);
    m += delta;
    if (m < 1) { m = 12; a--; }
    if (m > 12) { m = 1; a++; }
    _agendaMes = `${a}-${String(m).padStart(2, '0')}`;
    _agendaDia = null;
    renderAgenda();
  };
  qs('#calPrev').onclick = () => mudaMes(-1);
  qs('#calNext').onclick = () => mudaMes(1);
  qs('#calHoje').onclick = () => { _agendaMes = todayISO().slice(0, 7); _agendaDia = todayISO(); renderAgenda(); };
  qsa('[data-cal-dia]').forEach(b => b.onclick = () => {
    _agendaDia = _agendaDia === b.dataset.calDia ? null : b.dataset.calDia;
    renderAgenda();
  });
  renderAgendaDia();
}

function renderAgenda() {
  const meetings = getMeetings().sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')));
  const hoje = todayISO();
  const futuras = meetings.filter(m => m.data >= hoje && m.status === 'agendada');
  const passadas = meetings.filter(m => m.data < hoje || m.status !== 'agendada')
    .sort((a, b) => (b.data + (b.hora || '')).localeCompare(a.data + (a.hora || '')));

  qs('#main').innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">Agenda</div>
        <div class="view-desc">Reuniões e vencimentos de cobranças no calendário</div>
      </div>
      <button class="btn btn-primary" id="btnNovaReuniao">+ Nova reunião</button>
    </div>

    ${renderAgendaCalendario()}

    <div class="section-title">Próximas</div>
    ${futuras.length === 0 ? emptyState('Nada agendado', 'Clique em "Nova reunião" para marcar um compromisso.') : `
      <div class="ledger" style="margin-bottom:30px;">${futuras.map(m => renderMeetingRow(m)).join('')}</div>
    `}

    ${passadas.length > 0 ? `
      <div class="section-title">Histórico</div>
      <div class="ledger">${passadas.map(m => renderMeetingRow(m)).join('')}</div>
    ` : ''}
  `;

  qs('#btnNovaReuniao').onclick = () => openMeetingModal(null, null, () => renderAgenda());
  bindAgendaCalendario();
  bindMeetingActions(() => renderAgenda());
}

function renderMeetingRow(m) {
  const client = m.clientId ? clientById(m.clientId) : null;
  const statusClass = { agendada: 'stamp-pendente', realizada: 'stamp-pago', cancelada: 'stamp-pausado' }[m.status] || 'stamp-pendente';
  const statusLabel = { agendada: 'Agendada', realizada: 'Realizada', cancelada: 'Cancelada' }[m.status] || 'Agendada';
  const contagem = m.status === 'agendada' ? meetingCountdownLabel(m.data) : null;
  return `
    <div class="ledger-row">
      <div class="ledger-main">
        <div class="ledger-title">${escapeHtml(m.titulo)}</div>
        <div class="ledger-sub">${formatDateBR(m.data)}${m.hora ? ' às ' + m.hora : ''}${client ? ' · ' + escapeHtml(client.nome) : ''}${m.local ? ' · ' + escapeHtml(m.local) : ''}</div>
      </div>
      ${contagem ? `<span class="stamp-badge stamp-pausado">${contagem}</span>` : ''}
      <span class="stamp-badge ${statusClass}">${statusLabel}</span>
      <div class="ledger-actions">
        ${m.status === 'agendada' ? `
          <button class="btn btn-ghost btn-sm" data-edit-meeting="${m.id}">Editar</button>
          ${client ? `<button class="btn btn-whatsapp btn-sm" data-remind-meeting="${m.id}">Lembrete</button>` : ''}
          <button class="btn btn-ghost btn-sm" data-done-meeting="${m.id}">Realizada</button>
          <button class="btn btn-ghost btn-sm" data-cancel-meeting="${m.id}">Cancelar</button>
        ` : ''}
        <button class="btn btn-danger btn-sm" data-del-meeting="${m.id}">Excluir</button>
      </div>
    </div>
  `;
}

function bindMeetingActions(afterChange) {
  qsa('[data-edit-meeting]').forEach(b => b.onclick = () => openMeetingModal(b.dataset.editMeeting, null, afterChange));
  qsa('[data-remind-meeting]').forEach(b => b.onclick = () => openMeetingWhatsappModal(b.dataset.remindMeeting));
  qsa('[data-done-meeting]').forEach(b => b.onclick = () => {
    const meetings = getMeetings();
    const idx = meetings.findIndex(m => m.id === b.dataset.doneMeeting);
    meetings[idx].status = 'realizada';
    saveMeetings(meetings);
    afterChange();
  });
  qsa('[data-cancel-meeting]').forEach(b => b.onclick = () => {
    const meetings = getMeetings();
    const idx = meetings.findIndex(m => m.id === b.dataset.cancelMeeting);
    meetings[idx].status = 'cancelada';
    saveMeetings(meetings);
    afterChange();
  });
  qsa('[data-del-meeting]').forEach(b => b.onclick = () => {
    if (confirm('Excluir esta reunião?')) {
      saveMeetings(getMeetings().filter(m => m.id !== b.dataset.delMeeting));
      afterChange();
    }
  });
}

function openMeetingModal(meetingId, presetClientId, onSaved) {
  const clients = getClients();
  const editing = meetingId ? getMeetings().find(m => m.id === meetingId) : null;
  const selectedClient = editing ? editing.clientId : presetClientId;

  openModal(`
    <div class="modal-title">${editing ? 'Editar reunião' : 'Nova reunião'}</div>
    <form id="meetingForm">
      <div class="field">
        <label class="field-label">Título / assunto</label>
        <input class="input" id="mTitulo" placeholder="Ex: Alinhamento do projeto" required value="${editing ? escapeHtml(editing.titulo) : ''}">
      </div>
      <div class="field">
        <label class="field-label">Cliente (opcional)</label>
        <select class="input" id="mCliente">
          <option value="">— nenhum —</option>
          ${clients.map(c => `<option value="${c.id}" ${selectedClient === c.id ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Data</label>
          <input class="input" type="date" id="mData" required value="${editing ? editing.data : todayISO()}">
        </div>
        <div class="field">
          <label class="field-label">Hora</label>
          <input class="input" type="time" id="mHora" value="${editing ? (editing.hora || '') : ''}">
        </div>
      </div>
      <div class="field">
        <label class="field-label">Local / link (opcional)</label>
        <input class="input" id="mLocal" placeholder="Ex: Google Meet, escritório..." value="${editing ? escapeHtml(editing.local || '') : ''}">
      </div>
      <div class="field">
        <label class="field-label">Notas (opcional)</label>
        <textarea class="input" id="mNotas" style="min-height:60px; font-family:inherit; font-size:14px;">${editing ? escapeHtml(editing.notas || '') : ''}</textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="btnCancelMeeting">Cancelar</button>
        <button type="submit" class="btn btn-primary">${editing ? 'Salvar' : 'Agendar'}</button>
      </div>
    </form>
  `);
  qs('#btnCancelMeeting').onclick = closeModal;
  qs('#meetingForm').onsubmit = (e) => {
    e.preventDefault();
    const meetings = getMeetings();
    const data = {
      titulo: qs('#mTitulo').value.trim(),
      clientId: qs('#mCliente').value || null,
      data: qs('#mData').value,
      hora: qs('#mHora').value,
      local: qs('#mLocal').value.trim(),
      notas: qs('#mNotas').value.trim()
    };
    if (editing) {
      const idx = meetings.findIndex(m => m.id === editing.id);
      meetings[idx] = { ...editing, ...data };
    } else {
      meetings.push({ id: uid(), status: 'agendada', ...data });
    }
    saveMeetings(meetings);
    closeModal();
    if (onSaved) onSaved(); else navigate(currentView);
  };
}

// ---------- ENVIO WHATSAPP ----------
// obs: WhatsApp usa *asterisco* pra deixar o texto em negrito
const MODELO_COBRANCA_PADRAO =
`Oi, {nome}! Tudo bem? 😊

Aqui é a *NetBug | Assistente de IA do Dalton Neres*.

Passando para lembrar da sua *{descricao}* 🧾

💰 *Valor:* {valor}
📅 *Vencimento:* {vencimento_relativo} ({vencimento_data})
{atraso}{pagamento}

Se o pagamento já foi realizado, pode desconsiderar esta mensagem.

Qualquer dúvida, ficamos à disposição! 🙏`;

function renderTemplate(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (m, key) => (vars[key] != null ? vars[key] : ''));
}

// Cobrança de cliente recorrente (mensalidade): sempre manda chave + copia e cola + QR Code,
// pra o cliente não errar na hora de pagar.
function clienteEhRecorrente(charge, client) {
  return !!(charge && (charge.recorrente || (client && client.recorrente)));
}
function pixChaveRotulo(chave) {
  const aleatoria = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(chave || '').trim());
  return aleatoria ? 'Chave PIX (aleatória)' : 'Chave PIX';
}

const MODELO_RECORRENTE_PADRAO =
`Oi, {nome}! Tudo bem? 😊

Aqui é a *NetBug | Assistente de IA do Dalton Neres*.

Passando para lembrar da sua *mensalidade de {competencia}* ({plano}) 🧾

💰 *Valor:* {valor}
📅 *Vencimento:* {vencimento_relativo} ({vencimento_data})
{atraso}{pagamento}

Se o pagamento já foi realizado, pode desconsiderar esta mensagem.

Qualquer dúvida, ficamos à disposição! 🙏`;

function buildLinhasPagamento(charge, settings) {
  // Compatibilidade: cobranças criadas antes dessa opção existir não têm
  // "formasPagamento" salvo — nesse caso, mantém o comportamento de sempre
  // mostrar a chave PIX (se configurada), igual funcionava antes.
  const client = charge.clientId ? clientById(charge.clientId) : null;
  const cfgPix = pixConfigParaCliente(client);
  const formas = charge.formasPagamento || [];
  const ehRecorr = clienteEhRecorrente(charge, client);
  let linhas = '';
  if (chargeAceitaPix(charge, client) && cfgPix.chaveExibida) {
    linhas += `\n💳 ${pixChaveRotulo(cfgPix.chaveExibida)}: *${cfgPix.chaveExibida}*`;
    // Cliente com chave própria OU recorrente: manda também o Pix copia e cola, já com o valor.
    const recorr = clienteEhRecorrente(charge, client);
    if (cfgPix.chave && Number(charge.valor) > 0 && !charge.isenta) {
      linhas += recorr
        // Recorrente: QR Code junto + copia e cola numa 2ª mensagem (fácil de copiar).
        ? `\n📷 Pode pagar pelo QR Code (imagem) ou pelo Pix copia e cola, que te mando logo em seguida.`
        // Demais clientes: chave + QR Code.
        : `\n📷 Pode pagar pela chave ou pelo QR Code (imagem) que vai junto.`;
    }
  }

  if (formas.includes('cartao')) {
    linhas += charge.linkPagamentoCartao
      ? `\n💳 Link para pagar no cartão (crédito/débito): ${charge.linkPagamentoCartao}`
      : (ehRecorr
        ? `\n💳 O link para pagar esta mensalidade no cartão te envio por aqui assim que estiver pronto.`
        : `\n💳 Também aceito cartão de crédito/débito.`);
  }
  if (formas.includes('boleto')) {
    if (charge.boletoLink) linhas += `\n🧾 Boleto: ${charge.boletoLink}`;
    if (charge.boletoCodigo) linhas += `\n🔢 Código de barras: *${charge.boletoCodigo}*`;
    if (!charge.boletoLink && !charge.boletoCodigo) linhas += ehRecorr
      ? `\n🧾 O boleto desta mensalidade te envio por aqui assim que estiver pronto.`
      : `\n🧾 Também aceito boleto (te mando os dados à parte).`;
  }
  if (formas.includes('dinheiro')) {
    linhas += `\n💵 Também aceito em dinheiro.`;
  }
  return linhas;
}

function montarVariaveisMensagemCobranca(charge, client, settings) {
  const quemFala = settings.seuNome ? `Aqui quem fala é *${settings.seuNome}*.` : '';
  const status = chargeStatus(charge);
  const atraso = status === 'atrasado' ? '\n⚠️ Essa cobrança já está atrasada — quando conseguir, dá uma olhada aí!' : '';
  const pagamento = buildLinhasPagamento(charge, settings);
  return {
    nome: client.nome,
    quem_fala: quemFala,
    descricao: charge.descricao,
    valor: `*${formatCurrency(charge.valor)}*`,
    vencimento_data: formatDateBR(charge.vencimento),
    vencimento_relativo: vencimentoRelativoLabel(charge.vencimento),
    atraso,
    pagamento,
    competencia: charge.competencia ? competenciaLabel(charge.competencia) : String(charge.vencimento || '').slice(5, 7) + '/' + String(charge.vencimento || '').slice(0, 4),
    plano: (client && client.plano) || ''
  };
}

function buildMessage(charge, client) {
  const settings = getSettings();
  // Cliente de mensalidade recorrente tem texto próprio (Configurações → Mensagem de mensalidade)
  const template = clienteEhRecorrente(charge, client)
    ? (settings.modeloCobrancaRecorrente || MODELO_RECORRENTE_PADRAO)
    : (settings.modeloCobranca || MODELO_COBRANCA_PADRAO);
  return renderTemplate(template, montarVariaveisMensagemCobranca(charge, client, settings));
}

function openWhatsappModal(chargeId) {
  const charge = getCharges().find(c => c.id === chargeId);
  const client = charge.clientId ? clientById(charge.clientId) : { nome: charge.avulsoNome, telefone: charge.avulsoTelefone };
  if (!client || !client.telefone) { alert('Essa cobrança não tem um WhatsApp válido pra enviar.'); return; }
  const falta = chargeFaltaDados(charge);
  if (falta.length && !confirm(`Essa cobrança ainda está sem ${falta.map(k => FALTA_LABEL[k]).join(' e ')}. Enviar assim mesmo?\n\n(Cancelar = voltar e anexar primeiro, no botão da cobrança.)`)) return;
  let opts = null;
  if (!charge.isenta && Number(charge.valor) > 0 && chargeAceitaPix(charge, client)) {
    const payload = pixPayloadDaCobranca(charge);
    const canvas = payload ? pixQrCanvas(payload) : null;
    if (canvas) {
      const nomeArq = `pix-${String(client.nome).replace(/\s+/g, '-').toLowerCase()}-${charge.vencimento}.png`;
      opts = { qrCanvas: canvas, nomeArq, payload: clienteEhRecorrente(charge, client) ? payload : null };
    }
  }
  openSendWhatsappModal(`Enviar cobrança — ${client.nome}`, client, buildMessage(charge, client), null, opts);
}

function buildMeetingMessage(meeting, client) {
  const settings = getSettings();
  const quemFala = settings.seuNome ? settings.seuNome : '';
  const contagem = meetingCountdownLabel(meeting.data);
  const linhaContagem = contagem === 'Hoje' ? '\n⏰ *É hoje!*'
    : contagem === 'Amanhã' ? '\n⏰ *É amanhã!*'
    : contagem ? `\n⏰ *${contagem}*` : '';
  return `👋 Olá, *${client.nome}*! ${quemFala ? 'Aqui quem fala é *' + quemFala + '*.' : ''}` +
    `\n\n🗓️ Passando pra lembrar da nossa reunião: *${meeting.titulo}*` +
    `\n📅 Data: *${formatDateBR(meeting.data)}${meeting.hora ? ' às ' + meeting.hora : ''}*` +
    `${linhaContagem}` +
    `${meeting.local ? '\n📍 Local/link: ' + meeting.local : ''}` +
    `\n\n😊 Qualquer imprevisto, me avisa por aqui. Até lá!`;
}

function buildBirthdayMessage(client) {
  const settings = getSettings();
  const quemFala = settings.seuNome ? settings.seuNome : '';
  return `🎉 Feliz aniversário, *${client.nome}*! 🎂` +
    `\n\nDesejo um dia incrível, cheio de alegria e realizações!` +
    `${quemFala ? '\nUm abraço, *' + quemFala + '*.' : ''}` +
    `\n\n🥳🎈`;
}

function openMeetingWhatsappModal(meetingId) {
  const meeting = getMeetings().find(m => m.id === meetingId);
  const client = meeting.clientId ? clientById(meeting.clientId) : null;
  if (!client) { alert('Essa reunião não tem cliente vinculado.'); return; }
  openSendWhatsappModal(`Enviar lembrete — ${client.nome}`, client, buildMeetingMessage(meeting, client));
}

function openSendWhatsappModal(title, client, defaultMsg, onSent, opts) {
  const qr = opts && opts.qrCanvas ? opts : null;
  openModal(`
    <div class="modal-title">${escapeHtml(title)}</div>
    ${qr ? `
    <div class="pix-qr-box" style="margin-bottom:12px;">
      <img class="pix-qr-img" style="width:150px;" alt="QR Code Pix" src="${qr.qrCanvas.toDataURL('image/png')}">
      <div class="view-desc" style="margin:0; text-align:center;">📷 QR Code Pix que vai junto com a mensagem</div>
    </div>` : ''}
    <div class="field">
      <label class="field-label">Mensagem (pode editar antes de enviar)</label>
      <textarea class="input" id="waMsg" style="min-height:170px;">${escapeHtml(defaultMsg)}</textarea>
    </div>
    <div class="field">
      <label class="field-label">Número do WhatsApp</label>
      <input class="input" id="waPhone" value="${escapeHtml(client.telefone)}">
    </div>
    ${qr ? `<div class="view-desc" id="waHint" style="margin:0 0 10px;">${qr.payload ? 'Ordem: 1) mensagem + QR Code · 2) só o copia e cola, em mensagem separada.' : 'Envie a mensagem e cole o QR Code na conversa.'}</div>` : ''}
    <div class="modal-actions" style="flex-wrap:wrap;">
      <button type="button" class="btn btn-ghost" id="btnCancelWa">${qr ? 'Fechar' : 'Não enviar agora'}</button>
      ${qr ? `<button type="button" class="btn btn-ghost" id="btnBaixarQrWa">⬇️ Baixar QR</button>
      ${qr.payload ? `<button type="button" class="btn btn-whatsapp" id="btnCodigoWa">📋 2ª mensagem: só o copia e cola</button>` : ''}
      <button type="button" class="btn btn-whatsapp hidden" id="btnShareWa">📤 Compartilhar texto + QR</button>` : ''}
      <button type="button" class="btn btn-whatsapp" id="btnOpenWa">${qr ? 'Abrir conversa e copiar QR' : 'Enviar no WhatsApp'}</button>
    </div>
  `);
  qs('#btnCancelWa').onclick = closeModal;

  let qrBlob = null;
  const hint = (t) => { const h = qs('#waHint'); if (h) h.textContent = t; };
  if (qr) {
    qs('#btnBaixarQrWa').onclick = () => {
      const a = document.createElement('a');
      a.href = qr.qrCanvas.toDataURL('image/png');
      a.download = qr.nomeArq;
      a.click();
    };
    qr.qrCanvas.toBlob(blob => {
      if (!blob) return;
      qrBlob = blob;
      const file = new File([blob], qr.nomeArq, { type: 'image/png' });
      // Celular: o menu "Compartilhar" manda imagem + texto de uma vez pro WhatsApp.
      if (navigator.canShare && navigator.canShare({ files: [file] }) && qs('#btnShareWa')) {
        const b = qs('#btnShareWa');
        b.classList.remove('hidden');
        b.onclick = () => {
          navigator.share({ files: [file], text: qs('#waMsg').value })
            .then(() => { closeModal(); if (onSent) onSent(); })
            .catch(() => {});
        };
      }
    });
  }

  if (qr && qr.payload) {
    // Manda o código sozinho numa mensagem: o cliente segura e copia sem pegar texto extra.
    qs('#btnCodigoWa').onclick = () => {
      const phone = onlyDigits(qs('#waPhone').value);
      if (phone.length < 10) { alert('Número de WhatsApp inválido.'); return; }
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(qr.payload)}`, '_blank');
    };
  }

  qs('#btnOpenWa').onclick = () => {
    const phone = onlyDigits(qs('#waPhone').value);
    const msg = qs('#waMsg').value;
    if (phone.length < 10) { alert('Número de WhatsApp inválido.'); return; }
    if (qr) {
      // Copia o QR pra área de transferência e abre a conversa com o texto;
      // é só colar a imagem na conversa (Ctrl+V / segurar e colar).
      let copiou = Promise.reject();
      if (qrBlob && navigator.clipboard && window.ClipboardItem) {
        try { copiou = navigator.clipboard.write([new ClipboardItem({ 'image/png': qrBlob })]); } catch (e) {}
      }
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
      copiou
        .then(() => hint('✅ Conversa aberta e QR Code copiado. Cole a imagem na conversa (Ctrl+V, ou segure e toque em "Colar") e envie.'))
        .catch(() => hint('Conversa aberta. Toque em "Baixar QR" e anexe a imagem na conversa.'));
      if (onSent) onSent();
      return;
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    closeModal();
    if (onSent) onSent();
  };
}

// ---------- SERVIÇOS, MENSALIDADES E ORÇAMENTOS (tela única com abas) ----------
function renderServicos() {
  const servicos = getServicos();
  const planos = getMensalidades();
  const recorrentes = getClients().filter(c => c.recorrente);
  const receitaMensal = recorrentes.reduce((sum, c) => sum + (Number(c.valorPlano) || 0), 0);
  const orcAbertos = getOrcamentos().filter(o => ['nao_enviado', 'enviado', 'aguardando_retorno'].includes(o.status || 'nao_enviado')).length;

  qs('#main').innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">Serviços</div>
        <div class="view-desc">Catálogo, planos de suporte recorrentes e orçamentos — tudo num lugar só</div>
      </div>
    </div>

    <div class="cards-grid">
      <div class="stat-card">
        <div class="stat-label">Serviços no catálogo</div>
        <div class="stat-value">${servicos.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Planos de mensalidade</div>
        <div class="stat-value">${planos.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Recorrente / mês</div>
        <div class="stat-value emerald">${formatCurrency(receitaMensal)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Orçamentos em aberto</div>
        <div class="stat-value amber">${orcAbertos}</div>
      </div>
    </div>

    <div class="tabs" role="tablist">
      <button class="tab-btn ${_servicosTab === 'catalogo' ? 'active' : ''}" data-tab="catalogo" role="tab">Catálogo <span class="tab-count">${servicos.length}</span></button>
      <button class="tab-btn ${_servicosTab === 'mensalidades' ? 'active' : ''}" data-tab="mensalidades" role="tab">Mensalidades <span class="tab-count">${planos.length}</span></button>
      <button class="tab-btn ${_servicosTab === 'orcamentos' ? 'active' : ''}" data-tab="orcamentos" role="tab">Orçamentos <span class="tab-count">${getOrcamentos().length}</span></button>
    </div>

    <div id="tabContent"></div>
  `;

  qsa('.tab-btn').forEach(b => b.onclick = () => {
    _servicosTab = b.dataset.tab;
    renderServicos();
  });

  if (_servicosTab === 'mensalidades') renderTabMensalidades();
  else if (_servicosTab === 'orcamentos') renderTabOrcamentos();
  else renderTabCatalogo();
}

function renderTabCatalogo() {
  const servicos = getServicos();

  qs('#tabContent').innerHTML = `
    <div class="tab-toolbar">
      <div class="view-desc" style="margin:0;">Os serviços que você oferece e os preços de cada um</div>
      <div class="tab-actions">
        ${servicos.length > 0 ? `<button class="btn btn-ghost" id="btnSyncServicos">🔄 Atualizar valores</button>` : ''}
        <button class="btn btn-primary" id="btnNovoServico">+ Novo serviço</button>
      </div>
    </div>

    ${servicos.length === 0 ? `
      <div class="section-title">Catálogo sugerido</div>
      <p class="view-desc" style="margin-bottom:14px;">
        Comecei com os serviços que você já oferece. Os que já têm preço definido
        (baseado na proposta da Ana Luiza) já vêm prontos; os outros ficam sem
        preço — você define ao adicionar, ou depois clicando em "Editar".
      </p>
      <div class="ledger" style="margin-bottom:20px;">
        ${SERVICOS_SUGERIDOS.map((s, i) => `
          <div class="ledger-row">
            <div class="ledger-main">
              <div class="ledger-title">${escapeHtml(s.nome)}</div>
              <div class="ledger-sub">${escapeHtml(s.descricao)}</div>
            </div>
            ${s.precoUnico != null || s.precoMensal != null
              ? `<span class="stamp-badge stamp-pago">${s.precoUnico != null ? formatCurrency(s.precoUnico) + ' único' : ''}${s.precoUnico != null && s.precoMensal != null ? ' + ' : ''}${s.precoMensal != null ? formatCurrency(s.precoMensal) + '/mês' : ''}</span>`
              : `<span class="stamp-badge stamp-pendente">sem preço ainda</span>`}
            <div class="ledger-actions">
              <button class="btn btn-primary btn-sm" data-add-sugerido="${i}">+ Adicionar</button>
            </div>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-ghost btn-sm" id="btnAddTodosSugeridos" style="margin-bottom:30px;">+ Adicionar todos de uma vez</button>
    ` : `
      <div class="section-title">Catálogo de serviços</div>
      <div class="ledger" style="margin-bottom:30px;">
        ${servicos.map(s => `
          <div class="ledger-row">
            <div class="ledger-main">
              <div class="ledger-title">${escapeHtml(s.nome)}</div>
              ${s.descricao ? `<div class="ledger-sub">${escapeHtml(s.descricao)}</div>` : ''}
            </div>
            ${s.precoUnico != null || s.precoMensal != null
              ? `<span class="stamp-badge stamp-pago">${s.precoUnico != null ? formatCurrency(s.precoUnico) + ' único' : ''}${s.precoUnico != null && s.precoMensal != null ? ' + ' : ''}${s.precoMensal != null ? formatCurrency(s.precoMensal) + '/mês' : ''}</span>`
              : `<span class="stamp-badge stamp-pendente">sem preço ainda</span>`}
            <div class="ledger-actions">
              <button class="btn btn-ghost btn-sm" data-edit-servico="${s.id}">Editar</button>
              <button class="btn btn-danger btn-sm" data-del-servico="${s.id}">Excluir</button>
            </div>
          </div>
        `).join('')}
      </div>
    `}


  `;

  qs('#btnNovoServico').onclick = () => openServiceModal();
  const btnSyncServicos = qs('#btnSyncServicos');
  if (btnSyncServicos) btnSyncServicos.onclick = () => sincronizarServicosSugeridos();
  qsa('[data-add-sugerido]').forEach(b => b.onclick = () => {
    const s = SERVICOS_SUGERIDOS[Number(b.dataset.addSugerido)];
    saveServicos([...getServicos(), { id: uid(), ...s }]);
    renderServicos();
  });
  const btnTodos = qs('#btnAddTodosSugeridos');
  if (btnTodos) btnTodos.onclick = () => {
    saveServicos([...getServicos(), ...SERVICOS_SUGERIDOS.map(s => ({ id: uid(), ...s }))]);
    renderServicos();
  };
  qsa('[data-edit-servico]').forEach(b => b.onclick = () => openServiceModal(b.dataset.editServico));
  qsa('[data-del-servico]').forEach(b => b.onclick = () => {
    if (confirm('Excluir este serviço do catálogo?')) {
      saveServicos(getServicos().filter(s => s.id !== b.dataset.delServico));
      renderServicos();
    }
  });
}

function renderTabOrcamentos() {
  const servicos = getServicos();
  const orcamentos = getOrcamentos().slice().reverse();

  qs('#tabContent').innerHTML = `
    <div class="tab-toolbar">
      <div class="view-desc" style="margin:0;">Monte orçamentos e mande pelo WhatsApp</div>
      <div class="tab-actions">
        <button class="btn btn-ghost" id="btnOrcamentoSimples">✏️ Orçamento simples</button>
        <button class="btn btn-whatsapp" id="btnGerarOrcamento" ${servicos.length === 0 ? 'disabled title="Cadastre pelo menos um serviço primeiro"' : ''}>💬 Orçamento pelo catálogo</button>
      </div>
    </div>

    <div class="section-title" style="display:flex; align-items:center; justify-content:space-between;">
      <span>Histórico de orçamentos</span>
      ${orcamentos.length > 0 ? `
        <div style="display:flex; gap:6px;">
          <button class="btn btn-sm ${_orcamentoView === 'lista' ? 'btn-primary' : 'btn-ghost'}" id="btnViewLista">Lista</button>
          <button class="btn btn-sm ${_orcamentoView === 'funil' ? 'btn-primary' : 'btn-ghost'}" id="btnViewFunil">Funil</button>
        </div>
      ` : ''}
    </div>
    ${orcamentos.length === 0 ? emptyState('Nenhum orçamento ainda', 'Clique em "Orçamento pelo catálogo" ou "Orçamento simples" pra montar o primeiro.') : `
      <div class="orcamento-status-resumo">
        ${STATUS_ORCAMENTO.map(s => {
          const qtd = orcamentos.filter(o => (o.status || 'nao_enviado') === s.id).length;
          return qtd > 0 ? `<span class="stamp-badge ${s.classe}">${qtd} · ${s.label}</span>` : '';
        }).join('')}
      </div>

      ${(() => {
        const seguirCom = orcamentos.filter(o => {
          const st = o.status || 'nao_enviado';
          if (st !== 'enviado' && st !== 'aguardando_retorno') return false;
          const dias = daysUntil(o.atualizadoEm || o.criadoEm);
          return dias <= -3;
        });
        if (seguirCom.length === 0) return '';
        return `
          <div class="followup-banner">
            <strong>🔔 ${seguirCom.length} orçamento${seguirCom.length > 1 ? 's' : ''} sem novidade há 3+ dias:</strong>
            ${seguirCom.map(o => `<span class="today-item">${escapeHtml(o.nomeContato)} <button class="btn btn-whatsapp btn-sm" data-followup-orcamento="${o.id}" style="margin-left:6px;">Mandar um oi</button></span>`).join('')}
          </div>
        `;
      })()}

      ${_orcamentoView === 'lista' ? `
      <div class="ledger">
        ${orcamentos.map(o => {
          const status = statusOrcamentoInfo(o.status || 'nao_enviado');
          return `
          <div class="ledger-row">
            <div class="ledger-main">
              <div class="ledger-title">${escapeHtml(o.nomeContato)}</div>
              <div class="ledger-sub">${escapeHtml(o.resumo)} · ${formatDateBR(o.criadoEm)}</div>
            </div>
            <div class="ledger-value">${o.totalUnico > 0 ? formatCurrency(o.totalUnico) : ''}${o.totalUnico > 0 && o.totalMensal > 0 ? ' + ' : ''}${o.totalMensal > 0 ? formatCurrency(o.totalMensal) + '/mês' : ''}</div>
            <select class="input orcamento-status-select ${status.classe}" data-status-orcamento="${o.id}">
              ${STATUS_ORCAMENTO.map(s => `<option value="${s.id}" ${(o.status || 'nao_enviado') === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
            <div class="ledger-actions">
              <button class="btn btn-whatsapp btn-sm" data-reenviar-orcamento="${o.id}">Reenviar</button>
              <button class="btn btn-ghost btn-sm" data-editar-orcamento="${o.id}">Editar</button>
              <button class="btn btn-danger btn-sm" data-del-orcamento="${o.id}">Excluir</button>
            </div>
          </div>`;
        }).join('')}
      </div>
      ` : `
      <div class="kanban-board">
        ${STATUS_ORCAMENTO.map(s => {
          const itens = orcamentos.filter(o => (o.status || 'nao_enviado') === s.id);
          return `
          <div class="kanban-column">
            <div class="kanban-column-header ${s.classe}">${s.label} <span>${itens.length}</span></div>
            ${itens.map(o => `
              <div class="kanban-card">
                <div class="ledger-title" style="font-size:13px;">${escapeHtml(o.nomeContato)}</div>
                <div class="ledger-sub">${escapeHtml(o.resumo)}</div>
                <div class="ledger-value" style="font-size:13px; margin:6px 0;">${o.totalUnico > 0 ? formatCurrency(o.totalUnico) : ''}${o.totalUnico > 0 && o.totalMensal > 0 ? ' + ' : ''}${o.totalMensal > 0 ? formatCurrency(o.totalMensal) + '/mês' : ''}</div>
                <select class="input orcamento-status-select ${s.classe}" data-status-orcamento="${o.id}" style="width:100%; max-width:none; margin-bottom:6px;">
                  ${STATUS_ORCAMENTO.map(s2 => `<option value="${s2.id}" ${(o.status || 'nao_enviado') === s2.id ? 'selected' : ''}>${s2.label}</option>`).join('')}
                </select>
                <div class="ledger-actions">
                  <button class="btn btn-whatsapp btn-sm" data-reenviar-orcamento="${o.id}">Reenviar</button>
                  <button class="btn btn-ghost btn-sm" data-editar-orcamento="${o.id}">Editar</button>
                </div>
              </div>
            `).join('')}
          </div>`;
        }).join('')}
      </div>
      `}
    `}
  `;

  qs('#btnGerarOrcamento').onclick = () => { if (servicos.length > 0) openOrcamentoModal(); };
  qs('#btnOrcamentoSimples').onclick = () => openOrcamentoSimplesModal();
  const btnViewLista = qs('#btnViewLista');
  const btnViewFunil = qs('#btnViewFunil');
  if (btnViewLista) btnViewLista.onclick = () => { _orcamentoView = 'lista'; renderServicos(); };
  if (btnViewFunil) btnViewFunil.onclick = () => { _orcamentoView = 'funil'; renderServicos(); };
  qsa('[data-followup-orcamento]').forEach(b => b.onclick = () => {
    const o = getOrcamentos().find(x => x.id === b.dataset.followupOrcamento);
    const settings = getSettings();
    const quemFala = settings.seuNome || '';
    const msg = `👋 Oi, *${o.nomeContato}*! ${quemFala ? 'Aqui é o ' + quemFala + '.' : ''} Passando só pra saber se você já conseguiu dar uma olhada no orçamento que te mandei. Fico à disposição pra qualquer dúvida! 🙂`;
    openSendWhatsappModal(`Follow-up — ${o.nomeContato}`, { nome: o.nomeContato, telefone: o.telefoneContato }, msg);
  });
  qsa('[data-status-orcamento]').forEach(sel => sel.onchange = () => {
    updateOrcamentoStatus(sel.dataset.statusOrcamento, sel.value);
    renderServicos();
  });
  qsa('[data-reenviar-orcamento]').forEach(b => b.onclick = () => {
    const o = getOrcamentos().find(x => x.id === b.dataset.reenviarOrcamento);
    openSendWhatsappModal(`Reenviar orçamento — ${o.nomeContato}`, { nome: o.nomeContato, telefone: o.telefoneContato }, o.mensagem, () => {
      updateOrcamentoStatus(o.id, 'enviado');
      renderServicos();
    });
  });
  qsa('[data-editar-orcamento]').forEach(b => b.onclick = () => openOrcamentoSimplesModal(b.dataset.editarOrcamento));
  qsa('[data-del-orcamento]').forEach(b => b.onclick = () => {
    if (confirm('Excluir este orçamento do histórico?')) {
      saveOrcamentos(getOrcamentos().filter(o => o.id !== b.dataset.delOrcamento));
      renderServicos();
    }
  });
}

function sincronizarServicosSugeridos() {
  const atuais = getServicos();
  let atualizados = 0;
  const novos = atuais.map(s => {
    const sugestao = SERVICOS_SUGERIDOS.find(x => x.nome === s.nome);
    if (sugestao && (sugestao.precoUnico !== s.precoUnico || sugestao.precoMensal !== s.precoMensal)) {
      atualizados++;
      return { ...s, precoUnico: sugestao.precoUnico, precoMensal: sugestao.precoMensal, descricao: sugestao.descricao };
    }
    return s;
  });
  if (atualizados === 0) { alert('Todos os serviços já estão com os valores mais recentes do catálogo sugerido.'); return; }
  if (confirm(`Isso vai atualizar o valor de ${atualizados} serviço${atualizados > 1 ? 's' : ''} (mesmo nome do catálogo sugerido) pro valor mais recente. Serviços com nome diferente do sugerido não são afetados. Confirma?`)) {
    saveServicos(novos);
    renderServicos();
  }
}

function openServiceModal(id) {
  const editing = id ? getServicos().find(s => s.id === id) : null;
  openModal(`
    <div class="modal-title">${editing ? 'Editar serviço' : 'Novo serviço'}</div>
    <form id="servicoForm">
      <div class="field">
        <label class="field-label">Nome do serviço</label>
        <input class="input" id="svNome" required value="${editing ? escapeHtml(editing.nome) : ''}">
      </div>
      <div class="field">
        <label class="field-label">Descrição (opcional)</label>
        <textarea class="input" id="svDescricao" style="min-height:60px; font-family:inherit; font-size:14px;">${editing ? escapeHtml(editing.descricao || '') : ''}</textarea>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Preço único (opcional)</label>
          <input class="input" type="number" min="0" step="0.01" id="svPrecoUnico" placeholder="Deixe em branco se não definiu ainda" value="${editing && editing.precoUnico != null ? editing.precoUnico : ''}">
        </div>
        <div class="field">
          <label class="field-label">Mensalidade (opcional)</label>
          <input class="input" type="number" min="0" step="0.01" id="svPrecoMensal" placeholder="Deixe em branco se não definiu ainda" value="${editing && editing.precoMensal != null ? editing.precoMensal : ''}">
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="btnCancelServico">Cancelar</button>
        <button type="submit" class="btn btn-primary">${editing ? 'Salvar' : 'Adicionar ao catálogo'}</button>
      </div>
    </form>
  `);
  qs('#btnCancelServico').onclick = closeModal;
  qs('#servicoForm').onsubmit = (e) => {
    e.preventDefault();
    const nome = qs('#svNome').value.trim();
    if (!nome) return;
    const precoUnicoRaw = qs('#svPrecoUnico').value;
    const precoMensalRaw = qs('#svPrecoMensal').value;
    const data = {
      nome,
      descricao: qs('#svDescricao').value.trim(),
      precoUnico: precoUnicoRaw === '' ? null : Number(precoUnicoRaw),
      precoMensal: precoMensalRaw === '' ? null : Number(precoMensalRaw)
    };
    const servicos = getServicos();
    if (editing) {
      const idx = servicos.findIndex(s => s.id === editing.id);
      servicos[idx] = { ...editing, ...data };
    } else {
      servicos.push({ id: uid(), ...data });
    }
    saveServicos(servicos);
    closeModal();
    renderServicos();
  };
}

function buildOrcamentoMessage(nomeContato, itens, plano, observacoes) {
  const settings = getSettings();
  const quemFala = settings.seuNome ? settings.seuNome : '';
  let totalUnico = 0, totalMensal = 0;

  const linhasItens = itens.map(it => {
    let linha = `\n🧾 *${it.nome}*`;
    if (it.precoUnico != null) { linha += `\n   💰 ${formatCurrency(it.precoUnico)} (pagamento único)`; totalUnico += it.precoUnico; }
    if (it.precoMensal != null) { linha += `\n   🔁 ${formatCurrency(it.precoMensal)}/mês`; totalMensal += it.precoMensal; }
    if (it.precoUnico == null && it.precoMensal == null) { linha += `\n   💬 valor a combinar`; }
    return linha;
  }).join('\n');

  let linhaPlano = '';
  if (plano) {
    linhaPlano = `\n\n📋 *Plano de suporte:* ${plano.nome} — ${formatCurrency(plano.valor)}/mês`;
    totalMensal += plano.valor;
  }

  let linhaTotais = '';
  if (totalUnico > 0) {
    const metade = totalUnico / 2;
    linhaTotais += `\n💵 *Valor de contratação:* ${formatCurrency(totalUnico)}`;
    linhaTotais += `\n   • 50% ao iniciar o projeto: ${formatCurrency(metade)}`;
    linhaTotais += `\n   • 50% na entrega final: ${formatCurrency(metade)}`;
  }
  if (totalMensal > 0) linhaTotais += `\n🔁 *Mensalidade total:* ${formatCurrency(totalMensal)}/mês`;

  const linhaObs = observacoes ? `\n\n📝 ${observacoes}` : '';

  const mensagem = `👋 Olá, *${nomeContato}*! ${quemFala ? 'Aqui quem fala é *' + quemFala + '*.' : ''}` +
    `\n\nSegue o orçamento que conversamos:` +
    `${linhasItens}` +
    `${linhaPlano}` +
    `${linhaTotais}` +
    `${linhaObs}` +
    `\n\n💳 Formas de pagamento: Pix, boleto, cartão de crédito, cartão de débito ou dinheiro.` +
    `\n📆 Dá pra antecipar trimestral (2% off), semestral (4% off) ou anual (8% off) também 😉` +
    `\n\n🙏 Qualquer dúvida, é só chamar!`;

  return { mensagem, totalUnico, totalMensal };
}

function openOrcamentoModal() {
  const clients = getClients();
  const servicos = getServicos();
  openModal(`
    <div class="modal-title">Gerar orçamento</div>
    <form id="orcamentoForm">
      <div class="field">
        <label class="field-label">Preencher com cliente já cadastrado (opcional)</label>
        <select class="input" id="ocClienteExistente">
          <option value="">— novo contato / não cadastrado —</option>
          ${clients.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Nome do contato</label>
          <input class="input" id="ocNome" required>
        </div>
        <div class="field">
          <label class="field-label">WhatsApp</label>
          <input class="input" id="ocTelefone" placeholder="Ex: 55 45 99999-8888" required>
        </div>
      </div>
      <div class="field">
        <label class="field-label">Serviços deste orçamento</label>
        <div class="ledger" style="max-height:220px; overflow-y:auto;">
          ${servicos.map(s => `
            <label class="service-check">
              <input type="checkbox" class="oc-servico" value="${s.id}">
              <span>
                <strong>${escapeHtml(s.nome)}</strong><br>
                <span class="service-check-preco">${s.precoUnico != null ? formatCurrency(s.precoUnico) + ' único' : ''}${s.precoUnico != null && s.precoMensal != null ? ' + ' : ''}${s.precoMensal != null ? formatCurrency(s.precoMensal) + '/mês' : ''}${s.precoUnico == null && s.precoMensal == null ? 'sem preço definido' : ''}</span>
              </span>
            </label>
          `).join('')}
        </div>
      </div>
      <div class="field">
        <label class="field-label">Incluir plano de suporte (opcional)</label>
        <select class="input" id="ocPlano">
          <option value="">— nenhum —</option>
          ${getMensalidades().map(p => `<option value="${p.id}">${p.nome} — ${formatCurrency(p.valor)}/mês</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field-label">Observações (opcional)</label>
        <textarea class="input" id="ocObs" placeholder="Ex: prazo de entrega, condição especial..." style="min-height:60px; font-family:inherit; font-size:14px;"></textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="btnCancelOrcamento">Cancelar</button>
        <button type="submit" class="btn btn-primary">Gerar mensagem</button>
      </div>
    </form>
  `);

  qs('#ocClienteExistente').onchange = () => {
    const c = clientById(qs('#ocClienteExistente').value);
    if (c) {
      qs('#ocNome').value = c.nome;
      qs('#ocTelefone').value = c.telefone;
    }
  };

  qs('#btnCancelOrcamento').onclick = closeModal;
  qs('#orcamentoForm').onsubmit = (e) => {
    e.preventDefault();
    const nomeContato = qs('#ocNome').value.trim();
    const telefoneContato = onlyDigits(qs('#ocTelefone').value);
    if (!nomeContato || telefoneContato.length < 10) {
      alert('Confira o nome e o WhatsApp do contato.');
      return;
    }
    const idsSelecionados = qsa('.oc-servico:checked').map(cb => cb.value);
    const planoId = qs('#ocPlano').value;
    const plano = planoId ? planoById(planoId) : null;
    if (idsSelecionados.length === 0 && !plano) {
      alert('Selecione pelo menos um serviço ou um plano de suporte.');
      return;
    }
    const itens = idsSelecionados.map(id => servicos.find(s => s.id === id)).filter(Boolean);
    const observacoes = qs('#ocObs').value.trim();

    const { mensagem, totalUnico, totalMensal } = buildOrcamentoMessage(nomeContato, itens, plano, observacoes);

    const resumoPartes = [];
    if (itens.length > 0) resumoPartes.push(`${itens.length} serviço${itens.length > 1 ? 's' : ''}`);
    if (plano) resumoPartes.push(plano.nome);
    const resumo = resumoPartes.join(' · ');

    const novoOrcamento = {
      id: uid(),
      nomeContato,
      telefoneContato,
      itens: itens.map(it => ({ nome: it.nome, precoUnico: it.precoUnico, precoMensal: it.precoMensal })),
      planoId: plano ? plano.id : null,
      planoNome: plano ? plano.nome : null,
      observacoes,
      resumo,
      totalUnico,
      totalMensal,
      mensagem,
      status: 'nao_enviado',
      atualizadoEm: todayISO(),
      criadoEm: todayISO()
    };
    saveOrcamentos([...getOrcamentos(), novoOrcamento]);

    closeModal();
    openSendWhatsappModal(`Enviar orçamento — ${nomeContato}`, { nome: nomeContato, telefone: telefoneContato }, mensagem, () => {
      updateOrcamentoStatus(novoOrcamento.id, 'enviado');
    });
  };
}

function openOrcamentoSimplesModal(editingId) {
  const clients = getClients();
  const editing = editingId ? getOrcamentos().find(o => o.id === editingId) : null;

  openModal(`
    <div class="modal-title">${editing ? 'Editar orçamento' : 'Orçamento simples'}</div>
    <p class="view-desc" style="margin:-10px 0 16px;">${editing ? 'Ajuste os itens, valores ou dados do contato à vontade.' : 'Digite os itens e valores na hora — não usa o catálogo, então não tem risco de somar nada em duplicidade.'}</p>
    <form id="orcamentoSimplesForm">
      ${editing ? '' : `
      <div class="field">
        <label class="field-label">Preencher com cliente já cadastrado (opcional)</label>
        <select class="input" id="ocsClienteExistente">
          <option value="">— novo contato / não cadastrado —</option>
          ${clients.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('')}
        </select>
      </div>
      `}
      <div class="field-row">
        <div class="field">
          <label class="field-label">Nome do contato</label>
          <input class="input" id="ocsNome" required value="${editing ? escapeHtml(editing.nomeContato) : ''}">
        </div>
        <div class="field">
          <label class="field-label">WhatsApp</label>
          <input class="input" id="ocsTelefone" placeholder="Ex: 55 45 99999-8888" required value="${editing ? escapeHtml(editing.telefoneContato) : ''}">
        </div>
      </div>
      <div class="field">
        <label class="field-label">Itens do orçamento</label>
        <div id="ocsItens"></div>
        <button type="button" class="btn btn-ghost btn-sm" id="btnAddItemOrcamento" style="margin-top:8px;">+ Adicionar item</button>
      </div>
      <div class="field">
        <label class="field-label">Observações (opcional)</label>
        <textarea class="input" id="ocsObs" placeholder="Ex: prazo de entrega, condição especial..." style="min-height:60px; font-family:inherit; font-size:14px;">${editing ? escapeHtml(editing.observacoes || '') : ''}</textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="btnCancelOrcamentoSimples">Cancelar</button>
        <button type="submit" class="btn btn-primary">${editing ? 'Salvar alterações' : 'Gerar mensagem'}</button>
      </div>
    </form>
  `);

  function addItemRow(nome, valor, tipo) {
    const row = document.createElement('div');
    row.className = 'oc-item-row';
    row.innerHTML = `
      <input class="input oc-item-nome" placeholder="Descrição (ex: Landing Page)" value="${nome ? escapeHtml(nome) : ''}">
      <input class="input oc-item-valor" type="number" min="0" step="0.01" placeholder="Valor" value="${valor || ''}">
      <select class="input oc-item-tipo">
        <option value="unico" ${tipo !== 'mensal' ? 'selected' : ''}>Único</option>
        <option value="mensal" ${tipo === 'mensal' ? 'selected' : ''}>Mensal</option>
      </select>
      <button type="button" class="btn btn-danger btn-sm oc-item-remove">×</button>
    `;
    row.querySelector('.oc-item-remove').onclick = () => row.remove();
    qs('#ocsItens').appendChild(row);
  }

  if (editing && editing.itens && editing.itens.length > 0) {
    editing.itens.forEach(it => addItemRow(it.nome, it.precoUnico != null ? it.precoUnico : it.precoMensal, it.precoMensal != null ? 'mensal' : 'unico'));
  } else {
    addItemRow();
  }
  qs('#btnAddItemOrcamento').onclick = () => addItemRow();

  if (!editing) {
    qs('#ocsClienteExistente').onchange = () => {
      const c = clientById(qs('#ocsClienteExistente').value);
      if (c) { qs('#ocsNome').value = c.nome; qs('#ocsTelefone').value = c.telefone; }
    };
  }

  qs('#btnCancelOrcamentoSimples').onclick = closeModal;
  qs('#orcamentoSimplesForm').onsubmit = (e) => {
    e.preventDefault();
    const nomeContato = qs('#ocsNome').value.trim();
    const telefoneContato = onlyDigits(qs('#ocsTelefone').value);
    if (!nomeContato || telefoneContato.length < 10) {
      alert('Confira o nome e o WhatsApp do contato.');
      return;
    }

    const itens = [];
    qsa('#ocsItens .oc-item-row').forEach(row => {
      const nome = row.querySelector('.oc-item-nome').value.trim();
      const valorRaw = row.querySelector('.oc-item-valor').value;
      const tipo = row.querySelector('.oc-item-tipo').value;
      if (!nome || valorRaw === '') return;
      const valor = Number(valorRaw);
      itens.push({ nome, precoUnico: tipo === 'unico' ? valor : null, precoMensal: tipo === 'mensal' ? valor : null });
    });
    if (itens.length === 0) {
      alert('Adicione pelo menos um item com descrição e valor.');
      return;
    }

    const observacoes = qs('#ocsObs').value.trim();
    const { mensagem, totalUnico, totalMensal } = buildOrcamentoMessage(nomeContato, itens, null, observacoes);
    const resumo = `${itens.length} ite${itens.length > 1 ? 'ns' : 'm'} (personalizado)`;

    if (editing) {
      const lista = getOrcamentos();
      const idx = lista.findIndex(o => o.id === editing.id);
      lista[idx] = { ...editing, nomeContato, telefoneContato, itens, observacoes, resumo, totalUnico, totalMensal, mensagem };
      saveOrcamentos(lista);
      closeModal();
      renderServicos();
      return;
    }

    const novoOrcamento = {
      id: uid(),
      nomeContato,
      telefoneContato,
      itens,
      planoId: null,
      planoNome: null,
      observacoes,
      resumo,
      totalUnico,
      totalMensal,
      mensagem,
      status: 'nao_enviado',
      atualizadoEm: todayISO(),
      criadoEm: todayISO()
    };
    saveOrcamentos([...getOrcamentos(), novoOrcamento]);

    closeModal();
    openSendWhatsappModal(`Enviar orçamento — ${nomeContato}`, { nome: nomeContato, telefone: telefoneContato }, mensagem, () => {
      updateOrcamentoStatus(novoOrcamento.id, 'enviado');
    });
  };
}

// ---------- MENSALIDADES (planos de suporte) ----------
function renderBlocosRecorrenciaEIndicacao() {
  const clients = getClients();
  const recorrentes = clients.filter(c => c.recorrente);
  const mesHoje = todayISO().slice(0, 7);
  const totalMensal = recorrentes.reduce((sum, c) => sum + (Number(c.valorPlano) || 0), 0);

  const blocoRec = `
    <div class="section-title">🔁 Mensalidades recorrentes (${recorrentes.length})</div>
    <p class="view-desc" style="margin-bottom:12px;">
      Clientes com lançamento automático: a cobrança do mês aparece sozinha em <b>Cobranças</b>.
      ${recorrentes.length ? `Total previsto por mês: <b>${formatCurrency(totalMensal)}</b>.` : 'Pra ativar, edite o cliente e marque "Lançar a mensalidade automaticamente todo mês".'}
    </p>
    ${recorrentes.length === 0 ? '' : `
      <div class="ledger" style="margin-bottom:30px;">
        ${recorrentes.map(c => {
          const cobMes = getCharges().find(ch => ch.id === `rec-${c.id}-${mesHoje}`);
          const st = cobMes ? (cobMes.isenta ? 'Isenta' : { pago: 'Paga', pendente: 'Pendente', atrasado: 'Atrasada' }[chargeStatus(cobMes)]) : '—';
          const cls = cobMes ? (cobMes.isenta ? 'stamp-pago' : { pago: 'stamp-pago', pendente: 'stamp-pendente', atrasado: 'stamp-atrasado' }[chargeStatus(cobMes)]) : 'stamp-pausado';
          return `
          <div class="ledger-row">
            <div class="ledger-main">
              <div class="ledger-title">${escapeHtml(c.nome)}</div>
              <div class="ledger-sub">${escapeHtml(c.plano || 'plano')} · vence todo dia ${diaVencimentoValido(c.diaVencimento)}${(Number(c.isencoesDisponiveis) || 0) > 0 ? ` · 🎁 ${c.isencoesDisponiveis} isenta(s) disponível(is)` : ''}</div>
            </div>
            <span class="stamp-badge ${cls}">${competenciaLabel(mesHoje)}: ${st}</span>
            <div class="ledger-value">${formatCurrency(c.valorPlano)}</div>
            <div class="ledger-actions">
              <button class="btn btn-ghost btn-sm" data-view-client="${c.id}">Ver</button>
              <button class="btn btn-ghost btn-sm" data-pausar-recorrencia="${c.id}">Pausar</button>
            </div>
          </div>`;
        }).join('')}
      </div>`}`;

  const indicados = clients.filter(c => c.indicadoPor && clientById(c.indicadoPor));
  const premiadas = indicados.filter(c => c.indicacaoPremiada).length;
  const blocoInd = `
    <div class="section-title">🎁 Indicações (${indicados.length})</div>
    <p class="view-desc" style="margin-bottom:12px;">
      Quando o cliente indicado paga a <b>1ª mensalidade</b>, quem indicou ganha <b>1 mensalidade isenta</b>.
      ${indicados.length ? `${premiadas} já premiada(s), ${indicados.length - premiadas} aguardando.` : 'Pra registrar, escolha "Indicado por" no cadastro do cliente indicado.'}
    </p>
    ${indicados.length === 0 ? '' : `
      <div class="ledger" style="margin-bottom:30px;">
        ${indicados.map(c => {
          const indicador = clientById(c.indicadoPor);
          return `
          <div class="ledger-row">
            <div class="ledger-main">
              <div class="ledger-title">${escapeHtml(c.nome)} <span class="avulso-tag">indicado por ${escapeHtml(indicador.nome)}</span></div>
              <div class="ledger-sub">${c.indicacaoPremiada ? 'Isenção concedida em ' + formatDateBR(c.indicacaoPremiadaEm) : 'Aguardando o pagamento da 1ª mensalidade'}</div>
            </div>
            <span class="stamp-badge ${c.indicacaoPremiada ? 'stamp-pago' : 'stamp-pendente'}">${c.indicacaoPremiada ? '🎁 Premiada' : 'Aguardando'}</span>
            <div class="ledger-actions">
              <button class="btn btn-ghost btn-sm" data-view-client="${c.id}">Ver</button>
            </div>
          </div>`;
        }).join('')}
      </div>`}`;

  return { rec: blocoRec, ind: blocoInd, nRec: recorrentes.length, nInd: indicados.length };
}

// Mantida por compatibilidade: abre a aba Mensalidades dentro da tela única.
function renderMensalidades() {
  _servicosTab = 'mensalidades';
  renderServicos();
}

function renderTabMensalidades() {
  const mensalidades = getMensalidades();
  const blocos = renderBlocosRecorrenciaEIndicacao();

  qs('#tabContent').innerHTML = `
    <div class="subtabs">
      <button class="subtab-btn ${_mensSubtab === 'planos' ? 'active' : ''}" data-subtab="planos">Planos <span class="tab-count">${mensalidades.length}</span></button>
      <button class="subtab-btn ${_mensSubtab === 'recorrentes' ? 'active' : ''}" data-subtab="recorrentes">🔁 Recorrentes <span class="tab-count">${blocos.nRec}</span></button>
      <button class="subtab-btn ${_mensSubtab === 'indicacoes' ? 'active' : ''}" data-subtab="indicacoes">🎁 Indicações <span class="tab-count">${blocos.nInd}</span></button>
    </div>

    ${_mensSubtab === 'recorrentes' ? blocos.rec : _mensSubtab === 'indicacoes' ? blocos.ind : `
    <div class="tab-toolbar">
      <div class="view-desc" style="margin:0;">Planos de suporte recorrentes — usados no cadastro de cliente e nos orçamentos</div>
      <div class="tab-actions">
        ${mensalidades.length > 0 ? `<button class="btn btn-ghost" id="btnSyncMensalidades">🔄 Atualizar valores</button>` : ''}
        <button class="btn btn-primary" id="btnNovaMensalidade">+ Novo plano</button>
      </div>
    </div>

    ${mensalidades.length > 0 ? `<div class="section-title">Planos de mensalidade</div>` : ``}
    ${mensalidades.length === 0 ? `
      <div class="section-title">Planos sugeridos</div>
      <p class="view-desc" style="margin-bottom:14px;">
        Comecei com os planos da sua proposta atual. Pode adicionar, editar valores
        e nomes à vontade — tudo daqui pra frente é totalmente seu.
      </p>
      <div class="ledger" style="margin-bottom:20px;">
        ${MENSALIDADES_SUGERIDAS.map((p, i) => `
          <div class="ledger-row">
            <div class="ledger-main">
              <div class="ledger-title">${escapeHtml(p.nome)}</div>
              ${p.descricao ? `<div class="ledger-sub">${escapeHtml(p.descricao)}</div>` : ''}
            </div>
            <div class="ledger-value">${formatCurrency(p.valor)}/mês</div>
            <div class="ledger-actions">
              <button class="btn btn-primary btn-sm" data-add-mensalidade-sugerida="${i}">+ Adicionar</button>
            </div>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-ghost btn-sm" id="btnAddTodasMensalidades" style="margin-bottom:30px;">+ Adicionar todos de uma vez</button>
    ` : `
      <div class="ledger">
        ${mensalidades.map(p => `
          <div class="ledger-row">
            <div class="ledger-main">
              <div class="ledger-title">${escapeHtml(p.nome)}</div>
              ${p.descricao ? `<div class="ledger-sub">${escapeHtml(p.descricao)}</div>` : ''}
            </div>
            <div class="ledger-value">${formatCurrency(p.valor)}/mês</div>
            <div class="ledger-actions">
              <button class="btn btn-ghost btn-sm" data-edit-mensalidade="${p.id}">Editar</button>
              <button class="btn btn-danger btn-sm" data-del-mensalidade="${p.id}">Excluir</button>
            </div>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-ghost btn-sm" style="margin-top:14px;" id="btnAddSugeridasExtra">+ Ver planos sugeridos que faltam</button>
    `}

    `}
  `;

  qsa('.subtab-btn').forEach(b => b.onclick = () => { _mensSubtab = b.dataset.subtab; renderServicos(); });
  const btnNovaMensalidade = qs('#btnNovaMensalidade');
  if (btnNovaMensalidade) btnNovaMensalidade.onclick = () => openMensalidadeModal();
  qsa('[data-view-client]').forEach(b => b.onclick = () => renderClienteDetalhe(b.dataset.viewClient));
  qsa('[data-pausar-recorrencia]').forEach(b => b.onclick = () => {
    const c = clientById(b.dataset.pausarRecorrencia);
    if (!c || !confirm(`Pausar o lançamento automático da mensalidade de ${c.nome}? As cobranças já lançadas continuam. Pra voltar, é só marcar de novo na edição do cliente.`)) return;
    saveClients(getClients().map(x => x.id === c.id ? { ...x, recorrente: false } : x));
    renderMensalidades();
  });
  const btnSyncMensalidades = qs('#btnSyncMensalidades');
  if (btnSyncMensalidades) btnSyncMensalidades.onclick = () => sincronizarMensalidadesSugeridas();
  qsa('[data-add-mensalidade-sugerida]').forEach(b => b.onclick = () => {
    const p = MENSALIDADES_SUGERIDAS[Number(b.dataset.addMensalidadeSugerida)];
    saveMensalidades([...getMensalidades(), { ...p }]);
    renderMensalidades();
  });
  const btnTodas = qs('#btnAddTodasMensalidades');
  if (btnTodas) btnTodas.onclick = () => {
    saveMensalidades([...getMensalidades(), ...MENSALIDADES_SUGERIDAS.map(p => ({ ...p }))]);
    renderMensalidades();
  };
  const btnExtra = qs('#btnAddSugeridasExtra');
  if (btnExtra) btnExtra.onclick = () => {
    const idsAtuais = mensalidades.map(p => p.id);
    const faltando = MENSALIDADES_SUGERIDAS.filter(p => !idsAtuais.includes(p.id));
    if (faltando.length === 0) { alert('Todos os planos sugeridos já estão no seu catálogo.'); return; }
    saveMensalidades([...getMensalidades(), ...faltando.map(p => ({ ...p }))]);
    renderMensalidades();
  };
  qsa('[data-edit-mensalidade]').forEach(b => b.onclick = () => openMensalidadeModal(b.dataset.editMensalidade));
  qsa('[data-del-mensalidade]').forEach(b => b.onclick = () => {
    const emUso = getClients().filter(c => c.planoId === b.dataset.delMensalidade).length;
    const msg = emUso > 0
      ? `${emUso} cliente${emUso > 1 ? 's estão' : ' está'} usando esse plano. Excluir aqui não muda o que já foi salvo no cadastro deles, mas o plano some da lista de opções. Confirma?`
      : 'Excluir este plano?';
    if (confirm(msg)) {
      saveMensalidades(getMensalidades().filter(p => p.id !== b.dataset.delMensalidade));
      renderMensalidades();
    }
  });
}

function sincronizarMensalidadesSugeridas() {
  const atuais = getMensalidades();
  let atualizados = 0;
  const novos = atuais.map(p => {
    const sugestao = MENSALIDADES_SUGERIDAS.find(x => x.id === p.id);
    if (sugestao && (sugestao.valor !== p.valor || sugestao.nome !== p.nome)) {
      atualizados++;
      return { ...p, nome: sugestao.nome, valor: sugestao.valor, descricao: sugestao.descricao };
    }
    return p;
  });
  if (atualizados === 0) { alert('Todos os planos já estão com os valores mais recentes do catálogo sugerido.'); return; }
  if (confirm(`Isso vai atualizar ${atualizados} plano${atualizados > 1 ? 's' : ''} pro valor mais recente do catálogo sugerido. Planos criados por você (fora da sugestão) não são afetados. Confirma?`)) {
    saveMensalidades(novos);
    renderMensalidades();
  }
}

function openMensalidadeModal(id) {
  const editing = id ? getMensalidades().find(p => p.id === id) : null;
  openModal(`
    <div class="modal-title">${editing ? 'Editar plano' : 'Novo plano'}</div>
    <form id="mensalidadeForm">
      <div class="field">
        <label class="field-label">Nome do plano</label>
        <input class="input" id="mnNome" required value="${editing ? escapeHtml(editing.nome) : ''}">
      </div>
      <div class="field">
        <label class="field-label">Valor mensal (R$)</label>
        <input class="input" type="number" min="0" step="0.01" id="mnValor" required value="${editing ? editing.valor : ''}">
      </div>
      <div class="field">
        <label class="field-label">Descrição (opcional)</label>
        <textarea class="input" id="mnDescricao" style="min-height:70px; font-family:inherit; font-size:14px;">${editing ? escapeHtml(editing.descricao || '') : ''}</textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="btnCancelMensalidade">Cancelar</button>
        <button type="submit" class="btn btn-primary">${editing ? 'Salvar' : 'Adicionar'}</button>
      </div>
    </form>
  `);
  qs('#btnCancelMensalidade').onclick = closeModal;
  qs('#mensalidadeForm').onsubmit = (e) => {
    e.preventDefault();
    const nome = qs('#mnNome').value.trim();
    const valor = Number(qs('#mnValor').value);
    if (!nome || valor < 0) return;
    const data = { nome, valor, descricao: qs('#mnDescricao').value.trim() };
    const mensalidades = getMensalidades();
    if (editing) {
      const idx = mensalidades.findIndex(p => p.id === editing.id);
      mensalidades[idx] = { ...editing, ...data };
    } else {
      mensalidades.push({ id: uid(), ...data });
    }
    saveMensalidades(mensalidades);
    closeModal();
    renderMensalidades();
  };
}

// ---------- SAÍDAS ----------
// Registro de tudo que sai do caixa. O "recebido" vem das cobranças já pagas
// (as vendas), então o saldo = o que entrou − o que você registrou aqui.
const CATEGORIAS_SAIDA = [
  'Hospedagem e domínio',
  'Ferramentas e assinaturas',
  'Comissão de parceria',
  'Impostos e taxas',
  'Marketing',
  'Equipamentos',
  'Retirada pessoal',
  'Outros'
];
let _saidasPeriodo = null; // 'AAAA-MM' (sempre um mês específico)

function hojeLocalISO() { return todayISO(); }
function mesAnteriorISO(mes) {
  let [a, m] = mes.split('-').map(Number);
  m--;
  if (m < 1) { m = 12; a--; }
  return `${a}-${String(m).padStart(2, '0')}`;
}
// cobranças pagas dentro do mês (pela data em que o dinheiro entrou)
function recebidosDoMes(mes) {
  return getCharges()
    .filter(c => c.status === 'pago' && !c.isenta && (c.dataPagamento || '').slice(0, 7) === mes)
    .sort((a, b) => (b.dataPagamento || '').localeCompare(a.dataPagamento || ''));
}
function totalRecebidoPeriodo(mes) {
  return recebidosDoMes(mes).reduce((s, c) => s + Number(c.valor || 0), 0);
}

function renderSaidas() {
  const mesAtual = hojeLocalISO().slice(0, 7);
  if (!_saidasPeriodo || _saidasPeriodo === 'tudo') _saidasPeriodo = mesAtual;
  const periodo = _saidasPeriodo;

  const todas = getSaidas();
  const doPeriodo = todas
    .filter(s => (s.data || '').slice(0, 7) === periodo)
    .sort((a, b) => (b.data || '').localeCompare(a.data || ''));

  const recebimentos = recebidosDoMes(periodo);
  const entradas = recebimentos.reduce((s, c) => s + Number(c.valor || 0), 0);
  const saidas = doPeriodo.reduce((s, x) => s + Number(x.valor || 0), 0);
  const saldo = entradas - saidas;
  const pct = entradas > 0 ? Math.round(saidas / entradas * 100) : (saidas > 0 ? 100 : 0);
  const classePct = pct <= 60 ? 'ok' : (pct <= 90 ? 'alerta' : 'perigo');

  const porCategoria = {};
  doPeriodo.forEach(s => { const k = s.categoria || 'Outros'; porCategoria[k] = (porCategoria[k] || 0) + Number(s.valor || 0); });
  const categorias = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);

  qs('#main').innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">Saídas</div>
        <div class="view-desc">Cada mês é separado: o que saiu, comparado com o que você recebeu das vendas naquele mês</div>
      </div>
      <button class="btn btn-primary" id="btnNovaSaida">+ Nova saída</button>
    </div>

    <div class="periodo-nav">
      <button class="btn btn-ghost btn-sm" id="perAnt" aria-label="Mês anterior">‹</button>
      <div class="periodo-label">${mesAnoLabel(periodo)}</div>
      <button class="btn btn-ghost btn-sm" id="perProx" ${periodo >= mesAtual ? 'disabled' : ''} aria-label="Próximo mês">›</button>
      ${periodo !== mesAtual ? '<button class="btn btn-ghost btn-sm" id="perHoje">Mês atual</button>' : ''}
    </div>

    <div class="cards-grid">
      <div class="stat-card">
        <div class="stat-label">Recebido em ${mesAnoLabel(periodo)}</div>
        <div class="stat-value emerald">${formatCurrency(entradas)}</div>
        <div class="stat-sub">${recebimentos.length} pagamento${recebimentos.length === 1 ? '' : 's'} no mês</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Saídas</div>
        <div class="stat-value brick">${formatCurrency(saidas)}</div>
        <div class="stat-sub">${doPeriodo.length} lançamento${doPeriodo.length === 1 ? '' : 's'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Saldo</div>
        <div class="stat-value ${saldo >= 0 ? 'emerald' : 'brick'}">${formatCurrency(saldo)}</div>
        <div class="stat-sub">${saldo >= 0 ? 'sobrou do que entrou no mês' : 'saiu mais do que entrou no mês'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Já saiu do recebido</div>
        <div class="stat-value">${pct}%</div>
        <div class="gasto-bar"><div class="gasto-bar-fill ${classePct}" style="width:${Math.min(pct, 100)}%;"></div></div>
      </div>
    </div>

    <details class="entradas-box">
      <summary>💰 O que entrou em ${mesAnoLabel(periodo)} (${recebimentos.length}) — ${formatCurrency(entradas)}</summary>
      ${recebimentos.length === 0 ? '<div class="view-desc" style="padding:10px 4px;">Nenhum pagamento recebido neste mês.</div>' : `
      <div class="ledger" style="margin-top:10px;">
        ${recebimentos.map(c => {
          const cli = c.clientId ? clientById(c.clientId) : null;
          return `
          <div class="ledger-row">
            <div class="ledger-main">
              <div class="ledger-title">${escapeHtml(cli ? cli.nome : (c.avulsoNome || 'Cliente removido'))}</div>
              <div class="ledger-sub">${escapeHtml(c.descricao)} · pago em ${formatDateBR(c.dataPagamento)}</div>
            </div>
            <div class="ledger-value" style="color:var(--emerald);">+ ${formatCurrency(c.valor)}</div>
          </div>`;
        }).join('')}
      </div>`}
    </details>

    ${categorias.length > 0 ? `
      <div class="section-title">Para onde foi o dinheiro</div>
      <div class="cat-list">
        ${categorias.map(([nome, valor]) => `
          <div class="cat-row">
            <div class="cat-row-top"><span>${escapeHtml(nome)}</span><span class="cat-valor">${formatCurrency(valor)} · ${saidas > 0 ? Math.round(valor / saidas * 100) : 0}%</span></div>
            <div class="gasto-bar"><div class="gasto-bar-fill neutro" style="width:${saidas > 0 ? Math.round(valor / saidas * 100) : 0}%;"></div></div>
          </div>`).join('')}
      </div>
    ` : ''}

    <div class="section-title">Lançamentos</div>
    ${doPeriodo.length === 0
      ? emptyState('Nenhuma saída neste mês', 'Clique em "Nova saída" pra registrar um gasto.')
      : `
      <div class="ledger">
        ${doPeriodo.map(s => `
          <div class="ledger-row">
            <div class="ledger-main">
              <div class="ledger-title">${escapeHtml(s.descricao)} <span class="avulso-tag">${escapeHtml(s.categoria || 'Outros')}</span></div>
              <div class="ledger-sub">${formatDateBR(s.data)}${s.observacoes ? ' · ' + escapeHtml(s.observacoes) : ''}</div>
            </div>
            <div class="ledger-value saida-valor">− ${formatCurrency(s.valor)}</div>
            <div class="ledger-actions">
              <button class="btn btn-ghost btn-sm" data-edit-saida="${s.id}">Editar</button>
              <button class="btn btn-danger btn-sm" data-del-saida="${s.id}">Excluir</button>
            </div>
          </div>`).join('')}
      </div>`}
  `;

  qs('#btnNovaSaida').onclick = () => openSaidaModal();
  qs('#perAnt').onclick = () => { _saidasPeriodo = mesAnteriorISO(periodo); renderSaidas(); };
  qs('#perProx').onclick = () => { _saidasPeriodo = proximoMesISO(periodo); renderSaidas(); };
  const perHoje = qs('#perHoje');
  if (perHoje) perHoje.onclick = () => { _saidasPeriodo = mesAtual; renderSaidas(); };
  qsa('[data-edit-saida]').forEach(b => b.onclick = () => openSaidaModal(b.dataset.editSaida));
  qsa('[data-del-saida]').forEach(b => b.onclick = () => {
    if (confirm('Excluir esta saída?')) {
      saveSaidas(getSaidas().filter(s => s.id !== b.dataset.delSaida));
      renderSaidas();
    }
  });
}

function openSaidaModal(id) {
  const editing = id ? getSaidas().find(s => s.id === id) : null;
  openModal(`
    <div class="modal-title">${editing ? 'Editar saída' : 'Nova saída'}</div>
    <form id="saidaForm">
      <div class="field">
        <label class="field-label">Descrição</label>
        <input class="input" id="sdDescricao" required placeholder="Ex: Domínio do site da Ana, assinatura do Canva..." value="${editing ? escapeHtml(editing.descricao) : ''}">
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Valor (R$)</label>
          <input class="input" id="sdValor" type="number" min="0.01" step="0.01" required value="${editing ? Number(editing.valor).toFixed(2) : ''}">
        </div>
        <div class="field">
          <label class="field-label">Data</label>
          <input class="input" id="sdData" type="date" required value="${editing ? editing.data : hojeLocalISO()}">
        </div>
      </div>
      <div class="field">
        <label class="field-label">Categoria</label>
        <select class="input" id="sdCategoria">
          ${CATEGORIAS_SAIDA.map(c => `<option value="${c}" ${(editing ? editing.categoria : '') === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field-label">Observações (opcional)</label>
        <textarea class="input" id="sdObs" style="min-height:60px; font-family:inherit; font-size:14px;">${editing ? escapeHtml(editing.observacoes || '') : ''}</textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="btnCancelSaida">Cancelar</button>
        <button type="submit" class="btn btn-primary">${editing ? 'Salvar' : 'Registrar saída'}</button>
      </div>
    </form>
  `);
  qs('#btnCancelSaida').onclick = closeModal;
  qs('#saidaForm').onsubmit = (e) => {
    e.preventDefault();
    const valor = Number(qs('#sdValor').value);
    if (!(valor > 0)) { alert('Informe um valor maior que zero.'); return; }
    const data = {
      descricao: qs('#sdDescricao').value.trim(),
      valor,
      data: qs('#sdData').value,
      categoria: qs('#sdCategoria').value,
      observacoes: qs('#sdObs').value.trim()
    };
    const lista = getSaidas().slice();
    if (editing) {
      const idx = lista.findIndex(s => s.id === editing.id);
      lista[idx] = { ...editing, ...data };
    } else {
      lista.push({ id: uid(), criadoEm: todayISO(), ...data });
    }
    saveSaidas(lista);
    // se a saída é de outro mês, mostra o mês dela pra ela não "sumir"
    _saidasPeriodo = data.data.slice(0, 7);
    closeModal();
    renderSaidas();
  };
}

// ---------- NEGOCIAÇÕES (parcerias com colaboradora(s)) ----------
// Aqui você registra, por projeto/cliente, o valor de contratação (pago
// uma vez), a mensalidade (recorrente) e o percentual que a pessoa que te
// ajuda recebe. O valor a receber dela é calculado automaticamente sobre
// cada um dos dois — contratação é comissão única, mensalidade é todo mês.
function comissaoContratacao(n) { return (Number(n.valorContratacao) || 0) * (Number(n.percentual) || 0) / 100; }
function comissaoMensal(n) { return (Number(n.valorMensalidade) || 0) * (Number(n.percentual) || 0) / 100; }
function mesAtualISO() { return todayISO().slice(0, 7); }
function mesAnoLabel(isoMonth) {
  const [y, m] = isoMonth.split('-');
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(Number(y), Number(m) - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}
// a mensalidade "renova" sozinha todo dia 01: comparamos o mês salvo em
// mensalidadePagaMes com o mês atual — se não bater, volta a pendente.
function mensalidadeEstaPagaEsteMes(n) { return n.mensalidadePagaMes === mesAtualISO(); }

function renderNegociacoes() {
  const negociacoes = getNegociacoes();
  const clients = getClients();

  if (clients.length === 0) {
    qs('#main').innerHTML = `
      <div class="view-header">
        <div>
          <div class="view-title">Negociações</div>
          <div class="view-desc">Projetos em parceria — cliente, contratação, mensalidade e quanto cada colaboradora recebe</div>
        </div>
      </div>
      ${emptyState('Cadastre um cliente primeiro', 'Pra registrar uma negociação você escolhe o cliente na lista de Clientes. Cadastre ao menos um pra começar.')}
    `;
    return;
  }

  const totalMensal = negociacoes.reduce((sum, n) => sum + comissaoMensal(n), 0);
  const totalContratacaoAberta = negociacoes.filter(n => !n.contratacaoPaga).reduce((sum, n) => sum + comissaoContratacao(n), 0);
  const totalMensalidadePendente = negociacoes.filter(n => Number(n.valorMensalidade) > 0 && !mensalidadeEstaPagaEsteMes(n)).reduce((sum, n) => sum + comissaoMensal(n), 0);
  const colaboradorasAtivas = new Set(negociacoes.map(n => n.colaboradora.trim().toLowerCase())).size;

  qs('#main').innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">Negociações</div>
        <div class="view-desc">Projetos em parceria — cliente, contratação, mensalidade e quanto cada colaboradora recebe</div>
      </div>
      <button class="btn btn-primary" id="btnNovaNegociacao">+ Nova negociação</button>
    </div>

    ${negociacoes.length > 0 ? `
      <div class="cards-grid">
        <div class="stat-card">
          <div class="stat-label">Comissão recorrente / mês</div>
          <div class="stat-value">${formatCurrency(totalMensal)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Mensalidades pendentes (${mesAnoLabel(mesAtualISO())})</div>
          <div class="stat-value brick">${formatCurrency(totalMensalidadePendente)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Comissão de contratação em aberto</div>
          <div class="stat-value brick">${formatCurrency(totalContratacaoAberta)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Colaboradoras com projetos</div>
          <div class="stat-value">${colaboradorasAtivas}</div>
        </div>
      </div>
    ` : ''}

    ${negociacoes.length === 0 ? emptyState('Nenhuma negociação registrada', 'Registre um projeto em parceria: escolha o cliente, o valor de contratação, a mensalidade e o percentual que a colaboradora recebe.') : (() => {
      const grupos = new Map();
      negociacoes.forEach(n => {
        const nome = (n.colaboradora || 'Sem nome').trim();
        const chave = nome.toLowerCase();
        if (!grupos.has(chave)) grupos.set(chave, { nome, itens: [] });
        grupos.get(chave).itens.push(n);
      });
      const mesLabel = mesAnoLabel(mesAtualISO());
      return Array.from(grupos.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(g => {
        const recMes = g.itens.reduce((s, n) => s + comissaoMensal(n), 0);
        const pendente =
          g.itens.filter(n => !n.contratacaoPaga).reduce((s, n) => s + comissaoContratacao(n), 0) +
          g.itens.filter(n => Number(n.valorMensalidade) > 0 && !mensalidadeEstaPagaEsteMes(n)).reduce((s, n) => s + comissaoMensal(n), 0);
        return `
        <div class="neg-group">
          <div class="neg-group-head">
            <div>
              <div class="neg-group-name">${escapeHtml(g.nome)}</div>
              <div class="ledger-sub">${g.itens.length} projeto${g.itens.length > 1 ? 's' : ''}</div>
            </div>
            <div class="neg-group-totais">
              <span class="stamp-badge stamp-pausado">${formatCurrency(recMes)}/mês recorrente</span>
              <span class="stamp-badge ${pendente > 0 ? 'stamp-pendente' : 'stamp-pago'}">${pendente > 0 ? formatCurrency(pendente) + ' a pagar agora' : 'tudo em dia'}</span>
            </div>
          </div>
          <div class="ledger">
            ${g.itens.map(n => {
              const cliente = clientById(n.clienteId);
              const temContr = Number(n.valorContratacao) > 0;
              const temMens = Number(n.valorMensalidade) > 0;
              const mensalidadePaga = mensalidadeEstaPagaEsteMes(n);
              return `
              <div class="ledger-row neg-row">
                <div class="neg-client">
                  <div class="ledger-title">${escapeHtml(cliente ? cliente.nome : 'Cliente removido')}</div>
                  <div class="ledger-sub">${Number(n.percentual) || 0}% de comissão</div>
                  ${n.observacoes ? `<div class="ledger-sub" style="margin-top:4px;">${escapeHtml(n.observacoes)}</div>` : ''}
                </div>
                <div class="neg-col">
                  <div class="neg-col-label">Contratação (uma vez)</div>
                  ${temContr ? `
                    <div class="neg-col-valor">${formatCurrency(comissaoContratacao(n))} <span class="neg-col-base">de ${formatCurrency(n.valorContratacao)}</span></div>
                    <div class="neg-col-acao">
                      <span class="stamp-badge ${n.contratacaoPaga ? 'stamp-pago' : 'stamp-pendente'}">${n.contratacaoPaga ? 'paga' : 'pendente'}</span>
                      <button class="btn btn-ghost btn-sm" data-toggle-paga-negociacao="${n.id}">${n.contratacaoPaga ? 'Desfazer' : 'Marcar paga'}</button>
                    </div>` : '<div class="neg-col-vazio">—</div>'}
                </div>
                <div class="neg-col">
                  <div class="neg-col-label">Mensalidade (${mesLabel})</div>
                  ${temMens ? `
                    <div class="neg-col-valor">${formatCurrency(comissaoMensal(n))}/mês <span class="neg-col-base">de ${formatCurrency(n.valorMensalidade)}</span></div>
                    <div class="neg-col-acao">
                      <span class="stamp-badge ${mensalidadePaga ? 'stamp-pago' : 'stamp-pendente'}">${mensalidadePaga ? 'paga' : 'pendente'}</span>
                      <button class="btn btn-ghost btn-sm" data-toggle-mensalidade-negociacao="${n.id}">${mensalidadePaga ? 'Desfazer' : 'Marcar paga'}</button>
                    </div>` : '<div class="neg-col-vazio">—</div>'}
                </div>
                <div class="ledger-actions">
                  <button class="btn btn-ghost btn-sm" data-edit-negociacao="${n.id}">Editar</button>
                  <button class="btn btn-danger btn-sm" data-del-negociacao="${n.id}">Excluir</button>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>`;
      }).join('');
    })()}
  `;

  qs('#btnNovaNegociacao').onclick = () => openNegociacaoModal();
  qsa('[data-edit-negociacao]').forEach(b => b.onclick = () => openNegociacaoModal(b.dataset.editNegociacao));
  qsa('[data-toggle-paga-negociacao]').forEach(b => b.onclick = () => {
    const list = getNegociacoes();
    const idx = list.findIndex(n => n.id === b.dataset.togglePagaNegociacao);
    if (idx === -1) return;
    list[idx] = { ...list[idx], contratacaoPaga: !list[idx].contratacaoPaga };
    saveNegociacoes(list);
    renderNegociacoes();
  });
  qsa('[data-toggle-mensalidade-negociacao]').forEach(b => b.onclick = () => {
    const list = getNegociacoes();
    const idx = list.findIndex(n => n.id === b.dataset.toggleMensalidadeNegociacao);
    if (idx === -1) return;
    const jaPaga = mensalidadeEstaPagaEsteMes(list[idx]);
    list[idx] = { ...list[idx], mensalidadePagaMes: jaPaga ? null : mesAtualISO() };
    saveNegociacoes(list);
    renderNegociacoes();
  });
  qsa('[data-del-negociacao]').forEach(b => b.onclick = () => {
    if (confirm('Excluir esta negociação? Isso não mexe em nada já cadastrado no cliente, só remove o registro da parceria.')) {
      saveNegociacoes(getNegociacoes().filter(n => n.id !== b.dataset.delNegociacao));
      renderNegociacoes();
    }
  });
}

function openNegociacaoModal(id) {
  const editing = id ? getNegociacoes().find(n => n.id === id) : null;
  const clients = getClients();
  const colaboradorasConhecidas = Array.from(new Set(getNegociacoes().map(n => n.colaboradora).filter(Boolean)));

  openModal(`
    <div class="modal-title">${editing ? 'Editar negociação' : 'Nova negociação'}</div>
    <form id="negociacaoForm">
      <div class="field">
        <label class="field-label">Cliente</label>
        <select class="input" id="ngCliente" required>
          ${clients.map(c => `<option value="${c.id}" ${editing && editing.clienteId === c.id ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field-label">Colaboradora</label>
        <input class="input" id="ngColaboradora" list="ngColaboradorasList" required placeholder="Nome de quem vai receber a comissão" value="${editing ? escapeHtml(editing.colaboradora) : ''}">
        <datalist id="ngColaboradorasList">
          ${colaboradorasConhecidas.map(nome => `<option value="${escapeHtml(nome)}">`).join('')}
        </datalist>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Valor de contratação (R$)</label>
          <input class="input" type="number" min="0" step="0.01" id="ngContratacao" value="${editing ? editing.valorContratacao : ''}" placeholder="Pago uma vez só">
        </div>
        <div class="field">
          <label class="field-label">Mensalidade (R$)</label>
          <input class="input" type="number" min="0" step="0.01" id="ngMensalidade" value="${editing ? editing.valorMensalidade : ''}" placeholder="Cobrado todo mês">
        </div>
      </div>
      <div class="field">
        <label class="field-label">Percentual da colaboradora (%)</label>
        <input class="input" type="number" min="0" max="100" step="0.1" id="ngPercentual" required value="${editing ? editing.percentual : ''}">
      </div>
      <div class="field" id="ngPreview" style="font-size:13px; color:var(--ink-soft);"></div>
      <div class="field">
        <label class="field-label">Observações (opcional)</label>
        <textarea class="input" id="ngObservacoes" style="min-height:60px; font-family:inherit; font-size:14px;">${editing ? escapeHtml(editing.observacoes || '') : ''}</textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="btnCancelNegociacao">Cancelar</button>
        <button type="submit" class="btn btn-primary">${editing ? 'Salvar' : 'Adicionar'}</button>
      </div>
    </form>
  `);

  const atualizarPreview = () => {
    const contratacao = Number(qs('#ngContratacao').value) || 0;
    const mensalidade = Number(qs('#ngMensalidade').value) || 0;
    const percentual = Number(qs('#ngPercentual').value) || 0;
    qs('#ngPreview').textContent =
      `Ela recebe ${formatCurrency(contratacao * percentual / 100)} na contratação (uma vez) e ${formatCurrency(mensalidade * percentual / 100)}/mês enquanto a mensalidade continuar.`;
  };
  ['ngContratacao', 'ngMensalidade', 'ngPercentual'].forEach(idInput => qs('#' + idInput).addEventListener('input', atualizarPreview));
  atualizarPreview();

  qs('#btnCancelNegociacao').onclick = closeModal;
  qs('#negociacaoForm').onsubmit = (e) => {
    e.preventDefault();
    const data = {
      clienteId: qs('#ngCliente').value,
      colaboradora: qs('#ngColaboradora').value.trim(),
      valorContratacao: Number(qs('#ngContratacao').value) || 0,
      valorMensalidade: Number(qs('#ngMensalidade').value) || 0,
      percentual: Number(qs('#ngPercentual').value) || 0,
      observacoes: qs('#ngObservacoes').value.trim()
    };
    if (!data.colaboradora) return;
    const negociacoes = getNegociacoes();
    if (editing) {
      const idx = negociacoes.findIndex(n => n.id === editing.id);
      negociacoes[idx] = { ...editing, ...data };
    } else {
      negociacoes.push({ id: uid(), contratacaoPaga: false, mensalidadePagaMes: null, ...data });
    }
    saveNegociacoes(negociacoes);
    closeModal();
    renderNegociacoes();
  };
}

// ---------- RELATÓRIOS ----------
function renderRelatorios() {
  const charges = getCharges();
  const hoje = new Date();
  const mesAtualKey = todayISO().slice(0, 7);
  const mesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const mesAnteriorKey = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, '0')}`;

  function resumoDoMes(mesKey) {
    const pagas = charges.filter(c => c.status === 'pago' && (c.dataPagamento || '').slice(0, 7) === mesKey);
    const recebido = pagas.reduce((s, c) => s + Number(c.valor), 0);
    return { recebido, qtdPagas: pagas.length };
  }

  const atual = resumoDoMes(mesAtualKey);
  const anterior = resumoDoMes(mesAnteriorKey);
  const variacao = anterior.recebido > 0 ? ((atual.recebido - anterior.recebido) / anterior.recebido) * 100 : null;

  const emAberto = charges.filter(c => chargeStatus(c) !== 'pago')
    .reduce((s, c) => s + Number(c.valor), 0);
  const atrasado = charges.filter(c => chargeStatus(c) === 'atrasado')
    .reduce((s, c) => s + Number(c.valor), 0);

  const chargesDoMes = charges.filter(c => c.status === 'pago' && (c.dataPagamento || '').slice(0, 7) === mesAtualKey)
    .sort((a, b) => (a.dataPagamento || '').localeCompare(b.dataPagamento || ''));

  qs('#main').innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">Relatórios</div>
        <div class="view-desc">Resumo financeiro do mês e exportação pra imposto de renda / contador</div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-ghost" id="btnExportCSV">⬇️ Exportar CSV</button>
      </div>
    </div>

    <div class="cards-grid">
      <div class="stat-card">
        <div class="stat-label">Recebido este mês</div>
        <div class="stat-value emerald">${formatCurrency(atual.recebido)}</div>
        ${variacao != null ? `<div class="view-desc" style="margin-top:4px;">${variacao >= 0 ? '▲' : '▼'} ${Math.abs(variacao).toFixed(0)}% vs. mês anterior</div>` : ''}
      </div>
      <div class="stat-card">
        <div class="stat-label">Recebido mês anterior</div>
        <div class="stat-value">${formatCurrency(anterior.recebido)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Em aberto (todos)</div>
        <div class="stat-value amber">${formatCurrency(emAberto)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Atrasado</div>
        <div class="stat-value brick">${formatCurrency(atrasado)}</div>
      </div>
    </div>

    <div class="section-title">Recebimentos deste mês (${chargesDoMes.length})</div>
    ${chargesDoMes.length === 0 ? emptyState('Nada recebido ainda este mês', 'Assim que marcar cobranças como pagas, elas aparecem aqui.') : `
      <div class="ledger">
        ${chargesDoMes.map(c => {
          const client = c.clientId ? clientById(c.clientId) : null;
          const nome = client ? client.nome : (c.avulsoNome || 'Cliente removido');
          return `
          <div class="ledger-row">
            <div class="ledger-main">
              <div class="ledger-title">${escapeHtml(nome)}</div>
              <div class="ledger-sub">${escapeHtml(c.descricao)} · pago em ${formatDateBR(c.dataPagamento)}</div>
            </div>
            <div class="ledger-value">${formatCurrency(c.valor)}</div>
          </div>`;
        }).join('')}
      </div>
    `}
  `;

  qs('#btnExportCSV').onclick = () => exportarRelatorioCSV(charges);
}

function exportarRelatorioCSV(charges) {
  const linhas = [['Cliente', 'Descrição', 'Valor', 'Status', 'Vencimento', 'Data do pagamento']];
  charges.forEach(c => {
    const client = c.clientId ? clientById(c.clientId) : null;
    const nome = client ? client.nome : (c.avulsoNome || 'Cliente removido');
    linhas.push([
      nome,
      c.descricao,
      String(c.valor).replace('.', ','),
      chargeStatus(c),
      formatDateBR(c.vencimento),
      c.dataPagamento ? formatDateBR(c.dataPagamento) : ''
    ]);
  });
  const csv = linhas.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `relatorio-caixa-aberto-${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- CONTRATOS ----------
const CONTRATADO_PADRAO = {
  contratado_nome: 'Dalton José Neres',
  contratado_profissao: 'Desenvolvedor Full Stack | Desenvolvedor de Software',
  contratado_cpf: '122.515.479-08',
  contratado_endereco: 'Linha Nova União, 0, Zona Rural',
  contratado_cidade_uf: 'Salto do Lontra – PR',
  contratado_cep: '85670-000',
  contratado_email: 'dev.neresdalton@gmail.com',
  contratado_telefone: '(46) 99971-1937'
};
function getContratadoInfo() {
  return { ...CONTRATADO_PADRAO, ...(getSettings().contratado || {}) };
}
const MARCADOR_PENDENTE = '【A PREENCHER】';

function renderContratos() {
  const contratos = getContratos().slice().reverse();
  qs('#main').innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">Contratos</div>
        <div class="view-desc">Gera o contrato já com os dados do cliente e do plano — o resto (prazos, percentuais, cronograma, valores detalhados) vem marcado pra você completar no Word.</div>
      </div>
      <button class="btn btn-primary" id="btnNovoContrato">+ Gerar contrato</button>
    </div>
    ${contratos.length === 0 ? emptyState('Nenhum contrato gerado ainda', 'Clique em "Gerar contrato" pra montar o primeiro.') : `
      <div class="ledger">
        ${contratos.map(c => `
          <div class="ledger-row">
            <div class="ledger-main">
              <div class="ledger-title">${escapeHtml(c.contratante_nome || 'Sem nome')}</div>
              <div class="ledger-sub">${c.planoNome ? escapeHtml(c.planoNome) + ' · ' : ''}gerado em ${formatDateBR(c.criadoEm)}</div>
            </div>
            <div class="ledger-actions">
              <button class="btn btn-ghost btn-sm" data-baixar-docx="${c.id}">⬇️ Word</button>
              <button class="btn btn-ghost btn-sm" data-baixar-pdf="${c.id}">⬇️ PDF</button>
              <button class="btn btn-ghost btn-sm" data-editar-contrato="${c.id}">Editar</button>
              <button class="btn btn-danger btn-sm" data-del-contrato="${c.id}">Excluir</button>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  `;
  qs('#btnNovoContrato').onclick = () => openContratoModal();
  qsa('[data-baixar-docx]').forEach(b => b.onclick = () => gerarContratoDocx(getContratos().find(x => x.id === b.dataset.baixarDocx)));
  qsa('[data-baixar-pdf]').forEach(b => b.onclick = () => gerarContratoPDF(getContratos().find(x => x.id === b.dataset.baixarPdf)));
  qsa('[data-editar-contrato]').forEach(b => b.onclick = () => openContratoModal(b.dataset.editarContrato));
  qsa('[data-del-contrato]').forEach(b => b.onclick = () => {
    if (confirm('Excluir este contrato do histórico?')) {
      saveContratos(getContratos().filter(c => c.id !== b.dataset.delContrato));
      renderContratos();
    }
  });
}

const CONTRATO_CAMPOS_EXTRA = [
  { grupo: 'Cronograma', key: 'etapa1_prazo', label: '1. Assinatura + entrada', readonly: true },
  { grupo: 'Cronograma', key: 'etapa2_prazo', label: '2. Envio do briefing/materiais', readonly: true },
  { grupo: 'Cronograma', key: 'etapa3_prazo', label: '3. Planejamento/wireframes', readonly: true },
  { grupo: 'Cronograma', key: 'etapa4_prazo', label: '4. Desenvolvimento', readonly: true },
  { grupo: 'Cronograma', key: 'etapa5_prazo', label: '5. Apresentação da 1ª versão', readonly: true },
  { grupo: 'Cronograma', key: 'etapa6_prazo', label: '6. Ajustes e revisões', readonly: true },
  { grupo: 'Cronograma', key: 'etapa7_prazo', label: '7. Testes e homologação', readonly: true },
  { grupo: 'Cronograma', key: 'etapa8_prazo', label: '8. Publicação e entrega final', readonly: true },
  { grupo: 'Cronograma', key: 'prazo_total_dias', label: 'Prazo total (dias corridos)', tipo: 'number', min: '0' },

  { grupo: 'Revisões e materiais', key: 'rodadas_revisao', label: 'Rodadas de revisão inclusas', default: '2' },
  { grupo: 'Revisões e materiais', key: 'prazo_envio_materiais', label: 'Prazo p/ cliente enviar materiais', tipo: 'date' },
  { grupo: 'Revisões e materiais', key: 'prazo_homologacao_dias', label: 'Prazo de homologação (dias úteis)', default: '5' },

  { grupo: 'Domínio, hospedagem e suporte', key: 'periodo_manutencao_gratuita', label: 'Período de manutenção grátis', placeholder: 'ex: 30 dias' },
  { grupo: 'Domínio, hospedagem e suporte', key: 'periodo_hospedagem_gratuita', label: 'Período de hospedagem/domínio grátis', placeholder: 'ex: 3 meses' },
  { grupo: 'Domínio, hospedagem e suporte', key: 'canal_suporte', label: 'Canal de suporte', default: 'WhatsApp, em horário comercial' },
  { grupo: 'Domínio, hospedagem e suporte', key: 'prazo_resposta_suporte', label: 'Prazo de resposta do suporte (dias úteis)', default: '1' },

  { grupo: 'Foro e assinatura', key: 'foro_comarca', label: 'Comarca do foro' },
  { grupo: 'Foro e assinatura', key: 'foro_uf', label: 'UF do foro' },
  { grupo: 'Foro e assinatura', key: 'local_assinatura', label: 'Local da assinatura' },
  { grupo: 'Foro e assinatura', key: 'data_assinatura_extenso', label: 'Data da assinatura', tipo: 'date' }
];

function openContratoModal(editingId) {
  const clients = getClients();
  const mensalidades = getMensalidades();
  const orcamentosFechados = getOrcamentos().filter(o => o.status === 'fechado');
  const editing = editingId ? getContratos().find(c => c.id === editingId) : null;

  openModal(`
    <div class="modal-title">${editing ? 'Editar contrato' : 'Gerar contrato'}</div>
    <p class="view-desc" style="margin:-10px 0 16px;">Preenche o que já se sabe. O resto das cláusulas (prazos, percentuais, cronograma, valores detalhados por item) vem marcado como <strong>${MARCADOR_PENDENTE}</strong> no arquivo, pra você completar direto no Word.</p>
    <form id="contratoForm">
      <div class="field">
        <label class="field-label">Preencher com cliente já cadastrado (opcional)</label>
        <select class="input" id="ctClienteExistente">
          <option value="">— digitar manualmente —</option>
          ${clients.map(c => `<option value="${c.id}" ${editing && editing._clientId === c.id ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Tipo</label>
          <select class="input" id="ctTipo">
            <option value="pf" ${!editing || editing._tipo !== 'pj' ? 'selected' : ''}>Pessoa física</option>
            <option value="pj" ${editing && editing._tipo === 'pj' ? 'selected' : ''}>Pessoa jurídica</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label">Nome / Razão social</label>
          <input class="input" id="ctNome" required value="${editing ? escapeHtml(editing.contratante_nome || '') : ''}">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">CPF/CNPJ</label>
          <input class="input" id="ctDoc" value="${editing ? escapeHtml(editing.contratante_doc || '') : ''}">
        </div>
        <div class="field" id="ctRepresentanteField">
          <label class="field-label">Representante legal (se PJ)</label>
          <input class="input" id="ctRepresentante" value="${editing ? escapeHtml(editing.contratante_representante || '') : ''}">
        </div>
      </div>
      <div class="field">
        <label class="field-label">Forma de pagamento principal</label>
        <select class="input" id="campo_forma_pagamento">
          <option value="PIX" ${editing && editing.forma_pagamento === 'PIX' ? 'selected' : ''}>PIX</option>
          <option value="Transferência bancária" ${editing && editing.forma_pagamento === 'Transferência bancária' ? 'selected' : ''}>Transferência bancária</option>
          <option value="Cartão de crédito" ${editing && editing.forma_pagamento === 'Cartão de crédito' ? 'selected' : ''}>Cartão de crédito</option>
          <option value="Boleto bancário" ${editing && editing.forma_pagamento === 'Boleto bancário' ? 'selected' : ''}>Boleto bancário</option>
          <option value="Dinheiro" ${editing && editing.forma_pagamento === 'Dinheiro' ? 'selected' : ''}>Dinheiro</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label">Endereço</label>
        <input class="input" id="ctEndereco" value="${editing ? escapeHtml(editing.contratante_endereco || '') : ''}">
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Cidade/UF</label>
          <input class="input" id="ctCidadeUf" value="${editing ? escapeHtml(editing.contratante_cidade_uf || '') : ''}">
        </div>
        <div class="field">
          <label class="field-label">CEP</label>
          <input class="input" id="ctCep" value="${editing ? escapeHtml(editing.contratante_cep || '') : ''}">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">E-mail</label>
          <input class="input" type="email" id="ctEmail" value="${editing ? escapeHtml(editing.contratante_email || '') : ''}">
        </div>
        <div class="field">
          <label class="field-label">Telefone/WhatsApp</label>
          <input class="input" id="ctTelefone" value="${editing ? escapeHtml(editing.contratante_telefone || '') : ''}">
        </div>
      </div>

      <div class="field">
        <label class="field-label">Plano de mensalidade contratado (opcional)</label>
        <select class="input" id="ctPlano">
          <option value="">— nenhum / a combinar —</option>
          ${mensalidades.map(p => `<option value="${p.id}" ${editing && editing._planoId === p.id ? 'selected' : ''}>${p.nome} — ${formatCurrency(p.valor)}/mês</option>`).join('')}
        </select>
      </div>

      ${orcamentosFechados.length > 0 ? `
      <div class="field">
        <label class="field-label">Puxar valor de um orçamento fechado (opcional)</label>
        <select class="input" id="ctOrcamento">
          <option value="">— nenhum —</option>
          ${orcamentosFechados.map(o => `<option value="${o.id}" ${editing && editing._orcamentoId === o.id ? 'selected' : ''}>${escapeHtml(o.nomeContato)} — ${escapeHtml(o.resumo)}</option>`).join('')}
        </select>
      </div>
      ` : ''}

      <div class="section-title" style="font-size:14px; margin-top:20px;">Pagamento</div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Valor total do projeto (R$)</label>
          <input class="input" type="number" min="0" step="0.01" id="campo_valor_total" value="${editing && editing.valor_total ? editing.valor_total.replace(',', '.') : ''}">
        </div>
        <div class="field">
          <label class="field-label">Entrada (%)</label>
          <input class="input" type="number" min="0" max="100" id="campo_entrada_percentual" value="${editing ? escapeHtml(editing.entrada_percentual || '') : ''}">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Entrada (R$) — calculado sozinho, mas dá pra ajustar</label>
          <input class="input" type="number" min="0" step="0.01" id="campo_entrada_valor" value="${editing ? escapeHtml(editing.entrada_valor || '') : ''}">
        </div>
        <div class="field">
          <label class="field-label">Saldo (R$) — calculado sozinho</label>
          <input class="input" type="number" min="0" step="0.01" id="campo_saldo_valor" value="${editing ? escapeHtml(editing.saldo_valor || '') : ''}">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Parcelas sem acréscimo (até nº vezes)</label>
          <input class="input" id="campo_parcelas_sem_juros" value="${editing ? escapeHtml(editing.parcelas_sem_juros || '') : ''}">
        </div>
        <div class="field">
          <label class="field-label">Parcelas com acréscimo no cartão (até nº vezes)</label>
          <input class="input" id="campo_parcelas_com_juros" value="${editing ? escapeHtml(editing.parcelas_com_juros || '') : ''}">
        </div>
      </div>
      <div class="field">
        <label class="field-label">Valor promocional válido até</label>
        <input class="input" type="date" id="campo_validade_promocional" value="${editing ? escapeHtml(editing.validade_promocional || '') : ''}">
      </div>

      <div class="section-title" style="font-size:14px; margin-top:20px;">Manutenção avulsa (sem plano mensal)</div>
      <div class="field">
        <label class="field-label">O cliente vai querer a opção de manutenção avulsa?</label>
        <select class="input" id="campo_avulsaOpcao">
          <option value="sim" ${editing && editing._avulsaOpcao === 'nao' ? '' : 'selected'}>Sim, oferecer alteração avulsa (sem plano)</option>
          <option value="nao" ${editing && editing._avulsaOpcao === 'nao' ? 'selected' : ''}>Não — só via plano mensal</option>
        </select>
      </div>
      <div class="field" id="linhaValorAvulso" style="${editing && editing._avulsaOpcao === 'nao' ? 'display:none;' : ''}">
        <label class="field-label">Valor da alteração avulsa (R$ por solicitação)</label>
        <input class="input" type="number" min="0" step="0.01" id="campo_valor_alteracao_avulsa" value="${editing ? escapeHtml(editing._valorAvulsoDigitado || '') : ''}">
      </div>

      ${['Cronograma', 'Revisões e materiais', 'Domínio, hospedagem e suporte', 'Foro e assinatura'].map(grupo => `
        <div class="section-title" style="font-size:14px; margin-top:20px;">${grupo}</div>
        <div class="field-row" style="flex-wrap:wrap;">
          ${CONTRATO_CAMPOS_EXTRA.filter(c => c.grupo === grupo).map(c => `
            <div class="field" style="flex:1 1 47%; min-width:180px;">
              <label class="field-label">${c.label}</label>
              <input class="input" type="${c.tipo || 'text'}" id="campo_${c.key}" placeholder="${c.placeholder || ''}" ${c.min != null ? `min="${c.min}"` : ''} ${c.readonly ? 'readonly' : ''} value="${c.key === 'data_assinatura_extenso' ? (editing ? escapeHtml(editing.data_assinatura || '') : todayISO()) : (editing && editing[c.key] ? escapeHtml(editing[c.key]) : (c.default || ''))}">
            </div>
          `).join('')}
        </div>
      `).join('')}

      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="btnCancelContrato">Cancelar</button>
        <button type="submit" class="btn btn-primary">${editing ? 'Salvar e baixar Word' : 'Gerar contrato (Word)'}</button>
      </div>
    </form>
  `);

  function recalcularPagamento() {
    const total = Number(qs('#campo_valor_total').value) || 0;
    const pct = Number(qs('#campo_entrada_percentual').value) || 0;
    if (total && pct) {
      qs('#campo_entrada_valor').value = (total * pct / 100).toFixed(2);
      qs('#campo_saldo_valor').value = (total - (total * pct / 100)).toFixed(2);
    }
  }
  qs('#campo_valor_total').addEventListener('input', recalcularPagamento);
  qs('#campo_entrada_percentual').addEventListener('input', recalcularPagamento);

  function atualizarTipoContratante() {
    const pj = qs('#ctTipo').value === 'pj';
    qs('#ctRepresentanteField').style.display = pj ? '' : 'none';
    qs('#ctRepresentante').required = pj;
    if (!pj) qs('#ctRepresentante').value = '';
    const doc = qs('#ctDoc');
    doc.placeholder = pj ? '00.000.000/0000-00' : '000.000.000-00';
    doc.value = formatDocumento(onlyDigits(doc.value).slice(0, pj ? 14 : 11));
  }
  function atualizarCronograma() {
    const inicio = qs('#campo_data_assinatura_extenso').value;
    const total = Number(qs('#campo_prazo_total_dias').value);
    distribuirCronograma(inicio, total).forEach((data, i) => {
      qs(`#campo_etapa${i + 1}_prazo`).value = data;
    });
  }
  qs('#ctTipo').onchange = atualizarTipoContratante;
  qs('#ctDoc').addEventListener('input', e => { e.target.value = formatDocumento(onlyDigits(e.target.value).slice(0, qs('#ctTipo').value === 'pj' ? 14 : 11)); });
  qs('#ctTelefone').addEventListener('input', e => { e.target.value = formatTelefoneBR(e.target.value); });
  qs('#campo_data_assinatura_extenso').addEventListener('change', atualizarCronograma);
  qs('#campo_prazo_total_dias').addEventListener('input', atualizarCronograma);
  atualizarTipoContratante();
  if (!editing || !editing.etapa1_prazo) atualizarCronograma();

  const ctOrcamentoSelect = qs('#ctOrcamento');
  if (ctOrcamentoSelect) {
    ctOrcamentoSelect.onchange = () => {
      const o = getOrcamentos().find(x => x.id === ctOrcamentoSelect.value);
      if (o && o.totalUnico > 0) {
        qs('#campo_valor_total').value = o.totalUnico;
        recalcularPagamento();
      }
    };
  }

  qs('#campo_avulsaOpcao').onchange = () => {
    qs('#linhaValorAvulso').style.display = qs('#campo_avulsaOpcao').value === 'nao' ? 'none' : '';
  };

  qs('#ctClienteExistente').onchange = () => {
    const c = clientById(qs('#ctClienteExistente').value);
    if (!c) return;
    qs('#ctTipo').value = c.tipo === 'pj' ? 'pj' : 'pf';
    atualizarTipoContratante();
    qs('#ctNome').value = c.nome || '';
    qs('#ctDoc').value = formatDocumento(c.documento || '') || '';
    qs('#ctEndereco').value = c.endereco || '';
    qs('#ctCidadeUf').value = c.cidade || '';
    qs('#ctEmail').value = c.email || '';
    qs('#ctTelefone').value = formatTelefoneBR(c.telefone || '');
  };

  qs('#btnCancelContrato').onclick = closeModal;
  qs('#contratoForm').onsubmit = (e) => {
    e.preventDefault();
    const nome = qs('#ctNome').value.trim();
    if (!nome) { alert('Digite o nome do contratante.'); return; }
    const tipo = qs('#ctTipo').value;
    const documento = onlyDigits(qs('#ctDoc').value);
    if (!documentoValido(documento, tipo)) {
      alert(tipo === 'pj' ? 'Informe um CNPJ válido.' : 'Informe um CPF válido.');
      return;
    }
    const telefone = onlyDigits(qs('#ctTelefone').value);
    if (telefone.length !== 10 && telefone.length !== 11) {
      alert('Informe um telefone válido com DDD (ex.: (45) 99999-8888).');
      return;
    }

    const planoId = qs('#ctPlano').value;
    const plano = planoId ? planoById(planoId) : null;
    const orcamentoSel = qs('#ctOrcamento');
    const orcamentoId = orcamentoSel ? orcamentoSel.value : '';
    const orcamento = orcamentoId ? getOrcamentos().find(o => o.id === orcamentoId) : null;

    const valorTotalDigitado = qs('#campo_valor_total').value;
    const valorTotalFinal = valorTotalDigitado !== '' ? Number(valorTotalDigitado)
      : (orcamento && orcamento.totalUnico > 0 ? orcamento.totalUnico : null);
    const entradaPct = qs('#campo_entrada_percentual').value;

    const avulsaOpcao = qs('#campo_avulsaOpcao').value;
    const valorAvulsoDigitado = qs('#campo_valor_alteracao_avulsa').value;

    const extras = {};
    CONTRATO_CAMPOS_EXTRA.forEach(c => { extras[c.key] = qs('#campo_' + c.key).value.trim(); });
    const dataAssinatura = extras.data_assinatura_extenso;
    extras.data_assinatura_extenso = dataPorExtenso(dataAssinatura);

    const dados = {
      _clientId: qs('#ctClienteExistente').value || null,
      _tipo: tipo,
      _planoId: planoId || null,
      _orcamentoId: orcamentoId || null,
      _avulsaOpcao: avulsaOpcao,
      _valorAvulsoDigitado: valorAvulsoDigitado,
      contratante_nome: nome,
      contratante_doc: formatDocumento(documento),
      contratante_representante: tipo === 'pj' ? qs('#ctRepresentante').value.trim() : '',
      contratante_endereco: qs('#ctEndereco').value.trim(),
      contratante_cidade_uf: qs('#ctCidadeUf').value.trim(),
      contratante_cep: qs('#ctCep').value.trim(),
      contratante_email: qs('#ctEmail').value.trim(),
      contratante_telefone: formatTelefoneBR(telefone),
      forma_pagamento: qs('#campo_forma_pagamento').value,
      data_assinatura: dataAssinatura,
      planoNome: plano ? plano.nome : '',
      valor_mensalidade_base: plano ? String(plano.valor).replace('.', ',') : '',
      valor_total: valorTotalFinal != null ? String(valorTotalFinal).replace('.', ',') : '',
      valor_dev_principal: valorTotalFinal != null ? String(valorTotalFinal).replace('.', ',') : '',
      entrada_percentual: entradaPct ? String(entradaPct) : '',
      entrada_valor: qs('#campo_entrada_valor').value ? String(qs('#campo_entrada_valor').value).replace('.', ',') : '',
      saldo_percentual: entradaPct ? String(100 - Number(entradaPct)) : '',
      saldo_valor: qs('#campo_saldo_valor').value ? String(qs('#campo_saldo_valor').value).replace('.', ',') : '',
      valor_alteracao_avulsa: avulsaOpcao === 'nao'
        ? 'Não aplicável — manutenção somente via plano mensal contratado'
        : (valorAvulsoDigitado ? String(valorAvulsoDigitado).replace('.', ',') : ''),
      ...extras,
      criadoEm: editing ? editing.criadoEm : todayISO()
    };

    const lista = getContratos();
    let registro;
    if (editing) {
      const idx = lista.findIndex(c => c.id === editing.id);
      registro = { ...editing, ...dados };
      lista[idx] = registro;
    } else {
      registro = { id: uid(), ...dados };
      lista.push(registro);
    }
    saveContratos(lista);
    closeModal();
    renderContratos();
    gerarContratoDocx(registro);
  };
}

async function gerarContratoDocx(registro) {
  if (!registro) return;
  try {
    if (typeof PizZip === 'undefined') throw new Error('A biblioteca PizZip não carregou. Confira sua internet ou se algum bloqueador de anúncios/rastreadores está travando o unpkg.com.');
    if (typeof window.docxtemplater === 'undefined') throw new Error('A biblioteca docxtemplater não carregou. Confira sua internet ou se algum bloqueador de anúncios/rastreadores está travando o unpkg.com.');
    const resp = await fetch('assets/contrato-template.docx');
    if (!resp.ok) throw new Error(`Não achei o arquivo assets/contrato-template.docx (status ${resp.status}). Confira se ele está na pasta certa.`);
    const buf = await resp.arrayBuffer();
    const zip = new PizZip(buf);
    const dados = { ...getContratadoInfo(), ...registro };
    const doc = new window.docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => MARCADOR_PENDENTE
    });
    doc.render(dados);
    const out = doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const url = URL.createObjectURL(out);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contrato-${(registro.contratante_nome || 'cliente').replace(/\s+/g, '-').toLowerCase()}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    alert('Não consegui gerar o Word agora.\n\nErro técnico (me manda essa mensagem): ' + (err && err.message ? err.message : err));
  }
}

async function gerarContratoPDF(registro) {
  if (!registro) return;
  try {
    if (typeof html2pdf === 'undefined') throw new Error('A biblioteca html2pdf.js não carregou. Confira sua internet ou se algum bloqueador de anúncios/rastreadores está travando o cdnjs.cloudflare.com.');
    const resp = await fetch('assets/contrato-template.html');
    if (!resp.ok) throw new Error(`Não achei o arquivo assets/contrato-template.html (status ${resp.status}). Confira se ele está na pasta certa.`);
    let html = await resp.text();
    const dados = { ...getContratadoInfo(), ...registro };
    html = html.replace(/\{([a-z_0-9]+)\}/g, (m, key) => {
      const v = dados[key];
      return escapeHtml(v && String(v).trim() ? v : MARCADOR_PENDENTE);
    });
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'height:0; overflow:hidden;';
    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.cssText = 'width:720px; padding:20px; font-family:Georgia,serif; font-size:12.5px; line-height:1.5; background:#fff; color:#111;';
    wrapper.appendChild(container);
    document.body.appendChild(wrapper);
    await new Promise(r => setTimeout(r, 50)); // dá tempo do navegador desenhar o conteúdo antes de capturar
    await html2pdf().from(container).set({
      margin: 15,
      filename: `contrato-${(registro.contratante_nome || 'cliente').replace(/\s+/g, '-').toLowerCase()}.pdf`,
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4' },
      pagebreak: { mode: ['css', 'legacy'] }
    }).save();
    document.body.removeChild(wrapper);
  } catch (err) {
    console.error(err);
    alert('Não consegui gerar o PDF agora.\n\nErro técnico (me manda essa mensagem): ' + (err && err.message ? err.message : err));
  }
}

// ---------- CONFIGURAÇÕES ----------
function renderConfig() {
  const s = getSettings();
  const clients = getClients();
  const charges = getCharges();

  qs('#main').innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">Configurações</div>
        <div class="view-desc">Dados usados nas mensagens de cobrança e backup</div>
      </div>
    </div>

    <div class="section-title">Sua conta</div>
    <p class="view-desc" style="margin-bottom:10px;">
      Logado como <strong>${escapeHtml(auth.currentUser ? auth.currentUser.email : '')}</strong>.
      Use este e-mail e senha pra entrar em outros aparelhos.
    </p>
    <div class="field-row" style="align-items:flex-end; max-width:520px; margin-bottom:8px;">
      <div class="field" style="margin-bottom:0;">
        <label class="field-label">Seu nome (só aparece pra você, na saudação)</label>
        <input class="input" id="meuNomeExibicao" placeholder="Ex: Ana" value="${escapeHtml((auth.currentUser && auth.currentUser.displayName) || '')}">
      </div>
      <button class="btn btn-ghost" id="btnSalvarMeuNome" style="margin-bottom:0;">Salvar</button>
    </div>
    <p class="view-desc" style="margin-bottom:16px;">
      Esse nome é pessoal: cada pessoa (dono ou colaborador) que entra com seu
      próprio e-mail vê o próprio nome na tela inicial, mesmo compartilhando os
      mesmos dados.
    </p>
    <div class="field-row" style="align-items:flex-end; max-width:520px; margin-bottom:8px;">
      <div class="field" style="margin-bottom:0;">
        <label class="field-label">Seu ID de usuário (UID)</label>
        <input class="input" id="meuUidCampo" readonly value="${escapeHtml(_meuUid || '')}">
      </div>
      <button class="btn btn-ghost" id="btnCopiarUid" style="margin-bottom:0;">Copiar</button>
    </div>

    ${_syncTargetUid && _meuUid && _syncTargetUid !== _meuUid ? `
      <div class="colab-banner">
        🔗 Você está vendo os dados de outra conta (vinculado). Se algo parecer errado ou você não deveria mais ter esse acesso, clique em desvincular.
        <button class="btn btn-ghost btn-sm" id="btnDesvincular" style="margin-top:8px;">Desvincular e ver meus próprios dados</button>
      </div>
    ` : `
      <div class="section-title" style="font-size:15px; margin-top:20px;">Colaboradores</div>
      <p class="view-desc" style="margin-bottom:12px;">
        Pessoas com login próprio que acessam os mesmos dados que você. Peça pra
        pessoa criar a conta dela normalmente, copiar o "ID de usuário (UID)" dela
        aqui em Configurações, e te mandar esse código.
      </p>
      <div class="field-row" style="max-width:520px;">
        <div class="field">
          <label class="field-label">UID da pessoa</label>
          <input class="input" id="colabUidNovo" placeholder="Cole o UID que ela te mandou">
        </div>
        <div class="field">
          <label class="field-label">Apelido (opcional)</label>
          <input class="input" id="colabApelidoNovo" placeholder="Ex: Ana">
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" id="btnAddColaborador" style="margin-bottom:16px;">+ Adicionar colaborador(a)</button>
      ${getColaboradores().length > 0 ? `
        <div class="ledger" style="max-width:520px; margin-bottom:16px;">
          ${getColaboradores().map(c => `
            <div class="ledger-row">
              <div class="ledger-main">
                <div class="ledger-title">${escapeHtml(c.apelido || 'Sem apelido')}</div>
                <div class="ledger-sub">${escapeHtml(c.uid)}</div>
              </div>
              <button class="btn btn-danger btn-sm" data-del-colaborador="${escapeHtml(c.uid)}">Remover</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `}

    <div class="section-title" style="font-size:15px; margin-top:20px;">Vincular-se a outra conta</div>
    <p class="view-desc" style="margin-bottom:12px;">
      Se você é colaborador(a) de outra pessoa, cole aqui o UID <strong>dela</strong>
      (ela encontra o dela nesta mesma tela). Depois disso, você passa a ver os
      dados dela — mas ela também precisa ter te adicionado como colaborador(a)
      acima, senão o acesso é negado.
    </p>
    <div class="field-row" style="max-width:520px;">
      <div class="field">
        <label class="field-label">UID do dono da conta</label>
        <input class="input" id="donoUidCampo" placeholder="Cole aqui">
      </div>
    </div>
    <button class="btn btn-ghost btn-sm" id="btnVincular">Vincular</button>
    <button class="btn btn-ghost btn-sm" id="btnReconectar" style="margin-bottom:32px;">🔄 Tentar reconectar</button>

    <div class="section-title">Seus dados</div>
    <form id="settingsForm" style="max-width:420px; margin-bottom:32px;">
      <div class="field">
        <label class="field-label">Seu nome (usado na saudação do painel e nas mensagens de WhatsApp)</label>
        <input class="input" id="sSeuNome" value="${escapeHtml(s.seuNome || '')}">
      </div>
      <div class="field">
        <label class="field-label">Nome do seu negócio (opcional, aparece só no menu lateral)</label>
        <input class="input" id="sEmpresa" value="${escapeHtml(s.empresaNome || '')}">
      </div>
      <div class="field">
        <label class="field-label">Chave PIX (opcional, aparece na mensagem)</label>
        <input class="input" id="sPix" value="${escapeHtml(s.pix || '')}">
      </div>
      <div class="field">
        <label class="field-label">Cidade (usada no QR Code Pix, opcional)</label>
        <input class="input" id="sPixCidade" maxlength="15" placeholder="Ex: Dois Vizinhos" value="${escapeHtml(s.pixCidade || '')}">
      </div>
      <div class="field">
        <label class="field-label">Desconto por indicação (R$, opcional)</label>
        <input class="input" type="number" min="0" step="0.01" id="sDescontoIndicacao" value="${s.valorDescontoIndicacao != null ? s.valorDescontoIndicacao : ''}">
      </div>
      <button type="submit" class="btn btn-primary">Salvar</button>
    </form>

    <div class="section-title">Mensagem de cobrança (WhatsApp)</div>
    <p class="view-desc" style="margin-bottom:12px;">
      Personalize o texto que é montado ao enviar uma cobrança — pra soar do
      seu jeito, e não igual em toda cobrança. Use as variáveis abaixo, elas
      são preenchidas automaticamente:
    </p>
    <p class="view-desc" style="margin-bottom:14px; font-family:var(--font-mono); font-size:12px;">
      {nome} {quem_fala} {descricao} {valor} {vencimento_data} {vencimento_relativo} {atraso} {pagamento}
    </p>
    <form id="modeloCobrancaForm" style="max-width:520px; margin-bottom:12px;">
      <div class="field">
        <textarea class="input" id="sModeloCobranca" style="min-height:190px; font-size:13px;">${escapeHtml(s.modeloCobranca || MODELO_COBRANCA_PADRAO)}</textarea>
      </div>
      <div style="display:flex; gap:10px; margin-bottom:16px;">
        <button type="submit" class="btn btn-primary">Salvar modelo</button>
        <button type="button" class="btn btn-ghost" id="btnRestaurarModelo">Restaurar padrão</button>
      </div>
    </form>
    <div class="field-label" style="margin-bottom:6px;">Pré-visualização (com dados de exemplo)</div>
    <div class="wa-preview" id="previewModeloCobranca" style="max-width:520px; margin-bottom:32px;"></div>

    <div class="section-title">Mensagem de mensalidade (clientes recorrentes)</div>
    <p class="view-desc" style="margin-bottom:12px;">
      Texto usado só nas mensalidades dos clientes recorrentes. A parte do pagamento muda sozinha
      conforme o cliente paga (Pix, boleto ou cartão). Variáveis extras:
    </p>
    <p class="view-desc" style="margin-bottom:14px; font-family:var(--font-mono); font-size:12px;">
      {nome} {quem_fala} {plano} {competencia} {valor} {vencimento_data} {vencimento_relativo} {atraso} {pagamento}
    </p>
    <form id="modeloRecorrenteForm" style="max-width:520px; margin-bottom:12px;">
      <div class="field">
        <textarea class="input" id="sModeloRecorrente" style="min-height:190px; font-size:13px;">${escapeHtml(s.modeloCobrancaRecorrente || MODELO_RECORRENTE_PADRAO)}</textarea>
      </div>
      <div style="display:flex; gap:10px; margin-bottom:16px;">
        <button type="submit" class="btn btn-primary">Salvar modelo</button>
        <button type="button" class="btn btn-ghost" id="btnRestaurarModeloRec">Restaurar padrão</button>
      </div>
    </form>
    <div class="field" style="max-width:520px;">
      <label class="field-label">Pré-visualizar como cliente que paga com</label>
      <select class="input" id="sPreviewFormaRec">
        <option value="pix">Pix</option>
        <option value="boleto">Boleto (com boleto anexado)</option>
        <option value="boleto-sem">Boleto (ainda sem anexar)</option>
        <option value="cartao">Cartão (com link anexado)</option>
        <option value="cartao-sem">Cartão (ainda sem anexar)</option>
      </select>
    </div>
    <div class="wa-preview" id="previewModeloRecorrente" style="max-width:520px; margin-bottom:32px;"></div>

    <div class="section-title">Seus dados no contrato</div>
    <p class="view-desc" style="margin-bottom:14px;">Usados como CONTRATADO ao gerar contratos. Já vêm com os dados do seu modelo — mude só se algo tiver mudado.</p>
    <form id="contratadoForm" style="max-width:420px; margin-bottom:32px;">
      <div class="field-row">
        <div class="field">
          <label class="field-label">Nome</label>
          <input class="input" id="cdNome" value="${escapeHtml((s.contratado && s.contratado.contratado_nome) || CONTRATADO_PADRAO.contratado_nome)}">
        </div>
        <div class="field">
          <label class="field-label">CPF</label>
          <input class="input" id="cdCpf" value="${escapeHtml((s.contratado && s.contratado.contratado_cpf) || CONTRATADO_PADRAO.contratado_cpf)}">
        </div>
      </div>
      <div class="field">
        <label class="field-label">Profissão</label>
        <input class="input" id="cdProfissao" value="${escapeHtml((s.contratado && s.contratado.contratado_profissao) || CONTRATADO_PADRAO.contratado_profissao)}">
      </div>
      <div class="field">
        <label class="field-label">Endereço</label>
        <input class="input" id="cdEndereco" value="${escapeHtml((s.contratado && s.contratado.contratado_endereco) || CONTRATADO_PADRAO.contratado_endereco)}">
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Cidade/UF</label>
          <input class="input" id="cdCidadeUf" value="${escapeHtml((s.contratado && s.contratado.contratado_cidade_uf) || CONTRATADO_PADRAO.contratado_cidade_uf)}">
        </div>
        <div class="field">
          <label class="field-label">CEP</label>
          <input class="input" id="cdCep" value="${escapeHtml((s.contratado && s.contratado.contratado_cep) || CONTRATADO_PADRAO.contratado_cep)}">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">E-mail</label>
          <input class="input" id="cdEmail" value="${escapeHtml((s.contratado && s.contratado.contratado_email) || CONTRATADO_PADRAO.contratado_email)}">
        </div>
        <div class="field">
          <label class="field-label">Telefone/WhatsApp</label>
          <input class="input" id="cdTelefone" value="${escapeHtml((s.contratado && s.contratado.contratado_telefone) || CONTRATADO_PADRAO.contratado_telefone)}">
        </div>
      </div>
      <button type="submit" class="btn btn-primary">Salvar</button>
    </form>

    <div class="section-title">Backup dos dados</div>
    <p class="view-desc" style="margin-bottom:14px; max-width:520px;">
      Seus dados já ficam salvos na nuvem (Firebase), então não somem se você trocar
      de aparelho. Ainda assim, é uma boa prática exportar um backup de vez em
      quando — serve como cópia extra de segurança.
    </p>
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:32px;">
      <button class="btn btn-ghost" id="btnExport">Exportar backup (.json)</button>
      <label class="btn btn-ghost" style="display:inline-flex; align-items:center;">
        Importar backup
        <input type="file" id="importFile" accept="application/json" class="hidden">
      </label>
    </div>

    <div class="section-title">Zona de risco</div>
    <p class="view-desc" style="margin-bottom:14px;">Isso apaga tudo (${clients.length} clientes, ${charges.length} cobranças, ${getMeetings().length} reuniões) permanentemente da sua conta.</p>
    <button class="btn btn-danger" id="btnWipe">Apagar todos os dados</button>
  `;

  const btnCopiarUid = qs('#btnCopiarUid');
  if (btnCopiarUid) btnCopiarUid.onclick = () => {
    qs('#meuUidCampo').select();
    navigator.clipboard.writeText(_meuUid || '').then(() => {
      btnCopiarUid.textContent = 'Copiado!';
      setTimeout(() => { btnCopiarUid.textContent = 'Copiar'; }, 1500);
    }).catch(() => alert('Não consegui copiar sozinho — seleciona o texto e copia manualmente (Ctrl+C).'));
  };

  const btnSalvarMeuNome = qs('#btnSalvarMeuNome');
  if (btnSalvarMeuNome) btnSalvarMeuNome.onclick = async () => {
    const novoNome = qs('#meuNomeExibicao').value.trim();
    try {
      await auth.currentUser.updateProfile({ displayName: novoNome });
      btnSalvarMeuNome.textContent = 'Salvo!';
      setTimeout(() => { btnSalvarMeuNome.textContent = 'Salvar'; }, 1500);
    } catch (err) {
      alert('Não consegui salvar seu nome agora. Confira sua internet e tente de novo.');
    }
  };

  const btnAddColaborador = qs('#btnAddColaborador');
  if (btnAddColaborador) btnAddColaborador.onclick = () => {
    const uid = qs('#colabUidNovo').value.trim();
    if (!uid) { alert('Cole o UID da pessoa.'); return; }
    if (uid === _meuUid) { alert('Esse é o seu próprio UID.'); return; }
    if (getColaboradores().some(c => c.uid === uid)) { alert('Esse UID já está na lista.'); return; }
    const apelido = qs('#colabApelidoNovo').value.trim();
    saveColaboradores([...getColaboradores(), { uid, apelido }]);
    renderConfig();
  };
  qsa('[data-del-colaborador]').forEach(b => b.onclick = () => {
    if (confirm('Remover o acesso dessa pessoa aos seus dados?')) {
      saveColaboradores(getColaboradores().filter(c => c.uid !== b.dataset.delColaborador));
      renderConfig();
    }
  });

  const btnVincular = qs('#btnVincular');
  if (btnVincular) btnVincular.onclick = () => vincularConta(qs('#donoUidCampo').value);
  const btnReconectar = qs('#btnReconectar');
  if (btnReconectar) btnReconectar.onclick = async () => {
    const donoUid = await resolveSyncTarget(_meuUid);
    stopFirestoreSync();
    startFirestoreSync(donoUid);
    alert(donoUid === _meuUid ? 'Você não está vinculado(a) a nenhuma conta no momento.' : 'Tentando de novo...');
  };
  const btnDesvincular = qs('#btnDesvincular');
  if (btnDesvincular) btnDesvincular.onclick = () => desvincularConta();

  qs('#settingsForm').onsubmit = (e) => {
    e.preventDefault();
    saveSettings({
      ...getSettings(),
      seuNome: qs('#sSeuNome').value.trim(),
      empresaNome: qs('#sEmpresa').value.trim(),
      pix: qs('#sPix').value.trim(),
      pixCidade: qs('#sPixCidade').value.trim(),
      valorDescontoIndicacao: qs('#sDescontoIndicacao').value === '' ? null : Number(qs('#sDescontoIndicacao').value)
    });
    refreshBrandBar();
    atualizarPreviewModeloCobranca();
    alert('Salvo.');
  };

  function atualizarPreviewModeloCobranca() {
    const template = qs('#sModeloCobranca').value;
    const settings = getSettings();
    const chargeExemplo = {
      descricao: 'Mensalidade de agosto',
      valor: 150,
      vencimento: todayISO(),
      status: 'pendente',
      formasPagamento: settings.pix ? ['pix'] : ['pix', 'cartao', 'dinheiro']
    };
    const clienteExemplo = { nome: 'Maria' };
    const vars = montarVariaveisMensagemCobranca(chargeExemplo, clienteExemplo, settings);
    qs('#previewModeloCobranca').textContent = renderTemplate(template, vars);
  }
  atualizarPreviewModeloCobranca();
  qs('#sModeloCobranca').addEventListener('input', atualizarPreviewModeloCobranca);

  qs('#btnRestaurarModelo').onclick = () => {
    qs('#sModeloCobranca').value = MODELO_COBRANCA_PADRAO;
    atualizarPreviewModeloCobranca();
  };

  qs('#modeloCobrancaForm').onsubmit = (e) => {
    e.preventDefault();
    saveSettings({ ...getSettings(), modeloCobranca: qs('#sModeloCobranca').value });
    alert('Modelo salvo.');
  };

  function atualizarPreviewModeloRecorrente() {
    const settings = getSettings();
    const v = qs('#sPreviewFormaRec').value;
    const forma = v.split('-')[0];
    const sem = v.endsWith('-sem');
    const chargeExemplo = {
      descricao: 'Mensalidade ' + competenciaLabel(todayISO().slice(0, 7)) + ' — Suporte Básico',
      valor: 150, vencimento: todayISO(), status: 'pendente',
      recorrente: true, competencia: todayISO().slice(0, 7),
      formasPagamento: [forma],
      boletoLink: forma === 'boleto' && !sem ? 'https://exemplo.com/boleto' : null,
      boletoCodigo: forma === 'boleto' && !sem ? '00000.00000 00000.000000 00000.000000 0 00000000000000' : null,
      linkPagamentoCartao: forma === 'cartao' && !sem ? 'https://exemplo.com/pagar' : null
    };
    const clienteExemplo = { nome: 'Maria', plano: 'Suporte Básico', recorrente: true, pixChave: forma === 'pix' ? (settings.pix || 'maria@exemplo.com') : '' };
    const vars = montarVariaveisMensagemCobranca(chargeExemplo, clienteExemplo, settings);
    qs('#previewModeloRecorrente').textContent = renderTemplate(qs('#sModeloRecorrente').value, vars);
  }
  atualizarPreviewModeloRecorrente();
  qs('#sModeloRecorrente').addEventListener('input', atualizarPreviewModeloRecorrente);
  qs('#sPreviewFormaRec').onchange = atualizarPreviewModeloRecorrente;
  qs('#btnRestaurarModeloRec').onclick = () => {
    qs('#sModeloRecorrente').value = MODELO_RECORRENTE_PADRAO;
    atualizarPreviewModeloRecorrente();
  };
  qs('#modeloRecorrenteForm').onsubmit = (e) => {
    e.preventDefault();
    saveSettings({ ...getSettings(), modeloCobrancaRecorrente: qs('#sModeloRecorrente').value });
    alert('Modelo de mensalidade salvo.');
  };

  qs('#contratadoForm').onsubmit = (e) => {
    e.preventDefault();
    saveSettings({
      ...getSettings(),
      contratado: {
        contratado_nome: qs('#cdNome').value.trim(),
        contratado_cpf: qs('#cdCpf').value.trim(),
        contratado_profissao: qs('#cdProfissao').value.trim(),
        contratado_endereco: qs('#cdEndereco').value.trim(),
        contratado_cidade_uf: qs('#cdCidadeUf').value.trim(),
        contratado_cep: qs('#cdCep').value.trim(),
        contratado_email: qs('#cdEmail').value.trim(),
        contratado_telefone: qs('#cdTelefone').value.trim()
      }
    });
    alert('Salvo.');
  };

  qs('#btnExport').onclick = () => {
    const data = { clients: getClients(), charges: getCharges(), meetings: getMeetings(), settings: getSettings(), exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caixa-aberto-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  qs('#importFile').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!confirm('Importar vai substituir todos os dados atuais deste navegador. Confirma?')) return;
        saveClients(data.clients || []);
        saveCharges(data.charges || []);
        saveMeetings(data.meetings || []);
        saveSettings(data.settings || {});
        alert('Backup importado com sucesso.');
        refreshBrandBar();
        navigate('dashboard');
      } catch (err) {
        alert('Arquivo inválido.');
      }
    };
    reader.readAsText(file);
  };

  qs('#btnWipe').onclick = () => {
    if (confirm('Tem certeza? Essa ação não pode ser desfeita.')) {
      if (confirm('Confirma de novo: apagar TUDO?')) {
        saveClients([]);
        saveCharges([]);
        saveMeetings([]);
        saveSettings({});
        navigate('dashboard');
      }
    }
  };
}

// ---------- utilitário de estado vazio ----------
function emptyState(title, sub) {
  return `
    <div class="empty-state">
      <div class="stamp-mark" style="margin-left:auto; margin-right:auto;">CA</div>
      <div style="font-weight:600; font-size:15px; color:var(--ink); margin-bottom:4px;">${escapeHtml(title)}</div>
      <div style="font-size:13px;">${escapeHtml(sub)}</div>
    </div>
  `;
}

// ---------- BOOT ----------
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'escuro' ? 'escuro' : 'claro');
  const btn = qs('#themeToggle');
  if (btn) btn.textContent = theme === 'escuro' ? '☀️' : '🌙';
}
function toggleTheme() {
  const atual = document.documentElement.getAttribute('data-theme') === 'escuro' ? 'escuro' : 'claro';
  const novo = atual === 'escuro' ? 'claro' : 'escuro';
  localStorage.setItem('ca_tema', novo);
  applyTheme(novo);
  if (_docRef) saveSettings({ ...getSettings(), tema: novo });
}

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(localStorage.getItem('ca_tema') || 'claro');
  qs('#themeToggle').addEventListener('click', toggleTheme);

  const sidebarMenu = qs('#sidebarMenu');
  const navToggle = qs('#navToggle');

  navToggle.addEventListener('click', () => {
    sidebarMenu.classList.toggle('open');
    navToggle.classList.toggle('open');
  });

  qsa('.nav-btn').forEach(btn => btn.addEventListener('click', () => {
    navigate(btn.dataset.view);
    sidebarMenu.classList.remove('open');
    navToggle.classList.remove('open');
  }));

  qs('#btnLogout').addEventListener('click', () => {
    sidebarMenu.classList.remove('open');
    navToggle.classList.remove('open');
    auth.signOut();
  });

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      _meuUid = user.uid;
      const donoUid = await resolveSyncTarget(user.uid);
      startFirestoreSync(donoUid);
      enterApp();
    } else {
      _meuUid = null;
      stopFirestoreSync();
      showLockScreen();
    }
  });
});
