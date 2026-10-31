/* Moteur de réponse : recherche (BM25) + QCM + vrai/faux. Aucune dépendance, tourne dans le navigateur. */
(function (root) {
  "use strict";

  const STOP = new Set((
    "le la les un une des de du d l et ou au aux en dans pour par sur est sont ce cet cette ces que qui quoi quel quelle quels quelles " +
    "il elle on je tu vous nous se sa son ses leur leurs ne pas plus avec sans a ont été etre être fait comme mais donc car si y " +
    "oui non vrai faux " +
    "il lo gli i uno di dello della dei degli delle e o che chi cui è sono ha hanno come si non del al allo alla ai agli alle dal dallo " +
    "dalla nel nello nella nei negli nelle sul sullo sulla questo questa quello quale quali vero falso " +
    "the an of to in on at for and or is are was were be been by with from that this it as " +
    "qual cosa quanto quanti quanta quante dove quando perche perché combien comment pourquoi quand " +
    "what which how many much when where why who does do " +
    "في من على إلى عن مع هذا هذه التي الذي أن إن و أو هو هي هم"
  ).split(/\s+/));

  const NEG = new Set((
    "pas non jamais aucun aucune sans mai nessun nessuno nessuna senza not never no without nobody لا ليس لم لن بدون غير"
  ).split(/\s+/));

  const GAP = "[…]"; // mot illisible laissé par l'OCR : on ne conclut jamais sur un passage qui en contient
  const digits = s => s.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  const norm = s => digits(String(s)).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const isNum = w => /^\d+$/.test(w);
  const stem = w => (isNum(w) ? w : w.length > 5 ? w.slice(0, 5) : w);
  const toks = s => norm(s).split(" ").filter(w => w && (isNum(w) || (w.length > 1 && !STOP.has(w)))).map(stem);
  const numsOf = s => (digits(String(s)).match(/\d+(?:[.,]\d+)?/g) || []).map(x => x.replace(",", "."));
  const hasNeg = s => norm(s).split(" ").some(w => NEG.has(w));
  const sentences = t => {
    const safe = String(t).split(GAP).join("\u0001"); // « […] » ne doit pas couper la phrase
    return (safe.match(/[^.!?؟…]+(?:[.!?؟…]+|$)/g) || [safe]).map(x => x.split("\u0001").join(GAP).trim()).filter(Boolean);
  };
  const cover = (qt, set) => {
    const u = [...new Set(qt)];
    return u.length ? u.filter(w => set.has(w)).length / u.length : 0;
  };

  /* ---------- sens (facultatif) : vecteurs fournis par l'appli, jamais requis ----------
     sem = { qv, T, chunk: Map(id -> cosinus), win: Map(texte -> vecteur), optv: [vecteur par option] } */
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  const semCos = (sem, v, text) => { const w = sem && sem.win && sem.win.get(text); return w && v ? dot(v, w) : null; };
  /* cosinus -> « couverture » pour les phrases vrai/faux : 0.8 seulement au-dessus du seuil T (jamais plus : confiance moyenne) */
  const semCv = (sem, text) => { const c = semCos(sem, sem && sem.qv, text); return c !== null && c >= sem.T ? 0.8 : 0; };
  /* cosinus -> score 0..1 pour une option de QCM */
  const semOpt = (sem, i, text, optText) => {
    const c = semCos(sem, sem && sem.optv && sem.optv[i], text);
    if (c === null || c < sem.T - 0.1) return 0;
    const nO = numsOf(optText);
    if (nO.length && !nO.every(n => numsOf(text).includes(n))) return 0; // un chiffre de l'option absent du passage : le sens ne suffit pas
    return Math.min(1, 0.5 + (c - (sem.T - 0.1)) / (1 - (sem.T - 0.1)) * 0.5);
  };

  /* ---------- index BM25 ---------- */
  function buildIndex(chunks, sources) {
    const docs = chunks.map(c => {
      const t = toks(c.t), tf = new Map();
      t.forEach(w => tf.set(w, (tf.get(w) || 0) + 1));
      return { c, tf, len: t.length, set: new Set(t) };
    });
    const df = new Map();
    docs.forEach(d => d.tf.forEach((_, w) => df.set(w, (df.get(w) || 0) + 1)));
    const N = docs.length;
    return { docs, df, N, avg: docs.reduce((a, d) => a + d.len, 0) / Math.max(1, N), sources: sources || {} };
  }

  function bm25(idx, qt, d) {
    const k1 = 1.4, b = 0.75;
    let s = 0;
    for (const w of new Set(qt)) {
      const f = d.tf.get(w);
      if (!f) continue;
      const n = idx.df.get(w);
      s += Math.log(1 + (idx.N - n + 0.5) / (n + 0.5)) * f * (k1 + 1) / (f + k1 * (1 - b + b * d.len / idx.avg));
    }
    return s;
  }

  function search(idx, query, k = 5, sem = null) {
    const qt = toks(query);
    if (!idx.N || (!qt.length && !sem)) return [];
    const all = idx.docs.map(d => ({ d, s: qt.length ? bm25(idx, qt, d) : 0 }));
    const m0 = Math.max(1e-9, ...all.map(x => x.s));
    all.forEach(x => {
      const c = sem && sem.chunk ? sem.chunk.get(x.d.c.id) || 0 : 0;
      const cs = sem && c >= sem.T - 0.15 ? Math.min(1, 0.5 + (c - (sem.T - 0.15)) / (1 - (sem.T - 0.15)) * 0.5) : 0; // idem : en dessous du seuil, le sens ne compte pas
      x.rel = Math.max(x.s / m0, sem ? cs : 0);
    });
    return all.filter(x => x.rel > 0).sort((a, b) => b.rel - a.rel).slice(0, k);
  }

  /* meilleure fenêtre d'une ou deux phrases consécutives pour un ensemble de mots */
  function bestWindow(text, qt, sem) {
    const ss = sentences(text);
    let best = { w: ss[0] || text, cv: 0, c: 0, viaSens: false };
    for (let i = 0; i < ss.length; i++) {
      for (const w of [ss[i], i + 1 < ss.length ? ss[i] + " " + ss[i + 1] : null]) {
        if (!w) continue;
        const lex = cover(qt, new Set(toks(w))), sv = sem ? semCv(sem, w) : 0;
        const cv = Math.max(lex, sv), c = sv ? semCos(sem, sem.qv, w) : 0;
        // à égalité de seuil, la phrase la plus proche par le sens gagne (évite d'importer la négation d'une phrase voisine)
        if (cv + 0.001 * c > best.cv + 0.001 * best.c + 1e-9) best = { w, cv, c, viaSens: sv > lex };
      }
    }
    return best;
  }

  const RANK = { "correctif": 4, "officiel": 3, "vérifié": 2, "non vérifié": 1 };
  const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };
  /* deux pages d'un même site, ou deux copies d'une même chose, ne comptent que pour UNE source indépendante */
  const grpOf = (idx, sid) => { const s = idx.sources[sid] || {}; return s.site || hostOf(s.origin || "") || sid; };

  function passage(idx, r, sentence) {
    const c = r.d.c, src = idx.sources[c.s] || {}, statut = src.statut || "non vérifié";
    return {
      text: sentence || c.t, chunk: c.t, loc: c.l || null, title: src.title || "", origin: src.origin || "",
      statut, rank: RANK[statut] || 1, auto: !!src.auto, type: src.type || "", date: src.date || "", sid: c.s
    };
  }
  const say = (p, k) => Object.assign({}, p, { says: k });

  /* Départage des votes entre sources indépendantes.
     Un camp gagne seulement s'il a une source vérifiée ou officielle ET que son meilleur rang dépasse strictement
     celui de l'autre camp. Sinon (officiel contre officiel, deux non vérifiées, etc.) : on ne tranche pas. */
  function resolveVotes(decisive) {
    const keys = [...new Set(decisive.map(x => x.k))];
    if (keys.length === 1) return { k: keys[0], basis: decisive, against: [] };
    const top = k => Math.max(0, ...decisive.filter(x => x.k === k).map(x => x.rank));
    const ranked = keys.map(k => ({ k, t: top(k) })).sort((a, b) => b.t - a.t);
    if (ranked[0].t === 4 && ranked[1].t < 4) { // correctif manuel : il fait foi, on n'affiche aucun désaccord
      return { k: ranked[0].k, basis: decisive.filter(x => x.k === ranked[0].k), against: [] };
    }
    if (ranked[0].t >= 2 && ranked[0].t > ranked[1].t) {
      return { k: ranked[0].k, basis: decisive.filter(x => x.k === ranked[0].k), against: decisive.filter(x => x.k !== ranked[0].k) };
    }
    return null;
  }

  function confidence(basis, against, base) {
    let c = base;
    if (Math.max(...basis.map(x => x.rank)) === 1 && basis.length === 1) c = "basse"; // une seule source non vérifiée
    if (against.length && c === "haute") c = "moyenne";                               // quelqu'un dit le contraire
    return c;
  }

  /* ---------- QCM : A ... B ... C ... ---------- */
  function parseMcq(raw) {
    const words = String(raw).replace(/\s+/g, " ").trim().split(" ");
    const marks = [];
    words.forEach((w, i) => {
      const m = w.match(/^\(?([a-dA-D])[).:,\-]*$/);
      if (m) marks.push({ L: m[1].toLowerCase(), i });
    });
    let best = null;
    for (const m0 of marks) {
      if (m0.L !== "a") continue;
      const seq = [m0];
      for (const L of ["b", "c", "d"]) {
        const nx = marks.find(m => m.L === L && m.i > seq[seq.length - 1].i + 1);
        if (!nx) break;
        seq.push(nx);
      }
      if (seq.length >= 2 && (!best || seq.length > best.length || (seq.length === best.length && seq[0].i > best[0].i))) best = seq;
    }
    if (!best || best[0].i < 3) return null;
    const tail = /\s+(réponse|reponse|risposta|option|opzione|choix|scelta|answer|ou|o|or)$/i;
    const q = words.slice(0, best[0].i).join(" ").replace(tail, "").trim();
    const opts = best.map((m, k) => {
      const end = k + 1 < best.length ? best[k + 1].i : words.length;
      let t = words.slice(m.i + 1, end).join(" ");
      while (tail.test(t)) t = t.replace(tail, "");
      return t.trim();
    });
    return opts.every(Boolean) ? { q, opts } : null;
  }

  /* fenêtres d'une phrase, ou de deux phrases consécutives (légèrement pénalisées) */
  function windows(text) {
    const ss = sentences(text), out = [];
    ss.forEach((s, i) => {
      out.push({ w: s, f: 1, set: new Set(toks(s)) });
      if (i + 1 < ss.length) {
        const w = s + " " + ss[i + 1];
        out.push({ w, f: 0.8, set: new Set(toks(w)) });
      }
    });
    return out;
  }

  function scoreMcq(wins, qt, opts, sem) {
    const sc = opts.map((o, i) => {
      const ot = toks(o);
      let best = { score: 0, oc: 0, r: null, w: "", viaSens: false };
      for (const { r, f, ws } of wins) {
        for (const x of ws) {
          let oc = cover(ot, x.set), qc = cover(qt, x.set), v = f * x.f * (0.5 * oc + 0.5 * qc), vs = false;
          if (sem && oc < 0.5) {                       // les mots ne suffisent pas : on regarde le sens
            const s = semOpt(sem, i, x.w, o);
            if (s >= 0.5 && f * x.f * s > v) { v = f * x.f * s; oc = s; vs = true; }
          }
          if (v > best.score) best = { score: v, oc, r, w: x.w, viaSens: vs };
        }
      }
      return { i, ...best };
    });
    const [a, b] = [...sc].sort((x, y) => y.score - x.score);
    return { a, margin: a.score > 0 ? (a.score - (b ? b.score : 0)) / a.score : 0 };
  }

  function answerMcq(idx, q, opts, o = {}) {
    const top = search(idx, q, 12, o.sem);
    if (!top.length) return { kind: "mcq", verdict: "unsure", reason: "no-source", alts: [] };
    const qt = toks(q), groups = new Map();
    for (const r of top) {
      const g = grpOf(idx, r.d.c.s);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(r);
    }
    const alts = top.slice(0, 2).map(r => passage(idx, r));
    const usable = [];
    let gap = null;
    for (const rs of groups.values()) {            // chaque source indépendante vote séparément
      const wins = rs.map(r => ({ r, f: 0.6 + 0.4 * r.rel, ws: windows(r.d.c.t) }));
      const { a, margin } = scoreMcq(wins, qt, opts, o.sem);
      if (!a.r || a.oc < 0.5 || a.score < 0.4 || margin < 0.12) continue;
      const p = passage(idx, a.r, a.w);
      if (a.w.includes(GAP)) { gap = gap || p; continue; }
      usable.push({ k: a.i, rank: p.rank, v: a.score, p, viaSens: a.viaSens, base: margin >= 0.35 && a.oc >= 0.75 ? "haute" : "moyenne" });
    }
    const decisive = o.strict ? usable.filter(x => x.rank >= 2) : usable;
    if (!decisive.length) {
      if (usable.length) return { kind: "mcq", verdict: "unsure", reason: "unverified-only", alts: usable.map(x => say(x.p, x.k)) };
      return gap ? { kind: "mcq", verdict: "unsure", reason: "gap", alts: [gap] }
                 : { kind: "mcq", verdict: "unsure", reason: "ambiguous", alts };
    }
    const res = resolveVotes(decisive);
    if (!res) return { kind: "mcq", verdict: "unsure", reason: "conflict", alts: decisive.slice(0, 4).map(x => say(x.p, x.k)) };
    const main = res.basis.slice().sort((a, b) => b.rank - a.rank || b.v - a.v)[0];
    return {
      kind: "mcq", verdict: res.k, conf: confidence(res.basis, res.against, main.base), passage: main.p, viaSens: !!main.viaSens,
      support: res.basis.filter(x => x !== main).map(x => x.p), conflict: res.against.map(x => say(x.p, x.k)),
      nSources: res.basis.length, alts
    };
  }

  /* ---------- vrai / faux ---------- */
  function judgeYN(stmt, w, cv) {
    if (w.includes(GAP)) return { v: "unsure", reason: "gap" };
    if (cv < 0.6) return { v: "unsure", reason: "weak" };
    const nS = numsOf(stmt), nC = numsOf(w);
    if (nS.some(n => !nC.includes(n))) {
      return nC.length ? { v: "no", reason: "number", conf: "haute", sourceNums: nC } : { v: "unsure", reason: "number-missing" };
    }
    if (cv >= 0.75) {
      return hasNeg(stmt) !== hasNeg(w) ? { v: "no", reason: "negation", conf: "moyenne" }
                                        : { v: "yes", conf: cv >= 0.9 ? "haute" : "moyenne" };
    }
    return { v: "unsure", reason: "weak" };
  }

  const stmtOf = raw => String(raw).replace(/(vrai ou faux|vero o falso|oui ou non|s[iì] o no|true or false|yes or no)/gi, " ")
    .replace(/^[\s:,.\-–]+/, "")
    .replace(/^\s*(est-ce que|est ce que|è vero che|è corretto che|is it true that)\s+/i, "").trim();

  function answerYN(idx, raw, o = {}) {
    const stmt = stmtOf(raw);
    const qt = toks(stmt);
    if (!qt.length && !o.sem) return { kind: "yn", verdict: "unsure", reason: "empty", alts: [] };
    const top = search(idx, stmt, 12, o.sem);
    if (!top.length) return { kind: "yn", verdict: "unsure", reason: "no-source", alts: [] };
    const per = new Map();                         // meilleure fenêtre par source indépendante
    for (const r of top) {
      const w = bestWindow(r.d.c.t, qt, o.sem), v = w.cv * 0.8 + r.rel * 0.2, g = grpOf(idx, r.d.c.s);
      if (!per.has(g) || v > per.get(g).v) per.set(g, { v, cv: w.cv, w: w.w, r, viaSens: w.viaSens });
    }
    const js = [...per.values()].sort((a, b) => b.v - a.v).map(c => {
      const p = passage(idx, c.r, c.w), j = judgeYN(stmt, c.w, c.cv);
      return { k: j.v, rank: p.rank, v: c.v, p, j, viaSens: c.viaSens };
    });
    const alts = top.slice(0, 2).map(r => passage(idx, r));
    const usable = js.filter(x => x.k !== "unsure");
    const decisive = o.strict ? usable.filter(x => x.rank >= 2) : usable;
    if (!decisive.length) {
      if (usable.length) return { kind: "yn", verdict: "unsure", reason: "unverified-only", alts: usable.map(x => say(x.p, x.k)) };
      const first = js[0];
      return { kind: "yn", verdict: "unsure", reason: first.j.reason, alts: first.j.reason === "gap" ? [first.p] : alts };
    }
    const res = resolveVotes(decisive);
    if (!res) return { kind: "yn", verdict: "unsure", reason: "conflict", alts: decisive.slice(0, 4).map(x => say(x.p, x.k)) };
    const main = res.basis.slice().sort((a, b) => b.rank - a.rank || b.v - a.v)[0];
    return {
      kind: "yn", verdict: res.k, conf: confidence(res.basis, res.against, main.j.conf), reason: main.j.reason,
      sourceNums: main.j.sourceNums, viaSens: !!main.viaSens, passage: main.p, support: res.basis.filter(x => x !== main).map(x => x.p),
      conflict: res.against.map(x => say(x.p, x.k)), nSources: res.basis.length, alts
    };
  }

  function answer(idx, text, o = {}) {
    const m = parseMcq(text);
    return m ? Object.assign({ options: m.opts, question: m.q }, answerMcq(idx, m.q, m.opts, o)) : answerYN(idx, text, o);
  }

  /* Plusieurs formulations de la même question (l'originale en premier, puis les reformulations contrôlées de l'IA).
     Une réponse n'est donnée que si toutes les formulations qui concluent disent la même chose. */
  function answerMulti(idx, variants, o = {}) {
    const res = variants.map((v, i) => {
      const a = answer(idx, v.text, Object.assign({}, o, { sem: v.sem || o.sem }));
      a.understood = v.text; a.variant = i;
      return a;
    });
    const definite = res.filter(a => a.verdict !== "unsure");
    if (!definite.length) return res[0];
    if (new Set(definite.map(a => String(a.verdict))).size > 1) {
      return { kind: res[0].kind, verdict: "unsure", reason: "reformulation-conflict",
               alts: definite.map(a => Object.assign({}, a.passage, { says: a.verdict, understood: a.understood })) };
    }
    const rk = a => (a.passage ? a.passage.rank : 0) * 10 + ({ haute: 2, moyenne: 1, basse: 0 }[a.conf] || 0);
    const best = definite.slice().sort((a, b) => rk(b) - rk(a) || a.variant - b.variant)[0];
    best.viaIA = best.variant > 0;
    return best;
  }

  const windowTexts = t => windows(t).map(x => x.w);
  const api = { norm, toks, buildIndex, search, parseMcq, answerMcq, answerYN, answer, sentences, resolveVotes, windowTexts, stmtOf, answerMulti, numsOf, hasNeg };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof self !== "undefined" ? self : this);
