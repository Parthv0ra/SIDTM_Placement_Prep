# PlacementPrep - SIDTM (AI-Powered Mock Interview Platform)

PlacementPrep is an AI-powered mock interview practice platform designed specifically for SIDTM placement preparation. The application parses candidate resumes and matches them against target job descriptions (JDs) to generate tailored, context-aware technical and behavioral mock interview sessions. It records video/audio responses, transcribes them, and evaluates candidate performance using a multi-dimensional AI scoring system.

---

## 🚀 Key Features

- **Shortlist Evaluator**:
  - Upload/paste candidate resumes and target job descriptions (JDs) or choose standard industry roles.
  - Supports domain-specific categorization: **BFSI**, **Consulting**, **IT/ITES**, and **Marketing** with pre-defined JDs.
  - AI-powered ATS matching score, matching/missing skill mapping, and targeted course/certification recommendations.
  - Detailed AI suitability verdict and step-by-step preparation action plan.
- **Guesstimates & Cases Workspace**:
  - Standalone practice dashboard populated with 44 cases from **verified prep sources** (across Profitability, Market Entry, Pricing, Growth, and Miscellaneous frameworks).
  - Smooth-scroll details panel and dynamic practice scratchpad environment.
  - Quick estimation guidelines (population demographic breakdown drivers, device replacement lifecycle calculations, and formula templates).
  - **AI Voice Integration (Speech-to-Text):** Click-to-record voice input inside the clarifying questions feed. Captures local audio stream and transcribes it using high-accuracy **Groq Whisper** (`whisper-large-v3`) in real-time, working reliably across all modern desktop and mobile browsers.
- **Dual Resume Upload**: Upload resumes as PDF/DOCX or paste text directly. The AI performs an initial analysis, scoring quality and extracting key skills.
- **Job Description Extraction**: Drag and drop PDF, DOCX, or TXT JDs. The system extracts requirements using AI to compare with the candidate's profile.
- **Dynamic Interview Generation**: Automatically creates mock interviews matching the candidate's resume against the target company and role.
- **Real-time Mock Interview Interface**:
  - Webcam and microphone feed capture.
  - Per-question timers and automated transcriptions.
  - Interactive question progression.
- **Multi-Dimensional Scorecard**: Detailed feedback evaluation criteria on:
  - _Communication_ & _Fluency_
  - _Structure_ & _Confidence_
  - _Relevance_ & _Correctness_
- **Faculty & Admin Portal**: Allows reviewers and supervisors to check student progress, view detailed shortlisting evaluations, and analyze placement readiness.
- **Interview History**: Historic logs of all previous practice sessions to track performance progression.

---

## 🛠️ Technology Stack

- **Frontend & Routing**: [TanStack Start](https://tanstack.com/router/v1/docs/start/overview) (Full-stack React 19 framework with SSR and file-based routing)
- **Database & Auth**: [Supabase](https://supabase.com/) (PostgreSQL, Row Level Security, Storage buckets for Resumes, and GoTrue Auth)
- **Styling & UI**: [Tailwind CSS v4](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/) (Radix UI primitives), [Lucide React](https://lucide.dev/) (Icons)
- **Development Tools**: [Vite](https://vite.dev/), [TypeScript](https://www.typescriptlang.org/), [Bun](https://bun.sh/) (Packager / Runtime)

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
│   │   └── supabase/      # Supabase client initialization, database typings, and auth middlewares
│   ├── lib/               # Utility functions & AI Gateway server-functions
│   │   ├── ai-gateway.server.ts # Server function interfacing with Gemini API & Groq Whisper
│   │   ├── interview.functions.ts # Main backend functions for candidate evaluation and shortlist checking
│   │   ├── casebook.json    # Pre-populated repository of guesstimate and framework cases (44 cases)
│   │   ├── role-jds.json    # Standard domain JDs (BFSI, Consulting, IT/ITES, Marketing)
│   │   └── question-bank.json # AI interviewer default question set
│   ├── routes/            # File-based routes (TanStack Router)
│   │   ├── _authenticated/# Protected routes (wrapped with authentication check)
│   │   │   ├── route.tsx               # Auth check and layout wrapper for protected routes
│   │   │   ├── admin.tsx               # Reviewer management interface
│   │   │   ├── dashboard.tsx           # Student home panel
│   │   │   ├── guesstimate.$id.tsx     # Active case study scratchpad workspace
│   │   │   ├── guesstimates.tsx        # Case studies index and guidelines
│   │   │   ├── history.tsx             # Student previous runs log
│   │   │   ├── shortlist-evaluator.tsx # Resume matching JD evaluator
│   │   │   ├── new.tsx                 # Launch new mock interview
│   │   │   ├── interview.$id.tsx       # Active mock interview (webcam/mic, timers, and voice responses)
│   │   │   └── scorecard.$id.tsx       # AI response grading scorecard
│   │   ├── auth.tsx       # Auth portal (Login / Register)
│   │   ├── index.tsx      # Public landing page
│   │   └── __root.tsx     # App wrapper and viewport shell
│   ├── styles.css         # Global stylesheets and Tailwind inputs
│   └── start.ts / server.ts  # TanStack Start entry points
├── supabase/              # Supabase schema definitions and DB migrations
│   ├── config.toml        # Supabase configuration
│   └── migrations/        # SQL migration scripts (user roles, resumes, shortlist tables)
├── package.json           # Scripts and dependencies
└── tsconfig.json          # TypeScript configurations
```

---

## 💻 Local Setup & Installation

### Prerequisites

- [Bun](https://bun.sh/) installed on your machine (recommended, or `npm` / `pnpm` / `yarn`).
- A running **Supabase** instance, a **Gemini** API key, and a **Groq** API key.

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
    VITE_SUPABASE_URL=https://your-supabase-project.supabase.co
    VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
    SUPABASE_URL=https://your-supabase-project.supabase.co
    SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
    SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
    GEMINI_API_KEY=your_gemini_api_key
    GROQ_API_KEY=your_groq_api_key
    ```

4.  **Database Setup**:
    Apply the SQL migrations located in `supabase/migrations/` to your Supabase PostgreSQL database to create the necessary tables, relationships, and enable Row Level Security (RLS) policies.

5.  **Run Development Server**:

    ```bash
    bun run dev
    # or npm run dev
    ```

    The application will run locally with HTTPS enabled via `@vitejs/plugin-basic-ssl`.
    Your application will be live at `https://localhost:3000`.

    > [!NOTE]
    > Since the dev server is run over HTTPS using a self-signed certificate, you may see a "Your connection is not private" security warning when accessing the local site for the first time. Simply click **Advanced** -> **Proceed to localhost (unsafe)** in your browser to proceed.

6.  **Build for Production**:
    To create an optimized production build:
    ```bash
    bun run build
    # or npm run build
    ```

---

## 🎨 Linting & Formatting

To ensure consistent code styling, the project is configured with ESLint and Prettier:

- **Lint Code**:
  ```bash
  bun run lint
  ```
- **Format Code**:
  ```bash
  bun run format
  ```
