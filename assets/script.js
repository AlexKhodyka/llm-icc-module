(function(){
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.navlinks a').forEach(a=>{
    const href = a.getAttribute('href');
    if(href === path) a.classList.add('active');
  });

  const KEY_CASE = 'llm_icc_case_v1';
  const KEY_STAGE1 = 'llm_icc_stage1_v1';
  const KEY_AUDIT = 'llm_icc_audit_v1';
  const KEY_FINAL = 'llm_icc_final_v1';
  const KEY_SCORE = 'llm_icc_score_v1';

  const RiskTypes = [
    "Ложные добавления / выдуманные детали",
    "Сглаживание модальности / оценочности",
    "Буквальный перевод идиом / реалий",
    "Искажения культурных отсылок / прецедентных феноменов",
    "Нарушение жанра / регистра",
    "Риск стереотипизации / неэтичной интерпретации",
    "Терминологическая несогласованность",
    "Смысловой сдвиг / потеря информации"
  ];

  function safeJsonGet(key){
    try{ return JSON.parse(localStorage.getItem(key)||'null'); }catch(e){ return null; }
  }
  function safeJsonSet(key, obj){
    localStorage.setItem(key, JSON.stringify(obj));
  }

  function getCase(){ return safeJsonGet(KEY_CASE); }
  function setCase(o){ safeJsonSet(KEY_CASE, o); }

  function toPrompt(c, variant){
    const base = [];
    base.push("ЗАДАНИЕ ДЛЯ ПЕРЕВОДА (LLM-ассистированный перевод)");
    base.push("");
    base.push("1) Исходный текст (SOURCE):");
    base.push(c.sourceText || "[вставьте текст]");
    base.push("");
    base.push("2) Языковая пара:");
    base.push(`SOURCE: ${c.sourceLang || "[язык]"} → TARGET: ${c.targetLang || "[язык]"}`);
    base.push("");
    base.push("3) Контекст и параметры:");
    base.push(`Адресат: ${c.audience || "[кто читает]"}`);
    base.push(`Жанр/контекст: ${c.genre || "[жанр/ситуация]"}`);
    base.push(`Цель (коммуникативная задача): ${c.purpose || "[цель]"}`);
    base.push("");

    const v = (variant||"A").toUpperCase();
    if(v==="A"){
      base.push("4) Установка варианта A:");
      base.push("- Академическая аудитория.");
      base.push("- Сохранить культурный колорит (форенизация), при необходимости краткие пояснения.");
    } else if(v==="B"){
      base.push("4) Установка варианта B:");
      base.push("- Массовая аудитория.");
      base.push("- Добиваться функциональной понятности (доместикация), допуская замену эквивалентом.");
    } else {
      base.push("4) Установка варианта C:");
      base.push("- Перевод + краткий культурологический комментарий там, где безэквивалентно.");
      base.push("- Сохранить коммуникативный эффект и уместность.");
    }
    base.push("");
    base.push("5) Ограничения:");
    base.push("- Не добавлять факты от себя; не выдумывать источники/реалии.");
    base.push("- Сохранять жанр и регистр (тон, степень прямоты/вежливости).");
    base.push("- При идиомах/реалиях: избегать буквализма; использовать компенсацию при необходимости.");
    base.push("");
    base.push("6) Требуемый формат ответа:");
    base.push("A) Перевод (TARGET).");
    base.push("B) 5 проблемных точек: фрагмент → риск → предложенное решение.");
    base.push("C) Короткий чек-лист самопроверки по ПА/РЦИ/КС (1–2 строки на критерий).");
    return base.join("\n");
  }

  function copyText(text, statusEl){
    navigator.clipboard.writeText(text).then(()=>{
      if(statusEl){ statusEl.textContent = "Скопировано в буфер обмена."; statusEl.className="success"; }
    }).catch(()=>{
      if(statusEl){ statusEl.textContent = "Не удалось скопировать. Скопируйте вручную."; statusEl.className="warntext"; }
    });
  }

  // INDEX: case form
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
      if(status){ status.textContent = "Кейс загружен из браузера."; status.className = "success"; }
    }

    document.getElementById('save-case')?.addEventListener('click', ()=>{
      const obj = {};
      fields.forEach(id=>{
        const el = document.getElementById(id);
        obj[id] = el ? el.value.trim() : "";
      });
      setCase(obj);
      const status = document.getElementById('case-status');
      if(status){ status.textContent = "Кейс сохранён. Перейдите к Этапу 1."; status.className = "success"; }
    });

    document.getElementById('clear-case')?.addEventListener('click', ()=>{
      localStorage.removeItem(KEY_CASE);
      fields.forEach(id=>{
        const el = document.getElementById(id);
        if(el) el.value = "";
      });
      const status = document.getElementById('case-status');
      if(status){ status.textContent = "Кейс очищен."; status.className = "note"; }
    });
  }

  // STAGE 1: prompts + store drafts
  const stage1 = document.getElementById('stage1');
  if(stage1){
    const c = getCase() || {};
    const meta = document.getElementById('case-meta');
    if(meta){
      meta.textContent = `Текущий кейс: ${c.caseTitle || "(без названия)"} • ${c.sourceLang || "?"} → ${c.targetLang || "?"} • Адресат: ${c.audience || "—"}`;
    }

    const prompts = {
      A: document.getElementById('promptA'),
      B: document.getElementById('promptB'),
      C: document.getElementById('promptC')
    };
    const outputs = {
      A: document.getElementById('outA'),
      B: document.getElementById('outB'),
      C: document.getElementById('outC')
    };
    const status = document.getElementById('stage1-status');

    function load(){
      const s = safeJsonGet(KEY_STAGE1);
      if(s){
        (prompts.A.value = s.promptA || ""), (prompts.B.value = s.promptB || ""), (prompts.C.value = s.promptC || "");
        (outputs.A.value = s.outA || ""), (outputs.B.value = s.outB || ""), (outputs.C.value = s.outC || "");
        const best = s.best || "";
        document.querySelectorAll('input[name="bestVariant"]').forEach(r=>{
          r.checked = (r.value === best);
        });
        if(status){ status.textContent = "Данные Этапа 1 загружены из браузера."; status.className="success"; }
      }
    }
    load();

    document.getElementById('gen-prompts')?.addEventListener('click', ()=>{
      prompts.A.value = toPrompt(c, "A");
      prompts.B.value = toPrompt(c, "B");
      prompts.C.value = toPrompt(c, "C");
      if(status){ status.textContent = "Промпты A/B/C сгенерированы."; status.className="success"; }
    });

    document.getElementById('copyA')?.addEventListener('click', ()=>copyText(prompts.A.value, status));
    document.getElementById('copyB')?.addEventListener('click', ()=>copyText(prompts.B.value, status));
    document.getElementById('copyC')?.addEventListener('click', ()=>copyText(prompts.C.value, status));

    document.getElementById('save-stage1')?.addEventListener('click', ()=>{
      const best = (document.querySelector('input[name="bestVariant"]:checked')||{}).value || "";
      safeJsonSet(KEY_STAGE1, {
        promptA: prompts.A.value, promptB: prompts.B.value, promptC: prompts.C.value,
        outA: outputs.A.value, outB: outputs.B.value, outC: outputs.C.value,
        best
      });
      if(status){ status.textContent = "Этап 1 сохранён. Перейдите к Этапу 2."; status.className="success"; }
    });

    document.getElementById('to-stage2')?.addEventListener('click', ()=>{
      // set "selected draft" into audit store
      const s = safeJsonGet(KEY_STAGE1) || {};
      const best = (document.querySelector('input[name="bestVariant"]:checked')||{}).value || s.best || "A";
      const chosen = (best==="B"? outputs.B.value : best==="C"? outputs.C.value : outputs.A.value);
      const audit = safeJsonGet(KEY_AUDIT) || { rows: [] };
      audit.draft = chosen;
      audit.best = best;
      safeJsonSet(KEY_AUDIT, audit);
      location.href = "stage2.html";
    });
  }

  // STAGE 2: audit worksheet + export
  const stage2 = document.getElementById('stage2');
  if(stage2){
    const audit = safeJsonGet(KEY_AUDIT) || { rows: [] };
    const draft = document.getElementById('draft');
    const status = document.getElementById('stage2-status');
    if(draft) draft.value = audit.draft || "";

    const tbody = document.getElementById('audit-rows');
    function renderRows(){
      tbody.innerHTML = "";
      const rows = audit.rows || [];
      rows.forEach((r, idx)=>{
        const tr = document.createElement('tr');

        const tdFrag = document.createElement('td');
        const frag = document.createElement('textarea');
        frag.value = r.fragment || "";
        frag.style.minHeight = "60px";
        frag.addEventListener('input', ()=>{ r.fragment = frag.value; });
        tdFrag.appendChild(frag);

        const tdType = document.createElement('td');
        const sel = document.createElement('select');
        RiskTypes.forEach(t=>{
          const opt = document.createElement('option');
          opt.textContent = t; opt.value = t;
          sel.appendChild(opt);
        });
        sel.value = r.riskType || RiskTypes[0];
        sel.addEventListener('change', ()=>{ r.riskType = sel.value; });
        tdType.appendChild(sel);

        const tdWhy = document.createElement('td');
        const why = document.createElement('textarea');
        why.value = r.why || "";
        why.style.minHeight = "60px";
        why.addEventListener('input', ()=>{ r.why = why.value; });
        tdWhy.appendChild(why);

        const tdFix = document.createElement('td');
        const fix = document.createElement('textarea');
        fix.value = r.fix || "";
        fix.style.minHeight = "60px";
        fix.addEventListener('input', ()=>{ r.fix = fix.value; });
        tdFix.appendChild(fix);

        const tdDone = document.createElement('td');
        const done = document.createElement('select');
        ["","да","нет"].forEach(v=>{
          const opt = document.createElement('option');
          opt.textContent = v===""?"—":v; opt.value = v;
          done.appendChild(opt);
        });
        done.value = r.done || "";
        done.addEventListener('change', ()=>{ r.done = done.value; });
        tdDone.appendChild(done);

        const tdDel = document.createElement('td');
        const del = document.createElement('button');
        del.className = "btn warn";
        del.type="button";
        del.textContent = "Удалить";
        del.addEventListener('click', ()=>{
          rows.splice(idx,1);
          audit.rows = rows;
          renderRows();
        });
        tdDel.appendChild(del);

        [tdFrag, tdType, tdWhy, tdFix, tdDone, tdDel].forEach(td=>tr.appendChild(td));
        tbody.appendChild(tr);
      });
      audit.rows = rows;
    }
    renderRows();

    document.getElementById('add-row')?.addEventListener('click', ()=>{
      audit.rows = audit.rows || [];
      audit.rows.push({ fragment:"", riskType: RiskTypes[0], why:"", fix:"", done:"" });
      renderRows();
    });

    document.getElementById('save-audit')?.addEventListener('click', ()=>{
      audit.draft = draft.value;
      safeJsonSet(KEY_AUDIT, audit);
      if(status){ status.textContent="Аудит сохранён. Перейдите к Этапу 3."; status.className="success"; }
    });

    function toCSV(){
      const rows = audit.rows || [];
      const header = ["fragment","riskType","why","fix","done"];
      const esc = (s)=>('"'+String(s||"").replaceAll('"','""')+'"');
      const lines = [header.join(",")];
      rows.forEach(r=>{
        lines.push([r.fragment,r.riskType,r.why,r.fix,r.done].map(esc).join(","));
      });
      return lines.join("\n");
    }

    document.getElementById('export-csv')?.addEventListener('click', ()=>{
      const csv = toCSV();
      const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "audit_list.csv";
      a.click();
      URL.revokeObjectURL(url);
      if(status){ status.textContent="CSV экспортирован."; status.className="success"; }
    });

    document.getElementById('to-stage3')?.addEventListener('click', ()=>{
      audit.draft = draft.value;
      safeJsonSet(KEY_AUDIT, audit);
      location.href = "stage3.html";
    });
  }

  // STAGE 3: final translation + commentary builder
  const stage3 = document.getElementById('stage3');
  if(stage3){
    const c = getCase() || {};
    const audit = safeJsonGet(KEY_AUDIT) || { rows: [] };
    const final = safeJsonGet(KEY_FINAL) || {};
    const status = document.getElementById('stage3-status');

    const finalText = document.getElementById('finalText');
    const commentary = document.getElementById('commentary');
    const qc = document.getElementById('qc');

    if(finalText) finalText.value = final.finalText || "";
    if(commentary) commentary.value = final.commentary || "";

    document.getElementById('gen-commentary')?.addEventListener('click', ()=>{
      const rows = (audit.rows || []).slice(0,5);
      const lines = [];
      lines.push("Переводческий комментарий (шаблон)");
      lines.push("");
      lines.push(`Кейс: ${c.caseTitle || "(без названия)"} • ${c.sourceLang || "?"} → ${c.targetLang || "?"}`);
      lines.push(`Адресат: ${c.audience || "—"}`);
      lines.push(`Жанр/контекст: ${c.genre || "—"}`);
      lines.push(`Цель: ${c.purpose || "—"}`);
      lines.push(`Стратегия: ${c.strategy || "—"}`);
      lines.push("");
      lines.push("Ключевые правки (5 примеров):");
      rows.forEach((r,i)=>{
        lines.push(`${i+1}) Фрагмент: ${r.fragment || "—"}`);
        lines.push(`   Риск: ${r.riskType || "—"}`);
        lines.push(`   Правка: ${r.fix || "—"}`);
        lines.push(`   Обоснование (ПА/РЦИ/КС): __________________________`);
      });
      lines.push("");
      lines.push("Контроль качества (чек-лист):");
      lines.push("- Проверена точность смысла и полнота передачи");
      lines.push("- Проверена модальность/оценочность и жанр/регистр");
      lines.push("- Проверены культурно-маркированные элементы и компенсации");
      lines.push("- Выполнена финальная вычитка");
      commentary.value = lines.join("\n");
      if(status){ status.textContent="Комментарий сгенерирован."; status.className="success"; }
    });

    document.getElementById('save-final')?.addEventListener('click', ()=>{
      safeJsonSet(KEY_FINAL, { finalText: finalText.value, commentary: commentary.value });
      if(status){ status.textContent="Этап 3 сохранён."; status.className="success"; }
    });

    document.getElementById('download-report')?.addEventListener('click', ()=>{
      const txt = [
        "LLM-ассистированный перевод — отчёт",
        "",
        "== Финальный перевод ==",
        finalText.value || "",
        "",
        "== Переводческий комментарий ==",
        commentary.value || ""
      ].join("\n");
      const blob = new Blob([txt], {type:"text/plain;charset=utf-8"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "translation_report.txt";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // ASSESSMENT: scoring calculator
  const assess = document.getElementById('assessment-tool');
  if(assess){
    const s = safeJsonGet(KEY_SCORE) || { PA:0, RCI:0, CS:0 };
    const pa = document.getElementById('scorePA');
    const rci = document.getElementById('scoreRCI');
    const cs = document.getElementById('scoreCS');
    const out = document.getElementById('scoreOut');
    const status = document.getElementById('assess-status');

    function update(){
      const PA = Number(pa.value||0), RCI = Number(rci.value||0), CS = Number(cs.value||0);
      const sum = PA+RCI+CS;
      const avg = sum/3;
      let level = "базовый";
      if(avg>=4) level="высокий";
      else if(avg>=2.5) level="продвинутый";
      out.innerHTML = `
        <div class="kpis">
          <div class="kpi"><div>Сумма</div><b>${sum}</b></div>
          <div class="kpi"><div>Среднее</div><b>${avg.toFixed(2)}</b></div>
          <div class="kpi"><div>Уровень</div><b>${level}</b></div>
        </div>`;
      safeJsonSet(KEY_SCORE, {PA, RCI, CS});
    }
    pa.value = s.PA ?? 0; rci.value = s.RCI ?? 0; cs.value = s.CS ?? 0;
    [pa,rci,cs].forEach(el=>el.addEventListener('input', update));
    update();

    document.getElementById('download-score')?.addEventListener('click', ()=>{
      const PA = Number(pa.value||0), RCI = Number(rci.value||0), CS = Number(cs.value||0);
      const sum = PA+RCI+CS;
      const avg = (sum/3).toFixed(2);
      const txt = [
        "Критериальная оценка (ПА/РЦИ/КС)",
        `ПА: ${PA}`,
        `РЦИ: ${RCI}`,
        `КС: ${CS}`,
        `Сумма: ${sum}`,
        `Среднее: ${avg}`
      ].join("\n");
      const blob = new Blob([txt], {type:"text/plain;charset=utf-8"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "assessment.txt";
      a.click();
      URL.revokeObjectURL(url);
      if(status){ status.textContent="Файл assessment.txt скачан."; status.className="success"; }
    });
  }

  // Note about translation/generation (static site)
  // No API calls by default; user pastes LLM output into fields.
})();
