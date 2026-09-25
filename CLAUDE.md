## Дизайн
- Дизайн-система — design/README.md. Прочитай её перед любой правкой UI.
- Цвета, шрифты, отступы и радиусы — только через переменные из design/tokens.css. Никаких hex в CSS компонентов.
- Макеты — design/screens/*.html. Это референс по виду, а не код для копирования.
- Работаем по этапам из design/PLAN.md. Один этап — одна задача. Не забегай вперёд.
- Цвет не бывает единственным сигналом: у верно/ошибка всегда есть слово или ✓/✕.

## Устройство
- Сайт — index.html + cabinet.js (кабинеты, уроки) + tests.json (задания ДЗ) + bank.json (банк заданий). Стиль — design/styles/air.css; прежний «Клэй 2.0» — в design/archive/clay2/. Хостинг — Yandex Object Storage (бакет mashavibe.ru),
  публикует .github/workflows/publish-site.yml при пуше в main; kupikrutcher.github.io/trener — запасное зеркало. Настройка — backend/site-setup.sh.
- Сервер — backend/: Yandex Cloud Function + YDB + Object Storage. Тесты: `cd backend && npm test`; локально: `npm run dev`.
- Развёртывание сервера — backend/deploy.sh (запускает владелец у себя, с выключенным VPN). Сначала сервер, потом сайт.
