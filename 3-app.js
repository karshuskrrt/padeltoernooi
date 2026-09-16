/* Padeltoernooi - schema- en standenlogica.
   Pure functies bovenaan (ook testbaar in node), DOM-koppeling onderaan. */
(function (global) {
  'use strict';

  function gcd(a, b) { while (b) { const t = a % b; a = b; b = t; } return a; }

  function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Kleinste aantal ronden waarbij iedereen even vaak speelt.
  function equalPlayBase(N, C) {
    const A = 4 * C;
    return N / gcd(N, A);
  }

  // Voorgesteld aantal ronden.
  function suggestRounds(N, C) {
    const A = 4 * C;
    if (A === N) return Math.max(N - 1, 1);           // iedereen speelt elke ronde: partner-één-keer-cyclus
    const R0 = equalPlayBase(N, C);
    return R0 < 5 ? R0 * 2 : R0;
  }

  function shuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function permCost(perm, C, partner, opponent, N) {
    const key = (a, b) => (a < b ? a * N + b : b * N + a);
    const get = (m, a, b) => m.get(key(a, b)) || 0;
    let cost = 0;
    for (let m = 0; m < C; m++) {
      const p0 = perm[m * 4], p1 = perm[m * 4 + 1], p2 = perm[m * 4 + 2], p3 = perm[m * 4 + 3];
      cost += 10 * (get(partner, p0, p1) + get(partner, p2, p3));
      cost += 2 * (get(opponent, p0, p2) + get(opponent, p0, p3) + get(opponent, p1, p2) + get(opponent, p1, p3));
    }
    return cost;
  }

  // Genereer één schema. Geeft {rounds, stats} terug.
  function generateScheduleOnce(N, C, R, seed) {
    const A = 4 * C;
    const rand = mulberry32(seed);
    const key = (a, b) => (a < b ? a * N + b : b * N + a);
    const played = new Array(N).fill(0);
    const partner = new Map(), opponent = new Map();
    const add = (m, a, b) => m.set(key(a, b), (m.get(key(a, b)) || 0) + 1);
    const rounds = [];
    for (let r = 0; r < R; r++) {
      const order = shuffle([...Array(N).keys()], rand)
        .sort((x, y) => played[x] - played[y]);
      const active = order.slice(0, A);
      const sitout = order.slice(A).sort((a, b) => a - b);
      let bestPerm = null, bestCost = Infinity;
      const restarts = Math.min(80, 24 + A * 3);
      for (let s = 0; s < restarts; s++) {
        const perm = shuffle(active.slice(), rand);
        let cost = permCost(perm, C, partner, opponent, N);
        let improved = true, guard = 0;
        while (improved && guard++ < 60) {
          improved = false;
          for (let i = 0; i < A; i++) {
            for (let j = i + 1; j < A; j++) {
              const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
              const c2 = permCost(perm, C, partner, opponent, N);
              if (c2 < cost) { cost = c2; improved = true; }
              else { const t2 = perm[i]; perm[i] = perm[j]; perm[j] = t2; }
            }
          }
        }
        if (cost < bestCost) { bestCost = cost; bestPerm = perm.slice(); }
        if (bestCost === 0) break;
      }
      const matches = [];
      for (let m = 0; m < C; m++) {
        const a = bestPerm[m * 4], b = bestPerm[m * 4 + 1], c = bestPerm[m * 4 + 2], d = bestPerm[m * 4 + 3];
        matches.push({ court: m + 1, teamA: [a, b], teamB: [c, d] });
        add(partner, a, b); add(partner, c, d);
        add(opponent, a, c); add(opponent, a, d); add(opponent, b, c); add(opponent, b, d);
        played[a]++; played[b]++; played[c]++; played[d]++;
      }
      rounds.push({ matches, sitout });
    }
    let partnerRepeats = 0, opponentRepeats = 0;
    partner.forEach(v => { if (v > 1) partnerRepeats += v - 1; });
    opponent.forEach(v => { if (v > 2) opponentRepeats += v - 2; });
    return { rounds, stats: { partnerRepeats, opponentRepeats, played: played.slice() } };
  }

  function generateSchedule(N, C, R, seed) {
    let best = null, bestScore = Infinity;
    const tries = 10;
    for (let t = 0; t < tries; t++) {
      const res = generateScheduleOnce(N, C, R, (seed || 1) + t * 7919);
      const score = res.stats.partnerRepeats * 100 + res.stats.opponentRepeats;
      if (score < bestScore) { bestScore = score; best = res; }
      if (res.stats.partnerRepeats === 0 && res.stats.opponentRepeats === 0) break;
    }
    return best;
  }

  // Tijdmodus: hoeveel ronden passen in het budget, zo mogelijk een eerlijk (gelijk-speel) aantal.
  function timePlan(budget, gamesPerMatch, minPerGame, changeover, N, C) {
    const A = 4 * C;
    const R0 = equalPlayBase(N, C);
    const matchMin = gamesPerMatch * minPerGame;
    const raw = Math.max(0, Math.floor((budget + changeover) / (matchMin + changeover)));
    let rounds = Math.floor(raw / R0) * R0;
    let equal = true;
    if (rounds === 0) { rounds = raw; equal = raw % R0 === 0; }
    const total = rounds > 0 ? rounds * matchMin + (rounds - 1) * changeover : 0;
    return { raw, rounds, equal, total, matchMin, fairBase: R0 };
  }

  function totalMinutes(rounds, gamesPerMatch, minPerGame, changeover) {
    if (rounds <= 0) return 0;
    return rounds * gamesPerMatch * minPerGame + (rounds - 1) * changeover;
  }

  const Padel = { gcd, equalPlayBase, suggestRounds, generateSchedule, timePlan, totalMinutes };
  if (typeof module !== 'undefined' && module.exports) { module.exports = Padel; return; }
  global.Padel = Padel;

  /* ---------------- DOM-app ---------------- */
  const LS_KEY = 'padeltoernooi-v2';
  const $ = (s) => document.querySelector(s);

  let state = null; // {config, schedule, scores, screen, currentRound}
  let draftNames = [];

  function defaultState() {
    return {
      config: { count: 8, names: [], courts: 2, mode: 'games', gamesPerMatch: 16, minPerGame: 1.5, changeover: 3, budget: 120, rounds: 7 },
      schedule: null, scores: {}, screen: 'setup', currentRound: 0
    };
  }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }
  function load() {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
    return null;
  }

  function cfg() { return state.config; }
  function names() {
    const n = [];
    for (let i = 0; i < cfg().count; i++) n.push((cfg().names[i] || '').trim() || ('Speler ' + (i + 1)));
    return n;
  }
  function activePerRound() { return 4 * cfg().courts; }
  function sitoutsPerRound() { return cfg().count - activePerRound(); }
  function fairBase() { return Padel.equalPlayBase(cfg().count, cfg().courts); }

  function fmtMin(min) {
    const m = Math.round(min);
    const h = Math.floor(m / 60), r = m % 60;
    return h > 0 ? (r > 0 ? h + ' u ' + r + ' min' : h + ' uur') : r + ' min';
  }

  /* ----- setup-scherm ----- */
  function renderNameInputs() {
    const wrap = $('#nameInputs');
    const count = parseInt($('#playerCount').value, 10) || 0;
    const prev = draftNames;
    const next = [];
    for (let i = 0; i < count; i++) next[i] = prev[i] || '';
    draftNames = next;
    wrap.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const inp = document.createElement('input');
      inp.type = 'text'; inp.maxLength = 20; inp.dataset.idx = i;
      inp.placeholder = 'Speler ' + (i + 1);
      inp.value = draftNames[i];
      inp.autocomplete = 'off';
      inp.addEventListener('input', () => { draftNames[i] = inp.value; });
      wrap.appendChild(inp);
    }
  }

  function syncCourtsDefault(force) {
    const count = parseInt($('#playerCount').value, 10) || 4;
    const max = Math.max(1, Math.floor(count / 4));
    const el = $('#courtCount');
    el.max = max;
    if (force || !el.value || parseInt(el.value, 10) > max) el.value = max;
  }

  function syncModeFields() {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    $('#gamesFields').classList.toggle('hidden', mode !== 'games');
    $('#timeFields').classList.toggle('hidden', mode !== 'time');
    if (mode === 'time') syncTimeRounds();
    else syncGamesSummary();
  }

  function readCommon() {
    return {
      count: parseInt($('#playerCount').value, 10) || 4,
      courts: parseInt($('#courtCount').value, 10) || 1,
      gamesPerMatch: parseInt($('#gamesPerMatch').value, 10) || 16,
      minPerGame: parseFloat(String($('#minPerGame').value).replace(',', '.')) || 1.5,
      changeover: parseInt($('#changeover').value, 10) || 0,
      budget: parseInt($('#budget').value, 10) || 120
    };
  }

  function scheduleNotes(c, rounds, equal) {
    const notes = [];
    const A = 4 * c.courts;
    const so = c.count - A;
    if (so > 0) {
      notes.push('Per ronde rusten ' + so + (so === 1 ? ' speler' : ' spelers') + ' (roulerend).');
      const plays = Math.floor(A * rounds / c.count);
      notes.push('Iedereen speelt ' + (equal ? 'even vaak (' + plays + ' van ' + rounds + ' ronden)' : 'ongeveer even vaak') + '.');
    } else {
      notes.push('Iedereen speelt elke ronde.');
    }
    if (c.count === 8 && c.courts === 2 && rounds === 7) notes.push('Iedereen staat precies één keer met elke andere speler in een team.');
    return notes.join(' ');
  }

  function syncGamesSummary() {
    const c = readCommon();
    const rounds = parseInt($('#rounds').value, 10) || 0;
    const total = Padel.totalMinutes(rounds, c.gamesPerMatch, c.minPerGame, c.changeover);
    let warn = '';
    if (rounds > 0 && rounds % Padel.equalPlayBase(c.count, c.courts) !== 0) {
      warn = ' Let op: met ' + rounds + ' ronden speelt niet iedereen even vaak.';
    }
    $('#summary').textContent = rounds > 0
      ? rounds + ' ronden · ' + c.courts + (c.courts === 1 ? ' baan' : ' banen') + ' · ' + c.gamesPerMatch + ' games per wedstrijd · ± ' + fmtMin(total) + ' totaal. ' + scheduleNotes(c, rounds, true) + warn
      : 'Kies een aantal ronden.';
  }

  function syncTimeRounds() {
    const c = readCommon();
    const plan = Padel.timePlan(c.budget, c.gamesPerMatch, c.minPerGame, c.changeover, c.count, c.courts);
    const el = $('#roundsTime');
    el.value = plan.rounds;
    let txt;
    if (plan.rounds === 0) {
      txt = 'Met deze instellingen past geen enkele ronde in ' + fmtMin(c.budget) + '. Verlaag het aantal games per wedstrijd of verleng de tijd.';
    } else {
      txt = plan.rounds + ' ronden passen (± ' + fmtMin(plan.total) + ' van ' + fmtMin(c.budget) + '). ' + scheduleNotes(c, plan.rounds, plan.equal);
      if (!plan.equal) txt += ' Let op: geen eerlijk rondeschema mogelijk binnen deze tijd; niet iedereen speelt even vaak.';
      if (plan.raw > plan.rounds) txt += ' Nog ' + (plan.raw - plan.rounds) + ' extra ' + (plan.raw - plan.rounds === 1 ? 'ronde zou' : 'ronden zouden') + ' passen, maar dan speelt niet iedereen even vaak.';
    }
    $('#summary').textContent = txt;
  }

  function collectConfig() {
    const c = readCommon();
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const rounds = mode === 'time'
      ? (parseInt($('#roundsTime').value, 10) || 0)
      : (parseInt($('#rounds').value, 10) || 0);
    const nm = [];
    for (let i = 0; i < c.count; i++) nm.push((draftNames[i] || '').trim());
    return { count: c.count, names: nm, courts: c.courts, mode, gamesPerMatch: c.gamesPerMatch, minPerGame: c.minPerGame, changeover: c.changeover, budget: c.budget, rounds };
  }

  /* ----- rondes-scherm ----- */
  function scoreOf(r, m) { return (state.scores[r] && state.scores[r][m]) || null; }

  function renderRoundChips() {
    const wrap = $('#roundChips');
    wrap.innerHTML = '';
    const R = cfg().rounds;
    for (let r = 0; r < R; r++) {
      const b = document.createElement('button');
      b.className = 'chip' + (r === state.currentRound ? ' active' : '');
      const done = state.schedule[r].matches.every((_, m) => scoreOf(r, m));
      b.textContent = (r + 1) + (done ? ' ✓' : '');
      b.addEventListener('click', () => { state.currentRound = r; save(); renderRounds(); });
      wrap.appendChild(b);
    }
  }

  function renderRounds() {
    $('#setupScreen').classList.add('hidden');
    $('#standScreen').classList.add('hidden');
    $('#roundsScreen').classList.remove('hidden');
    setNav('rounds');
    renderRoundChips();
    const nm = names();
    const r = state.currentRound;
    const round = state.schedule[r];
    $('#roundTitle').textContent = 'Ronde ' + (r + 1) + ' van ' + cfg().rounds;
    const doneCount = state.schedule.reduce((acc, rd, ri) => acc + rd.matches.filter((_, m) => scoreOf(ri, m)).length, 0);
    $('#roundProgress').textContent = doneCount + ' van ' + (cfg().rounds * cfg().courts) + ' wedstrijden ingevuld';
    const so = round.sitout || [];
    $('#sitout').textContent = so.length ? 'Rust deze ronde: ' + so.map(i => nm[i]).join(', ') : '';
    const wrap = $('#matches');
    wrap.innerHTML = '';
    round.matches.forEach((match, m) => {
      const card = document.createElement('div');
      card.className = 'match-card';
      const sc = scoreOf(r, m);
      const head = document.createElement('div');
      head.className = 'court-label';
      head.textContent = 'Baan ' + match.court;
      card.appendChild(head);
      const row = document.createElement('div');
      row.className = 'score-row';
      const teamA = document.createElement('div');
      teamA.className = 'team';
      teamA.textContent = match.teamA.map(i => nm[i]).join(' & ');
      const teamB = document.createElement('div');
      teamB.className = 'team';
      teamB.textContent = match.teamB.map(i => nm[i]).join(' & ');
      const inA = document.createElement('input');
      const inB = document.createElement('input');
      [inA, inB].forEach(inp => { inp.type = 'number'; inp.min = 0; inp.max = cfg().gamesPerMatch; inp.inputMode = 'numeric'; });
      inA.value = sc ? sc[0] : ''; inB.value = sc ? sc[1] : '';
      inA.setAttribute('aria-label', 'Score ' + teamA.textContent);
      inB.setAttribute('aria-label', 'Score ' + teamB.textContent);
      const vs = document.createElement('div'); vs.className = 'vs'; vs.textContent = '–';
      function commit(fromA) {
        const G = cfg().gamesPerMatch;
        let a = inA.value === '' ? null : Math.max(0, Math.min(G, parseInt(inA.value, 10) || 0));
        let b = inB.value === '' ? null : Math.max(0, Math.min(G, parseInt(inB.value, 10) || 0));
        if (fromA && a !== null) { b = G - a; inB.value = b; }
        if (!fromA && b !== null) { a = G - b; inA.value = a; }
        if (a === null || b === null) { delete state.scores[r]?.[m]; card.classList.remove('complete'); save(); renderRoundChips(); updateProgress(); return; }
        if (!state.scores[r]) state.scores[r] = {};
        state.scores[r][m] = [a, b];
        card.classList.add('complete');
        save(); renderRoundChips(); updateProgress();
      }
      function updateProgress() {
        const dc = state.schedule.reduce((acc, rd, ri) => acc + rd.matches.filter((_, mm) => scoreOf(ri, mm)).length, 0);
        $('#roundProgress').textContent = dc + ' van ' + (cfg().rounds * cfg().courts) + ' wedstrijden ingevuld';
      }
      inA.addEventListener('change', () => commit(true));
      inB.addEventListener('change', () => commit(false));
      if (sc) card.classList.add('complete');
      row.appendChild(teamA); row.appendChild(inA); row.appendChild(vs); row.appendChild(inB); row.appendChild(teamB);
      card.appendChild(row);
      const hint = document.createElement('div');
      hint.className = 'match-hint';
      hint.textContent = 'Totaal ' + cfg().gamesPerMatch + ' games';
      card.appendChild(hint);
      wrap.appendChild(card);
    });
    window.scrollTo(0, 0);
  }

  /* ----- stand-scherm ----- */
  function computeStandings() {
    const nm = names();
    const st = nm.map((name, i) => ({ i, name, played: 0, won: 0, lost: 0, matchWins: 0 }));
    state.schedule.forEach((round, r) => {
      round.matches.forEach((match, m) => {
        const sc = scoreOf(r, m);
        if (!sc) return;
        const [a, b] = sc;
        match.teamA.forEach(i => { st[i].played++; st[i].won += a; st[i].lost += b; if (a > b) st[i].matchWins++; });
        match.teamB.forEach(i => { st[i].played++; st[i].won += b; st[i].lost += a; if (b > a) st[i].matchWins++; });
      });
    });
    st.forEach(p => { p.avg = p.played ? p.won / p.played : 0; p.diff = p.won - p.lost; });
    st.sort((x, y) => y.avg - x.avg || y.diff - x.diff || y.matchWins - x.matchWins || y.won - x.won);
    return st;
  }

  function renderStand() {
    $('#setupScreen').classList.add('hidden');
    $('#roundsScreen').classList.add('hidden');
    $('#standScreen').classList.remove('hidden');
    setNav('stand');
    const st = computeStandings();
    const tbody = $('#standTable tbody');
    tbody.innerHTML = '';
    st.forEach((p, idx) => {
      const tr = document.createElement('tr');
      if (idx === 0) tr.className = 'leader';
      const cells = [
        String(idx + 1), p.name, String(p.played), String(p.won),
        p.played ? (Math.round(p.avg * 10) / 10).toString().replace('.', ',') : '–',
        (p.diff > 0 ? '+' : '') + p.diff
      ];
      cells.forEach((txt, ci) => {
        const td = document.createElement('td');
        td.textContent = txt;
        if (ci === 1) td.className = 'name-cell';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    const anyPlayed = st.some(p => p.played > 0);
    $('#standNote').textContent = anyPlayed
      ? 'Gerangschikt op gemiddeld gewonnen games per wedstrijd, daarna op saldo.'
      : 'Nog geen scores ingevuld.';
  }

  function shareText() {
    const st = computeStandings();
    const lines = ['Stand padeltoernooi', ''];
    st.forEach((p, idx) => {
      lines.push((idx + 1) + '. ' + p.name + ' — ' + p.won + ' games (' + (p.played ? (Math.round(p.avg * 10) / 10).toString().replace('.', ',') : '0') + ' gem, ' + (p.diff > 0 ? '+' : '') + p.diff + ')');
    });
    return lines.join('\n');
  }

  /* ----- navigatie ----- */
  function setNav(which) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.nav === which));
  }

  function wire() {
    state = load() || defaultState();

    // setup velden vullen uit state
    $('#playerCount').value = cfg().count;
    draftNames = cfg().names.slice();
    renderNameInputs();
    syncCourtsDefault(false);
    $('#courtCount').value = cfg().courts;
    $('#gamesPerMatch').value = cfg().gamesPerMatch;
    $('#minPerGame').value = cfg().minPerGame;
    $('#changeover').value = cfg().changeover;
    $('#budget').value = cfg().budget;
    document.querySelector('input[name="mode"][value="' + cfg().mode + '"]').checked = true;
    $('#rounds').value = cfg().rounds;
    syncModeFields();

    $('#playerCount').addEventListener('change', () => { renderNameInputs(); syncCourtsDefault(true); syncModeFields(); });
    document.querySelectorAll('#setupScreen input, #setupScreen select').forEach(el => {
      if (el.id === 'playerCount') return;
      el.addEventListener('input', () => syncModeFields());
      el.addEventListener('change', () => syncModeFields());
    });
    document.querySelectorAll('[data-games]').forEach(b => b.addEventListener('click', () => { $('#gamesPerMatch').value = b.dataset.games; syncModeFields(); }));
    document.querySelectorAll('[data-budget]').forEach(b => b.addEventListener('click', () => { $('#budget').value = b.dataset.budget; syncModeFields(); }));
    $('#suggestRounds').addEventListener('click', () => {
      const c = readCommon();
      $('#rounds').value = Padel.suggestRounds(c.count, c.courts);
      syncGamesSummary();
    });

    $('#startBtn').addEventListener('click', () => {
      const config = collectConfig();
      if (config.count < 4) { $('#formError').textContent = 'Vul minimaal 4 spelers in.'; return; }
      if (config.rounds < 1) { $('#formError').textContent = 'Het schema heeft minimaal 1 ronde nodig.'; return; }
      if (config.courts * 4 > config.count) { $('#formError').textContent = 'Te veel banen voor dit aantal spelers.'; return; }
      $('#formError').textContent = '';
      state.config = config;
      state.schedule = Padel.generateSchedule(config.count, config.courts, config.rounds, Date.now() % 2147483647).rounds;
      state.scores = {};
      state.currentRound = 0;
      save();
      renderRounds();
    });

    $('#tabSetup').addEventListener('click', () => {
      $('#roundsScreen').classList.add('hidden');
      $('#standScreen').classList.add('hidden');
      $('#setupScreen').classList.remove('hidden');
      setNav('setup');
      syncModeFields();
    });
    $('#tabRounds').addEventListener('click', () => { if (state.schedule) renderRounds(); });
    $('#tabStand').addEventListener('click', () => { if (state.schedule) renderStand(); });
    $('#toStand').addEventListener('click', () => renderStand());
    $('#backToRounds').addEventListener('click', () => renderRounds());

    $('#shareBtn').addEventListener('click', async () => {
      const text = shareText();
      try {
        if (navigator.share) { await navigator.share({ text }); return; }
        await navigator.clipboard.writeText(text);
        $('#shareMsg').textContent = 'Stand gekopieerd naar het klembord.';
      } catch (e) {
        try { await navigator.clipboard.writeText(text); $('#shareMsg').textContent = 'Stand gekopieerd naar het klembord.'; } catch (e2) {}
      }
    });

    $('#resetBtn').addEventListener('click', () => {
      if (!confirm('Alle scores en het schema wissen en opnieuw beginnen?')) return;
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
      state = defaultState();
      wire();
      $('#roundsScreen').classList.add('hidden');
      $('#standScreen').classList.add('hidden');
      $('#setupScreen').classList.remove('hidden');
      setNav('setup');
    });

    // herstel lopend toernooi
    if (state.schedule) {
      renderRounds();
    } else {
      setNav('setup');
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', wire);
  }
})(typeof window !== 'undefined' ? window : globalThis);
