(() => {
  'use strict';

  /* ========== 要素 ========== */
  const $ = (id) => document.getElementById(id);
  const el = {
    tabSimple: $('tabSimple'), tabRoster: $('tabRoster'),
    total: $('totalInput'), boys: $('boysInput'), girls: $('girlsInput'),
    rosterBox: $('rosterBox'), boysList: $('boysList'), girlsList: $('girlsList'),
    rosterInfo: $('rosterInfo'), saveRoster: $('saveRosterBtn'),
    loadRoster: $('loadRosterBtn'), rosterStatus: $('rosterStatus'),
    methodSize: $('methodSize'), methodCount: $('methodCount'),
    valueLabel: $('valueLabel'), valueInput: $('valueInput'), valueUnit: $('valueUnit'),
    hint: $('liveHint'), level: $('levelSelect'), avoid: $('avoidCheck'),
    form: $('inputForm'), error: $('errorBox'),
    resultSection: $('resultSection'), resultMeta: $('resultMeta'), groups: $('groups'),
    again: $('againBtn'), copy: $('copyBtn'), copyStatus: $('copyStatus'),
    resetHistory: $('resetHistoryBtn'),
    viewTeacher: $('viewTeacher'), viewStudent: $('viewStudent'),
    showGender: $('showGender'), genderRow: $('genderRow'), fontSize: $('fontSize')
  };

  const KEY_ROSTER = 'randomGroup.roster.v1';
  const KEY_SETTINGS = 'randomGroup.settings.v1';
  const HISTORY_LIMIT = 10;

  const state = {
    mode: 'simple',               // 'simple' | 'roster'
    method: 'size',               // 'size' | 'count'
    simple: { total: '25', boys: '13', girls: '12' },
    vals: { size: '6', count: '4' },
    history: [],                  // 過去の結果（番号の配列の配列）
    signature: '',
    last: null,
    round: 0
  };

  /* ========== 保存（localStorage） ========== */
  const store = {
    get(key) {
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : null;
      } catch (e) { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    }
  };

  /* ========== 入力の読み取り ========== */
  function normalize(s) {
    return String(s)
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[．。]/g, '.')
      .trim();
  }

  function parseCount(raw, label, min) {
    const s = normalize(raw);
    if (s === '') return { error: `${label}を入力してください。` };
    if (!/^\d+$/.test(s)) {
      if (/^\d*\.\d*$/.test(s)) return { error: `${label}は小数ではなく整数で入力してください。` };
      return { error: `${label}は半角の整数で入力してください。` };
    }
    const v = parseInt(s, 10);
    if (v < min) return { error: `${label}は${min}以上にしてください。` };
    return { value: v };
  }

  function parseList(raw, label) {
    const s = normalize(raw)
      .replace(/[ー－―−～〜~]/g, '-');
    if (s === '') return { values: [] };
    const tokens = s.split(/[,\s、，;；]+/).filter(Boolean);
    const values = [];
    for (const t of tokens) {
      if (/^\d+$/.test(t)) {
        values.push(parseInt(t, 10));
      } else if (/^\d+-\d+$/.test(t)) {
        const [a, b] = t.split('-').map(Number);
        if (a > b || b - a > 500) return { error: `${label}の範囲指定「${t}」が正しくありません。` };
        for (let n = a; n <= b; n++) values.push(n);
      } else {
        return { error: `${label}に読み取れない文字があります：「${t}」` };
      }
    }
    if (values.some((n) => n < 1)) return { error: `${label}は1以上の番号で入力してください。` };
    const seen = new Set();
    const dup = new Set();
    values.forEach((n) => { if (seen.has(n)) dup.add(n); seen.add(n); });
    if (dup.size) return { error: `${label}に重複している番号があります：${[...dup].join('、')}` };
    return { values };
  }

  const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

  /* ========== グループ数・人数の計算 ========== */
  // 1グループの人数から、人数差1人以内になるグループ数を決める
  function groupCountFromSize(N, size) {
    const q = Math.floor(N / size);
    const r = N % size;
    const k = r * 2 > size ? q + 1 : q;
    return Math.max(1, k);
  }

  // 小さいグループから順に並べる（例：25人・4グループ → 6,6,6,7）
  function makeSizes(N, k) {
    const base = Math.floor(N / k);
    const extra = N % k;
    return Array.from({ length: k }, (_, i) => (i < k - extra ? base : base + 1));
  }

  function sizeText(sizes) {
    const min = sizes[0];
    const max = sizes[sizes.length - 1];
    return min === max ? `${min}人` : `${min}〜${max}人`;
  }

  /* ========== 入力の検証 ========== */
  function readInputs() {
    const errors = [];
    const add = (msg, kind) => errors.push({ msg, kind: kind || 'input' });
    let N = null, B = null, G = null, boysList = [], girlsList = [];

    if (state.mode === 'simple') {
      const t = parseCount(el.total.value, '全体の人数', 1);
      const b = parseCount(el.boys.value, '男子の人数', 1);
      const g = parseCount(el.girls.value, '女子の人数', 1);
      [t, b, g].forEach((r) => { if (r.error) add(r.error); });
      if (!t.error && !b.error && !g.error) {
        if (b.value + g.value !== t.value) {
          add('男子と女子の人数の合計が全体の人数と一致していません。', 'sum');
        } else {
          N = t.value; B = b.value; G = g.value;
          boysList = range(1, B);
          girlsList = range(B + 1, N);
        }
      }
    } else {
      const bl = parseList(el.boysList.value, '男子の番号');
      const gl = parseList(el.girlsList.value, '女子の番号');
      if (bl.error) add(bl.error);
      if (gl.error) add(gl.error);
      if (!bl.error && !gl.error) {
        const girlSet = new Set(gl.values);
        const both = bl.values.filter((n) => girlSet.has(n));
        if (both.length) {
          add(`男子と女子の両方に入っている番号があります：${both.join('、')}`);
        } else if (bl.values.length === 0 || gl.values.length === 0) {
          if (bl.values.length === 0) add('男子の番号を入力してください。');
          if (gl.values.length === 0) add('女子の番号を入力してください。');
        } else {
          boysList = bl.values; girlsList = gl.values;
          B = boysList.length; G = girlsList.length; N = B + G;
        }
      }
    }

    // グループの指定
    const isSize = state.method === 'size';
    const label = isSize ? '1グループの人数' : 'グループ数';
    const v = parseCount(el.valueInput.value, label, 1);
    let k = null;
    if (v.error) {
      add(v.error);
    } else if (N !== null) {
      if (v.value > N) {
        add(isSize ? '1グループの人数が全体の人数を超えています。' : 'グループ数が全体の人数を超えています。');
      } else {
        k = isSize ? groupCountFromSize(N, v.value) : v.value;
      }
    }

    let plan = '';
    if (!errors.length && N !== null && k !== null) {
      plan = `${N}人 → ${k}グループ（${sizeText(makeSizes(N, k))}）`;
    }
    return {
      errors,
      plan,
      data: errors.length ? null : { N, B, G, boysList, girlsList, k }
    };
  }

  function showErrors(errors) {
    el.error.textContent = '';
    if (!errors.length) { el.error.hidden = true; return; }
    const ul = document.createElement('ul');
    errors.forEach((e) => {
      const li = document.createElement('li');
      li.textContent = e.msg;
      ul.appendChild(li);
    });
    el.error.appendChild(ul);
    el.error.hidden = false;
  }

  function updateHint() {
    const res = readInputs();
    el.hint.classList.remove('warn');
    if (res.plan) {
      el.hint.textContent = res.plan;
    } else {
      const sum = res.errors.find((e) => e.kind === 'sum');
      if (sum) {
        el.hint.textContent = sum.msg;
        el.hint.classList.add('warn');
      } else {
        el.hint.textContent = '';
      }
    }
  }

  /* ========== グループ分けのアルゴリズム ========== */
  const randInt = (n) => Math.floor(Math.random() * n);

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 各グループの男子数：人数に比例した理想値の切り捨て＋余りを小数部の大きい順に配る
  function allocateBoys(sizes, B, N) {
    const info = sizes.map((s, i) => ({
      i, fl: Math.floor((s * B) / N), rem: (s * B) % N, rnd: Math.random()
    }));
    const left = B - info.reduce((a, x) => a + x.fl, 0);
    info.slice()
      .sort((a, b) => b.rem - a.rem || a.rnd - b.rnd)
      .slice(0, left)
      .forEach((x) => { x.fl += 1; });
    return info.map((x) => x.fl);
  }

  function partitionSignature(groups) {
    return groups
      .map((g) => g.slice().sort((a, b) => a - b).join(','))
      .sort()
      .join('|');
  }

  function generateGroups(data, level, avoid) {
    const { N, B, boysList, girlsList, k } = data;
    const sizes = makeSizes(N, k);
    const gender = {};
    boysList.forEach((n) => { gender[n] = 'M'; });
    girlsList.forEach((n) => { gender[n] = 'F'; });
    const everyone = boysList.concat(girlsList);

    // 過去に同じグループになった組み合わせへのペナルティ（直前の結果は重く）
    const penalty = {};
    if (avoid) {
      state.history.forEach((part, idx) => {
        const w = idx === state.history.length - 1 ? 3 : 1;
        part.forEach((g) => {
          for (let i = 0; i < g.length; i++) {
            for (let j = i + 1; j < g.length; j++) {
              const key = g[i] < g[j] ? `${g[i]}_${g[j]}` : `${g[j]}_${g[i]}`;
              penalty[key] = (penalty[key] || 0) + w;
            }
          }
        });
      });
    }
    const pw = (a, b) => penalty[a < b ? `${a}_${b}` : `${b}_${a}`] || 0;
    const hasPenalty = avoid && state.history.length > 0;

    // 「重視」モードで許す男子数の幅（理想値±1人）
    const lo = sizes.map((s) => Math.max(0, Math.floor((s * B) / N) - 1));
    const hi = sizes.map((s) => Math.min(s, Math.ceil((s * B) / N) + 1));

    function initial() {
      if (level === 'random') {
        const s = shuffle(everyone);
        let p = 0;
        return sizes.map((sz) => { const g = s.slice(p, p + sz); p += sz; return g; });
      }
      const boyCounts = allocateBoys(sizes, B, N);
      const sb = shuffle(boysList);
      const sg = shuffle(girlsList);
      let pb = 0, pg = 0;
      return sizes.map((sz, i) => {
        const nb = boyCounts[i];
        const ng = sz - nb;
        const g = sb.slice(pb, pb + nb).concat(sg.slice(pg, pg + ng));
        pb += nb; pg += ng;
        return g;
      });
    }

    const costIn = (s, g) => {
      let c = 0;
      for (const m of g) if (m !== s) c += pw(s, m);
      return c;
    };

    function totalScore(groups) {
      let sc = 0;
      groups.forEach((g) => {
        for (let i = 0; i < g.length; i++) {
          for (let j = i + 1; j < g.length; j++) sc += pw(g[i], g[j]);
        }
      });
      return sc;
    }

    // 2人を入れ替えながら、同じメンバーの重なりを減らす（人数は変わらない）
    function optimize(groups) {
      if (groups.length < 2) return;
      const boyCnt = groups.map((g) => g.reduce((a, n) => a + (gender[n] === 'M' ? 1 : 0), 0));
      const iterations = hasPenalty ? 6000 : 800;
      for (let t = 0; t < iterations; t++) {
        const ga = randInt(groups.length);
        let gb = randInt(groups.length - 1);
        if (gb >= ga) gb++;
        const ia = randInt(groups[ga].length);
        const ib = randInt(groups[gb].length);
        const a = groups[ga][ia];
        const b = groups[gb][ib];
        const aBoy = gender[a] === 'M';
        const bBoy = gender[b] === 'M';

        if (aBoy !== bBoy) {
          if (level === 'strict') continue;            // 男女の数を動かさない
          if (level === 'normal') {
            const nga = boyCnt[ga] - (aBoy ? 1 : 0) + (bBoy ? 1 : 0);
            const ngb = boyCnt[gb] - (bBoy ? 1 : 0) + (aBoy ? 1 : 0);
            if (nga < lo[ga] || nga > hi[ga] || ngb < lo[gb] || ngb > hi[gb]) continue;
          }
        }

        let delta = 0;
        if (hasPenalty) {
          delta = costIn(a, groups[gb]) + costIn(b, groups[ga])
            - 2 * pw(a, b)
            - costIn(a, groups[ga]) - costIn(b, groups[gb]);
        }
        if (delta < 0 || (delta === 0 && Math.random() < 0.5)) {
          groups[ga][ia] = b;
          groups[gb][ib] = a;
          if (aBoy !== bBoy) {
            boyCnt[ga] += (bBoy ? 1 : 0) - (aBoy ? 1 : 0);
            boyCnt[gb] += (aBoy ? 1 : 0) - (bBoy ? 1 : 0);
          }
        }
      }
    }

    function buildBest() {
      const needOpt = k > 1 && (hasPenalty || level === 'normal');
      const restarts = hasPenalty ? 4 : 1;
      let best = null;
      for (let r = 0; r < restarts; r++) {
        const g = initial();
        if (needOpt) optimize(g);
        const sc = totalScore(g);
        if (!best || sc < best.sc || (sc === best.sc && Math.random() < 0.5)) best = { g, sc };
      }
      return best.g;
    }

    // 直前と同じ分け方になった場合は引き直す
    let groups = buildBest();
    const lastSig = state.last ? partitionSignature(state.last.groups.map((g) => g.members)) : null;
    for (let attempt = 0; lastSig && attempt < 30; attempt++) {
      if (partitionSignature(groups) !== lastSig) break;
      groups = buildBest();
    }

    return groups.map((g) => {
      const members = g.slice().sort((a, b) => a - b);
      const boys = members.filter((n) => gender[n] === 'M').length;
      return { members, boys, girls: members.length - boys };
    });
  }

  /* ========== 実行 ========== */
  function run(scrollToResult) {
    const res = readInputs();
    showErrors(res.errors);
    if (!res.data) return;
    const d = res.data;

    const sig = JSON.stringify([d.boysList, d.girlsList, d.k]);
    if (sig !== state.signature) {
      state.history = [];
      state.round = 0;
      state.last = null;
      state.signature = sig;
    }

    const groups = generateGroups(d, el.level.value, el.avoid.checked);
    state.round += 1;
    state.last = { groups, N: d.N, k: d.k };
    state.history.push(groups.map((g) => g.members.slice()));
    if (state.history.length > HISTORY_LIMIT) state.history.shift();

    saveSettings();
    render();
    if (scrollToResult) el.resultSection.scrollIntoView({ block: 'start' });
  }

  /* ========== 表示 ========== */
  function render() {
    const r = state.last;
    if (!r) return;
    el.resultSection.hidden = false;
    document.body.dataset.size = el.fontSize.value;

    const teacher = el.viewTeacher.checked;
    el.genderRow.hidden = !teacher;
    const showGender = teacher && el.showGender.checked;

    el.resultMeta.textContent =
      `${state.round}回目　全体${r.N}人・${r.k}グループ（${sizeText(r.groups.map((g) => g.members.length))}）`;

    el.groups.textContent = '';
    r.groups.forEach((g, i) => {
      const card = document.createElement('article');
      card.className = `card c${i % 8}`;

      const head = document.createElement('div');
      head.className = 'card-head';
      const h3 = document.createElement('h3');
      h3.textContent = `グループ${i + 1}`;
      head.appendChild(h3);
      if (teacher) {
        const count = document.createElement('span');
        count.className = 'count';
        count.textContent = `${g.members.length}人`;
        head.appendChild(count);
      }
      card.appendChild(head);

      if (showGender) {
        const p = document.createElement('p');
        p.className = 'gender';
        p.textContent = `男子${g.boys}人　女子${g.girls}人`;
        card.appendChild(p);
      }

      const ul = document.createElement('ul');
      ul.className = 'numbers';
      g.members.forEach((n) => {
        const li = document.createElement('li');
        li.className = 'num';
        li.textContent = n;
        ul.appendChild(li);
      });
      card.appendChild(ul);
      el.groups.appendChild(card);
    });
  }

  /* ========== コピー ========== */
  function resultText() {
    return state.last.groups
      .map((g, i) => `グループ${i + 1}：${g.members.join('、')}`)
      .join('\n');
  }

  function flash(target, message) {
    target.textContent = message;
    clearTimeout(target._timer);
    target._timer = setTimeout(() => { target.textContent = ''; }, 3000);
  }

  async function copyResult() {
    if (!state.last) return;
    const text = resultText();
    try {
      await navigator.clipboard.writeText(text);
      flash(el.copyStatus, 'コピーしました。');
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      document.body.removeChild(ta);
      flash(el.copyStatus, ok ? 'コピーしました。' : 'コピーできませんでした。');
    }
  }

  /* ========== モード切り替え ========== */
  function syncRoster() {
    const bl = parseList(el.boysList.value, '男子の番号');
    const gl = parseList(el.girlsList.value, '女子の番号');
    if (!bl.error && !gl.error) {
      const nb = bl.values.length;
      const ng = gl.values.length;
      el.rosterInfo.textContent = `男子${nb}人／女子${ng}人／合計${nb + ng}人`;
      el.boys.value = nb || '';
      el.girls.value = ng || '';
      el.total.value = nb + ng || '';
    } else {
      el.rosterInfo.textContent = '';
    }
  }

  function setMode(mode) {
    if (mode === state.mode && mode === 'simple' && !el.total.disabled) { applyModeUI(); return; }
    if (state.mode === 'simple') {
      state.simple = { total: el.total.value, boys: el.boys.value, girls: el.girls.value };
    }
    state.mode = mode;
    applyModeUI();
  }

  function applyModeUI() {
    const roster = state.mode === 'roster';
    el.tabSimple.setAttribute('aria-pressed', String(!roster));
    el.tabRoster.setAttribute('aria-pressed', String(roster));
    el.rosterBox.hidden = !roster;
    [el.total, el.boys, el.girls].forEach((i) => { i.disabled = roster; });
    if (roster) {
      syncRoster();
    } else {
      el.total.value = state.simple.total;
      el.boys.value = state.simple.boys;
      el.girls.value = state.simple.girls;
    }
    updateHint();
  }

  function setMethod(method) {
    state.vals[state.method] = el.valueInput.value;
    state.method = method;
    el.valueInput.value = state.vals[method];
    const size = method === 'size';
    el.valueLabel.textContent = size ? '1グループの人数' : 'グループ数';
    el.valueUnit.textContent = size ? '人' : 'グループ';
    updateHint();
  }

  /* ========== 保存・呼び出し ========== */
  function saveSettings() {
    state.vals[state.method] = el.valueInput.value;
    if (state.mode === 'simple') {
      state.simple = { total: el.total.value, boys: el.boys.value, girls: el.girls.value };
    }
    store.set(KEY_SETTINGS, {
      mode: state.mode,
      method: state.method,
      simple: state.simple,
      vals: state.vals,
      boysList: el.boysList.value,
      girlsList: el.girlsList.value,
      level: el.level.value,
      avoid: el.avoid.checked,
      view: el.viewStudent.checked ? 'student' : 'teacher',
      showGender: el.showGender.checked,
      fontSize: el.fontSize.value
    });
  }

  function loadSettings() {
    const s = store.get(KEY_SETTINGS);
    if (!s) return;
    if (s.simple) state.simple = s.simple;
    if (s.vals) state.vals = s.vals;
    if (typeof s.boysList === 'string') el.boysList.value = s.boysList;
    if (typeof s.girlsList === 'string') el.girlsList.value = s.girlsList;
    if (s.level) el.level.value = s.level;
    if (typeof s.avoid === 'boolean') el.avoid.checked = s.avoid;
    if (s.view === 'student') el.viewStudent.checked = true;
    if (typeof s.showGender === 'boolean') el.showGender.checked = s.showGender;
    if (s.fontSize) el.fontSize.value = s.fontSize;
    document.body.dataset.size = el.fontSize.value;

    state.method = s.method === 'count' ? 'count' : 'size';
    (state.method === 'count' ? el.methodCount : el.methodSize).checked = true;
    el.valueInput.value = state.vals[state.method];
    const size = state.method === 'size';
    el.valueLabel.textContent = size ? '1グループの人数' : 'グループ数';
    el.valueUnit.textContent = size ? '人' : 'グループ';

    state.mode = s.mode === 'roster' ? 'roster' : 'simple';
  }

  function saveRoster() {
    const ok = store.set(KEY_ROSTER, { boys: el.boysList.value, girls: el.girlsList.value });
    flash(el.rosterStatus, ok ? '名簿を保存しました。' : '保存できませんでした（ブラウザの設定を確認してください）。');
  }

  function loadRoster() {
    const r = store.get(KEY_ROSTER);
    if (!r) { flash(el.rosterStatus, '保存された名簿がありません。'); return; }
    el.boysList.value = r.boys || '';
    el.girlsList.value = r.girls || '';
    syncRoster();
    updateHint();
    flash(el.rosterStatus, '名簿を呼び出しました。');
  }

  /* ========== イベント ========== */
  el.form.addEventListener('submit', (e) => { e.preventDefault(); run(true); });
  el.again.addEventListener('click', () => run(false));
  el.copy.addEventListener('click', copyResult);
  el.resetHistory.addEventListener('click', () => {
    state.history = [];
    state.round = 0;
    state.last = null;
    state.signature = '';
    el.resultSection.hidden = true;
  });

  el.tabSimple.addEventListener('click', () => setMode('simple'));
  el.tabRoster.addEventListener('click', () => setMode('roster'));
  el.methodSize.addEventListener('change', () => setMethod('size'));
  el.methodCount.addEventListener('change', () => setMethod('count'));

  [el.total, el.boys, el.girls, el.valueInput].forEach((i) => i.addEventListener('input', updateHint));
  [el.boysList, el.girlsList].forEach((t) => t.addEventListener('input', () => { syncRoster(); updateHint(); }));

  el.saveRoster.addEventListener('click', saveRoster);
  el.loadRoster.addEventListener('click', loadRoster);

  [el.viewTeacher, el.viewStudent, el.showGender, el.fontSize].forEach((i) => {
    i.addEventListener('change', () => { render(); saveSettings(); });
  });

  /* ========== 初期化 ========== */
  loadSettings();
  el.total.value = state.simple.total;
  el.boys.value = state.simple.boys;
  el.girls.value = state.simple.girls;
  applyModeUI();
})();
