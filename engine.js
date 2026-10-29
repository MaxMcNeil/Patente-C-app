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

  const digits = s => s.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  const norm = s => digits(String(s)).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const isNum = w => /^\d+$/.test(w);
  const stem = w => (isNum(w) ? w : w.length > 5 ? w.slice(0, 5) : w);
  const toks = s => norm(s).split(" ").filter(w => w && (isNum(w) || (w.length > 1 && !STOP.has(w)))).map(stem);
  const numsOf = s => (digits(String(s)).match(/\d+(?:[.,]\d+)?/g) || []).map(x => x.replace(",", "."));
  const hasNeg = s => norm(s).split(" ").some(w => NEG.has(w));
  const sentences = t => (t.match(/[^.!?؟…]+(?:[.!?؟…]+|$)/g) || [t]).map(x => x.trim()).filter(Boolean);
  const cover = (qt, set) => {
    const u = [...new Set(qt)];
    return u.length ? u.filter(w => set.has(w)).length / u.length : 0;
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

  function search(idx, query, k = 5) {
    const qt = toks(query);
    if (!qt.length || !idx.N) return [];
    const r = idx.docs.map(d => ({ d, s: bm25(idx, qt, d) })).filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s).slice(0, k);
    const m = r.length ? r[0].s : 1;
    r.forEach(x => (x.rel = x.s / m));
    return r;
  }

  /* meilleure fenêtre d'une ou deux phrases consécutives pour un ensemble de mots */
  function bestWindow(text, qt) {
    const ss = sentences(text);
    let best = { w: ss[0] || text, cv: 0 };
    for (let i = 0; i < ss.length; i++) {
      for (const w of [ss[i], i + 1 < ss.length ? ss[i] + " " + ss[i + 1] : null]) {
        if (!w) continue;
        const cv = cover(qt, new Set(toks(w)));
        if (cv > best.cv + 1e-9) best = { w, cv };
      }
    }
    return best;
  }

  function passage(idx, r, sentence) {
    const c = r.d.c, src = idx.sources[c.s] || {};
    return {
      text: sentence || c.t, chunk: c.t, loc: c.l || null, title: src.title || "", origin: src.origin || "",
      statut: src.statut || "non vérifié", auto: !!src.auto, type: src.type || ""
    };
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

  function answerMcq(idx, q, opts) {
    const top = search(idx, q, 8);
    if (!top.length) return { kind: "mcq", verdict: "unsure", reason: "no-source", alts: [] };
    const qt = toks(q);
    const wins = top.map(r => ({ r, f: 0.6 + 0.4 * r.rel, ws: windows(r.d.c.t) }));
    const sc = opts.map((o, i) => {
      const ot = toks(o);
      let best = { score: 0, oc: 0, r: null, w: "" };
      for (const { r, f, ws } of wins) {
        for (const x of ws) {
          const oc = cover(ot, x.set), qc = cover(qt, x.set);
          const s = f * x.f * (0.5 * oc + 0.5 * qc);
          if (s > best.score) best = { score: s, oc, r, w: x.w };
        }
      }
      return { i, ...best };
    });
    const [a, b] = [...sc].sort((x, y) => y.score - x.score);
    const margin = a.score > 0 ? (a.score - (b ? b.score : 0)) / a.score : 0;
    const alts = top.slice(0, 2).map(r => passage(idx, r));
    if (!a.r || a.oc < 0.5 || a.score < 0.4 || margin < 0.12) {
      return { kind: "mcq", verdict: "unsure", reason: "ambiguous", alts };
    }
    return {
      kind: "mcq", verdict: a.i, conf: margin >= 0.35 && a.oc >= 0.75 ? "haute" : "moyenne",
      passage: passage(idx, a.r, a.w), alts
    };
  }

  /* ---------- vrai / faux ---------- */
  function answerYN(idx, raw) {
    const stmt = raw.replace(/(vrai ou faux|vero o falso|oui ou non|s[iì] o no|true or false|yes or no)/gi, " ")
      .replace(/^\s*(est-ce que|est ce que|è vero che|è corretto che|is it true that)\s+/i, "").trim();
    const qt = toks(stmt);
    if (!qt.length) return { kind: "yn", verdict: "unsure", reason: "empty", alts: [] };
    const top = search(idx, stmt, 5);
    if (!top.length) return { kind: "yn", verdict: "unsure", reason: "no-source", alts: [] };
    let best = null;
    for (const r of top) {
      const w = bestWindow(r.d.c.t, qt);
      const v = w.cv * 0.8 + r.rel * 0.2;
      if (!best || v > best.v) best = { v, cv: w.cv, w: w.w, r };
    }
    const alts = top.slice(0, 2).map(r => passage(idx, r));
    const p = passage(idx, best.r, best.w);
    if (best.cv < 0.6) return { kind: "yn", verdict: "unsure", reason: "weak", alts };
    const nS = numsOf(stmt), nC = numsOf(best.w);
    const missing = nS.filter(n => !nC.includes(n));
    if (missing.length) {
      return nC.length
        ? { kind: "yn", verdict: "no", conf: "haute", reason: "number", sourceNums: nC, passage: p, alts }
        : { kind: "yn", verdict: "unsure", reason: "number-missing", alts };
    }
    const negMismatch = hasNeg(stmt) !== hasNeg(best.w);
    if (best.cv >= 0.75) {
      if (negMismatch) return { kind: "yn", verdict: "no", conf: "moyenne", reason: "negation", passage: p, alts };
      return { kind: "yn", verdict: "yes", conf: best.cv >= 0.9 ? "haute" : "moyenne", passage: p, alts };
    }
    return { kind: "yn", verdict: "unsure", reason: "weak", alts };
  }

  function answer(idx, text) {
    const m = parseMcq(text);
    return m ? Object.assign({ options: m.opts, question: m.q }, answerMcq(idx, m.q, m.opts)) : answerYN(idx, text);
  }

  const api = { norm, toks, buildIndex, search, parseMcq, answerMcq, answerYN, answer, sentences };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof self !== "undefined" ? self : this);
