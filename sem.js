/* Compréhension du sens (facultatif) : un petit modèle multilingue tourne DANS le navigateur, sans serveur ni clé.
   Il ne décide jamais seul : il aide à TROUVER le bon passage et à le rapprocher de ta question. Les chiffres, les négations
   et l'autorité des sources restent contrôlés par engine.js. Si le modèle n'est pas chargé, l'appli marche comme avant. */
(function (root) {
  "use strict";
  const E = () => (typeof module !== "undefined" && module.exports ? require("./engine.js") : root.Engine);

  const Sem = {
    MODEL: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
    T: 0.78,                      // seuil de ressemblance ; à régler avec test-sens.html
    state: { status: "off", msg: "" },
    vecs: new Map(),              // id de passage -> [vecteurs de ses morceaux]
    winCache: new Map(),          // texte -> vecteur
    _embed: null
  };

  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  const fnv = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const tick = () => new Promise(r => setTimeout(r, 0));

  /* morceaux d'environ 350 caractères (le modèle lit ~128 mots au maximum) */
  Sem.pieces = function (text, max = 350) {
    const out = []; let cur = "";
    for (const s of E().sentences(text)) {
      if (cur && (cur + " " + s).length > max) { out.push(cur); cur = s; } else cur = cur ? cur + " " + s : s;
    }
    if (cur) out.push(cur);
    return out.map(x => x.slice(0, 600));
  };

  Sem.setEmbedder = function (fn) { Sem._embed = fn; Sem.state = { status: "ready", msg: "" }; };
  Sem.ready = () => Sem.state.status === "ready" && !!Sem._embed;

  /* ---------- chargement du vrai modèle ---------- */
  Sem.load = async function (onProgress) {
    if (Sem.ready()) return;
    Sem.state = { status: "loading", msg: "" };
    try {
      const tf = await import("./vendor/transformers.min.js");
      tf.env.allowLocalModels = false;
      tf.env.useBrowserCache = true;
      tf.env.backends.onnx.wasm.wasmPaths = new URL("./vendor/", location.href).href;
      tf.env.backends.onnx.wasm.numThreads = 1;      // GitHub Pages n'autorise pas les threads partagés
      const pipe = await tf.pipeline("feature-extraction", Sem.MODEL, {
        dtype: "q8",
        progress_callback: p => { if (onProgress && p && p.status === "progress") onProgress(p); }
      });
      Sem._embed = async texts => {
        const out = [];
        for (let i = 0; i < texts.length; i += 8) {
          const t = await pipe(texts.slice(i, i + 8), { pooling: "mean", normalize: true });
          const d = t.dims[1];
          for (let j = 0; j < t.dims[0]; j++) out.push(Float32Array.from(t.data.subarray(j * d, (j + 1) * d)));
        }
        return out;
      };
      Sem.state = { status: "ready", msg: "" };
    } catch (e) {
      Sem.state = { status: "error", msg: String(e && e.message || e) };
      throw e;
    }
  };

  Sem.embed = async texts => {
    if (!Sem.ready()) throw new Error("modèle non chargé");
    return Sem._embed(texts);
  };

  /* ---------- vecteurs des passages (calculés une fois, gardés sur le téléphone) ----------
     store = { load: async () => objet|undefined, save: async objet => void } */
  Sem.index = async function (chunks, store, onProgress) {
    const cache = (store && (await store.load())) || { model: Sem.MODEL, items: {} };
    const items = cache.model === Sem.MODEL ? cache.items : {};
    const next = {}, todo = [];
    Sem.vecs = new Map();
    for (const c of chunks) {
      Sem.pieces(c.t).forEach((p, j) => {
        const key = c.id + "~" + j, h = fnv(p), old = items[key];
        if (old && old.h === h) { next[key] = old; }
        else todo.push({ key, h, p, id: c.id });
      });
    }
    let done = 0;
    for (let i = 0; i < todo.length; i += 16) {
      const batch = todo.slice(i, i + 16), vs = await Sem.embed(batch.map(x => x.p));
      batch.forEach((x, k) => { next[x.key] = { h: x.h, v: Array.from(vs[k], z => Math.round(z * 127)) }; });
      done += batch.length;
      if (onProgress) onProgress(done, todo.length);
      if (store && done % 320 === 0) await store.save({ model: Sem.MODEL, items: Object.assign({}, items, next) });
      await tick();
    }
    for (const key of Object.keys(next)) {
      const id = key.slice(0, key.lastIndexOf("~"));
      if (!Sem.vecs.has(id)) Sem.vecs.set(id, []);
      Sem.vecs.get(id).push(Float32Array.from(next[key].v, z => z / 127));
    }
    if (store) await store.save({ model: Sem.MODEL, items: next });
    return { total: Object.keys(next).length, computed: todo.length };
  };

  /* ---------- préparation d'une question : tout ce que le moteur (synchrone) doit savoir du sens ---------- */
  Sem.prepare = async function (idx, text, T) {
    const Eng = E(), m = Eng.parseMcq(text);
    const q = m ? m.q : Eng.stmtOf(text);
    if (!q) return null;
    const qv = (await Sem.embed([q]))[0];
    const chunk = new Map();
    for (const [id, vs] of Sem.vecs) { let b = -1; for (const v of vs) { const c = dot(qv, v); if (c > b) b = c; } chunk.set(id, b); }
    const sem = { qv, T: T || Sem.T, chunk, win: new Map(), optv: null };
    if (m) sem.optv = await Sem.embed(m.opts.map(o => q + " " + o));
    const top = Eng.search(idx, q, 12, sem);                   // mêmes passages que ceux que le moteur va lire
    const need = new Set();
    for (const r of top) Eng.windowTexts(r.d.c.t).forEach(w => need.add(w));
    const missing = [...need].filter(w => !Sem.winCache.has(w));
    if (Sem.winCache.size > 6000) Sem.winCache.clear();
    for (let i = 0; i < missing.length; i += 16) {
      const b = missing.slice(i, i + 16), vs = await Sem.embed(b);
      b.forEach((w, k) => Sem.winCache.set(w, vs[k]));
    }
    for (const w of need) if (Sem.winCache.has(w)) sem.win.set(w, Sem.winCache.get(w));
    return sem;
  };

  Sem.dot = dot;
  if (typeof module !== "undefined" && module.exports) module.exports = Sem; else root.Sem = Sem;
})(typeof self !== "undefined" ? self : this);
