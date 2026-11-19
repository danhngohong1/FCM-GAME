/* =========================================================
   app/player.js — Đăng ký & ghi nhớ người chơi (F-12, F-13)
   Căn cứ: docs/04-quy-tac-du-lieu.html mục 11–13, docs/03-man-hinh.html mục 8–12
   Phần 1: createPlayerFlow — logic BOOT / REGISTER / IDLE, nhận fetch, lưu trữ
           và hẹn giờ từ ngoài để kiểm thử (UT-14 → UT-16).
   Phần 2: initPlayerUI — gắn với màn hình S0 / S1 khi trang có #screen-register.
   ========================================================= */
(function (global) {
  "use strict";

  var V = global.DapToiValidate;
  var CONFIG = global.DapToi.CONFIG;
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var FLOW = Object.freeze({ BOOT: "BOOT", REGISTER: "REGISTER", IDLE: "IDLE" });

  /* ---------- Lưu trên trình duyệt (04 · mục 13) ---------- */

  function removePlayer(storage) {
    try { if (storage) storage.removeItem(CONFIG.PLAYER_KEY); } catch (e) { /* bỏ qua */ }
  }

  /** Đọc dapToi.player; hỏng thì xoá khoá và trả null. */
  function readPlayer(storage) {
    var raw = null;
    try { raw = storage ? storage.getItem(CONFIG.PLAYER_KEY) : null; } catch (e) { return null; }
    if (raw === null || raw === undefined) return null;
    var obj = null;
    try { obj = JSON.parse(raw); } catch (e) { obj = null; }
    var name = obj && typeof obj.fullName === "string" ? obj.fullName : "";
    var len = Array.from(name).length;
    if (!obj || typeof obj.id !== "string" || !UUID_RE.test(obj.id) || len < 1 || len > V.RULES.NAME_MAX) {
      removePlayer(storage);
      return null;
    }
    return { id: obj.id, fullName: name };
  }

  function writePlayer(storage, player) {
    try {
      if (storage) storage.setItem(CONFIG.PLAYER_KEY, JSON.stringify({ id: player.id, fullName: player.fullName }));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- Logic luồng người chơi (04 · mục 11) ---------- */

  /**
   * deps: { fetch, storage, setTimer, clearTimer, ui }
   * ui: { showBoot, showRegister(reset), showStart(fullName), showFieldErrors(fields),
   *       showGeneralError(msg), setSubmitting(bool) } — đều tuỳ chọn
   */
  function createPlayerFlow(deps) {
    var doFetch = deps.fetch;
    var storage = deps.storage || null;
    var setTimer = deps.setTimer || function (fn, ms) { return setTimeout(fn, ms); };
    var clearTimer = deps.clearTimer || function (id) { clearTimeout(id); };
    var ui = deps.ui || {};
    var s = { state: FLOW.BOOT, submitting: false, player: null };

    function call(name) {
      if (typeof ui[name] === "function") ui[name].apply(null, Array.prototype.slice.call(arguments, 1));
    }

    /** fetch có giới hạn thời gian; quá hạn thì coi như lỗi mạng. */
    function fetchWithTimeout(url, options, ms) {
      return new Promise(function (resolve, reject) {
        var done = false;
        var controller = typeof AbortController === "function" ? new AbortController() : null;
        var timer = setTimer(function () {
          if (done) return;
          done = true;
          if (controller) controller.abort();
          reject(new Error("timeout"));
        }, ms);
        var opts = Object.assign({}, options || {});
        if (controller) opts.signal = controller.signal;
        Promise.resolve()
          .then(function () { return doFetch(url, opts); })
          .then(function (res) {
            if (done) return;
            done = true;
            clearTimer(timer);
            resolve(res);
          }, function (err) {
            if (done) return;
            done = true;
            clearTimer(timer);
            reject(err);
          });
      });
    }

    function toRegister(reset) {
      s.state = FLOW.REGISTER;
      s.submitting = false;
      call("showRegister", !!reset);
    }

    function toIdle(player) {
      s.state = FLOW.IDLE;
      s.submitting = false;
      s.player = player;
      call("showStart", player.fullName);
    }

    /** Mở game (BOOT). Trả về Promise khi đã quyết định S0 hay S1. */
    function boot() {
      s.state = FLOW.BOOT;
      call("showBoot");
      var stored = readPlayer(storage) || s.player;
      if (!stored) {
        toRegister(true);
        return Promise.resolve(s.state);
      }
      return fetchWithTimeout("/api/players/" + encodeURIComponent(stored.id), { method: "GET" }, CONFIG.BOOT_TIMEOUT_MS)
        .then(function (res) {
          if (res.status === 200) {
            return res.json().then(function (data) {
              var p = { id: stored.id, fullName: data && typeof data.fullName === "string" ? data.fullName : stored.fullName };
              writePlayer(storage, p);
              toIdle(p);
            }, function () { toIdle(stored); });
          }
          if (res.status === 404) {
            removePlayer(storage);
            s.player = null;
            toRegister(true);
            return;
          }
          toIdle(stored); // 5xx: vẫn cho chơi
        }, function () {
          toIdle(stored); // lỗi mạng / quá thời gian: vẫn cho chơi
        })
        .then(function () { return s.state; });
    }

    /** Bấm "Đăng ký & chơi". Trả về Promise<boolean> (true nếu đã gửi yêu cầu). */
    function submit(values) {
      if (s.state !== FLOW.REGISTER || s.submitting) return Promise.resolve(false);
      var check = V.validateRegistration(values);
      if (!check.ok) {
        call("showFieldErrors", check.fields);
        return Promise.resolve(false);
      }
      s.submitting = true;
      call("setSubmitting", true);
      call("showGeneralError", null);
      var body = JSON.stringify({
        fullName: values.fullName,
        email: values.email,
        phone: values.phone,
        consent: values.consent === true
      });
      return fetchWithTimeout("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body
      }, CONFIG.SUBMIT_TIMEOUT_MS)
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            if ((res.status === 200 || res.status === 201) && data && UUID_RE.test(String(data.id))) {
              var p = { id: data.id, fullName: String(data.fullName || check.value.fullName) };
              writePlayer(storage, p);
              call("setSubmitting", false);
              toIdle(p);
              return;
            }
            s.submitting = false;
            call("setSubmitting", false);
            if (res.status === 400 && data && data.fields) call("showFieldErrors", data.fields);
            else if (res.status === 429) call("showGeneralError", data.message || "Bạn gửi quá nhiều lần. Vui lòng thử lại sau ít phút.");
            else call("showGeneralError", "Không kết nối được máy chủ. Vui lòng thử lại.");
          });
        }, function () {
          s.submitting = false;
          call("setSubmitting", false);
          call("showGeneralError", "Không kết nối được máy chủ. Vui lòng thử lại.");
        })
        .then(function () { return true; });
    }

    /** "Đổi người chơi" — chỉ ở IDLE (04 · mục 11). */
    function changePlayer() {
      if (s.state !== FLOW.IDLE) return false;
      removePlayer(storage);
      s.player = null;
      toRegister(true);
      return true;
    }

    return {
      boot: boot,
      submit: submit,
      changePlayer: changePlayer,
      get state() { return s.state; },
      get submitting() { return s.submitting; },
      get player() { return s.player; }
    };
  }

  /* ---------- Giao diện S0 / S1 ---------- */

  function getStorage() {
    try {
      var ls = global.localStorage;
      var probe = "__dapToi_probe__";
      ls.setItem(probe, probe);
      ls.removeItem(probe);
      return ls;
    } catch (e) {
      return null;
    }
  }

  function initPlayerUI(doc) {
    var $ = function (id) { return doc.getElementById(id); };
    var gameUI = global.DapToi.ui;
    var form = $("register-form");
    var submitBtn = $("btn-register");
    var submitLabel = submitBtn.textContent;
    var generalError = $("register-error");
    var greeting = $("start-greeting");
    var greetingName = $("start-greeting-name");
    var btnChange = $("btn-change-player");

    var fields = {
      fullName: { input: $("reg-name"), error: $("reg-name-error"), check: function (v) { return V.validateName(v).error; } },
      email: { input: $("reg-email"), error: $("reg-email-error"), check: function (v) { return V.validateEmail(v).error; } },
      phone: { input: $("reg-phone"), error: $("reg-phone-error"), check: function (v) { return V.validatePhone(v).error; } },
      consent: { input: $("reg-consent"), error: $("reg-consent-error"), check: function (v) { return V.validateConsent(v).error; } }
    };
    var order = ["fullName", "email", "phone", "consent"];

    function valueOf(key) {
      var input = fields[key].input;
      return input.type === "checkbox" ? input.checked : input.value;
    }

    function setError(key, msg) {
      var f = fields[key];
      f.error.textContent = msg || "";
      f.error.hidden = !msg;
      if (msg) f.input.setAttribute("aria-invalid", "true");
      else f.input.removeAttribute("aria-invalid");
    }

    function clearAll() {
      order.forEach(function (k) { setError(k, null); });
      generalError.hidden = true;
      generalError.textContent = "";
    }

    function showFieldErrors(errs) {
      var first = null;
      order.forEach(function (k) {
        setError(k, errs[k] || null);
        if (errs[k] && !first) first = k;
      });
      if (first) fields[first].input.focus();
    }

    var flow = createPlayerFlow({
      fetch: global.fetch ? global.fetch.bind(global) : function () { return Promise.reject(new Error("no fetch")); },
      storage: getStorage(),
      ui: {
        showBoot: function () { gameUI.showScreen("boot"); },
        showRegister: function (reset) {
          if (reset) { form.reset(); clearAll(); }
          gameUI.showScreen("register");
          fields.fullName.input.focus();
        },
        showStart: function (fullName) {
          greetingName.textContent = fullName;
          greeting.hidden = false;
          btnChange.hidden = false;
          gameUI.renderBest();
          gameUI.showScreen("start");
          gameUI.focusStart();
        },
        showFieldErrors: showFieldErrors,
        showGeneralError: function (msg) {
          generalError.textContent = msg || "";
          generalError.hidden = !msg;
        },
        setSubmitting: function (on) {
          submitBtn.disabled = on;
          submitBtn.textContent = on ? "Đang gửi…" : submitLabel;
        }
      }
    });

    // Kiểm tra khi rời ô; lỗi đã hiện thì biến mất ngay khi ô hợp lệ lúc đang gõ
    order.forEach(function (k) {
      var f = fields[k];
      var evt = f.input.type === "checkbox" ? "change" : "blur";
      f.input.addEventListener(evt, function () { setError(k, f.check(valueOf(k))); });
      if (f.input.type !== "checkbox") {
        f.input.addEventListener("input", function () {
          if (!f.error.hidden && !f.check(valueOf(k))) setError(k, null);
        });
      }
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      flow.submit({
        fullName: valueOf("fullName"),
        email: valueOf("email"),
        phone: valueOf("phone"),
        consent: valueOf("consent")
      });
    });

    btnChange.addEventListener("click", function () { flow.changePlayer(); });

    flow.boot();
    return flow;
  }

  global.DapToi.FLOW = FLOW;
  global.DapToi.readPlayer = readPlayer;
  global.DapToi.writePlayer = writePlayer;
  global.DapToi.createPlayerFlow = createPlayerFlow;

  if (global.document && global.document.getElementById("screen-register") && global.DapToi.ui) {
    global.DapToi.player = initPlayerUI(global.document);
  }
})(window);
