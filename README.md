# LLM-ассистированный перевод — автономный сайт для GitHub Pages

## Структура проекта
- `index.html` — главная страница и форма кейса
- `module.html`, `stage1.html`, `stage2.html`, `stage3.html`, `assessment.html` — этапы модуля
- `assets/` — стили, конфигурация и JavaScript
- `downloads/` — шаблоны и материалы для скачивания
- `worker/` — опциональная серверная прослойка Cloudflare Worker

## Режим без API
По умолчанию `assets/config.js` содержит пустой `window.LLM_API_BASE = "";`.
Сайт работает автономно: пользователь копирует промпты во внешнюю LLM и вставляет результат вручную.

## Опциональный режим API
Если позже понадобится серверный API, разверните Cloudflare Worker из папки `worker/` и пропишите адрес в `assets/config.js`:

```js
window.LLM_API_BASE = "https://<worker-name>.<subdomain>.workers.dev";
```

API-ключ нельзя хранить в репозитории или в браузерном JavaScript.
