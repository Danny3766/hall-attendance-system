const LOCATION_OPTIONS = {
  "38 會所": ["林森區", "杭州區", "忠孝區"],
};

function setupLocationOptions(form) {
  if (form.__renderDistrictOptions) return form.__renderDistrictOptions;

  const hallSelect = form.elements.namedItem("hall");
  const districtSelect = form.elements.namedItem("district");

  if (!hallSelect || !districtSelect) return null;

  function renderDistrictOptions(selectedDistrict = "") {
    const districts = LOCATION_OPTIONS[hallSelect.value.trim()] || [];
    districtSelect.innerHTML = '<option value="">請選擇區</option>';
    districtSelect.disabled = districts.length === 0;

    districts.forEach((district) => {
      const option = document.createElement("option");
      option.value = district;
      option.textContent = district;
      option.selected = district === selectedDistrict;
      districtSelect.appendChild(option);
    });
  }

  hallSelect.addEventListener("change", () => renderDistrictOptions(""));
  renderDistrictOptions(districtSelect.value);

  form.__renderDistrictOptions = renderDistrictOptions;
  return renderDistrictOptions;
}

window.setupLocationOptions = setupLocationOptions;

document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("#registrationForm, #editForm");
  if (form) setupLocationOptions(form);
});
