You are helping me build **SuperCode** — a personal AI agent inspired by the OpenClaw project (formerly ClawdBot/Moltbot) and from claude code and gmeini cli.

## 📖 Your First Task

Before writing any code, familiarize yourself with the OpenClaw project:

- Read the OpenClaw GitHub repo (`github.com/steipete/openclaw`) to understand its architecture: messaging channels, agentic tool loop, memory system, skills, proactive heartbeat
- Understand what it does well: multi-LLM support, persistent memory, voice, 700+ community skills, proactive check-ins
- Understand its weaknesses: exposed web server (42K+ instances found public), untrusted community skills (341 found malicious), per-token API costs ($500–$5K/mo reported), massive codebase that users clone but never read

---

## 🏗️ What We're Building

A **lean, secure, fully-understood** version of the same concept. Not a fork — built from scratch so I understand every line.

### Architecture Principles

| Principle | Detail |
| --- | --- |
| **TypeScript** | ES modules, modular folder structure |
| **Security by default** | Telegram user ID whitelist, `.env` secrets only, no hardcoded keys |
| **Agentic loop** | LLM can call tools, get results, call more tools (max iterations with safety limit) |
| **MCP for integrations** | Model Context Protocol servers instead of community skill files. No untrusted code. |
| **Local-first** | Everything runs on my machine. Data never leaves unless I explicitly connect an external service. |

### Core Tech Stack

| Package | Purpose |
| --- | --- |
| `@anthropic-ai/sdk` | Claude (primary LLM) |
and also the antropc agent sdk
| `better-sqlite3`  • FTS5 | Persistent memory |
| `openai` SDK | Whisper transcription |
| ElevenLabs API | Text-to-speech |
| `tsx` | Dev runner, TypeScript strict mode |

### 🔒 Security Requirements (Non-Negotiable)

> ⚠️ These are hard requirements. Never compromise on any of these.
> 
1. **User ID whitelist** — only respond to my Telegram user ID. Silently ignore everyone else.
3. **Secrets in `.env` only** — never in code, never in memory files, never in logs.
4. **Tool safety** —  Max iteration limit on the agent loop.
---

## 🚀 Build Approach

We'll build this in levels. Start with Level 1 and I'll tell you when to move to the next.

- Level 1 — Foundation
    
     LLM + basic agent loop (and tools waht the antropc aggent skd has as it defult tools )
    
- Level 2 — Memory
    
    Persistent memory (SQLite + FTS5 + memory tools)
    
- Level 3 — Tools
    
    Tools + MCP bridge (shell, files, external services)
    
- Level 4 — Heartbeat
    
    Proactive morning briefing, scheduled check-ins
    

---

> 🟢 **Start with Level 1.** Generate the full project structure so I can run `npm install && npm run dev` immediately.
>