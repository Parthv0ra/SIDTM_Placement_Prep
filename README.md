# PlacementPrep - SIDTM (AI-Powered Mock Interview Platform)

PlacementPrep is an AI-powered mock interview practice platform designed specifically for SIDTM placement preparation. The application parses candidate resumes and matches them against target job descriptions (JDs) to generate tailored, context-aware technical and behavioral mock interview sessions. It records video/audio responses, transcribes them, and evaluates candidate performance using a multi-dimensional AI scoring system.

---

## 🚀 Key Features

*   **Shortlist Evaluator**:
    *   Upload/paste candidate resumes and target job descriptions (JDs).
    *   AI-powered ATS matching score, matching/missing skill mapping, and course/certification recommendations.
    *   Detailed AI suitability verdict.
*   **Guesstimates & Cases Workspace**:
    *   Standalone practice dashboard populated with 44 cases from **verified prep sources** (across Profitability, Market Entry, Pricing, Growth, and Miscellaneous frameworks).
    *   Smooth-scroll details panel and dynamic practice scratchpad environment.
    *   Quick estimation guidelines (population demographic breakdown drivers, device replacement lifecycle calculations, and formula templates).
    *   **AI Voice Integration (Speech-to-Text):** Click-to-record voice input inside the clarifying questions feed. Captures local audio stream and transcribes it using high-accuracy **Groq Whisper** (`whisper-large-v3`) in real-time, working reliably across all modern desktop and mobile browsers.
*   **Dual Resume Upload**: Upload resumes as PDF/DOCX or paste text directly. The AI performs an initial analysis, scoring quality and extracting key skills.
*   **Job Description Extraction**: Drag and drop PDF, DOCX, or TXT JDs. The system extracts requirements using AI to compare with the candidate's profile.
*   **Dynamic Interview Generation**: Automatically creates mock interviews matching the candidate's resume against the target company and role.
*   **Real-time Mock Interview Interface**:
    *   Webcam and microphone feed capture.
    *   Per-question timers and automated transcriptions.
    *   Interactive question progression.
*   **Multi-Dimensional Scorecard**: Detailed feedback evaluation criteria on:
    *   *Communication* & *Fluency*
    *   *Structure* & *Confidence*
    *   *Relevance* & *Correctness*
*   **Faculty & Admin Portal**: Allows reviewers and supervisors to check student progress and analyze placement readiness.
*   **Interview History**: Historic logs of all previous practice sessions to track performance progression.

---

## 🛠️ Technology Stack

*   **Frontend & Routing**: [TanStack Start](https://tanstack.com/router/v1/docs/start/overview) (Full-stack React framework with SSR and file-based routing)
*   **Database & Auth**: [Supabase](https://supabase.com/) (PostgreSQL, Storage buckets for Resumes, and GoTrue Auth)
*   **Styling & UI**: [Tailwind CSS](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/) (Radix UI primitives), [Lucide React](https://lucide.dev/) (Icons)
*   **Development Tools**: [Vite](https://vite.dev/), [TypeScript](https://www.typescriptlang.org/), [Bun](https://bun.sh/) (Packager / Runtime)

---

## 📁 Directory Structure

```text
├── .lovable/              # Lovable configuration metadata
├── public/                # Static public assets
├── src/
│   ├── components/        # Reusable UI components (shadcn/ui and layout shells)
│   │   ├── ui/            # Base UI primitives (buttons, dialogs, inputs, etc.)
│   │   └── AppShell.tsx   # Authenticated layout sidebar and header wrapper
│   ├── hooks/             # Custom React hooks
│   ├── integrations/      # Third-party integrations
│   │   └── supabase/      # Supabase clients, typings, and auth middlewares
│   ├── lib/               # Utility functions & AI Gateway server-functions
│   ├── routes/            # File-based routes (TanStack Router)
│   │   ├── _authenticated/# Protected routes
│   │   │   ├── admin.tsx               # Reviewer management interface
│   │   │   ├── dashboard.tsx           # Student home panel
│   │   │   ├── guesstimate.$id.tsx     # Active case study scratchpad workspace
│   │   │   ├── guesstimates.tsx        # Case studies index and guidelines
│   │   │   ├── history.tsx             # Student previous runs log
│   │   │   ├── shortlist-evaluator.tsx # Resume matching JD evaluator
│   │   │   ├── new.tsx                 # Launch new mock interview
│   │   │   └── scorecard.$id.tsx       # AI response grading scorecard
│   │   ├── auth.tsx       # Auth portal (Login / Register)
│   │   ├── index.tsx      # Public landing page
│   │   └── __root.tsx     # App wrapper and viewport shell
│   ├── styles.css         # Global stylesheets and Tailwind inputs
│   └── start.ts / server.ts  # TanStack Start entry points
├── supabase/              # Supabase schema definitions and DB migrations
├── package.json           # Scripts and dependencies
└── tsconfig.json          # TypeScript configurations
```

---

## 💻 Local Setup & Installation

### Prerequisites

*   [Bun](https://bun.sh/) installed on your machine (recommended, or `npm` / `pnpm` / `yarn`).
*   A running **Supabase** instance, a **Gemini** API key, and a **Groq** API key.

### Setup Steps

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/Parthv0ra/SIDTM_Placement_Prep.git
    cd SIDTM_Placement_Prep
    ```

2.  **Install Dependencies**:
    ```bash
    bun install
    # or npm install
    ```

3.  **Environment Variables**:
    Create a `.env` file in the root directory and populate it with your local development environment keys (do not commit this file to GitHub):
    ```env
    VITE_SUPABASE_URL=your_supabase_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
    GEMINI_API_KEY=your_gemini_api_key
    GROQ_API_KEY=your_groq_api_key
    ```

4.  **Run Development Server**:
    ```bash
    bun run dev
    # or npm run dev
    ```
    Your application will be live at `http://localhost:3000`.

5.  **Build for Production**:
    To create an optimized production build:
    ```bash
    bun run build
    # or npm run build
    ```
