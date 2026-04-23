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

  importContactsFromFile(file).catch((err) => {
    console.error(err);
    setStatus("Datei konnte nicht verarbeitet werden.");
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

function looksLikePdf(file) {
  const lowerName = file.name?.toLowerCase() || "";
  return file.type === "application/pdf" || lowerName.endsWith(".pdf");
}

function looksLikeCsv(file) {
  const lowerName = file.name?.toLowerCase() || "";
  return file.type.includes("csv") || lowerName.endsWith(".csv");
}

async function importContactsFromFile(file) {
  if (looksLikePdf(file)) {
    contacts = await parsePdf(file);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
    renderContacts();
    setStatus(
      `PDF geladen (${contacts.length} Einträge). Wenn etwas fehlt, bitte Beispiel-PDF teilen.`
    );
    return;
  }

  if (!looksLikeCsv(file)) {
    setStatus("Bitte CSV oder PDF auswählen.");
    return;
  }

  const text = await readFileAsText(file);
  contacts = parseCsv(text);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
  renderContacts();
  setStatus(`CSV geladen (${contacts.length} Einträge).`);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(String(e.target?.result || ""));
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsText(file, "utf-8");
  });
}

async function parsePdf(file) {
  if (!window.pdfjsLib) {
    throw new Error("PDF.js nicht geladen.");
  }

  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.js";

  const bytes = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
  const lines = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const text = await page.getTextContent();
    const pageLines = splitTextItemsIntoLines(text.items || []);
    lines.push(...pageLines);
  }

  const parsed = parseContactsFromPdfLines(lines);
  if (!parsed.length) {
    throw new Error("Keine Kontakte im PDF gefunden.");
  }

  return parsed;
}

function splitTextItemsIntoLines(items) {
  const grouped = new Map();
  const precision = 2;

  items.forEach((item) => {
    const y = Number(item.transform?.[5] || 0).toFixed(precision);
    if (!grouped.has(y)) grouped.set(y, []);
    grouped.get(y).push(item);
  });

  const yValues = [...grouped.keys()].sort((a, b) => Number(b) - Number(a));
  return yValues.map((y) => {
    const segments = grouped
      .get(y)
      .slice()
      .sort((a, b) => (a.transform?.[4] || 0) - (b.transform?.[4] || 0))
      .map((s) => s.str || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    return segments;
  });
}

function parseContactsFromPdfLines(lines) {
  const contactsByName = new Map();
  const phonePattern = /(?:\+|00)?\d[\d\s()./-]{6,}\d/g;

  lines.forEach((line) => {
    if (!line) return;
    const lower = line.toLowerCase();
    if (lower.includes("name") && lower.includes("mobil")) return;

    const matches = [...line.matchAll(phonePattern)].map((m) => m[0]);
    if (!matches.length) return;

    const phones = matches.map(normalizePhone).filter(Boolean);
    if (!phones.length) return;

    const name = line
      .replace(phonePattern, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!name) return;

    if (!contactsByName.has(name)) {
      contactsByName.set(name, new Set());
    }

    const set = contactsByName.get(name);
    phones.forEach((p) => set.add(p));
  });

  return [...contactsByName.entries()].map(([name, phoneSet]) => {
    const phoneList = [...phoneSet];
    return {
      name,
      mobil1: phoneList[0] || "",
      mobil2: phoneList[1] || "",
    };
  });
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
