```markdown
<div align="center">

# 🌌 J.A.R.V.I.S. OS
### The AI-Native Mobile & Workstation Operating System

[![GitHub Repo](https://img.shields.io/badge/GitHub-argokul028--alone%2FJarvis__os-00f0ff?style=for-the-badge&logo=github)](https://github.com/argokul028-alone/Jarvis_os)
[![Built with React 19](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Gemini AI](https://img.shields.io/badge/Google%20GenAI-Gemini%204%20%2F%203.1-8E75B2?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Cloud%20Sync-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)

*A commercial-grade, capability-based AI operating system environment designed from first principles—featuring the **Aegis Microkernel**, **Helios Window Manager**, **NovaFS**, **Synapse Neural Engine**, **Real Linux PTY Shell**, and an **Iron Man-inspired Spatial HUD**.*

[Explore Repository](https://github.com/argokul028-alone/Jarvis_os) · [Report Bug](https://github.com/argokul028-alone/Jarvis_os/issues) · [Request Feature](https://github.com/argokul028-alone/Jarvis_os/issues)

</div>

---

## 📖 Overview

**J.A.R.V.I.S. OS** (`Jarvis_os`) is a full-stack, AI-native operating system environment built with **React 19, TypeScript, Express, Python PTY workers, Firebase, and the Google GenAI SDK**. Rather than treating AI as an external chatbot, J.A.R.V.I.S. OS embeds neural intelligence directly into the window manager, terminal shell, web browser, filesystem, and hardware telemetry layers.

### 🔄 Multi-Form-Factor Operating Modes
Switch seamlessly at runtime between four distinct interface paradigms:
1. **Spatial HUD Mode (`spatial_hud`)** — Translucent, tactical glassmorphic Iron Man HUD with ambient telemetry and floating spatial windows.
2. **Desktop Continuum Mode (`desktop_continuum`)** — Full multi-window workstation layout with top status bar, app dock, snapping, and z-index focus management.
3. **Mobile Handheld Mode (`mobile_handheld`)** — Touch-first adaptive viewport designed for mobile devices and compact screens.
4. **Specs Explorer Mode (`specs_explorer`)** — Deep-dive architectural documentation and kernel engineering specification reader.

---

## ✨ Core Subsystems & Built-in Applications

J.A.R.V.I.S. OS ships with **13 integrated system applications** orchestrated by the **Helios Window Manager**:

| Application | Module | Description |
| :--- | :--- | :--- |
| **🎙️ Jarvis Voice Reactor** | `JarvisVoiceReactor.tsx` | Natural-language voice & text command center with speech synthesis (`audio-fx.ts`), intent resolution (`app-launcher.ts`), and custom app shortcut creation. |
| **💻 Cloud Linux PTY Terminal** | `TerminalApp.tsx` + `pty-shell-worker.py` | Multi-tab, split-pane terminal backed by a persistent Linux PTY (`/dev/pts/N`) worker with ANSI rendering, tab completion, command history, and sandboxed `sudo` privilege mode. |
| **🌐 JARVIS AI Browser** | `JarvisBrowserApp.tsx` | Full-featured browser with Private Mode, Google Search grounding, server-side page proxy, AI page summarization, translation, and **Firebase Firestore** sync for bookmarks, history, and extensions. |
| **📂 NovaFS Explorer** | `NovaFsApp.tsx` | Capability-aware virtual filesystem explorer with wear-level telemetry and storage management (`novafs-engine.ts`). |
| **🧠 Synapse Neural Engine** | `SynapseNeuralApp.tsx` | Local/cloud neural inference benchmark and token-throughput analyzer with CSpace capability validation. |
| **👁️ Vision Grounding HUD** | `VisionGroundingApp.tsx` | Real-time webcam computer-vision HUD supporting **HUD**, **Thermal**, and **Wireframe** tactical overlays with target lock tracking. |
| **📊 Kernel & Telemetry Monitor** | `KernelMonitorApp.tsx` | Real-time CPU load, NPU TOPS, RAM/ZRAM compression (`memory-budget.ts`), thermal sensors, and thread scheduler monitor (`aegis-scheduler.ts`). |
| **🔐 Vault Security** | `VaultSecurityApp.tsx` | Capability-based security ring status, CSpace token inspection, and zero-trust hardware isolation controls. |
| **💿 Standalone ISO Builder** | `IsoBuilderApp.tsx` | Generates and downloads a complete `live-build` Debian Bookworm + Wayland (`cage`) + PipeWire + ZRAM bootable ISO build script tailored for lightweight workstations (e.g., Lenovo E41-25, 4GB RAM). |
| **📡 Network & Wi-Fi Manager** | `NetworkSettingsApp.tsx` | Live Linux network interface (`nmcli` / `iw` / `ip route`) scanner, Wi-Fi radio toggle, passphrase validator, and DNS inspector. |
| **⚙️ System & Power Settings** | `SystemSettingsApp.tsx` | Power profiles (`Power Saver`, `Balanced`, `Performance`), 80% battery charge limiter, notification settings, and OS theme controls. |
| **🔔 Notification Center** | `NotificationManagerPanel.tsx` | Slide-over notification drawer with Do Not Disturb (DND), Flight Mode toggle, and hardware quick-control tiles. |
| **📘 OS Specs Reader** | `SpecsExplorerApp.tsx` | Interactive architectural specification viewer detailing the microkernel, IPC, memory, and hardware abstraction layers. |

---

## 🏗️ System Architecture

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React 19 + Tailwind v4)                   │
│  ┌──────────────────────┐  ┌─────────────────────┐  ┌───────────────────┐  │
│  │ Helios Window Mgr    │  │ Voice Reactor & HUD │  │ JARVIS Browser    │  │
│  │ (Drag/Resize/Z-Idx)  │  │ (Intent + WebAudio) │  │ (AI Proxy/Sync)   │  │
│  └──────────┬───────────┘  └──────────┬──────────┘  └─────────┬─────────┘  │
└─────────────┼─────────────────────────┼───────────────────────┼────────────┘
              │ REST / JSON Streams     │                       │ Firebase SDK
              ▼                         ▼                       ▼
┌───────────────────────────────────────────────────────┐  ┌─────────────────┐
│              BACKEND (Express + tsx Server)           │  │ Cloud Firestore │
│  • /api/gemini/chat (Gemini 4 Hydrogen / 3.1 Fallback)│  │ • Bookmarks     │
│  • /api/browser/*   (Search, Proxy, Translate, Summ.) │  │ • History       │
│  • /api/system/*    (Live OS CPU/RAM/Temp Telemetry)  │  │ • User Settings │
│  • /api/network/*   (nmcli / iw Linux Wi-Fi Control)  │  └─────────────────┘
│  • /api/terminal/*  (PTY Session & Sudo Auth Bridge)  │
└───────────────────────────┬───────────────────────────┘
                            │ JSON-Lines IPC over stdio
                            ▼
┌───────────────────────────────────────────────────────┐
│        LINUX PTY SHELL WORKER (pty-shell-worker.py)   │
│  • Allocates real Linux /dev/pts/N pseudo-terminals   │
│  • Irreversible privilege drop (initgroups/setuid)    │
│  • Live cwd, UID, and ANSI output streaming           │
└───────────────────────────────────────────────────────┘

```

---

## 📂 Project Structure

```text
Jarvis_os/
├── server.ts                         # Express API server, Gemini AI router & PTY bridge
├── scripts/
│   └── pty-shell-worker.py           # Persistent Linux PTY worker with privilege isolation
├── src/
│   ├── App.tsx                       # Root OS state, power phases, Wi-Fi & window lifecycle
│   ├── main.tsx                      # React 19 entry point
│   ├── index.css                     # Spatial HUD glassmorphism & custom utility styles
│   ├── firebase.ts                   # Firebase Auth & Firestore client initialization
│   ├── types/
│   │   └── os.ts                     # Core OS, Window, Telemetry, Wi-Fi & Browser types
│   ├── hooks/
│   │   └── useBrowserCloudSync.ts    # Real-time Firestore bookmark/history/settings sync
│   ├── data/
│   │   └── specs-data.ts             # Architectural specification dataset
│   ├── components/
│   │   ├── HeliosWindowManager.tsx   # Multi-window desktop & spatial compositor
│   │   ├── TopBar.tsx                # System status bar, telemetry pills & mode switcher
│   │   ├── Dock.tsx                  # Application launcher dock
│   │   ├── JarvisVoiceReactor.tsx    # AI voice/chat assistant & app intent dispatcher
│   │   ├── TerminalApp.tsx           # Multi-tab split-pane Linux terminal UI
│   │   ├── JarvisBrowserApp.tsx      # AI-powered web browser with cloud sync
│   │   ├── BrowserSidePanel.tsx      # AI page summarizer, translator & reader drawer
│   │   ├── WebPortalApp.tsx          # Embedded YouTube & web app sub-window portal
│   │   ├── NovaFsApp.tsx             # Virtual filesystem interface
│   │   ├── VisionGroundingApp.tsx    # Webcam HUD with thermal & wireframe filters
│   │   ├── SynapseNeuralApp.tsx      # Neural token throughput benchmark tool
│   │   ├── KernelMonitorApp.tsx      # Live CPU, ZRAM, NPU & thread monitor
│   │   ├── VaultSecurityApp.tsx      # Zero-trust capability & security dashboard
│   │   ├── IsoBuilderApp.tsx         # Bootable Linux ISO generator UI
│   │   ├── NetworkSettingsApp.tsx    # Wi-Fi & network interface configurator
│   │   ├── SystemSettingsApp.tsx     # Power mode, battery & OS preferences
│   │   ├── NotificationManagerPanel.tsx # Notification center & quick-toggle drawer
│   │   ├── PowerOverlay.tsx          # Sleep, restart & shutdown transition overlays
│   │   ├── SpecsExplorerApp.tsx      # Full-screen OS engineering specs explorer
│   │   └── ErrorBoundary.tsx         # Fault-tolerant subsystem error boundary
│   └── utils/
│       ├── aegis-scheduler.ts        # Quantum thread & priority scheduler logic
│       ├── memory-budget.ts          # ZRAM & memory allocation calculator
│       ├── novafs-engine.ts          # Virtual filesystem node & wear-level engine
│       ├── app-launcher.ts           # Natural-language intent-to-app/media resolver
│       ├── browser-engine.ts         # URL normalization, search & proxy helpers
│       ├── power-network.ts          # Battery metrics & Wi-Fi state management
│       ├── notification-manager.ts   # Notification queue & DND state engine
│       ├── terminal-ansi.ts          # ANSI escape sequence parser
│       ├── terminal-sudo-parser.ts   # Privilege escalation command parser
│       ├── terminal-tabs.ts          # Multi-tab & split-pane terminal state helpers
│       ├── linux-wifi-parser.ts      # nmcli, iw & resolv.conf output parsers
│       └── audio-fx.ts               # Web Audio API HUD sound effects & TTS voice
├── firebase-blueprint.json           # Firestore schema definitions
├── firestore.rules                   # Firestore security rules
├── package.json                      # Dependencies & npm scripts
├── tsconfig.json                     # TypeScript configuration
└── vite.config.ts                    # Vite bundler configuration

```

---

## 🚀 Getting Started

### Prerequisites

* **Node.js** `v20+` (or **Bun**)
* **Python 3** `v3.10+` (required on Linux/macOS for `scripts/pty-shell-worker.py` in the Terminal app)
* A **Google Gemini API Key** from [Google AI Studio](https://aistudio.google.com/)

### 1. Clone the Repository

```bash
git clone [https://github.com/argokul028-alone/Jarvis_os.git](https://github.com/argokul028-alone/Jarvis_os.git)
cd Jarvis_os

```

### 2. Install Dependencies

```bash
npm install

```

### 3. Configure Environment Variables

Copy `.env.example` to `.env` and add your credentials:

```bash
cp .env.example .env

```

Edit `.env`:

```env
GEMINI_API_KEY="your_google_gemini_api_key_here"
APP_URL="http://localhost:3000"
JARVIS_SUDO_PASSWORD="jarvis"

```

### 4. Start the OS Server

```bash
npm run dev

```

Open **`http://localhost:3000`** in your browser to boot into **J.A.R.V.I.S. OS**.

---

## 📜 Available Scripts

| Command | Action |
| --- | --- |
| `npm run dev` | Launches the Express backend + Vite dev middleware on port `3000` |
| `npm start` | Starts the production server via `tsx server.ts` |
| `npm run build` | Compiles the frontend bundle into `dist/` using Vite |
| `npm run preview` | Previews the built production bundle |
| `npm run lint` | Runs TypeScript type checking (`tsc --noEmit`) |
| `npm run clean` | Removes `dist` and compiled server artifacts |

---

## 🔌 API Endpoints Overview

The Express backend (`server.ts`) exposes REST endpoints powering the OS subsystems:

* **AI & Grounding:** `POST /api/gemini/chat` (automatic model fallback between `gemini-4-hydrogen` and `gemini-3.1-flash-lite` with quota cooldown protection)
* **Browser & Web Proxy:** `GET /api/browser/search`, `GET /api/browser/fetch-page`, `GET /api/browser/proxy`, `POST /api/browser/translate`, `POST /api/browser/summarize`
* **Media Resolution:** `GET /api/media/youtube-resolve`
* **System & ISO Builder:** `GET /api/system/telemetry`, `GET /api/scripts/download-iso-builder`
* **Linux Wi-Fi Stack:** `GET /api/network/status`, `POST /api/network/wifi/radio`, `POST /api/network/wifi/connect`, `POST /api/network/wifi/disconnect`, `POST /api/network/wifi/forget`
* **PTY Terminal Engine:** `POST /api/terminal/session`, `POST /api/terminal/exec`, `POST /api/terminal/complete`, `POST /api/terminal/sudo-auth`, `POST /api/terminal/kill`, `DELETE /api/terminal/session/:id`

---

## 🛡️ Security & Privacy Architecture

* **Sandboxed Non-Root PTY Execution:** `scripts/pty-shell-worker.py` supports dropping kernel privileges via `initgroups`, `setgid`, and `setuid` for non-root user shell sessions.
* **Firestore Ownership Rules:** `firestore.rules` enforces strict per-user UID isolation across `/users/{userId}/bookmarks`, `/history`, and `/settings`.
* **Private Browsing Mode:** `browser_private` sessions bypass Firestore history logging and isolate session state.

---

## 🤝 Contributing

1. Fork the repository (`https://github.com/argokul028-alone/Jarvis_os`)
2. Create a feature branch (`git checkout -b feature/neural-module`)
3. Commit your changes (`git commit -m 'Add new neural subsystem'`)
4. Push to the branch (`git push origin feature/neural-module`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See LICENSE for more information.


