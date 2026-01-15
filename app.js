const STORAGE_KEY = "ContactsV1";

const fileInput = document.getElementById("fileInput");
const clearDataBtn = document.getElementById("clearDataBtn");
const statusEl = document.getElementById("status");
const searchInput = document.getElementById("searchInput");
const contactsContainer = document.getElementById("contactsContainer");
const countInfo = document.getElementById("countInfo");

let contacts = [];

// Beim Laden: aus localStorage ziehen
window.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      contacts = JSON.parse(saved);
      renderContacts();
      setStatus("Gespeicherte Liste geladen.");
    } catch (e) {
      console.error(e);
      setStatus("Fehler beim Laden der gespeicherten Daten.");
    }
  }

  // Service Worker registrieren (für PWA/offline)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(console.error);
  }
});

fileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = String(e.target?.result || "");
    try {
      contacts = parseCsv(text);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
      renderContacts();
      setStatus(`Liste geladen (${contacts.length} Einträge).`);
    } catch (err) {
      console.error(err);
      setStatus("Fehler beim Einlesen der CSV-Datei.");
    }
  };
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

function setStatus(msg) {
  statusEl.textContent = msg;
}

// Sehr einfache CSV-Parsing-Funktion
function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const firstLine = lines[0];
  const delimiter = firstLine.includes(";") ? ";" : ",";

  const headers = firstLine.split(delimiter).map((h) => h.trim().toLowerCase());

  const idxName = headers.findIndex((h) => h.startsWith("name"));
  const idxMobil1 = headers.findIndex((h) => h.includes("mobil 1") || h.includes("mobil1"));
  const idxMobil2 = headers.findIndex((h) => h.includes("mobil 2") || h.includes("mobil2"));
  const idxEmail1 = headers.findIndex((h) => h.includes("e-mail 1") || h.includes("email 1"));
  const idxEmail2 = headers.findIndex((h) => h.includes("e-mail 2") || h.includes("email 2"));

  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map((c) => c.trim());
    if (!cols[idxName] || cols[idxName].length === 0) continue;

    const entry = {
      name: cols[idxName] || "",
      mobil1: idxMobil1 >= 0 ? cols[idxMobil1] || "" : "",
      mobil2: idxMobil2 >= 0 ? cols[idxMobil2] || "" : "",
      email1: idxEmail1 >= 0 ? cols[idxEmail1] || "" : "",
      email2: idxEmail2 >= 0 ? cols[idxEmail2] || "" : "",
    };

    data.push(entry);
  }

  return data;
}

function normalizePhone(phone) {
  return phone.replace(/\s+/g, "");
}

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
    return (
      c.name.toLowerCase().includes(query) ||
      c.mobil1.toLowerCase().includes(query) ||
      c.mobil2.toLowerCase().includes(query)
    );
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

    if (c.mobil1 && !c.mobil2) extraEl.textContent = c.mobil1;
    else if (c.mobil1 && c.mobil2) extraEl.textContent = `${c.mobil1} · ${c.mobil2}`;
    else extraEl.textContent = "";

    header.appendChild(nameEl);
    header.appendChild(extraEl);
    card.appendChild(header);

    const phoneButtons = document.createElement("div");
    phoneButtons.className = "phone-buttons";

    if (c.mobil1) {
      const link1 = document.createElement("a");
      link1.href = "tel:" + normalizePhone(c.mobil1);
      link1.textContent = "Mobil 1";
      phoneButtons.appendChild(link1);
    }

    if (c.mobil2 && c.mobil2 !== c.mobil1) {
      const link2 = document.createElement("a");
      link2.href = "tel:" + normalizePhone(c.mobil2);
      link2.textContent = "Mobil 2";
      phoneButtons.appendChild(link2);
    }

    if (phoneButtons.childElementCount > 0) {
      card.appendChild(phoneButtons);
    }

    const emails = [];
    if (c.email1) emails.push(c.email1);
    if (c.email2 && c.email2 !== c.email1) emails.push(c.email2);

    if (emails.length > 0) {
      const emailEl = document.createElement("div");
      emailEl.className = "email-list";
      emails.forEach((mail) => {
        const span = document.createElement("span");
        span.textContent = mail;
        emailEl.appendChild(span);
      });
      card.appendChild(emailEl);
    }

    contactsContainer.appendChild(card);
  });
}
