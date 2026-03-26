# CoachCenter

A modular cycling performance analytics dashboard that connects to **Intervals.icu**, **Strava**, and **Garmin Connect** (via Intervals.icu bridge). Deployable on GitHub Pages as a static SPA — no backend required.

## What it does

- **PMC Chart** — Fitness (CTL), Fatigue (ATL), Form (TSB) with 30/60/90 day views
- **Efficiency Factor tracking** — Detects aerobic regression (EF = NP / avg HR)
- **Weekly load charts** — Stacked by sport (cycling vs running), with progression monitoring
- **Activity browser** — Sortable, filterable, with computed EF per activity
- **Form state assessment** — Fresh / Fatigued / Overreaching based on TSB
- **Resting HR trend** — Recovery indicator from Garmin wellness data
- **Persistent local storage** — Data cached in IndexedDB, survives page reloads
- **Modular architecture** — Each service is independent; add new modules without touching existing code

## Architecture

```
src/
├── services/
│   ├── intervals.js      # Intervals.icu REST API connector
│   ├── strava.js          # Strava OAuth 2.0 + REST API
│   ├── garmin.js          # Garmin bridge (via Intervals.icu) + FIT upload (planned)
│   ├── analytics.js       # "Zero-inference" pre-computation engine
│   └── persistence.js     # IndexedDB storage (localForage)
├── components/
│   ├── Dashboard.js       # Main overview with metrics + mini PMC
│   ├── PMCChart.js        # Full Performance Management Chart
│   ├── Activities.js      # Activity list with sort/filter
│   ├── WeeklyLoad.js      # Weekly training volume chart
│   └── Settings.js        # Connection management
└── styles/
    └── app.css            # Design system (CSS variables)
```

### The "Zero-Inference" Principle

The analytics engine (`analytics.js`) pre-computes all metrics and trend assessments
**before** they reach the UI (or, in the future, the AI coach). The AI never analyzes
raw data — it interprets pre-calculated trends. This ensures:

1. Deterministic, reproducible analysis
2. The LLM cannot hallucinate data patterns
3. Clear separation between computation and interpretation

### Data Flow

```
Garmin Device → Garmin Connect → Intervals.icu → CoachCenter API calls → analytics.js → UI
                                       ↑
                                  (also receives Strava data if linked)
```

## Setup

### Prerequisites

- Node.js 18+ and npm
- An [Intervals.icu](https://intervals.icu) account (free)
- Optional: A [Strava API application](https://www.strava.com/settings/api)

### Local Development

```bash
git clone https://github.com/YOUR_USERNAME/coach-center.git
cd coach-center
npm install
npm start
```

Open http://localhost:3000 and go to Settings to configure your connections.

### Intervals.icu Setup

1. Go to [intervals.icu/settings](https://intervals.icu/settings)
2. Scroll to **Developer Settings**
3. Copy your **Athlete ID** (visible in your profile URL, e.g., `i12345`)
4. Generate an **API Key**
5. Enter both in CoachCenter Settings

### Strava Setup (Optional)

1. Go to [strava.com/settings/api](https://www.strava.com/settings/api)
2. Create an application (any name)
3. Set **Authorization Callback Domain** to `localhost` (for dev) or your GitHub Pages domain
4. Copy **Client ID** and **Client Secret**
5. Enter in CoachCenter Settings, then click "Connect Strava"

### Garmin Connect Setup

Garmin's official API requires business-level approval and a server backend.
For a static SPA, Garmin data flows through Intervals.icu:

1. In Intervals.icu Settings, link your Garmin Connect account
2. All Garmin data (activities, HR, sleep, weight, HRV) syncs automatically
3. CoachCenter reads it via the Intervals.icu API

## Deploy to GitHub Pages

### Option 1: GitHub Actions (recommended)

1. Push the repo to GitHub
2. Go to **Settings → Pages → Source → GitHub Actions**
3. The included `.github/workflows/deploy.yml` builds and deploys automatically on push to `main`

### Option 2: Manual

```bash
# In package.json, set "homepage" to your GitHub Pages URL:
# "homepage": "https://YOUR_USERNAME.github.io/coach-center"

npm run build
npx gh-pages -d build
```

## API Endpoints Used

### Intervals.icu (verified from official docs + forum)

| Endpoint | Data | Used For |
|----------|------|----------|
| `GET /api/v1/athlete/{id}` | FTP, weight, zones | Athlete profile |
| `GET /api/v1/athlete/{id}/wellness` | icu_ctl, icu_atl, restingHR, weight, sleep | PMC + wellness |
| `GET /api/v1/athlete/{id}/activities` | training_load, avg watts, avg HR, EF | Activity analysis |
| `GET /api/v1/activity/{id}/streams.json` | watts, heartrate, cadence streams | Decoupling analysis |
| `GET /api/v1/athlete/{id}/events` | Planned workouts with target loads | Compliance scoring |

### Strava

| Endpoint | Data | Used For |
|----------|------|----------|
| `GET /api/v3/athlete` | Profile | Athlete info |
| `GET /api/v3/athlete/activities` | Activities summary | Activity list |
| `GET /api/v3/activities/{id}/streams` | Power, HR, cadence streams | Stream analysis |

## Security Notes

- All credentials are stored **locally** in your browser's IndexedDB
- Intervals.icu API key uses Basic Auth over HTTPS
- Strava uses OAuth 2.0 with short-lived tokens (6h expiry, auto-refresh)
- **No data is sent to any third-party server** beyond the direct API calls
- API keys are never committed to the repository

## Planned Modules

### AI Coach (next phase)

The `ai-coach.js` service module is designed but not yet implemented. It will:

1. Accept a pre-computed `coachContext` JSON from `analytics.js`
2. Send it to the Claude API with the system prompt:
   > "You are a skeptical, elite-level cycling coach. You prioritize aerobic
   > efficiency and glycogen sparing. If the user's Decoupling (Pwr:HR) exceeds
   > 5% on an endurance ride, be critical and suggest more Z2 focus. Ignore
   > running volume unless it impacts cycling recovery."
3. User enters their own Claude API key in Settings (client-side, no proxy needed)
4. Conversation history persists in IndexedDB

### Other Planned Features

- **FIT file parser** — Direct Garmin FIT file upload and analysis
- **Decoupling chart** — Per-activity stream analysis with split visualization
- **Power curve** — Season comparison via Intervals.icu power-curves endpoint
- **Training plan compliance** — Planned vs actual overlay chart
- **Export to JSON** — Full coach context export for external analysis

## Scientific Basis

The metrics and thresholds used in this app are grounded in established sports science:

- **PMC model**: Banister, E.W. (1991). Modeling elite athletic performance.
- **TSS / NP / IF**: Coggan, A.R. & Allen, H. (2010). *Training and Racing with a Power Meter*. VeloPress.
- **Efficiency Factor**: Coggan & Allen (2010) — EF = NP / avg HR as aerobic fitness proxy.
- **Decoupling**: Friel, J. (2009). *The Cyclist's Training Bible*. VeloPress. Pwr:HR drift >5% indicates insufficient aerobic base.
- **Polarized training / load monitoring**: Seiler, S. & Tønnessen, E. (2009). Intervals, thresholds, and long slow distance. *Sportscience*, 13, 32–53.
- **Acute:Chronic Workload Ratio**: Gabbett, T.J. (2016). The training-injury prevention paradox. *BJSM*, 50(5), 273-280.

## License

MIT
