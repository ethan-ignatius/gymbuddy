import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import OpenAI from "openai";
import { getUserByPhone, prisma } from "../lib/db.js";
import { handleConversation, startOnboarding } from "../lib/conversation.js";
import { generateWorkoutPlan } from "../lib/workoutPlan.js";

export const chatRouter = Router();
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

type RagChunk = {
  text: string;
  source?: string;
  page?: number;
  chunk?: number;
};
type RagHit = { source?: string; page?: number | null };

let ragManifestCache: Record<string, RagChunk> | null = null;
const execFileAsync = promisify(execFile);

async function loadRagManifest(): Promise<Record<string, RagChunk>> {
  if (ragManifestCache) return ragManifestCache;
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const manifestPath = path.resolve(__dirname, "../../health_pdfs/.rag_manifest.json");
  const raw = await fs.readFile(manifestPath, "utf8");
  ragManifestCache = JSON.parse(raw) as Record<string, RagChunk>;
  return ragManifestCache;
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2);
}

function retrieveRagChunks(question: string, topK = 4): RagChunk[] {
  if (!ragManifestCache) return [];
  const qTokens = tokenize(question);
  if (qTokens.length === 0) return [];
  const qSet = new Set(qTokens);

  const scored = Object.values(ragManifestCache)
    .map((chunk) => {
      const text = chunk.text ?? "";
      const lower = text.toLowerCase();
      let score = 0;
      for (const t of qSet) {
        if (lower.includes(t)) score += 1;
      }
      // boost common fitness/health query terms when exact terms appear more than once
      for (const t of qSet) {
        const count = lower.split(t).length - 1;
        if (count > 1) score += Math.min(2, count - 1) * 0.25;
      }
      return { chunk, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored.map((s) => s.chunk);
}

function buildRagContext(chunks: RagChunk[]): string {
  return chunks
    .map((c, i) => {
      const source = c.source ? `${c.source}${c.page ? ` p.${c.page}` : ""}` : "unknown source";
      return `[${i + 1}] ${source}\n${(c.text ?? "").slice(0, 1200)}`;
    })
    .join("\n\n");
}

function summarizeUserContextForDashboard(user: Awaited<ReturnType<typeof prisma.user.findUnique>>): string {
  if (!user) return "No user profile available.";
  const plan = generateWorkoutPlan(user);
  const blockNames = plan.blocks.map((b) => b.name).join(", ");
  return [
    `Goal: ${user.goal}`,
    `Height: ${user.heightCm} cm`,
    `Weight: ${user.weightKg} kg`,
    `Preferred days: ${user.preferredDays ?? "not set"}`,
    `Preferred time: ${user.preferredTime ?? "not set"}`,
    `Gym travel time: ${user.gymTravelMin} min`,
    `Onboarding step: ${user.onboardingStep}`,
    `Plan blocks: ${blockNames || "none"}`,
  ].join("\n");
}

async function retrieveRagViaPython(question: string): Promise<{
  context: string;
  hits: RagHit[];
  source: "actian-python" | "manifest-fallback";
  diagnostics?: Record<string, unknown>;
}> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const backendDir = path.resolve(__dirname, "../..");
  const scriptPath = path.resolve(backendDir, "scripts", "rag_query.py");
  const pythonBin = process.env.PYTHON_BIN || "python";

  try {
    const { stdout } = await execFileAsync(pythonBin, [scriptPath, question], {
      cwd: backendDir,
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
    });
    const lines = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const last = lines[lines.length - 1];
    if (!last) throw new Error("No output from rag_query.py");
    const parsed = JSON.parse(last) as {
      ok?: boolean;
      context?: string;
      hits?: Array<{ source?: string; page?: number | null }>;
      diagnostics?: Record<string, unknown>;
      error?: string;
    };
    if (!parsed.ok) {
      throw new Error(parsed.error || "rag_query.py reported failure");
    }
    return {
      context: parsed.context || "",
      hits: parsed.hits || [],
      source: "actian-python",
      diagnostics: parsed.diagnostics,
    };
  } catch (err) {
    console.warn("[dashboard-rag] Python/Actian retrieval failed, using manifest fallback:", err);
    const chunks = retrieveRagChunks(question, 4);
    return {
      context: buildRagContext(chunks),
      hits: chunks.map((c) => ({ source: c.source, page: c.page ?? null })),
      source: "manifest-fallback",
      diagnostics: undefined,
    };
  }
}

function dedupeRagHits(hits: RagHit[]): RagHit[] {
  const seen = new Set<string>();
  const out: RagHit[] = [];
  for (const h of hits) {
    const key = `${h.source ?? "unknown"}|${h.page ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

/**
 * GET /api/chat/messages?phone=+1...
 * Returns conversation history for the web simulator.
 */
chatRouter.get("/messages", async (req, res) => {
  const phone = req.query.phone as string | undefined;
  if (!phone) return res.status(400).json({ error: "phone required" });

  const user = await getUserByPhone(phone);
  if (!user) return res.json({ messages: [], user: null });

  return res.json({
    messages: messageLog.get(user.id) ?? [],
    user: { id: user.id, email: user.email, goal: user.goal, onboardingStep: user.onboardingStep },
  });
});

/**
 * POST /api/chat/send
 * Simulates user sending an SMS. Same logic as /webhooks/sms.
 */
chatRouter.post("/send", async (req, res) => {
  const phone = req.body.phone as string | undefined;
  const body = req.body.message as string | undefined;

  if (!phone || !body) {
    return res.status(400).json({ error: "phone and message required" });
  }

  const user = await getUserByPhone(phone);
  if (!user) {
    return res.status(404).json({ error: "User not found. Sign up first." });
  }

  // Log the user message
  logMessage(user.id, "user", body);

  // Process through conversation engine
  await handleConversation(user, body);

  // Fetch updated user
  const updated = await prisma.user.findUnique({ where: { id: user.id } });

  return res.json({
    messages: messageLog.get(user.id) ?? [],
    user: updated ? { id: updated.id, email: updated.email, goal: updated.goal, onboardingStep: updated.onboardingStep } : null,
  });
});

/**
 * POST /api/chat/start-onboarding
 * Triggers the welcome message for a user.
 */
chatRouter.post("/start-onboarding", async (req, res) => {
  const phone = req.body.phone as string | undefined;
  if (!phone) return res.status(400).json({ error: "phone required" });

  const user = await getUserByPhone(phone);
  if (!user) return res.status(404).json({ error: "User not found" });

  await startOnboarding(user);

  return res.json({
    messages: messageLog.get(user.id) ?? [],
  });
});

/**
 * POST /api/chat/dashboard-assistant
 * Conversational assistant for the dashboard chat panel, with lightweight RAG from indexed health PDFs.
 */
chatRouter.post("/dashboard-assistant", async (req, res) => {
  const message = String(req.body?.message ?? "").trim();
  const userId = req.body?.userId as string | undefined;
  const email = req.body?.email as string | undefined;

  if (!message) return res.status(400).json({ error: "message required" });

  try {
    // Lazy-load manifest; if missing, continue without RAG.
    if (!ragManifestCache) {
      try {
        await loadRagManifest();
      } catch {
        ragManifestCache = {};
      }
    }

    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId } })
      : email
        ? await prisma.user.findUnique({ where: { email: String(email).trim().toLowerCase() } })
        : null;

    let rag = await retrieveRagViaPython(message);
    let ragHits = dedupeRagHits(rag.hits);
    let ragContext = rag.context;
    const userContext = summarizeUserContextForDashboard(user);
    const diag = rag.diagnostics ?? {};
    const diagSummary =
      rag.source === "actian-python"
        ? ` endpoint=${String(diag["endpoint"] ?? "n/a")} collection=${String(diag["collection"] ?? "n/a")} ` +
          `exists=${String(diag["collection_exists"] ?? "unknown")} count=${String(diag["collection_count"] ?? "unknown")} ` +
          `openai=${String(diag["openai_client"] ?? "unknown")} cortex=${String(diag["cortex_client"] ?? "unknown")}`
        : "";

    if (rag.source === "actian-python" && ragHits.length === 0) {
      // Recheck with manifest fallback so the UI can still show citations while diagnosing Actian retrieval.
      const fallbackChunks = retrieveRagChunks(message, 4);
      if (fallbackChunks.length > 0) {
        rag = {
          source: "manifest-fallback",
          hits: fallbackChunks.map((c) => ({ source: c.source, page: c.page ?? null })),
          context: buildRagContext(fallbackChunks),
          diagnostics: rag.diagnostics,
        };
        ragHits = dedupeRagHits(rag.hits);
        ragContext = rag.context;
        console.warn(
          `[dashboard-rag] actian-zero-hits but manifest fallback found ${ragHits.length} hit(s).` +
            diagSummary
        );
      }
    }

    console.log(
      `[dashboard-rag] source=${rag.source} hits=${ragHits.length}${diagSummary} ` +
      `${ragHits.map((h) => `${h.source ?? "unknown"}${h.page ? `:p${h.page}` : ""}`).join(", ")}`
    );

    if (!openai) {
      return res.json({
        reply: rag.hits.length
          ? `I found matching health references from ${rag.source}, but OPENAI_API_KEY is not configured for response generation.`
          : "OpenAI is not configured yet.",
        ragHits: ragHits.map((c) => ({ source: c.source ?? "unknown", page: c.page ?? null })),
        ragSource: rag.source,
        usedRag: Boolean(ragContext.trim()),
      });
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are GymBuddy's dashboard coach. Be conversational, slightly sassy, concise, and useful. " +
            "Use the retrieved health PDF context when relevant. If the question is medical or injury-related, give cautious general guidance and suggest consulting a clinician for diagnosis. " +
            "If context is insufficient, say so clearly. Keep replies to 3-6 sentences.",
        },
        {
          role: "system",
          content: `User profile and plan context:\n${userContext}`,
        },
        {
          role: "system",
          content: ragContext
            ? `Retrieved health references (RAG context):\n${ragContext}`
            : "No retrieved health PDF context matched this question.",
        },
        { role: "user", content: message },
      ],
      temperature: 0.6,
    });

    const reply = completion.choices[0]?.message?.content?.trim() || "I couldn't generate a reply right now.";
    return res.json({
      reply,
      ragHits: ragHits.map((c) => ({ source: c.source ?? "unknown", page: c.page ?? null })),
      ragSource: rag.source,
      usedRag: Boolean(ragContext.trim()),
    });
  } catch (err) {
    console.error("Dashboard assistant error:", err);
    return res.status(500).json({
      error: "Dashboard assistant failed",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

// In-memory message log for the web simulator
const messageLog = new Map<string, { role: "user" | "bot"; text: string; time: string }[]>();

export function logMessage(userId: string, role: "user" | "bot", text: string) {
  if (!messageLog.has(userId)) {
    messageLog.set(userId, []);
  }
  messageLog.get(userId)!.push({
    role,
    text,
    time: new Date().toLocaleTimeString(),
  });
}
