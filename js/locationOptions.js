const FALLBACK_LOCATION_OPTIONS = {
  "38 會所": ["林森區", "杭州區", "忠孝區"],
};

let locationOptionsCache = null;
let locationOptionsPromise = null;

async function getLocationOptions() {
  if (locationOptionsCache) return locationOptionsCache;
  if (locationOptionsPromise) return locationOptionsPromise;

  locationOptionsPromise = loadLocationOptions().then((options) => {
    locationOptionsCache = Object.keys(options).length > 0 ? options : FALLBACK_LOCATION_OPTIONS;
    return locationOptionsCache;
  });

  return locationOptionsPromise;
}

async function loadLocationOptions() {
  const db = window.supabaseClient;
  if (!db) return FALLBACK_LOCATION_OPTIONS;

  const { data, error } = await db
    .from("location_options")
    .select("hall,district")
    .eq("is_active", true)
    .order("hall", { ascending: true })
    .order("district", { ascending: true });

  if (error) {
    console.warn("Unable to load location options from Supabase.", error);
    return FALLBACK_LOCATION_OPTIONS;
  }

  return (data || []).reduce((options, item) => {
    const hall = String(item.hall || "").trim();
    const district = String(item.district || "").trim();
    if (!hall || !district) return options;
    if (!options[hall]) options[hall] = [];
    if (!options[hall].includes(district)) options[hall].push(district);
    return options;
  }, {});
}

function renderHallOptions(hallSelect, options, selectedHall = "") {
  const currentHall = selectedHall || hallSelect.value;
  hallSelect.innerHTML = '<option value="">請選擇會所</option>';

  Object.keys(options).forEach((hall) => {
    const option = document.createElement("option");
    option.value = hall;
    option.textContent = hall;
    option.selected = hall === currentHall;
    hallSelect.appendChild(option);
  });
}

function setupLocationOptions(form) {
  if (form.__renderDistrictOptions) return form.__renderDistrictOptions;

  const hallSelect = form.elements.namedItem("hall");
  const districtSelect = form.elements.namedItem("district");
  let locationOptions = locationOptionsCache || FALLBACK_LOCATION_OPTIONS;

  if (!hallSelect || !districtSelect) return null;

  function renderDistrictOptions(selectedDistrict = "") {
    const currentDistrict = selectedDistrict || districtSelect.value;
    const districts = locationOptions[hallSelect.value.trim()] || [];
    districtSelect.innerHTML = '<option value="">請選擇區</option>';
    districtSelect.disabled = districts.length === 0;

    districts.forEach((district) => {
      const option = document.createElement("option");
      option.value = district;
      option.textContent = district;
      option.selected = district === currentDistrict;
      districtSelect.appendChild(option);
    });
  }

  hallSelect.addEventListener("change", () => renderDistrictOptions(""));
  renderHallOptions(hallSelect, locationOptions, hallSelect.value);
  renderDistrictOptions(districtSelect.value);

  getLocationOptions().then((options) => {
    locationOptions = options;
    renderHallOptions(hallSelect, options, hallSelect.value);
    renderDistrictOptions(districtSelect.value);
  });

  form.__renderDistrictOptions = renderDistrictOptions;
  return renderDistrictOptions;
}

window.setupLocationOptions = setupLocationOptions;
window.getLocationOptions = getLocationOptions;

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("#registrationForm, #lookupForm, #editForm").forEach((form) => {
    setupLocationOptions(form);
  });
});
