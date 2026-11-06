const form = document.querySelector("#search");
const question = document.querySelector("#question");
const button = document.querySelector("#go");
const status = document.querySelector("#status");
const answer = document.querySelector("#answer");
const results = document.querySelector("#results");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  button.disabled = true;
  status.className = "";
  status.textContent = "Finding your location…";
  answer.hidden = true;
  results.replaceChildren();

  try {
    const origin = await currentLocation();
    status.textContent = "Searching…";
    const response = await fetch("http://127.0.0.1:3080/places", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: question.value, origin }),
    });
    const body = await response.json();
    if (!response.ok) {
      status.className = "error";
      status.textContent = typeof body.message === "string" ? body.message : "Search failed.";
      return;
    }
    status.textContent = "";
    if (body.answer) {
      answer.hidden = false;
      answer.textContent = body.answer;
      return;
    }
    if (!body.places?.length) {
      status.textContent = "No places found inside the radius.";
      return;
    }
    for (const place of body.places) results.append(renderPlace(place));
  } catch (error) {
    status.className = "error";
    status.textContent = error instanceof Error ? error.message : "Could not reach the local server.";
  } finally {
    button.disabled = false;
  }
});

function currentLocation() {
  if (!navigator.geolocation) return Promise.reject(new Error("This browser cannot read your location."));
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => reject(new Error("Allow location access so the search can run near you.")),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}

function renderPlace(place) {
  const item = document.createElement("li");
  item.className = "place";
  const title = document.createElement("h2");
  title.textContent = place.name;
  item.append(title);

  const meta = document.createElement("p");
  meta.className = "meta";
  const bits = [place.description, place.address, place.distanceMeters != null ? `${place.distanceMeters} m straight-line` : null];
  meta.textContent = bits.filter(Boolean).join(" · ");
  item.append(meta);

  const times = document.createElement("p");
  times.className = "times";
  times.textContent = ["walking", "driving", "cycling"]
    .map((mode) => {
      const minutes = place.travelTime?.[mode];
      const meters = place.streetDistance?.[mode];
      const time = minutes == null ? "—" : `${minutes} min`;
      const road = meters == null ? "" : ` (${meters} m)`;
      return `${mode} ${time}${road}`;
    })
    .join("  ·  ");
  item.append(times);

  if (place.phoneNumber || place.website) {
    const contact = document.createElement("p");
    contact.className = "contact";
    if (place.phoneNumber) contact.append(place.phoneNumber);
    if (place.website) {
      if (place.phoneNumber) contact.append(" · ");
      const link = document.createElement("a");
      link.href = place.website;
      link.textContent = place.website;
      link.target = "_blank";
      link.rel = "noreferrer";
      contact.append(link);
    }
    item.append(contact);
  }

  if (place.location) {
    const map = document.createElement("p");
    map.className = "contact";
    const link = document.createElement("a");
    link.href = `https://www.openstreetmap.org/?mlat=${place.location.lat}&mlon=${place.location.lng}#map=17/${place.location.lat}/${place.location.lng}`;
    link.textContent = "Open on the map";
    link.target = "_blank";
    link.rel = "noreferrer";
    map.append(link);
    item.append(map);
  }
  return item;
}
