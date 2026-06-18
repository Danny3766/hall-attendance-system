const db = window.supabaseClient;
let registrations = [];
let meetings = [];
let meetingsPage = 1;
let meetingsPageSize = 5;
let registrationsPage = 1;
let meetingStatusFilter = "all";
let selectedMeetingIds = new Set();
const REGISTRATIONS_PAGE_SIZE = 20;

document.addEventListener("DOMContentLoaded", async () => {
  $("#loginPanel").hidden = true;
  initMeetingDateTimeControls();
  $("#loginForm").addEventListener("submit", handleLogin);
  $("#toggleRegistrationFilters").addEventListener("click", toggleRegistrationFilters);
  $("#toggleMeetingManagement").addEventListener("click", toggleMeetingManagement);
  $("#showMeetingForm").addEventListener("click", showCreateMeetingForm);
  document.querySelectorAll("[data-meeting-status-filter]").forEach((button) => {
    button.addEventListener("click", () => setMeetingStatusFilter(button.dataset.meetingStatusFilter));
  });
  $("#selectPageMeetings").addEventListener("change", handleSelectPageMeetings);
  $("#meetingPageSize").addEventListener("change", handleMeetingPageSizeChange);
  $("#bulkOpenMeetings").addEventListener("click", () => bulkUpdateMeetingOpen(true));
  $("#bulkCloseMeetings").addEventListener("click", () => bulkUpdateMeetingOpen(false));
  $("#clearMeetingSelection").addEventListener("click", clearMeetingSelection);
  $("#bulkDeleteMeetings").addEventListener("click", bulkDeleteMeetings);
  $("#meetingForm").addEventListener("submit", handleCreateMeeting);
  $("#cancelMeetingEdit").addEventListener("click", resetMeetingForm);
  $("#refreshMeetings").addEventListener("click", loadMeetings);
  $("#logoutButton").addEventListener("click", handleLogout);
  $("#meetingFilter").addEventListener("change", () => {
    registrationsPage = 1;
    loadRegistrations();
  });
  $("#exportCsv").addEventListener("click", exportCsv);

  const { data } = await db.auth.getSession();
  if (data.session) {
    const isAdmin = await ensureAdminProfile(data.session.user);
    if (!isAdmin) return;

    showAdmin();
    await loadMeetings();
    await loadRegistrations();
  } else {
    $("#loginPanel").hidden = false;
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

  const { data } = await db.auth.getSession();
  const isAdmin = await ensureAdminProfile(data.session?.user);
  if (!isAdmin) return;

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

async function ensureAdminProfile(user) {
  if (!user?.id) {
    await rejectUnauthorizedAdmin();
    return false;
  }

  const { data, error } = await db
    .from("admin_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) {
    await rejectUnauthorizedAdmin();
    return false;
  }

  return true;
}

async function rejectUnauthorizedAdmin() {
  await db.auth.signOut();
  $("#adminPanel").hidden = true;
  $("#loginPanel").hidden = false;
  showMessage("#adminMessage", "此帳號沒有管理權限。", "error");
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

function toggleRegistrationFilters() {
  const body = $("#registrationFiltersBody");
  const button = $("#toggleRegistrationFilters");
  const isExpanded = body.hidden;
  body.hidden = !isExpanded;
  button.setAttribute("aria-expanded", String(isExpanded));
  button.textContent = isExpanded ? "收合報名資料" : "展開報名資料";
}

async function loadMeetings() {
  const selectedMeetingId = $("#meetingFilter")?.value || "";
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
  selectedMeetingIds = new Set([...selectedMeetingIds].filter((id) => meetings.some((meeting) => meeting.id === id)));
  normalizeMeetingsPage();
  renderMeetingList();
  const filter = $("#meetingFilter");
  filter.innerHTML = "";
  meetings.forEach((meeting) => {
    const option = document.createElement("option");
    option.value = meeting.id;
    option.textContent = `${meeting.title}｜${formatDateTime(meeting.meeting_date)}`;
    filter.appendChild(option);
  });

  if (selectedMeetingId && meetings.some((meeting) => meeting.id === selectedMeetingId)) {
    filter.value = selectedMeetingId;
  } else if (meetings[0]) {
    filter.value = meetings[0].id;
  }
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
    meeting_date: toIsoDateTime(getDateTimeControlValue(form, "meeting_date")),
    location: fields.namedItem("location").value.trim() || null,
    registration_deadline: toIsoDateTime(getDateTimeControlValue(form, "registration_deadline")),
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

function initMeetingDateTimeControls() {
  const form = $("#meetingForm");
  fillTimeSelect(form.elements.namedItem("meeting_date_time"), "10:00");
  fillTimeSelect(form.elements.namedItem("registration_deadline_time"), "20:00");
}

function fillTimeSelect(select, defaultValue) {
  if (!select) return;
  select.innerHTML = "";

  for (let hour = 0; hour < 24; hour += 1) {
    for (const minute of [0, 30]) {
      const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      option.selected = value === defaultValue;
      select.appendChild(option);
    }
  }
}

function getDateTimeControlValue(form, name) {
  const date = form.elements.namedItem(`${name}_date`)?.value || "";
  const time = form.elements.namedItem(`${name}_time`)?.value || "";
  return date && time ? `${date}T${time}` : "";
}

function setDateTimeControlValue(form, name, value) {
  const dateInput = form.elements.namedItem(`${name}_date`);
  const timeSelect = form.elements.namedItem(`${name}_time`);
  const localValue = toLocalDateTimeInputValue(value);

  if (!dateInput || !timeSelect) return;

  if (!localValue) {
    dateInput.value = "";
    timeSelect.value = name === "registration_deadline" ? "20:00" : "10:00";
    return;
  }

  const [date, time] = localValue.split("T");
  dateInput.value = date || "";
  timeSelect.value = time || timeSelect.value;
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
  setDateTimeControlValue(form, "meeting_date", null);
  setDateTimeControlValue(form, "registration_deadline", null);
  $("#meetingFormTitle").textContent = "建立聚會";
  $("#saveMeetingButton").textContent = "建立聚會";
  $("#saveMeetingButton").disabled = false;
  $("#cancelMeetingEdit").hidden = true;
  $("#meetingFormPanel").hidden = true;
  $("#showMeetingForm").hidden = false;

  if (!options.keepMessage) showMessage("#meetingMessage", "", "info");
}

function showCreateMeetingForm() {
  setMeetingManagementExpanded(true);
  resetMeetingForm();
  showMessage("#meetingStatusMessage", "", "info");
  $("#meetingFormPanel").hidden = false;
  $("#showMeetingForm").hidden = true;
  $("#meetingFormTitle").textContent = "建立聚會";
  $("#saveMeetingButton").textContent = "建立聚會";
  $("#cancelMeetingEdit").textContent = "取消建立";
  $("#cancelMeetingEdit").hidden = false;
  $("#meetingForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderMeetingList() {
  const list = $("#meetingCards");
  list.innerHTML = "";
  normalizeMeetingsPage();
  renderMeetingDashboard();
  renderMeetingPagination();
  const visibleMeetings = getFilteredMeetings();

  if (meetings.length === 0) {
    list.innerHTML = '<p class="empty-state">目前尚未建立聚會。</p>';
    return;
  }

  if (visibleMeetings.length === 0) {
    list.innerHTML = `<p class="empty-state">目前沒有${meetingStatusFilter === "open" ? "開放報名" : "關閉報名"}的聚會。</p>`;
    syncPageSelectionCheckbox([]);
    return;
  }

  let pageStart = (meetingsPage - 1) * meetingsPageSize;
  let pageMeetings = visibleMeetings.slice(pageStart, pageStart + meetingsPageSize);
  if (pageMeetings.length === 0 && visibleMeetings.length > 0) {
    meetingsPage = 1;
    pageStart = 0;
    pageMeetings = visibleMeetings.slice(0, MEETINGS_PAGE_SIZE);
    renderMeetingPagination();
  }

  pageMeetings.forEach((meeting) => {
    const card = document.createElement("article");
    card.className = "meeting-admin-card";
    card.innerHTML = `
      <div>
        <label class="meeting-select-row">
          <input class="meeting-select" type="checkbox" value="${meeting.id}" ${selectedMeetingIds.has(meeting.id) ? "checked" : ""}>
          選取聚會
        </label>
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
      <button class="danger-button meeting-delete" type="button" data-id="${meeting.id}">移除</button>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll(".meeting-select").forEach((input) => {
    input.addEventListener("change", () => toggleMeetingSelection(input.value, input.checked));
  });

  list.querySelectorAll(".meeting-toggle").forEach((button) => {
    button.addEventListener("click", () => toggleMeetingOpen(button.dataset.id, button.dataset.open === "true"));
  });

  list.querySelectorAll(".meeting-edit").forEach((button) => {
    button.addEventListener("click", () => startEditMeeting(button.dataset.id));
  });

  list.querySelectorAll(".meeting-delete").forEach((button) => {
    button.addEventListener("click", () => deleteMeeting(button.dataset.id));
  });

  syncPageSelectionCheckbox(pageMeetings);
}

function toggleMeetingManagement() {
  setMeetingManagementExpanded($("#meetingManagementBody").hidden);
}

function renderMeetingDashboard() {
  const openCount = meetings.filter((meeting) => meeting.is_open).length;
  setText("#meetingTotalCount", meetings.length);
  setText("#meetingOpenCount", openCount);
  setText("#meetingClosedCount", meetings.length - openCount);
  setText("#meetingSelectedCount", selectedMeetingIds.size);
  syncMeetingDashboardFilterButtons();
  syncBulkMeetingButtons();
}

function setMeetingStatusFilter(filter) {
  meetingStatusFilter = ["all", "open", "closed"].includes(filter) ? filter : "all";
  meetingsPage = 1;
  renderMeetingList();
}

function syncMeetingDashboardFilterButtons() {
  document.querySelectorAll("[data-meeting-status-filter]").forEach((button) => {
    const isActive = button.dataset.meetingStatusFilter === meetingStatusFilter;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function toggleMeetingSelection(meetingId, isSelected) {
  if (isSelected) {
    selectedMeetingIds.add(meetingId);
  } else {
    selectedMeetingIds.delete(meetingId);
  }
  renderMeetingDashboard();
  syncPageSelectionCheckbox(getCurrentPageMeetings());
}

function handleSelectPageMeetings(event) {
  const isChecked = event.currentTarget.checked;
  getCurrentPageMeetings().forEach((meeting) => {
    if (isChecked) {
      selectedMeetingIds.add(meeting.id);
    } else {
      selectedMeetingIds.delete(meeting.id);
    }
  });
  renderMeetingList();
}

function handleMeetingPageSizeChange(event) {
  const value = Number(event.currentTarget.value);
  meetingsPageSize = [5, 10, 20, 50, 100].includes(value) ? value : 5;
  meetingsPage = 1;
  renderMeetingList();
}

function clearMeetingSelection() {
  selectedMeetingIds.clear();
  renderMeetingList();
}

function getCurrentPageMeetings() {
  const pageStart = (meetingsPage - 1) * meetingsPageSize;
  return getFilteredMeetings().slice(pageStart, pageStart + meetingsPageSize);
}

function getFilteredMeetings() {
  if (meetingStatusFilter === "open") return meetings.filter((meeting) => meeting.is_open);
  if (meetingStatusFilter === "closed") return meetings.filter((meeting) => !meeting.is_open);
  return meetings;
}

function syncPageSelectionCheckbox(pageMeetings) {
  const checkbox = $("#selectPageMeetings");
  if (!checkbox) return;

  const selectableCount = pageMeetings.length;
  const selectedCount = pageMeetings.filter((meeting) => selectedMeetingIds.has(meeting.id)).length;
  checkbox.checked = selectableCount > 0 && selectedCount === selectableCount;
  checkbox.indeterminate = false;
  checkbox.disabled = selectableCount === 0;
}

function syncBulkMeetingButtons() {
  const disabled = selectedMeetingIds.size === 0;
  $("#bulkOpenMeetings").disabled = disabled;
  $("#bulkCloseMeetings").disabled = disabled;
  $("#clearMeetingSelection").disabled = disabled;
  $("#bulkDeleteMeetings").disabled = disabled;
}

async function bulkUpdateMeetingOpen(isOpen) {
  const ids = [...selectedMeetingIds];
  if (ids.length === 0) return;

  showMessage("#meetingStatusMessage", `正在${isOpen ? "開放" : "關閉"} ${ids.length} 個聚會...`, "info");
  const { error } = await db.from("meetings").update({ is_open: isOpen }).in("id", ids);

  if (error) {
    showMessage("#meetingStatusMessage", `批次更新聚會失敗：${error.message}`, "error");
    return;
  }

  selectedMeetingIds.clear();
  await loadMeetings();
  await loadRegistrations();
  showMessage("#meetingStatusMessage", `已${isOpen ? "開放" : "關閉"} ${ids.length} 個聚會。`, "success");
}

async function bulkDeleteMeetings() {
  const ids = [...selectedMeetingIds];
  if (ids.length === 0) return;
  if (!window.confirm(`確定要移除 ${ids.length} 個聚會？相關報名資料也會一併移除。`)) return;

  await deleteMeetings(ids, `已移除 ${ids.length} 個聚會。`);
}

async function deleteMeeting(meetingId) {
  const meeting = meetings.find((item) => item.id === meetingId);
  const label = meeting?.title || "這個聚會";
  if (!window.confirm(`確定要移除「${label}」？相關報名資料也會一併移除。`)) return;

  await deleteMeetings([meetingId], "聚會已移除。");
}

async function deleteMeetings(ids, successMessage) {
  showMessage("#meetingStatusMessage", "正在移除聚會...", "info");

  const { error } = await db.from("meetings").delete().in("id", ids);
  if (error) {
    showMessage("#meetingStatusMessage", `移除聚會失敗：${error.message}`, "error");
    return;
  }

  ids.forEach((id) => selectedMeetingIds.delete(id));
  await loadMeetings();
  await loadRegistrations();
  showMessage("#meetingStatusMessage", successMessage, "success");
}

function setMeetingManagementExpanded(isExpanded) {
  const body = $("#meetingManagementBody");
  const button = $("#toggleMeetingManagement");
  body.hidden = !isExpanded;
  button.setAttribute("aria-expanded", String(isExpanded));
  button.textContent = isExpanded ? "收合聚會管理" : "展開聚會管理";
}

function getMeetingsPageCount() {
  return Math.max(1, Math.ceil(getFilteredMeetings().length / meetingsPageSize));
}

function normalizeMeetingsPage() {
  if (!Number.isFinite(meetingsPage)) meetingsPage = 1;
  meetingsPage = Math.trunc(meetingsPage);
  meetingsPage = Math.min(Math.max(meetingsPage, 1), getMeetingsPageCount());
}

function renderMeetingPagination() {
  const pagination = $("#meetingPagination");
  if (!pagination) return;

  const pageSizeSelect = $("#meetingPageSize");
  if (pageSizeSelect) pageSizeSelect.value = String(meetingsPageSize);

  const pageCount = getMeetingsPageCount();
  if (getFilteredMeetings().length <= meetingsPageSize) {
    pagination.innerHTML = "";
    pagination.hidden = true;
    return;
  }

  pagination.hidden = false;
  pagination.innerHTML = `
    <button class="ghost-button" type="button" data-page="prev" ${meetingsPage === 1 ? "disabled" : ""}>上一頁</button>
    <span>第 ${meetingsPage} / ${pageCount} 頁，每頁 ${meetingsPageSize} 筆</span>
    <button class="ghost-button" type="button" data-page="next" ${meetingsPage === pageCount ? "disabled" : ""}>下一頁</button>
  `;

  pagination.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      meetingsPage += button.dataset.page === "next" ? 1 : -1;
      meetingsPage = Math.min(Math.max(meetingsPage, 1), pageCount);
      renderMeetingList();
    });
  });
}

function startEditMeeting(meetingId) {
  setMeetingManagementExpanded(true);
  const meeting = meetings.find((item) => item.id === meetingId);
  if (!meeting) return;

  const form = $("#meetingForm");
  form.elements.namedItem("meeting_id").value = meeting.id;
  form.elements.namedItem("title").value = meeting.title || "";
  setDateTimeControlValue(form, "meeting_date", meeting.meeting_date);
  setDateTimeControlValue(form, "registration_deadline", meeting.registration_deadline);
  form.elements.namedItem("location").value = meeting.location || "";
  form.elements.namedItem("description").value = meeting.description || "";
  form.elements.namedItem("is_open").checked = Boolean(meeting.is_open);

  $("#meetingFormTitle").textContent = "編輯聚會";
  $("#saveMeetingButton").textContent = "儲存修改";
  $("#cancelMeetingEdit").textContent = "取消編輯";
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

  if (!meetingId) {
    registrations = [];
    registrationsPage = 1;
    renderStats();
    renderRegistrations();
    showMessage("#adminMessage", "", "info");
    return;
  }

  let query = db
    .from("registrations")
    .select("*, meetings(title,meeting_date)")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) {
    showMessage("#adminMessage", `載入報名名單失敗：${error.message}`, "error");
    return;
  }

  registrations = data || [];
  normalizeRegistrationsPage();
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
  renderRegistrationPagination();

  if (registrations.length === 0) {
    mobileList.innerHTML = '<p class="empty-state">目前沒有報名資料。</p>';
    return;
  }

  getCurrentPageRegistrations().forEach((item) => {
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

function getCurrentPageRegistrations() {
  const pageStart = (registrationsPage - 1) * REGISTRATIONS_PAGE_SIZE;
  return registrations.slice(pageStart, pageStart + REGISTRATIONS_PAGE_SIZE);
}

function getRegistrationsPageCount() {
  return Math.max(1, Math.ceil(registrations.length / REGISTRATIONS_PAGE_SIZE));
}

function normalizeRegistrationsPage() {
  if (!Number.isFinite(registrationsPage)) registrationsPage = 1;
  registrationsPage = Math.trunc(registrationsPage);
  registrationsPage = Math.min(Math.max(registrationsPage, 1), getRegistrationsPageCount());
}

function renderRegistrationPagination() {
  const pagination = $("#registrationPagination");
  if (!pagination) return;

  normalizeRegistrationsPage();
  const pageCount = getRegistrationsPageCount();
  if (registrations.length <= REGISTRATIONS_PAGE_SIZE) {
    pagination.innerHTML = "";
    pagination.hidden = true;
    return;
  }

  pagination.hidden = false;
  pagination.innerHTML = `
    <button class="ghost-button" type="button" data-page="prev" ${registrationsPage === 1 ? "disabled" : ""}>上一頁</button>
    <span>第 ${registrationsPage} / ${pageCount} 頁，每頁 ${REGISTRATIONS_PAGE_SIZE} 筆</span>
    <button class="ghost-button" type="button" data-page="next" ${registrationsPage === pageCount ? "disabled" : ""}>下一頁</button>
  `;

  pagination.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      registrationsPage += button.dataset.page === "next" ? 1 : -1;
      normalizeRegistrationsPage();
      renderRegistrations();
    });
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
  link.download = `報名-${getSelectedMeetingFilenamePart()}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function getSelectedMeetingFilenamePart() {
  const meetingId = $("#meetingFilter").value;
  const meeting = meetings.find((item) => item.id === meetingId);
  return sanitizeFilenamePart(meeting?.title || "未選取聚會");
}

function sanitizeFilenamePart(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80) || "未命名聚會";
}
