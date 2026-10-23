'use strict';
// Минимальный клиент PayPal Orders v2 (без SDK, на встроенном fetch Node 20).

function baseUrl(env) {
  return env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

async function getAccessToken({ clientId, secret, env }) {
  const res = await fetch(`${baseUrl(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`paypal_auth_${res.status}`);
  const json = await res.json();
  return json.access_token;
}

async function request(creds, method, path, body, requestId) {
  const token = await getAccessToken(creds);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (requestId) headers['PayPal-Request-Id'] = requestId; // идемпотентность
  const res = await fetch(`${baseUrl(creds.env)}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

function createOrder(creds, { amountUsd, description, customId, referenceId }) {
  return request(creds, 'POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: referenceId,
      custom_id: customId,
      description,
      amount: { currency_code: 'USD', value: amountUsd },
    }],
    application_context: { shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW' },
  }, `create-${customId}-${referenceId}-${Date.now()}`);
}

function captureOrder(creds, orderId) {
  return request(creds, 'POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {}, `capture-${orderId}`);
}

function getOrder(creds, orderId) {
  return request(creds, 'GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
}

// Извлекает подтверждённую сумму захвата из ответа PayPal
function completedCapture(order) {
  if (!order || order.status !== 'COMPLETED') return null;
  const unit = (order.purchase_units || [])[0] || {};
  const capture = ((unit.payments || {}).captures || [])[0];
  if (!capture || capture.status !== 'COMPLETED') return null;
  return {
    captureId: capture.id,
    amount: capture.amount && capture.amount.value,
    currency: capture.amount && capture.amount.currency_code,
    customId: capture.custom_id || unit.custom_id,
    referenceId: unit.reference_id,
  };
}

module.exports = { createOrder, captureOrder, getOrder, completedCapture };
