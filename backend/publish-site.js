// Публикация сайта в Yandex Object Storage (бакет-сайт mashavibe.ru).
// Запускается GitHub Actions при каждом изменении сайта, можно и вручную:
//   S3_KEY_ID=… S3_SECRET=… node backend/publish-site.js
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { signedFetch } = require('./s3');

const BUCKET = process.env.SITE_BUCKET || 'mashavibe.ru';
const ROOT = process.env.SITE_DIR || path.join(__dirname, '..');   // папка с файлами сайта
const FILES = ['index.html', 'cabinet.js', 'design/tokens.css', 'img/masha.webp', 'img/icon-32.png', 'img/icon-192.png', 'img/apple-touch-icon.png'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png' };
const TEXT = new Set(['.html', '.js', '.css']);   // картинки уже сжаты — gzip только для текста

async function main() {
  const keyId = process.env.S3_KEY_ID, secret = process.env.S3_SECRET;
  if (!keyId || !secret) throw new Error('Нужны S3_KEY_ID и S3_SECRET');
  for (const rel of FILES) {
    const raw = fs.readFileSync(path.join(ROOT, rel));
    // Object Storage сам не сжимает — кладём уже сжатое (index.html с тестами: ~3 МБ → в разы меньше)
    const text = TEXT.has(path.extname(rel));
    const body = text ? zlib.gzipSync(raw, { level: 9 }) : raw;
    await signedFetch({
      method: 'PUT', host: 'storage.yandexcloud.net', path: `/${BUCKET}/${rel}`, body, keyId, secret,
      // сайт маленький и без версий в именах файлов: браузер каждый раз сверяется с сервером (ответ 304 почти бесплатный)
      headers: { 'Content-Type': TYPES[path.extname(rel)] || 'application/octet-stream', 'Cache-Control': 'no-cache',
        ...(text ? { 'Content-Encoding': 'gzip' } : {}) },
    });
    console.log(`✓ ${rel} (${Math.round(raw.length / 1024)} КБ → ${Math.round(body.length / 1024)} КБ)`);
  }
  console.log(`Опубликовано в бакет ${BUCKET}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
