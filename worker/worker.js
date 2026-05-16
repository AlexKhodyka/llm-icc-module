export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s=>s.trim()).filter(Boolean);
    const allowOrigin = allowed.includes(origin) ? origin : (allowed.length ? allowed[0] : "*");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(allowOrigin) });
    }

    if (url.pathname === "/health") {
      return json({ ok: true, service: "llm-icc-proxy" }, 200, allowOrigin);
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, allowOrigin);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "Invalid JSON" }, 400, allowOrigin);
    }

    if (!env.OPENAI_API_KEY) {
      return json({ error: "Server misconfigured: missing OPENAI_API_KEY" }, 500, allowOrigin);
    }

    const model = env.OPENAI_MODEL || "gpt-4.1";

    if (url.pathname === "/api/translate") {
      const prompt = (body.prompt || "").trim();
      if (!prompt) return json({ error: "Missing prompt" }, 400, allowOrigin);

      const instructions = [
        "You are a translation assistant.",
        "Return ONLY the translation and the requested bullet points if the prompt asks for them.",
        "Do not invent facts.",
      ].join("\n");

      const out = await callOpenAIResponses(env.OPENAI_API_KEY, model, instructions, prompt);
      return json({ text: out }, 200, allowOrigin);
    }

    if (url.pathname === "/api/score") {
      // Expect: sourceText, targetText, caseMeta, auditRows (optional)
      const sourceText = (body.sourceText || "").trim();
      const targetText = (body.targetText || "").trim();
      if (!sourceText || !targetText) return json({ error: "Missing sourceText/targetText" }, 400, allowOrigin);

      const rubric = (body.rubric || "").trim() || defaultRubric();
      const caseMeta = body.caseMeta || {};
      const auditRows = Array.isArray(body.auditRows) ? body.auditRows : [];

      const scoringPrompt = [
        "Evaluate the translation using the rubric and return STRICT JSON only.",
        "Fields: PA (0-5 integer), RCI (0-5 integer), PK (0-5 integer), rationale (short).",
        "",
        "CASE META:",
        JSON.stringify(caseMeta),
        "",
        "SOURCE:",
        sourceText,
        "",
        "TARGET:",
        targetText,
        "",
        "AUDIT ROWS (may be empty):",
        JSON.stringify(auditRows).slice(0, 6000),
        "",
        "RUBRIC:",
        rubric
      ].join("\n");

      const instructions = "You are a strict grader. Output valid JSON only. No markdown.";
      const out = await callOpenAIResponses(env.OPENAI_API_KEY, model, instructions, scoringPrompt);

      // Try parse JSON; if parsing fails, return raw text
      try {
        const parsed = JSON.parse(out);
        return json(parsed, 200, allowOrigin);
      } catch (e) {
        return json({ raw: out }, 200, allowOrigin);
      }
    }

    return json({ error: "Not found" }, 404, allowOrigin);
  }
};

function corsHeaders(allowOrigin) {
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function json(obj, status, allowOrigin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(allowOrigin),
    },
  });
}

async function callOpenAIResponses(apiKey, model, instructions, inputText) {
  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: inputText }]
        }
      ]
    })
  });

  const data = await resp.json();
  if (!resp.ok) {
    const msg = data?.error?.message || "OpenAI API error";
    throw new Error(msg);
  }
  return extractText(data);
}

// Best-effort extraction across response shapes
function extractText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();

  // Responses API typically returns output array with message/content items
  const chunks = [];
  const out = data.output || [];
  for (const item of out) {
    if (item?.content && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (typeof c?.text === "string") chunks.push(c.text);
        if (typeof c?.output_text === "string") chunks.push(c.output_text);
      }
    }
    if (typeof item?.text === "string") chunks.push(item.text);
  }
  const joined = chunks.join("\n").trim();
  if (joined) return joined;

  // fallback: stringify
  return JSON.stringify(data);
}

function defaultRubric(){
  return `PA (Pragmatic adequacy): 0-1 ignores audience/genre; 2-3 mostly appropriate; 4-5 fully appropriate.
RCI (Digital interference detection): 0-1 issues not detected; 2-3 most detected; 4-5 all key issues detected and fixed.
PK (Compensation techniques): 0-1 no compensation; 2-3 partial; 4-5 optimal compensation.`;
}
