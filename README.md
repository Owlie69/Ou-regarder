# Où Regarder — Guide de visionnage parisien

Application web pour trouver les meilleurs spots pour observer les événements parisiens : éclipses, feux d'artifice, défilés, levers de soleil, illuminations.

## Tech stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Maps**: Leaflet + OpenStreetMap (aucune clé API requise)
- **Sun calculations**: SunCalc
- **Data store**: JSON local (`data/events.json`)
- **Language**: TypeScript

## Getting started

### 1. Clone & install

```bash
git clone <repo>
cd Ou-regarder
npm install
```

### 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_PASSWORD` | ✅ | Password to access the admin panel at `/admin` |
| `NEXT_PUBLIC_BASE_URL` | ✅ | Public URL of the site (used for SEO, sitemap, OG tags) |

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Pages

| Route | Description |
|-------|-------------|
| `/` | Homepage with event tabs (Bientôt / Atemporel / Passé) |
| `/events/[slug]` | Event detail with interactive map, sun compass, viewing spots |
| `/admin` | Admin panel (password-protected) |
| `/admin/login` | Admin login |
| `/admin/events/new` | Create a new event |
| `/admin/events/[id]/edit` | Edit an existing event |
| `/sitemap.xml` | Auto-generated sitemap |
| `/robots.txt` | Robots instructions |
| `/llms.txt` | LLM-friendly site description (llms.txt convention) |

## Data model

Events are stored in `data/events.json`. Each event has:

- `id`, `slug` — unique identifiers
- `name`, `shortDescription`, `longDescription` — content
- `category` — `bientot` | `atemporel` | `passe`
- `published` — boolean (only published events show on the homepage)
- `date`, `time`, `recurrence` — temporal info
- `imageUrl` — event photo
- `location` — `{ lat, lng, name }`
- `viewingSpots[]` — ranked spots with lat/lng, direction, distance, notes
- `sunEvent` + `eventDateTime` — enables sun azimuth/elevation calculation
- `viewingTips[]` — practical advice
- `seoTitle`, `seoDescription`, `tags[]` — SEO fields

## Admin panel

Access `/admin` with the password set in `ADMIN_PASSWORD`. Features:

- View all events (including drafts)
- Create / Edit events with full form
- Toggle published ↔ draft
- Delete events
- Preview live event page

## SEO features

- Per-event `<title>` and `<meta description>`
- Open Graph tags for social sharing
- `schema.org/Event` JSON-LD structured data
- `sitemap.xml` (auto-generated)
- `robots.txt`
- `/llms.txt` — LLM-optimised plain-text index of all events

## Seeded events

The app ships with 5 seed events:

1. **Éclipse solaire partielle 2026** — 12 août 2026
2. **Défilé du 14 Juillet** — 14 juillet 2026
3. **Feux d'artifice du 14 Juillet** — 14 juillet 2026 (nuit)
4. **Lever de soleil depuis Montmartre** — atemporel
5. **Illuminations de la Tour Eiffel** — atemporel

## Future features (scaffolded)

- Bar/venue filters on event pages
- User geolocation to rank spots by proximity
