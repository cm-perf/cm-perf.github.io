(() => {
  const config = window.CMP_ORDER_CONFIG || {};
  const $ = id => document.getElementById(id);
  const stored = (name, selectedPlatform = platform) => `cm-order-${selectedPlatform}-${name}`;
  const status = (id, message, error = false) => { const el = $(id); el.textContent = message; el.className = `status ${error ? 'error' : 'ok'}`; };
  let platform = '', challenge = '', turnstileId, uploading = false;
  async function api(path, options = {}) {
    const response = await fetch(config.api + path, {credentials:'include', ...options});
    const body = await response.json();
    if (!response.ok) { const error = new Error(body.error || 'Request failed'); error.status = response.status; throw error; }
    return body;
  }
  function choose(next) {
    if (uploading) return;
    platform = next;
    document.querySelectorAll('[data-platform]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.platform === next)));
    $('order-main').classList.toggle('picker-only', !next);
    $('platform-choices').hidden = !!next;
    $('change-platform').hidden = !next;
    $('order-heading').textContent = next === 'bootmod3' ? 'Request through Bootmod3' : next === 'mhd' ? 'MHD request' : next === 'bench' ? 'ECU file request' : 'Choose your tuning platform.';
    $('order-stage').textContent = next ? 'BMW 2-STEP / ' + (next === 'bootmod3' ? 'BOOTMOD3' : next === 'mhd' ? 'MHD' : 'ECU READ / BENCH') : 'BMW 2-STEP / START YOUR REQUEST';
    $('order-intro').textContent = next === 'bootmod3' ? 'Your next launch starts in the app.' : next ? 'Your car. Your setup. Tell us what you have in mind.' : 'We’ll show you the right way to send your 2-step request.';
    $('bootmod-panel').hidden = next !== 'bootmod3';
    $('verify-panel').hidden = next === 'bootmod3' || !next;
    $('order-form').hidden = true;
    $('mhd-files').hidden = next !== 'mhd'; $('bench-files').hidden = next !== 'bench';
    history.replaceState(null, '', next ? `?platform=${next}` : location.pathname);
    if (next && next !== 'bootmod3') restoreSession();
  }
  async function restoreSession() {
    const selected = platform;
    try { const data = await api('/v1/session'); if (data.verified && selected === platform) showForm(data.email); }
    catch { /* A fresh verification is available below. */ }
  }
  function showForm(email) {
    const prior = sessionStorage.getItem('cm-order-verified-email');
    if (prior && prior !== email) for (const option of ['mhd', 'bench']) {
      sessionStorage.removeItem(stored('key', option));
      sessionStorage.removeItem(stored('reference', option));
    }
    sessionStorage.setItem('cm-order-verified-email', email);
    $('verified-email').textContent = email;
    $('verify-panel').hidden = true;
    $('order-form').hidden = false;
    const saved = sessionStorage.getItem(stored('reference'));
    $('submit-order').hidden = !!saved;
    $('new-order').hidden = !saved;
    status('order-status', saved ? `Submitted. Your reference is ${saved}. We’ll email you when we receive it.` : '');
  }
  function setUploading(active) {
    uploading = active;
    for (const id of ['submit-order', 'change-platform', 'change-email', 'new-order']) $(id).disabled = active;
    document.querySelectorAll('[data-platform]').forEach(button => { button.disabled = active; });
  }
  function syncFormState() {
    const buttons = $('trigger').value === 'm-buttons';
    $('m-buttons').hidden = !buttons; $('single-rpm').hidden = buttons;
    $('rpm').required = !buttons; $('m1-rpm').required = buttons; $('m2-rpm').required = buttons;
    $('rpm').disabled = buttons; $('m1-rpm').disabled = !buttons; $('m2-rpm').disabled = !buttons;
    $('price').textContent = $('remap').checked ? 'from $300' : 'from $200';
  }
  function ensureTurnstile() {
    if (!config.turnstileSiteKey) { status('verify-status', 'Email verification is being set up. Please check back shortly.', true); return false; }
    if (!window.turnstile) { status('verify-status', 'Verification is loading. Try again in a moment.', true); return false; }
    if (turnstileId === undefined) turnstileId = turnstile.render('#turnstile', {sitekey:config.turnstileSiteKey});
    return true;
  }
  document.querySelectorAll('[data-platform]').forEach(button => button.addEventListener('click', () => choose(button.dataset.platform)));
  $('change-platform').addEventListener('click', () => choose(''));
  $('send-code').addEventListener('click', async () => {
    if (!ensureTurnstile()) return;
    const email = $('email').value.trim(); if (!$('email').checkValidity()) { $('email').reportValidity(); return; }
    const token = turnstile.getResponse(turnstileId); if (!token) { status('verify-status', 'Complete the verification check.', true); return; }
    $('send-code').disabled = true;
    try { const data = await api('/v1/email/start', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({email, turnstile:token})}); challenge = data.challenge; $('code-fields').hidden = false; status('verify-status', 'Check your email for the 8-digit code.'); $('code').focus(); }
    catch (error) { status('verify-status', error.message, true); }
    finally { $('send-code').disabled = false; turnstile.reset(turnstileId); }
  });
  $('verify-code').addEventListener('click', async () => {
    const code = $('code').value.trim(); if (!/^\d{8}$/.test(code)) { status('verify-status','Enter the 8-digit code.',true); return; }
    $('verify-code').disabled = true;
    try { const data = await api('/v1/email/verify', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({challenge,code})}); showForm(data.email); }
    catch (error) { status('verify-status',error.message,true); }
    finally { $('verify-code').disabled = false; }
  });
  $('change-email').addEventListener('click', async () => { await api('/v1/email/logout',{method:'POST'}); $('order-form').hidden = true; $('verify-panel').hidden = false; $('code-fields').hidden = true; challenge = ''; });
  $('new-order').addEventListener('click', () => {sessionStorage.removeItem(stored('key'));sessionStorage.removeItem(stored('reference'));$('order-form').reset();syncFormState();$('submit-order').hidden=false;$('new-order').hidden=true;status('order-status','');});
  $('trigger').addEventListener('change', syncFormState);
  $('remap').addEventListener('change', syncFormState);
  $('order-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (uploading) return;
    const selectedPlatform = platform;
    const keyStorage = stored('key', selectedPlatform);
    const referenceStorage = stored('reference', selectedPlatform);
    const files = platform === 'mhd' ? [$('stock').files[0], $('flashoptions').files[0]] : [$('raw').files[0]];
    if (files.some(f => !f)) { status('order-status', 'Choose the required file or files.', true); return; }
    if (files.reduce((n,f) => n+f.size,0) > 10_000_000 || files.some(f => !f.size)) { status('order-status','Files together must be nonempty and 10 MB or less.',true); return; }
    if (platform === 'mhd' && files[1].size > 1_000_000) { status('order-status','The flashoptions file must be 1 MB or less.',true); return; }
    const details = {name:$('name').value.trim(), vin:$('vin').value.trim().toUpperCase(), vehicle:$('vehicle').value.trim(), engine:$('engine').value, platform, rpm:Number($('rpm').value), trigger:$('trigger').value, m1Rpm:$('m1-rpm').value, m2Rpm:$('m2-rpm').value, remap:$('remap').checked, note:$('note').value.trim()};
    const form = new FormData(); form.set('details',JSON.stringify(details));
    if (platform === 'mhd') { form.set('stock',files[0]); form.set('flashoptions',files[1]); } else form.set('raw',files[0]);
    let key = sessionStorage.getItem(keyStorage); if (!key) { key = [...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join(''); sessionStorage.setItem(keyStorage,key); }
    setUploading(true);
    status('order-status','Uploading your files…');
    try {
      const result = await api('/v1/order',{method:'POST',headers:{'x-order-key':key},body:form});
      sessionStorage.setItem(referenceStorage, result.reference);
      status('order-status',`Submitted. Your reference is ${result.reference}. We’ll email you when we receive it.`);
      $('submit-order').hidden = true;
      $('new-order').hidden = false;
    } catch (error) {
      if (error.status === 401) {
        $('order-form').hidden = true;
        $('verify-panel').hidden = false;
        $('code-fields').hidden = true;
        challenge = '';
        $('email').value = $('verified-email').textContent;
        status('verify-status','Your verification expired. Verify your email again to continue.',true);
      } else if (error.status === 409) {
        sessionStorage.removeItem(keyStorage);
        status('order-status','The upload was interrupted or the files changed. Check your selections, then press Submit request again.',true);
      } else status('order-status',error.message,true);
    } finally {
      setUploading(false);
    }
  });
  const initial = new URLSearchParams(location.search).get('platform'); choose(['bootmod3','mhd','bench'].includes(initial) ? initial : '');
  syncFormState();
})();
