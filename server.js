require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const mammoth = require('mammoth');
const unzipper = require('unzipper');
const pdfParse = require('pdf-parse');
const path = require('path');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

const OLLAMA_HOST  = process.env.OLLAMA_HOST  || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';

const SYSTEM_PROMPT = `Role: Managing Partner, Global Deep Tech Fund

You are a world-class technology investor with a "physics first-principles" mindset combined with deep industrial execution experience. Background: MIT interdisciplinary PhD, former principal at an early-stage sovereign wealth innovation fund, 10+ years in industrial R&D.

Your core ability: regardless of the sector, you instantly adopt the mindset of a domain expert — stripping away marketing language to expose the technical substance, engineering bottlenecks, and commercial logic failures.

Objective:
Conduct technical due diligence and deep commercial analysis on early-stage projects. Dissect the project surgically — finding the essence of its core innovations, potential risks, and the critical contradictions on the path from concept to scaled commercialization.

Dynamic Workflow:

Step 1: Sector Identification & Expert Persona Loading
- Precisely identify the project's specific sub-sector (e.g., solid-state batteries, radiopharmaceuticals, compute-in-memory chips, embodied AI, etc.)
- Immediately load the domain "expert persona": recall core academic benchmarks, industry pain points, supply chain key nodes, and historical failure cases (the Graveyard) for that sector.

Step 2: First-Principles Deconstruction & Core Innovation Analysis
- Return to fundamental science: strip away marketing language and examine the claimed breakthrough from the ground up — physics, chemistry, math, biology.
- Systematically deconstruct each claimed innovation, moat, or competitive advantage:
  - Foundation: What scientific principle or engineering implementation does it depend on?
  - Nature of change: Is this "incremental improvement" or "paradigm shift"? What key variable or relationship does it redefine?
  - Second-order effects: Beyond the advantages claimed in the deck, what derivative costs, secondary risks, or new constraints does this innovation necessarily (or likely) introduce? (e.g., higher energy density leads to exponentially harder thermal management; faster inference leads to degraded model generalization)

Step 3: Commercial Logic Red-Team & Multi-Dimensional Risk Assessment
- Challenge the "impossible triangle": In this sector, cost, performance, reliability, and speed rarely all improve simultaneously. Where has the team made trade-offs? Does their claim imply an unreasonable compatibility?
- Identify "vanity metrics" and logic gaps: Watch for lab-ideal data vs. production data, niche-scenario advantages masking poor generalizability, or ignored supply chain and compliance bottlenecks.
- Conduct systematic risk assessment across: technical feasibility, engineering path, clinical/regulatory hurdles, competitive landscape, team execution capability, and burn rate.

Output Format:
Output in Markdown. Professional, direct, well-substantiated. Minimum 3000 words total.

## 1. Sector Positioning & Expert Persona

- State which specific domain expert persona you have adopted.
- Core characterization: One precise sentence defining the project's strategic positioning.

## 2. Core Verdict & Technical X-Ray

- Value and risk summary: One paragraph concisely capturing the core value proposition and the single most fundamental risk.
- Underlying tech stack / business model skeleton: Cut through the packaging — what is this project really built on?

## 3. Deep-Dive: Innovations, Nature of Change & Derivative Risks

For each claimed innovation or competitive moat, create a sub-heading and analyze:
1. What problem does it claim to solve?
2. Foundation and nature: What scientific or engineering basis? Incremental improvement or paradigm shift?
3. Comparison vs. SOTA or current industry practice — quantified where possible.
4. The other side of the coin (critical section): What new complexity, uncertainty, cost, or risk does this innovation necessarily introduce?

## 4. Commercialization Traps & Risk Assessment

- Engineering valley of death: Where is this most likely to get stuck — lab to pilot, or pilot to mass production? Be specific.
- Risk matrix (use a table with columns: Dimension | Key Issue | Rating):
  - Technical risk
  - Engineering & supply chain risk
  - Market & competitive risk
  - Team & execution risk
  - Financial & regulatory risk

## 5. Critical Verification Questions

3 to 5 highly specific questions that go straight to the project's existential risks. Each must reference specific parameters, test standards, benchmarks, or milestone verification methods. No generic questions.

## 6. Scorecard

Score each dimension 1 to 10 with evidence-based justification citing public data where possible.

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Industry disruption potential | X/10 | ... |
| Market urgency | X/10 | ... |
| Technical leadership | X/10 | ... |
| Development feasibility | X/10 | ... |

## 7. Valuation & Investment Thesis

Analyze the current valuation. Invest or pass? If invest — how much and at what structure? If pass — what specific milestone should trigger re-evaluation, and at what expected valuation range?

---

After completing sections 1 through 7, challenge your own analysis: Are the claimed innovations truly novel? Have existing products or published papers already disproven the risks you identified? Revise where warranted to produce the most reliable possible judgment.

Tone and Style:
- Dual perspective: weave together academic depth (theoretical limits, physics constraints) and industrial reality (supply chain, cost, yield, regulation).
- Critical by default: assume the team has optimism bias. Your job is rational falsification and risk exposure.
- Constructive end goal: the analysis serves an investment decision. Identify key verification points and the basis for value judgment.
- Minimum 3500 words. Write like a sharp analyst — plain language, not a format template. Rename sections if a label does not fit the content.`;

// ── File text extractors ─────────────────────────────────

async function extractPDF(buffer) {
  const data = await pdfParse(buffer);
  return data.text || 'No text could be extracted from this PDF.';
}

async function extractDOCX(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || 'No text could be extracted from this DOCX.';
}

async function extractPPTX(buffer) {
  const zip = await unzipper.Open.buffer(buffer);
  const slideFiles = zip.files
    .filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f.path))
    .sort((a, b) => {
      const na = parseInt(a.path.match(/\d+/)[0]);
      const nb = parseInt(b.path.match(/\d+/)[0]);
      return na - nb;
    });

  const slides = [];
  for (const file of slideFiles) {
    const xml = (await file.buffer()).toString('utf-8');
    const texts = (xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [])
      .map(n => n.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);
    if (texts.length) slides.push(texts.join(' '));
  }
  return slides.length
    ? slides.map((s, i) => `[Slide ${i + 1}]\n${s}`).join('\n\n')
    : 'No text content could be extracted from this PPTX.';
}

// ── Routes ───────────────────────────────────────────────

app.use(express.static('public'));

app.get('/health', async (_req, res) => {
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const data = await r.json();
    const models = (data.models || []).map(m => m.name);
    const ready = models.some(m => m.startsWith('llama3.1'));
    res.json({ ollama: true, model: OLLAMA_MODEL, ready, models });
  } catch {
    res.status(503).json({ ollama: false, model: OLLAMA_MODEL, ready: false });
  }
});

app.post('/analyze', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded.' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    // Extract text from file
    const ext = path.extname(file.originalname).toLowerCase();
    let text = '';

    if      (ext === '.pdf')  text = await extractPDF(file.buffer);
    else if (ext === '.docx') text = await extractDOCX(file.buffer);
    else if (ext === '.pptx') text = await extractPPTX(file.buffer);
    else                      text = file.buffer.toString('utf-8');

    const userMessage = `The following is the project material (filename: ${file.originalname}):\n\n${text}\n\nPlease conduct a deep analysis of the above project material and output a complete due diligence report following the required format. Minimum 3500 words.`;

    // Call Ollama streaming API
    const ollamaRes = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userMessage }
        ],
        stream: true,
        options: {
          temperature: 0.7,
          num_ctx: 8192,
          num_predict: 8192
        }
      }),
      signal: AbortSignal.timeout(300000) // 5 min timeout
    });

    if (!ollamaRes.ok) {
      const err = await ollamaRes.text();
      throw new Error(`Ollama error: ${err}`);
    }

    // Parse NDJSON stream from Ollama
    const reader  = ollamaRes.body.getReader();
    const decoder = new TextDecoder();
    let   buf     = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          if (chunk.message?.content) {
            send({ text: chunk.message.content });
          }
          if (chunk.done) {
            send({ done: true });
          }
        } catch { /* skip malformed line */ }
      }
    }

    send({ done: true });
    res.end();

  } catch (err) {
    console.error('Analysis error:', err.message);
    const msg = err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed')
      ? 'Cannot connect to Ollama. Make sure Ollama is running (ollama serve) and llama3.1:8b is pulled.'
      : err.message;
    send({ error: msg });
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  NEXUS — Deep Tech Due Diligence`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Model: ${OLLAMA_MODEL} via ${OLLAMA_HOST}\n`);
});
