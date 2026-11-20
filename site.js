'use strict';
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isPh = s => !s || /^\[[^\]]*\]$/.test(String(s).trim());
  // Los textos provisionales [entre corchetes] se marcan visualmente para que se note que faltan.
  const rich = s => esc(s).replace(/\[[^\]]+\]/g, m => `<span class="ph" title="Texto provisional: edítalo en el panel">${m}</span>`);
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const dur = m => [Math.floor(m / 60) ? `${Math.floor(m / 60)} h` : '', m % 60 ? `${m % 60} min` : ''].filter(Boolean).join(' ');
  let cfg, money;
  const price = p => (p == null ? 'A consultar' : money.format(p));

  const api = (url, opts = {}) => MIA.publicApi(url, opts);
  const A = u => MIA.asset(u);

  // ---------- Contenido editable ----------
  function renderBusiness() {
    const b = cfg.business;
    const owner = isPh(b.owner_name) ? null : b.owner_name;
    const values = { ...b, about_intro: owner ? b.about_intro.replace(/\[NOMBRE DE LA ESPECIALISTA\]/gi, owner) : b.about_intro };
    $$('[data-bind]').forEach(el => {
      const k = el.dataset.bind;
      if (k === 'hero_title') {
        const t = values.hero_title || '';
        const i = t.indexOf(',');
        el.innerHTML = i > 0 ? `${rich(t.slice(0, i + 1))}<br><em>${rich(t.slice(i + 1).trim())}</em>` : rich(t);
      } else if (k === 'city') {
        el.textContent = values.city || '';
      } else el.innerHTML = rich(values[k] || '');
    });
    $$('[data-bind-img]').forEach(img => {
      const src = b[img.dataset.bindImg] || img.dataset.fallback;
      if (src) { img.src = A(src); img.hidden = false; } else img.hidden = true;
    });
    if (b.logo) $('.brand-name').hidden = false;
    $('#year').textContent = new Date().getFullYear();

    // Contacto
    const addr = [b.address, b.city].filter(Boolean).join(', ');
    $('#c-address').innerHTML = addr ? esc(addr) : '<span class="ph">[Dirección pendiente]</span>';
    const q = b.maps_query || addr;
    const pid = (b.google_place_id || '').trim();
    if (q || pid) {
      $('#btn-maps').href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q || addr)}${pid ? '&destination_place_id=' + encodeURIComponent(pid) : ''}`;
      $('#map').innerHTML = `<iframe title="Mapa: ubicación de ${esc(b.name)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=${encodeURIComponent(q || addr)}&z=16&output=embed"></iframe>`;
    } else {
      $('#btn-maps').hidden = true;
      $('#map').innerHTML = '<div class="empty"><p>El mapa aparecerá aquí cuando se agregue la dirección del local.</p></div>';
    }
    // Reseñas en Google (ficha de Google Maps del negocio)
    if (pid) {
      $('#btn-review').href = `https://search.google.com/local/writereview?placeid=${encodeURIComponent(pid)}`;
      $('#btn-reviews').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q || b.name)}&query_place_id=${encodeURIComponent(pid)}`;
      $('#c-maps-place').href = $('#btn-reviews').href;
    } else { $('#reviews').hidden = true; $('#c-maps-place').hidden = true; }
    const wa = b.whatsapp_link_number;
    if (wa) {
      $('#c-wa').innerHTML = `<a href="https://wa.me/${wa}" target="_blank" rel="noopener">${esc(b.whatsapp_display || '+' + wa)}</a>`;
      $('#btn-wa').href = `https://wa.me/${wa}?text=${encodeURIComponent('¡Hola! Quisiera consultar por una cita de extensiones de pestañas.')}`;
    } else {
      $('#c-wa').innerHTML = '<span class="ph">[Número pendiente]</span>';
      $('#btn-wa').hidden = true;
    }
    const handle = v => { const m = String(v).match(/(?:instagram|tiktok|facebook)\.com\/@?([^/?#]+)/i); return m ? '@' + m[1] : (v.startsWith('@') ? v : '@' + v); };
    const social = [['Instagram', b.instagram, 'https://www.instagram.com/'], ['Facebook', b.facebook, 'https://facebook.com/'], ['TikTok', b.tiktok, 'https://tiktok.com/@']]
      .filter(x => x[1]).map(([n, v, base]) => {
        const url = /^https?:\/\//.test(v) ? v : base + v.replace(/^@/, '');
        return `<a href="${esc(url)}" target="_blank" rel="noopener">${n} ${esc(handle(v))}</a>`;
      });
    $$('[data-ig]').forEach(a => { if (b.instagram) { a.href = /^https?:/.test(b.instagram) ? b.instagram : 'https://www.instagram.com/' + b.instagram.replace(/^@/, ''); a.hidden = false; $$('[data-ig-handle]', a).forEach(x => x.textContent = handle(b.instagram)); } else a.hidden = true; });
    if (social.length) $('#c-social').innerHTML = social.join(' · '); else $('#c-social-li').hidden = true;
    const order = [1, 2, 3, 4, 5, 6, 0];
    $('#c-hours').innerHTML = order.map(d => {
      const h = cfg.hours.find(x => x.weekday === d);
      const txt = h && h.is_open ? `${hhmm(h.start_min)} – ${hhmm(h.end_min)}` : 'Cerrado';
      return `<li>${DAYS[d]}</li><li>${txt}</li>`;
    }).join('');
  }

  function renderServices() {
    $('#services-list').innerHTML = cfg.services.map(s => `
      <article class="card reveal">
        <div class="card-img"><img src="${esc(A(s.image || 'classic.svg'))}" alt="${esc(s.name)}" loading="lazy" width="400" height="300"></div>
        <div class="card-body">
          <h3>${esc(s.name)}</h3>
          <p>${esc(s.description)}</p>
          <div class="meta"><span class="price">${price(s.price)}</span><span class="dur">◷ ${dur(s.duration_min)}</span></div>
          <button class="btn btn-sm" data-book="${s.id}">Reservar este servicio</button>
        </div>
      </article>`).join('') || '<p class="empty">Pronto publicaremos nuestros servicios.</p>';
    $('#svc-pick').innerHTML = cfg.services.map(s => `
      <button type="button" class="svc-opt" role="radio" aria-checked="false" data-svc="${s.id}">
        <img src="${esc(A(s.image || 'classic.svg'))}" alt="" loading="lazy">
        <span><b>${esc(s.name)}</b><small>${dur(s.duration_min)} · ${price(s.price)}</small></span>
      </button>`).join('');
  }

  // ---------- Galería + visor ----------
  let lbIndex = 0;
  function renderGallery() {
    const g = cfg.gallery;
    $('#gallery').innerHTML = g.map((x, i) => `<button class="g-item reveal" data-i="${i}" aria-label="Ampliar foto ${i + 1}">
      <img src="${esc(A(x.image))}" alt="${esc(x.caption || x.style || 'Trabajo de extensiones de pestañas')}" loading="lazy">
      ${x.caption || x.style ? `<span>${esc([x.style, x.caption].filter(Boolean).join(' · '))}</span>` : ''}</button>`).join('')
      || '<p class="empty">Muy pronto compartiremos aquí nuestros trabajos.</p>';
  }
  function openLb(i) {
    const g = cfg.gallery; if (!g.length) return;
    lbIndex = (i + g.length) % g.length;
    const lb = $('#lightbox');
    $('img', lb).src = A(g[lbIndex].image);
    $('img', lb).alt = g[lbIndex].caption || 'Foto ampliada';
    $('figcaption', lb).textContent = [g[lbIndex].style, g[lbIndex].caption].filter(Boolean).join(' · ');
    lb.hidden = false; document.body.style.overflow = 'hidden';
    $('.lb-close', lb).focus();
  }
  function closeLb() { $('#lightbox').hidden = true; document.body.style.overflow = ''; }

  // ---------- Agenda ----------
  const st = { service: null, month: null, today: null, date: null, time: null, maxDate: null };
  const svc = () => cfg.services.find(s => s.id === st.service);

  function showStep(n) {
    [1, 2, 3, 4].forEach(i => { $(`#step-${i}`).hidden = i !== n; });
    $$('.steps li').forEach(li => {
      const i = Number(li.dataset.step);
      li.classList.toggle('active', i === n);
      li.classList.toggle('done', i < n);
      li.style.cursor = i < n ? 'pointer' : '';
    });
    $('#restart').hidden = n === 1;
  }
  function updateSummary() {
    const s = svc();
    $('#s-service').textContent = s ? s.name : '—';
    $('#s-duration').textContent = s ? dur(s.duration_min) : '—';
    $('#s-price').textContent = s ? price(s.price) : '—';
    $('#s-date').textContent = st.date ? longDate(st.date) : '—';
    $('#s-time').textContent = st.time ? `${st.time} – ${hhmm(toMin(st.time) + s.duration_min)}` : '—';
  }
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  function longDate(d) {
    const [y, m, day] = d.split('-').map(Number);
    const wd = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
    return `${DAYS[wd]} ${day} de ${MONTHS[m - 1]}`;
  }
  const scrollToBooking = () => $('#booking').scrollIntoView({ behavior: 'smooth', block: 'start' });

  function chooseService(id, scroll) {
    st.service = Number(id); st.date = null; st.time = null;
    $$('.svc-opt').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.svc) === st.service)));
    updateSummary();
    showStep(2);
    loadMonth(st.month);
    if (scroll) scrollToBooking();
  }

  async function loadMonth(month) {
    const cal = $('#calendar');
    cal.innerHTML = '<p class="empty" style="grid-column:1/-1">Cargando disponibilidad…</p>';
    try {
      const m = month || st.month || new Date().toISOString().slice(0, 7);
      const data = await api(`/api/public/availability/month?service=${st.service}&month=${m}`);
      if (!st.today) {
        st.today = data.today;
        const d = new Date(data.today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + data.max_days_ahead);
        st.maxDate = d.toISOString().slice(0, 10);
        if (!month) { st.month = data.today.slice(0, 7); if (m !== st.month) return loadMonth(st.month); }
      }
      st.month = data.month;
      renderCalendar(data);
    } catch (e) { cal.innerHTML = `<p class="empty" style="grid-column:1/-1">${esc(e.message)}</p>`; }
  }
  function renderCalendar(data) {
    const [y, m] = data.month.split('-').map(Number);
    $('#cal-title').textContent = `${MONTHS[m - 1]} ${y}`;
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const offset = (first + 6) % 7; // semana inicia en lunes
    const label = { available: 'disponible', full: 'sin horarios disponibles', closed: 'sin atención', blocked: 'no disponible', past: 'fecha pasada', out_of_range: 'aún no disponible para reservar' };
    let html = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map(d => `<div class="dow" role="columnheader">${d}</div>`).join('');
    html += '<div></div>'.repeat(offset);
    for (const d of data.days) {
      const n = Number(d.date.slice(8));
      const cls = ['day', d.status, d.date === data.today ? 'today' : '', d.date === st.date ? 'selected' : ''].join(' ');
      html += d.status === 'available'
        ? `<button class="${cls}" data-date="${d.date}" aria-label="${n} de ${MONTHS[m - 1]}, ${label[d.status]}">${n}</button>`
        : `<div class="${cls}" aria-label="${n} de ${MONTHS[m - 1]}, ${label[d.status]}" role="gridcell" aria-disabled="true">${n}</div>`;
    }
    $('#calendar').innerHTML = html;
    $('#cal-prev').disabled = data.month <= data.today.slice(0, 7);
    $('#cal-next').disabled = !st.maxDate || data.month >= st.maxDate.slice(0, 7);
    if (!data.days.some(d => d.status === 'available') && !$('#cal-next').disabled) {
      $('#calendar').insertAdjacentHTML('beforeend', '<p class="empty" style="grid-column:1/-1">No quedan horarios este mes. Revisa el mes siguiente ›</p>');
    }
  }
  function shiftMonth(delta) {
    const [y, m] = st.month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    loadMonth(d.toISOString().slice(0, 7));
  }

  async function chooseDate(date) {
    st.date = date; st.time = null;
    $$('.day.selected').forEach(d => d.classList.remove('selected'));
    $(`.day[data-date="${date}"]`)?.classList.add('selected');
    updateSummary();
    showStep(3);
    $('#slots-date').textContent = '· ' + longDate(date);
    await loadSlots();
    $('#step-3').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  async function loadSlots() {
    const box = $('#slots');
    box.innerHTML = '<p class="empty" style="grid-column:1/-1">Buscando horarios…</p>';
    try {
      const data = await api(`/api/public/availability/day?service=${st.service}&date=${st.date}`);
      if (!data.open || !data.slots.some(s => s.available)) {
        box.innerHTML = `<p class="empty" style="grid-column:1/-1">No quedan horarios para este día. <button class="link" type="button" data-back="2">Elegir otra fecha</button></p>`;
        return;
      }
      box.innerHTML = data.slots.map(s => `<button type="button" class="slot" data-time="${s.time}" ${s.available ? '' : 'disabled aria-label="' + s.time + ' ocupado"'} aria-pressed="${s.time === st.time}">${s.time}</button>`).join('');
    } catch (e) { box.innerHTML = `<p class="empty" style="grid-column:1/-1">${esc(e.message)}</p>`; }
  }
  function chooseTime(t) {
    st.time = t;
    $$('.slot').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.time === t)));
    updateSummary();
    showStep(4);
    $('#form-error').hidden = true;
    $('#step-4').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => $('#f-name').focus({ preventScroll: true }), 350);
  }

  async function submit(e) {
    e.preventDefault();
    const err = $('#form-error');
    err.hidden = true;
    const name = $('#f-name').value.trim();
    const phone = $('#f-phone').value.trim();
    const fail = (msg, el) => { err.textContent = msg; err.hidden = false; el?.focus(); };
    if (name.length < 3 || !/\s/.test(name)) return fail('Escribe tu nombre y apellido.', $('#f-name'));
    if (phone.replace(/\D/g, '').length < 8) return fail('Escribe un número de WhatsApp válido.', $('#f-phone'));
    const btn = $('#submit-btn');
    btn.disabled = true; btn.textContent = 'Reservando…';
    try {
      const out = await api('/api/public/bookings', {
        method: 'POST',
        body: JSON.stringify({
          service_id: st.service, date: st.date, time: st.time, name, phone,
          comments: $('#f-comments').value.trim(), whatsapp_consent: $('#f-consent').checked,
          website: $('input[name=website]').value
        })
      });
      showSuccess(out);
    } catch (ex) {
      if (ex.status === 409) {
        fail(ex.message);
        st.time = null; updateSummary();
        showStep(3); await loadSlots();
        $('#slots').insertAdjacentHTML('afterbegin', `<p class="form-error" style="grid-column:1/-1">${esc(ex.message)}</p>`);
      } else fail(ex.message);
    } finally { btn.disabled = false; btn.textContent = 'Confirmar mi reserva'; }
  }

  function showSuccess(out) {
    const b = out.booking;
    const confirmed = b.status === 'confirmed';
    $('#ok-title').textContent = confirmed ? '¡Tu cita ha sido reservada!' : '¡Recibimos tu solicitud de cita!';
    $('#ok-text').innerHTML = confirmed
      ? 'Gracias por elegirnos. Hemos registrado tu reserva correctamente.'
      : 'Gracias por elegirnos. Tu horario quedó apartado y <strong>está pendiente de confirmación</strong>: te avisaremos por WhatsApp cuando quede confirmada.';
    $('#ok-detail').innerHTML = `
      <div><dt>Estado</dt><dd><span class="status-pill ${confirmed ? 'ok' : ''}">${confirmed ? 'Confirmada' : 'Pendiente'}</span></dd></div>
      <div><dt>Servicio</dt><dd>${esc(b.service_name)}</dd></div>
      <div><dt>Fecha</dt><dd>${esc(b.date_label)}</dd></div>
      <div><dt>Hora</dt><dd>${esc(b.time)} – ${esc(b.end_time)}</dd></div>`;
    $('#ok-code').textContent = `Código de reserva: ${b.code}`;
    const wa = cfg.business.whatsapp_link_number;
    if (wa) {
      const msg = `¡Hola! Acabo de reservar por la web.\nNombre: ${b.client_name}\nServicio: ${b.service_name}\nFecha: ${b.date_label}\nHora: ${b.time}\nCódigo: ${b.code}`;
      $('#ok-wa').href = `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
      $('#ok-wa').hidden = false;
    }
    $('#success').hidden = false;
    $('#ok-close').focus();
  }
  function resetBooking() {
    $('#success').hidden = true;
    $('#step-4').reset();
    st.service = null; st.date = null; st.time = null;
    $$('.svc-opt').forEach(b => b.setAttribute('aria-checked', 'false'));
    updateSummary(); showStep(1);
    loadMonth(st.month);
  }

  // ---------- Eventos ----------
  function bind() {
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-book],[data-svc],[data-date],[data-time],[data-back],.g-item,.steps li');
      if (!t) return;
      if (t.dataset.book) chooseService(t.dataset.book, true);
      else if (t.dataset.svc) chooseService(t.dataset.svc);
      else if (t.dataset.date) chooseDate(t.dataset.date);
      else if (t.dataset.time && !t.disabled) chooseTime(t.dataset.time);
      else if (t.dataset.back) showStep(Number(t.dataset.back));
      else if (t.classList.contains('g-item')) openLb(Number(t.dataset.i));
      else if (t.matches('.steps li.done')) showStep(Number(t.dataset.step));
    });
    $('#cal-prev').onclick = () => shiftMonth(-1);
    $('#cal-next').onclick = () => shiftMonth(1);
    $('#step-4').addEventListener('submit', submit);
    $('#step-4').addEventListener('input', () => { $('#form-error').hidden = true; });
    $('#restart').onclick = () => { st.service = null; st.date = null; st.time = null; $$('.svc-opt').forEach(b => b.setAttribute('aria-checked', 'false')); updateSummary(); showStep(1); };
    $('#ok-close').onclick = resetBooking;
    const lb = $('#lightbox');
    $('.lb-close', lb).onclick = closeLb;
    $('.lb-prev', lb).onclick = () => openLb(lbIndex - 1);
    $('.lb-next', lb).onclick = () => openLb(lbIndex + 1);
    lb.addEventListener('click', e => { if (e.target === lb) closeLb(); });
    document.addEventListener('keydown', e => {
      if (!lb.hidden) { if (e.key === 'Escape') closeLb(); if (e.key === 'ArrowLeft') openLb(lbIndex - 1); if (e.key === 'ArrowRight') openLb(lbIndex + 1); }
      else if (!$('#success').hidden && e.key === 'Escape') resetBooking();
    });
    // Menú móvil
    const tog = $('.nav-toggle'), menu = $('#menu');
    tog.onclick = () => { const o = menu.classList.toggle('open'); tog.setAttribute('aria-expanded', String(o)); };
    $$('#menu a').forEach(a => a.addEventListener('click', () => { menu.classList.remove('open'); tog.setAttribute('aria-expanded', 'false'); }));
    // Botón fijo móvil: se oculta en la agenda y en el pie para no tapar contenido.
    const sticky = $('#sticky-cta');
    const watch = [$('#reservar'), $('.footer'), $('.hero-cta')];
    const vis = new Map();
    const io2 = new IntersectionObserver(entries => {
      entries.forEach(en => vis.set(en.target, en.isIntersecting));
      sticky.classList.toggle('hide', [...vis.values()].some(Boolean));
    }, { threshold: 0.05 });
    watch.forEach(el => el && io2.observe(el));
    // Animaciones al aparecer
    const rv = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); rv.unobserve(en.target); } }), { threshold: 0.12 });
    $$('.reveal').forEach(el => rv.observe(el));
  }

  async function init() {
    try {
      cfg = await api('/api/public/config');
    } catch (e) {
      $('#booking').innerHTML = `<p class="empty">No pudimos cargar la agenda. Recarga la página en unos segundos.</p>`;
      return;
    }
    money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: cfg.business.currency || 'CLP', maximumFractionDigits: 0 });
    renderBusiness(); renderServices(); renderGallery();
    $('#f-cc').textContent = '+' + (cfg.business.country_code || '56');
    if (!cfg.whatsapp_client_enabled) $('#consent-wrap').hidden = true;
    bind();
    showStep(1);
  }
  init();
})();
