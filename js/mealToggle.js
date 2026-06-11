function setupMealToggle(form) {
  if (form.__mealToggleReady) return;

  const fields = form.elements;
  const checkbox = fields.namedItem("meal_required");
  const mealFields = form.querySelector("#mealFields") || document.querySelector("#mealFields");
  const meatInput = fields.namedItem("meat_meal_count");
  const vegetarianInput = fields.namedItem("vegetarian_meal_count");

  if (!checkbox || !mealFields || !meatInput || !vegetarianInput) return;

  function syncMealFields() {
    const enabled = checkbox.checked;
    mealFields.hidden = !enabled;
    meatInput.required = enabled;
    vegetarianInput.required = enabled;

    if (!enabled) {
      meatInput.value = 0;
      vegetarianInput.value = 0;
    }
  }

  checkbox.addEventListener("change", syncMealFields);
  syncMealFields();
  form.__mealToggleReady = true;
}

window.setupMealToggle = setupMealToggle;

document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("#registrationForm, #editForm");
  if (form) setupMealToggle(form);
});
