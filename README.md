
# DataVault Agent

DataVault Agent is a full-stack app for querying CSV/Excel datasets in plain English using multiple LLM providers.

You can upload datasets, ask questions in natural language, view agent reasoning steps, and explore results as tables or charts.

## Features

- Natural-language querying over uploaded data
- Agent step trace (`GetColumns`, `QuerySheet`, `ExecuteFinalQuery`, etc.)
- Dynamic result visualizations (bar, line, area, pie)
- Multi-provider LLM support
- User authentication (signup/signin with JWT)
- Dataset persistence in MongoDB
- Query history and settings persistence per user
- Lazy loading and in-memory caching for dataset file content

## Tech Stack

- Frontend: React 18, TypeScript, Vite, Tailwind, shadcn/ui, Zustand, React Query, Recharts
- Backend: Node.js, Express, MongoDB, JWT, bcrypt
- Data formats: CSV, XLSX, XLS

## Project Structure

```txt
datavault-ai-suite/
  server/
    app.js
    index.js
    db.js
    middleware/
    routes/
  src/
    components/
    lib/
    pages/
    stores/
```

## Quick Start

1. Clone the repository

```bash
git clone <your-repo-url>
cd datavault-ai-suite
```

2. Install dependencies

```bash
npm install
```

3. Configure backend database

- Update MongoDB connection in `server/db.js` (`uri` constant) to your own cluster.
- Optional env vars:
  - `PORT` (default: `3001`)
  - `JWT_SECRET` (default fallback exists, but set your own in production)
  - `FRONTEND_URL` (used in CORS checks)

4. Start frontend + backend together

```bash
npm run dev:full
```

5. Open the app

- Frontend: `http://localhost:8080`
- Backend health: `http://localhost:3001/api/health`

## Available Scripts

- `npm run dev` -> start Vite frontend
- `npm run server` -> start Express API server
- `npm run dev:full` -> run frontend + backend concurrently
- `npm run build` -> production build
- `npm run preview` -> preview production build
- `npm run lint` -> run ESLint
- `npm run test` -> run Vitest tests

## API Overview

Base URL (local): `http://localhost:3001/api`

- `POST /auth/signup`
- `POST /auth/signin`
- `POST /auth/signout`
- `GET /datasets`
- `POST /datasets`
- `GET /datasets/:id/data`
- `DELETE /datasets/:id`
- `GET /history`
- `POST /history`
- `DELETE /history`
- `GET /settings`
- `PUT /settings`
- `PUT /settings/profile`
- `GET /health`

## Supported LLM Providers

- Groq
- OpenAI
- Anthropic
- AWS Bedrock
- Azure OpenAI
- Cohere
- Mistral
- Together AI
- Ollama
- Hugging Face

Provider/model selection and API keys are managed in the app Settings.

### Getting API Keys

**Hugging Face:**
1. Go to [Hugging Face](https://huggingface.co)
2. Create an account or sign in
3. Navigate to Settings → Access Tokens ([huggingface.co/settings/tokens](https://huggingface.co/settings/tokens))
4. Create a new token with "read" or "write" permissions for Inference API
5. Copy the token and paste it in Settings → LLM Providers → Hugging Face

**Available Hugging Face Models via Inference API:**
- `Qwen/Qwen2.5-Coder-32B-Instruct` - Powerful coding model
- `meta-llama/Llama-2-70b-chat-hf` - Meta's Llama 2 70B
- `mistralai/Mistral-7B-Instruct-v0.2` - Mistral 7B
- `zai-org/GLM-4.5` - GLM reasoning model

**Note:** Hugging Face Inference API supports all OpenAI-compatible chat models. You can add any model ID from the Hugging Face Model Hub as a custom model option.

## Notes and Limits

- MongoDB document size limit is 16 MB. Very large uploaded files may fail to persist full `fileData`.
- Query history stores lightweight metadata only; full step payloads/results are kept client-side.

## Security Checklist Before Publishing

- Remove hardcoded credentials from `server/db.js` and use environment variables.
- Rotate any exposed MongoDB credentials immediately.
- Set a strong `JWT_SECRET` in production.
- Restrict CORS origins in `server/app.js` for production domains.

## Deployment

- Frontend is Vite-based and can be deployed to Vercel/Netlify/static hosting.
- Backend is an Express API and should be deployed where Node.js + MongoDB connectivity are available.

## License

Add your preferred license here (for example, MIT).
