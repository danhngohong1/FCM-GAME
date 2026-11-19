/* =========================================================
   app/game.js — Game "Đập Tôi"
   Căn cứ: docs/02-chuc-nang.html, docs/03-man-hinh.html,
           docs/04-quy-tac-du-lieu.html, docs/06-giao-dien.html
   Gồm 2 phần:
     1. Logic (createEngine) — không đụng tới DOM, nhận đồng hồ,
        hẹn giờ và hàm ngẫu nhiên từ bên ngoài để kiểm thử (UT-01→09).
     2. Giao diện (initUI) — chỉ chạy khi trang có #app.
   ========================================================= */
(function (global) {
  "use strict";

  /* ---------- Bảng thông số (04 · mục 9) — mọi con số của game nằm ở đây ---------- */
  var CONFIG = Object.freeze({
    GRID_SIZE: 3,                     // lưới 3×3 = 9 ô
    ROUND_MS: 30000,                  // thời lượng lượt
    UP_MS: 800,                       // thời gian nhân vật ở trên mặt đất
    GAP_MIN_MS: 200,                  // khoảng nghỉ tối thiểu
    GAP_MAX_MS: 500,                  // khoảng nghỉ tối đa
    POINTS_PER_HIT: 1,                // điểm mỗi lần đập trúng
    WARN_SECONDS: 5,                  // đồng hồ chuyển đỏ
    SLIDE_MS: 120,                    // trồi lên / chui xuống (CSS dùng --duration-fast)
    HIT_FX_MS: 300,                   // hiệu ứng "bị đập" và "+1"
    STORAGE_KEY: "dapToi.highScore",  // khoá localStorage
    HIGH_SCORE_MAX: 9999,             // kỷ lục > giá trị này coi là hỏng
    ANNOUNCE_SECONDS: [10, 5],        // đồng hồ chỉ đọc cho trình đọc màn hình ở các mốc này
    // Đăng ký người chơi (04 · mục 18)
    PLAYER_KEY: "dapToi.player",      // khoá localStorage ghi nhớ người chơi
    BOOT_TIMEOUT_MS: 3000,            // chờ server xác nhận người chơi khi mở game
    SUBMIT_TIMEOUT_MS: 15000          // chờ server trả lời khi gửi đăng ký
  });

  var MS_PER_SECOND = 1000;
  var STATE = Object.freeze({ IDLE: "IDLE", PLAYING: "PLAYING", RESULT: "RESULT" });

  /* ---------- Hàm thuần ---------- */

  /** Chọn ô kế tiếp: ngẫu nhiên đều, khác lastCell (04 · 3.2). */
  function pickCell(lastCell, random, cellCount) {
    var candidates = [];
    for (var i = 0; i < cellCount; i++) {
      if (i !== lastCell) candidates.push(i);
    }
    var idx = Math.floor(random() * candidates.length);
    if (idx >= candidates.length) idx = candidates.length - 1;
    return candidates[idx];
  }

  /** Khoảng nghỉ ngẫu nhiên đều trong [GAP_MIN_MS, GAP_MAX_MS]. */
  function randomGap(random, cfg) {
    return cfg.GAP_MIN_MS + random() * (cfg.GAP_MAX_MS - cfg.GAP_MIN_MS);
  }

  /** "00:SS" với SS = ceil(remainingMs / 1000) (04 · mục 4). */
  function formatTime(remainingMs) {
    var total = Math.ceil(Math.max(0, remainingMs) / MS_PER_SECOND);
    var mm = Math.floor(total / 60);
    var ss = total % 60;
    return (mm < 10 ? "0" : "") + mm + ":" + (ss < 10 ? "0" : "") + ss;
  }

  function secondsLeft(remainingMs) {
    return Math.ceil(Math.max(0, remainingMs) / MS_PER_SECOND);
  }

  /** Đọc kỷ lục; dữ liệu hỏng hoặc lỗi lưu trữ -> 0 (04 · mục 7). */
  function readHighScore(storage, cfg) {
    cfg = cfg || CONFIG;
    var raw = null;
    try {
      if (storage) raw = storage.getItem(cfg.STORAGE_KEY);
    } catch (e) {
      return 0;
    }
    if (typeof raw !== "string" || !/^\d+$/.test(raw)) return 0;
    var n = Number(raw);
    if (!Number.isSafeInteger(n) || n > cfg.HIGH_SCORE_MAX) return 0;
    return n;
  }

  function writeHighScore(storage, value, cfg) {
    cfg = cfg || CONFIG;
    try {
      if (storage) storage.setItem(cfg.STORAGE_KEY, String(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- Logic game ---------- */

  /**
   * deps: { now, setTimer, clearTimer, requestFrame, cancelFrame, random, storage, cfg }
   * hooks: { start, tick, up, down, hit, end } — đều tuỳ chọn
   */
  function createEngine(deps, hooks) {
    var cfg = deps.cfg || CONFIG;
    var now = deps.now;
    var setTimer = deps.setTimer;
    var clearTimer = deps.clearTimer;
    var requestFrame = deps.requestFrame;
    var cancelFrame = deps.cancelFrame;
    var random = deps.random || Math.random;
    var storage = deps.storage || null;
    hooks = hooks || {};
    var cellCount = cfg.GRID_SIZE * cfg.GRID_SIZE;

    // Dữ liệu trong lượt chơi (04 · mục 8)
    var s = {
      state: STATE.IDLE,
      score: 0,
      endAt: 0,
      remainingMs: cfg.ROUND_MS,
      activeCell: null,
      lastCell: null,
      spawnId: 0,
      upTimer: null,
      spawnTimer: null,
      rafId: null,
      highScore: readHighScore(storage, cfg),
      isNewRecord: false
    };

    function emit(name, data) {
      if (typeof hooks[name] === "function") hooks[name](data, s);
    }

    function cancelAll() {
      if (s.upTimer !== null) clearTimer(s.upTimer);
      if (s.spawnTimer !== null) clearTimer(s.spawnTimer);
      if (s.rafId !== null) cancelFrame(s.rafId);
      s.upTimer = null;
      s.spawnTimer = null;
      s.rafId = null;
    }

    /** Khởi tạo lượt mới: huỷ mọi thứ của lượt cũ trước (04 · mục 8, quy tắc khởi tạo). */
    function initRound() {
      cancelAll();
      s.state = STATE.PLAYING;
      s.score = 0;
      s.endAt = now() + cfg.ROUND_MS;
      s.remainingMs = cfg.ROUND_MS;
      s.activeCell = null;
      s.lastCell = null;
      s.spawnId = 0;
      s.isNewRecord = false;
      emit("start");
      scheduleSpawn();
      s.rafId = requestFrame(frame);
    }

    /** Bấm "Bắt đầu" / "Chơi lại": bị bỏ qua nếu đang PLAYING (04 · mục 10). */
    function startRound() {
      if (s.state === STATE.PLAYING) return false;
      initRound();
      return true;
    }

    function frame() {
      s.rafId = null;
      if (s.state !== STATE.PLAYING) return;
      update();
      if (s.state === STATE.PLAYING) s.rafId = requestFrame(frame);
    }

    /** Tính lại thời gian còn lại; về 0 thì sang RESULT ngay (04 · mục 4). */
    function update() {
      if (s.state !== STATE.PLAYING) return;
      s.remainingMs = Math.max(0, s.endAt - now());
      emit("tick", s.remainingMs);
      if (s.remainingMs <= 0) endRound();
    }

    function scheduleSpawn() {
      if (s.spawnTimer !== null) clearTimer(s.spawnTimer);
      s.spawnTimer = setTimer(spawn, randomGap(random, cfg));
    }

    function spawn() {
      s.spawnTimer = null;
      if (s.state !== STATE.PLAYING) return;
      if (now() >= s.endAt) { update(); return; }
      var cell = pickCell(s.lastCell, random, cellCount);
      s.activeCell = cell;
      s.lastCell = cell;
      s.spawnId += 1;
      var id = s.spawnId;
      s.upTimer = setTimer(function () { expire(id); }, cfg.UP_MS);
      emit("up", cell);
    }

    /** Hết UP_MS mà không bị đập: chui xuống. Mã spawnId cũ thì bỏ qua. */
    function expire(id) {
      if (id !== s.spawnId || s.activeCell === null || s.state !== STATE.PLAYING) return;
      s.upTimer = null;
      if (now() >= s.endAt) { update(); return; }
      var cell = s.activeCell;
      s.activeCell = null;
      emit("down", cell);
      scheduleSpawn();
    }

    /** Bấm vào ô (04 · mục 5). Trả về true nếu được +1. */
    function hit(cell) {
      if (s.state !== STATE.PLAYING) return false;
      if (now() >= s.endAt) { update(); return false; }
      if (s.activeCell === null || s.activeCell !== cell) return false;
      if (s.upTimer !== null) clearTimer(s.upTimer);
      s.upTimer = null;
      s.activeCell = null;
      s.score += cfg.POINTS_PER_HIT;
      emit("hit", cell);
      scheduleSpawn();
      return true;
    }

    function endRound() {
      cancelAll();
      s.state = STATE.RESULT;
      s.remainingMs = 0;
      s.activeCell = null;
      s.isNewRecord = s.score > s.highScore;
      if (s.isNewRecord) {
        s.highScore = s.score;
        writeHighScore(storage, s.highScore, cfg);
      }
      emit("end");
    }

    return {
      startRound: startRound,
      initRound: initRound,
      hit: hit,
      update: update,
      get state() { return s.state; },
      get data() { return s; },
      cellCount: cellCount,
      cfg: cfg
    };
  }

  /* ---------- Giao diện ---------- */

  function getStorage() {
    try {
      var ls = global.localStorage;
      var probe = "__dapToi_probe__";
      ls.setItem(probe, probe);
      ls.removeItem(probe);
      return ls;
    } catch (e) {
      return null; // bị chặn: vẫn chơi, chỉ không lưu kỷ lục qua lần tải trang
    }
  }

  function initUI(doc) {
    var $ = function (id) { return doc.getElementById(id); };
    var el = {
      screenStart: $("screen-start"),
      screenPlay: $("screen-play"),
      btnStart: $("btn-start"),
      btnReplay: $("btn-replay"),
      startBest: $("start-best"),
      startBestValue: $("start-best-value"),
      roundSeconds: doc.querySelectorAll("[data-round-seconds]"),
      score: $("score"),
      timer: $("timer"),
      timerText: $("timer-text"),
      timebar: $("timebar"),
      timebarFill: $("timebar-fill"),
      grid: $("grid"),
      result: $("result"),
      resultScore: $("result-score"),
      resultNew: $("result-new"),
      resultBest: $("result-best"),
      announcer: $("announcer")
    };

    var cells = [];
    var fxTimers = {};
    var lastSecond = null;

    var engine = createEngine({
      now: function () { return global.performance.now(); },
      setTimer: function (fn, ms) { return global.setTimeout(fn, ms); },
      clearTimer: function (id) { global.clearTimeout(id); },
      requestFrame: function (fn) { return global.requestAnimationFrame(fn); },
      cancelFrame: function (id) { global.cancelAnimationFrame(id); },
      random: Math.random,
      storage: getStorage()
    }, {
      start: onStart,
      tick: onTick,
      up: onUp,
      down: onDown,
      hit: onHit,
      end: onEnd
    });

    // Chữ có chứa thông số lấy từ CONFIG
    for (var r = 0; r < el.roundSeconds.length; r++) {
      el.roundSeconds[r].textContent = String(CONFIG.ROUND_MS / MS_PER_SECOND);
    }

    // Tạo lưới
    el.grid.style.setProperty("--grid-size", String(CONFIG.GRID_SIZE));
    for (var i = 0; i < engine.cellCount; i++) {
      cells.push(createCell(i));
    }

    function cellLabel(i) { return "Ô " + (i + 1); }

    function createCell(i) {
      var btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "cell";
      btn.setAttribute("aria-label", cellLabel(i));
      btn.innerHTML =
        '<span class="cell__hole" aria-hidden="true"></span>' +
        '<span class="cell__pit" aria-hidden="true">' +
          '<span class="cell__mole">' +
            '<img class="cell__img" src="../assets/toi.png" alt="" draggable="false">' +
            '<span class="cell__stars">💫</span>' +
          "</span>" +
        "</span>" +
        '<span class="cell__plus" aria-hidden="true">+' + CONFIG.POINTS_PER_HIT + "</span>";
      // pointerdown cho cả chuột và cảm ứng (không dùng click)
      btn.addEventListener("pointerdown", function (e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        engine.hit(i);
      });
      // Bàn phím: Enter / Space (NF-07)
      btn.addEventListener("keydown", function (e) {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
          e.preventDefault();
          engine.hit(i);
        }
      });
      el.grid.appendChild(btn);
      return btn;
    }

    function clearFx(i) {
      if (fxTimers[i] !== undefined) {
        global.clearTimeout(fxTimers[i]);
        delete fxTimers[i];
      }
    }

    function resetCells() {
      for (var i = 0; i < cells.length; i++) {
        clearFx(i);
        cells[i].classList.remove("is-up", "is-hit");
        cells[i].setAttribute("aria-label", cellLabel(i));
      }
    }

    var screens = {
      boot: $("screen-boot"),
      register: $("screen-register"),
      start: el.screenStart,
      play: el.screenPlay
    };

    function showScreen(name) {
      Object.keys(screens).forEach(function (k) {
        if (screens[k]) screens[k].hidden = k !== name;
      });
    }

    function renderBest() {
      var best = engine.data.highScore;
      el.startBestValue.textContent = String(best);
      el.startBest.hidden = best <= 0;
    }

    /* --- hooks từ logic --- */

    function onStart() {
      el.grid.classList.add("is-reset");      // hiện/ẩn tức thì khi dọn lưới
      resetCells();
      el.grid.classList.remove("is-over");
      el.result.hidden = true;
      el.result.classList.remove("is-open");
      el.score.textContent = "0";
      lastSecond = null;
      showScreen("play");
      onTick(CONFIG.ROUND_MS);
      void el.grid.offsetWidth;               // áp dụng trạng thái trống trước khi bật lại chuyển động
      el.grid.classList.remove("is-reset");
    }

    function onTick(remainingMs) {
      var sec = secondsLeft(remainingMs);
      var warn = sec <= CONFIG.WARN_SECONDS;
      el.timerText.textContent = formatTime(remainingMs);
      el.timer.classList.toggle("is-warn", warn);
      el.timebar.classList.toggle("is-warn", warn);
      el.timebarFill.style.transform = "scaleX(" + (remainingMs / CONFIG.ROUND_MS) + ")";
      if (sec !== lastSecond) {
        if (lastSecond !== null && CONFIG.ANNOUNCE_SECONDS.indexOf(sec) !== -1) {
          el.announcer.textContent = "Còn " + sec + " giây";
        }
        lastSecond = sec;
      }
    }

    function onUp(cell) {
      clearFx(cell);
      cells[cell].classList.remove("is-hit");
      cells[cell].classList.add("is-up");
      cells[cell].setAttribute("aria-label", "Có nhân vật");
    }

    function onDown(cell) {
      cells[cell].classList.remove("is-up");
      cells[cell].setAttribute("aria-label", cellLabel(cell));
    }

    function onHit(cell, s) {
      var c = cells[cell];
      el.score.textContent = String(s.score);
      c.classList.remove("is-hit");
      void c.offsetWidth;                     // khởi động lại hoạt ảnh "+1"
      c.classList.add("is-hit");
      c.classList.remove("is-up");
      c.setAttribute("aria-label", cellLabel(cell));
      clearFx(cell);
      fxTimers[cell] = global.setTimeout(function () {
        delete fxTimers[cell];
        c.classList.remove("is-hit");
      }, CONFIG.HIT_FX_MS);
    }

    function onEnd(_, s) {
      el.grid.classList.add("is-over", "is-reset");
      resetCells();
      onTick(0);
      el.resultScore.textContent = String(s.score);
      el.resultNew.hidden = !s.isNewRecord;
      el.resultBest.textContent = String(s.highScore);
      renderBest();
      el.result.hidden = false;
      void el.result.offsetWidth;
      el.result.classList.add("is-open");
      el.btnReplay.focus();
    }

    /* --- sự kiện giao diện --- */

    el.btnStart.addEventListener("click", function () { engine.startRound(); });
    el.btnReplay.addEventListener("click", function () { engine.startRound(); });

    // Nhấn giữ trên lưới không hiện menu (TC-32)
    el.grid.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    // Quay lại tab: tính lại ngay, đã hết giờ thì sang S3 (04 · mục 6)
    doc.addEventListener("visibilitychange", function () {
      if (!doc.hidden) engine.update();
    });

    renderBest();

    // Cho phần đăng ký người chơi (player.js) điều khiển màn hình S0 / S1
    global.DapToi.ui = {
      showScreen: showScreen,
      renderBest: renderBest,
      focusStart: function () { el.btnStart.focus(); }
    };

    if (screens.boot) {
      showScreen("boot");               // player.js quyết định S0 hay S1 (04 · mục 11)
    } else {
      showScreen("start");
      el.btnStart.focus();
    }

    return engine;
  }

  /* ---------- Xuất ra ngoài ---------- */

  global.DapToi = {
    CONFIG: CONFIG,
    STATE: STATE,
    pickCell: pickCell,
    randomGap: randomGap,
    formatTime: formatTime,
    secondsLeft: secondsLeft,
    readHighScore: readHighScore,
    writeHighScore: writeHighScore,
    createEngine: createEngine
  };

  if (global.document && global.document.getElementById("app")) {
    global.DapToi.game = initUI(global.document);
  }
})(window);
