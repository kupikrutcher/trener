// Точка входа Yandex Cloud Function.
// Сайт шлёт POST с телом-JSON как text/plain (без предварительного CORS-запроса), токен — внутри тела.
'use strict';
const { handle, ApiError } = require('./app');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
const reply = (statusCode, body) => ({
  statusCode, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body),
});

const makeHandler = (getDb) => async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Только POST' });
  let req;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : (event.body || '');
    if (raw.length > 400000) return reply(413, { error: 'Слишком большой запрос' });
    req = JSON.parse(raw);
  } catch { return reply(400, { error: 'Неверный запрос' }); }
  try {
    return reply(200, await handle(req, getDb(), process.env));
  } catch (e) {
    if (e instanceof ApiError) return reply(e.status, { error: e.message });
    console.error(e);
    return reply(500, { error: 'Ошибка сервера' });
  }
};

module.exports.makeHandler = makeHandler;
module.exports.handler = makeHandler(() => require('./db-ydb').ydbDb);
