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
      if (!timerBar.classList.contains("low")) Haptics.buzz("hurry");
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
    Rocket.reset();
    endcard.hidden = true;
    say("");
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

  function correct() {
    locked = true;
    stopTimer();
    taskEl.className = "task ok";
    Haptics.buzz("ok");
    Rocket.add(index);                // nowa część rakiety
    say(PRAISE[rnd(0, PRAISE.length - 1)]);
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
    say("Spróbuj jeszcze raz");
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
    Rocket.crash(function () {
      showEnd("🔥", "Nie szkodzi!", text, 0, solution);
    });
  }

  // Wszystkie 20 części: odliczanie i start w kosmos.
  function win() {
    var wins = load("matma.wins", 0) + 1;
    save("matma.wins", wins);
    winsEl.textContent = wins;
    Rocket.blastOff(function () {
      confetti();
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
  Rocket.init(document.getElementById("stage"), document.getElementById("count"), Haptics.buzz);

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
