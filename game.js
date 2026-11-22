/* ==========================================================
   Matma — gra w liczenie dla dzieci
   20 zadań pod rząd, każde na czas. Za każde dobre zadanie
   dziecko dostaje jedną część rakiety (rocket.js). Cała rakieta
   startuje w kosmos; niedokończona rozbija się, gdy minie czas.
   Pomyłka nie kończy gry — kończy ją tylko czas.
   ========================================================== */
(function () {
  "use strict";

  var TOTAL = 20;              // ile zadań w jednej grze (= części rakiety)
  var MAX_LEN = 3;             // najdłuższa odpowiedź: np. "-12"

  /* Trzy poziomy, coraz trudniejsze w trakcie gry:
       łatwy  (zadania 1-7):   2 + 3          — dodawanie do 10
       średni (zadania 8-14):  5 + 12, 14 - 6 — do 20, wynik nie mniejszy od 0
       trudny (zadania 15-20): 5 - 7          — wynik poniżej zera
     Każdy poziom ma inny limit czasu w sekundach. */
  var LEVELS = [
    { until: 7,  time: 12, make: easy },
    { until: 14, time: 18, make: medium },
    { until: 20, time: 25, make: hard }
  ];

  var timerBar  = document.getElementById("timer-bar");
  var taskEl    = document.getElementById("task");
  var taskText  = document.getElementById("task-text");
  var answerEl  = document.getElementById("answer");
  var message   = document.getElementById("message");
  var winsEl    = document.getElementById("wins");
  var endcard   = document.getElementById("endcard");
  var helpcard  = document.getElementById("helpcard");

  var index = 0;           // numer bieżącego zadania (0..19)
  var answer = 0;          // poprawny wynik
  var typed = "";          // co dziecko wpisało
  var locked = true;       // blokada w czasie animacji i po końcu gry
  var deadline = 0;        // kiedy mija czas (ms)
  var timeLimit = 0;       // ile było czasu (ms)
  var rafId = 0;
  var lastTask = "";       // żeby to samo zadanie nie wypadło dwa razy pod rząd

  /* ---------- dźwięk ----------
     Nagrania z assets/ (głos Jessica z ElevenLabs i efekty) grają w AudioContext, który rusza po dotknięciu
     „Gramy!”. Gdy nagrania brak albo się jeszcze nie wczytało (file://, brak sieci), mówi głos przeglądarki
     (speechSynthesis, pl-PL), a efekty są syntezowane. Zadanie czyta się z kawałków: „5” „plus” „7” „ile to jest?”. */
  var ASSET_V = 1;           // podbij po podmianie pliku w assets/
  var SFX_VOL = 0.5;         // efekty
  var VOICE_VOL = 1;         // głos
  var VOICE_GAP = 0.08;      // s przerwy między kawałkami zdania
  var VOICE_WAIT = 400;      // ms czekania na nagranie, które się jeszcze ładuje, zanim powie je przeglądarka
  var READ_TASKS = true;     // nowe zadanie czyta się na głos (dotknięcie zadania czyta je jeszcze raz)
  var HURRY_GAP = 30;        // s: „Czas ucieka!” najwyżej raz na tyle (sam sygnał gra za każdym razem)
  var ALMOST_PARTS = 15;     // od tylu części rozbita rakieta to „Prawie się udało!” zamiast „Ojej!…”
  var CLIP_TRIM = { "sfx/right": 0.6, "sfx/wrong": 0.7, "sfx/blastoff": 0.8, "sfx/crash": 0.8 };   // głośność pojedynczych nagrań

  var Sound = (function () {
    var ac = null, out = null, plVoice = null;
    var raw = {}, bufs = {}, pending = {};
    var line = [], lineId = 0, lineEnd = 0;   // źródła bieżącego zdania, jego numer i kiedy się kończy

    var CLIPS = ["sfx/clunk", "sfx/right", "sfx/wrong", "sfx/tick", "sfx/blastoff", "sfx/crash", "sfx/confetti", "sfx/hurry",
      "voice/op-plus", "voice/op-minus", "voice/op-ile-to-jest",
      "voice/praise-super", "voice/praise-brawo", "voice/praise-tak-jest", "voice/praise-swietnie", "voice/praise-ekstra",
      "voice/praise-dobrze", "voice/retry-sprobuj-jeszcze-raz", "voice/retry-prawie", "voice/retry-dasz-rade",
      "voice/retry-nie-szkodzi", "voice/rocket-crash", "voice/rocket-almost", "voice/rocket-win", "voice/rocket-hurry",
      "voice/rocket-ready", "voice/count-3", "voice/count-2", "voice/count-1", "voice/count-start"];
    for (var n = 0; n <= 30; n++) CLIPS.push("voice/num-" + n);

    function fetchClip(name) {
      if (!raw[name]) {
        raw[name] = fetch("assets/" + name + ".mp3?v=" + ASSET_V)
          .then(function (r) { return r.ok ? r.arrayBuffer() : null; })
          .catch(function () { return null; });
      }
      return raw[name];
    }
    // pobiera i dekoduje raz; daje bufor albo null
    function load(name) {
      if (bufs[name]) return Promise.resolve(bufs[name]);
      fetchClip(name);
      if (!ac) return Promise.resolve(null);
      if (!pending[name]) {
        pending[name] = raw[name].then(function (b) {
          return b && new Promise(function (res, rej) { ac.decodeAudioData(b, res, rej); });
        }).then(function (buf) { return buf || null; }, function () { return null; }).then(function (buf) {
          if (buf) bufs[name] = buf;
          else { delete raw[name]; delete pending[name]; }   // nie wyszło: następnym razem spróbuje jeszcze raz
          return buf;
        });
      }
      return pending[name];
    }

    function unlock() {
      if (ac) { if (ac.state === "suspended") ac.resume(); return; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ac = new AC(); } catch (e) { ac = null; return; }
      out = ac.createGain();
      out.gain.value = 1;
      out.connect(ac.destination);
      Object.keys(raw).forEach(load);
    }

    function play(name, vol, at) {
      var buf = bufs[name];
      if (!ac || !buf) return null;
      var s = ac.createBufferSource(), g = ac.createGain();
      s.buffer = buf;
      g.gain.value = vol * (CLIP_TRIM[name] || 1);
      s.connect(g).connect(out);
      s.start(at || 0);
      return s;
    }
    function tone(f0, f1, dur, type, vol, delay) {
      if (!ac) return;
      var t = ac.currentTime + (delay || 0);
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    function noise(dur, vol, delay) {
      if (!ac) return;
      var t = ac.currentTime + (delay || 0), len = Math.ceil(ac.sampleRate * dur);
      var b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = b; f.type = "lowpass"; f.frequency.value = 900; g.gain.value = vol;
      s.connect(f).connect(g).connect(out);
      s.start(t);
    }
    // efekt: nagranie, a gdy go brak — syntezowany zamiennik; daje true, gdy zagrało nagranie
    function fx(name, synth) {
      if (play(name, SFX_VOL)) return true;
      if (synth) synth();
      return false;
    }

    function stopLine() {
      lineId++;
      line.forEach(function (s) { try { s.stop(); } catch (e) {} });
      line = [];
      lineEnd = 0;
      try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
    }
    function tts(text) {
      var ss = window.speechSynthesis;
      if (!ss || !text) return;
      try {
        if (!plVoice) plVoice = ss.getVoices().filter(function (v) { return /^pl/i.test(v.lang); })[0] || null;
        var u = new SpeechSynthesisUtterance(text);
        u.lang = "pl-PL";
        u.rate = 0.9;
        if (plVoice) u.voice = plVoice;
        ss.speak(u);
      } catch (e) {}
    }
    // Zdanie z kilku nagrań, jedno po drugim: [[nazwa, tekst], …]. Brakuje któregoś — całe mówi przeglądarka.
    // after: zaczyna się dopiero, gdy skończy się poprzednie (pochwała, potem nowe zadanie); inaczej je przerywa.
    function say(parts, after) {
      if (!ac) return;
      if (!after) stopLine();
      var id = lineId, timedOut = false;
      var timer = setTimeout(function () { timedOut = true; go(); }, VOICE_WAIT);
      Promise.all(parts.map(function (p) { return load(p[0]); })).then(function () {
        clearTimeout(timer);
        if (!timedOut) go();
      });
      function go() {
        if (id !== lineId) return;          // w międzyczasie ktoś przerwał mowę
        var start = Math.max(ac.currentTime + 0.03, after ? lineEnd : 0);
        var ready = parts.every(function (p) { return bufs[p[0]]; });
        if (!ready) {
          var text = parts.map(function (p) { return p[1]; }).join(" ");
          setTimeout(function () { if (id === lineId) tts(text); }, (start - ac.currentTime) * 1000);
          return;
        }
        var t = start;
        parts.forEach(function (p) {
          var s = play(p[0], VOICE_VOL, t);
          if (s) line.push(s);
          t += bufs[p[0]].duration + VOICE_GAP;
        });
        lineEnd = t;
      }
    }

    try { if (window.speechSynthesis) speechSynthesis.getVoices(); } catch (e) {}   // lista głosów ładuje się leniwie
    CLIPS.forEach(fetchClip);

    return {
      unlock: unlock,
      say: say,
      stop: stopLine,
      clunk: function () { fx("sfx/clunk", function () { tone(220, 160, 0.12, "triangle", 0.2); tone(1800, 2200, 0.08, "sine", 0.05, 0.05); }); },
      right: function () { fx("sfx/right", function () { tone(784, 784, 0.14, "triangle", 0.16); tone(1047, 1047, 0.22, "triangle", 0.16, 0.1); }); },
      wrong: function () { fx("sfx/wrong", function () { tone(260, 180, 0.3, "sine", 0.2); }); },
      tick: function () { fx("sfx/tick", function () { tone(1200, 1200, 0.04, "square", 0.06); }); },
      hurry: function () { fx("sfx/hurry", function () { tone(880, 880, 0.08, "sine", 0.12); tone(880, 880, 0.08, "sine", 0.12, 0.14); }); },
      confetti: function () {
        fx("sfx/confetti", function () {
          noise(0.12, 0.3);
          for (var i = 0; i < 5; i++) tone(1800 + i * 200, 2400 + i * 200, 0.08, "sine", 0.05, 0.1 + i * 0.06);
        });
      },
      blastoff: function () { fx("sfx/blastoff", function () { noise(2.5, 0.5); tone(90, 40, 2.5, "sawtooth", 0.08); }); },
      // nagranie rozbicia trwa od krztuszenia się silnika aż po wybuch, więc wybuch gra osobno tylko bez niego
      crash: function () {
        return fx("sfx/crash", function () { tone(180, 90, 0.5, "sawtooth", 0.08); tone(160, 80, 0.5, "sawtooth", 0.08, 0.6); });
      },
      boom: function () { noise(1.2, 0.6); tone(110, 30, 1, "sine", 0.5); }
    };
  })();

  // zadanie na głos: „5” „plus” „7” „ile to jest?” (liczby 0–30 są nagrane)
  function taskVoice(text) {
    var m = /^(\d+) ([+-]) (\d+)$/.exec(text);
    if (!m) return [["voice/none", text + ", ile to jest?"]];
    return [
      ["voice/num-" + m[1], m[1]],
      m[2] === "+" ? ["voice/op-plus", "plus"] : ["voice/op-minus", "minus"],
      ["voice/num-" + m[3], m[3]],
      ["voice/op-ile-to-jest", "ile to jest?"]
    ];
  }
  var crashClip = false;   // czy rozbicie gra z nagrania (wtedy wybuch już w nim jest)
  var hurryAt = -1e9;      // kiedy ostatnio padło „Czas ucieka!”

  // zdarzenia rakiety (rocket.js): wibracje i dźwięk
  function rocketEvent(ev) {
    Haptics.buzz(ev);
    if (ev === "land") Sound.clunk();
    else if (ev === "tick") {             // rocket.js odlicza 3, 2, 1, ale zdarzenie nie mówi, która to liczba
      Sound.tick();
      var n = countdown--;
      if (n >= 1 && n <= 3) Sound.say([["voice/count-" + n, ["", "jeden!", "dwa!", "trzy!"][n]]]);
    } else if (ev === "ignite") {
      Sound.blastoff();
      Sound.say([["voice/count-start", "start!"]]);
    } else if (ev === "sputter") crashClip = Sound.crash();
    else if (ev === "boom") {
      if (!crashClip) Sound.boom();
      Sound.say(index >= ALMOST_PARTS
        ? [["voice/rocket-almost", "Prawie się udało!"]]
        : [["voice/rocket-crash", "Ojej! Rakieta się przewróciła."]]);
    }
  }
  var countdown = 3;       // która liczba odliczania jest następna (win() ustawia 3)

  /* ---------- mała pamięć w przeglądarce ---------- */
  function load(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  /* ---------- losowanie zadań ---------- */
  function rnd(min, max) {           // liczba całkowita z [min, max]
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function easy() {
    var a = rnd(1, 5), b = rnd(1, 5);
    return { text: a + " + " + b, value: a + b };
  }

  function medium() {
    if (Math.random() < 0.6) {
      // suma między 11 a 20, np. 5 + 12
      var a = rnd(2, 12), b = rnd(Math.max(1, 11 - a), 20 - a);
      return { text: a + " + " + b, value: a + b };
    }
    // odejmowanie z wynikiem od 0 wzwyż, np. 14 - 6
    var c = rnd(5, 20), d = rnd(1, c);
    return { text: c + " - " + d, value: c - d };
  }

  function hard() {
    if (Math.random() < 0.7) {
      // wynik poniżej zera, np. 5 - 7
      var a = rnd(1, 9), b = rnd(a + 1, a + 9);
      return { text: a + " - " + b, value: a - b };
    }
    // większe dodawanie, do 30
    var c = rnd(6, 19), d = rnd(6, 30 - c);
    return { text: c + " + " + d, value: c + d };
  }

  function levelFor(i) {              // i = numer zadania od zera
    for (var k = 0; k < LEVELS.length; k++) {
      if (i < LEVELS[k].until) return LEVELS[k];
    }
    return LEVELS[LEVELS.length - 1];
  }

  /* ---------- zegar ---------- */
  function startTimer(seconds) {
    timeLimit = seconds * 1000;
    deadline = Date.now() + timeLimit;
    timerBar.className = "timer-bar";
    tick();
  }

  function stopTimer() {
    cancelAnimationFrame(rafId);
  }

  function tick() {
    var left = deadline - Date.now();
    var frac = Math.max(0, left / timeLimit);
    timerBar.style.transform = "scaleX(" + frac + ")";
    if (frac < 0.25) {
      if (!timerBar.classList.contains("low")) {
        Haptics.buzz("hurry");
        Sound.hurry();
        if (Date.now() - hurryAt > HURRY_GAP * 1000) {
          hurryAt = Date.now();
          Sound.say([["voice/rocket-hurry", "Czas ucieka!"]], true);
        }
      }
      timerBar.classList.add("low");
    } else if (frac < 0.5) {
      timerBar.classList.add("mid");
    }
    if (left <= 0) {
      timeUp();
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  /* ---------- przebieg gry ---------- */
  function newGame() {
    index = 0;
    hurryAt = -1e9;
    Rocket.reset();
    endcard.hidden = true;
    say("");
    Sound.say([["voice/rocket-ready", "Gotowi?"]]);
    nextTask();
  }

  function nextTask() {
    var lvl = levelFor(index);
    var t;
    do { t = lvl.make(); } while (t.text === lastTask);
    lastTask = t.text;
    answer = t.value;
    typed = "";
    taskText.textContent = t.text;
    taskEl.className = "task";
    render();
    locked = false;
    startTimer(lvl.time);
    if (READ_TASKS) Sound.say(taskVoice(t.text), true);   // po pochwale albo „Gotowi?”
  }

  function render() {
    answerEl.textContent = typed.replace("-", "−");   // ładny, długi minus
    answerEl.classList.toggle("filled", typed.length > 0);
    if (!typed) {
      var c = document.createElement("span");
      c.className = "caret";
      answerEl.appendChild(c);
    }
  }

  function say(text) { message.textContent = text; }

  function typeKey(ch) {
    if (locked) return;
    if (ch === "-") {
      // minus tylko na początku; drugie stuknięcie go zdejmuje
      typed = typed.charAt(0) === "-" ? typed.slice(1) : "-" + typed.slice(0, MAX_LEN - 1);
    } else if (/^[0-9]$/.test(ch)) {
      if (typed.replace("-", "").length >= 2) return;   // wyniki mają najwyżej 2 cyfry
      typed += ch;
    }
    render();
  }

  function backspace() {
    if (locked) return;
    typed = typed.slice(0, -1);
    render();
  }

  function submit() {
    if (locked) return;
    if (typed === "" || typed === "-") {
      shake();
      return;
    }
    if (parseInt(typed, 10) === answer) {
      correct();
    } else {
      wrong();
    }
  }

  function shake() {
    taskEl.classList.remove("bad");
    void taskEl.offsetWidth;          // restart animacji
    taskEl.classList.add("bad");
  }

  var PRAISE = ["Super!", "Brawo!", "Tak jest!", "Świetnie!", "Ekstra!", "Dobrze!"];
  var PRAISE_CLIP = ["super", "brawo", "tak-jest", "swietnie", "ekstra", "dobrze"];

  function correct() {
    locked = true;
    stopTimer();
    taskEl.className = "task ok";
    Haptics.buzz("ok");
    Rocket.add(index);                // nowa część rakiety
    var k = rnd(0, PRAISE.length - 1);
    say(PRAISE[k]);
    Sound.right();
    Sound.say([["voice/praise-" + PRAISE_CLIP[k], PRAISE[k]]]);
    index++;
    setTimeout(function () {
      say("");
      if (index >= TOTAL) win(); else nextTask();
    }, 700);
  }

  function wrong() {
    // pomyłka nie kończy gry — czas dalej leci, można poprawić
    shake();
    Haptics.buzz("bad");
    Sound.wrong();
    // zwykle „Spróbuj jeszcze raz”, czasem „Dasz radę!”, a o jeden obok — „Prawie!”
    var off = Math.abs(parseInt(typed, 10) - answer);
    var r = off === 1 ? ["Prawie!", "prawie"] : Math.random() < 0.3 ? ["Dasz radę!", "dasz-rade"] : ["Spróbuj jeszcze raz", "sprobuj-jeszcze-raz"];
    say(r[0]);
    Sound.say([["voice/retry-" + r[1], r[0]]]);
    typed = "";
    setTimeout(render, 250);
  }

  // Czas minął: rakieta startuje taka, jaka jest — niedokończona się rozbija.
  function timeUp() {
    locked = true;
    stopTimer();
    timerBar.style.transform = "scaleX(0)";
    say("");
    var n = index;
    var text = n > 0
      ? "Rakieta miała tylko " + n + " z " + TOTAL + " części i się rozbiła. Dobry wynik to:"
      : "Zabrakło czasu. Dobry wynik to:";
    var solution = taskText.textContent + " = " + fmt(answer);
    crashClip = false;
    Rocket.crash(function () {
      Sound.say([["voice/retry-nie-szkodzi", "Nie szkodzi!"]], true);   // po „Ojej! Rakieta się przewróciła.”
      showEnd("🔥", "Nie szkodzi!", text, 0, solution);
    });
  }

  // Wszystkie 20 części: odliczanie i start w kosmos.
  function win() {
    var wins = load("matma.wins", 0) + 1;
    save("matma.wins", wins);
    winsEl.textContent = wins;
    countdown = 3;
    Rocket.blastOff(function () {
      confetti();
      Sound.confetti();
      Sound.say([["voice/rocket-win", "Brawo! Rakieta poleciała w kosmos!"]], true);
      Haptics.buzz("win");
      showEnd("🚀", "Brawo!", "Rakieta ma wszystkie 20 części i poleciała w kosmos!", 0);
    });
  }

  function fmt(n) { return String(n).replace("-", "−"); }

  function showEnd(emoji, title, text, delay, solution) {
    setTimeout(function () {
      document.getElementById("end-emoji").textContent = emoji;
      document.getElementById("end-title").textContent = title;
      var p = document.getElementById("end-text");
      p.textContent = text;
      if (solution) {
        p.appendChild(document.createElement("br"));
        var s = document.createElement("span");
        s.className = "solution";
        s.textContent = solution;
        p.appendChild(s);
      }
      document.getElementById("again-btn").textContent = "Gramy jeszcze raz";
      endcard.hidden = false;
    }, delay);
  }

  function confetti() {
    var colors = ["#58cc02", "#ffc800", "#1cb0f6", "#ff9f43", "#ff4b4b", "#ce82ff"];
    for (var i = 0; i < 90; i++) {
      var p = document.createElement("div");
      p.className = "confetti";
      p.style.left = Math.random() * 100 + "vw";
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = 1.6 + Math.random() * 1.6 + "s";
      p.style.animationDelay = Math.random() * 0.6 + "s";
      p.style.transform = "rotate(" + Math.random() * 360 + "deg)";
      document.body.appendChild(p);
      p.addEventListener("animationend", removeEl(p));
    }
  }

  function removeEl(el) {
    return function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    };
  }

  /* ---------- sterowanie ---------- */
  document.getElementById("keypad").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    var k = b.getAttribute("data-key");
    if (!locked && k !== "Enter") Haptics.buzz("key");
    if (k === "Enter") submit();
    else if (k === "Backspace") backspace();
    else typeKey(k);
  });

  document.addEventListener("keydown", function (e) {
    // Enter na domku (Chrome zostawia go aktywnym po kliknięciu i powrocie)
    // ma działać jak w grze, a nie nagle z niej wychodzić.
    if (e.key === "Enter" && e.target.id === "home") e.preventDefault();
    if (!endcard.hidden || !helpcard.hidden) {
      if (e.key === "Enter" || e.key === " ") {
        if (!helpcard.hidden) closeHelp(); else newGame();
      }
      return;
    }
    if (e.key === "Enter") submit();
    else if (e.key === "Backspace") backspace();
    else if (e.key === "-" || e.key === "Subtract") typeKey("-");
    else if (/^[0-9]$/.test(e.key)) typeKey(e.key);
  });

  document.getElementById("again-btn").addEventListener("click", newGame);

  // dźwięk rusza dopiero po pierwszym dotknięciu albo klawiszu (tak chcą przeglądarki)
  ["pointerdown", "touchend", "keydown"].forEach(function (ev) {
    document.addEventListener(ev, Sound.unlock, true);
  });

  // dotknięcie zadania czyta je jeszcze raz
  taskEl.addEventListener("click", function () {
    if (!locked) Sound.say(taskVoice(taskText.textContent));
  });

  // Pomoc w trakcie gry zatrzymuje zegar — dziecko nie traci czasu na czytanie.
  var paused = 0;
  function openHelp() {
    if (!helpcard.hidden) return;
    if (!locked) {
      paused = Math.max(0, deadline - Date.now());
      stopTimer();
    }
    helpcard.hidden = false;
  }
  function closeHelp() {
    helpcard.hidden = true;
    if (!locked) {
      deadline = Date.now() + paused;
      tick();
    }
  }
  document.getElementById("help-btn").addEventListener("click", openHelp);
  document.getElementById("help-close").addEventListener("click", closeHelp);

  /* ---------- start ---------- */
  winsEl.textContent = load("matma.wins", 0);
  Rocket.init(document.getElementById("stage"), document.getElementById("count"), rocketEvent);

  // przełącznik wibracji w pomocy — tylko tam, gdzie telefon umie wibrować
  var vibeBtn = document.getElementById("vibe-btn");
  function showVibe() {
    vibeBtn.textContent = "📳 Wibracje: " + (Haptics.isOn() ? "włączone" : "wyłączone");
    vibeBtn.classList.toggle("off", !Haptics.isOn());
    vibeBtn.setAttribute("aria-pressed", Haptics.isOn() ? "true" : "false");
  }
  if (Haptics.supported) {
    vibeBtn.hidden = false;
    showVibe();
    vibeBtn.addEventListener("click", function () {
      Haptics.setOn(!Haptics.isOn());
      Haptics.buzz("ok");
      showVibe();
    });
  }
  // Zegar nie rusza, dopóki dziecko nie naciśnie "Gramy!"
  document.getElementById("end-emoji").textContent = "🚀";
  document.getElementById("end-title").textContent = "Matma";
  document.getElementById("end-text").textContent =
    "Zbuduj rakietę z 20 części! Za każde dobre zadanie dostajesz jedną część. Zaczynamy?";
  endcard.hidden = false;
})();
