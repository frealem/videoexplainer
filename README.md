# VideoExplainer 🎬🧠

> **VideoExplainer** is a modern, full-stack video and media intelligence platform that turns YouTube, TikTok, and Instagram content into an interactive knowledge base. Paste any video link, extract transcripts and metadata automatically, organize insights into topic-specific containers, and converse with your media in natural language using Google Gemini AI.

---

## 🌟 Executive Summary & Client Overview

### What is VideoExplainer?
VideoExplainer bridges the gap between passive video watching and active learning. Instead of scrubbing through a 45-minute YouTube tutorial or endless social media clips to find a specific recommendation:
1. **Input any link or clip**: VideoExplainer automatically fetches transcripts, summaries, key timestamps, and topic tags.
2. **Organize into custom Knowledge Containers**: Group videos by subject (e.g., *Frontend Engineering*, *System Design*, *Fitness Guides*, *Creator Playbooks*).
3. **Chat directly with the video library**: Ask targeted questions like *"What specific database indexing strategy was recommended in the tech talk?"* or *"Summarize the 3 key steps to implement OAuth"*.
4. **Instant Chrome Extension companion**: Query the video you're currently watching on YouTube directly from your browser toolbar without switching tabs.
5. **Modern, Responsive UX**: Includes light/dark theme switching, responsive sidebar navigation, streaming responses, and hybrid offline/online persistence.

---

## 🏗️ Technical Architecture & System Design

```
                     ┌──────────────────────────────────────────────┐
                     │          Client Applications                 │
                     │  • React 19 SPA (Vite + Tailwind CSS v4)     │
                     │  • VideoExplainer Chrome Extension (MV3)     │
                     └──────────────────────┬───────────────────────┘
                                            │ HTTP / JSON REST APIs
                                            ▼
                     ┌──────────────────────────────────────────────┐
                     │          Node.js Express Backend             │
                     │  • TypeScript (`server/index.ts`)            │
                     │  • Port 3000 (Vite Middleware in Dev)        │
                     └───────┬──────────────────────┬───────────────┘
                             │                      │
             ┌───────────────┴────────┐    ┌────────┴───────────────┐
             ▼                        ▼    ▼                        ▼
     ┌──────────────┐         ┌───────────────┐             ┌───────────────┐
     │ YouTube Data │         │ Google Gemini │             │  Persistence  │
     │ & Subtitles  │         │ Model Engine  │             │ • MongoDB     │
     │ Scrapers     │         │ (@google/     │             │ • LocalStorage│
     └──────────────┘         │  genai)       │             │   Fallback    │
                              └───────────────┘             └───────────────┘
```

### Key Components
- **Frontend Layer**: React 19, TypeScript, Lucide Icons, Tailwind CSS v4, and Framer Motion for smooth transitions.
- **Backend / API Gateway**: Express.js REST API handling video extraction, transcript scraping, semantic search, and streaming AI chat.
- **Companion Chrome Extension**: Manifest V3 extension with active-tab querying and server synchronization.
- **Dual Storage Engine**: Full persistence in MongoDB Atlas when configured, with seamless client-side `localStorage` caching so the app works out of the box with zero external database dependencies.

---

## 🚀 Beginner Developer Guide: Detailed Build & Run Process

This section breaks down everything a developer needs to know—from how code compiles to how requests flow through the system.

### 1. Prerequisites
- **Node.js**: v18.0.0 or later (v20+ or v22+ recommended). Run `node -v` to check.
- **npm**: v9.0.0 or later. Run `npm -v` to check.
- **Gemini API Key**: Free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).

### 2. Project Directory Structure
```
video-explainer/
├── chrome-extension/       # Companion Chrome browser extension (Manifest V3)
│   ├── manifest.json       # Browser extension manifest & permissions
│   ├── popup.html          # Extension UI layout
│   ├── popup.js            # Tab detection & server API client
│   └── README.md           # Extension installation guide
├── public/                 # Static assets (favicons, Web App Manifest)
├── server/                 # Express backend source code (TypeScript)
│   ├── db.ts               # MongoDB Mongoose models & connection manager
│   ├── gemini.ts           # Google GenAI client instance & secret resolver
│   ├── index.ts            # REST API endpoints, routing & Vite dev middleware
│   ├── scrapers.ts         # YouTube transcript & metadata scraper pipelines
│   └── utils.ts            # Helper formatting & text parsing utilities
├── src/                    # Client React application source code
│   ├── components/         # Reusable UI components (Sidebar, Chat, ClipList, Theme)
│   ├── context/            # React context providers (ThemeContext)
│   ├── services/           # Client-side API caller & DB sync utilities
│   ├── App.tsx             # Root application component & layout
│   └── main.tsx            # React DOM client entry point
├── server.ts               # Full-stack production/dev dispatch entrypoint
├── package.json            # Scripts and project dependencies
├── tsconfig.json           # TypeScript compiler configuration
└── vite.config.ts          # Vite build & bundler configuration
```

### 3. Step-by-Step Installation

#### Step A: Clone the repository
```bash
git clone https://github.com/your-username/video-explainer.git
cd video-explainer
```

#### Step B: Install dependencies
```bash
npm install
```
This reads `package.json` and installs all runtime and developer packages into `node_modules`.

#### Step C: Configure environment variables
Create a `.env` file in the project root:
```bash
cp .env.example .env
```
Open `.env` and provide your Gemini API key:
```ini
GEMINI_API_KEY="your-api-key-here"
APP_URL="http://localhost:3000"

# Optional: MongoDB connection string for cloud storage across devices
# MONGODB_URI="mongodb+srv://<user>:<password>@cluster0.example.mongodb.net/videoexplainer"
```

---

### 4. Development Workflow (`npm run dev`)

To launch the project in development mode:
```bash
npm run dev
```

#### How it works under the hood:
1. `package.json` runs `tsx server.ts`.
2. `server.ts` identifies that the environment is in development mode and dynamically boots the Express app defined in `server/index.ts`.
3. Express mounts **Vite's development server** as a middleware (`vite.middlewares`).
4. Vite compiles TypeScript and TSX files on the fly into native ES modules in milliseconds.
5. The combined server starts on port `3000` (`http://localhost:3000`).
6. All `/api/*` endpoints are handled directly by Express, and all front-end route requests fall through to Vite.

---

### 5. Production Build Process (`npm run build`)

To build the application for deployment:
```bash
npm run build
```

#### What happens during the build:
1. **Frontend Compilation (`vite build`)**:
   - Compiles and bundles all React components in `src/`.
   - Processes CSS using the Tailwind CSS engine.
   - Treeshakes unused code, minifies JavaScript and CSS, and writes optimized static output into `dist/` (`dist/index.html`, `dist/assets/*.js`, `dist/assets/*.css`).
2. **Backend Bundling (`esbuild`)**:
   - `esbuild server/index.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs`
   - Bundles the TypeScript backend into a single CommonJS file (`dist/server.cjs`) with source maps.
   - Treats node runtime packages (`express`, `dotenv`, etc.) as external, keeping the build lightning fast (< 200ms).

---

### 6. Starting the Production Server (`npm start`)

Once built, start the production server with:
```bash
npm start
```
- This runs `node server.ts`.
- `server.ts` automatically detects the compiled `dist/server.cjs` file and executes the pre-bundled server.
- In production, Express serves the static assets directly from the `dist/` directory and responds to all API calls.

---

### 7. Code Quality & Type Checking
To verify types across the codebase without compiling:
```bash
npm run lint
```
This executes `tsc --noEmit` and checks every TypeScript interface, function signature, and import for syntax and type safety.

---

## 🔌 API Reference & Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/containers` | Fetch all user containers and their associated video clips |
| `POST` | `/api/containers` | Create a new video knowledge container |
| `POST` | `/api/clips` | Extract metadata/transcripts and add a new clip |
| `DELETE`| `/api/clips/:id` | Remove a clip from a container |
| `POST` | `/api/chat` | Send a prompt to Gemini with container video context |
| `POST` | `/api/chat-stream` | Stream chat completions chunk-by-chunk for instant feedback |
| `GET` | `/api/db-status` | Verify MongoDB connection status and fallback readiness |

---

## 🧩 Installing the Companion Chrome Extension

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable the **"Developer mode"** toggle in the top-right corner.
3. Click the **"Load unpacked"** button in the top-left corner.
4. Select the `chrome-extension` directory inside this repository.
5. Pin the **VideoExplainer** icon in your toolbar.
6. Open any YouTube video and click the extension icon to start asking questions!

---

## 🛡️ Security & Best Practices

- **Zero Client-Side Secret Exposure**: All Gemini API calls are proxied through the Express backend; API keys are never bundled into the client-side JavaScript.
- **Defensive Fallbacks**: If external scraping or transcription encounters restrictions, the backend automatically cascades to metadata resolution and grounding heuristics so users never experience application crashes.
- **Strict Typing**: Pure TypeScript implementation across both client and server domains.

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
