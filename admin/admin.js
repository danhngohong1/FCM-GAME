/* =========================================================
   admin/admin.js — Trang quản trị: đăng nhập (A1), danh sách / tìm / xoá / xuất CSV (A2, A3)
   Căn cứ: docs/02 (F-15 → F-18), docs/03 (mục 9–12), docs/04 (mục 16–17)
   Dữ liệu người chơi luôn gán bằng textContent, không dùng innerHTML.
   ========================================================= */
(function () {
  "use strict";

  var TOAST_MS = 4000;
  var DISPLAY_TZ = "Asia/Ho_Chi_Minh";
  var $ = function (id) { return document.getElementById(id); };

  function toLogin(expired) {
    location.replace("/admin/login" + (expired ? "?expired=1" : ""));
  }

  function jsonOrEmpty(res) {
    return res.json().catch(function () { return {}; });
  }

  /* ---------- A1 · Đăng nhập ---------- */

  function initLogin() {
    var form = $("login-form");
    var user = $("login-username");
    var pass = $("login-password");
    var err = $("login-error");
    var notice = $("login-notice");
    var btn = $("btn-login");

    if (new URLSearchParams(location.search).get("expired") === "1") {
      notice.textContent = "Phiên đăng nhập đã hết hạn.";
      notice.hidden = false;
    }
    user.focus();

    function showError(msg) {
      err.textContent = msg;
      err.hidden = !msg;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (btn.disabled) return;
      showError("");
      btn.disabled = true;
      fetch("/admin/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username: user.value, password: pass.value })
      }).then(function (res) {
        if (res.status === 204) {
          location.replace("/admin/");
          return;
        }
        return jsonOrEmpty(res).then(function (data) {
          btn.disabled = false;
          pass.value = "";
          if (res.status === 401) showError("Tên đăng nhập hoặc mật khẩu không đúng.");
          else if (res.status === 429) showError(data.message || "Đăng nhập sai quá nhiều lần. Thử lại sau ít phút.");
          else showError(data.message || "Không kết nối được máy chủ. Vui lòng thử lại.");
          pass.focus();
        });
      }, function () {
        btn.disabled = false;
        showError("Không kết nối được máy chủ. Vui lòng thử lại.");
      });
    });
  }

  /* ---------- A2 · Danh sách ---------- */

  var dateFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TZ, day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  });

  /** dd/MM/yyyy HH:mm theo giờ Việt Nam */
  function formatDate(iso) {
    var parts = {};
    dateFmt.formatToParts(new Date(iso)).forEach(function (p) { parts[p.type] = p.value; });
    return parts.day + "/" + parts.month + "/" + parts.year + " " + parts.hour + ":" + parts.minute;
  }

  function initList() {
    var params = new URLSearchParams(location.search);
    var state = { q: (params.get("q") || "").trim(), page: Number(params.get("page")) || 1, loading: false };
    var searchInput = $("search-input");
    var rows = $("rows");
    var summary = $("summary");
    var empty = $("empty");
    var pageInfo = $("page-info");
    var btnPrev = $("btn-prev");
    var btnNext = $("btn-next");
    var btnExport = $("btn-export");
    var toast = $("toast");
    var dialog = $("confirm");
    var btnCancel = $("btn-cancel");
    var btnConfirm = $("btn-confirm");
    var toastTimer = null;
    var pending = null; // { id, fullName, button }
    var last = { pages: 1 };

    searchInput.value = state.q;

    function showToast(msg) {
      toast.textContent = msg;
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toast.hidden = true; }, TOAST_MS);
    }

    function syncUrl() {
      var p = new URLSearchParams();
      if (state.q) p.set("q", state.q);
      if (state.page > 1) p.set("page", String(state.page));
      var qs = p.toString();
      history.replaceState(null, "", "/admin/" + (qs ? "?" + qs : ""));
      btnExport.href = "/admin/api/players.csv" + (state.q ? "?q=" + encodeURIComponent(state.q) : "");
    }

    function render(data) {
      state.page = data.page;
      last = data;
      rows.textContent = "";
      data.items.forEach(function (p) {
        var tr = document.createElement("tr");
        [p.fullName, p.email, p.phone, formatDate(p.createdAt)].forEach(function (v) {
          var td = document.createElement("td");
          td.textContent = v;
          tr.appendChild(td);
        });
        var td = document.createElement("td");
        var del = document.createElement("button");
        del.type = "button";
        del.className = "link-del";
        del.textContent = "Xoá";
        del.setAttribute("aria-label", "Xoá " + p.fullName);
        del.addEventListener("click", function () { openConfirm(p, del); });
        td.appendChild(del);
        tr.appendChild(td);
        rows.appendChild(tr);
      });

      summary.textContent = state.q
        ? data.total + " người chơi khớp “" + state.q + "”"
        : data.total + " người chơi";
      empty.hidden = data.items.length > 0;
      empty.textContent = state.q ? "Không tìm thấy người chơi nào." : "Chưa có người chơi nào.";
      pageInfo.textContent = "Trang " + data.page + " / " + data.pages;
      btnPrev.disabled = data.page <= 1;
      btnNext.disabled = data.page >= data.pages;
      syncUrl();
    }

    function load() {
      state.loading = true;
      var p = new URLSearchParams();
      if (state.q) p.set("q", state.q);
      p.set("page", String(state.page));
      return fetch("/admin/api/players?" + p.toString(), { credentials: "same-origin", cache: "no-store" })
        .then(function (res) {
          if (res.status === 401) { toLogin(true); return; }
          return jsonOrEmpty(res).then(function (data) {
            if (!res.ok) { showToast(data.message || "Không kết nối được máy chủ. Vui lòng thử lại."); return; }
            render(data);
          });
        }, function () {
          showToast("Không kết nối được máy chủ. Vui lòng thử lại.");
        })
        .then(function () { state.loading = false; });
    }

    $("search-form").addEventListener("submit", function (e) {
      e.preventDefault();
      state.q = searchInput.value.trim();
      state.page = 1;
      load();
    });
    btnPrev.addEventListener("click", function () { if (state.page > 1) { state.page -= 1; load(); } });
    btnNext.addEventListener("click", function () { if (state.page < last.pages) { state.page += 1; load(); } });

    $("btn-logout").addEventListener("click", function () {
      fetch("/admin/api/logout", { method: "POST", credentials: "same-origin" })
        .finally(function () { toLogin(false); });
    });

    /* ---------- A3 · Xác nhận xoá ---------- */

    function openConfirm(p, button) {
      pending = { id: p.id, fullName: p.fullName, button: button };
      $("confirm-name").textContent = p.fullName;
      $("confirm-email").textContent = p.email;
      btnCancel.disabled = false;
      btnConfirm.disabled = false;
      dialog.showModal();
      btnCancel.focus();
    }

    function closeConfirm() {
      if (dialog.open) dialog.close();
    }

    dialog.addEventListener("close", function () {
      if (dialog.open) return; // hộp đã được mở lại trước khi sự kiện close tới
      var target = pending && pending.button;
      pending = null;
      if (target && document.body.contains(target)) target.focus();
      else searchInput.focus();
    });
    dialog.addEventListener("cancel", function (e) {
      if (btnConfirm.disabled) e.preventDefault(); // đang xoá thì không đóng
    });
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog && !btnConfirm.disabled) closeConfirm(); // bấm ra ngoài hộp = Huỷ
    });
    btnCancel.addEventListener("click", closeConfirm);

    btnConfirm.addEventListener("click", function () {
      if (!pending || btnConfirm.disabled) return;
      var target = pending;
      btnCancel.disabled = true;
      btnConfirm.disabled = true;
      fetch("/admin/api/players/" + encodeURIComponent(target.id), { method: "DELETE", credentials: "same-origin" })
        .then(function (res) {
          if (res.status === 401) { toLogin(true); return; }
          btnCancel.disabled = false;
          btnConfirm.disabled = false;
          closeConfirm();
          if (res.status === 204) showToast("Đã xoá " + target.fullName + ".");
          else if (res.status === 404) showToast("Người chơi không còn tồn tại.");
          else return jsonOrEmpty(res).then(function (d) { showToast(d.message || "Không xoá được. Vui lòng thử lại."); });
        }, function () {
          btnCancel.disabled = false;
          btnConfirm.disabled = false;
          closeConfirm();
          showToast("Không kết nối được máy chủ. Vui lòng thử lại.");
        })
        .then(load);
    });

    load();
  }

  var page = document.body.getAttribute("data-page");
  if (page === "login") initLogin();
  else if (page === "list") initList();
})();
