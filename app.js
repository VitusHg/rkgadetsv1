const STORAGE_KEY = "ContactsV3_name_mobilonly";

const fileInput = document.getElementById("fileInput");
const clearDataBtn = document.getElementById("clearDataBtn");
const statusEl = document.getElementById("status");
const searchInput = document.getElementById("searchInput");
const contactsContainer = document.getElementById("contactsContainer");
const countInfo = document.getElementById("countInfo");

let contacts = [];

// ===== Startup =====
window.addEventListener("DOMContentLoaded", () => {
  // Aus localStorage laden
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      contacts = JSON.parse(saved) || [];
      renderContacts();
      setStatus("Gespeicherte Liste geladen.");
    } catch (e) {
      console.error(e);
      setStatus("Fehler beim Laden der gespeicherten Daten.");
    }
  }

  // Service Worker registrieren (Offline/PWA)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(console.error);
  }
});

// ===== Events =====
fileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (e) => {
    const text = String(e.target?.result || "");
    try {
      contacts = parseCsv(text);

      // Nur minimal nötige Daten speichern
      localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));

      renderContacts();
      setStatus(`Liste geladen (${contacts.length} Einträge).`);
    } catch (err) {
      console.error(err);
      setStatus("Fehler beim Einlesen der CSV-Datei. Prüfe Spaltennamen & Format.");
    }
  };

  // UTF-8 ist wichtig für Umlaute
  reader.readAsText(file, "utf-8");
});

clearDataBtn.addEventListener("click", () => {
  if (confirm("Gespeicherte Telefonliste wirklich löschen?")) {
    contacts = [];
    localStorage.removeItem(STORAGE_KEY);
    renderContacts();
    setStatus("Gespeicherte Daten gelöscht.");
  }
});

searchInput.addEventListener("input", () => {
  renderContacts();
});

// ===== Helpers =====
function setStatus(msg) {
  statusEl.textContent = msg;
}

/**
 * Normalisiert Telefonnummern:
 * - behält nur Ziffern und '+'
 * - "00..." -> "+..."
 * - "4366..." -> "+4366..."
 * - "+4366..." bleibt
 */
function normalizePhone(phoneRaw) {
  if (!phoneRaw) return "";

  let p = String(phoneRaw).trim();

  // Nur Ziffern und + behalten
  p = p.replace(/[^\d+]/g, "");

  if (!p) return "";

  if (p.startsWith("+")) return p;
  if (p.startsWith("00")) return "+" + p.slice(2);

  // Wenn nur Ziffern (z.B. 4366...) -> + davor
  if (/^\d+$/.test(p)) return "+" + p;

  return p;
}

/**
 * CSV Parser:
 * Erwartet Header mit:
 * - Name
 * - Mobil 1
 * - Mobil 2
 *
 * Trenner automatisch: ; oder ,
 * Achtung: sehr “pragmatisch” (keine komplexen quoted CSV Edgecases).
 */
function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const headerLine = lines[0];
  const delimiter = headerLine.includes(";") ? ";" : ",";

  const headers = headerLine
    .split(delimiter)
    .map((h) => h.trim().toLowerCase());

  // Spalten finden (deine CSV: Name, Mobil 1, Mobil 2)
  const idxName = headers.findIndex((h) => h === "name" || h.startsWith("name"));
  const idxMobil1 = headers.findIndex((h) => h.includes("mobil 1") || h.includes("mobil1"));
  const idxMobil2 = headers.findIndex((h) => h.includes("mobil 2") || h.includes("mobil2"));

  if (idxName === -1) throw new Error("Spalte 'Name' nicht gefunden.");
  if (idxMobil1 === -1 && idxMobil2 === -1) throw new Error("Keine Mobil-Spalten gefunden.");

  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map((c) => c.trim());

    const name = cols[idxName] || "";
    if (!name) continue;

    const mobil1Raw = idxMobil1 >= 0 ? (cols[idxMobil1] || "") : "";
    const mobil2Raw = idxMobil2 >= 0 ? (cols[idxMobil2] || "") : "";

    const mobil1 = normalizePhone(mobil1Raw);
    const mobil2 = normalizePhone(mobil2Raw);

    // Nur speichern was wir wirklich brauchen
    data.push({
      name,
      mobil1,
      mobil2
    });
  }

  return data;
}

// ===== UI Rendering =====
function renderContacts() {
  contactsContainer.innerHTML = "";

  if (!contacts || contacts.length === 0) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "Noch keine Daten geladen. Bitte oben eine CSV-Datei auswählen.";
    contactsContainer.appendChild(p);
    countInfo.textContent = "";
    return;
  }

  const query = searchInput.value.trim().toLowerCase();

  const filtered = contacts.filter((c) => {
    if (!query) return true;

    const n = (c.name || "").toLowerCase();
    const m1 = (c.mobil1 || "").toLowerCase();
    const m2 = (c.mobil2 || "").toLowerCase();

    return n.includes(query) || m1.includes(query) || m2.includes(query);
  });

  countInfo.textContent = `${filtered.length} von ${contacts.length} Kontakten angezeigt`;

  filtered.forEach((c) => {
    const card = document.createElement("article");
    card.className = "contact-card";

    const header = document.createElement("div");
    header.className = "contact-header";

    const nameEl = document.createElement("div");
    nameEl.className = "contact-name";
    nameEl.textContent = c.name;

    const extraEl = document.createElement("div");
    extraEl.className = "contact-extra";

    // Optional: rechts klein die erste Nummer anzeigen (wenn vorhanden)
    extraEl.textContent = c.mobil1 || "";

    header.appendChild(nameEl);
    header.appendChild(extraEl);
    card.appendChild(header);

    const phoneButtons = document.createElement("div");
    phoneButtons.className = "phone-buttons";

    const p1 = c.mobil1 || "";
    const p2 = c.mobil2 || "";

    if (p1) {
      const link1 = document.createElement("a");
      link1.href = "tel:" + p1;
      link1.textContent = p1; // <- Nummer anzeigen
      phoneButtons.appendChild(link1);
    }

    if (p2 && p2 !== p1) {
      const link2 = document.createElement("a");
      link2.href = "tel:" + p2;
      link2.textContent = p2; // <- Nummer anzeigen
      phoneButtons.appendChild(link2);
    }

    if (phoneButtons.childElementCount > 0) {
      card.appendChild(phoneButtons);
    } else {
      const hint = document.createElement("div");
      hint.className = "email-list"; // reuse: kleine graue Schrift
      hint.textContent = "Keine Nummer vorhanden";
      card.appendChild(hint);
    }

    contactsContainer.appendChild(card);
  });
}
