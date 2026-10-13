"""Browser regressions for intake; all API requests use local fake responses.

Run: python tests/test_order_form.py (requires Chromium on PATH).
"""
import html
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]

MOCK_API = """
window.CMP_ORDER_CONFIG = {api: 'https://mock.invalid'};
window.fetch = async (url, options) => {
  if (url.endsWith('/v1/order')) {
    window.uploadCount = (window.uploadCount || 0) + 1;
    window.lastDetails = JSON.parse(options.body.get('details'));
    return await new Promise(resolve => {
      window.finishUpload = (status = 200) => resolve({
        ok: status === 200, status,
        json: async () => status === 200 ? {reference: 'MHD-TEST-123'} : {error: 'Test failure'}
      });
    });
  }
  if (url.endsWith('/v1/session')) {
    return {ok: true, json: async () => ({verified: true, email: 'review@example.invalid'})};
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
  choose('mhd'); await wait();
  $('name').value = 'Review'; $('vin').value = 'WBA12345678901234';
  $('vehicle').value = '2015 428i'; $('engine').value = 'N20';
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
  $('change-platform').click(); choose('bench'); await wait();
  check('platform cannot change during upload', $('order-heading').textContent === 'MHD request');
  check('email cannot change during upload', $('change-email').disabled);
  window.finishUpload(); await wait();
  check('confirmation stored for original platform', sessionStorage.getItem('cm-order-mhd-reference') === 'MHD-TEST-123');
  check('other platform has no false confirmation', !sessionStorage.getItem('cm-order-bench-reference'));
  check('controls restored after upload', !$('change-platform').disabled && !$('change-email').disabled);
  $('change-platform').click(); choose('bench'); await wait();
  check('other platform allows submission', !$('submit-order').hidden && !$('submit-order').disabled);
  check('other platform does not show stale success', $('order-status').textContent === '');
  $('change-platform').click(); choose('mhd'); await wait();
  check('original confirmation restored on return', $('submit-order').hidden && $('order-status').textContent.includes('MHD-TEST-123'));
  sessionStorage.removeItem('cm-order-mhd-reference');
  $('change-platform').click(); choose('mhd'); await wait();
  $('order-form').requestSubmit(); await wait(); window.finishUpload(409); await wait();
  check('conflict clears retry key', !sessionStorage.getItem('cm-order-mhd-key'));
  check('conflict permits retry and navigation', !$('submit-order').disabled && !$('change-platform').disabled && $('order-status').textContent.includes('interrupted'));
  $('order-form').requestSubmit(); await wait(); window.finishUpload(401); await wait();
  check('expired session offers verification and restores navigation', !$('verify-panel').hidden && $('order-form').hidden && !$('change-platform').disabled);
  const output = document.createElement('pre'); output.id = 'test-results';
  output.textContent = JSON.stringify(results); document.body.append(output);
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
