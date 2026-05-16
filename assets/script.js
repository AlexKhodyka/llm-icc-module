(function () {
  /* ============================================================
     LLM-ICC Module — script.js  (исправленная версия)
     Исправления:
       1) КС → ПК во всех метках и переменных
       2) Прямой вызов Anthropic API (без серверного прокси)
          — ключ вводится один раз и хранится только в памяти
       3) Серверный прокси (config.js) по-прежнему поддерживается
  ============================================================ */

  /* ── Навигация: подсветка активной ссылки ── */
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.navlinks a').forEach(a => {
    if (a.getAttribute('href') === path) a.classList.add('active');
  });

  /* ── Константы localStorage ── */
  const KEY_CASE    = 'llm_icc_case_v1';
  const KEY_STAGE1  = 'llm_icc_stage1_v1';
  const KEY_AUDIT   = 'llm_icc_audit_v1';
  const KEY_FINAL   = 'llm_icc_final_v1';
  const KEY_SCORE   = 'llm_icc_score_v1';
  const KEY_PAYLOAD = 'llm_icc_score_payload_v1';

  /* ── Типы рисков (Этап 2) ── */
  const RiskTypes = [
    'Ложные добавления / выдуманные детали',
    'Сглаживание модальности / оценочности',
    'Буквальный перевод идиом / реалий',
    'Искажения культурных отсылок / прецедентных феноменов',
    'Нарушение жанра / регистра',
    'Риск стереотипизации / неэтичной интерпретации',
    'Терминологическая несогласованность',
    'Смысловой сдвиг / потеря информации',
  ];

  /* ── localStorage helpers ── */
  function safeGet(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  }
  function safeSet(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch {}
  }
  function getCase() { return safeGet(KEY_CASE); }

  /* ── UI helpers ── */
  function setStatus(el, text, cls) {
    if (!el) return;
    el.textContent = text;
    el.className = cls || 'note';
  }
  function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  /* ──────────────────────────────────────────
     API: два режима
     1) Серверный прокси (config.js, приоритет)
     2) Прямой вызов Anthropic (ключ пользователя)
  ────────────────────────────────────────── */
  const API_BASE = (window.LLM_API_BASE || '').trim();
  let _anthropicKey = ''; // только в памяти

  function getAnthropicKey() {
    if (_anthropicKey) return _anthropicKey;
    const k = prompt(
      'Введите ваш Anthropic API Key (начинается с sk-ant-...).\n' +
      'Ключ хранится только в памяти этой вкладки — не сохраняется в браузере.'
    );
    if (k && k.trim().startsWith('sk-ant-')) {
      _anthropicKey = k.trim();
      return _anthropicKey;
    }
    return null;
  }

  async function apiPostProxy(endpoint, payload) {
    const resp = await fetch(API_BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || 'Ошибка прокси-сервера');
    return data;
  }

  async function apiPostAnthropic(systemPrompt, userPrompt) {
    const key = getAnthropicKey();
    if (!key) throw new Error('API-ключ не введён. Вставьте ключ Anthropic (sk-ant-...).');
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message || 'Ошибка Anthropic API');
    return (data.content || []).map(b => b.text || '').join('');
  }

  async function callLLM(proxyEndpoint, proxyPayload, systemPrompt, userPrompt, statusEl) {
    if (API_BASE) {
      setStatus(statusEl, '⏳ Запрос к серверу…', 'note');
      const data = await apiPostProxy(proxyEndpoint, proxyPayload);
      return data.text || data.raw || JSON.stringify(data);
    } else {
      setStatus(statusEl, '⏳ Запрос к Anthropic API…', 'note');
      return await apiPostAnthropic(systemPrompt, userPrompt);
    }
  }

  /* ──────────────────────────────────────────
     ГЕНЕРАЦИЯ ПРОМПТОВ A/B/C
  ────────────────────────────────────────── */
  function toPrompt(c, variant) {
    const v = (variant || 'A').toUpperCase();
    const lines = [
      'ЗАДАНИЕ ДЛЯ ПЕРЕВОДА (LLM-ассистированный перевод)',
      '',
      '1) Исходный текст (SOURCE):',
      c.sourceText || '[вставьте текст]',
      '',
      '2) Языковая пара:',
      'SOURCE: ' + (c.sourceLang || '[язык]') + ' → TARGET: ' + (c.targetLang || '[язык]'),
      '',
      '3) Контекст и параметры:',
      'Адресат: ' + (c.audience || '[кто читает]'),
      'Жанр/контекст: ' + (c.genre || '[жанр/ситуация]'),
      'Цель (коммуникативная задача): ' + (c.purpose || '[цель]'),
      '',
    ];
    if (v === 'A') {
      lines.push('4) Установка варианта A:');
      lines.push('- Академическая аудитория.');
      lines.push('- Сохранить культурный колорит (форенизация), при необходимости краткие пояснения.');
    } else if (v === 'B') {
      lines.push('4) Установка варианта B:');
      lines.push('- Массовая аудитория.');
      lines.push('- Добиваться функциональной понятности (доместикация), допуская замену эквивалентом.');
    } else {
      lines.push('4) Установка варианта C:');
      lines.push('- Перевод + краткий культурологический комментарий там, где безэквивалентно.');
      lines.push('- Сохранить коммуникативный эффект и уместность.');
    }
    lines.push('');
    lines.push('5) Ограничения:');
    lines.push('- Не добавлять факты от себя; не выдумывать источники/реалии.');
    lines.push('- Сохранять жанр и регистр (тон, степень прямоты/вежливости).');
    lines.push('- При идиомах/реалиях: избегать буквализма; использовать приёмы компенсации (ПК) при необходимости.');
    lines.push('');
    lines.push('6) Требуемый формат ответа:');
    lines.push('A) Перевод (TARGET).');
    lines.push('B) 5 проблемных точек: фрагмент → риск → предложенное решение.');
    lines.push('C) Короткий чек-лист самопроверки по ПА/РЦИ/ПК (1–2 строки на критерий).');
    return lines.join('\n');
  }

  /* ══════════════════════════════════════════
     СТРАНИЦА: index.html — ФОРМА КЕЙСА
  ══════════════════════════════════════════ */
  const caseForm = document.getElementById('case-form');
  if (caseForm) {
    const fields = ['caseTitle','sourceLang','targetLang','audience','genre','purpose','strategy','sourceText'];
    const existing = getCase();
    if (existing) {
      fields.forEach(id => {
        const el = document.getElementById(id);
        if (el && existing[id] !== undefined) el.value = existing[id];
      });
      setStatus(document.getElementById('case-status'), '✅ Кейс загружен из браузера.', 'success');
    }

    document.getElementById('save-case')?.addEventListener('click', () => {
      const obj = {};
      fields.forEach(id => { const el = document.getElementById(id); obj[id] = el ? el.value.trim() : ''; });
      if (!obj.caseTitle || !obj.sourceText) {
        setStatus(document.getElementById('case-status'), '⚠️ Заполните название кейса и исходный текст.', 'warntext');
        return;
      }
      safeSet(KEY_CASE, obj);
      setStatus(document.getElementById('case-status'), '✅ Кейс сохранён. Перейдите к Этапу 1.', 'success');
    });

    document.getElementById('clear-case')?.addEventListener('click', () => {
      localStorage.removeItem(KEY_CASE);
      fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      setStatus(document.getElementById('case-status'), 'Кейс очищен.', 'note');
    });

    const apiEl = document.getElementById('api-status');
    if (apiEl) {
      apiEl.textContent = API_BASE
        ? ('✅ Серверный прокси: ' + API_BASE)
        : 'ℹ️ Серверный прокси не настроен — будет использован прямой вызов Anthropic API (потребуется ваш ключ).';
      apiEl.className = API_BASE ? 'success' : 'note';
    }
  }

  /* ══════════════════════════════════════════
     СТРАНИЦА: stage1.html — ПРОМПТЫ A/B/C
  ══════════════════════════════════════════ */
  const stage1El = document.getElementById('stage1');
  if (stage1El) {
    const c = getCase() || {};
    setStatus(
      document.getElementById('case-meta'),
      'Текущий кейс: ' + (c.caseTitle || '(без названия)') + ' • ' + (c.sourceLang || '?') + ' → ' + (c.targetLang || '?') + ' • Адресат: ' + (c.audience || '—'),
      'note'
    );

    const prompts = { A: document.getElementById('promptA'), B: document.getElementById('promptB'), C: document.getElementById('promptC') };
    const outputs = { A: document.getElementById('outA'),   B: document.getElementById('outB'),   C: document.getElementById('outC')   };
    const status  = document.getElementById('stage1-status');

    const s1saved = safeGet(KEY_STAGE1);
    if (s1saved) {
      ['A','B','C'].forEach(v => {
        if (prompts[v]) prompts[v].value = s1saved['prompt' + v] || '';
        if (outputs[v]) outputs[v].value = s1saved['out'   + v] || '';
      });
      const best = s1saved.best || '';
      document.querySelectorAll('input[name="bestVariant"]').forEach(r => r.checked = (r.value === best));
      setStatus(status, '✅ Данные Этапа 1 загружены из браузера.', 'success');
    }

    document.getElementById('gen-prompts')?.addEventListener('click', () => {
      if (!c.sourceText) { setStatus(status, '⚠️ Сначала сохраните кейс на Главной.', 'warntext'); return; }
      ['A','B','C'].forEach(v => { if (prompts[v]) prompts[v].value = toPrompt(c, v); });
      setStatus(status, '✅ Промпты A/B/C сгенерированы. Скопируйте в LLM или нажмите «Генерировать через API».', 'success');
    });

    ['A','B','C'].forEach(v => {
      document.getElementById('copy' + v)?.addEventListener('click', () => {
        const text = prompts[v]?.value || '';
        if (!text) { setStatus(status, '⚠️ Промпт пуст. Сначала нажмите «Сгенерировать промпты».', 'warntext'); return; }
        navigator.clipboard.writeText(text).then(() => setStatus(status, '✅ Промпт ' + v + ' скопирован.', 'success'));
      });

      document.getElementById('gen' + v)?.addEventListener('click', async () => {
        const promptText = prompts[v]?.value?.trim();
        if (!promptText) { setStatus(status, '⚠️ Промпт пуст.', 'warntext'); return; }
        const btn = document.getElementById('gen' + v);
        if (btn) btn.disabled = true;
        try {
          const text = await callLLM(
            '/api/translate', { prompt: promptText },
            'Ты профессиональный переводчик с опытом в межкультурном посредничестве. Отвечай строго по заданному формату.',
            promptText, status
          );
          if (outputs[v]) outputs[v].value = text;
          setStatus(status, '✅ Вариант ' + v + ' получен.', 'success');
        } catch (e) {
          setStatus(status, '❌ ' + e.message, 'warntext');
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    });

    document.getElementById('save-stage1')?.addEventListener('click', () => {
      const best = (document.querySelector('input[name="bestVariant"]:checked') || {}).value || '';
      safeSet(KEY_STAGE1, {
        promptA: prompts.A?.value, promptB: prompts.B?.value, promptC: prompts.C?.value,
        outA: outputs.A?.value,    outB: outputs.B?.value,    outC: outputs.C?.value, best,
      });
      setStatus(status, '✅ Этап 1 сохранён. Перейдите к Этапу 2.', 'success');
    });

    document.getElementById('to-stage2')?.addEventListener('click', () => {
      const s = safeGet(KEY_STAGE1) || {};
      const best   = (document.querySelector('input[name="bestVariant"]:checked') || {}).value || s.best || 'A';
      const chosen = outputs[best]?.value || outputs.A?.value || '';
      const audit  = safeGet(KEY_AUDIT) || { rows: [] };
      audit.draft  = chosen; audit.best = best;
      safeSet(KEY_AUDIT, audit);
      location.href = 'stage2.html';
    });
  }

  /* ══════════════════════════════════════════
     СТРАНИЦА: stage2.html — АУДИТ-ЛИСТ
  ══════════════════════════════════════════ */
  const stage2El = document.getElementById('stage2');
  if (stage2El) {
    const audit   = safeGet(KEY_AUDIT) || { rows: [] };
    const draftEl = document.getElementById('draft');
    const status  = document.getElementById('stage2-status');
    if (draftEl) draftEl.value = audit.draft || '';

    const tbody = document.getElementById('audit-rows');

    function renderRows() {
      tbody.innerHTML = '';
      const rows = audit.rows || [];
      rows.forEach((r, idx) => {
        const tr = document.createElement('tr');

        function makeTA(val, cb) {
          const ta = document.createElement('textarea');
          ta.value = val || ''; ta.style.minHeight = '60px'; ta.style.width = '100%'; ta.className = 'input';
          ta.addEventListener('input', () => cb(ta.value));
          return ta;
        }

        const tdFrag = document.createElement('td');
        tdFrag.appendChild(makeTA(r.fragment, v => r.fragment = v));

        const tdType = document.createElement('td');
        const sel = document.createElement('select'); sel.className = 'input';
        RiskTypes.forEach(t => { const opt = document.createElement('option'); opt.value = t; opt.textContent = t; sel.appendChild(opt); });
        sel.value = r.riskType || RiskTypes[0];
        sel.addEventListener('change', () => r.riskType = sel.value);
        tdType.appendChild(sel);

        const tdWhy = document.createElement('td');
        tdWhy.appendChild(makeTA(r.why, v => r.why = v));

        const tdFix = document.createElement('td');
        tdFix.appendChild(makeTA(r.fix, v => r.fix = v));

        const tdDone = document.createElement('td');
        const done = document.createElement('select'); done.className = 'input';
        ['','да','нет'].forEach(v => { const opt = document.createElement('option'); opt.value = v; opt.textContent = v === '' ? '—' : v; done.appendChild(opt); });
        done.value = r.done || ''; done.addEventListener('change', () => r.done = done.value);
        tdDone.appendChild(done);

        const tdDel = document.createElement('td');
        const del = document.createElement('button'); del.className = 'btn warn'; del.type = 'button'; del.textContent = 'Удалить';
        del.addEventListener('click', () => { rows.splice(idx, 1); audit.rows = rows; renderRows(); });
        tdDel.appendChild(del);

        [tdFrag, tdType, tdWhy, tdFix, tdDone, tdDel].forEach(td => tr.appendChild(td));
        tbody.appendChild(tr);
      });
      audit.rows = rows;
    }
    renderRows();

    document.getElementById('add-row')?.addEventListener('click', () => {
      audit.rows = audit.rows || [];
      audit.rows.push({ fragment: '', riskType: RiskTypes[0], why: '', fix: '', done: '' });
      renderRows();
    });

    document.getElementById('save-audit')?.addEventListener('click', () => {
      audit.draft = draftEl?.value || '';
      safeSet(KEY_AUDIT, audit);
      setStatus(status, '✅ Аудит сохранён. Перейдите к Этапу 3.', 'success');
    });

    document.getElementById('export-csv')?.addEventListener('click', () => {
      const header = ['Фрагмент','Тип риска','Почему риск','Предлагаемая правка','Правка внесена'];
      const esc = s => '"' + String(s || '').replaceAll('"', '""') + '"';
      const lines = [header.map(esc).join(',')];
      (audit.rows || []).forEach(r => lines.push([r.fragment, r.riskType, r.why, r.fix, r.done].map(esc).join(',')));
      downloadText('\uFEFF' + lines.join('\n'), 'audit_list.csv');
      setStatus(status, '✅ CSV экспортирован.', 'success');
    });

    document.getElementById('to-stage3')?.addEventListener('click', () => {
      audit.draft = draftEl?.value || '';
      safeSet(KEY_AUDIT, audit);
      location.href = 'stage3.html';
    });
  }

  /* ══════════════════════════════════════════
     СТРАНИЦА: stage3.html — ФИНАЛЬНЫЙ ПЕРЕВОД
  ══════════════════════════════════════════ */
  const stage3El = document.getElementById('stage3');
  if (stage3El) {
    const c          = getCase() || {};
    const audit      = safeGet(KEY_AUDIT) || { rows: [] };
    const finalSaved = safeGet(KEY_FINAL) || {};
    const status     = document.getElementById('stage3-status');
    const finalText  = document.getElementById('finalText');
    const commentary = document.getElementById('commentary');

    if (finalText)  finalText.value  = finalSaved.finalText  || '';
    if (commentary) commentary.value = finalSaved.commentary || '';

    document.getElementById('gen-commentary')?.addEventListener('click', () => {
      const rows = (audit.rows || []).slice(0, 5);
      const lines = [
        'Переводческий комментарий (шаблон)', '',
        'Кейс: ' + (c.caseTitle || '(без названия)') + ' • ' + (c.sourceLang || '?') + ' → ' + (c.targetLang || '?'),
        'Адресат: ' + (c.audience || '—'), 'Жанр/контекст: ' + (c.genre || '—'),
        'Цель: ' + (c.purpose || '—'), 'Стратегия: ' + (c.strategy || '—'), '',
        'Ключевые правки (из аудит-листа):',
      ];
      if (!rows.length) {
        lines.push('(аудит-лист пуст — заполните Этап 2)');
      } else {
        rows.forEach((r, i) => {
          lines.push((i+1) + ') Фрагмент: ' + (r.fragment || '—'));
          lines.push('   Риск: ' + (r.riskType || '—'));
          lines.push('   Правка: ' + (r.fix || '—'));
          lines.push('   Обоснование (ПА/РЦИ/ПК): __________________________');
        });
      }
      lines.push('', 'Контроль качества (чек-лист):');
      lines.push('- Проверена точность смысла и полнота передачи (ПА)');
      lines.push('- Проверена модальность/оценочность и жанр/регистр (РЦИ)');
      lines.push('- Проверены культурно-маркированные элементы и приёмы компенсации (ПК)');
      lines.push('- Выполнена финальная вычитка');
      if (commentary) commentary.value = lines.join('\n');
      setStatus(status, '✅ Комментарий сгенерирован.', 'success');
    });

    document.getElementById('save-final')?.addEventListener('click', () => {
      safeSet(KEY_FINAL, { finalText: finalText?.value, commentary: commentary?.value });
      setStatus(status, '✅ Этап 3 сохранён.', 'success');
    });

    document.getElementById('download-report')?.addEventListener('click', () => {
      const s1    = safeGet(KEY_STAGE1) || {};
      const best  = s1.best || 'A';
      const score = safeGet(KEY_SCORE) || {};
      const rows  = audit.rows || [];
      const txt = [
        '=== ОТЧЁТ: LLM-ассистированный перевод (LLM-ICC Module) ===',
        'Дата: ' + new Date().toLocaleString('ru'), '',
        '--- КЕЙС ---',
        'Название:  ' + (c.caseTitle  || '—'),
        'Языки:     ' + (c.sourceLang || '—') + ' → ' + (c.targetLang || '—'),
        'Адресат:   ' + (c.audience   || '—'),
        'Жанр:      ' + (c.genre      || '—'),
        'Цель:      ' + (c.purpose    || '—'),
        'Стратегия: ' + (c.strategy   || '—'), '',
        '--- ИСХОДНЫЙ ТЕКСТ ---',
        c.sourceText || '—', '',
        '--- ЭТАП 1: Выбранный вариант (' + best + ') ---',
        s1['out' + best] || '—', '',
        '--- ЭТАП 2: АУДИТ-ЛИСТ ---',
        ...(rows.length
          ? rows.map((r, i) => (i+1) + ') [' + (r.riskType||'—') + '] «' + (r.fragment||'—') + '» → ' + (r.fix||'—') + ' (внесена: ' + (r.done||'—') + ')')
          : ['(аудит пуст)']),
        '',
        '--- ЭТАП 3: ФИНАЛЬНЫЙ ПЕРЕВОД ---',
        finalText?.value || '—', '',
        '--- ПЕРЕВОДЧЕСКИЙ КОММЕНТАРИЙ ---',
        commentary?.value || '—', '',
        '--- ОЦЕНИВАНИЕ (ПА / РЦИ / ПК) ---',
        'ПА: ' + (score.PA ?? '—') + '  РЦИ: ' + (score.RCI ?? '—') + '  ПК: ' + (score.PK ?? '—'),
        'Сумма: ' + ((score.PA ?? 0) + (score.RCI ?? 0) + (score.PK ?? 0)) + ' / 15',
      ].join('\n');
      downloadText(txt, 'translation_report.txt');
      setStatus(status, '✅ Отчёт скачан.', 'success');
    });

    document.getElementById('push-to-score')?.addEventListener('click', () => {
      safeSet(KEY_FINAL, { finalText: finalText?.value, commentary: commentary?.value });
      safeSet(KEY_PAYLOAD, {
        sourceText: c.sourceText || '',
        targetText: finalText?.value || '',
        caseMeta: { caseTitle: c.caseTitle||'', sourceLang: c.sourceLang||'', targetLang: c.targetLang||'', audience: c.audience||'', genre: c.genre||'', purpose: c.purpose||'', strategy: c.strategy||'' },
        auditRows: audit.rows || [],
      });
      setStatus(status, '✅ Данные переданы в раздел «Оценивание».', 'success');
    });
  }

  /* ══════════════════════════════════════════
     СТРАНИЦА: assessment.html
     ИСПРАВЛЕНО: КС → ПК
  ══════════════════════════════════════════ */
  const assessEl = document.getElementById('assessment-tool');
  if (assessEl) {
    const saved  = safeGet(KEY_SCORE) || { PA: 0, RCI: 0, PK: 0 };
    const paEl   = document.getElementById('scorePA');
    const rciEl  = document.getElementById('scoreRCI');
    // Поддержка обоих id: scorePK (новый) и scoreCS (старый)
    const pkEl   = document.getElementById('scorePK') || document.getElementById('scoreCS');
    const outEl  = document.getElementById('scoreOut');
    const status = document.getElementById('assess-status');

    function update() {
      const PA  = Number(paEl?.value  || 0);
      const RCI = Number(rciEl?.value || 0);
      const PK  = Number(pkEl?.value  || 0);
      const sum = PA + RCI + PK;
      const avg = sum / 3;
      let level = 'базовый';
      if (avg >= 4) level = 'высокий';
      else if (avg >= 2.5) level = 'продвинутый';
      if (outEl) outEl.innerHTML =
        '<div class="kpis">' +
        '<div class="kpi"><div>ПА</div><b>' + PA + '</b></div>' +
        '<div class="kpi"><div>РЦИ</div><b>' + RCI + '</b></div>' +
        '<div class="kpi"><div>ПК</div><b>' + PK + '</b></div>' +
        '<div class="kpi"><div>Сумма</div><b>' + sum + ' / 15</b></div>' +
        '<div class="kpi"><div>Среднее</div><b>' + avg.toFixed(2) + '</b></div>' +
        '<div class="kpi"><div>Уровень</div><b>' + level + '</b></div>' +
        '</div>';
      safeSet(KEY_SCORE, { PA, RCI, PK });
    }

    if (paEl)  paEl.value  = saved.PA  ?? 0;
    if (rciEl) rciEl.value = saved.RCI ?? 0;
    if (pkEl)  pkEl.value  = saved.PK  ?? saved.CS ?? 0;
    [paEl, rciEl, pkEl].filter(Boolean).forEach(el => el.addEventListener('input', update));
    update();

    document.getElementById('download-score')?.addEventListener('click', () => {
      const PA = Number(paEl?.value||0), RCI = Number(rciEl?.value||0), PK = Number(pkEl?.value||0);
      const sum = PA + RCI + PK;
      const c = getCase() || {};
      const txt = [
        'Критериальная оценка (ПА / РЦИ / ПК)',
        'Дата: ' + new Date().toLocaleString('ru'),
        'Кейс: ' + (c.caseTitle || '—'), '',
        'ПА  (Прагматическая адекватность):          ' + PA  + ' / 5',
        'РЦИ (Распознавание цифровой интерференции): ' + RCI + ' / 5',
        'ПК  (Приёмы компенсации):                   ' + PK  + ' / 5', '',
        'Сумма:   ' + sum + ' / 15',
        'Среднее: ' + (sum / 3).toFixed(2),
      ].join('\n');
      downloadText(txt, 'assessment.txt');
      setStatus(status, '✅ assessment.txt скачан.', 'success');
    });

    document.getElementById('ai-score')?.addEventListener('click', async () => {
      const payload = safeGet(KEY_PAYLOAD) || {};
      if (!payload.sourceText || !payload.targetText) {
        setStatus(status, '⚠️ Нет данных. Заполните Этап 3 и нажмите «Передать в оценивание».', 'warntext'); return;
      }
      const rubric = 'ПА: 0-1 игнорирует аудиторию/жанр; 2-3 в целом адекватно; 4-5 полностью адекватно.\nРЦИ: 0-1 проблемы не выявлены; 2-3 большинство выявлено; 4-5 все выявлены и исправлены.\nПК: 0-1 компенсация отсутствует; 2-3 частичная; 4-5 оптимальная.';
      const scoringPrompt = [
        'КЕЙС: ' + JSON.stringify(payload.caseMeta),
        'ИСХОДНЫЙ ТЕКСТ: ' + payload.sourceText,
        'ПЕРЕВОД: ' + payload.targetText,
        'АУДИТ: ' + JSON.stringify(payload.auditRows||[]).slice(0,4000),
        'РУБРИКА: ' + rubric,
        'Верни ТОЛЬКО валидный JSON: {"PA":<0-5>,"RCI":<0-5>,"PK":<0-5>,"rationale":"<кратко>"}',
      ].join('\n\n');

      try {
        let parsed;
        if (API_BASE) {
          setStatus(status, '⏳ Запрос к серверу…', 'note');
          const data = await apiPostProxy('/api/score', payload);
          parsed = { PA: data.PA, RCI: data.RCI, PK: data.PK ?? data.CS, rationale: data.rationale };
        } else {
          setStatus(status, '⏳ Запрос к Anthropic API…', 'note');
          const text = await apiPostAnthropic('Ты строгий экзаменатор. Отвечай только валидным JSON без markdown.', scoringPrompt);
          parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
          if (parsed.CS !== undefined && parsed.PK === undefined) parsed.PK = parsed.CS;
        }
        if (typeof parsed.PA  === 'number' && paEl)  paEl.value  = parsed.PA;
        if (typeof parsed.RCI === 'number' && rciEl) rciEl.value = parsed.RCI;
        if (typeof parsed.PK  === 'number' && pkEl)  pkEl.value  = parsed.PK;
        update();
        setStatus(status, parsed.rationale ? ('✅ AI-оценка: ' + parsed.rationale) : '✅ AI-оценка получена.', 'success');
      } catch (e) {
        setStatus(status, '❌ ' + e.message, 'warntext');
      }
    });

    const apiEl2 = document.getElementById('api-status2');
    if (apiEl2) {
      apiEl2.textContent = API_BASE
        ? ('✅ Серверный прокси: ' + API_BASE)
        : 'ℹ️ Прямой вызов Anthropic API (потребуется ваш ключ при нажатии «AI-оценка»).';
      apiEl2.className = API_BASE ? 'success' : 'note';
    }
  }

})();
