const db = window.supabaseClient;
let registrationId = null;
let editToken = null;
let loadedMeeting = null;
let renderDistrictOptions = null;

document.addEventListener("DOMContentLoaded", async () => {
  const id = getQueryParam("id");
  const token = getQueryParam("token");
  const form = $("#confirmForm");
  renderDistrictOptions = window.setupLocationOptions(form);
  $("#addGuest").addEventListener("click", () => addGuestInput(""));
  $("#confirmBackHome").addEventListener("click", () => {
    window.location.replace("index.html");
  });

  if (!id || !token) {
    $("#successTitle").hidden = true;
    setText("#successDescription", "目前沒有可確認的報名紀錄。請回到報名頁完成報名，或使用查詢功能找回既有報名。");
    showMessage("#successMessage", "尚未取得報名資料。若要修改資料，請回到報名頁查詢既有報名。", "info");
    return;
  }

  $("#successTitle").hidden = false;

  registrationId = id;
  editToken = token;
  form.addEventListener("submit", handleConfirmUpdate);
  await loadRegistrationForConfirmation();
});

async function loadRegistrationForConfirmation() {
  showMessage("#successMessage", "正在載入報名資料...", "info");

  const { data, error } = await db.rpc("get_registration_by_token", {
    registration_id: registrationId,
    token: editToken,
  });

  if (error || !data) {
    $("#successTitle").hidden = true;
    setText("#successDescription", "目前沒有可確認的報名紀錄。請回到報名頁完成報名，或使用查詢功能找回既有報名。");
    showMessage("#successMessage", "找不到報名資料，請回到報名頁重新查詢。", "error");
    return;
  }

  loadedMeeting = data.meeting;
  renderConfirmMeetingSummary(loadedMeeting);
  fillConfirmForm(data);
  $("#registrationConfirmPanel").hidden = false;
  showMessage("#successMessage", "", "info");
}

function renderConfirmMeetingSummary(meeting) {
  const card = $("#confirmMeetingSummary");
  if (!meeting) return;

  card.innerHTML = `
    <p class="eyebrow">報名聚會</p>
    <h2>${meeting.title}</h2>
    <dl class="meeting-meta">
      <div><dt>時間</dt><dd>${formatDateTime(meeting.meeting_date)}</dd></div>
      <div><dt>地點</dt><dd>${meeting.location || "待公布"}</dd></div>
      <div><dt>截止</dt><dd>${formatDateTime(meeting.registration_deadline)}</dd></div>
    </dl>
  `;
}

function fillConfirmForm(data) {
  const form = $("#confirmForm");
  const fields = form.elements;
  fields.namedItem("inviter_name").value = data.inviter_name;
  fields.namedItem("hall").value = data.hall;
  renderDistrictOptions(data.district);
  fields.namedItem("meal_required").checked = data.meal_required;
  fields.namedItem("meat_meal_count").value = data.meat_meal_count;
  fields.namedItem("vegetarian_meal_count").value = data.vegetarian_meal_count;
  renderGuestInputs(data.guest_names || "");
  fields.namedItem("note").value = data.note || "";
  window.setupMealToggle(form);
  syncGuestsAndAttendeeCount();
}

async function handleConfirmUpdate(event) {
  event.preventDefault();
  syncGuestsAndAttendeeCount();
  const payload = collectRegistrationForm(event.currentTarget);
  const validationError = validateRegistrationData(payload);

  if (validationError) {
    showMessage("#successMessage", validationError, "error");
    return;
  }

  if (!loadedMeeting?.is_open || isPastDeadline(loadedMeeting)) {
    showMessage("#successMessage", "這場聚會已關閉或超過報名截止時間，不能再修改。", "error");
    return;
  }

  $("#updateFromSuccess").disabled = true;
  $("#updateFromSuccess").textContent = "修改中...";
  showMessage("#successMessage", "正在更新報名資料...", "info");

  const { data, error } = await db.rpc("update_registration_by_token", {
    registration_id: registrationId,
    token: editToken,
    new_inviter_name: payload.inviter_name,
    new_hall: payload.hall,
    new_district: payload.district,
    new_meal_required: payload.meal_required,
    new_attendee_count: payload.attendee_count,
    new_meat_meal_count: payload.meat_meal_count,
    new_vegetarian_meal_count: payload.vegetarian_meal_count,
    new_guest_names: payload.guest_names,
    new_note: payload.note,
  });

  if (error || !data) {
    showMessage("#successMessage", `修改失敗：${error ? error.message : "報名已關閉、逾期或資料不存在。"}`, "error");
    resetUpdateButton();
    return;
  }

  showMessage("#successMessage", "", "info");
  showSuccessToast("報名資料已成功修改並送出。");
  resetUpdateButton();
}

function resetUpdateButton() {
  $("#updateFromSuccess").disabled = false;
  $("#updateFromSuccess").textContent = "修改送出";
}

function renderGuestInputs(guestNames) {
  const guests = parseGuestNames(guestNames);
  $("#guestList").innerHTML = "";

  if (guests.length === 0) {
    addGuestInput("");
    return;
  }

  guests.forEach((guest) => addGuestInput(guest));
}

function parseGuestNames(value) {
  return String(value || "")
    .split(/[\n,，、]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function addGuestInput(value) {
  const row = document.createElement("div");
  row.className = "guest-row";
  row.innerHTML = `
    <input class="guest-input" type="text" value="${escapeHtml(value)}" placeholder="請輸入受邀人姓名">
    <button class="ghost-button guest-remove" type="button">移除</button>
  `;

  row.querySelector(".guest-input").addEventListener("input", syncGuestsAndAttendeeCount);
  row.querySelector(".guest-remove").addEventListener("click", () => {
    row.remove();
    if ($$(".guest-row").length === 0) addGuestInput("");
    syncGuestsAndAttendeeCount();
  });

  $("#guestList").appendChild(row);
  syncGuestsAndAttendeeCount();
}

function syncGuestsAndAttendeeCount() {
  const form = $("#confirmForm");
  const guests = Array.from(document.querySelectorAll(".guest-input"))
    .map((input) => input.value.trim())
    .filter(Boolean);

  form.elements.namedItem("guest_names").value = guests.join("、");
  form.elements.namedItem("attendee_count").value = 1 + guests.length;
  setText("#attendeeCountHint", `目前報名人數：${1 + guests.length} 人`);
}

function $$(selector) {
  return document.querySelectorAll(selector);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showSuccessToast(message) {
  const toast = $("#successToast");
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.add("show");
  toast.scrollIntoView({ behavior: "smooth", block: "center" });

  window.setTimeout(() => {
    toast.classList.remove("show");
  }, 5000);
}
