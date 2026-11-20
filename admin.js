'use strict';
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const STATUS = { pending: 'Pendiente', confirmed: 'Confirmada', completed: 'Completada', cancelled: 'Cancelada' };
  const NSTATUS = { queued: 'En cola', sending: 'Enviando', sent: 'Enviado', delivered: 'Entregado', read: 'Leído', failed: 'Falló', not_configured: 'Sin configurar' };
  const NKIND = { owner_new: 'Aviso a la dueña', client_received: 'Confirmación a clienta', test: 'Prueba' };
  const hhmm = m => m == null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const dur = m => [Math.floor(m / 60) ? `${Math.floor(m / 60)} h` : '', m % 60 ? `${m % 60} min` : ''].filter(Boolean).join(' ');
  const iso = d => d.toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const wd = s => new Date(s + 'T00:00:00Z').getUTCDay();
  const longDate = s => { const [y, m, d] = s.split('-').map(Number); return `${DAYS[wd(s)]} ${d} de ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ' ' + y : ''}`; };
  const fmtDT = s => new Date(s).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
  let TODAY = iso(new Date());
  let services = [];
  let currency = 'CLP';
  const money = p => p == null ? 'A consultar' : new Intl.NumberFormat('es-CL', { style: 'currency', currency, maximumFractionDigits: 0 }).format(p);

  const A = u => MIA.asset(u);
  const PH = 'classic.svg';
  async function api(url, opts = {}) {
    try { return await MIA.adminApi(url, opts); }
    catch (e) { if (e.status === 401 && authed) showLogin(); throw e; }
  }
  let authed = false;
  let toastT;
  function toast(msg, err) {
    const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3800);
  }
  const run = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };

  function modal(html) {
    $('#modal-body').innerHTML = html; $('#modal').hidden = false;
    setTimeout(() => $('#modal-body input, #modal-body select, #modal-body button')?.focus(), 30);
    return $('#modal-body');
  }
  const closeModal = () => { $('#modal').hidden = true; $('#modal-body').innerHTML = ''; };
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

  const uploadImage = (file, w) => MIA.upload(file, w || 1600);
  // Campo de imagen reutilizable
  const imgField = (name, url, label) => `<div class="field"><label>${label}</label><div class="img-field">
      <img src="${esc(A(url || PH))}" alt="" data-preview="${name}">
      <div><input type="file" accept="image/jpeg,image/png,image/webp" data-upload="${name}"><input type="hidden" name="${name}" value="${esc(url || '')}">
      ${url ? `<button type="button" class="mini danger" data-clear="${name}" style="margin-top:.4rem">Quitar foto</button>` : ''}</div></div></div>`;
  function bindImgFields(root) {
    $$('[data-upload]', root).forEach(inp => inp.addEventListener('change', run(async () => {
      if (!inp.files[0]) return;
      toast('Subiendo y optimizando imagen…');
      const url = await uploadImage(inp.files[0]);
      $(`[name="${inp.dataset.upload}"]`, root).value = url;
      $(`[data-preview="${inp.dataset.upload}"]`, root).src = url;
      toast('Imagen lista. Recuerda guardar.');
    })));
    $$('[data-clear]', root).forEach(b => b.onclick = () => { $(`[name="${b.dataset.clear}"]`, root).value = ''; $(`[data-preview="${b.dataset.clear}"]`, root).src = A(PH); });
  }
  const formData = form => Object.fromEntries(new FormData(form).entries());

  // ---------------- Sesión ----------------
  let loginMode = 'login';
  function setMode(mode) {
    loginMode = mode;
    $('#setup-fields').hidden = mode !== 'setup';
    $('#reset-fields').hidden = mode !== 'reset';
    $('#login-fields').hidden = mode === 'reset';
    $('#login-btn').textContent = { login: 'Ingresar', setup: 'Activar mi panel', reset: 'Guardar nueva contraseña' }[mode];
    $('#login-sub').textContent = { login: 'Ingresa para gestionar tu agenda.', setup: 'Crea tu acceso: escribe tu correo, elige una contraseña (mínimo 8 caracteres) e ingresa el código de activación.', reset: 'Elige tu nueva contraseña.' }[mode];
    $('#l-pass').autocomplete = mode === 'setup' ? 'new-password' : 'current-password';
    $('#login-error').hidden = true;
  }
  async function showLogin(st) {
    authed = false; $('#app').hidden = true; $('#login').hidden = false;
    try { st = st || await MIA.setupStatus(); } catch { st = { has_admin: true }; }
    $('#setup-link').hidden = !!st.has_admin;
    setMode(st.has_admin ? 'login' : 'setup');
    $('#l-user').focus();
  }
  $('#to-setup').onclick = () => setMode(loginMode === 'setup' ? 'login' : 'setup');
  $('#forgot').onclick = async () => {
    const email = $('#l-user').value.trim();
    const err = $('#login-error'), okm = $('#login-ok');
    err.hidden = true; okm.hidden = true;
    if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'Escribe tu correo arriba y vuelve a pulsar “¿Olvidaste tu contraseña?”.'; err.hidden = false; return; }
    try { await MIA.recover(email, location.href.split('#')[0]); okm.textContent = 'Si el correo está registrado, te llegará un enlace para crear una nueva contraseña.'; okm.hidden = false; }
    catch (ex) { err.textContent = ex.message; err.hidden = false; }
  };
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#login-error'); err.hidden = true; $('#login-ok').hidden = true;
    const btn = $('#login-btn'); btn.disabled = true;
    try {
      const email = $('#l-user').value.trim(), pass = $('#l-pass').value;
      if (loginMode === 'reset') {
        await MIA.setPassword($('#r-pass').value);
        $('#r-pass').value = '';
      } else if (loginMode === 'setup') {
        if (pass.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
        if (pass !== $('#s-pass2').value) throw new Error('Las contraseñas no coinciden.');
        if (!$('#s-code').value.trim()) throw new Error('Ingresa el código de activación.');
        try { await MIA.signup(email, pass); } catch (ex) { if (/ya tiene una cuenta/.test(ex.message)) await MIA.login(email, pass); else throw ex; }
        await MIA.claim($('#s-code').value);
      } else {
        await MIA.login(email, pass);
      }
      const st = await MIA.setupStatus();
      if (!st.is_admin) {
        if (!st.has_admin) { setMode('setup'); $('#setup-link').hidden = false; throw new Error('Ingresa el código de activación para terminar de crear tu acceso.'); }
        await MIA.logout(); throw new Error('Esta cuenta no tiene acceso al panel.');
      }
      $('#l-pass').value = ''; $('#s-pass2').value = ''; $('#s-code').value = '';
      start();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    finally { btn.disabled = false; }
  });

  // ---------------- Navegación ----------------
  const VIEWS = { resumen: 'Resumen', reservas: 'Reservas', horarios: 'Horarios y disponibilidad', servicios: 'Servicios', galeria: 'Galería', negocio: 'Mi negocio', whatsapp: 'WhatsApp', cuenta: 'Cuenta' };
  function route() {
    if (!authed) return;
    const v = (location.hash.slice(1) || 'resumen').split('?')[0];
    const view = VIEWS[v] ? v : 'resumen';
    $$('.side-nav a').forEach(a => a.classList.toggle('active', a.dataset.view === view));
    $('#view-title').textContent = VIEWS[view];
    $('#side').classList.remove('open');
    $('#view').innerHTML = '<p class="empty">Cargando…</p>';
    run(R[view])();
  }
  window.addEventListener('hashchange', route);
  $('#menu-btn').onclick = () => $('#side').classList.toggle('open');
  $('#quick-new').onclick = () => newBookingModal();

  const R = {};

  // ---------------- Resumen ----------------
  R.resumen = async () => {
    const s = await api('/stats');
    TODAY = s.today;
    $('#view').innerHTML = `
      ${!s.whatsapp_configured ? `<div class="alert">WhatsApp todavía no está activado: las reservas se guardan correctamente, pero los avisos automáticos no se envían. <a href="#whatsapp">Ver cómo activarlo →</a></div>` :
        s.notif_failed ? `<div class="alert err">${s.notif_failed} notificación(es) de WhatsApp no se pudieron enviar. <a href="#whatsapp">Revisar →</a></div>` : ''}
      <div class="stats">
        <div class="stat"><b>${s.today_count}</b><span>Citas de hoy</span></div>
        <div class="stat s-pending"><b>${s.pending}</b><span>Pendientes</span></div>
        <div class="stat s-confirmed"><b>${s.confirmed}</b><span>Confirmadas (próximas)</span></div>
        <div class="stat s-completed"><b>${s.completed}</b><span>Completadas este mes</span></div>
        <div class="stat s-cancelled"><b>${s.cancelled}</b><span>Canceladas este mes</span></div>
        <div class="stat"><b>${s.month_total}</b><span>Total del mes</span></div>
      </div>
      <div class="box"><h2>Próximas citas</h2><div id="upcoming"></div>
        <a class="mini" href="#reservas">Ver todas las reservas →</a></div>`;
    $('#upcoming').innerHTML = bookingList(s.upcoming) || '<p class="empty">No hay citas próximas.</p>';
  };

  // ---------------- Reservas ----------------
  const rv = { mode: 'week', anchor: null, q: '', status: '' };
  function rangeFor() {
    const a = rv.anchor || TODAY;
    if (rv.mode === 'day') return [a, a, longDate(a)];
    if (rv.mode === 'week') {
      const off = (wd(a) + 6) % 7; const from = addDays(a, -off); const to = addDays(from, 6);
      return [from, to, `${Number(from.slice(8))} ${MONTHS[+from.slice(5, 7) - 1].slice(0, 3)} – ${Number(to.slice(8))} ${MONTHS[+to.slice(5, 7) - 1].slice(0, 3)}`];
    }
    if (rv.mode === 'month') {
      const from = a.slice(0, 8) + '01'; const [y, m] = a.split('-').map(Number);
      const to = iso(new Date(Date.UTC(y, m, 0)));
      return [from, to, `${MONTHS[m - 1]} ${y}`];
    }
    return [null, null, 'Historial completo'];
  }
  function bookingRow(b) {
    const wa = `https://wa.me/${b.phone}?text=${encodeURIComponent(`¡Hola, ${b.client_name.split(' ')[0]}! Te escribo por tu cita de ${b.service_name} el ${b.date_label} a las ${b.time}.`)}`;
    return `<div class="bk ${b.status}" data-open="${b.id}">
      <div class="t">${b.time}<small>${dur(b.duration_min)}</small></div>
      <div class="who"><b>${esc(b.client_name)}</b> <span class="pill p-${b.status}">${STATUS[b.status]}</span><small>${esc(b.service_name)} · +${esc(b.phone)}</small></div>
      <div class="acts">
        ${b.status === 'pending' ? `<button class="mini ok" data-st="confirmed" data-id="${b.id}">Confirmar</button>` : ''}
        ${b.status === 'confirmed' ? `<button class="mini ok" data-st="completed" data-id="${b.id}">Completada</button>` : ''}
        ${b.status !== 'cancelled' && b.status !== 'completed' ? `<button class="mini" data-resched="${b.id}">Reprogramar</button><button class="mini danger" data-st="cancelled" data-id="${b.id}">Cancelar</button>` : ''}
        <a class="mini" href="${wa}" target="_blank" rel="noopener" data-stop>WhatsApp</a>
      </div></div>`;
  }
  function bookingList(list, withDates = true) {
    if (!list.length) return '';
    const groups = {};
    list.forEach(b => (groups[b.date] = groups[b.date] || []).push(b));
    return Object.entries(groups).map(([d, l]) => `<div class="day-group">${withDates ? `<h3>${longDate(d)}${d === TODAY ? ' · hoy' : ''}</h3>` : ''}${l.map(bookingRow).join('')}</div>`).join('');
  }
  R.reservas = async () => {
    const [from, to, label] = rangeFor();
    $('#view').innerHTML = `
      <div class="toolbar">
        <div class="seg" role="tablist">${[['day', 'Día'], ['week', 'Semana'], ['month', 'Mes'], ['all', 'Todas']].map(([k, l]) => `<button class="${rv.mode === k ? 'on' : ''}" data-mode="${k}">${l}</button>`).join('')}</div>
        ${rv.mode !== 'all' ? `<button class="icon" data-nav="-1" aria-label="Anterior">‹</button><span class="range-label">${label}</span><button class="icon" data-nav="1" aria-label="Siguiente">›</button><button class="mini" data-nav="0">Hoy</button>` : ''}
      </div>
      <div class="toolbar">
        <input class="grow" type="search" id="q" placeholder="Buscar por nombre, teléfono o código" value="${esc(rv.q)}">
        <select id="fstatus"><option value="">Todos los estados</option>${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${rv.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div id="blist"><p class="empty">Cargando…</p></div>`;
    const qs = new URLSearchParams();
    if (from && !rv.q) { qs.set('from', from); qs.set('to', to); }
    if (rv.mode === 'all' || rv.q) qs.set('order', 'desc');
    if (rv.q) qs.set('q', rv.q);
    if (rv.status) qs.set('status', rv.status);
    const list = await api('/bookings?' + qs);
    if (rv.mode === 'month' && !rv.q) {
      const [y, m] = from.split('-').map(Number);
      const off = (wd(from) + 6) % 7;
      const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      let h = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map(d => `<div class="dow">${d}</div>`).join('') + '<div></div>'.repeat(off);
      for (let d = 1; d <= days; d++) {
        const ds = `${from.slice(0, 8)}${String(d).padStart(2, '0')}`;
        const l = list.filter(b => b.date === ds);
        const active = l.filter(b => b.status !== 'cancelled').length;
        h += `<div class="mcell ${ds === TODAY ? 'today' : ''} ${ds < TODAY ? 'off' : ''}" data-day="${ds}"><span class="n">${d}</span>${active ? `<span class="cnt">${active}</span>` : ''}
          ${l.slice(0, 4).map(b => `<span class="chip ${b.status}">${b.time} ${esc(b.client_name.split(' ')[0])}</span>`).join('')}${l.length > 4 ? `<span class="chip">+${l.length - 4} más</span>` : ''}</div>`;
      }
      $('#blist').innerHTML = `<div class="month">${h}</div>`;
    } else {
      $('#blist').innerHTML = bookingList(list) || `<p class="empty">No hay reservas ${rv.q ? 'que coincidan con la búsqueda' : 'en este período'}.</p>`;
    }
    $$('[data-mode]').forEach(b => b.onclick = () => { rv.mode = b.dataset.mode; R.reservas(); });
    $$('[data-nav]').forEach(b => b.onclick = () => {
      const n = Number(b.dataset.nav); const a = rv.anchor || TODAY;
      if (n === 0) rv.anchor = TODAY;
      else if (rv.mode === 'day') rv.anchor = addDays(a, n);
      else if (rv.mode === 'week') rv.anchor = addDays(a, 7 * n);
      else { const [y, m] = a.split('-').map(Number); rv.anchor = iso(new Date(Date.UTC(y, m - 1 + n, 1))); }
      R.reservas();
    });
    let qT; $('#q').oninput = e => { clearTimeout(qT); qT = setTimeout(() => { rv.q = e.target.value.trim(); R.reservas().then(() => { const q = $('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }); }, 350); };
    $('#fstatus').onchange = e => { rv.status = e.target.value; R.reservas(); };
    $$('[data-day]').forEach(c => c.onclick = () => { rv.mode = 'day'; rv.anchor = c.dataset.day; R.reservas(); });
  };

  // Acciones sobre reservas (delegadas)
  document.addEventListener('click', run(async e => {
    if (e.target.closest('[data-stop]')) return;
    const st = e.target.closest('[data-st]');
    if (st) {
      e.stopPropagation();
      if (st.dataset.st === 'cancelled' && !confirm('¿Cancelar esta reserva? El horario quedará libre nuevamente.')) return;
      await api(`/bookings/${st.dataset.id}`, { method: 'PATCH', body: { status: st.dataset.st } });
      toast(`Reserva marcada como ${STATUS[st.dataset.st].toLowerCase()}.`);
      closeModal(); route(); return;
    }
    const rs = e.target.closest('[data-resched]');
    if (rs) { e.stopPropagation(); return rescheduleModal(rs.dataset.resched); }
    const op = e.target.closest('[data-open]');
    if (op && !e.target.closest('.acts')) return detailModal(op.dataset.open);
  }));

  async function detailModal(id) {
    const b = await api(`/bookings/${id}`);
    modal(`<h2>${esc(b.client_name)}</h2>
      <p><span class="pill p-${b.status}">${STATUS[b.status]}</span> <span class="muted tiny">Código ${esc(b.code)}</span></p>
      <dl class="kv">
        <dt>Servicio</dt><dd>${esc(b.service_name)} (${dur(b.duration_min)})</dd>
        <dt>Fecha</dt><dd>${esc(b.date_label)}</dd>
        <dt>Hora</dt><dd>${b.time} – ${b.end_time}</dd>
        <dt>WhatsApp</dt><dd><a href="https://wa.me/${b.phone}" target="_blank" rel="noopener">+${esc(b.phone)}</a></dd>
        <dt>Precio</dt><dd>${money(b.price)}</dd>
        <dt>Comentarios</dt><dd>${esc(b.comments) || '—'}</dd>
        <dt>Acepta WhatsApp</dt><dd>${b.whatsapp_consent ? 'Sí' : 'No'}</dd>
        <dt>Origen</dt><dd>${b.source === 'web' ? 'Web' : 'Panel'} · ${fmtDT(b.created_at)}</dd>
      </dl>
      <h3 style="margin-top:1.2rem;font-size:1.05rem">Notificaciones</h3>
      ${b.notifications.length ? `<ul class="list-plain">${b.notifications.map(n => `<li><span>${NKIND[n.kind] || n.kind}</span><span><span class="pill p-${n.status}" title="${esc(n.last_error || '')}">${NSTATUS[n.status] || n.status}</span></span></li>`).join('')}</ul>` : '<p class="muted tiny">Sin notificaciones.</p>'}
      <h3 style="margin-top:1.2rem;font-size:1.05rem">Historial</h3>
      <ul class="list-plain">${b.history.map(h => `<li><span>${esc(h.detail || h.action)}</span><span class="muted tiny">${fmtDT(h.created_at)}</span></li>`).join('')}</ul>
      <div class="actions">
        ${b.status === 'pending' ? `<button class="btn btn-sm" data-st="confirmed" data-id="${b.id}">Confirmar</button>` : ''}
        ${b.status === 'confirmed' ? `<button class="btn btn-sm" data-st="completed" data-id="${b.id}">Marcar completada</button>` : ''}
        ${b.status !== 'completed' ? `<button class="btn btn-sm btn-ghost" data-resched="${b.id}">Reprogramar</button>` : ''}
        ${b.status !== 'cancelled' && b.status !== 'completed' ? `<button class="btn btn-sm btn-ghost" data-st="cancelled" data-id="${b.id}">Cancelar</button>` : ''}
        ${b.status === 'cancelled' ? `<button class="btn btn-sm btn-ghost" data-st="pending" data-id="${b.id}">Reactivar</button>` : ''}
      </div>`);
  }

  // Selector de horario (para reprogramar o crear)
  function slotPicker(root, { getDuration, exclude }) {
    const box = $('.slots', root), date = $('[name=date]', root), time = $('[name=time]', root);
    const load = run(async () => {
      time.value = '';
      const d = getDuration();
      if (!date.value || !d) { box.innerHTML = ''; return; }
      const r = await api(`/slots?date=${date.value}&duration=${d}${exclude ? '&exclude=' + exclude : ''}`);
      box.innerHTML = r.open ? (r.slots.map(s => `<button type="button" class="slot" data-t="${s.time}" ${s.available ? '' : 'disabled'}>${s.time}</button>`).join('') || '<p class="muted">Sin horarios.</p>')
        : `<p class="muted">${esc(r.reason || 'Día sin atención')}</p>`;
      $$('.slot', box).forEach(b => b.onclick = () => { $$('.slot', box).forEach(x => x.classList.remove('on')); b.classList.add('on'); time.value = b.dataset.t; });
    });
    date.onchange = load;
    return load;
  }
  async function rescheduleModal(id) {
    const b = await api(`/bookings/${id}`);
    const root = modal(`<h2>Reprogramar cita</h2><p class="muted">${esc(b.client_name)} · ${esc(b.service_name)} · actualmente ${esc(b.date_label)} ${b.time}</p>
      <form id="rs-form"><div class="field"><label>Nueva fecha</label><input type="date" name="date" value="${b.date}" required></div>
      <label class="tiny muted">Horarios disponibles</label><div class="slots"></div><input type="hidden" name="time">
      <div class="actions"><button type="button" class="btn btn-ghost btn-sm" data-close>Volver</button><button class="btn btn-sm">Guardar cambio</button></div></form>`);
    const load = slotPicker(root, { getDuration: () => b.duration_min, exclude: b.id });
    load();
    $('#rs-form').onsubmit = run(async e => {
      e.preventDefault();
      const f = formData(e.target);
      if (!f.time) return toast('Elige un horario', true);
      await api(`/bookings/${id}/reschedule`, { method: 'POST', body: f });
      toast('Cita reprogramada. Recuerda avisarle a tu clienta.');
      closeModal(); route();
    });
  }
  async function newBookingModal() {
    if (!services.length) services = await api('/services');
    const root = modal(`<h2>Nueva reserva</h2><p class="muted tiny">Para citas que te pidan por teléfono, Instagram o en persona.</p>
      <form id="nb-form">
        <div class="field"><label>Servicio</label><select name="service_id" required>${services.map(s => `<option value="${s.id}" data-d="${s.duration_min}">${esc(s.name)} · ${dur(s.duration_min)}${s.active ? '' : ' (oculto)'}</option>`).join('')}</select></div>
        <div class="grid2"><div class="field"><label>Nombre y apellido</label><input name="name" required></div>
        <div class="field"><label>WhatsApp</label><input name="phone" type="tel" required placeholder="9 1234 5678"></div></div>
        <div class="field"><label>Fecha</label><input type="date" name="date" value="${TODAY}" required></div>
        <label class="tiny muted">Horario</label><div class="slots"></div><input type="hidden" name="time">
        <div class="field"><label>Comentarios</label><textarea name="comments" rows="2"></textarea></div>
        <div class="field"><label>Estado</label><select name="status"><option value="confirmed">Confirmada</option><option value="pending">Pendiente</option></select></div>
        <div class="actions"><button type="button" class="btn btn-ghost btn-sm" data-close>Cancelar</button><button class="btn btn-sm">Crear reserva</button></div>
      </form>`);
    const sel = $('[name=service_id]', root);
    const load = slotPicker(root, { getDuration: () => sel.selectedOptions[0]?.dataset.d });
    sel.onchange = load; load();
    $('#nb-form').onsubmit = run(async e => {
      e.preventDefault();
      const f = formData(e.target);
      if (!f.time) return toast('Elige un horario', true);
      await api('/bookings', { method: 'POST', body: f });
      toast('Reserva creada.'); closeModal(); route();
    });
  }

  // ---------------- Horarios ----------------
  R.horarios = async () => {
    const h = await api('/hours');
    const r = h.rules;
    const order = [1, 2, 3, 4, 5, 6, 0];
    $('#view').innerHTML = `
      <div class="box"><h2>Horario semanal</h2>
        <form id="weekly"><div style="overflow-x:auto"><table class="weekly"><thead><tr><th>Día</th><th>Abierto</th><th>Apertura</th><th>Cierre</th><th>Descanso desde</th><th>Descanso hasta</th></tr></thead><tbody>
        ${order.map(d => { const w = h.weekly.find(x => x.weekday === d); return `<tr data-wd="${d}">
          <td><b>${DAYS[d]}</b></td><td><input type="checkbox" name="open" ${w.is_open ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--rose)"></td>
          <td><input type="time" name="start" value="${hhmm(w.start_min)}" step="900"></td><td><input type="time" name="end" value="${hhmm(w.end_min)}" step="900"></td>
          <td><input type="time" name="bs" value="${hhmm(w.break_start)}" step="900"></td><td><input type="time" name="be" value="${hhmm(w.break_end)}" step="900"></td></tr>`; }).join('')}
        </tbody></table></div><div class="actions"><button class="btn btn-sm">Guardar horario</button></div></form></div>

      <div class="box"><h2>Reglas de reserva</h2>
        <form id="rules" class="grid3">
          <div class="field"><label>Intervalo entre horarios ofrecidos (min)</label><input type="number" name="slot_interval" min="5" max="120" value="${r.slot_interval}"></div>
          <div class="field"><label>Tiempo libre entre citas (min)</label><input type="number" name="buffer_min" min="0" max="120" value="${r.buffer_min}"></div>
          <div class="field"><label>Anticipación mínima (horas)</label><input type="number" name="min_notice_h" min="0" max="336" step="0.5" value="${r.min_notice_min / 60}"></div>
          <div class="field"><label>Se puede reservar hasta (días)</label><input type="number" name="max_days_ahead" min="1" max="365" value="${r.max_days_ahead}"></div>
          <div class="field"><label>Zona horaria</label><input name="timezone" value="${esc(r.timezone)}"></div>
          <div class="field"><label>Confirmación</label><label class="switch"><input type="checkbox" name="auto_confirm" ${r.auto_confirm ? 'checked' : ''}> Confirmar reservas automáticamente</label>
            <p class="tiny muted">Si está desactivado, quedan "pendientes" hasta que las confirmes.</p></div>
          <div class="full actions"><button class="btn btn-sm">Guardar reglas</button></div>
        </form></div>

      <div class="box"><h2>Feriados, vacaciones y horarios especiales</h2>
        <form id="exc" class="grid3">
          <div class="field"><label>Desde</label><input type="date" name="start_date" required min="${TODAY}"></div>
          <div class="field"><label>Hasta</label><input type="date" name="end_date" min="${TODAY}"></div>
          <div class="field"><label>Tipo</label><select name="kind"><option value="closed">Cerrado (feriado / vacaciones / día bloqueado)</option><option value="special">Horario especial</option></select></div>
          <div class="field sp" hidden><label>Abre</label><input type="time" name="start" step="900"></div>
          <div class="field sp" hidden><label>Cierra</label><input type="time" name="end" step="900"></div>
          <div class="field"><label>Nota</label><input name="note" placeholder="Ej. Vacaciones de verano"></div>
          <div class="full actions"><button class="btn btn-sm">Agregar</button></div>
        </form>
        <ul class="list-plain">${h.exceptions.map(x => `<li><span><b>${x.start_date === x.end_date ? longDate(x.start_date) : `${longDate(x.start_date)} → ${longDate(x.end_date)}`}</b> · ${x.kind === 'closed' ? 'Cerrado' : `Horario especial ${hhmm(x.start_min)}–${hhmm(x.end_min)}`}${x.note ? ' · ' + esc(x.note) : ''}</span><button class="mini danger" data-del-exc="${x.id}">Eliminar</button></li>`).join('') || '<li class="muted">Sin excepciones.</li>'}</ul>
      </div>

      <div class="box"><h2>Horas bloqueadas <small>(ej. un trámite personal)</small></h2>
        <form id="blk" class="grid3">
          <div class="field"><label>Fecha</label><input type="date" name="date" required min="${TODAY}"></div>
          <div class="field"><label>Desde</label><input type="time" name="start" required step="900"></div>
          <div class="field"><label>Hasta</label><input type="time" name="end" required step="900"></div>
          <div class="field full"><label>Nota</label><input name="note"></div>
          <div class="full actions"><button class="btn btn-sm">Bloquear horario</button></div>
        </form>
        <ul class="list-plain">${h.blocks.map(x => `<li><span><b>${longDate(x.date)}</b> · ${hhmm(x.start_min)}–${hhmm(x.end_min)}${x.note ? ' · ' + esc(x.note) : ''}</span><button class="mini danger" data-del-blk="${x.id}">Eliminar</button></li>`).join('') || '<li class="muted">Sin bloqueos.</li>'}</ul>
      </div>`;
    $('#weekly').onsubmit = run(async e => {
      e.preventDefault();
      const rows = $$('tr[data-wd]').map(tr => ({ weekday: Number(tr.dataset.wd), is_open: $('[name=open]', tr).checked, start: $('[name=start]', tr).value, end: $('[name=end]', tr).value, break_start: $('[name=bs]', tr).value || null, break_end: $('[name=be]', tr).value || null }));
      await api('/hours/weekly', { method: 'PUT', body: rows }); toast('Horario guardado. La agenda ya se actualizó.');
    });
    $('#rules').onsubmit = run(async e => {
      e.preventDefault();
      const f = formData(e.target);
      await api('/rules', { method: 'PUT', body: { ...f, min_notice_min: Math.round(Number(f.min_notice_h) * 60), auto_confirm: e.target.auto_confirm.checked } });
      toast('Reglas guardadas.');
    });
    const kind = $('#exc [name=kind]');
    kind.onchange = () => $$('#exc .sp').forEach(x => x.hidden = kind.value !== 'special');
    $('#exc').onsubmit = run(async e => {
      e.preventDefault();
      const r2 = await api('/exceptions', { method: 'POST', body: formData(e.target) });
      toast(r2.conflicts ? `Guardado. Atención: hay ${r2.conflicts} reserva(s) activas en esas fechas; revísalas.` : 'Guardado.', !!r2.conflicts);
      R.horarios();
    });
    $('#blk').onsubmit = run(async e => {
      e.preventDefault();
      const r2 = await api('/blocks', { method: 'POST', body: formData(e.target) });
      toast(r2.conflicts ? `Bloqueado. Atención: ya hay ${r2.conflicts} reserva(s) en ese horario.` : 'Horario bloqueado.', !!r2.conflicts);
      R.horarios();
    });
    $$('[data-del-exc]').forEach(b => b.onclick = run(async () => { await api(`/exceptions/${b.dataset.delExc}`, { method: 'DELETE' }); R.horarios(); }));
    $$('[data-del-blk]').forEach(b => b.onclick = run(async () => { await api(`/blocks/${b.dataset.delBlk}`, { method: 'DELETE' }); R.horarios(); }));
  };

  // ---------------- Servicios ----------------
  R.servicios = async () => {
    services = await api('/services');
    $('#view').innerHTML = `<div class="toolbar"><button class="btn btn-sm" id="add-svc">+ Agregar servicio</button></div>
      <div class="svc-grid">${services.map(s => `<article class="svc"><img src="${esc(A(s.image || PH))}" alt="">
        <div><h3>${esc(s.name)} ${s.active ? '' : '<span class="pill p-cancelled">Oculto</span>'}</h3>
        <p class="tiny muted">${dur(s.duration_min)} · ${money(s.price)}</p>
        <div class="row"><button class="mini" data-edit="${s.id}">Editar</button><button class="mini danger" data-del="${s.id}">Eliminar</button></div></div></article>`).join('')}</div>`;
    $('#add-svc').onclick = () => serviceModal();
    $$('[data-edit]').forEach(b => b.onclick = () => serviceModal(services.find(s => s.id === Number(b.dataset.edit))));
    $$('[data-del]').forEach(b => b.onclick = run(async () => {
      if (!confirm('¿Eliminar este servicio? Las reservas existentes se conservan.')) return;
      await api(`/services/${b.dataset.del}`, { method: 'DELETE' }); toast('Servicio eliminado.'); R.servicios();
    }));
  };
  function serviceModal(s = {}) {
    const root = modal(`<h2>${s.id ? 'Editar servicio' : 'Nuevo servicio'}</h2>
      <form id="svc-form">
        <div class="field"><label>Nombre</label><input name="name" required value="${esc(s.name)}"></div>
        <div class="field"><label>Descripción</label><textarea name="description" rows="3">${esc(s.description)}</textarea></div>
        <div class="grid2">
          <div class="field"><label>Precio (${currency}) <span class="muted">vacío = "a consultar"</span></label><input name="price" type="number" min="0" step="1" value="${s.price ?? ''}"></div>
          <div class="field"><label>Duración (minutos)</label><input name="duration_min" type="number" min="10" max="600" step="5" required value="${s.duration_min ?? 120}"></div>
          <div class="field"><label>Orden</label><input name="sort" type="number" value="${s.sort ?? services.length}"></div>
          <div class="field"><label>Visible en la web</label><label class="switch"><input type="checkbox" name="active" ${s.active === false ? '' : 'checked'}> Mostrar y permitir reservas</label></div>
        </div>
        ${imgField('image', s.image, 'Fotografía')}
        <div class="actions"><button type="button" class="btn btn-ghost btn-sm" data-close>Cancelar</button><button class="btn btn-sm">Guardar</button></div>
      </form>`);
    bindImgFields(root);
    $('#svc-form').onsubmit = run(async e => {
      e.preventDefault();
      const f = { ...formData(e.target), active: e.target.active.checked };
      await api(s.id ? `/services/${s.id}` : '/services', { method: s.id ? 'PUT' : 'POST', body: f });
      toast('Servicio guardado.'); closeModal(); R.servicios();
    });
  }

  // ---------------- Galería ----------------
  R.galeria = async () => {
    const g = await api('/gallery');
    $('#view').innerHTML = `<div class="box"><h2>Subir fotografías</h2>
      <form id="g-up" class="grid3"><div class="field"><label>Fotos (puedes elegir varias)</label><input type="file" name="images" multiple accept="image/jpeg,image/png,image/webp" required></div>
      <div class="field"><label>Estilo</label><input name="style" placeholder="Ej. Volumen ruso"></div>
      <div class="field"><label>Descripción</label><input name="caption" placeholder="Opcional"></div>
      <div class="full actions"><button class="btn btn-sm">Subir</button></div></form></div>
      <div class="gal">${g.map((x, i) => `<figure data-id="${x.id}"><img src="${esc(A(x.image))}" alt="">
        <figcaption><input value="${esc(x.style)}" placeholder="Estilo" data-f="style"><input value="${esc(x.caption)}" placeholder="Descripción" data-f="caption">
        <div class="acts" style="justify-content:space-between"><span><button class="mini" data-mv="-1" ${i === 0 ? 'disabled' : ''} aria-label="Mover antes">←</button> <button class="mini" data-mv="1" ${i === g.length - 1 ? 'disabled' : ''} aria-label="Mover después">→</button></span>
        <span><button class="mini" data-save>Guardar</button> <button class="mini danger" data-rm>Eliminar</button></span></div></figcaption></figure>`).join('') || '<p class="empty">Aún no hay fotos.</p>'}</div>`;
    $('#g-up').onsubmit = run(async e => {
      e.preventDefault();
      const files = [...e.target.images.files];
      if (!files.length) return toast('Elige al menos una foto', true);
      const images = [];
      for (const [i, f] of files.entries()) { toast(`Subiendo y optimizando foto ${i + 1} de ${files.length}…`); images.push(await uploadImage(f, 1600)); }
      await api('/gallery', { method: 'POST', body: { images, style: e.target.style.value, caption: e.target.caption.value } }); toast('Fotos agregadas.'); R.galeria();
    });
    $$('.gal figure').forEach((fig, i) => {
      const id = fig.dataset.id;
      $('[data-save]', fig).onclick = run(async () => { await api(`/gallery/${id}`, { method: 'PUT', body: { style: $('[data-f=style]', fig).value, caption: $('[data-f=caption]', fig).value } }); toast('Guardado.'); });
      $('[data-rm]', fig).onclick = run(async () => { if (!confirm('¿Eliminar esta foto?')) return; await api(`/gallery/${id}`, { method: 'DELETE' }); R.galeria(); });
      $$('[data-mv]', fig).forEach(b => b.onclick = run(async () => {
        const ids = g.map(x => x.id); const j = i + Number(b.dataset.mv);
        [ids[i], ids[j]] = [ids[j], ids[i]];
        await api('/gallery/order', { method: 'PUT', body: { ids } }); R.galeria();
      }));
    });
  };

  // ---------------- Negocio ----------------
  R.negocio = async () => {
    const b = await api('/business');
    const f = (k, label, type = 'input', extra = '') => type === 'textarea'
      ? `<div class="field full"><label>${label}</label><textarea name="${k}" rows="3" ${extra}>${esc(b[k])}</textarea></div>`
      : `<div class="field"><label>${label}</label><input name="${k}" value="${esc(b[k])}" ${extra}></div>`;
    $('#view').innerHTML = `<form id="biz">
      <p class="alert">Los textos entre [corchetes] son provisionales y se muestran resaltados en la web hasta que los reemplaces.</p>
      <div class="box"><h2>Identidad</h2><div class="grid2">
        ${f('name', 'Nombre del negocio')}${f('owner_name', 'Nombre de la especialista')}${f('tagline', 'Frase corta (sobre el título)')}
        <div class="field"><label>Moneda</label><select name="currency">${['CLP', 'USD', 'EUR', 'MXN', 'ARS', 'COP', 'PEN'].map(c => `<option ${b.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        ${imgField('logo', b.logo, 'Logotipo (opcional)')}${imgField('hero_image', b.hero_image, 'Foto principal de portada')}
      </div></div>
      <div class="box"><h2>Portada</h2><div class="grid2">${f('hero_title', 'Título', 'input', 'class="full"')}${f('hero_text', 'Descripción', 'textarea')}</div></div>
      <div class="box"><h2>Sobre mí</h2><div class="grid2">
        ${imgField('about_photo', b.about_photo, 'Tu fotografía')}<div></div>
        ${f('about_intro', 'Presentación', 'textarea')}${f('about_experience', 'Trayectoria y experiencia', 'textarea')}
        ${f('about_training', 'Formación y certificaciones', 'textarea')}${f('about_philosophy', 'Filosofía de trabajo', 'textarea')}${f('about_message', 'Mensaje para tus clientas', 'textarea')}
      </div></div>
      <div class="box"><h2>Ubicación y redes</h2><div class="grid2">
        ${f('address', 'Dirección del local')}${f('city', 'Ciudad')}
        ${f('maps_query', 'Búsqueda para Google Maps (opcional)', 'input', 'placeholder="Si se deja vacío, se usa la dirección"')}
        ${f('google_place_id', 'ID del local en Google Maps (para el mapa y las reseñas)', 'input', 'placeholder="Ej. ChIJ…"')}
        ${f('whatsapp_display', 'WhatsApp como se muestra (opcional)', 'input', 'placeholder="+56 9 1234 5678 — el número real se configura en WhatsApp"')}
        ${f('instagram', 'Instagram (usuario o enlace)')}${f('facebook', 'Facebook (opcional)')}${f('tiktok', 'TikTok (opcional)')}
      </div></div>
      <div class="box"><h2>Buscadores (SEO)</h2><div class="grid2">${f('seo_description', 'Descripción para Google (máx. 160 caracteres)', 'textarea', 'maxlength="300"')}</div></div>
      <div class="actions"><button class="btn">Guardar cambios</button></div></form>`;
    bindImgFields($('#biz'));
    $('#biz').onsubmit = run(async e => { e.preventDefault(); await api('/business', { method: 'PUT', body: formData(e.target) }); currency = e.target.currency.value; toast('Información guardada. Ya se ve en tu web.'); });
  };

  // ---------------- WhatsApp ----------------
  const TPL_OWNER = 'NUEVA RESERVA DE CITA\n\n¡Tienes una nueva clienta!\n\nNombre: {{1}}\nWhatsApp: {{2}}\nServicio: {{3}}\nFecha: {{4}}\nHora: {{5}}\nDuración: {{6}}\n\nEstado: NUEVA RESERVA\n\nIngresa al panel administrativo para gestionar esta cita.';
  const TPL_CLIENT = '¡Hola, {{1}}!\n\nTu reserva ha sido registrada correctamente.\n\nServicio: {{2}}\nFecha: {{3}}\nHora: {{4}}\n\n¡Muchas gracias por confiar en nosotros!\n\nTe esperamos para que disfrutes de tu experiencia de belleza.';
  R.whatsapp = async () => {
    const [w, notifs] = await Promise.all([api('/whatsapp'), api('/notifications')]);
    const s = w.status, c = w.settings;
    const state = !s.configured ? ['', 'No configurado: faltan las credenciales de la API oficial de WhatsApp (más abajo). Las reservas igual se guardan.']
      : s.connected ? ['ok', `Conectado a WhatsApp Business · ${esc(s.verified_name || '')} ${esc(s.display_phone_number || '')}`]
      : s.error ? ['err', `Credenciales cargadas, pero Meta respondió con error: ${esc(s.error)}`]
      : ['', 'Comprobando la conexión con Meta… vuelve a abrir esta sección en un minuto.'];
    $('#view').innerHTML = `
      <div class="alert ${state[0]}"><b>Estado de conexión:</b> ${state[1]}</div>
      <div class="box"><h2>Número y avisos</h2>
        <form id="wa-form" class="grid2">
          <div class="field"><label>Código de país</label><input name="country_code" value="${esc(c.country_code)}" inputmode="numeric" placeholder="56"></div>
          <div class="field"><label>WhatsApp que recibe los avisos de reservas</label><input name="owner_number" value="${esc(c.owner_number)}" inputmode="tel" placeholder="912345678"></div>
          <div class="field"><label>Plantilla aviso a la dueña</label><input name="template_owner" value="${esc(c.template_owner)}"></div>
          <div class="field"><label>Plantilla confirmación a la clienta</label><input name="template_client" value="${esc(c.template_client)}"></div>
          <div class="field"><label>Idioma de plantillas</label><input name="language" value="${esc(c.language)}" placeholder="es"></div>
          <div class="field"><label>Envíos automáticos</label>
            <label class="switch"><input type="checkbox" name="notify_owner" ${c.notify_owner ? 'checked' : ''}> Avisarme de cada reserva</label><br>
            <label class="switch"><input type="checkbox" name="notify_client" ${c.notify_client ? 'checked' : ''}> Enviar confirmación a la clienta (si acepta)</label></div>
          <div class="full actions"><button type="button" class="btn btn-sm btn-ghost" id="wa-test">Enviar mensaje de prueba</button><button class="btn btn-sm">Guardar</button></div>
        </form>
        <p class="tiny muted">Este número también se usa en los botones “Contactar por WhatsApp” de la web.</p></div>

      <div class="box"><h2>Credenciales de la API oficial (Meta)</h2>
        <p class="tiny muted">Se guardan solo en el servidor y nunca se vuelven a mostrar ni llegan a la web pública. Para cambiarlas, escribe las nuevas y guarda.</p>
        <ul class="list-plain">
          <li>Token de acceso permanente<span class="pill ${s.has_token ? 'p-sent' : 'p-failed'}">${s.has_token ? 'Cargado' : 'Falta'}</span></li>
          <li>Identificador del número de teléfono (Phone number ID)<span class="pill ${s.has_phone_number_id ? 'p-sent' : 'p-failed'}">${s.has_phone_number_id ? 'Cargado' : 'Falta'}</span></li>
        </ul>
        <form id="wa-cred" class="grid2" autocomplete="off">
          <div class="field"><label>Token de acceso</label><input name="token" type="password" autocomplete="off" placeholder="${s.has_token ? '•••••••• (guardado)' : 'EAA…'}"></div>
          <div class="field"><label>Phone number ID</label><input name="phone_number_id" inputmode="numeric" autocomplete="off" placeholder="${s.has_phone_number_id ? '(guardado)' : '1234567890…'}"></div>
          <div class="field"><label>Versión de la API</label><input name="api_version" value="${esc(s.api_version)}"></div>
          <div class="full actions">${s.configured ? '<button type="button" class="btn btn-sm btn-ghost" id="wa-clear">Borrar credenciales</button>' : ''}<button class="btn btn-sm">Guardar credenciales</button></div>
        </form>
      </div>

      <div class="box"><h2>Plantillas para registrar en Meta <small>categoría “Utilidad”, idioma español</small></h2>
        <p class="tiny muted">WhatsApp exige plantillas aprobadas para los mensajes que inicia el negocio. Crea estas dos en el Administrador de WhatsApp con exactamente estos nombres.</p>
        <b>${esc(c.template_owner)}</b><div class="tpl">${esc(TPL_OWNER)}</div>
        <b>${esc(c.template_client)}</b><div class="tpl">${esc(TPL_CLIENT)}</div>
      </div>

      <div class="box"><h2>Registro de envíos <button class="mini" id="wa-refresh" style="float:right">Actualizar</button></h2>
        <p class="tiny muted">“Enviado” significa que Meta aceptó el mensaje. Los envíos fallidos se reintentan solos hasta 5 veces.</p>
        ${notifs.length ? `<div style="overflow-x:auto"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Destino</th><th>Estado</th><th>Detalle</th><th></th></tr></thead><tbody>
        ${notifs.map(n => `<tr><td>${fmtDT(n.created_at)}</td><td>${NKIND[n.kind] || n.kind}${n.client_name ? `<br><small class="muted">${esc(n.client_name)}</small>` : ''}</td><td>+${esc(n.to_phone)}</td>
          <td><span class="pill p-${n.status}">${NSTATUS[n.status] || n.status}</span></td><td class="tiny">${esc(n.last_error || '')}${n.attempts ? ` <span class="muted">(${n.attempts} intento/s)</span>` : ''}</td>
          <td>${['failed', 'not_configured'].includes(n.status) ? `<button class="mini" data-retry="${n.id}">Reintentar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Todavía no hay envíos.</p>'}
      </div>`;
    $('#wa-form').onsubmit = run(async e => {
      e.preventDefault();
      await api('/whatsapp', { method: 'PUT', body: { ...formData(e.target), notify_owner: e.target.notify_owner.checked, notify_client: e.target.notify_client.checked } });
      toast('Configuración guardada.'); R.whatsapp();
    });
    $('#wa-cred').onsubmit = run(async e => {
      e.preventDefault();
      const f = formData(e.target);
      if (!f.token && !f.phone_number_id && f.api_version === s.api_version) return toast('Escribe al menos un dato nuevo.', true);
      const r = await api('/whatsapp/credentials', { method: 'PUT', body: f });
      toast(r.configured ? 'Credenciales guardadas. Comprobando conexión…' : 'Guardado. Aún falta un dato.'); R.whatsapp();
    });
    if ($('#wa-clear')) $('#wa-clear').onclick = run(async () => {
      if (!confirm('¿Borrar el token y el identificador? Los avisos dejarán de enviarse.')) return;
      await api('/whatsapp/credentials', { method: 'PUT', body: { clear: true } }); toast('Credenciales borradas.'); R.whatsapp();
    });
    $('#wa-refresh').onclick = () => R.whatsapp();
    $('#wa-test').onclick = run(async () => {
      await api('/whatsapp/test', { method: 'POST' });
      toast('Mensaje de prueba enviado a Meta. En unos segundos verás el resultado en el registro.');
      setTimeout(() => location.hash === '#whatsapp' && R.whatsapp(), 6000);
    });
    $$('[data-retry]').forEach(b => b.onclick = run(async () => {
      await api(`/notifications/${b.dataset.retry}/retry`, { method: 'POST' });
      toast('Reintentando. Revisa el registro en unos segundos.'); setTimeout(() => R.whatsapp(), 5000);
    }));
  };

  // ---------------- Cuenta ----------------
  R.cuenta = async () => {
    const me = await api('/me');
    $('#view').innerHTML = `<div class="box" style="max-width:520px"><h2>Cambiar contraseña</h2><p class="muted tiny">Correo de acceso: <b>${esc(me.username)}</b></p>
      <form id="pw"><div class="field"><label>Contraseña actual</label><input type="password" name="current" autocomplete="current-password" required></div>
      <div class="field"><label>Nueva contraseña (mínimo 8 caracteres)</label><input type="password" name="next" minlength="8" autocomplete="new-password" required></div>
      <div class="actions"><button class="btn btn-sm">Actualizar</button></div></form></div>
      <div class="box" style="max-width:520px"><h2>Sesión</h2><button class="btn btn-ghost btn-sm" id="logout">Cerrar sesión</button></div>`;
    $('#pw').onsubmit = run(async e => { e.preventDefault(); const f = formData(e.target); await MIA.changePassword(f.current, f.next); e.target.reset(); toast('Contraseña actualizada.'); });
    $('#logout').onclick = run(async () => { await MIA.logout(); showLogin(); });
  };

  async function start() {
    authed = true;
    $('#login').hidden = true; $('#app').hidden = false;
    try { const biz = await api('/business'); currency = biz.currency || 'CLP'; } catch { void 0; }
    route();
  }
  (async () => {
    const link = MIA.consumeRecoveryLink();
    if (link === 'recovery') { $('#login').hidden = false; setMode('reset'); return; }
    if (!MIA.configured) { $('#login').hidden = false; $('#login-error').textContent = 'La web aún no está conectada a su base de datos.'; $('#login-error').hidden = false; return; }
    let st = null;
    try { st = MIA.hasSession() ? await MIA.setupStatus() : null; } catch { st = null; }
    st && st.is_admin ? start() : showLogin();
  })();
})();
