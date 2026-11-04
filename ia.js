/* Aide d'une IA gratuite POUR COMPRENDRE LA QUESTION, jamais pour y répondre.
   - Seule ta question part chez le fournisseur (Google, Groq…). Ta base de connaissances ne sort jamais du téléphone.
   - L'IA reformule dans la langue du cours ; ses reformulations sont REFUSÉES si elles changent un chiffre ou une négation.
   - La réponse est toujours trouvée et vérifiée par engine.js dans tes sources, citation à l'appui. */
(function (root) {
  "use strict";
  const E = () => (typeof module !== "undefined" && module.exports ? require("./engine.js") : root.Engine);

  const PRESETS = {
    gemini: { label: "Google AI Studio (Gemini)", url: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash" },
    groq: { label: "Groq", url: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" }
  };
  const Ia = { PRESETS, cfg: null, cfg2: null, cache: new Map(), last: "" };

  /* adresses connues : on remet la bonne, quoi qu'il y ait dans le champ (faute de frappe, ancienne valeur, « /chat/completions » en trop…) */
  const fixUrl = u => {
    u = String(u || "").trim();
    if (/generativelanguage\.googleapis\.com/i.test(u)) return PRESETS.gemini.url;
    if (/api\.groq\.com/i.test(u)) return PRESETS.groq.url;
    return u.replace(/\/chat\/completions\/?$/i, "");
  };
  const okCfg = c => (c && c.key && c.url && c.model ? Object.assign({}, c, { url: fixUrl(c.url), key: String(c.key).trim(), model: String(c.model).trim() }) : null);
  /* c = fournisseur principal, c2 = secours (facultatif) : on passe au secours si le principal échoue (quota, panne, délai) */
  Ia.configure = (c, c2) => { Ia.cfg = okCfg(c); Ia.cfg2 = okCfg(c2); if (!Ia.cfg && Ia.cfg2) { Ia.cfg = Ia.cfg2; Ia.cfg2 = null; } };
  Ia.ready = () => !!Ia.cfg;

  const LANGNAME = { it: "italien", fr: "français", en: "anglais", ar: "arabe" };
  const systemPrompt = (lang, subject) => `Tu aides une application de révision (${subject || "examen"}). Tu ne réponds JAMAIS à la question.
Tu transformes la phrase dite à voix haute (souvent mal transcrite, familière, avec des mots à elle) en formulations claires, écrites en ${LANGNAME[lang] || "italien"}, avec le vocabulaire probable d'un cours ou d'un texte officiel.
Règles absolues : garde EXACTEMENT les mêmes chiffres, unités, comparaisons (plus de, moins de, au moins) et la même négation ou absence de négation. N'ajoute aucun fait. N'invente rien.
Réponds uniquement par un objet JSON :
{"genre":"affirmation"|"qcm"|"autre",
 "reformulations":["…","…"],            // 1 à 3 phrases déclaratives (pour une question, reformule-la en question claire)
 "qcm":{"question":"…","options":["…","…","…"]}   // seulement si la phrase contient des choix A, B, C : un texte par option, dans l'ordre, sans la lettre
}`;

  /* ---------- contrôle d'une reformulation (pur, testé) ---------- */
  const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  Ia.guard = function (original, rewrite) {
    const Eng = E();
    if (typeof rewrite !== "string" || rewrite.trim().length < 6 || rewrite.length > 400) return false;
    if (!sameSet(Eng.numsOf(original), Eng.numsOf(rewrite))) return false;   // un chiffre ajouté, perdu ou modifié
    if (Eng.hasNeg(original) !== Eng.hasNeg(rewrite)) return false;           // une négation ajoutée ou perdue
    return true;
  };

  /* QCM : même nombre d'options, mêmes chiffres dans chaque option, texte non vide */
  Ia.guardMcq = function (original, parsed, q) {
    const Eng = E();
    if (!q || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) return false;
    if (!q.options.every(o => typeof o === "string" && o.trim())) return false;
    if (!Ia.guard(original, String(q.question || "") + " " + q.options.join(" "))) return false; // chiffres/négations globaux
    if (parsed && parsed.opts.length === q.options.length)
      return parsed.opts.every((o, i) => sameSet(Eng.numsOf(o), Eng.numsOf(q.options[i])));
    return true;
  };

  const parseJson = txt => {
    const m = String(txt || "").replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch (e) { return null; }
  };

  const base = c => c.url.replace(/\/$/, "");
  /* modèle introuvable (404) : on lit la liste du fournisseur et on prend un modèle qui existe vraiment */
  async function pickModel(c, signal) {
    const r = await fetch(base(c) + "/models", { headers: { Authorization: "Bearer " + c.key }, signal });
    if (!r.ok) return null;
    const ids = ((await r.json()).data || []).map(x => String(x.id || "").replace(/^models\//, "")).filter(Boolean);
    const bad = /tts|image|live|embed|audio|vision|guard|whisper|preview|lite/i;
    const prefs = [/^llama-3\.3-70b-versatile$/, /^gemini-2\.5-flash$/, /^gemini-flash-latest$/, /^gemini-.*flash/, /^llama/, /./];
    for (const re of prefs) { const m = ids.find(i => re.test(i) && !bad.test(i)); if (m) return m; }
    return null;
  }

  async function call(c, body, signal) {
    const send = () => fetch(base(c) + "/chat/completions", {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + c.key },
      body: JSON.stringify(body)
    });
    let r = await send();
    if (r.status === 404 && !c._healed) {
      c._healed = true;
      const m = await pickModel(c, signal).catch(() => null);
      if (m && m !== body.model) {
        const from = body.model; body.model = m; c.model = m;
        if (Ia.onHeal) try { Ia.onHeal(c, m, from); } catch (e) {}
        r = await send();
      }
    }
    if (!r.ok) {
      let m = ""; let raw = "";
      try { raw = typeof r.text === "function" ? await r.text() : JSON.stringify(await r.json()); const j = JSON.parse(raw); m = (j.error && j.error.message) || (Array.isArray(j) && j[0] && j[0].error && j[0].error.message) || ""; } catch (e) {}
      if (!m && raw) m = raw.replace(/\s+/g, " ").slice(0, 120);
      const err = new Error(r.status + (m ? " " + m.slice(0, 160) : "") + " [" + base(c).replace(/^https?:\/\//, "").slice(0, 60) + " / " + body.model + "]"); err.status = r.status; throw err;
    }
    return r.json();
  }

  /* -> { variants: [textes à essayer après l'original], kind, qcm } ou null (jamais d'exception) */
  async function attempt(c, text, o) {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), o.timeout || 7000);
    try {
      const body = {
        model: c.model, temperature: 0, max_tokens: 400,
        messages: [{ role: "system", content: systemPrompt(o.lang, o.subject) }, { role: "user", content: text }],
        response_format: { type: "json_object" }
      };
      let data;
      try { data = await call(c, body, ctrl.signal); }
      catch (e) { if (e.status !== 400) throw e; delete body.response_format; data = await call(c, body, ctrl.signal); }
      const j = parseJson(data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content);
      if (!j) throw new Error("réponse illisible");
      return j;
    } finally { clearTimeout(timer); }
  }

  /* -> { variants: [textes à essayer après l'original], kind, qcm, via } ou null (jamais d'exception) */
  Ia.understand = async function (text, o = {}) {
    if (!Ia.ready()) return null;
    const key = (o.lang || "") + "|" + text;
    if (Ia.cache.has(key)) return Ia.cache.get(key);
    const errs = []; let j = null, used = null;
    for (const c of [Ia.cfg, Ia.cfg2].filter(Boolean)) {
      try { j = await attempt(c, text, o); used = c; break; }
      catch (e) { errs.push((c.label || c.model) + " : " + (e.name === "AbortError" ? "délai dépassé" : e.message)); }
    }
    if (!j) { Ia.last = errs.join(" ; "); return null; }
    const out = { variants: [], kind: j.genre || "autre", rejected: 0, via: used.label || used.model };
    for (const r of (Array.isArray(j.reformulations) ? j.reformulations : []).slice(0, 3)) {
      if (Ia.guard(text, r)) out.variants.push(r.trim()); else out.rejected++;
    }
    const Eng = E();
    if (j.qcm && Ia.guardMcq(text, Eng.parseMcq(text), j.qcm)) {
      const L = "ABCDEF";
      out.variants.push(String(j.qcm.question || "").trim() + " " + j.qcm.options.map((x, i) => L[i] + " " + x.trim()).join(" "));
    } else if (j.qcm) out.rejected++;
    Ia.cache.set(key, out);
    Ia.last = errs.length ? "secours utilisé (" + errs[0] + ")" : "";
    return out;
  };


  /* ---------- l'IA LIT les passages de ta base et répond ; sa réponse est vérifiée avant d'être acceptée ----------
     Elle doit citer mot pour mot une phrase d'un passage ; chiffres et négations sont recontrôlés ici, pas par elle. */
  const answerPrompt = (lang, subject) => `Tu aides une application de révision (${subject || "examen"}). Tu réponds UNIQUEMENT à partir des passages numérotés fournis, jamais avec tes connaissances.
L'utilisateur donne soit une affirmation (réponse "vero" ou "falso"), soit un QCM avec des choix A, B, C (réponse = la lettre).
Si les passages ne permettent pas de trancher, s'ils se contredisent, ou si la phrase n'est ni une affirmation ni un QCM : réponds "incerto".
Réponds uniquement par un objet JSON : {"reponse":"vero"|"falso"|"A"|"B"|"C"|"D"|"E"|"F"|"incerto","passage":<numéro>,"citation":"phrase copiée MOT POUR MOT du passage"}
La citation doit exister telle quelle dans le passage. Langue des passages : ${LANGNAME[lang] || "italien"}.`;

  const overlap = (a, b) => { const B = new Set(b); const A = a.filter(x => x); return A.length ? A.filter(x => B.has(x)).length / A.length : 0; };

  /* -> { verdict: "yes"|"no"|indice|"unsure", p, quote } ou null si la réponse est refusée */
  Ia.checkAnswer = function (stmt, mcq, j, passages) {
    const Eng = E();
    if (!j || typeof j.reponse !== "string") return null;
    const r = j.reponse.trim().toLowerCase();
    if (r === "incerto" || r === "") return { verdict: "unsure" };
    const ps = passages[(parseInt(j.passage, 10) || 0) - 1];
    if (!ps || typeof j.citation !== "string") return null;
    const qn = Eng.norm(j.citation);
    if (qn.length < 15 || !Eng.norm(ps.text).includes(qn)) return null;           // citation inventée ou approximative
    const qt = Eng.toks(j.citation);
    if (mcq) {
      const i = "abcdef".indexOf(r);
      if (r.length !== 1 || i < 0 || i >= mcq.opts.length) return null;
      const o = mcq.opts[i];
      const ot = Eng.toks(o);
      if (!sameSet(Eng.numsOf(o), Eng.numsOf(j.citation).filter(n => Eng.numsOf(o).includes(n)))) return null; // chiffres de l'option absents de la citation
      if (overlap(ot, qt) < 0.5) return null;                                      // la citation ne parle pas de l'option choisie
      return { verdict: i, p: ps.p, quote: j.citation };
    }
    const yes = /^(vero|vrai|true|v)$/.test(r), no = /^(falso|faux|false|f)$/.test(r);
    if (!yes && !no) return null;
    if (overlap(Eng.toks(stmt), qt) < 0.5) return null;                            // la citation ne concerne pas l'affirmation
    if (yes) {
      const sn = Eng.numsOf(stmt), cn = Eng.numsOf(j.citation);
      if (sn.some(n => !cn.includes(n))) return null;                              // « vero » avec un chiffre absent de la citation
      if (Eng.hasNeg(stmt) !== Eng.hasNeg(j.citation)) return null;               // « vero » alors que la négation diffère
    }
    return { verdict: yes ? "yes" : "no", p: ps.p, quote: j.citation };
  };

  /* passages = [{ text, p }] ; mcq = résultat de parseMcq ou null -> résultat vérifié ou null (jamais d'exception) */
  Ia.answer = async function (text, passages, mcq, o = {}) {
    if (!Ia.ready() || !passages.length) return null;
    const Eng = E(), stmt = mcq ? mcq.q : Eng.stmtOf(text);
    const user = "Phrase de l'utilisateur : " + text + "\n\nPassages :\n" + passages.map((x, i) => (i + 1) + ". " + x.text.slice(0, 700)).join("\n");
    const errs = [];
    for (const c of [Ia.cfg, Ia.cfg2].filter(Boolean)) {
      const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), o.timeout || 9000);
      try {
        const body = { model: c.model, temperature: 0, max_tokens: 300,
          messages: [{ role: "system", content: answerPrompt(o.lang, o.subject) }, { role: "user", content: user }],
          response_format: { type: "json_object" } };
        let data;
        try { data = await call(c, body, ctrl.signal); }
        catch (e) { if (e.status !== 400) throw e; delete body.response_format; data = await call(c, body, ctrl.signal); }
        const j = parseJson(data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content);
        if (!j) throw new Error("réponse illisible");
        const v = Ia.checkAnswer(stmt, mcq, j, passages);
        Ia.lastAns = errs.length ? "secours utilisé" : "";
        return v ? Object.assign(v, { via: c.label || c.model }) : { verdict: "unsure", refused: true };
      } catch (e) { errs.push((c.label || c.model) + " : " + (e.name === "AbortError" ? "délai dépassé" : e.message)); }
      finally { clearTimeout(timer); }
    }
    Ia.lastAns = errs.join(" ; ");
    return null;
  };

  /* Fusion avec la réponse du moteur. Le moteur garde la main : l'IA ne peut ni casser un désaccord entre sources,
     ni combler un trou « […] ». Désaccord moteur/IA -> on ne tranche pas. */
  const OVERRIDABLE = ["weak", "no-source", "empty", "number-missing"];
  Ia.combine = function (eng, ai, strict) {
    if (!ai || ai.verdict === "unsure" || !eng) return eng;
    if (eng.verdict !== "unsure") {
      if (String(eng.verdict) === String(ai.verdict)) return Object.assign({}, eng, { aiConfirm: ai.via });
      return { kind: eng.kind, verdict: "unsure", reason: "ai-conflict", options: eng.options,
        alts: [Object.assign({}, eng.passage, { says: eng.verdict }), Object.assign({}, ai.p, { says: ai.verdict, text: ai.quote })] };
    }
    if (!OVERRIDABLE.includes(eng.reason)) return eng;
    if (strict && (ai.p.rank || 1) < 2) return eng;
    return { kind: eng.kind, verdict: ai.verdict, conf: "moyenne", reason: "ia", options: eng.options,
      passage: Object.assign({}, ai.p, { text: ai.quote }), support: [], conflict: [], nSources: 1, alts: [], viaAI: ai.via };
  };


  /* ---------- l'IA répond SEULE, avec ses connaissances (la base ne sert que de secours) ---------- */
  const freePrompt = (subject) => `Tu es un instructeur expert de l'examen ${subject || "patente C / CQC italienne"} (code de la route et réglementation italiens et européens en vigueur).
L'utilisateur parle à voix haute, souvent avec des mots à lui ou mal transcrits : comprends le sens. Réponds EN ITALIEN, de façon brève et précise.
Si c'est une affirmation : "vero" ou "falso". Si c'est un QCM avec des choix A, B, C : la lettre. Sinon : "altro" avec une réponse courte.
Réponds uniquement par un objet JSON : {"verdetto":"vero"|"falso"|"A"|"B"|"C"|"D"|"E"|"F"|"altro","risposta":"1 à 3 phrases en italien qui donnent la réponse et la raison (chiffres exacts)"}
Si tu n'es pas sûr, dis-le dans "risposta" et mets "altro". N'invente jamais un chiffre ni un article de loi.`;

  /* -> { v: "yes"|"no"|indice|"other", text, via } ou null (jamais d'exception) */
  Ia.free = async function (text, mcq, o = {}) {
    if (!Ia.ready()) return null;
    const errs = [];
    for (const c of [Ia.cfg, Ia.cfg2].filter(Boolean)) {
      const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), o.timeout || 12000);
      try {
        const body = { model: c.model, temperature: 0, max_tokens: 350,
          messages: [{ role: "system", content: freePrompt(o.subject) }, { role: "user", content: text }],
          response_format: { type: "json_object" } };
        let data;
        try { data = await call(c, body, ctrl.signal); }
        catch (e) { if (e.status !== 400) throw e; delete body.response_format; data = await call(c, body, ctrl.signal); }
        const j = parseJson(data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content);
        const txt = j && typeof j.risposta === "string" ? j.risposta.trim() : "";
        if (!j || !txt) throw new Error("réponse illisible");
        const r = String(j.verdetto || "").trim().toLowerCase();
        let v = "other";
        if (/^(vero|true|v)$/.test(r)) v = "yes";
        else if (/^(falso|false|f)$/.test(r)) v = "no";
        else if (mcq && /^[a-f]$/.test(r) && "abcdef".indexOf(r) < mcq.opts.length) v = "abcdef".indexOf(r);
        Ia.lastFree = errs.length ? "secours utilisé" : "";
        return { v, text: txt.slice(0, 600), via: c.label || c.model };
      } catch (e) { errs.push((c.label || c.model) + " : " + (e.name === "AbortError" ? "délai dépassé" : e.message)); }
      finally { clearTimeout(timer); }
    }
    Ia.lastFree = errs.join(" ; ");
    return null;
  };

  async function testOne(c) {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 12000);
    const nm = c.label || c.model;
    try {
      await call(c, { model: c.model, max_tokens: 5, messages: [{ role: "user", content: "OK ?" }] }, ctrl.signal);
      return { ok: true, msg: nm + " : connexion réussie." };
    } catch (e) {
      let hint = "";
      try {
        const r = await fetch(c.url.replace(/\/$/, "") + "/models", { headers: { Authorization: "Bearer " + c.key }, signal: ctrl.signal });
        if (r.ok) {
          const ids = ((await r.json()).data || []).map(x => String(x.id || "").replace(/^models\//, "")).filter(Boolean);
          if (ids.length) hint = " Modèles proposés : " + ids.slice(0, 8).join(", ") + ".";
        }
      } catch (x) {}
      return { ok: false, msg: nm + " : échec : " + (e.name === "AbortError" ? "délai dépassé" : e.message) + "." + hint };
    } finally { clearTimeout(timer); }
  }
  /* test de chaque clé renseignée (principale puis secours) */
  Ia.test = async function () {
    if (!Ia.ready()) return { ok: false, msg: "Renseigne la clé, l'adresse et le modèle." };
    const rs = [];
    for (const c of [Ia.cfg, Ia.cfg2].filter(Boolean)) rs.push(await testOne(c));
    return { ok: rs.every(r => r.ok), msg: rs.map(r => r.msg).join(" — ") };
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Ia; else root.Ia = Ia;
})(typeof self !== "undefined" ? self : this);
