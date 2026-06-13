function $(selector) {
  return document.querySelector(selector);
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value || "";
}

function showMessage(selector, message, type) {
  const element = $(selector);
  if (!element) return;
  element.textContent = message;
  element.className = `message ${type || "info"}`;
  element.hidden = !message;
}

function toInt(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : 0;
}

function validateRegistrationData(data) {
  if (!data.inviter_name.trim()) return "請填寫邀請人。";
  if (!data.hall.trim()) return "請填寫會所。";
  if (!data.district.trim()) return "請填寫區。";
  if (data.attendee_count < 1) return "報名人數至少需為 1。";
  if (data.meat_meal_count < 0 || data.vegetarian_meal_count < 0) return "餐點數量不可小於 0。";
  if (!data.meal_required && data.meat_meal_count + data.vegetarian_meal_count !== 0) {
    return "若不需要用餐，葷食與素食數量需為 0。";
  }
  if (data.meal_required && data.meat_meal_count + data.vegetarian_meal_count !== data.attendee_count) {
    return "葷食數量加素食數量必須等於報名人數。";
  }
  return "";
}

const TAIWAN_TIME_ZONE = "Asia/Taipei";
const TAIWAN_UTC_OFFSET = "+08:00";

function collectRegistrationForm(form) {
  const fields = form.elements;
  const mealRequired = fields.namedItem("meal_required").checked;
  return {
    inviter_name: fields.namedItem("inviter_name").value.trim(),
    hall: fields.namedItem("hall").value.trim(),
    district: fields.namedItem("district").value.trim(),
    meal_required: mealRequired,
    attendee_count: toInt(fields.namedItem("attendee_count").value),
    meat_meal_count: mealRequired ? toInt(fields.namedItem("meat_meal_count").value) : 0,
    vegetarian_meal_count: mealRequired ? toInt(fields.namedItem("vegetarian_meal_count").value) : 0,
    guest_names: fields.namedItem("guest_names").value.trim() || null,
    note: fields.namedItem("note").value.trim() || null,
  };
}

function formatDateTime(value) {
  if (!value) return "未設定";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: TAIWAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isPastDeadline(meeting) {
  return meeting.registration_deadline && new Date(meeting.registration_deadline).getTime() < Date.now();
}

function escapeCsv(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}
