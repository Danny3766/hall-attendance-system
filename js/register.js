const db = window.supabaseClient;
let selectedMeeting = null;
let openMeetings = [];
let registrationGuestSequence = 0;

document.addEventListener("DOMContentLoaded", async () => {
  const form = $("#registrationForm");
  const lookupForm = $("#lookupForm");
  window.setupLocationOptions(lookupForm);
  setupRegistrationMealControls();
  $("#addRegistrationGuest").addEventListener("click", () => addRegistrationGuestInput(""));
  addRegistrationGuestInput("");
  await loadOpenMeetings();
  form.addEventListener("submit", handleSubmit);
  lookupForm.addEventListener("submit", handleLookupSubmit);
});

async function loadOpenMeetings() {
  showMessage("#formMessage", "正在載入開放報名的聚會...", "info");

  const { data, error } = await db
    .from("meetings")
    .select("id,title,description,meeting_date,location,registration_deadline,is_open")
    .eq("is_open", true)
    .order("meeting_date", { ascending: true });

  if (error) {
    showMessage("#formMessage", `載入聚會失敗：${error.message}`, "error");
    return;
  }

  openMeetings = (data || []).filter((meeting) => !isPastDeadline(meeting));
  const meetingInput = $("#meeting_id");

  if (openMeetings.length === 0) {
    meetingInput.value = "";
    $("#submitButton").disabled = true;
    renderMeetingSummary(null);
    showMessage("#formMessage", "目前沒有開放報名的聚會，請稍後再試。", "info");
    return;
  }

  selectedMeeting = openMeetings[0];
  meetingInput.value = selectedMeeting.id;
  renderMeetingSummary(selectedMeeting);
  showMessage("#formMessage", "", "info");
}

function renderMeetingSummary(meeting) {
  const card = $("#meetingSummary");
  if (!meeting) {
    card.innerHTML = "<p>尚未選擇聚會。</p>";
    return;
  }

  const meetingHeading = openMeetings.length > 1
    ? `
      <label class="meeting-title-picker">
        <span class="sr-only">選擇開放報名的聚會</span>
        <select id="meetingPicker">
          ${openMeetings.map((item) => `
            <option value="${item.id}" ${item.id === meeting.id ? "selected" : ""}>
              ${item.title}
            </option>
          `).join("")}
        </select>
      </label>
    `
    : `<h2>${meeting.title}</h2>`;

  card.innerHTML = `
    <p class="eyebrow">目前開放報名</p>
    ${meetingHeading}
    <p>${meeting.description || "歡迎弟兄姊妹一同有分聚集。"}</p>
    <dl class="meeting-meta">
      <div><dt>時間</dt><dd>${formatDateTime(meeting.meeting_date)}</dd></div>
      <div><dt>地點</dt><dd>${meeting.location || "待公布"}</dd></div>
      <div><dt>報名截止</dt><dd>${formatDateTime(meeting.registration_deadline)}</dd></div>
    </dl>
  `;

  const picker = $("#meetingPicker");
  if (picker) {
    const handleMeetingPickerChange = () => {
      selectedMeeting = openMeetings.find((item) => item.id === picker.value) || null;
      $("#meeting_id").value = selectedMeeting ? selectedMeeting.id : "";
      renderMeetingSummary(selectedMeeting);
    };

    picker.addEventListener("change", handleMeetingPickerChange);
    picker.addEventListener("input", handleMeetingPickerChange);
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  syncRegistrationGuestsAndAttendeeCount();
  const payload = collectRegistrationForm(form);
  payload.meeting_id = form.elements.namedItem("meeting_id").value;
  payload.edit_token = crypto.randomUUID();

  const mealSelectionError = validateRegistrationMealSelections();
  const validationError = validateRegistrationData(payload);
  if (!payload.meeting_id) showMessage("#formMessage", "請選擇聚會。", "error");
  if (!payload.meeting_id) return;
  if (mealSelectionError) {
    showMessage("#formMessage", mealSelectionError, "error");
    return;
  }
  if (validationError) {
    showMessage("#formMessage", validationError, "error");
    return;
  }

  if (selectedMeeting && isPastDeadline(selectedMeeting)) {
    showMessage("#formMessage", "這場聚會已超過報名截止時間。", "error");
    return;
  }

  $("#submitButton").disabled = true;
  $("#submitButton").textContent = "送出中...";
  showMessage("#formMessage", "正在送出報名資料...", "info");

  const { data, error } = await db.rpc("create_registration", {
    new_meeting_id: payload.meeting_id,
    new_inviter_name: payload.inviter_name,
    new_hall: payload.hall,
    new_district: payload.district,
    new_meal_required: payload.meal_required,
    new_attendee_count: payload.attendee_count,
    new_meat_meal_count: payload.meat_meal_count,
    new_vegetarian_meal_count: payload.vegetarian_meal_count,
    new_guest_names: payload.guest_names,
    new_note: payload.note,
    new_edit_token: payload.edit_token,
  });

  if (error) {
    showMessage("#formMessage", `報名失敗：${error.message}`, "error");
    $("#submitButton").disabled = false;
    $("#submitButton").textContent = "送出報名";
    return;
  }

  window.location.replace(`success.html?id=${encodeURIComponent(data.id)}&token=${encodeURIComponent(data.edit_token)}`);
}

async function handleLookupSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    search_meeting_id: selectedMeeting?.id || null,
    search_inviter_name: form.elements.namedItem("inviter_name").value.trim(),
    search_hall: form.elements.namedItem("hall").value.trim(),
    search_district: form.elements.namedItem("district").value.trim(),
  };

  if (!payload.search_meeting_id) {
    showMessage("#lookupMessage", "請先選擇要查詢的聚會。", "error");
    return;
  }

  if (!payload.search_inviter_name || !payload.search_hall || !payload.search_district) {
    showMessage("#lookupMessage", "請填寫邀請人、會所與區。", "error");
    return;
  }

  $("#lookupButton").disabled = true;
  $("#lookupButton").textContent = "查詢中...";
  showMessage("#lookupMessage", "正在查詢既有報名...", "info");

  const { data, error } = await db.rpc("find_registration_for_success", payload);

  if (error) {
    showMessage("#lookupMessage", `查詢失敗：${error.message}`, "error");
    resetLookupButton();
    return;
  }

  if (!data) {
    showMessage("#lookupMessage", "找不到符合的報名資料，請確認輸入是否正確。", "error");
    resetLookupButton();
    return;
  }

  window.location.replace(`success.html?id=${encodeURIComponent(data.id)}&token=${encodeURIComponent(data.edit_token)}`);
}

function resetLookupButton() {
  $("#lookupButton").disabled = false;
  $("#lookupButton").textContent = "查詢報名";
}

function addRegistrationGuestInput(value) {
  registrationGuestSequence += 1;
  const row = document.createElement("div");
  row.className = "registration-guest-entry";
  row.innerHTML = `
    <div class="guest-row">
      <input class="registration-guest-input" type="text" value="${escapeHtml(value)}" placeholder="請輸入受邀人姓名">
      <button class="ghost-button guest-remove" type="button">移除</button>
    </div>
    <div class="guest-meal-panel" hidden>
      <label class="checkbox-card compact-checkbox guest-meal-toggle-card">
        <input class="guest-meal-toggle" type="checkbox">
        <span>
          <strong>需要用餐</strong>
          <small>勾選後選擇葷食或素食</small>
        </span>
      </label>
      <div class="diet-choice-group guest-diet-choice" hidden>
        <label class="option-chip">
          <input class="guest-meal-type" name="guest_meal_type_${registrationGuestSequence}" type="radio" value="meat">
          <span>葷食</span>
        </label>
        <label class="option-chip">
          <input class="guest-meal-type" name="guest_meal_type_${registrationGuestSequence}" type="radio" value="vegetarian">
          <span>素食</span>
        </label>
      </div>
    </div>
  `;

  row.querySelector(".registration-guest-input").addEventListener("input", syncRegistrationGuestsAndAttendeeCount);
  row.querySelector(".guest-meal-toggle").addEventListener("change", () => {
    syncRegistrationGuestMealState(row);
    syncRegistrationMealSummary();
  });
  row.querySelectorAll(".guest-meal-type").forEach((input) => {
    input.addEventListener("change", syncRegistrationMealSummary);
  });
  row.querySelector(".guest-remove").addEventListener("click", () => {
    row.remove();
    if (document.querySelectorAll(".registration-guest-input").length === 0) addRegistrationGuestInput("");
    syncRegistrationGuestsAndAttendeeCount();
  });

  $("#registrationGuestList").appendChild(row);
  syncRegistrationGuestsAndAttendeeCount();
}

function syncRegistrationGuestsAndAttendeeCount() {
  const form = $("#registrationForm");
  const guestEntries = Array.from(document.querySelectorAll(".registration-guest-entry"));
  const guests = guestEntries
    .map((entry) => entry.querySelector(".registration-guest-input").value.trim())
    .filter(Boolean);

  form.elements.namedItem("guest_names").value = guests.join("、");
  form.elements.namedItem("attendee_count").value = 1 + guests.length;
  setText("#registrationAttendeeCountHint", `目前報名人數：${1 + guests.length} 人`);
  guestEntries.forEach((entry) => syncRegistrationGuestMealState(entry));
  syncRegistrationMealSummary();
}

function setupRegistrationMealControls() {
  const inviterMealToggle = $("#inviterMealToggle");
  const inviterMealType = $("#inviterMealType");

  if (!inviterMealToggle || !inviterMealType) return;

  inviterMealToggle.addEventListener("change", () => {
    syncDietChoiceGroup(inviterMealType, inviterMealToggle.checked);
    syncRegistrationMealSummary();
  });
  inviterMealType.querySelectorAll('input[type="radio"]').forEach((input) => {
    input.addEventListener("change", syncRegistrationMealSummary);
  });
  syncDietChoiceGroup(inviterMealType, inviterMealToggle.checked);
  syncRegistrationMealSummary();
}

function syncRegistrationGuestMealState(entry) {
  const name = entry.querySelector(".registration-guest-input").value.trim();
  const panel = entry.querySelector(".guest-meal-panel");
  const toggle = entry.querySelector(".guest-meal-toggle");
  const dietChoiceGroup = entry.querySelector(".guest-diet-choice");
  const hasName = Boolean(name);

  panel.hidden = !hasName;
  toggle.disabled = !hasName;
  if (!hasName) toggle.checked = false;
  syncDietChoiceGroup(dietChoiceGroup, hasName && toggle.checked);
}

function syncDietChoiceGroup(group, enabled) {
  group.hidden = !enabled;
  group.querySelectorAll('input[type="radio"]').forEach((input) => {
    input.disabled = !enabled;
    if (!enabled) input.checked = false;
  });
}

function syncRegistrationMealSummary() {
  const hiddenMealRequired = document.querySelector('#registrationForm [name="meal_required"]');
  const hiddenMeatCount = document.querySelector('#registrationForm [name="meat_meal_count"]');
  const hiddenVegetarianCount = document.querySelector('#registrationForm [name="vegetarian_meal_count"]');
  let meatCount = 0;
  let vegetarianCount = 0;

  if ($("#inviterMealToggle").checked) {
    const inviterMealType = getCheckedMealType($("#inviterMealType"));
    if (inviterMealType === "meat") meatCount += 1;
    if (inviterMealType === "vegetarian") vegetarianCount += 1;
  }

  document.querySelectorAll(".registration-guest-entry").forEach((entry) => {
    const input = entry.querySelector(".registration-guest-input");
    const toggle = entry.querySelector(".guest-meal-toggle");
    if (!input.value.trim() || !toggle.checked) return;

    const mealType = getCheckedMealType(entry.querySelector(".guest-diet-choice"));
    if (mealType === "meat") meatCount += 1;
    if (mealType === "vegetarian") vegetarianCount += 1;
  });

  hiddenMealRequired.checked = hasAnyMealSelection();
  hiddenMeatCount.value = meatCount;
  hiddenVegetarianCount.value = vegetarianCount;
  setText("#meatMealCountDisplay", String(meatCount));
  setText("#vegetarianMealCountDisplay", String(vegetarianCount));
}

function hasAnyMealSelection() {
  if ($("#inviterMealToggle").checked) return true;
  return Array.from(document.querySelectorAll(".registration-guest-entry .guest-meal-toggle"))
    .some((toggle) => !toggle.disabled && toggle.checked);
}

function getCheckedMealType(container) {
  const selected = container.querySelector('input[type="radio"]:checked');
  return selected ? selected.value : "";
}

function validateRegistrationMealSelections() {
  if ($("#inviterMealToggle").checked && !getCheckedMealType($("#inviterMealType"))) {
    return "請為邀請人勾選葷食或素食。";
  }

  for (const entry of document.querySelectorAll(".registration-guest-entry")) {
    const name = entry.querySelector(".registration-guest-input").value.trim();
    const toggle = entry.querySelector(".guest-meal-toggle");
    if (!name || !toggle.checked) continue;
    if (!getCheckedMealType(entry.querySelector(".guest-diet-choice"))) {
      return `請為受邀人「${name}」勾選葷食或素食。`;
    }
  }

  return "";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
