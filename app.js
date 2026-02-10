const STORAGE_KEY = "ContactsV4_clean_buttons";

const fileInput = document.getElementById("fileInput");
const clearDataBtn = document.getElementById("clearDataBtn");
const statusEl = document.getElementById("status");
const searchInput = document.getElementById("searchInput");
const contactsContainer = document.getElementById("contactsContainer");
const countInfo = document.getElementById("countInfo");

let contacts = [];

// ===== Startup =====
window.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      contacts = JSON.parse(saved) || [];
      renderContacts();
      setStatus("Gespeicherte Liste geladen.");
    } catch {
      setStatus("Fehler beim Laden der gespeicherten Daten.");
    }
  }

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
    try {
      contacts = parseCsv(String(e.target?.result || ""));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
      renderContacts();
      setStatus(`Liste geladen (${contacts.length} Einträge).`);
    } catch {
      setStatus("Fehler beim Einlesen der CSV-Datei.");
    }
  };

  reader.readAsText(file, "utf-8"); // wichtig für Umlaute
});

clearDataBtn.addEventListener("click", () => {
  if (confirm("Gespeicherte Telefonliste wirklich löschen?")) {
    contacts = [];
    localStorage.removeItem(STORAGE_KEY);
    renderContacts();
    setStatus("Gespeicherte Daten gelöscht.");
  }
});

searchInput.addEventListener("input", renderContacts);

// ===== Helpers =====
function setStatus(msg) {
  statusEl.textContent = msg;
}

function normalizePhone(raw) {
  if (!raw) return "";

  let p = String(raw).trim().replace(/[^\d+]/g, "");
  if (!p) return "";

  if (p.startsWith("+")) return p;
  if (p.startsWith("00")) return "+" + p.slice(2);
  if (/^\d+$/.test(p)) return "+" + p;

  return p;
}

function parseCsvLine(line, delimiter) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(text) {
  const cleaned = text.replace(/^\uFEFF/, "");
  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = parseCsvLine(lines[0], delimiter).map((h) => h.toLowerCase());

  const idxName = headers.findIndex((h) => h.startsWith("name"));
  const idxM1 = headers.findIndex((h) => h.includes("mobil 1") || h.includes("mobil1"));
  const idxM2 = headers.findIndex((h) => h.includes("mobil 2") || h.includes("mobil2"));

  if (idxName === -1) throw new Error("Name fehlt");

  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], delimiter);
    const name = cols[idxName]?.trim();
    if (!name) continue;

    const m1 = idxM1 >= 0 ? normalizePhone(cols[idxM1]) : "";
    const m2 = idxM2 >= 0 ? normalizePhone(cols[idxM2]) : "";

    data.push({ name, mobil1: m1, mobil2: m2 });
  }

  return data;
}

// ===== UI =====
function renderContacts() {
  contactsContainer.innerHTML = "";

  if (!contacts.length) {
    contactsContainer.innerHTML = `<p class="hint">Noch keine Daten geladen.</p>`;
    countInfo.textContent = "";
    return;
  }

  const q = searchInput.value.toLowerCase().trim();
  const filtered = contacts.filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.mobil1.includes(q) ||
      c.mobil2.includes(q)
  );

  countInfo.textContent = `${filtered.length} von ${contacts.length} Kontakten angezeigt`;

  if (!filtered.length) {
    contactsContainer.innerHTML = `<p class="hint">Keine Treffer für „${q}“.</p>`;
    return;
  }

  filtered.forEach((c) => {
    const card = document.createElement("article");
    card.className = "contact-card";

    const header = document.createElement("div");
    header.className = "contact-header";

    const nameEl = document.createElement("div");
    nameEl.className = "contact-name";
    nameEl.textContent = c.name;

    header.appendChild(nameEl);
    card.appendChild(header);

    const phoneButtons = document.createElement("div");
    phoneButtons.className = "phone-buttons";

    if (c.mobil1) {
      phoneButtons.appendChild(makePhoneButton(c.mobil1));
    }

    if (c.mobil2 && c.mobil2 !== c.mobil1) {
      phoneButtons.appendChild(makePhoneButton(c.mobil2));
    }

    if (phoneButtons.childElementCount) {
      card.appendChild(phoneButtons);
    } else {
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = "Keine Telefonnummer vorhanden";
      card.appendChild(hint);
    }

    contactsContainer.appendChild(card);
  });
}

function makePhoneButton(number) {
  const a = document.createElement("a");
  a.href = "tel:" + number;
  a.textContent = number;
  return a;
}
