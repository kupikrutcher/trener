// Подпись запросов к Yandex Object Storage (S3-совместимое API, AWS Signature V4) без SDK.
// Ссылки на загрузку и скачивание файлов уроков выдаёт функция; ключ хранилища на сайт не попадает.
'use strict';
const crypto = require('crypto');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
// RFC 3986: кодируется всё, кроме A-Z a-z 0-9 - _ . ~
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const encPath = (p) => p.split('/').map(enc).join('/');
const amzDate = (d) => d.toISOString().replace(/[:-]|\.\d{3}/g, '');

function signingKey(secret, day, region, service) {
  return hmac(hmac(hmac(hmac('AWS4' + secret, day), region), service), 'aws4_request');
}
const canonicalQuery = (q) => Object.keys(q).sort().map((k) => enc(k) + '=' + enc(String(q[k]))).join('&');

/* подписанная ссылка (query string): для PUT загрузки и GET скачивания прямо из браузера */
function presign({ method, host, path, query = {}, keyId, secret, region = 'ru-central1', expires = 3600, date = new Date() }) {
  const t = amzDate(date), day = t.slice(0, 8), scope = `${day}/${region}/s3/aws4_request`;
  const q = { ...query, 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${keyId}/${scope}`,
    'X-Amz-Date': t, 'X-Amz-Expires': String(expires), 'X-Amz-SignedHeaders': 'host' };
  const cq = canonicalQuery(q);
  const creq = [method, encPath(path), cq, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const sts = ['AWS4-HMAC-SHA256', t, scope, sha256(creq)].join('\n');
  const sig = crypto.createHmac('sha256', signingKey(secret, day, region, 's3')).update(sts).digest('hex');
  return `https://${host}${encPath(path)}?${cq}&X-Amz-Signature=${sig}`;
}

/* подпись в заголовках (Authorization) — для удаления файлов и настройки CORS */
function signHeaders({ method, host, path, query = {}, body = '', headers = {}, keyId, secret, region = 'ru-central1', date = new Date() }) {
  const t = amzDate(date), day = t.slice(0, 8), scope = `${day}/${region}/s3/aws4_request`;
  const h = { ...headers, host, 'x-amz-date': t, 'x-amz-content-sha256': sha256(body) };
  const lower = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const names = Object.keys(lower).sort();
  const creq = [method, encPath(path), canonicalQuery(query), names.map((k) => `${k}:${lower[k]}\n`).join(''),
    names.join(';'), lower['x-amz-content-sha256']].join('\n');
  const sts = ['AWS4-HMAC-SHA256', t, scope, sha256(creq)].join('\n');
  const sig = crypto.createHmac('sha256', signingKey(secret, day, region, 's3')).update(sts).digest('hex');
  const out = { ...headers, 'x-amz-date': t, 'x-amz-content-sha256': lower['x-amz-content-sha256'],
    Authorization: `AWS4-HMAC-SHA256 Credential=${keyId}/${scope},SignedHeaders=${names.join(';')},Signature=${sig}` };
  return { headers: out, signature: sig };
}
async function signedFetch(opts) {
  const { headers } = signHeaders(opts);
  const qs = canonicalQuery(opts.query || {});
  const res = await fetch(`https://${opts.host}${encPath(opts.path)}${qs ? '?' + qs : ''}`,
    { method: opts.method, body: opts.body || undefined, headers });
  if (!res.ok) throw new Error(`S3 ${opts.method} ${opts.path}: ${res.status} ${await res.text()}`);
  return res;
}

/* хранилище файлов уроков */
const HOST = 'storage.yandexcloud.net';
function storage(env) {
  const bucket = env.S3_BUCKET, keyId = env.S3_KEY_ID, secret = env.S3_SECRET;
  const ok = !!(bucket && keyId && secret);
  return {
    ok,
    uploadUrl: (key) => presign({ method: 'PUT', host: HOST, path: `/${bucket}/${key}`, keyId, secret, expires: 3600 }),
    downloadUrl: (key, name) => presign({ method: 'GET', host: HOST, path: `/${bucket}/${key}`, keyId, secret, expires: 6 * 3600,
      query: { 'response-content-disposition': `attachment; filename*=UTF-8''${enc(name)}` } }),
    remove: (key) => signedFetch({ method: 'DELETE', host: HOST, path: `/${bucket}/${key}`, keyId, secret }),
    // разрешаем браузеру загружать файлы с сайта (PUT) — выполняется при развёртывании
    setCors: (origins) => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?><CORSConfiguration><CORSRule>${origins.map((o) => `<AllowedOrigin>${o}</AllowedOrigin>`).join('')}` +
        `<AllowedMethod>PUT</AllowedMethod><AllowedMethod>GET</AllowedMethod><AllowedHeader>*</AllowedHeader><MaxAgeSeconds>3600</MaxAgeSeconds></CORSRule></CORSConfiguration>`;
      const md5 = crypto.createHash('md5').update(xml).digest('base64');
      return signedFetch({ method: 'PUT', host: HOST, path: `/${bucket}`, query: { cors: '' }, body: xml,
        headers: { 'Content-MD5': md5, 'Content-Type': 'application/xml' }, keyId, secret });
    },
  };
}

module.exports = { presign, signHeaders, signedFetch, storage };
