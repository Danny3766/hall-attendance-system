const db = window.supabaseClient;
let selectedMeeting = null;
let openMeetings = [];

document.addEventListener("DOMContentLoaded", async () => {
  const form = $("#registrationForm");
  await loadOpenMeetings();
  form.addEventListener("submit", handleSubmit);
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

  const meetingPicker = openMeetings.length > 1
    ? `
      <label class="meeting-picker">
        選擇開放報名的聚會
        <select id="meetingPicker">
          ${openMeetings.map((item) => `
            <option value="${item.id}" ${item.id === meeting.id ? "selected" : ""}>
              ${item.title}｜${formatDateTime(item.meeting_date)}
            </option>
          `).join("")}
        </select>
      </label>
    `
    : "";

  card.innerHTML = `
    <p class="eyebrow">目前開放報名</p>
    <h2>${meeting.title}</h2>
    <p>${meeting.description || "歡迎弟兄姊妹一同有分聚集。"}</p>
    <dl class="meeting-meta">
      <div><dt>時間</dt><dd>${formatDateTime(meeting.meeting_date)}</dd></div>
      <div><dt>地點</dt><dd>${meeting.location || "待公布"}</dd></div>
      <div><dt>截止</dt><dd>${formatDateTime(meeting.registration_deadline)}</dd></div>
    </dl>
    ${meetingPicker}
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
  const payload = collectRegistrationForm(form);
  payload.meeting_id = form.elements.namedItem("meeting_id").value;
  payload.edit_token = crypto.randomUUID();

  const validationError = validateRegistrationData(payload);
  if (!payload.meeting_id) showMessage("#formMessage", "請選擇聚會。", "error");
  if (!payload.meeting_id) return;
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

  window.location.href = `success.html?id=${encodeURIComponent(data.id)}&token=${encodeURIComponent(data.edit_token)}`;
}
