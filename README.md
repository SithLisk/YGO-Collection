# Scott's Yu-Gi-Oh! Collection Tracker

A full-featured Yu-Gi-Oh! collection management web app built with vanilla JavaScript, Firebase Firestore, and the YGOPRODeck API. Deployable as a single HTML file on GitHub Pages.

---

## Features

### Profiles
- Profile selector screen on load — multiple named user profiles, each with isolated card and deck data
- Anyone can browse any profile's collection read-only without a password
- Password required to create profiles, add/edit/delete cards, or save/delete decks
- Last visited profile is remembered via `localStorage` and auto-selected on return
- Profile deletion batch-removes all associated cards and decks from Firestore

### Collection Management
- **Card search** powered by the [YGOPRODeck API v7](https://db.ygoprodeck.com/api-guide/) with fuzzy name matching and archetype fallback
- **Autofill** — card type, attribute, ATK/DEF, level/rank, archetype, race, and card image all populate automatically from the API
- **Card number dropdown** — lists every printing of a card; selecting one updates the Set and Rarity fields automatically
- **Inline quantity controls** — `+` / `−` buttons update card quantities directly in the table, synced to Firestore instantly
- **Undo delete** — 5-second toast with an UNDO button after removing a card
- **Card image thumbnails** in each table row; click to open full card detail modal
- **Card detail modal** — full card art, type/attribute/archetype pills, ATK/DEF, set info, and complete effect text fetched from the API

### Collection Display
- **Sortable columns** — click any header to sort ascending/descending
- **Type filter dropdown** on the collection header — filter by Monsters, Spells, or Traps
- **Text search** — filters across name, type, attribute, archetype, set, card number, rarity, condition, and edition simultaneously
- **Color-coded dot indicators** by card type: Effect, Normal, Fusion, Synchro, XYZ, Link, Ritual, Pendulum, Spell, Trap
- **Attribute badges** color-coded by DARK / LIGHT / EARTH / FIRE / WATER / WIND / DIVINE
- **Rarity breakdown bar** — live count of each rarity (Secret Rare, Ultra Rare, Super Rare, etc.) in your collection
- **Level/Rank column** — shows `L-#` for monsters, `R-#` for XYZ, `Link-#` for Link monsters; blank for Spells/Traps

### Deck Builder
- **Main / Extra / Side** deck zones with live card counts
- Main deck counter turns green at 40+ cards (valid), red if under
- Search your collection to add cards to any zone
- Max 3 copies of any card enforced across all zones
- **Save Deck** — writes deck to Firestore under the active profile (password required)
- **Export .ydk** — downloads a standard YGO deck file compatible with YGOPro, Dueling Nexus, and other simulators
- Load saved decks back into the builder for editing

### Saved Decks Tab
- Card grid showing all saved decks with name, zone counts, and save date
- **Load into Builder** — restores a deck into the deck builder
- **Export .ydk** — export directly from saved data without loading first
- **Delete** — removes deck from Firestore (password required)

### Sync & Auth
- **Real-time sync** via Firebase Firestore — changes appear instantly across all devices
- **Single shared password** for edit access (SHA-256 hashed client-side)
- Lock/unlock button in the sync bar; read-only browsing requires no password
- **CSV export** of the full collection for use in Excel

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML / CSS / JavaScript (single file) |
| Database | Firebase Firestore (compat SDK v9.23.0) |
| Card Data | YGOPRODeck API v7 |
| Card Images | YGOPRODeck CDN (`images.ygoprodeck.com`) |
| Hosting | GitHub Pages |
| Auth | SHA-256 password hash via Web Crypto API |

---

## Firebase Setup

The app uses the following Firestore collections:

```
/profiles/{profileId}/cards/{cardId}
/profiles/{profileId}/decks/{deckId}
```

### Recommended Firestore Security Rules

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Anyone can read profiles and their collections
    match /profiles/{profileId} {
      allow read: if true;

      match /cards/{cardId} {
        allow read: if true;
        allow write: if false; // Controlled client-side via password
      }

      match /decks/{deckId} {
        allow read: if true;
        allow write: if false;
      }
    }
  }
}
```

> **Note:** Write access is controlled client-side via the shared password. For production use, consider implementing Firebase Authentication for true server-side write protection.

---

## Deployment

1. Clone or download this repository
2. Push `index.html`, `README.md`, and `bg.png` to a GitHub repository
3. Go to **Settings → Pages** and set the source to the `main` branch root
4. Your tracker will be live at `https://<username>.github.io/<repo-name>/`

No build step or package manager required.

---

## Password

The default edit password is stored as a SHA-256 hash in `index.html`. To change it:

1. Hash your new password using any SHA-256 tool (e.g. [cyberchef.org](https://cyberchef.org))
2. Find `var PW_HASH = '...'` in the `<script>` block
3. Replace the hash value with your new one

---

## Card Data Attribution

Card data and images provided by [YGOPRODeck](https://ygoprodeck.com/) under their free API. Card names, artwork, and game mechanics are property of Konami.
