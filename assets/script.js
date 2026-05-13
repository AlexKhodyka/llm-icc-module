(function(){
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.navlinks a').forEach(a=>{
    const href = a.getAttribute('href');
    if(href === path) a.classList.add('active');
  });

  // Case storage helpers
  const KEY = 'llm_icc_case_v1';

  function getCase(){
    try{ return JSON.parse(localStorage.getItem(KEY) || 'null'); }catch(e){ return null; }
  }
  function setCase(obj){
    localStorage.setItem(KEY, JSON.stringify(obj));
  }
  function toPrompt(c){
    const parts = [];
    parts.push("ЗАДАНИЕ ДЛЯ ПЕРЕВОДА (LLM-ассистированный перевод)");
    parts.push("");
    parts.push("1) Исходный текст (SOURCE):");
    parts.push(c.sourceText || "[вставьте текст]");
    parts.push("");
    parts.push("2) Языковая пара:");
    parts.push(`SOURCE: ${c.sourceLang || "[язык]"} → TARGET: ${c.targetLang || "[язык]"}`);
    parts.push("");
    parts.push("3) Контекст и параметры:");
    parts.push(`Адресат: ${c.audience || "[кто читает]"}`);
    parts.push(`Жанр/контекст: ${c.genre || "[жанр/ситуация]"}`);
    parts.push(`Цель (коммуникативная задача): ${c.purpose || "[цель]"}`);
    parts.push(`Предпочтительная стратегия: ${c.strategy || "[доместикация/форенизация/перевод+комментарий]"}`);
    parts.push("");
    parts.push("4) Ограничения:");
    parts.push("- Сохранить коммуникативный эффект и уместность для адресата.");
    parts.push("- Избегать буквального перевода идиом/реалий; при необходимости использовать компенсацию.");
    parts.push("- Сохранять жанр и регистр; не добавлять факты от себя.");
    parts.push("");
    parts.push("5) Требуемый формат ответа:");
    parts.push("A) Перевод (TARGET).");
    parts.push("B) 5 проблемных точек (фрагмент → риск → решение).");
    parts.push("C) Короткий чек-лист самопроверки (ПА/РЦИ/КС).");
    return parts.join("\n");
  }

  // Index page: case form
  const caseForm = document.getElementById('case-form');
  if(caseForm){
    const fields = ['caseTitle','sourceLang','targetLang','audience','genre','purpose','strategy','sourceText'];
    const existing = getCase();
    if(existing){
      fields.forEach(id=>{
        const el = document.getElementById(id);
        if(el && existing[id] !== undefined) el.value = existing[id];
      });
      const status = document.getElementById('case-status');
      if(status) status.textContent = "Кейс загружен из браузера (localStorage).";
      if(status) status.className = "success";
    }

    document.getElementById('save-case')?.addEventListener('click', ()=>{
      const obj = {};
      fields.forEach(id=>{
        const el = document.getElementById(id);
        obj[id] = el ? el.value.trim() : "";
      });
      setCase(obj);
      const status = document.getElementById('case-status');
      if(status){
        status.textContent = "Кейс сохранён. Перейдите к Этапу 1.";
        status.className = "success";
      }
    });

    document.getElementById('clear-case')?.addEventListener('click', ()=>{
      localStorage.removeItem(KEY);
      fields.forEach(id=>{
        const el = document.getElementById(id);
        if(el) el.value = "";
      });
      const status = document.getElementById('case-status');
      if(status){
        status.textContent = "Кейс очищен.";
        status.className = "note";
      }
    });
  }

  // Stage 1 page: generate prompt from stored case
  const promptArea = document.getElementById('prompt-area');
  if(promptArea){
    const c = getCase();
    const meta = document.getElementById('case-meta');
    if(c && meta){
      meta.textContent = `Текущий кейс: ${c.caseTitle || "(без названия)"} • ${c.sourceLang || "?"} → ${c.targetLang || "?"} • Адресат: ${c.audience || "—"}`;
    }
    document.getElementById('gen-prompt')?.addEventListener('click', ()=>{
      const c2 = getCase() || {};
      promptArea.value = toPrompt(c2);
    });
    document.getElementById('copy-prompt')?.addEventListener('click', async ()=>{
      try{
        await navigator.clipboard.writeText(promptArea.value);
        const s = document.getElementById('prompt-status');
        if(s){ s.textContent = "Скопировано в буфер обмена."; s.className="success"; }
      }catch(e){
        const s = document.getElementById('prompt-status');
        if(s){ s.textContent = "Не удалось скопировать. Скопируйте вручную."; s.className="note"; }
      }
    });
  }
})();
