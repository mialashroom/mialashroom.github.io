'use strict';
// Conexión de la web con su base de datos (Supabase).
// Solo usa la clave pública "anon": toda la seguridad se aplica en el servidor
// (funciones de la base de datos + políticas de acceso). Nunca hay secretos aquí.
window.MIA = (() => {
  const C = window.MIA_CONFIG || {};
  const ROOT = new URL('.', document.currentScript.src).href;
  const asset = u => (!u ? u : /^(https?:|data:|blob:)/.test(u) ? u : ROOT + String(u).replace(/^\/+/, ''));
  const KEY = 'mia-lash-session';
  let session = null;
  try { session = JSON.parse(localStorage.getItem(KEY)); } catch { session = null; }
  const save = s => {
    if (s && !s.expires_at && s.expires_in) s.expires_at = Math.floor(Date.now() / 1000) + s.expires_in;
    session = s;
    try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { void 0; }
  };
  const fail = (msg, status) => Object.assign(new Error(msg), { status });

  const ES = [
    [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
    [/email not confirmed/i, 'Debes confirmar tu correo antes de ingresar. Revisa tu bandeja de entrada.'],
    [/user already registered/i, 'Ese correo ya tiene una cuenta. Usa “Ingresar”.'],
    [/password should be at least/i, 'La contraseña debe tener al menos 8 caracteres.'],
    [/rate limit|too many/i, 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.'],
    [/jwt expired|invalid jwt|not authorized|no autorizado/i, 'Tu sesión expiró. Ingresa nuevamente.']
  ];
  const es = m => (ES.find(([re]) => re.test(m)) || [null, m])[1];

  async function req(path, { method = 'GET', body, headers = {}, auth = false, raw = false } = {}) {
    if (!C.url || !C.anonKey) throw fail('La web aún no está conectada a su base de datos.', 503);
    const h = { apikey: C.anonKey, ...headers };
    const tok = auth ? await token() : null;
    if (tok) h.Authorization = 'Bearer ' + tok;
    if (body !== undefined && !raw) { h['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
    let res;
    try { res = await fetch(C.url + path, { method, headers: h, body }); }
    catch { throw fail('No hay conexión. Revisa tu internet e inténtalo de nuevo.', 0); }
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    if (!res.ok) {
      const status = Number(data.hint) || (res.status === 401 || res.status === 403 ? 401 : res.status);
      throw fail(es(data.message || data.msg || data.error_description || data.error || 'No pudimos completar la solicitud.'), status);
    }
    return data;
  }

  async function token() {
    if (!session) return null;
    if ((session.expires_at || 0) * 1000 - Date.now() < 60_000) {
      try { save(await req('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } })); }
      catch { save(null); return null; }
    }
    return session.access_token;
  }

  const rpc = (fn, args, auth) => req('/rest/v1/rpc/' + fn, { method: 'POST', body: args, auth });
  function split(url, prefix) {
    const u = new URL(url.replace(prefix, ''), 'http://x');
    return { path: u.pathname, q: Object.fromEntries(u.searchParams) };
  }
  const parseBody = b => (b == null ? {} : typeof b === 'string' ? JSON.parse(b) : b);

  async function publicApi(url, opts = {}) {
    const { path, q } = split(url, /^\/api\/public/);
    return rpc('public_api', { method: opts.method || 'GET', path, q, body: parseBody(opts.body) });
  }

  async function adminApi(url, opts = {}) {
    if (!session) throw fail('Tu sesión expiró. Ingresa nuevamente.', 401);
    const { path, q } = split(url, /^\/api\/admin/);
    const r = await rpc('admin_api', { method: opts.method || 'GET', path, q, body: parseBody(opts.body) }, true);
    if (r && Array.isArray(r._remove)) { removeFiles(r._remove); delete r._remove; }
    return r;
  }

  // ---- Imágenes: se optimizan en el navegador y se guardan en el almacenamiento seguro.
  async function toImage(file, maxW) {
    if (!/^image\//.test(file.type)) throw fail('Selecciona una imagen JPG, PNG o WebP.', 400);
    if (file.size > 15 * 1024 * 1024) throw fail('La imagen supera los 15 MB.', 400);
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { throw fail('No se pudo leer la imagen. Prueba con una foto JPG o PNG.', 400); }
    const scale = Math.min(1, maxW / bmp.width);
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * scale); cv.height = Math.round(bmp.height * scale);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = t => new Promise(r => cv.toBlob(r, t, 0.84));
    let out = await blob('image/webp');
    if (!out || out.type !== 'image/webp') out = await blob('image/jpeg');
    if (!out) throw fail('No se pudo procesar la imagen.', 400);
    return out;
  }
  async function upload(file, maxW = 1600) {
    const img = await toImage(file, maxW);
    const ext = img.type === 'image/webp' ? 'webp' : 'jpg';
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await req(`/storage/v1/object/media/${name}`, {
      method: 'POST', body: img, raw: true, auth: true,
      headers: { 'Content-Type': img.type, 'cache-control': '31536000', 'x-upsert': 'false' }
    });
    return `${C.url}/storage/v1/object/public/media/${name}`;
  }
  function removeFiles(urls) {
    const marker = '/storage/v1/object/public/media/';
    urls.filter(u => typeof u === 'string' && u.startsWith(C.url + marker)).forEach(u => {
      req('/storage/v1/object/media/' + u.split(marker)[1], { method: 'DELETE', auth: true }).catch(() => {});
    });
  }

  // ---- Acceso de la dueña
  async function login(email, password) {
    save(await req('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email.trim(), password } }));
  }
  async function signup(email, password) {
    const s = await req('/auth/v1/signup', { method: 'POST', body: { email: email.trim(), password } });
    if (!s.access_token) throw fail('Te enviamos un correo para confirmar la cuenta. Confírmalo y vuelve a esta página para terminar.', 400);
    save(s);
  }
  async function logout() {
    try { await req('/auth/v1/logout', { method: 'POST', auth: true }); } catch { void 0; }
    save(null);
  }
  async function changePassword(current, next) {
    if (!session?.user?.email) throw fail('Tu sesión expiró. Ingresa nuevamente.', 401);
    try { await login(session.user.email, current); } catch { throw fail('La contraseña actual no es correcta.', 400); }
    if (String(next).length < 8) throw fail('La nueva contraseña debe tener al menos 8 caracteres.', 400);
    await req('/auth/v1/user', { method: 'PUT', auth: true, body: { password: next } });
  }
  async function setPassword(next) {
    if (String(next).length < 8) throw fail('La nueva contraseña debe tener al menos 8 caracteres.', 400);
    await req('/auth/v1/user', { method: 'PUT', auth: true, body: { password: next } });
  }
  const recover = (email, redirectTo) => req('/auth/v1/recover?redirect_to=' + encodeURIComponent(redirectTo), { method: 'POST', body: { email: email.trim() } });
  // Enlace de recuperación de contraseña (#access_token=...&type=recovery)
  function consumeRecoveryLink() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (!h.get('access_token')) return null;
    save({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_in: Number(h.get('expires_in') || 3600), user: {} });
    history.replaceState(null, '', location.pathname);
    return h.get('type') || 'login';
  }
  const setupStatus = () => rpc('admin_setup_status', {}, true);
  const claim = code => rpc('claim_admin', { setup_code: code }, true);
  const email = () => session?.user?.email || '';

  return { asset, publicApi, adminApi, upload, login, signup, logout, changePassword, setPassword, recover,
    consumeRecoveryLink, setupStatus, claim, email, hasSession: () => !!session, configured: !!(C.url && C.anonKey) };
})();
