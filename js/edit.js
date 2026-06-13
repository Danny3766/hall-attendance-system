const db = window.supabaseClient;
let registrationId = null;
let editToken = null;
let loadedMeeting = null;
let renderDistrictOptions = null;

document.addEventListener("DOMContentLoaded", async () => {
  registrationId = getQueryParam("id");
  editToken = getQueryParam("token");
  const form = $("#editForm");
  renderDistrictOptions = window.setupLocationOptions(form);

  $("#addGuest").addEventListener("click", () => addGuestInput(""));
  $("#backToSuccess").addEventListener("click", () => {
    const target = new URL("success.html", window.location.href);
    target.searchParams.set("id", registrationId);
    target.searchParams.set("token", editToken);
    window.location.replace(target.toString());
  });

  if (!registrationId || !editToken) {
    showEditMessage("修改連結不完整，無法載入報名資料。", "error", true);
    $("#editPanel").hidden = true;
    return;
  }

  await loadRegistration();
  form.addEventListener("submit", handleUpdate);
});

async function loadRegistration() {
  showEditMessage("正在載入報名資料...", "info");

  const { data, error } = await db.rpc("get_registration_by_token", {
    registration_id: registrationId,
    token: editToken,
  });

  if (error || !data) {
    showEditMessage("找不到報名資料，請確認修改連結是否正確。", "error", true);
    $("#editPanel").hidden = true;
    return;
  }

  loadedMeeting = data.meeting;
  renderEditMeetingSummary(loadedMeeting);
  fillEditForm(data);

  if (!loadedMeeting?.is_open || isPastDeadline(loadedMeeting)) {
    showEditMessage("這場聚會已關閉或超過報名截止時間，不能再修改。", "error", true);
    $("#saveButton").disabled = true;
    return;
  }

  showEditMessage("", "info");
}

function renderEditMeetingSummary(meeting) {
  const card = $("#meetingSummary");
  if (!meeting) return;

  card.innerHTML = `
    <p class="eyebrow">修改報名</p>
    <h2>${escapeHtml(meeting.title)}</h2>
    <dl class="meeting-meta">
      <div><dt>時間</dt><dd>${formatDateTime(meeting.meeting_date)}</dd></div>
      <div><dt>地點</dt><dd>${escapeHtml(meeting.location || "待公布")}</dd></div>
      <div><dt>截止</dt><dd>${formatDateTime(meeting.registration_deadline)}</dd></div>
    </dl>
  `;
}

function fillEditForm(data) {
  const form = $("#editForm");
  const fields = form.elements;
  fields.namedItem("inviter_name").value = data.inviter_name;
  fields.namedItem("hall").value = data.hall;
  renderDistrictOptions(data.district);
  fields.namedItem("meal_required").checked = data.meal_required;
  fields.namedItem("meat_meal_count").value = data.meat_meal_count ?? 0;
  fields.namedItem("vegetarian_meal_count").value = data.vegetarian_meal_count ?? 0;
  renderGuestInputs(data.guest_names || "");
  fields.namedItem("note").value = data.note || "";
  window.setupMealToggle(form);
  fields.namedItem("meal_required").dispatchEvent(new Event("change"));
  syncGuestsAndAttendeeCount();
}

async function handleUpdate(event) {
  event.preventDefault();
  syncGuestsAndAttendeeCount();
  const payload = collectRegistrationForm(event.currentTarget);
  const validationError = validateRegistrationData(payload);

  if (validationError) {
    showEditMessage(validationError, "error", true);
    return;
  }

  if (!loadedMeeting?.is_open || isPastDeadline(loadedMeeting)) {
    showEditMessage("這場聚會已關閉或超過報名截止時間，不能再修改。", "error", true);
    return;
  }

  $("#saveButton").disabled = true;
  $("#saveButton").textContent = "修改中...";
  showEditMessage("正在更新報名資料...", "info");

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
    showEditMessage(`修改失敗：${error ? error.message : "報名已關閉、逾期或修改連結不正確。"}`, "error", true);
    resetSaveButton();
    return;
  }

  goToSuccessPage();
}

function showEditMessage(message, type, shouldFocus = false) {
  showMessage("#editMessage", message, type);
  if (!message || !shouldFocus) return;

  const element = $("#editMessage");
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.focus({ preventScroll: true });
}

function resetSaveButton() {
  $("#saveButton").disabled = false;
  $("#saveButton").textContent = "修改送出";
}

function goToSuccessPage() {
  const target = new URL("success.html", window.location.href);
  target.searchParams.set("id", registrationId);
  target.searchParams.set("token", editToken);
  window.location.replace(target.toString());
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
  const form = $("#editForm");
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
