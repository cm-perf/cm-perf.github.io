"""Browser regressions for intake; all API requests use local fake responses.

Run: python tests/test_order_form.py (requires Chromium on PATH).
"""
import html
import os
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(os.environ.get('WEBSITE_TEST_ROOT', Path(__file__).resolve().parents[1])).resolve()

MOCK_API = """
window.CMP_ORDER_CONFIG = {api: 'https://mock.invalid', turnstileSiteKey: 'test'};
window.turnstile = {render: () => 1, getResponse: () => 'test-token', reset: () => {}};
window.fetch = async (url, options) => {
  if (url.endsWith('/v1/order')) {
    window.uploadCount = (window.uploadCount || 0) + 1;
    window.lastDetails = JSON.parse(options.body.get('details'));
    return await new Promise(resolve => {
      window.finishUpload = (status = 200) => resolve({
        ok: status === 200, status,
        json: async () => status === 200 ? {reference: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'} : {error: 'Test failure'}
      });
    });
  }
  if (url.endsWith('/v1/session')) {
    window.sessionCount = (window.sessionCount || 0) + 1;
    const email = sessionStorage.getItem('mock-email') || 'review@example.invalid';
    if (window.delaySession) return await new Promise(resolve => {window.finishSession = () => resolve({ok:true, json:async()=>({verified: true, email})});});
    return {ok: true, json: async () => ({verified: email !== 'none', email})};
  }
  if (url.endsWith('/v1/email/logout')) {
    if (window.delayLogout) return await new Promise(resolve => {window.finishLogout = () => resolve({ok:true, json:async()=>({})});});
    return {ok:true, json:async()=>({})};
  }
  if (url.endsWith('/v1/email/start')) {
    return {ok: true, json: async () => ({challenge: 'test-challenge'})};
  }
  if (url.endsWith('/v1/email/verify')) {
    return {ok: true, json: async () => ({email: 'review@example.invalid'})};
  }
  throw new Error('Unexpected request: ' + url);
};
"""

BROWSER_TEST = """
(async () => {
  const $ = id => document.getElementById(id);
  const wait = () => new Promise(resolve => setTimeout(resolve, 20));
  const results = [];
  const check = (name, pass) => results.push({name, pass: !!pass});
  const choose = name => document.querySelector(`[data-platform="${name}"]`).click();
  const reference = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  if (sessionStorage.getItem('mock-reload')) {
    await wait();
    const earlier = JSON.parse(sessionStorage.getItem('mock-results'));
    results.push(...earlier);
    check('saved request survives page refresh', !$('sent-panel').hidden && $('sent-list').textContent.includes(reference) && $('sent-email').textContent === 'review@example.invalid');
    window.delayLogout = true; window.delaySession = true;
    const sessionsBeforeLogout = window.sessionCount;
    $('sent-change-email').click(); await wait(); $('sent-link').click(); await wait();
    check('switching email blocks overlapping history session checks', window.sessionCount === sessionsBeforeLogout && $('sent-panel').hidden);
    window.finishLogout(); await wait();
    check('logout clears prior email receipts from the page', !$('verify-panel').hidden && $('sent-panel').hidden && !$('sent-list').textContent.includes(reference));
    window.delayLogout = false; window.delaySession = false;
    $('sent-link').click(); await wait();
    check('verified email can reopen its local receipts', !$('sent-panel').hidden && $('sent-list').textContent.includes(reference));
    window.confirm = () => true;
    [...$('sent-list').querySelectorAll('article')].find(item => item.textContent.includes(reference)).querySelectorAll('button')[1].click();
    check('request can be removed from this browser', !$('sent-list').textContent.includes(reference) && !$('sent-panel').hidden);
    sessionStorage.removeItem('mock-reload'); sessionStorage.removeItem('mock-results');
    const output = document.createElement('pre'); output.id = 'test-results';
    output.textContent = JSON.stringify(results); document.body.append(output);
    return;
  }
  choose('mhd'); await wait();
  $('name').value = 'Review'; $('vin').value = 'WBA12345678901234';
  $('vehicle').value = '2015 428i'; $('engine').value = 'B48';
  $('rpm').value = '1500'; $('trigger').value = 'm-buttons';
  $('trigger').dispatchEvent(new Event('change'));
  $('m1-rpm').value = '4000'; $('m2-rpm').value = '4500';
  check('hidden single RPM cannot invalidate M1/M2 submission', $('order-form').checkValidity());
  $('m1-rpm').value = '1500'; $('trigger').value = 'brake-pedal';
  $('trigger').dispatchEvent(new Event('change')); $('rpm').value = '4500';
  check('hidden M1/M2 values cannot invalidate brake submission', $('order-form').checkValidity());
  $('rpm').value = '1500';
  check('active invalid RPM still blocks submission', !$('order-form').checkValidity());
  $('rpm').value = '4500'; $('m1-rpm').value = '4000';
  for (const [id, name] of [['stock', 'stock.bin'], ['flashoptions', 'stock_flashoptions.xml']]) {
    const transfer = new DataTransfer(); transfer.items.add(new File(['test'], name));
    $(id).files = transfer.files;
  }
  $('order-form').requestSubmit(); await wait();
  check('valid request starts upload', window.uploadCount === 1);
  check('editable controls lock during upload', $('order-fields').disabled && [...$('order-fields').querySelectorAll('input,select,textarea')].every(el => el.matches(':disabled')));
  check('submit button shows loading and form is busy', $('submit-order').disabled && $('submit-label').textContent.includes('Sending') && $('order-form').getAttribute('aria-busy') === 'true');
  check('upload guidance is visible', $('order-status').textContent.includes('Keep this page open'));
  $('order-form').requestSubmit(); await wait();
  check('second submit does not upload again', window.uploadCount === 1);
  $('change-platform').click(); choose('bench'); await wait();
  check('platform cannot change during upload', $('order-heading').textContent === 'MHD request');
  check('email cannot change during upload', $('change-email').disabled);
  window.finishUpload(); await wait();
  check('confirmation stored for original platform', sessionStorage.getItem('cm-order-mhd-reference') === reference);
  check('receipt replaces editable form and shows reference', $('order-form').hidden && !$('success-panel').hidden && $('success-reference').textContent === reference);
  const saved = JSON.parse(localStorage.getItem('cmperf:sent-request:v1:' + reference));
  check('browser receipt saves only needed summary fields', saved && saved.reference === reference && saved.email === 'review@example.invalid' && saved.vehicle === '2015 428i' && saved.engine === 'B48' && saved.platform === 'mhd' && !('vin' in saved) && !('name' in saved) && !('note' in saved) && !('files' in saved));
  check('receipt shows verified email and next step', $('success-email').textContent === 'review@example.invalid' && $('success-panel').textContent.includes('review your files'));
  check('other platform has no false confirmation', !sessionStorage.getItem('cm-order-bench-reference'));
  check('controls restored after upload', !$('change-platform').disabled && !$('order-fields').disabled && $('submit-label').textContent === 'Submit request');
  $('change-platform').click(); choose('bench'); await wait();
  check('other platform allows submission', !$('order-form').hidden && !$('submit-order').disabled);
  check('other platform does not show stale success', $('success-panel').hidden && $('order-status').textContent === '');
  $('change-platform').click(); choose('mhd'); await wait();
  check('original receipt restored on return', !$('success-panel').hidden && $('order-form').hidden && $('success-reference').textContent === reference);
  $('new-order').click(); await wait();
  check('new request resets form and confirmation', !$('order-form').hidden && $('success-panel').hidden && !sessionStorage.getItem('cm-order-mhd-reference') && !$('stock').files.length);
  $('name').value = 'Review'; $('vin').value = 'WBA12345678901234';
  $('vehicle').value = '2015 428i'; $('engine').value = 'N20'; $('rpm').value = '4500';
  for (const [id, name] of [['stock', 'stock.bin'], ['flashoptions', 'stock_flashoptions.xml']]) {
    const transfer = new DataTransfer(); transfer.items.add(new File(['test'], name));
    $(id).files = transfer.files;
  }
  $('order-form').requestSubmit(); await wait(); window.finishUpload(409); await wait();
  check('conflict clears retry key', !sessionStorage.getItem('cm-order-mhd-key'));
  check('conflict permits retry and navigation', !$('order-fields').disabled && !$('submit-order').disabled && !$('change-platform').disabled && $('order-status').textContent.includes('interrupted'));
  check('failed upload retains entered fields and files', $('name').value === 'Review' && $('stock').files.length === 1);
  check('conditional RPM validation survives failure', $('m1-rpm').matches(':disabled') && $('order-form').checkValidity());
  $('order-form').requestSubmit(); await wait(); window.finishUpload(401); await wait();
  check('expired session offers verification and restores navigation', !$('verify-panel').hidden && $('order-form').hidden && $('success-panel').hidden && !$('change-platform').disabled);
  sessionStorage.setItem('mock-email', 'none'); $('sent-link').click(); await wait();
  check('history requires email verification before display', !$('verify-panel').hidden && $('sent-panel').hidden && !$('sent-list').textContent.includes(reference));
  $('email').value = 'review@example.invalid'; $('send-code').click(); await wait(); $('code').value = '12345678'; $('verify-code').click(); await wait();
  check('email code unlocks matching local requests', !$('sent-panel').hidden && $('sent-list').textContent.includes(reference));
  sessionStorage.setItem('mock-email', 'review@example.invalid');
  Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText: async value => {window.copiedReference = value;}}});
  $('sent-list').querySelector('button').click(); await wait();
  check('saved reference copies exactly', window.copiedReference === reference);
  localStorage.setItem('cmperf:sent-request:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', JSON.stringify({version:1,reference:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',email:'review@example.invalid',vehicle:'<img src=x onerror=alert(1)>',engine:'N55',platform:'bench',submittedAt:Date.now()}));
  $('sent-link').click(); await wait();
  check('multiple saved requests render without injecting HTML', $('sent-list').querySelectorAll('article').length === 2 && !$('sent-list').querySelector('img') && $('sent-list').textContent.includes('<img src=x onerror=alert(1)>'));
  sessionStorage.setItem('mock-email', 'other@example.invalid'); $('sent-link').click(); await wait();
  check('different verified email cannot view saved request', !$('sent-panel').hidden && $('sent-email').textContent === 'other@example.invalid' && !$('sent-list').textContent.includes(reference));
  sessionStorage.setItem('mock-email', 'review@example.invalid'); $('sent-link').click(); await wait();
  check('original email can reopen saved request', $('sent-list').textContent.includes(reference));
  sessionStorage.setItem('mock-results', JSON.stringify(results)); sessionStorage.setItem('mock-reload', '1');
  location.reload();
})().catch(error => {
  const output = document.createElement('pre'); output.id = 'test-results';
  output.textContent = JSON.stringify([{name: error.stack, pass: false}]); document.body.append(output);
});
"""


class OrderFormTests(unittest.TestCase):
    def test_browser_regressions(self):
        chromium = shutil.which('chromium') or shutil.which('chromium-browser')
        self.assertIsNotNone(chromium, 'Chromium is required for browser regressions')
        page = (ROOT / 'order.html').read_text()
        page = re.sub(r'<script[^>]*src=[^>]*></script>', '', page)
        page = re.sub(r'<link[^>]*>', '', page)
        scripts = MOCK_API + '\n' + (ROOT / 'order.js').read_text() + '\n' + BROWSER_TEST
        page = page.replace('</body>', '<script>' + scripts + '</script></body>')
        with tempfile.TemporaryDirectory(prefix='cm-order-test-') as directory:
            path = Path(directory)
            (path / 'test.html').write_text(page)
            result = subprocess.run([
                chromium, '--headless', '--no-sandbox', '--disable-gpu',
                '--disable-background-networking', '--virtual-time-budget=3000',
                '--user-data-dir=' + str(path / 'profile'), '--dump-dom',
                (path / 'test.html').as_uri(),
            ], capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        output = re.search(r'<pre id="test-results">(.*?)</pre>', result.stdout, re.S)
        self.assertIsNotNone(output, 'Browser did not finish the checks')
        for item in json.loads(html.unescape(output.group(1))):
            with self.subTest(item['name']):
                self.assertTrue(item['pass'])

if __name__ == '__main__':
    unittest.main()
