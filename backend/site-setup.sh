#!/usr/bin/env bash
# Сайт mashavibe.ru в Yandex Object Storage с сертификатом из Certificate Manager.
# Запускать из папки trener-backend после deploy.sh (нужен файл .secrets с ключом хранилища).
# Скрипт можно запускать повторно: он доделывает то, что ещё не готово.
set -euo pipefail
cd "$(dirname "$0")"
source .secrets

DOMAIN=mashavibe.ru
WWW=www.$DOMAIN
CERT=mashavibe-ru

echo "→ бакеты-сайты"
for B in "$DOMAIN" "$WWW"; do
  yc storage bucket get "$B" >/dev/null 2>&1 || yc storage bucket create --name "$B" >/dev/null
done
yc storage bucket update --name "$DOMAIN" --public-read \
  --website-settings '{"index": "index.html", "error": "index.html"}' >/dev/null
# www.mashavibe.ru → https://mashavibe.ru
yc storage bucket update --name "$WWW" --public-read \
  --website-settings "{\"redirectAllRequests\": {\"protocol\": \"PROTOCOL_HTTPS\", \"hostname\": \"$DOMAIN\"}}" >/dev/null

echo "→ файлы сайта (последняя версия с GitHub)"
SITE_DIR=$(mktemp -d)
for f in index.html cabinet.js design/tokens.css; do
  mkdir -p "$SITE_DIR/$(dirname "$f")"
  curl -fsSL "https://raw.githubusercontent.com/kupikrutcher/trener/main/$f" -o "$SITE_DIR/$f"
done
SITE_DIR=$SITE_DIR S3_KEY_ID=$S3_KEY_ID S3_SECRET=$S3_SECRET SITE_BUCKET=$DOMAIN node publish-site.js
rm -rf "$SITE_DIR"

echo "→ сертификат Let's Encrypt (Certificate Manager)"
yc certificate-manager certificate get --name "$CERT" >/dev/null 2>&1 || \
  yc certificate-manager certificate request --name "$CERT" --domains "$DOMAIN,$WWW" --challenge dns >/dev/null
STATUS=$(yc certificate-manager certificate get --name "$CERT" --format json | jq -r .status)
CERT_ID=$(yc certificate-manager certificate get --name "$CERT" --format json | jq -r .id)

if [ "$STATUS" != "ISSUED" ]; then
  echo
  echo "Сертификат ещё не выпущен (статус: $STATUS)."
  echo "Добавьте в Cloudflare → DNS → Records записи CNAME (облачко серое, DNS only):"
  echo
  yc certificate-manager certificate get --name "$CERT" --full --format json | jq -r '
    .challenges[] | (.dns_challenge // .dnsChallenge) | select(.type == "CNAME")
    | "   Тип: CNAME   Имя: \(.name | sub("\\.$"; ""))   Значение: \(.value | sub("\\.$"; ""))"' | sort -u
  echo
  echo "Через 15–60 минут после этого запустите ./site-setup.sh ещё раз."
  exit 0
fi

echo "→ HTTPS для бакетов"
yc storage bucket set-https --name "$DOMAIN" --certificate-id "$CERT_ID" >/dev/null
yc storage bucket set-https --name "$WWW" --certificate-id "$CERT_ID" >/dev/null

echo
echo "Готово. Сертификат выпущен и привязан."
echo "Теперь в Cloudflare → DNS → Records (облачко серое, DNS only):"
echo "   удалите 4 записи A для $DOMAIN (185.199.x.153) и CNAME www,"
echo "   добавьте:"
echo "   Тип: CNAME   Имя: @     Значение: $DOMAIN.website.yandexcloud.net"
echo "   Тип: CNAME   Имя: www   Значение: $WWW.website.yandexcloud.net"
