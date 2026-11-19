/* =========================================================
   app/validate.js — Chuẩn hoá & kiểm tra dữ liệu đăng ký người chơi
   Căn cứ: docs/04-quy-tac-du-lieu.html mục 12, docs/03-man-hinh.html mục 12
   Dùng chung cho trình duyệt (window.DapToiValidate) và server (require).
   ========================================================= */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DapToiValidate = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* Thông số dùng chung (04 · mục 18) */
  var RULES = Object.freeze({
    NAME_MIN: 2,
    NAME_MAX: 100,
    EMAIL_MAX: 254,
    PHONE_PATTERN: /^0[35789][0-9]{8}$/,
    SEARCH_MAX: 100
  });

  /* Câu báo lỗi (03 · mục 12) */
  var MSG = Object.freeze({
    nameEmpty: "Vui lòng nhập họ và tên.",
    nameLength: "Họ và tên cần từ " + RULES.NAME_MIN + " đến " + RULES.NAME_MAX + " ký tự.",
    nameFormat: "Họ và tên chỉ gồm chữ cái, khoảng trắng và các dấu ' - .",
    emailEmpty: "Vui lòng nhập email.",
    emailFormat: "Email không đúng định dạng (ví dụ: ten@gmail.com).",
    phoneEmpty: "Vui lòng nhập số điện thoại.",
    phoneLength: "Số điện thoại phải có 10 chữ số.",
    phonePrefix: "Số điện thoại di động Việt Nam phải bắt đầu bằng 03, 05, 07, 08 hoặc 09.",
    consent: "Bạn cần đồng ý để tiếp tục."
  });

  var NAME_CHARS = /^[\p{L}\p{M}' .-]+$/u;
  var LETTER = /\p{L}/gu;
  var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function charLength(s) { return Array.from(s).length; }

  function normalizeName(raw) {
    if (typeof raw !== "string") return "";
    return raw.normalize("NFC").trim().replace(/\s+/g, " ");
  }

  function validateName(raw) {
    var value = normalizeName(raw);
    if (value === "") return { value: value, error: MSG.nameEmpty };
    var len = charLength(value);
    if (len < RULES.NAME_MIN || len > RULES.NAME_MAX) return { value: value, error: MSG.nameLength };
    if (!NAME_CHARS.test(value) || (value.match(LETTER) || []).length < 2) return { value: value, error: MSG.nameFormat };
    return { value: value, error: null };
  }

  function normalizeEmail(raw) {
    if (typeof raw !== "string") return "";
    return raw.trim().toLowerCase();
  }

  function validateEmail(raw) {
    var value = normalizeEmail(raw);
    if (value === "") return { value: value, error: MSG.emailEmpty };
    if (value.length > RULES.EMAIL_MAX || !EMAIL_PATTERN.test(value)) return { value: value, error: MSG.emailFormat };
    return { value: value, error: null };
  }

  function normalizePhone(raw) {
    if (typeof raw !== "string") return "";
    var s = raw.replace(/[\s.\-()]/g, "");
    if (/^\+84\d{9}$/.test(s)) s = "0" + s.slice(3);
    else if (/^84\d{9}$/.test(s)) s = "0" + s.slice(2);
    return s;
  }

  function validatePhone(raw) {
    var value = normalizePhone(raw);
    if (value === "") return { value: value, error: MSG.phoneEmpty };
    if (!/^\d{10}$/.test(value)) return { value: value, error: MSG.phoneLength };
    if (!RULES.PHONE_PATTERN.test(value)) return { value: value, error: MSG.phonePrefix };
    return { value: value, error: null };
  }

  function validateConsent(raw) {
    return { value: raw === true, error: raw === true ? null : MSG.consent };
  }

  /** Kiểm tra cả form. body: { fullName, email, phone, consent } */
  function validateRegistration(body) {
    body = body && typeof body === "object" ? body : {};
    var checks = {
      fullName: validateName(body.fullName),
      email: validateEmail(body.email),
      phone: validatePhone(body.phone),
      consent: validateConsent(body.consent)
    };
    var fields = {};
    Object.keys(checks).forEach(function (k) { if (checks[k].error) fields[k] = checks[k].error; });
    return {
      ok: Object.keys(fields).length === 0,
      fields: fields,
      value: { fullName: checks.fullName.value, email: checks.email.value, phone: checks.phone.value }
    };
  }

  return {
    RULES: RULES,
    MSG: MSG,
    normalizeName: normalizeName,
    normalizeEmail: normalizeEmail,
    normalizePhone: normalizePhone,
    validateName: validateName,
    validateEmail: validateEmail,
    validatePhone: validatePhone,
    validateConsent: validateConsent,
    validateRegistration: validateRegistration
  };
});
