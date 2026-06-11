# 聚會報名系統

純靜態的聚會報名系統，使用 Supabase 儲存資料，可部署到 GitHub Pages。

## 功能

- 開放聚會報名
- 報名成功後產生修改連結
- 可用修改連結更新原報名資料
- 管理者以帳號密碼登入後查看報名名單
- 可透過初始設定頁建立管理者帳號
- 統計報名人數、葷食數量、素食數量
- 可選擇是否用餐，用餐才填寫葷食與素食數量
- 匯出 CSV
- 手機優先 RWD，適合 LINE 瀏覽器開啟

## 設定

1. 到 Supabase 建立專案。
2. 依序執行 `supabase/schema.sql`、`supabase/policies.sql`、`supabase/seed.sql`。
3. 複製 `js/config.example.js` 為 `js/config.js`。
4. 在 `js/config.js` 填入 Supabase URL 與 anon key。
5. 使用本機靜態伺服器或 GitHub Pages 開啟 `index.html`。

## 本機測試

可使用任一靜態伺服器，例如 VS Code Live Server。

## 注意

- 不要將 Supabase `service_role` key 放到前端。
- 修改連結等同修改憑證，報名成功後請提醒使用者保存。
- 第一版管理者權限使用 Supabase Auth 登入控制。
