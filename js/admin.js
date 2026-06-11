const supabase = window.supabaseClient;
let registrations = [];
let meetings = [];

document.addEventListener("DOMContentLoaded", async () => {
  $("#loginForm").addEventListener("submit", handleLogin);
  $("#logoutButton").addEventListener("click", handleLogout);
  $("#meetingFilter").addEventListener("change", loadRegistrations);
  $("#exportCsv").addEventListener("click", exportCsv);

  const { data } = await supabase.auth.getSession();
  if (data.session) {
    showAdmin();
    await loadMeetings();
    await loadRegistrations();
  }
});

async function handleLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  showMessage("#adminMessage", "登入中...", "info");

  const { error } = await supabase.auth.signInWithPassword({
    email: form.email.value.trim(),
    password: form.password.value,
  });

  if (error) {
    showMessage("#adminMessage", `登入失敗：${error.message}`, "error");
    return;
  }

  showAdmin();
  await loadMeetings();
  await loadRegistrations();
  showMessage("#adminMessage", "", "info");
}

async function handleLogout() {
  await supabase.auth.signOut();
  $("#adminPanel").hidden = true;
  $("#loginPanel").hidden = false;
}

function showAdmin() {
  $("#loginPanel").hidden = true;
  $("#adminPanel").hidden = false;
}

async function loadMeetings() {
  const { data, error } = await supabase
    .from("meetings")
    .select("id,title,meeting_date")
    .order("meeting_date", { ascending: false });

  if (error) {
    showMessage("#adminMessage", `載入聚會失敗：${error.message}`, "error");
    return;
  }

  meetings = data || [];
  const filter = $("#meetingFilter");
  filter.innerHTML = '<option value="">全部聚會</option>';
  meetings.forEach((meeting) => {
    const option = document.createElement("option");
    option.value = meeting.id;
    option.textContent = `${meeting.title}｜${formatDateTime(meeting.meeting_date)}`;
    filter.appendChild(option);
  });
}

async function loadRegistrations() {
  showMessage("#adminMessage", "正在載入報名名單...", "info");
  const meetingId = $("#meetingFilter").value;
  let query = supabase
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
