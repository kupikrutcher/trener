#!/usr/bin/env bash
# Развёртывание сервера в Yandex Cloud. Нужен yc (после `yc init`), node, jq, zip.
# Повторный запуск обновляет функцию, данные не трогает.
set -euo pipefail
cd "$(dirname "$0")"

DB=trener-db
SA=trener-fn
FN=trener-api
FOLDER_ID=$(yc config get folder-id)

# секреты живут только локально (файл в .gitignore) и в настройках функции
if [ ! -f .secrets ]; then
  echo "SECRET=$(openssl rand -hex 32)" > .secrets
  echo "SETUP_CODE=$(openssl rand -hex 4)" >> .secrets
fi
source .secrets

echo "→ база YDB (serverless)"
yc ydb database get "$DB" >/dev/null 2>&1 || yc ydb database create "$DB" --serverless >/dev/null
for i in $(seq 1 60); do
  [ "$(yc ydb database get "$DB" --format json | jq -r .status)" = RUNNING ] && break; sleep 5
done
EP=$(yc ydb database get "$DB" --format json | jq -r .endpoint)   # grpcs://host:2135/?database=/ru-central1/...
YDB_ENDPOINT=${EP%%/?database=*}
YDB_DATABASE=${EP##*database=}

echo "→ сервисный аккаунт для функции"
yc iam service-account get "$SA" >/dev/null 2>&1 || yc iam service-account create "$SA" >/dev/null
SA_ID=$(yc iam service-account get "$SA" --format json | jq -r .id)
yc resource-manager folder add-access-binding "$FOLDER_ID" --role ydb.editor --subject "serviceAccount:$SA_ID" >/dev/null 2>&1 || true

echo "→ таблицы"
npm ci --omit=dev --silent
YDB_ENDPOINT=$YDB_ENDPOINT YDB_DATABASE=$YDB_DATABASE YDB_ACCESS_TOKEN_CREDENTIALS=$(yc iam create-token) \
  node -e "require('./db-ydb').ydbDb.createSchema().then(()=>process.exit(0),e=>{console.error(e);process.exit(1)})"

echo "→ функция"
yc serverless function get "$FN" >/dev/null 2>&1 || yc serverless function create "$FN" >/dev/null
rm -f /tmp/trener-api.zip
# зависимости облако ставит само по package.json — в архив только код
zip -q /tmp/trener-api.zip index.js app.js db-ydb.js package.json package-lock.json
yc serverless function version create --function-name "$FN" \
  --runtime nodejs22 --entrypoint index.handler --memory 256m --execution-timeout 30s \
  --service-account-id "$SA_ID" --source-path /tmp/trener-api.zip \
  --environment "YDB_ENDPOINT=$YDB_ENDPOINT,YDB_DATABASE=$YDB_DATABASE,YDB_METADATA_CREDENTIALS=1,SECRET=$SECRET,SETUP_CODE=$SETUP_CODE" >/dev/null
yc serverless function allow-unauthenticated-invoke "$FN" >/dev/null

FN_ID=$(yc serverless function get "$FN" --format json | jq -r .id)
echo
echo "Готово."
echo "API_URL:    https://functions.yandexcloud.net/$FN_ID"
echo "SETUP_CODE: $SETUP_CODE"
