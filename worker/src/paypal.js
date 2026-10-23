// Минимальный клиент PayPal Orders v2 для Workers (fetch + btoa вместо Buffer).
const baseUrl = (env) => (env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');

export function makePaypal(creds, fetchImpl = (...a) => fetch(...a)) {
  async function getAccessToken() {
    const res = await fetchImpl(`${baseUrl(creds.env)}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(`${creds.clientId}:${creds.secret}`), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new Error(`paypal_auth_${res.status}`);
    return (await res.json()).access_token;
  }

  async function request(method, path, body, requestId) {
    const token = await getAccessToken();
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    if (requestId) headers['PayPal-Request-Id'] = requestId;
    const res = await fetchImpl(`${baseUrl(creds.env)}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  }

  return {
    createOrder: ({ amountUsd, description, customId, referenceId }) => request('POST', '/v2/checkout/orders', {
      intent: 'CAPTURE',
      purchase_units: [{ reference_id: referenceId, custom_id: customId, description, amount: { currency_code: 'USD', value: amountUsd } }],
      application_context: { shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW' },
    }, `create-${customId}-${referenceId}-${Date.now()}`),
    captureOrder: (orderId) => request('POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {}, `capture-${orderId}`),
    getOrder: (orderId) => request('GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`),
  };
}

export function completedCapture(order) {
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
