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
  const Ia = { PRESETS, cfg: null, cache: new Map(), last: "" };

  Ia.configure = c => { Ia.cfg = c && c.key && c.url && c.model ? c : null; };
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

  async function call(body, signal) {
    const c = Ia.cfg;
    const r = await fetch(c.url.replace(/\/$/, "") + "/chat/completions", {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + c.key },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      let m = ""; try { m = (await r.json()).error.message || ""; } catch (e) {}
      const err = new Error(r.status + (m ? " " + m.slice(0, 160) : "")); err.status = r.status; throw err;
    }
    return r.json();
  }

  /* -> { variants: [textes à essayer après l'original], kind, qcm } ou null (jamais d'exception) */
  Ia.understand = async function (text, o = {}) {
    if (!Ia.ready()) return null;
    const key = (o.lang || "") + "|" + text;
    if (Ia.cache.has(key)) return Ia.cache.get(key);
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), o.timeout || 9000);
    try {
      const body = {
        model: Ia.cfg.model, temperature: 0, max_tokens: 400,
        messages: [{ role: "system", content: systemPrompt(o.lang, o.subject) }, { role: "user", content: text }],
        response_format: { type: "json_object" }
      };
      let data;
      try { data = await call(body, ctrl.signal); }
      catch (e) { if (e.status !== 400) throw e; delete body.response_format; data = await call(body, ctrl.signal); }
      const j = parseJson(data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content);
      if (!j) throw new Error("réponse illisible");
      const out = { variants: [], kind: j.genre || "autre", rejected: 0 };
      for (const r of (Array.isArray(j.reformulations) ? j.reformulations : []).slice(0, 3)) {
        if (Ia.guard(text, r)) out.variants.push(r.trim()); else out.rejected++;
      }
      const Eng = E();
      if (j.qcm && Ia.guardMcq(text, Eng.parseMcq(text), j.qcm)) {
        const L = "ABCDEF";
        out.variants.push(String(j.qcm.question || "").trim() + " " + j.qcm.options.map((x, i) => L[i] + " " + x.trim()).join(" "));
      } else if (j.qcm) out.rejected++;
      Ia.cache.set(key, out);
      Ia.last = "";
      return out;
    } catch (e) {
      Ia.last = e.name === "AbortError" ? "délai dépassé" : e.message;
      return null;
    } finally { clearTimeout(timer); }
  };

  /* test de la clé : un petit appel ; en cas d'échec, liste de modèles proposés */
  Ia.test = async function () {
    if (!Ia.ready()) return { ok: false, msg: "Renseigne la clé, l'adresse et le modèle." };
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      await call({ model: Ia.cfg.model, max_tokens: 5, messages: [{ role: "user", content: "OK ?" }] }, ctrl.signal);
      return { ok: true, msg: "Connexion réussie." };
    } catch (e) {
      let hint = "";
      try {
        const r = await fetch(Ia.cfg.url.replace(/\/$/, "") + "/models", { headers: { Authorization: "Bearer " + Ia.cfg.key }, signal: ctrl.signal });
        if (r.ok) {
          const ids = ((await r.json()).data || []).map(x => String(x.id || "").replace(/^models\//, "")).filter(Boolean);
          if (ids.length) hint = " Modèles proposés : " + ids.slice(0, 8).join(", ") + ".";
        }
      } catch (x) {}
      return { ok: false, msg: "Échec : " + (e.name === "AbortError" ? "délai dépassé" : e.message) + "." + hint };
    } finally { clearTimeout(timer); }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Ia; else root.Ia = Ia;
})(typeof self !== "undefined" ? self : this);
