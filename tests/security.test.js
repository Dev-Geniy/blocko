'use strict';
// Проверки помощников экранирования: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadSecurity() {
  const window = { location: { href: 'https://blocko.example/board.html?b=1' } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'security.js'), 'utf8'), { window, URL });
  return window.BlockoSec;
}
const S = loadSecurity();

test('esc экранирует все опасные символы', () => {
  assert.strictEqual(S.esc(`<img src=x onerror="alert('1')">\``), '&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&#96;');
  assert.strictEqual(S.esc(null), '');
  assert.strictEqual(S.esc(0), '0');
});

test('jsArg даёт безопасный литерал для onclick', () => {
  const arg = S.jsArg(`x'); alert(1); ('`);
  assert.ok(!arg.includes("'"));
  assert.ok(!arg.includes('"'));
  // После HTML-декодирования атрибута получается валидный JS-литерал с исходной строкой
  const decoded = arg.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#96;/g, '`').replace(/&amp;/g, '&');
  assert.strictEqual(JSON.parse(decoded), `x'); alert(1); ('`);
});

test('safeUrl пропускает только http(s) и разрешённые data:', () => {
  assert.strictEqual(S.safeUrl('javascript:alert(1)'), '');
  assert.strictEqual(S.safeUrl(' JaVaScRiPt:alert(1)'), '');
  assert.strictEqual(S.safeUrl('https://ok.com/a?b=1'), 'https://ok.com/a?b=1');
  assert.strictEqual(S.safeUrl('data:image/png;base64,AAA'), '');
  assert.strictEqual(S.safeUrl('data:image/png;base64,AAA', { allowData: true }), 'data:image/png;base64,AAA');
  assert.strictEqual(S.safeUrl('data:text/html;base64,AAA', { allowData: true }), '');
});

test('safeColor отбрасывает CSS-инъекции', () => {
  assert.strictEqual(S.safeColor('#3b82f6'), '#3b82f6');
  assert.strictEqual(S.safeColor('rgba(0, 0, 0, 0.5)'), 'rgba(0, 0, 0, 0.5)');
  assert.strictEqual(S.safeColor('red; background:url(https://evil)'), 'transparent');
  assert.strictEqual(S.safeColor('linear-gradient(#fff, #000)'), 'linear-gradient(#fff, #000)');
});

test('highlight экранирует текст до подсветки', () => {
  const html = S.highlight('<b>Задача</b>', 'зад');
  assert.ok(html.startsWith('&lt;b&gt;'));
  assert.ok(html.includes('<mark'));
  assert.ok(!html.includes('<b>'));
});

test('safeYoutubeEmbed принимает только embed-ссылки', () => {
  assert.strictEqual(S.safeYoutubeEmbed('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.strictEqual(S.safeYoutubeEmbed('javascript:alert(1)'), '');
  assert.strictEqual(S.safeYoutubeEmbed('https://evil.com/embed/dQw4w9WgXcQ'), '');
});

test('без DOMPurify sanitizeHTML отдаёт экранированный текст', () => {
  assert.strictEqual(S.sanitizeHTML('<script>x</script>'), '&lt;script&gt;x&lt;/script&gt;');
});
