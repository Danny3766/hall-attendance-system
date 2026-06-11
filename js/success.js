document.addEventListener("DOMContentLoaded", () => {
  const id = getQueryParam("id");
  const token = getQueryParam("token");

  if (!id || !token) {
    showMessage("#successMessage", "缺少修改連結資料，請回到報名頁重新確認。", "error");
    return;
  }

  const editUrl = new URL("edit.html", window.location.href);
  editUrl.searchParams.set("id", id);
  editUrl.searchParams.set("token", token);

  const link = editUrl.toString();
  const input = $("#editLink");
  input.value = link;
  $("#goEdit").href = link;

  $("#copyLink").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(link);
      showMessage("#successMessage", "修改連結已複製，請妥善保存。", "success");
    } catch (_error) {
      input.select();
      document.execCommand("copy");
      showMessage("#successMessage", "修改連結已複製，請妥善保存。", "success");
    }
  });
});
