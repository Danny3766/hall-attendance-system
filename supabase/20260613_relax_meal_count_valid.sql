alter table registrations
drop constraint if exists meal_count_valid;

alter table registrations
add constraint meal_count_valid check (
  (
    meal_required = true
    and meat_meal_count + vegetarian_meal_count between 1 and attendee_count
  )
  or (
    meal_required = false
    and meat_meal_count = 0
    and vegetarian_meal_count = 0
  )
);
