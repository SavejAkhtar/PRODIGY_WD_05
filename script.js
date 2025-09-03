const GEOCODE_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_ENDPOINT = "https://api.open-meteo.com/v1/forecast";

const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const useLocationBtn = document.getElementById("use-location");
const suggestionsBox = document.getElementById("suggestions");
const statusEl = document.getElementById("status");
const cardEl = document.getElementById("weather");

const placeNameEl = document.getElementById("place-name");
const coordsEl = document.getElementById("coords");
const updatedEl = document.getElementById("updated-at");
const tempEl = document.getElementById("temperature");
const apparentEl = document.getElementById("apparent");
const humidityEl = document.getElementById("humidity");
const precipEl = document.getElementById("precip");
const windEl = document.getElementById("wind");
const iconEl = document.getElementById("weather-icon");
const descEl = document.getElementById("weather-desc");

function setStatus(message, isError = false) {
  if (!message) {
    statusEl.classList.add("hidden");
    statusEl.textContent = "";
    return;
  }
  statusEl.textContent = message;
  statusEl.classList.remove("hidden");
  statusEl.style.color = isError ? "#fca5a5" : "#94a3b8";
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { "Accept": "application/json", ...(options.headers || {}) } });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function weatherCodeToInfo(code) {
  const map = {
    0: ["☀️", "Clear sky"],
    1: ["🌤️", "Mainly clear"],
    2: ["⛅", "Partly cloudy"],
    3: ["☁️", "Overcast"],
    45: ["🌫️", "Fog"],
    48: ["🌫️", "Depositing rime fog"],
    51: ["🌦️", "Light drizzle"],
    53: ["🌦️", "Moderate drizzle"],
    55: ["🌧️", "Dense drizzle"],
    56: ["🌦️", "Light freezing drizzle"],
    57: ["🌧️", "Dense freezing drizzle"],
    61: ["🌦️", "Slight rain"],
    63: ["🌧️", "Moderate rain"],
    65: ["🌧️", "Heavy rain"],
    66: ["🌨️", "Light freezing rain"],
    67: ["🌨️", "Heavy freezing rain"],
    71: ["🌨️", "Slight snow"],
    73: ["🌨️", "Moderate snow"],
    75: ["❄️", "Heavy snow"],
    77: ["🌨️", "Snow grains"],
    80: ["🌦️", "Slight rain showers"],
    81: ["🌧️", "Moderate rain showers"],
    82: ["🌧️", "Violent rain showers"],
    85: ["🌨️", "Slight snow showers"],
    86: ["❄️", "Heavy snow showers"],
    95: ["⛈️", "Thunderstorm"],
    96: ["⛈️", "Thunderstorm with hail"],
    99: ["⛈️", "Severe thunderstorm with hail"],
  };
  return map[code] || ["🌡️", "Unknown conditions"];
}

function formatWind(windKmh, windDir) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  const idx = Math.round(windDir / 22.5) % 16;
  return `${Math.round(windKmh)} km/h ${dirs[idx]}`;
}

function showCard() { cardEl.classList.remove("hidden"); }

function renderWeather(place, coords, current) {
  placeNameEl.textContent = place;
  coordsEl.textContent = `${coords.latitude.toFixed(3)}, ${coords.longitude.toFixed(3)}`;
  updatedEl.textContent = new Date().toLocaleString();

  tempEl.textContent = Math.round(current.temperature_2m);
  apparentEl.textContent = Math.round(current.apparent_temperature);
  humidityEl.textContent = `${Math.round(current.relative_humidity_2m)}%`;
  precipEl.textContent = `${current.precipitation?.toFixed?.(1) ?? 0} mm`;
  windEl.textContent = formatWind(current.wind_speed_10m, current.wind_direction_10m);

  const [emoji, desc] = weatherCodeToInfo(current.weather_code);
  iconEl.textContent = emoji;
  descEl.textContent = desc;

  showCard();
}

async function getWeatherByCoords(latitude, longitude, placeLabel = "Selected location") {
  setStatus("Loading weather...");
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "is_day",
      "precipitation",
      "weather_code",
      "wind_speed_10m",
      "wind_direction_10m",
    ].join(","),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "auto",
  });
  const url = `${WEATHER_ENDPOINT}?${params.toString()}`;
  const data = await fetchJson(url);
  setStatus(null);
  localStorage.setItem("last_location", JSON.stringify({ latitude, longitude, placeLabel }));
  renderWeather(placeLabel, { latitude, longitude }, data.current);
}

async function searchLocations(q) {
  const params = new URLSearchParams({ name: q, count: "5", language: navigator.language || "en", format: "json" });
  const url = `${GEOCODE_ENDPOINT}?${params.toString()}`;
  const data = await fetchJson(url);
  return data.results || [];
}

function renderSuggestions(list) {
  suggestionsBox.innerHTML = "";
  if (!list.length) return;
  list.forEach(item => {
    const el = document.createElement("div");
    el.className = "suggestion-item";
    const parts = [item.name, item.admin1, item.country].filter(Boolean).join(", ");
    el.textContent = parts;
    el.role = "option";
    el.addEventListener("click", () => {
      suggestionsBox.innerHTML = "";
      getWeatherByCoords(item.latitude, item.longitude, parts).catch(err => setStatus(err.message, true));
    });
    suggestionsBox.appendChild(el);
  });
}

let searchDebounce;
searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim();
  if (searchDebounce) clearTimeout(searchDebounce);
  if (!q) { suggestionsBox.innerHTML = ""; return; }
  searchDebounce = setTimeout(async () => {
    try {
      const res = await searchLocations(q);
      renderSuggestions(res);
    } catch (e) { setStatus("Failed to load suggestions", true); }
  }, 250);
});

searchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = searchInput.value.trim();
  if (!q) return;
  try {
    setStatus("Searching...");
    const results = await searchLocations(q);
    if (!results.length) {
      setStatus("No results. Try another query.");
      return;
    }
    const top = results[0];
    const label = [top.name, top.admin1, top.country].filter(Boolean).join(", ");
    await getWeatherByCoords(top.latitude, top.longitude, label);
  } catch (err) {
    setStatus(err.message, true);
  }
});

useLocationBtn.addEventListener("click", () => {
  if (!navigator.geolocation) { setStatus("Geolocation not supported by your browser.", true); return; }
  setStatus("Locating...");
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const { latitude, longitude } = pos.coords;
      await getWeatherByCoords(latitude, longitude, "Your location");
    } catch (err) {
      setStatus(err.message, true);
    }
  }, (err) => {
    setStatus(err.message || "Failed to get location", true);
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
});

async function bootstrap() {
  try {
    const last = localStorage.getItem("last_location");
    if (last) {
      const parsed = JSON.parse(last);
      await getWeatherByCoords(parsed.latitude, parsed.longitude, parsed.placeLabel);
      return;
    }
    // Attempt passive geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        try { await getWeatherByCoords(pos.coords.latitude, pos.coords.longitude, "Your location"); }
        catch (e) { /* ignore and let user search */ }
      });
    }
  } catch (e) {
    // Ignore boot errors
  }
}

document.addEventListener("DOMContentLoaded", bootstrap);