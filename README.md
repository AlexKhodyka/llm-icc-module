# LLM-ассистированный перевод — GitHub Pages + Serverless Proxy

## 1) Сайт (GitHub Pages)
Публикация:
Settings → Pages → Deploy from a branch → main → /(root)

## 2) Серверная прослойка (Cloudflare Worker)
Зачем: GitHub Pages — статический хостинг, поэтому вызовы к OpenAI API делаем через серверless-прокси.

### Развёртывание (Wrangler)
1) Установите Wrangler и войдите:
   - wrangler login
2) Перейдите в папку `worker/`
3) Установите секрет:
   - wrangler secret put OPENAI_API_KEY
4) Деплой:
   - wrangler deploy

### CORS
В `worker/wrangler.toml` установите:
ALLOWED_ORIGINS="https://<username>.github.io"

## 3) Подключение API на сайте
Откройте `assets/config.js` и задайте:
window.LLM_API_BASE = "https://<worker-name>.<subdomain>.workers.dev";

После этого:
- Этап 1: кнопки «Генерировать через API» начнут работать (A/B/C).
- Оценивание: «AI-оценка через API» начнёт работать.

## 4) Безопасность
Никогда не размещайте OPENAI_API_KEY в репозитории. Используйте секреты Worker/Vercel/Netlify.
