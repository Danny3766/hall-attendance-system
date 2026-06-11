const db = window.supabaseClient;
let registrationId = null;
let editToken = null;
let loadedMeeting = null;

document.addEventListener("DOMContentLoaded", async () => {
  registrationId = getQueryParam("id");
  editToken = getQueryParam("token");
  const form = $("#editForm");
  const renderDistrictOptions = window.setupLocationOptions(form);

  if (!registrationId || !editToken) {
    showMessage("#editMessage", "修改連結不完整，無法載入報名資料。", "error");
    $("#editForm").hidden = true;
    return;
  }

  await loadRegistration(renderDistrictOptions);
  form.addEventListener("submit", handleUpdate);
});

async function loadRegistration(renderDistrictOptions) {
  showMessage("#editMessage", "正在載入報名資料...", "info");

  const { data, error } = await db.rpc("get_registration_by_token", {
    registration_id: registrationId,
    token: editToken,
  });

  if (error || !data) {
    showMessage("#editMessage", "找不到報名資料，請確認修改連結是否正確。", "error");
    $("#editForm").hidden = true;
    return;
  }

  loadedMeeting = data.meeting;
  renderEditMeetingSummary(loadedMeeting);

  const form = $("#editForm");
  const fields = form.elements;
  fields.namedItem("inviter_name").value = data.inviter_name;
  fields.namedItem("hall").value = data.hall;
  renderDistrictOptions(data.district);
  fields.namedItem("meal_required").checked = data.meal_required;
  fields.namedItem("attendee_count").value = data.attendee_count;
  fields.namedItem("meat_meal_count").value = data.meat_meal_count;
  fields.namedItem("vegetarian_meal_count").value = data.vegetarian_meal_count;
  fields.namedItem("guest_names").value = data.guest_names || "";
  fields.namedItem("note").value = data.note || "";

  if (!loadedMeeting?.is_open || isPastDeadline(loadedMeeting)) {
    showMessage("#editMessage", "這場聚會已關閉或超過報名截止時間，不能再修改。", "error");
    $("#saveButton").disabled = true;
    return;
  }

  showMessage("#editMessage", "", "info");
}

function renderEditMeetingSummary(meeting) {
  const card = $("#meetingSummary");
  if (!meeting) return;
  card.innerHTML = `
    <p class="eyebrow">修改報名</p>
    <h2>${meeting.title}</h2>
    <dl class="meeting-meta">
      <div><dt>時間</dt><dd>${formatDateTime(meeting.meeting_date)}</dd></div>
      <div><dt>地點</dt><dd>${meeting.location || "待公布"}</dd></div>
      <div><dt>截止</dt><dd>${formatDateTime(meeting.registration_deadline)}</dd></div>
    </dl>
  `;
}

async function handleUpdate(event) {
  event.preventDefault();
  const payload = collectRegistrationForm(event.currentTarget);
  const validationError = validateRegistrationData(payload);

  if (validationError) {
    showMessage("#editMessage", validationError, "error");
    return;
  }

  if (!loadedMeeting?.is_open || isPastDeadline(loadedMeeting)) {
    showMessage("#editMessage", "這場聚會已關閉或超過報名截止時間，不能再修改。", "error");
    return;
  }

  $("#saveButton").disabled = true;
  $("#saveButton").textContent = "儲存中...";

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
    showMessage("#editMessage", `儲存失敗：${error ? error.message : "報名已關閉、逾期或修改連結不正確。"}`, "error");
    $("#saveButton").disabled = false;
    $("#saveButton").textContent = "儲存修改";
    return;
  }

  showMessage("#editMessage", "報名資料已更新。", "success");
  $("#saveButton").disabled = false;
  $("#saveButton").textContent = "儲存修改";
}
