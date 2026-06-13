const db = window.supabaseClient;
let registrationId = null;
let editToken = null;

document.addEventListener("DOMContentLoaded", async () => {
  registrationId = getQueryParam("id");
  editToken = getQueryParam("token");

  $("#confirmBackHome").addEventListener("click", () => {
    window.location.replace("index.html");
  });

  $("#editRegistration").addEventListener("click", () => {
    const target = new URL("edit.html", window.location.href);
    target.searchParams.set("id", registrationId);
    target.searchParams.set("token", editToken);
    window.location.href = target.toString();
  });

  if (!registrationId || !editToken) {
    showUnavailableState("目前沒有可確認的報名紀錄。請回到報名頁完成報名，或使用查詢功能找回既有報名。");
    showMessage("#successMessage", "尚未取得報名資料。若要修改資料，請回到報名頁查詢既有報名。", "info");
    return;
  }

  await loadRegistrationForConfirmation();
});

async function loadRegistrationForConfirmation() {
  showMessage("#successMessage", "正在載入報名資料...", "info");

  const { data, error } = await db.rpc("get_registration_by_token", {
    registration_id: registrationId,
    token: editToken,
  });

  if (error || !data) {
    showUnavailableState("目前沒有可確認的報名紀錄。請回到報名頁完成報名，或使用查詢功能找回既有報名。");
    showMessage("#successMessage", "找不到報名資料，請回到報名頁重新查詢。", "error");
    return;
  }

  renderConfirmMeetingSummary(data.meeting);
  renderRegistrationDetails(data);
  $("#registrationConfirmPanel").hidden = false;
  showMessage("#successMessage", "", "info");
}

function showUnavailableState(description) {
  $("#successTitle").hidden = true;
  setText("#successDescription", description);
  $("#registrationConfirmPanel").hidden = true;
}

function renderConfirmMeetingSummary(meeting) {
  const card = $("#confirmMeetingSummary");
  if (!meeting) return;

  card.innerHTML = `
    <p class="eyebrow">報名聚會</p>
    <h2>${escapeHtml(meeting.title)}</h2>
    <dl class="meeting-meta">
      <div><dt>時間</dt><dd>${formatDateTime(meeting.meeting_date)}</dd></div>
      <div><dt>地點</dt><dd>${escapeHtml(meeting.location || "待公布")}</dd></div>
      <div><dt>截止</dt><dd>${formatDateTime(meeting.registration_deadline)}</dd></div>
    </dl>
  `;
}

function renderRegistrationDetails(data) {
  setText("#confirmInviterName", data.inviter_name);
  setText("#confirmHall", data.hall);
  setText("#confirmDistrict", data.district);
  setText("#confirmAttendeeCount", `${data.attendee_count} 人`);
  setText("#confirmMealRequired", data.meal_required ? "需要用餐" : "不需要用餐");
  setText("#confirmMealCounts", `葷食 ${data.meat_meal_count || 0} 份 / 素食 ${data.vegetarian_meal_count || 0} 份`);
  setText("#confirmGuestNames", data.guest_names || "無");
  setText("#confirmNote", data.note || "無");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
