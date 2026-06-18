insert into meetings (
  title,
  description,
  meeting_date,
  location,
  registration_deadline,
  is_open
) values (
  '06/14 主日聚會',
  '歡迎弟兄姊妹與受邀朋友一同參加。',
  '2026-06-14 10:00:00+08',
  '請填寫實際聚會地點',
  '2026-06-13 20:00:00+08',
  true
);

insert into location_options (hall, district, is_active)
values
  ('38 會所', '林森區', true),
  ('38 會所', '杭州區', true),
  ('38 會所', '忠孝區', true)
on conflict (hall, district) do update
set is_active = excluded.is_active;
