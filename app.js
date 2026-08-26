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
const todayISO = () => new Date().toISOString().slice(0, 10);

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
let _settings = {};
let _docRef = null;
let _unsubscribeSnapshot = null;
let _saveTimer = null;

function getClients() { return _clients; }
function getCharges() { return _charges; }
function getMeetings() { return _meetings; }
function getServicos() { return _servicos; }
function getOrcamentos() { return _orcamentos; }
function getContratos() { return _contratos; }
function getMensalidades() { return _mensalidades; }
function getSettings() { return _settings; }

function saveClients(list) { _clients = list; queuePersist(); }
function saveCharges(list) { _charges = list; queuePersist(); }
function saveMeetings(list) { _meetings = list; queuePersist(); }
function saveServicos(list) { _servicos = list; queuePersist(); }
function saveOrcamentos(list) { _orcamentos = list; queuePersist(); }
function saveContratos(list) { _contratos = list; queuePersist(); }
function saveMensalidades(list) { _mensalidades = list; queuePersist(); }
function saveSettings(s) { _settings = s; queuePersist(); }

function clientById(id) { return getClients().find(c => c.id === id); }

// status real da cobrança (calcula atraso na hora)
function chargeStatus(charge) {
  if (charge.status === 'pago') return 'pago';
  if (charge.vencimento < todayISO()) return 'atrasado';
  return 'pendente';
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

function startFirestoreSync(uid) {
  _docRef = db.collection('users').doc(uid).collection('app').doc('data');
  _unsubscribeSnapshot = _docRef.onSnapshot(snap => {
    const data = snap.data() || {};
    _clients = data.clients || [];
    _charges = data.charges || [];
    _meetings = data.meetings || [];
    _servicos = data.servicos || [];
    _orcamentos = data.orcamentos || [];
    _contratos = data.contratos || [];
    _mensalidades = data.mensalidades || [];
    _settings = data.settings || {};
    if (_settings.tema) {
      localStorage.setItem('ca_tema', _settings.tema);
      applyTheme(_settings.tema);
    }
    refreshBrandBar();
    if (currentDetailClientId && clientById(currentDetailClientId)) {
      renderClienteDetalhe(currentDetailClientId);
    } else {
      navigate(currentView);
    }
  }, err => {
    console.error('Erro ao sincronizar com o Firebase:', err);
    showSyncError();
  });
}

function stopFirestoreSync() {
  if (_unsubscribeSnapshot) _unsubscribeSnapshot();
  _unsubscribeSnapshot = null;
  _docRef = null;
  _clients = []; _charges = []; _meetings = []; _servicos = []; _orcamentos = []; _contratos = []; _mensalidades = []; _settings = {};
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
  qsa('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const renderers = {
    dashboard: renderDashboard,
    clientes: renderClientes,
    cobrancas: renderCobrancas,
    agenda: renderAgenda,
    servicos: renderServicos,
    mensalidades: renderMensalidades,
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

// ---------- DASHBOARD ----------
function renderDashboard() {
  const clients = getClients();
  const charges = getCharges();
  const meetings = getMeetings();
  const settings = getSettings();

  const aReceber = charges.filter(c => chargeStatus(c) !== 'pago')
    .reduce((sum, c) => sum + Number(c.valor), 0);
  const atrasado = charges.filter(c => chargeStatus(c) === 'atrasado')
    .reduce((sum, c) => sum + Number(c.valor), 0);
  const mesAtual = todayISO().slice(0, 7);
  const recebidoMes = charges.filter(c => c.status === 'pago' && (c.dataPagamento || '').slice(0, 7) === mesAtual)
    .reduce((sum, c) => sum + Number(c.valor), 0);

  const pendentes = charges.filter(c => chargeStatus(c) !== 'pago')
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

  const nomeUsuario = settings.seuNome ? `, ${escapeHtml(settings.seuNome)}` : '';
  const proximaReuniao = proximasReunioes[0] || null;

  qs('#main').innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">${getGreeting()}${nomeUsuario} 👋</div>
        <div class="view-desc">${formatDateLongPT()}</div>
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
      <div class="stat-card">
        <div class="stat-label">A receber</div>
        <div class="stat-value">${formatCurrency(aReceber)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Recebido no mês</div>
        <div class="stat-value emerald">${formatCurrency(recebidoMes)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Atrasado</div>
        <div class="stat-value brick">${formatCurrency(atrasado)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Clientes cadastrados</div>
        <div class="stat-value">${clients.length}</div>
      </div>
    </div>

    <div class="dashboard-split">
      <div>
        <div class="section-title">Próximas cobranças em aberto</div>
        ${renderChargeLedger(pendentes, { compact: true })}
      </div>
      <div>
        <div class="section-title">Próximas reuniões</div>
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
  `;

  bindChargeActions();
  qsa('[data-view-client]').forEach(a => a.onclick = (e) => { e.preventDefault(); renderClienteDetalhe(a.dataset.viewClient); });
}

// ---------- CLIENTES ----------
function renderClientes() {
  const clients = getClients();
  qs('#main').innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">Clientes</div>
        <div class="view-desc">Cadastre quem você cobra</div>
      </div>
      <button class="btn btn-primary" id="btnNovoCliente">+ Novo cliente</button>
    </div>
    ${clients.length === 0 ? emptyState('Nenhum cliente ainda', 'Cadastre o primeiro cliente para começar a lançar cobranças.') : `
      <div class="ledger">
        ${clients.map(c => {
          const totalAberto = getCharges().filter(ch => ch.clientId === c.id && chargeStatus(ch) !== 'pago')
            .reduce((s, ch) => s + Number(ch.valor), 0);
          return `
          <div class="ledger-row client-row">
            <div class="ledger-main">
              <div class="ledger-title">${escapeHtml(c.nome)}</div>
              <div class="ledger-sub">${escapeHtml(c.telefone || 'sem telefone')} ${c.email ? '· ' + escapeHtml(c.email) : ''} ${c.cidade ? '· ' + escapeHtml(c.cidade) : ''}</div>
            </div>
            <div class="client-status">
              ${c.plano ? `<span class="stamp-badge stamp-pausado">${escapeHtml(c.plano)}</span>` : ''}
              ${totalAberto > 0
                ? `<span class="stamp-badge stamp-atrasado">${formatCurrency(totalAberto)} em aberto</span>`
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
    `}
  `;

  qs('#btnNovoCliente').onclick = () => openClientModal();
  qsa('[data-view-client]').forEach(b => b.onclick = () => renderClienteDetalhe(b.dataset.viewClient));
  qsa('[data-edit-client]').forEach(b => b.onclick = () => openClientModal(b.dataset.editClient));
  qsa('[data-del-client]').forEach(b => b.onclick = () => {
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

  qs('#cPlanoId').onchange = () => {
    const id = qs('#cPlanoId').value;
    qs('#cPlanoPersonalizadoRow').style.display = id === 'personalizado' ? '' : 'none';
    const plano = planoById(id);
    if (plano) qs('#cValorPlano').value = plano.valor;
  };
  qs('#clientForm').onsubmit = (e) => {
    e.preventDefault();

    const nome = qs('#cNome').value.trim();
    if (nome.length < 2) {
      alert('Digite o nome completo do cliente.');
      return;
    }

    const telefoneDigits = onlyDigits(qs('#cTelefone').value);
    if (telefoneDigits.length < 10 || telefoneDigits.length > 13) {
      alert('Confira o telefone: precisa ter código do país + DDD + número (ex: 5545999998888).');
      return;
    }

    const emailVal = qs('#cEmail').value.trim();
    if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      alert('Esse e-mail não parece válido. Confira ou deixe em branco.');
      return;
    }

    const documentoDigits = onlyDigits(qs('#cDocumento').value);
    if (documentoDigits && documentoDigits.length !== 11 && documentoDigits.length !== 14) {
      alert('CPF precisa ter 11 números ou CNPJ 14 números. Confira ou deixe em branco.');
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

    const indicadoPor = qs('#cIndicadoPor').value;
    if (editing && indicadoPor === editing.id) {
      alert('Um cliente não pode ser indicado por ele mesmo.');
      return;
    }

    const clients = getClients();
    const extra = {
      tipo: qs('#cTipo').value,
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
      indicadoPorTexto: qs('#cIndicadoPorTexto').value.trim()
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
      ${charges.length === 0 ? emptyState('Nenhuma cobrança', 'Ainda não há cobranças lançadas para este cliente.') : renderChargeLedger(charges, { compact: false })}
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
      <button class="btn btn-primary" id="btnNovaCobranca">+ Nova cobrança</button>
    </div>
    ${charges.length === 0 ? emptyState('Nenhuma cobrança lançada', 'Clique em "Nova cobrança" para começar.') :
      renderChargeLedger(charges, { compact: false })}
  `;

  qs('#btnNovaCobranca').onclick = () => openChargeModal();
  bindChargeActions();
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
        const stampLabel = { pago: 'Pago', pendente: 'Pendente', atrasado: 'Atrasado' }[status];
        return `
        <div class="ledger-row">
          <div class="ledger-main">
            <div class="ledger-title">${escapeHtml(nomeExibicao)}${!client && c.avulsoNome ? ' <span class="avulso-tag">avulsa</span>' : ''}</div>
            <div class="ledger-sub">${escapeHtml(c.descricao)} · vence ${formatDateBR(c.vencimento)}</div>
          </div>
          <span class="stamp-badge ${stampClass}">${stampLabel}</span>
          <div class="ledger-value">${formatCurrency(c.valor)}</div>
          <div class="ledger-actions">
            ${status !== 'pago' && temContato ? `<button class="btn btn-whatsapp btn-sm" data-send-charge="${c.id}">Enviar</button>` : ''}
            ${status !== 'pago' ? `<button class="btn btn-ghost btn-sm" data-pay-charge="${c.id}">Marcar pago</button>` : ''}
            ${status === 'pago' ? `<button class="btn btn-ghost btn-sm" data-recibo-charge="${c.id}">🧾 Recibo</button>` : ''}
            ${status === 'pago' && c.comprovanteLink ? `<a class="btn btn-ghost btn-sm" href="${escapeHtml(c.comprovanteLink)}" target="_blank" rel="noopener">📎 Comprovante</a>` : ''}
            ${status === 'pago' && !c.comprovanteLink ? `<button class="btn btn-ghost btn-sm" data-add-comprovante="${c.id}">📎 + Comprovante</button>` : ''}
            ${!opts.compact ? `<button class="btn btn-danger btn-sm" data-del-charge="${c.id}">Excluir</button>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
}

function bindChargeActions() {
  qsa('[data-send-charge]').forEach(b => b.onclick = () => openWhatsappModal(b.dataset.sendCharge));
  qsa('[data-pay-charge]').forEach(b => b.onclick = () => openMarkPaidModal(b.dataset.payCharge));
  qsa('[data-add-comprovante]').forEach(b => b.onclick = () => openComprovanteModal(b.dataset.addComprovante));
  qsa('[data-recibo-charge]').forEach(b => b.onclick = () => gerarReciboPDF(b.dataset.reciboCharge));
  qsa('[data-del-charge]').forEach(b => b.onclick = () => {
    if (confirm('Excluir esta cobrança?')) {
      saveCharges(getCharges().filter(c => c.id !== b.dataset.delCharge));
      navigate(currentView);
    }
  });
}

function openMarkPaidModal(chargeId) {
  openModal(`
    <div class="modal-title">Marcar como pago</div>
    <div class="field">
      <label class="field-label">Data do pagamento</label>
      <input class="input" type="date" id="mpData" value="${todayISO()}">
    </div>
    <div class="field">
      <label class="field-label">Link do comprovante (opcional)</label>
      <input class="input" type="url" id="mpComprovante" placeholder="Ex: print do PIX no Google Drive/Fotos">
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
    saveCharges(charges);
    closeModal();
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
  if (settings.pix) linha('CHAVE PIX', settings.pix);

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
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="btnCancelCharge">Cancelar</button>
        <button type="submit" class="btn btn-primary">Lançar cobrança</button>
      </div>
    </form>
  `);

  function atualizarHintPlano() {
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
    };
  }

  qs('#btnCancelCharge').onclick = closeModal;
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
    const charges = getCharges();
    charges.push({
      id: uid(),
      ...extra,
      descricao: qs('#chDescricao').value.trim(),
      valor: Number(qs('#chValor').value),
      vencimento: qs('#chVencimento').value,
      status: 'pendente',
      dataPagamento: null,
      createdAt: todayISO()
    });
    saveCharges(charges);
    closeModal();
    if (onSaved) onSaved(); else navigate(currentView);
  };
}

// ---------- AGENDA / REUNIÕES ----------
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
        <div class="view-desc">Suas reuniões e compromissos com clientes</div>
      </div>
      <button class="btn btn-primary" id="btnNovaReuniao">+ Nova reunião</button>
    </div>

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
function buildMessage(charge, client) {
  const settings = getSettings();
  const quemFala = settings.seuNome ? settings.seuNome : '';
  const status = chargeStatus(charge);
  const linhaAtraso = status === 'atrasado' ? `\n⚠️ Essa cobrança está em atraso desde *${formatDateBR(charge.vencimento)}*.` : '';
  const linhaPix = settings.pix ? `\n💳 Chave PIX: *${settings.pix}*` : '';
  return `👋 Olá, *${client.nome}*! ${quemFala ? 'Aqui quem fala é *' + quemFala + '*.' : ''}` +
    `\n\n🧾 Segue sua cobrança referente a: *${charge.descricao}*` +
    `\n💰 Valor: *${formatCurrency(charge.valor)}*` +
    `\n📅 Vencimento: *${formatDateBR(charge.vencimento)}*` +
    `${linhaAtraso}${linhaPix}` +
    `\n\n🙏 Qualquer dúvida, é só chamar por aqui. Obrigado!`;
}

function openWhatsappModal(chargeId) {
  const charge = getCharges().find(c => c.id === chargeId);
  const client = charge.clientId ? clientById(charge.clientId) : { nome: charge.avulsoNome, telefone: charge.avulsoTelefone };
  if (!client || !client.telefone) { alert('Essa cobrança não tem um WhatsApp válido pra enviar.'); return; }
  openSendWhatsappModal(`Enviar cobrança — ${client.nome}`, client, buildMessage(charge, client));
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

function openSendWhatsappModal(title, client, defaultMsg, onSent) {
  openModal(`
    <div class="modal-title">${escapeHtml(title)}</div>
    <div class="field">
      <label class="field-label">Mensagem (pode editar antes de enviar)</label>
      <textarea class="input" id="waMsg" style="min-height:170px;">${escapeHtml(defaultMsg)}</textarea>
    </div>
    <div class="field">
      <label class="field-label">Número do WhatsApp</label>
      <input class="input" id="waPhone" value="${escapeHtml(client.telefone)}">
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" id="btnCancelWa">Não enviar agora</button>
      <button type="button" class="btn btn-whatsapp" id="btnOpenWa">Enviar no WhatsApp</button>
    </div>
  `);
  qs('#btnCancelWa').onclick = closeModal;
  qs('#btnOpenWa').onclick = () => {
    const phone = onlyDigits(qs('#waPhone').value);
    const msg = qs('#waMsg').value;
    if (phone.length < 10) { alert('Número de WhatsApp inválido.'); return; }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    closeModal();
    if (onSent) onSent();
  };
}

// ---------- SERVIÇOS E ORÇAMENTOS ----------
function renderServicos() {
  const servicos = getServicos();
  const orcamentos = getOrcamentos().slice().reverse();

  qs('#main').innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">Serviços</div>
        <div class="view-desc">Catálogo de serviços e gerador de orçamento pra mandar no WhatsApp</div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-ghost" id="btnNovoServico">+ Novo serviço</button>
        ${servicos.length > 0 ? `<button class="btn btn-ghost" id="btnSyncServicos">🔄 Atualizar valores</button>` : ''}
        <button class="btn btn-ghost" id="btnOrcamentoSimples">✏️ Orçamento simples</button>
        <button class="btn btn-whatsapp" id="btnGerarOrcamento" ${servicos.length === 0 ? 'disabled title="Cadastre pelo menos um serviço primeiro"' : ''}>💬 Orçamento pelo catálogo</button>
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

  qs('#btnNovoServico').onclick = () => openServiceModal();
  qs('#btnGerarOrcamento').onclick = () => { if (servicos.length > 0) openOrcamentoModal(); };
  qs('#btnOrcamentoSimples').onclick = () => openOrcamentoSimplesModal();
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
function renderMensalidades() {
  const mensalidades = getMensalidades();

  qs('#main').innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">Mensalidades</div>
        <div class="view-desc">Planos de suporte recorrentes — usados no cadastro de cliente e nos orçamentos</div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        ${mensalidades.length > 0 ? `<button class="btn btn-ghost" id="btnSyncMensalidades">🔄 Atualizar valores</button>` : ''}
        <button class="btn btn-primary" id="btnNovaMensalidade">+ Novo plano</button>
      </div>
    </div>

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
  `;

  qs('#btnNovaMensalidade').onclick = () => openMensalidadeModal();
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
        <div class="field">
          <label class="field-label">Representante legal (se PJ)</label>
          <input class="input" id="ctRepresentante" value="${editing ? escapeHtml(editing.contratante_representante || '') : ''}">
        </div>
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

      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="btnCancelContrato">Cancelar</button>
        <button type="submit" class="btn btn-primary">${editing ? 'Salvar e baixar Word' : 'Gerar contrato (Word)'}</button>
      </div>
    </form>
  `);

  qs('#ctClienteExistente').onchange = () => {
    const c = clientById(qs('#ctClienteExistente').value);
    if (!c) return;
    qs('#ctTipo').value = c.tipo === 'pj' ? 'pj' : 'pf';
    qs('#ctNome').value = c.nome || '';
    qs('#ctDoc').value = formatDocumento(c.documento || '') || '';
    qs('#ctEndereco').value = c.endereco || '';
    qs('#ctCidadeUf').value = c.cidade || '';
    qs('#ctEmail').value = c.email || '';
    qs('#ctTelefone').value = c.telefone || '';
  };

  qs('#btnCancelContrato').onclick = closeModal;
  qs('#contratoForm').onsubmit = (e) => {
    e.preventDefault();
    const nome = qs('#ctNome').value.trim();
    if (!nome) { alert('Digite o nome do contratante.'); return; }

    const planoId = qs('#ctPlano').value;
    const plano = planoId ? planoById(planoId) : null;
    const orcamentoSel = qs('#ctOrcamento');
    const orcamentoId = orcamentoSel ? orcamentoSel.value : '';
    const orcamento = orcamentoId ? getOrcamentos().find(o => o.id === orcamentoId) : null;

    const dados = {
      _clientId: qs('#ctClienteExistente').value || null,
      _tipo: qs('#ctTipo').value,
      _planoId: planoId || null,
      _orcamentoId: orcamentoId || null,
      contratante_nome: nome,
      contratante_doc: qs('#ctDoc').value.trim(),
      contratante_representante: qs('#ctRepresentante').value.trim(),
      contratante_endereco: qs('#ctEndereco').value.trim(),
      contratante_cidade_uf: qs('#ctCidadeUf').value.trim(),
      contratante_cep: qs('#ctCep').value.trim(),
      contratante_email: qs('#ctEmail').value.trim(),
      contratante_telefone: qs('#ctTelefone').value.trim(),
      planoNome: plano ? plano.nome : '',
      valor_mensalidade_base: plano ? String(plano.valor).replace('.', ',') : '',
      valor_total: orcamento && orcamento.totalUnico > 0 ? String(orcamento.totalUnico).replace('.', ',') : '',
      valor_dev_principal: orcamento && orcamento.totalUnico > 0 ? String(orcamento.totalUnico).replace('.', ',') : '',
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
    const resp = await fetch('assets/contrato-template.docx');
    if (!resp.ok) throw new Error('modelo não encontrado');
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
    alert('Não consegui gerar o Word agora. O modelo precisa estar na pasta "assets" do seu repositório (assets/contrato-template.docx). Confira e tente de novo.');
  }
}

async function gerarContratoPDF(registro) {
  if (!registro) return;
  try {
    const resp = await fetch('assets/contrato-template.html');
    if (!resp.ok) throw new Error('modelo não encontrado');
    let html = await resp.text();
    const dados = { ...getContratadoInfo(), ...registro };
    html = html.replace(/\{([a-z_0-9]+)\}/g, (m, key) => {
      const v = dados[key];
      return escapeHtml(v && String(v).trim() ? v : MARCADOR_PENDENTE);
    });
    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.cssText = 'position:fixed; left:-9999px; top:0; width:720px; padding:20px; font-family:Georgia,serif; font-size:12.5px; line-height:1.5; background:#fff; color:#111;';
    document.body.appendChild(container);
    await html2pdf().from(container).set({
      margin: 15,
      filename: `contrato-${(registro.contratante_nome || 'cliente').replace(/\s+/g, '-').toLowerCase()}.pdf`,
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4' },
      pagebreak: { mode: ['css', 'legacy'] }
    }).save();
    document.body.removeChild(container);
  } catch (err) {
    console.error(err);
    alert('Não consegui gerar o PDF agora. O modelo precisa estar na pasta "assets" do seu repositório (assets/contrato-template.html). Tente de novo ou use o Word.');
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
    <p class="view-desc" style="margin-bottom:24px;">
      Logado como <strong>${escapeHtml(auth.currentUser ? auth.currentUser.email : '')}</strong>.
      Use este e-mail e senha pra entrar em outros aparelhos.
    </p>

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
        <label class="field-label">Desconto por indicação (R$, opcional)</label>
        <input class="input" type="number" min="0" step="0.01" id="sDescontoIndicacao" value="${s.valorDescontoIndicacao != null ? s.valorDescontoIndicacao : ''}">
      </div>
      <button type="submit" class="btn btn-primary">Salvar</button>
    </form>

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

  qs('#settingsForm').onsubmit = (e) => {
    e.preventDefault();
    saveSettings({
      ...getSettings(),
      seuNome: qs('#sSeuNome').value.trim(),
      empresaNome: qs('#sEmpresa').value.trim(),
      pix: qs('#sPix').value.trim(),
      valorDescontoIndicacao: qs('#sDescontoIndicacao').value === '' ? null : Number(qs('#sDescontoIndicacao').value)
    });
    refreshBrandBar();
    alert('Salvo.');
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

  auth.onAuthStateChanged(user => {
    if (user) {
      startFirestoreSync(user.uid);
      enterApp();
    } else {
      stopFirestoreSync();
      showLockScreen();
    }
  });
});
