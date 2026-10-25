# Bene's Wunschliste 🎁

Eine minimalistische, clean gestaltete und für Mobilgeräte optimierte Wunschliste mit automatischer OpenGraph-Vorschau (Bild, Titel, Shop) und anonymer Geschenk-Reservierung.

---

## ✨ Features

- **📱 Mobile-First & Minimalistisch**: Clean gestaltetes Layout mit Fokus auf Smartphones (iPhone / Android) und angenehmer Typografie (`Plus Jakarta Sans`).
- **🔗 Automatische Link-Vorschau (OpenGraph)**: Einfach Produktlink (z. B. Amazon, Galaxus, Zalando, Thalia etc.) einfügen – Bild, Titel und Shop-Name werden automatisch im Hintergrund geladen.
- **🎁 Anonym Schenken**:
  - Besucher können auf **„Ich schenke das“** klicken.
  - Das Geschenk wird reserviert, ohne dass Bene sieht, wer es reserviert hat (Überraschung bleibt gewahrt!).
- **🔒 „Das wird schon geschenkt!“**:
  - Wurde ein Geschenk bereits reserviert, sehen alle anderen Besucher die Liste weiterhin vollständig.
  - Bei Klick auf das Geschenk erscheint der Hinweis: **„Das wird schon geschenkt! Jemand anderes hat dieses Geschenk bereits reserviert.“**
- **↩️ Eigene Reservierung freigeben**: Wer ein Geschenk selbst reserviert hat, sieht den Status *„Von dir reserviert“* und kann die Reservierung bei Bedarf mit einem Klick wieder aufheben.
- **🔑 Bene's Verwaltungsmodus**:
  - Ganz unten unter dem Footer über das unauffällige Wort **„anmelden“** erreichbar.
  - Passwort konfigurierbar über die Umgebungsvariable **`ADMIN_PASSWORD`** (Standardwert lokal: `dreisam26!`).
  - Nach der Anmeldung wechselt der Link zu **„+ Produkt eintragen“** und schaltet Lösch-Optionen frei.
- **📤 Teilen-Funktion**: Kopiert den Link oder nutzt das native Teilen-Menü auf Smartphones.
- **🎉 Konfetti-Animation**: Feiert die erfolgreiche Reservierung mit einem festlichen Konfetti-Effekt.

---

## 🚀 Starten

Der Server läuft bereits auf Port `3000`.

Um die Wunschliste im Browser aufzurufen:
👉 **[http://localhost:3000](http://localhost:3000)**

### Befehle

```bash
# Server starten
npm start

# Entwicklungsmodus mit automatischem Neustart bei Änderungen
npm run dev
```

---

## 📁 Projektstruktur

```
├── data/
│   └── wishlist.json      # Gespeicherte Wünsche & Reservierungen
├── public/
│   ├── index.html         # HTML mit modernen Modals & Filter-Chips
│   ├── style.css          # Minimalistisches CSS Design-System
│   └── app.js             # Interaktive Logik, Scraping-Vorschau & Confetti
├── server.js              # Express Backend mit OpenGraph Cheerio Scraper
└── package.json
```
