(() => {
  let receiptRequest = 0;
  const config = window.CMP_ORDER_CONFIG || {};
  const $ = id => document.getElementById(id);
  const stored = (name, selectedPlatform = platform) => `cm-order-${selectedPlatform}-${name}`;
  const receiptPrefix = 'cmperf:sent-request:v1:';
  const engines = ['N-series', 'B-series', 'S-series', 'N20', 'N26', 'N55', 'N63', 'S55', 'B48', 'B58', 'B58 Gen 2'];
  const validReference = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
  const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const cleanVehicle = value => String(value || '').replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi, '[VIN removed]').replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0,160) || 'Vehicle not specified';
  const validReceipt = record => record && record.version === 1 && validReference(record.reference) && validEmail(record.email) && record.email === record.email.toLowerCase() && typeof record.vehicle === 'string' && record.vehicle.length <= 160 && engines.includes(record.engine) && ['mhd','bench'].includes(record.platform) && Number.isSafeInteger(record.submittedAt) && record.submittedAt > 0 && record.submittedAt <= Date.now() + 86_400_000;
  const status = (id, message, error = false, neutral = false) => { const el = $(id); el.textContent = message; el.className = `status ${error ? 'error' : neutral ? '' : 'ok'}`; };
  let platform = '', challenge = '', turnstileId, uploading = false, switchingEmail = false, historyView = false, verifiedHistoryEmail = '', historyCheck = 0;
  function saveReceipt(reference, email, details) {
    const record = {version:1, reference, email:email.toLowerCase(), vehicle:cleanVehicle(details.vehicle), engine:details.engine, platform:details.platform, submittedAt:Date.now()};
    if (!validReceipt(record)) return false;
    try { localStorage.setItem(receiptPrefix + reference, JSON.stringify(record)); return true; }
    catch { return false; }
  }
  function savedReceipts(email) {
    const records = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(receiptPrefix)) continue;
      try {
        const record = JSON.parse(localStorage.getItem(key));
        if (validReceipt(record) && key === receiptPrefix + record.reference && record.email === email) records.push(record);
      } catch { /* Ignore corrupt records. */ }
    }
    return records.sort((a,b) => b.submittedAt - a.submittedAt || a.reference.localeCompare(b.reference));
  }

  async function api(path, options = {}) {
    const response = await fetch(config.api + path, {credentials:'include', ...options});
    const body = await response.json();
    if (!response.ok) { const error = new Error(body.error || 'Request failed'); error.status = response.status; throw error; }
    return body;
  }
  function choose(next) {
    if (uploading || switchingEmail) return;
    historyCheck++; historyView = false; verifiedHistoryEmail = '';
    platform = next;
    document.querySelectorAll('[data-platform]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.platform === next)));
    $('order-main').classList.toggle('picker-only', !next);
    $('platform-choices').hidden = !!next;
    $('change-platform').hidden = !next;
    $('change-platform').textContent = '← Change platform';
    $('verify-stage').textContent = '01 / EMAIL · 02 / YOUR CAR & FILES';
    $('verify-heading').textContent = 'First, let’s connect.';
    $('verify-intro').textContent = 'Verify your email, then tell us about your car and upload your files.';
    $('order-heading').textContent = next === 'bootmod3' ? 'Request through Bootmod3' : next === 'mhd' ? 'MHD request' : next === 'bench' ? 'ECU tool file request' : 'Choose your tuning platform.';
    $('order-stage').textContent = next ? 'BMW 2-STEP / ' + (next === 'bootmod3' ? 'BOOTMOD3' : next === 'mhd' ? 'MHD' : 'ECU TOOLS / OBD · BENCH · BOOT') : 'BMW 2-STEP / START YOUR REQUEST';
    $('order-intro').textContent = next === 'bootmod3' ? 'Your next launch starts in the app.' : next ? 'Your car. Your setup. Tell us what you have in mind.' : 'We’ll show you the right way to send your 2-step request.';
    $('bootmod-panel').hidden = next !== 'bootmod3';
    $('verify-panel').hidden = next === 'bootmod3' || !next;
    $('order-form').hidden = true;
    $('success-panel').hidden = true;
    $('sent-panel').hidden = true;
    $('mhd-files').hidden = next !== 'mhd'; $('bench-files').hidden = next !== 'bench';
    $('note').placeholder = next === 'bench' ? 'Tool (e.g. KESS3 Master), ECU/DME, OBD/bench/boot, fuel and hardware' : 'Fuel, hardware or your current tune';
    history.replaceState(null, '', next ? `?platform=${next}` : location.pathname);
    if (next && next !== 'bootmod3') restoreSession();
  }
  async function restoreSession() {
    const selected = platform;
    try { const data = await api('/v1/session'); if (data.verified && selected === platform && !historyView) showForm(data.email); }
    catch { /* A fresh verification is available below. */ }
  }
  async function openHistory() {
    if (uploading || switchingEmail) return;
    const check = ++historyCheck;
    historyView = true; verifiedHistoryEmail = ''; platform = '';
    $('sent-list').replaceChildren(); status('sent-status', '');
    document.querySelectorAll('[data-platform]').forEach(button => button.setAttribute('aria-pressed', 'false'));
    $('order-main').classList.remove('picker-only');
    $('platform-choices').hidden = true; $('bootmod-panel').hidden = true;
    $('order-form').hidden = true; $('success-panel').hidden = true; $('sent-panel').hidden = true;
    $('verify-panel').hidden = true; $('change-platform').hidden = false;
    $('change-platform').textContent = '← Start a request';
    $('order-heading').textContent = 'Your sent requests.';
    $('order-stage').textContent = 'BMW 2-STEP / SENT REQUESTS';
    $('order-intro').textContent = 'Find references you saved on this device.';
    $('verify-stage').textContent = 'EMAIL VERIFICATION';
    $('verify-heading').textContent = 'Unlock sent requests.';
    $('verify-intro').textContent = 'Verify your email to see requests saved in this browser for that address.';
    window.history.replaceState(null, '', '?view=sent');
    try {
      const data = await api('/v1/session');
      if (check !== historyCheck || !historyView) return;
      if (data.verified && validEmail(data.email)) showHistory(data.email);
      else $('verify-panel').hidden = false;
    } catch { if (check === historyCheck && historyView) $('verify-panel').hidden = false; }
  }
  function showHistory(email, focus = false) {
    if (!validEmail(email)) return;
    verifiedHistoryEmail = email.toLowerCase();
    $('verify-panel').hidden = true; $('sent-panel').hidden = false;
    $('sent-email').textContent = email;
    renderHistory();
    if (focus) $('sent-heading').focus();
  }
  function renderHistory() {
    if (!historyView || !verifiedHistoryEmail) return;
    const list = $('sent-list'); list.replaceChildren();
    let records;
    try { records = savedReceipts(verifiedHistoryEmail); }
    catch { status('sent-status', 'This browser cannot read saved requests. Use your copied reference or contact us.', true); return; }
    status('sent-status', records.length ? '' : 'No sent requests are saved in this browser for this email.', false, true);
    for (const record of records) {
      const item = document.createElement('article'); item.className = 'sent-item';
      const title = document.createElement('div'); title.className = 'sent-item-title'; title.textContent = record.vehicle;
      const meta = document.createElement('p'); meta.className = 'sent-item-meta';
      meta.textContent = `${record.engine} · ${record.platform === 'mhd' ? 'MHD' : 'ECU tools'} · ${new Date(record.submittedAt).toLocaleDateString()}`;
      const code = document.createElement('code'); code.textContent = record.reference;
      const actions = document.createElement('div'); actions.className = 'actions';
      const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'secondary'; copy.textContent = 'Copy reference';
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'secondary'; remove.textContent = 'Remove from this browser';
      const message = document.createElement('p'); message.className = 'status'; message.setAttribute('role', 'status');
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(record.reference); message.textContent = 'Reference copied.'; message.classList.add('ok'); }
        catch { message.textContent = 'Select the reference above to copy it.'; message.classList.add('error'); }
      });
      remove.addEventListener('click', () => {
        if (!window.confirm('Remove this reference from this browser? The request itself will remain submitted.')) return;
        try { localStorage.removeItem(receiptPrefix + record.reference); renderHistory(); }
        catch { message.textContent = 'Could not remove this saved reference.'; message.classList.add('error'); }
      });
      const open = document.createElement('button'); open.type = 'button'; open.className = 'secondary'; open.textContent = 'Open request';
      open.addEventListener('click', () => {
        sessionStorage.setItem(stored('reference',record.platform),record.reference);
        choose(record.platform);
      });
      actions.append(copy, remove, open); item.append(title, meta, code, actions, message); list.append(item);
    }
  }
  function showForm(email, focus = false) {
    const prior = sessionStorage.getItem('cm-order-verified-email');
    if (prior && prior !== email) for (const option of ['mhd', 'bench']) {
      sessionStorage.removeItem(stored('key', option));
      sessionStorage.removeItem(stored('reference', option));
    }
    sessionStorage.setItem('cm-order-verified-email', email);
    $('verified-email').textContent = email;
    $('verify-panel').hidden = true;
    const saved = sessionStorage.getItem(stored('reference'));
    if (saved) showReceipt(saved, email, focus);
    else { $('success-panel').hidden = true; $('order-form').hidden = false; status('order-status', ''); if (focus) $('name').focus(); }
  }
  function showReceipt(reference, email, focus = false, nextStep = null) {
    const request = ++receiptRequest;
    $('success-reference').textContent = reference;
    $('success-whatsapp').href = 'https://wa.me/233245858875?text=' + encodeURIComponent(`Hi, I’ve submitted request ${reference}. Please confirm my price and payment details.`);
    $('success-email').textContent = email;
    $('copy-status').hidden = true;
    $('copy-status').textContent = '';
    const action = $('success-whatsapp');
    $('retry-next-step').hidden = true;
    $('retry-next-step').textContent = 'Try again';
    $('success-summary').hidden = true;
    $('success-checkout-note').hidden = true;
    $('retry-next-step').onclick = () => showReceipt(reference,email);
    const render = step => {
      if (request !== receiptRequest || $('success-reference').textContent !== reference) return;
      if (step.kind === 'paid' || step.kind === 'processing') {
        $('success-heading').textContent = step.kind === 'paid' ? 'Payment received!' : 'Payment processing.';
        $('success-next').textContent = step.kind === 'paid' ? 'Your map will be ready within 4 hours. We’ll email you when it’s ready.' : 'Your files are saved. We’re waiting for payment confirmation.';
        action.hidden = true;
        if (step.kind === 'processing') { $('retry-next-step').textContent = 'Check payment status'; $('retry-next-step').hidden = false; }
        return;
      }
      $('success-heading').textContent = step.kind === 'payment' ? 'Finish your order.' : 'Let’s confirm your setup.';
      $('success-summary').hidden = step.kind !== 'payment';
      $('success-checkout-note').hidden = step.kind !== 'payment';
      $('success-next').textContent = step.kind === 'payment' ? 'Complete payment and we’ll get your build started.' : 'Your files are saved. Message us on WhatsApp to confirm your setup and payment details.';
      action.textContent = step.kind === 'payment' ? 'Continue to payment' : 'Continue on WhatsApp';
      if (step.kind === 'payment') {
        const url = new URL(step.url);
        if (url.origin !== 'https://checkout.stripe.com' || !url.pathname.startsWith('/c/pay/')) throw new Error('Invalid payment link');
        action.href = url.href;
      }
      else {
        const phone = step.whatsappNumber === '233248318611' ? step.whatsappNumber : '233245858875';
        action.href = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(`Hi, I’ve submitted request ${reference}. Please confirm my setup and payment details.`);
      }
      action.hidden = false;
    };
    if (nextStep) render(nextStep);
    else {
      action.hidden = true; $('success-next').textContent = 'Loading your next step…';
      api('/v1/order/' + reference).then(data => render(data.nextStep || {kind:'review'})).catch(() => {
        if (request === receiptRequest && $('success-reference').textContent === reference) {
          $('success-next').textContent = 'Your files are saved. Could not load the next step.';
          $('retry-next-step').hidden = false;
        }
      });
    }
    $('order-form').hidden = true;
    $('success-panel').hidden = false;
    if (focus) {
      $('success-heading').focus({preventScroll:true});
      requestAnimationFrame(() => window.scrollTo({top:0, behavior:'instant'}));
    }
  }
  function setUploading(active) {
    uploading = active;
    $('order-fields').disabled = active;
    $('order-form').setAttribute('aria-busy', String(active));
    $('submit-order').setAttribute('aria-busy', String(active));
    $('submit-label').textContent = active ? 'Sending request…' : 'Submit request';
    for (const id of ['submit-order', 'change-platform', 'change-email', 'new-order']) $(id).disabled = active;
    $('sent-link').setAttribute('aria-disabled', String(active)); $('view-sent').disabled = active;
    document.querySelectorAll('[data-platform]').forEach(button => { button.disabled = active; });
  }
  function syncFormState() {
    const buttons = $('trigger').value === 'm-buttons';
    $('m-buttons').hidden = !buttons; $('single-rpm').hidden = buttons;
    $('rpm').required = !buttons; $('m1-rpm').required = buttons; $('m2-rpm').required = buttons;
    $('rpm').disabled = buttons; $('m1-rpm').disabled = !buttons; $('m2-rpm').disabled = !buttons;
  }
  let checkTimer, sendingCode = false;
  function checkState(message, ready = false, failed = false) {
    $('send-code').disabled = !ready || sendingCode;
    status('check-status', message, failed);
    $('retry-check').hidden = !failed;
  }
  function checkFailed() {
    clearTimeout(checkTimer);
    checkState('Verification could not load. Retry, or allow challenges.cloudflare.com in your browser’s content blocker.', false, true);
    return true;
  }
  function ensureTurnstile() {
    if ($('verify-panel').hidden) return false;
    if (!config.turnstileSiteKey) { checkFailed(); return false; }
    if (typeof window.turnstile?.render !== 'function') {
      checkState('Loading verification…');
      if (!checkTimer) checkTimer = setTimeout(checkFailed, 12000);
      return false;
    }
    clearTimeout(checkTimer); checkTimer = null;
    if (turnstileId === undefined) {
      checkState('Verification is loading…');
      try {
        turnstileId = turnstile.render('#turnstile', {
          sitekey:config.turnstileSiteKey, size:'flexible', appearance:'always',
          callback:() => { clearTimeout(checkTimer); checkState('Verification complete.', true); },
          'error-callback':checkFailed,
          'expired-callback':() => { checkState('Verification expired. Checking again…'); turnstile.reset(turnstileId); },
          'timeout-callback':() => checkState('Verification timed out. Please retry.', false, true),
          'before-interactive-callback':() => checkState('Complete the verification check below.'),
        });
      } catch { checkFailed(); return false; }
    }
    return true;
  }
  window.cmOrderTurnstileReady = ensureTurnstile;
  let checkScript = $('turnstile-script');
  checkScript.addEventListener('load', ensureTurnstile);
  checkScript.addEventListener('error', checkFailed);
  new MutationObserver(() => { if (!$('verify-panel').hidden) ensureTurnstile(); })
    .observe($('verify-panel'), {attributes:true, attributeFilter:['hidden']});
  $('retry-check').addEventListener('click', () => {
    checkState('Loading verification…');
    if (typeof window.turnstile?.render === 'function' && turnstileId !== undefined) turnstile.reset(turnstileId);
    else if (typeof window.turnstile?.render === 'function') ensureTurnstile();
    else {
      checkScript.remove();
      const script = document.createElement('script');
      script.src = checkScript.src; script.id = 'turnstile-script'; script.async = true;
      checkScript = script;
      script.addEventListener('load', ensureTurnstile); script.addEventListener('error', checkFailed);
      document.head.append(script); clearTimeout(checkTimer); checkTimer = null; ensureTurnstile();
    }
  });
  document.querySelectorAll('[data-platform]').forEach(button => button.addEventListener('click', () => choose(button.dataset.platform)));
  $('change-platform').addEventListener('click', () => choose(''));
  $('sent-link').addEventListener('click', event => { event.preventDefault(); openHistory(); });
  $('view-sent').addEventListener('click', openHistory);
  $('sent-start').addEventListener('click', () => choose(''));
  $('sent-change-email').addEventListener('click', async () => {
    if (switchingEmail) return;
    switchingEmail = true;
    historyCheck++; verifiedHistoryEmail = '';
    $('sent-list').replaceChildren(); $('sent-panel').hidden = true;
    $('sent-change-email').disabled = true; $('sent-start').disabled = true; $('change-platform').disabled = true;
    $('sent-link').setAttribute('aria-disabled', 'true');
    try {
      await api('/v1/email/logout', {method:'POST'});
      $('verify-panel').hidden = false; $('code-fields').hidden = true; $('email').value = ''; challenge = ''; status('verify-status', '');
    } catch {
      $('verify-panel').hidden = false; $('code-fields').hidden = true; challenge = '';
      status('verify-status', 'Could not switch email. Verify your email to continue.', true);
    } finally {
      switchingEmail = false;
      $('sent-change-email').disabled = false; $('sent-start').disabled = false; $('change-platform').disabled = false;
      $('sent-link').setAttribute('aria-disabled', 'false');
    }
  });
  window.addEventListener('storage', event => { if (event.key && event.key.startsWith(receiptPrefix)) renderHistory(); });
  $('send-code').addEventListener('click', async () => {
    if (!ensureTurnstile()) return;
    const email = $('email').value.trim(); if (!$('email').checkValidity()) { $('email').reportValidity(); return; }
    const token = turnstile.getResponse(turnstileId); if (!token) { status('verify-status', 'Complete the verification check.', true); return; }
    sendingCode = true; $('send-code').disabled = true;
    try { const data = await api('/v1/email/start', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({email, turnstile:token})}); challenge = data.challenge; $('code-fields').hidden = false; status('verify-status', 'Check your email for the 8-digit code.'); $('code').focus(); }
    catch (error) { status('verify-status', error.message, true); }
    finally { sendingCode = false; checkState('Checking verification…'); turnstile.reset(turnstileId); }
  });
  $('verify-code').addEventListener('click', async () => {
    const code = $('code').value.trim(); if (!/^\d{8}$/.test(code)) { status('verify-status','Enter the 8-digit code.',true); return; }
    $('verify-code').disabled = true;
    try { const data = await api('/v1/email/verify', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({challenge,code})}); if (historyView) showHistory(data.email, true); else showForm(data.email, true); }
    catch (error) { status('verify-status',error.message,true); }
    finally { $('verify-code').disabled = false; }
  });
  $('change-email').addEventListener('click', async () => { await api('/v1/email/logout',{method:'POST'}); $('order-form').hidden = true; $('verify-panel').hidden = false; $('code-fields').hidden = true; challenge = ''; });
  $('new-order').addEventListener('click', () => {sessionStorage.removeItem(stored('key'));sessionStorage.removeItem(stored('reference'));$('order-form').reset();syncFormState();$('success-panel').hidden=true;$('order-form').hidden=false;status('order-status','');$('name').focus();});
  $('copy-reference').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('success-reference').textContent); status('copy-status', 'Reference copied.'); }
    catch { status('copy-status', 'Select the reference above to copy it.', true); }
    $('copy-status').hidden = false;
  });
  $('trigger').addEventListener('change', syncFormState);
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
    const whatsapp = $('whatsapp').value.replace(/[ ()-]/g, '');
    if (!/^\+?[1-9][0-9]{6,14}$/.test(whatsapp)) { status('order-status', 'Enter your WhatsApp number with country code, e.g. +233245858875.', true); $('whatsapp').focus(); return; }
    const details = {whatsapp: '+' + whatsapp.replace(/^\+/, ''), name:$('name').value.trim(), vin:$('vin').value.trim().toUpperCase(), vehicle:$('vehicle').value.trim(), engine:$('engine').value, platform, rpm:Number($('rpm').value), trigger:$('trigger').value, m1Rpm:$('m1-rpm').value, m2Rpm:$('m2-rpm').value, transmission:document.querySelector('input[name=transmission]:checked')?.value, note:$('note').value.trim()};
    const form = new FormData(); form.set('details',JSON.stringify(details));
    if (platform === 'mhd') { form.set('stock',files[0]); form.set('flashoptions',files[1]); } else form.set('raw',files[0]);
    let key = sessionStorage.getItem(keyStorage); if (!key) { key = [...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join(''); sessionStorage.setItem(keyStorage,key); }
    setUploading(true);
    status('order-status','Uploading your files. Keep this page open.', false, true);
    try {
      const result = await api('/v1/order',{method:'POST',headers:{'x-order-key':key},body:form});
      sessionStorage.setItem(referenceStorage, result.reference);
      saveReceipt(result.reference, $('verified-email').textContent, details);
      showReceipt(result.reference, $('verified-email').textContent, true, result.nextStep);
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
  const params = new URLSearchParams(location.search);
  const initial = params.get('platform');
  const returnReference = params.get('reference');
  if (['mhd','bench'].includes(initial) && /^[a-f0-9]{32}$/.test(returnReference || '')) sessionStorage.setItem(stored('reference',initial),returnReference);
  if (params.get('view') === 'sent') openHistory(); else choose(['bootmod3','mhd','bench'].includes(initial) ? initial : '');
  syncFormState();
})();
