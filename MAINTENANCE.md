# 系統維護

## Supabase 定期健康檢查

GitHub Actions 會每三天執行一次 Supabase 健康檢查，以降低 Free 專案因長時間未使用而暫停的機率。

首次啟用時：

1. 在 Supabase SQL Editor 執行 `supabase/20260623_add_health_check.sql`。
2. 確認部署所需的 GitHub Actions secrets 已設定。
3. 推送變更後，在 GitHub Actions 手動執行 `Supabase Health Check` 並確認成功。

此排程不提供 uptime 保證。公開 repository 長期沒有活動時，GitHub 也可能停用 scheduled workflow，應定期確認最近一次執行結果。
