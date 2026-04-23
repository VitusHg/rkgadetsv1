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

  readCsvFileAsText(file)
    .then((text) => {
      contacts = parseCsv(text);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
      renderContacts();
      setStatus(`Liste geladen (${contacts.length} Einträge).`);
    })
    .catch(() => {
      setStatus("Fehler beim Einlesen der CSV-Datei.");
    });
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

function normalizeName(raw) {
  if (!raw) return "";

  return String(raw)
    .replace(/\s*\([^)]*\)/g, "") // entfernt " (..)" inkl. Leerzeichen davor
    .replace(/,.*$/, "") // entfernt alles ab Beistrich inkl. Beistrich
    .trim();
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

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map((h) => h.toLowerCase());

  const idxName = headers.findIndex((h) => h.startsWith("name"));
  const idxM1 = headers.findIndex((h) => h.includes("mobil 1") || h.includes("mobil1"));
  const idxM2 = headers.findIndex((h) => h.includes("mobil 2") || h.includes("mobil2"));
  const resolvedNameIdx = idxName >= 0 ? idxName : 0;

  const data = [];
  const seen = new Set();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], delimiter);
    const name = normalizeName(cols[resolvedNameIdx]) || "Unbekannt";

    const m1 = idxM1 >= 0 ? normalizePhone(cols[idxM1]) : "";
    const m2 = idxM2 >= 0 ? normalizePhone(cols[idxM2]) : "";
    const dedupeKey = `${name}|${m1}|${m2}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    data.push({ name, mobil1: m1, mobil2: m2 });
  }

  return data;
}

function detectDelimiter(headerLine) {
  const candidates = [";", ",", "\t"];
  let best = ";";
  let highest = -1;

  candidates.forEach((delimiter) => {
    const count = headerLine.split(delimiter).length - 1;
    if (count > highest) {
      highest = count;
      best = delimiter;
    }
  });

  return best;
}

async function readCsvFileAsText(file) {
  const bytes = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (!utf8.includes("�")) return utf8;

  return new TextDecoder("windows-1252").decode(bytes);
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
  const row = document.createElement("div");
  row.className = "phone-row";

  const text = document.createElement("span");
  text.className = "phone-number";
  text.textContent = number;

  const actions = document.createElement("div");
  actions.className = "phone-actions";

  const callBtn = document.createElement("button");
  callBtn.type = "button";
  callBtn.className = "icon-btn";
  callBtn.title = "Anrufen";
  callBtn.setAttribute("aria-label", `Anrufen: ${number}`);
  callBtn.textContent = "📞";
  callBtn.addEventListener("click", () => {
    window.location.href = "tel:" + number;
  });

  const waBtn = document.createElement("button");
  waBtn.type = "button";
  waBtn.className = "icon-btn";
  waBtn.title = "WhatsApp";
  waBtn.setAttribute("aria-label", `WhatsApp: ${number}`);
  waBtn.textContent = "💬";
  waBtn.addEventListener("click", () => {
    const waNumber = toWhatsAppNumber(number);
    window.open(`https://wa.me/${waNumber}`, "_blank", "noopener");
  });

  actions.append(callBtn, waBtn);
  row.append(text, actions);
  return row;
}

function toWhatsAppNumber(raw) {
  return String(raw).replace(/[^\d]/g, "");
}
