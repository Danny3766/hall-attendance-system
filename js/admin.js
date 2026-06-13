const db = window.supabaseClient;
let registrations = [];
let meetings = [];

document.addEventListener("DOMContentLoaded", async () => {
  $("#loginForm").addEventListener("submit", handleLogin);
  $("#showMeetingForm").addEventListener("click", showCreateMeetingForm);
  $("#meetingForm").addEventListener("submit", handleCreateMeeting);
  $("#cancelMeetingEdit").addEventListener("click", resetMeetingForm);
  $("#refreshMeetings").addEventListener("click", loadMeetings);
  $("#logoutButton").addEventListener("click", handleLogout);
  $("#meetingFilter").addEventListener("change", loadRegistrations);
  $("#exportCsv").addEventListener("click", exportCsv);

  const { data } = await db.auth.getSession();
  if (data.session) {
    showAdmin();
    await loadMeetings();
    await loadRegistrations();
  }
});

async function handleLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const username = form.elements.namedItem("username").value.trim();
  const password = form.elements.namedItem("password").value;
  showMessage("#adminMessage", "登入中...", "info");

  const { error } = await signInWithUsername(username, password);

  if (error) {
    showMessage("#adminMessage", `登入失敗：${getSafeLoginErrorMessage(error.message)}`, "error");
    return;
  }

  showAdmin();
  await loadMeetings();
  await loadRegistrations();
  showMessage("#adminMessage", "", "info");
}

async function signInWithUsername(username, password) {
  let lastError = null;

  for (const email of buildAdminLoginEmails(username)) {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (!error) return { error: null };
    lastError = error;
  }

  return { error: lastError };
}

function buildAdminEmail(username) {
  const domain = window.APP_CONFIG.ADMIN_EMAIL_DOMAIN || "hall-attendance.example.com";
  return `${username}@${domain}`.toLowerCase();
}

function buildAdminLoginEmails(username) {
  const domains = [
    window.APP_CONFIG.ADMIN_EMAIL_DOMAIN || "hall-attendance.example.com",
    ...(window.APP_CONFIG.ADMIN_LEGACY_EMAIL_DOMAINS || []),
  ];

  return [...new Set(domains)]
    .filter(Boolean)
    .map((domain) => `${username}@${domain}`.toLowerCase());
}

function getSafeLoginErrorMessage(message) {
  const normalizedMessage = String(message || "").toLowerCase();

  if (normalizedMessage.includes("invalid login") || normalizedMessage.includes("invalid credentials")) {
    return "帳號或密碼不正確。";
  }

  if (normalizedMessage.includes("email")) return "帳號或密碼不正確。";
  return "目前無法登入，請稍後再試。";
}

async function handleLogout() {
  await db.auth.signOut();
  $("#adminPanel").hidden = true;
  $("#loginPanel").hidden = false;
}

function showAdmin() {
  $("#loginPanel").hidden = true;
  $("#adminPanel").hidden = false;
}

async function loadMeetings() {
  const { data, error } = await db
    .from("meetings")
    .select("id,title,description,meeting_date,location,registration_deadline,is_open")
    .order("meeting_date", { ascending: false });

  if (error) {
    showMessage("#adminMessage", `載入聚會失敗：${error.message}`, "error");
    return;
  }

  meetings = data || [];
  meetings.sort((a, b) => Number(b.is_open) - Number(a.is_open) || new Date(b.meeting_date) - new Date(a.meeting_date));
  renderMeetingList();
  const filter = $("#meetingFilter");
  filter.innerHTML = '<option value="">全部聚會</option>';
  meetings.forEach((meeting) => {
    const option = document.createElement("option");
    option.value = meeting.id;
    option.textContent = `${meeting.title}｜${formatDateTime(meeting.meeting_date)}`;
    filter.appendChild(option);
  });
}

async function handleCreateMeeting(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = collectMeetingForm(form);
  const meetingId = form.elements.namedItem("meeting_id").value;
  const validationError = validateMeetingData(payload);

  if (validationError) {
    showMessage("#meetingMessage", validationError, "error");
    return;
  }

  setMeetingSaving(true, meetingId ? "儲存中..." : "建立中...");
  showMessage("#meetingMessage", meetingId ? "正在儲存聚會..." : "正在建立聚會...", "info");

  const { error } = meetingId
    ? await db.from("meetings").update(payload).eq("id", meetingId)
    : await db.from("meetings").insert(payload);

  if (error) {
    showMessage("#meetingMessage", `${meetingId ? "儲存" : "建立"}聚會失敗：${error.message}`, "error");
    setMeetingSaving(false);
    return;
  }

  resetMeetingForm();
  showMessage("#meetingStatusMessage", meetingId ? "聚會資訊已更新。" : "聚會已建立，報名頁會顯示開放中的聚會。", "success");
  await loadMeetings();
}

function collectMeetingForm(form) {
  const fields = form.elements;
  return {
    title: fields.namedItem("title").value.trim(),
    description: fields.namedItem("description").value.trim() || null,
    meeting_date: toIsoDateTime(fields.namedItem("meeting_date").value),
    location: fields.namedItem("location").value.trim() || null,
    registration_deadline: toIsoDateTime(fields.namedItem("registration_deadline").value),
    is_open: fields.namedItem("is_open").checked,
  };
}

function validateMeetingData(data) {
  if (!data.title) return "請填寫聚會名稱。";
  if (!data.meeting_date) return "請選擇聚會時間。";
  if (data.registration_deadline && new Date(data.registration_deadline) >= new Date(data.meeting_date)) {
    return "報名截止時間需早於聚會時間。";
  }
  return "";
}

function toIsoDateTime(value) {
  return value ? new Date(`${value}${value.length === 16 ? ":00" : ""}${TAIWAN_UTC_OFFSET}`).toISOString() : null;
}

function setMeetingSaving(isSaving, text) {
  const button = $("#saveMeetingButton");
  button.disabled = isSaving;
  button.textContent = isSaving ? text : (isEditingMeeting() ? "儲存修改" : "建立聚會");
}

function isEditingMeeting() {
  return Boolean($("#meetingForm").elements.namedItem("meeting_id").value);
}

function resetMeetingForm(options = {}) {
  const form = $("#meetingForm");
  form.reset();
  form.elements.namedItem("meeting_id").value = "";
  form.elements.namedItem("is_open").checked = true;
  $("#meetingFormTitle").textContent = "建立聚會";
  $("#saveMeetingButton").textContent = "建立聚會";
  $("#saveMeetingButton").disabled = false;
  $("#cancelMeetingEdit").hidden = true;
  $("#meetingFormPanel").hidden = true;
  $("#showMeetingForm").hidden = false;

  if (!options.keepMessage) showMessage("#meetingMessage", "", "info");
}

function showCreateMeetingForm() {
  resetMeetingForm();
  showMessage("#meetingStatusMessage", "", "info");
  $("#meetingFormPanel").hidden = false;
  $("#showMeetingForm").hidden = true;
  $("#meetingFormTitle").textContent = "建立聚會";
  $("#saveMeetingButton").textContent = "建立聚會";
  $("#meetingForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderMeetingList() {
  const list = $("#meetingCards");
  list.innerHTML = "";

  if (meetings.length === 0) {
    list.innerHTML = '<p class="empty-state">目前尚未建立聚會。</p>';
    return;
  }

  meetings.forEach((meeting) => {
    const card = document.createElement("article");
    card.className = "meeting-admin-card";
    card.innerHTML = `
      <div>
        <span class="status-pill ${meeting.is_open ? "open" : "closed"}">${meeting.is_open ? "開放中" : "已關閉"}</span>
        <h3>${meeting.title}</h3>
        <p>${meeting.description || "無說明"}</p>
        <dl class="meeting-admin-meta">
          <div><dt>時間</dt><dd>${formatDateTime(meeting.meeting_date)}</dd></div>
          <div><dt>地點</dt><dd>${meeting.location || "未設定"}</dd></div>
          <div><dt>截止</dt><dd>${formatDateTime(meeting.registration_deadline)}</dd></div>
        </dl>
      </div>
      <button class="secondary-button meeting-toggle" type="button" data-id="${meeting.id}" data-open="${meeting.is_open ? "false" : "true"}">
        ${meeting.is_open ? "關閉報名" : "開放報名"}
      </button>
      <button class="ghost-button meeting-edit" type="button" data-id="${meeting.id}">編輯</button>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll(".meeting-toggle").forEach((button) => {
    button.addEventListener("click", () => toggleMeetingOpen(button.dataset.id, button.dataset.open === "true"));
  });

  list.querySelectorAll(".meeting-edit").forEach((button) => {
    button.addEventListener("click", () => startEditMeeting(button.dataset.id));
  });
}

function startEditMeeting(meetingId) {
  const meeting = meetings.find((item) => item.id === meetingId);
  if (!meeting) return;

  const form = $("#meetingForm");
  form.elements.namedItem("meeting_id").value = meeting.id;
  form.elements.namedItem("title").value = meeting.title || "";
  form.elements.namedItem("meeting_date").value = toLocalDateTimeInputValue(meeting.meeting_date);
  form.elements.namedItem("registration_deadline").value = toLocalDateTimeInputValue(meeting.registration_deadline);
  form.elements.namedItem("location").value = meeting.location || "";
  form.elements.namedItem("description").value = meeting.description || "";
  form.elements.namedItem("is_open").checked = Boolean(meeting.is_open);

  $("#meetingFormTitle").textContent = "編輯聚會";
  $("#saveMeetingButton").textContent = "儲存修改";
  $("#cancelMeetingEdit").hidden = false;
  $("#meetingFormPanel").hidden = false;
  $("#showMeetingForm").hidden = true;
  showMessage("#meetingStatusMessage", "", "info");
  showMessage("#meetingMessage", "正在編輯既有聚會，儲存後會更新報名頁顯示。", "info");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function toLocalDateTimeInputValue(value) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIWAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const getPart = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${getPart("year")}-${getPart("month")}-${getPart("day")}T${getPart("hour")}:${getPart("minute")}`;
}

async function toggleMeetingOpen(meetingId, isOpen) {
  showMessage("#meetingMessage", "正在更新聚會狀態...", "info");

  const { error } = await db
    .from("meetings")
    .update({ is_open: isOpen })
    .eq("id", meetingId);

  if (error) {
    showMessage("#meetingMessage", `更新聚會狀態失敗：${error.message}`, "error");
    return;
  }

  showMessage("#meetingStatusMessage", isOpen ? "聚會已開放報名。" : "聚會已關閉報名。", "success");
  await loadMeetings();
  await loadRegistrations();
}

async function loadRegistrations() {
  showMessage("#adminMessage", "正在載入報名名單...", "info");
  const meetingId = $("#meetingFilter").value;
  let query = db
    .from("registrations")
    .select("*, meetings(title,meeting_date)")
    .order("created_at", { ascending: false });

  if (meetingId) query = query.eq("meeting_id", meetingId);

  const { data, error } = await query;
  if (error) {
    showMessage("#adminMessage", `載入報名名單失敗：${error.message}`, "error");
    return;
  }

  registrations = data || [];
  renderStats();
  renderRegistrations();
  showMessage("#adminMessage", "", "info");
}

function renderStats() {
  const totalPeople = registrations.reduce((sum, item) => sum + item.attendee_count, 0);
  const totalMeat = registrations.reduce((sum, item) => sum + item.meat_meal_count, 0);
  const totalVeg = registrations.reduce((sum, item) => sum + item.vegetarian_meal_count, 0);

  setText("#totalRows", registrations.length);
  setText("#totalPeople", totalPeople);
  setText("#totalMeat", totalMeat);
  setText("#totalVeg", totalVeg);
}

function renderRegistrations() {
  const desktopBody = $("#registrationTableBody");
  const mobileList = $("#registrationCards");
  desktopBody.innerHTML = "";
  mobileList.innerHTML = "";

  if (registrations.length === 0) {
    mobileList.innerHTML = '<p class="empty-state">目前沒有報名資料。</p>';
    return;
  }

  registrations.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.meetings?.title || ""}</td>
      <td>${item.inviter_name}</td>
      <td>${item.hall}</td>
      <td>${item.district}</td>
      <td>${item.meal_required ? "是" : "否"}</td>
      <td>${item.attendee_count}</td>
      <td>${item.meat_meal_count}</td>
      <td>${item.vegetarian_meal_count}</td>
      <td>${item.guest_names || ""}</td>
      <td>${item.note || ""}</td>
      <td>${formatDateTime(item.updated_at)}</td>
    `;
    desktopBody.appendChild(row);

    const card = document.createElement("article");
    card.className = "registration-card";
    card.innerHTML = `
      <h3>${item.inviter_name}</h3>
      <p>${item.meetings?.title || ""}</p>
      <div class="card-grid">
        <span>會所：${item.hall}</span>
        <span>區：${item.district}</span>
        <span>用餐：${item.meal_required ? "是" : "否"}</span>
        <span>報名：${item.attendee_count}</span>
        <span>葷食：${item.meat_meal_count}</span>
        <span>素食：${item.vegetarian_meal_count}</span>
      </div>
      <p>受邀人：${item.guest_names || "未填"}</p>
      <p>備註：${item.note || "無"}</p>
      <small>更新：${formatDateTime(item.updated_at)}</small>
    `;
    mobileList.appendChild(card);
  });
}

function exportCsv() {
  if (registrations.length === 0) return;
  const headers = ["聚會名稱", "邀請人", "會所", "區", "是否用餐", "報名人數", "葷食數量", "素食數量", "受邀人姓名", "備註", "建立時間", "更新時間"];
  const rows = registrations.map((item) => [
    item.meetings?.title || "",
    item.inviter_name,
    item.hall,
    item.district,
    item.meal_required ? "是" : "否",
    item.attendee_count,
    item.meat_meal_count,
    item.vegetarian_meal_count,
    item.guest_names || "",
    item.note || "",
    formatDateTime(item.created_at),
    formatDateTime(item.updated_at),
  ]);

  const csv = "\ufeff" + [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `registrations-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
