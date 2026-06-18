const db = window.supabaseClient;

document.addEventListener("DOMContentLoaded", () => {
  const form = $("#adminRegisterForm");

  if (!window.APP_CONFIG.ADMIN_REGISTRATION_ENABLED) {
    showMessage("#registerMessage", "管理者註冊目前未開放。", "error");
    $("#registerButton").disabled = true;
    return;
  }

  form.addEventListener("submit", handleAdminRegister);
});

async function handleAdminRegister(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const username = form.elements.namedItem("username").value.trim();
  const password = form.elements.namedItem("password").value;
  const confirmPassword = form.elements.namedItem("confirm_password").value;

  if (!username) {
    showMessage("#registerMessage", "請輸入帳號。", "error");
    return;
  }

  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
    showMessage("#registerMessage", "帳號只能使用英文字母、數字、底線或連字號，長度需為 3 到 32 字。", "error");
    return;
  }

  if (password !== confirmPassword) {
    showMessage("#registerMessage", "兩次輸入的密碼不一致。", "error");
    return;
  }

  $("#registerButton").disabled = true;
  $("#registerButton").textContent = "建立中...";
  showMessage("#registerMessage", "正在建立管理者帳號...", "info");

  const normalizedUsername = username.toLowerCase();
  const { data: existingProfile, error: profileCheckError } = await db
    .from("admin_profiles")
    .select("username")
    .eq("username", normalizedUsername)
    .maybeSingle();

  if (profileCheckError) {
    showMessage("#registerMessage", `檢查帳號失敗：${profileCheckError.message}`, "error");
    resetRegisterButton();
    return;
  }

  if (existingProfile) {
    showMessage("#registerMessage", "此帳號已註冊，請改用其他帳號。", "error");
    resetRegisterButton();
    return;
  }

  const { data, error } = await db.auth.signUp({
    email: buildAdminEmail(normalizedUsername),
    password,
  });

  if (error) {
    const message = isAccountExistsError(error.message)
      ? "此帳號已註冊，請改用其他帳號。"
      : `建立失敗：${getSafeAuthErrorMessage(error.message)}`;
    showMessage("#registerMessage", message, "error");
    resetRegisterButton();
    return;
  }

  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    showMessage("#registerMessage", "此帳號已註冊，請改用其他帳號。", "error");
    resetRegisterButton();
    return;
  }

  const userId = data.user?.id;
  if (!userId) {
    showMessage("#registerMessage", "帳號已送出，但無法建立管理者資料。請確認 Supabase Auth 是否關閉 email confirmation。", "error");
    resetRegisterButton();
    return;
  }

  const { error: insertProfileError } = await db.rpc("create_admin_profile", {
    new_user_id: userId,
    new_username: normalizedUsername,
  });

  if (insertProfileError) {
    const message = insertProfileError.code === "23505" || isAccountExistsError(insertProfileError.message)
      ? "此帳號已註冊，請改用其他帳號。"
      : `建立管理者資料失敗：${getSafeAuthErrorMessage(insertProfileError.message)}`;
    showMessage("#registerMessage", message, "error");
    resetRegisterButton();
    return;
  }

  showMessage("#registerMessage", "管理者帳號已建立。請關閉 ADMIN_REGISTRATION_ENABLED 後，再前往管理登入。", "success");
  $("#registerButton").textContent = "已建立";
}

function resetRegisterButton() {
  $("#registerButton").disabled = false;
  $("#registerButton").textContent = "建立管理者";
}

function isAccountExistsError(message) {
  const normalizedMessage = String(message || "").toLowerCase();
  return normalizedMessage.includes("already")
    || normalizedMessage.includes("registered")
    || normalizedMessage.includes("duplicate")
    || normalizedMessage.includes("unique")
    || normalizedMessage.includes("23505");
}

function getSafeAuthErrorMessage(message) {
  const normalizedMessage = String(message || "").toLowerCase();

  if (normalizedMessage.includes("invalid email") || (normalizedMessage.includes("email") && normalizedMessage.includes("invalid"))) {
    return "帳號格式不正確。";
  }
  if (normalizedMessage.includes("rate limit") || normalizedMessage.includes("email rate") || normalizedMessage.includes("over_email_send_rate_limit")) {
    return "系統註冊信件暫時受限，請稍後再試，或請管理者關閉 Email confirmation 後再建立帳號。";
  }
  if (normalizedMessage.includes("password")) return "密碼不符合系統要求。";
  if (normalizedMessage.includes("signup") || normalizedMessage.includes("signups")) return "目前無法建立帳號，請確認註冊設定是否開啟。";

  return "請稍後再試，或聯絡系統管理者。";
}

function buildAdminEmail(username) {
  const domain = window.APP_CONFIG.ADMIN_EMAIL_DOMAIN || "hall-attendance.example.com";
  return `${username}@${domain}`.toLowerCase();
}
