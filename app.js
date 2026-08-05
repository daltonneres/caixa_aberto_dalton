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
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function onlyDigits(str) {
  return String(str || '').replace(/\D/g, '');
}

// ---------- CACHE LOCAL + SINCRONIZAÇÃO COM O FIRESTORE ----------
// Ideia: o resto do app continua chamando getClients()/saveClients() etc.
// exatamente como antes (por isso quase nada mudou nas telas). A diferença
// é que agora esses dados vêm de/vão para o Firestore, na nuvem.
let _clients = [];
let _charges = [];
let _meetings = [];
let _settings = {};
let _docRef = null;
let _unsubscribeSnapshot = null;
let _saveTimer = null;

function getClients() { return _clients; }
function getCharges() { return _charges; }
function getMeetings() { return _meetings; }
function getSettings() { return _settings; }

function saveClients(list) { _clients = list; queuePersist(); }
function saveCharges(list) { _charges = list; queuePersist(); }
function saveMeetings(list) { _meetings = list; queuePersist(); }
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

function startFirestoreSync(uid) {
  _docRef = db.collection('users').doc(uid).collection('app').doc('data');
  _unsubscribeSnapshot = _docRef.onSnapshot(snap => {
    const data = snap.data() || {};
    _clients = data.clients || [];
    _charges = data.charges || [];
    _meetings = data.meetings || [];
    _settings = data.settings || {};
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
  _clients = []; _charges = []; _meetings = []; _settings = {};
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

  const nomeUsuario = settings.seuNome ? `, ${escapeHtml(settings.seuNome)}` : '';

  qs('#main').innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">${getGreeting()}${nomeUsuario} 👋</div>
        <div class="view-desc">${formatDateLongPT()}</div>
      </div>
    </div>

    ${reunioesHoje.length > 0 ? `
      <div class="today-banner">
        <strong>Você tem ${reunioesHoje.length} reunião${reunioesHoje.length > 1 ? 'ões' : ''} hoje:</strong>
        ${reunioesHoje.map(m => {
          const cli = m.clientId ? clientById(m.clientId) : null;
          return `<span class="today-item">${m.hora ? m.hora + ' — ' : ''}${escapeHtml(m.titulo)}${cli ? ' (' + escapeHtml(cli.nome) + ')' : ''}</span>`;
        }).join('')}
      </div>
    ` : ''}

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
              </div>`;
            }).join('')}
          </div>
        `}
      </div>
    </div>
  `;

  bindChargeActions();
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
          <div class="ledger-row">
            <div class="ledger-main">
              <div class="ledger-title">${escapeHtml(c.nome)}</div>
              <div class="ledger-sub">${escapeHtml(c.telefone || 'sem telefone')} ${c.email ? '· ' + escapeHtml(c.email) : ''} ${c.cidade ? '· ' + escapeHtml(c.cidade) : ''}</div>
            </div>
            <div class="ledger-value ${totalAberto > 0 ? 'brick' : ''}">${totalAberto > 0 ? formatCurrency(totalAberto) + ' em aberto' : 'em dia'}</div>
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
          <input class="input" id="cDocumento" value="${editing ? escapeHtml(editing.documento || '') : ''}">
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
  qs('#clientForm').onsubmit = (e) => {
    e.preventDefault();
    const nome = qs('#cNome').value.trim();
    const telefoneDigits = onlyDigits(qs('#cTelefone').value);
    if (!nome || telefoneDigits.length < 10) {
      alert('Confira o nome e o telefone (precisa ter DDD + número).');
      return;
    }
    const clients = getClients();
    const extra = {
      tipo: qs('#cTipo').value,
      documento: qs('#cDocumento').value.trim(),
      cidade: qs('#cCidade').value.trim(),
      endereco: qs('#cEndereco').value.trim(),
      clienteDesde: qs('#cDesde').value || null
    };
    if (editing) {
      const idx = clients.findIndex(c => c.id === editing.id);
      clients[idx] = { ...editing, nome, telefone: telefoneDigits, email: qs('#cEmail').value.trim(), obs: qs('#cObs').value.trim(), ...extra };
    } else {
      clients.push({ id: uid(), nome, telefone: telefoneDigits, email: qs('#cEmail').value.trim(), obs: qs('#cObs').value.trim(), projetos: [], ...extra });
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

  qs('#main').innerHTML = `
    <button class="btn btn-ghost btn-sm" id="btnVoltarClientes" style="margin-bottom:18px;">← Voltar para clientes</button>

    <div class="view-header">
      <div>
        <div class="view-title">${escapeHtml(client.nome)}</div>
        <div class="view-desc">
          ${escapeHtml(client.telefone)} ${client.email ? '· ' + escapeHtml(client.email) : ''}
          ${client.tipo ? '· ' + (client.tipo === 'pj' ? 'Pessoa jurídica' : 'Pessoa física') : ''}
          ${client.documento ? '· ' + escapeHtml(client.documento) : ''}
        </div>
        <div class="view-desc">
          ${client.cidade ? escapeHtml(client.cidade) : ''}${client.endereco ? (client.cidade ? ' · ' : '') + escapeHtml(client.endereco) : ''}
          ${client.clienteDesde ? (client.cidade || client.endereco ? ' · ' : '') + 'Cliente desde ' + formatDateBR(client.clienteDesde) : ''}
        </div>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-ghost btn-sm" id="btnEditarNoDetalhe">Editar dados</button>
        <button class="btn btn-primary btn-sm" id="btnNovaReuniaoDetalhe">+ Reunião</button>
      </div>
    </div>

    ${client.obs ? `<p class="view-desc" style="margin:-14px 0 22px;">${escapeHtml(client.obs)}</p>` : ''}

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
  qs('#btnNovoProjeto').onclick = () => openProjectModal(client.id);
  qs('#btnNovaReuniaoDetalhe').onclick = () => openMeetingModal(null, client.id, () => renderClienteDetalhe(client.id));
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
  const clients = getClients();
  const charges = getCharges().sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  qs('#main').innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">Cobranças</div>
        <div class="view-desc">Lance boletos e cobranças por cliente</div>
      </div>
      <button class="btn btn-primary" id="btnNovaCobranca" ${clients.length === 0 ? 'disabled title="Cadastre um cliente primeiro"' : ''}>+ Nova cobrança</button>
    </div>
    ${clients.length === 0 ? emptyState('Cadastre um cliente primeiro', 'Você precisa ter pelo menos um cliente para lançar uma cobrança.') :
      charges.length === 0 ? emptyState('Nenhuma cobrança lançada', 'Clique em "Nova cobrança" para começar.') :
      renderChargeLedger(charges, { compact: false })}
  `;

  if (clients.length > 0) qs('#btnNovaCobranca').onclick = () => openChargeModal();
  bindChargeActions();
}

function renderChargeLedger(charges, opts = {}) {
  if (charges.length === 0) return emptyState('Nada por aqui', 'Nenhuma cobrança encontrada.');
  return `
    <div class="ledger">
      ${charges.map(c => {
        const client = clientById(c.clientId);
        const status = chargeStatus(c);
        const stampClass = { pago: 'stamp-pago', pendente: 'stamp-pendente', atrasado: 'stamp-atrasado' }[status];
        const stampLabel = { pago: 'Pago', pendente: 'Pendente', atrasado: 'Atrasado' }[status];
        return `
        <div class="ledger-row">
          <div class="ledger-main">
            <div class="ledger-title">${escapeHtml(client ? client.nome : 'Cliente removido')}</div>
            <div class="ledger-sub">${escapeHtml(c.descricao)} · vence ${formatDateBR(c.vencimento)}</div>
          </div>
          <span class="stamp-badge ${stampClass}">${stampLabel}</span>
          <div class="ledger-value">${formatCurrency(c.valor)}</div>
          <div class="ledger-actions">
            ${status !== 'pago' && client ? `<button class="btn btn-whatsapp btn-sm" data-send-charge="${c.id}">Enviar</button>` : ''}
            ${status !== 'pago' ? `<button class="btn btn-ghost btn-sm" data-pay-charge="${c.id}">Marcar pago</button>` : ''}
            ${!opts.compact ? `<button class="btn btn-danger btn-sm" data-del-charge="${c.id}">Excluir</button>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
}

function bindChargeActions() {
  qsa('[data-send-charge]').forEach(b => b.onclick = () => openWhatsappModal(b.dataset.sendCharge));
  qsa('[data-pay-charge]').forEach(b => b.onclick = () => {
    const charges = getCharges();
    const idx = charges.findIndex(c => c.id === b.dataset.payCharge);
    charges[idx].status = 'pago';
    charges[idx].dataPagamento = todayISO();
    saveCharges(charges);
    navigate(currentView);
  });
  qsa('[data-del-charge]').forEach(b => b.onclick = () => {
    if (confirm('Excluir esta cobrança?')) {
      saveCharges(getCharges().filter(c => c.id !== b.dataset.delCharge));
      navigate(currentView);
    }
  });
}

function openChargeModal() {
  const clients = getClients();
  openModal(`
    <div class="modal-title">Nova cobrança</div>
    <form id="chargeForm">
      <div class="field">
        <label class="field-label">Cliente</label>
        <select class="input" id="chCliente" required>
          ${clients.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field-label">Descrição</label>
        <input class="input" id="chDescricao" placeholder="Ex: Mensalidade de agosto" required>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Valor (R$)</label>
          <input class="input" id="chValor" type="number" min="0" step="0.01" required>
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
  qs('#btnCancelCharge').onclick = closeModal;
  qs('#chargeForm').onsubmit = (e) => {
    e.preventDefault();
    const charges = getCharges();
    charges.push({
      id: uid(),
      clientId: qs('#chCliente').value,
      descricao: qs('#chDescricao').value.trim(),
      valor: Number(qs('#chValor').value),
      vencimento: qs('#chVencimento').value,
      status: 'pendente',
      dataPagamento: null,
      createdAt: todayISO()
    });
    saveCharges(charges);
    closeModal();
    navigate(currentView);
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
  return `
    <div class="ledger-row">
      <div class="ledger-main">
        <div class="ledger-title">${escapeHtml(m.titulo)}</div>
        <div class="ledger-sub">${formatDateBR(m.data)}${m.hora ? ' às ' + m.hora : ''}${client ? ' · ' + escapeHtml(client.nome) : ''}${m.local ? ' · ' + escapeHtml(m.local) : ''}</div>
      </div>
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
function buildMessage(charge, client) {
  const settings = getSettings();
  const empresa = settings.empresaNome ? settings.empresaNome : '';
  const status = chargeStatus(charge);
  const linhaAtraso = status === 'atrasado' ? `\nEssa cobrança está em atraso desde ${formatDateBR(charge.vencimento)}.` : '';
  const linhaPix = settings.pix ? `\nChave PIX: ${settings.pix}` : '';
  return `Olá, ${client.nome}! ${empresa ? 'Aqui é da ' + empresa + '.' : ''}` +
    `\nSegue sua cobrança referente a: ${charge.descricao}` +
    `\nValor: ${formatCurrency(charge.valor)}` +
    `\nVencimento: ${formatDateBR(charge.vencimento)}` +
    `${linhaAtraso}${linhaPix}` +
    `\n\nQualquer dúvida, é só chamar por aqui. Obrigado!`;
}

function openWhatsappModal(chargeId) {
  const charge = getCharges().find(c => c.id === chargeId);
  const client = clientById(charge.clientId);
  if (!client) { alert('Cliente não encontrado.'); return; }
  openSendWhatsappModal(`Enviar cobrança — ${client.nome}`, client, buildMessage(charge, client));
}

function buildMeetingMessage(meeting, client) {
  const settings = getSettings();
  const empresa = settings.empresaNome ? settings.empresaNome : '';
  return `Olá, ${client.nome}! ${empresa ? 'Aqui é da ' + empresa + '.' : ''}` +
    `\nPassando pra lembrar da nossa reunião: ${meeting.titulo}` +
    `\nData: ${formatDateBR(meeting.data)}${meeting.hora ? ' às ' + meeting.hora : ''}` +
    `${meeting.local ? '\nLocal/link: ' + meeting.local : ''}` +
    `\n\nQualquer imprevisto, me avisa por aqui. Até lá!`;
}

function openMeetingWhatsappModal(meetingId) {
  const meeting = getMeetings().find(m => m.id === meetingId);
  const client = meeting.clientId ? clientById(meeting.clientId) : null;
  if (!client) { alert('Essa reunião não tem cliente vinculado.'); return; }
  openSendWhatsappModal(`Enviar lembrete — ${client.nome}`, client, buildMeetingMessage(meeting, client));
}

function openSendWhatsappModal(title, client, defaultMsg) {
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
      <button type="button" class="btn btn-ghost" id="btnCancelWa">Cancelar</button>
      <button type="button" class="btn btn-whatsapp" id="btnOpenWa">Abrir no WhatsApp</button>
    </div>
  `);
  qs('#btnCancelWa').onclick = closeModal;
  qs('#btnOpenWa').onclick = () => {
    const phone = onlyDigits(qs('#waPhone').value);
    const msg = qs('#waMsg').value;
    if (phone.length < 10) { alert('Número de WhatsApp inválido.'); return; }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    closeModal();
  };
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
        <label class="field-label">Seu nome (usado na saudação do painel)</label>
        <input class="input" id="sSeuNome" value="${escapeHtml(s.seuNome || '')}">
      </div>
      <div class="field">
        <label class="field-label">Nome do seu negócio (aparece na mensagem de cobrança)</label>
        <input class="input" id="sEmpresa" value="${escapeHtml(s.empresaNome || '')}">
      </div>
      <div class="field">
        <label class="field-label">Chave PIX (opcional, aparece na mensagem)</label>
        <input class="input" id="sPix" value="${escapeHtml(s.pix || '')}">
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
    saveSettings({ seuNome: qs('#sSeuNome').value.trim(), empresaNome: qs('#sEmpresa').value.trim(), pix: qs('#sPix').value.trim() });
    refreshBrandBar();
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
document.addEventListener('DOMContentLoaded', () => {
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
