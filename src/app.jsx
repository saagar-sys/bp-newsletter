import { useState, useRef } from "react";

const DEFAULT_DRAFT_PROMPT = `You are the newsletter writer for Breaking Points, a political news show. You will receive a show rundown (as CSV or plain text) and produce a newsletter following strict rules.

STRUCTURE:
- Organize by block (A Block, B Block, etc.)
- Each block has: block label, topic header, optional guest credit, summary paragraph, bullet points

CONTENT RULES:
- Summary paragraph: A Block gets 2-3 sentences. Each subsequent block should be shorter, with later blocks getting 1-2 sentences maximum
- When covering controversial topics, do not soften your language
- Bullet points: one sentence each, hard facts only
- Attribute all facts to the original outlet. Do not cite X/Twitter handles
- The entire newsletter must not exceed 1,200 words. Shorten summary paragraphs first if cuts needed
- No em dashes anywhere in the copy
- No filler phrases like "it's worth noting," "notably," or "it remains to be seen"
- Write like a smart person explaining the news, not like a press release
- Direct quotes from source material are encouraged when newsworthy

OUTPUT FORMAT:
Return JSON only. No preamble, no markdown fences. Structure:
{
  "date": "Month D, YYYY",
  "blocks": [
    {
      "label": "A BLOCK",
      "topic": "IRAN",
      "guest": null,
      "summary": "2-3 sentence summary paragraph.",
      "bullets": ["Bullet one.", "Bullet two."]
    }
  ]
}`;

const DEFAULT_SECOND_PASS_PROMPT = `You are a copy editor for Breaking Points newsletter. Review the draft and apply these checks:
1. Total word count must not exceed 1,200 words. If over, shorten summary paragraphs first, trim bullets last.
2. Remove any em dashes. Replace with commas, colons, or rewrite.
3. Remove filler phrases: "it's worth noting", "notably", "it remains to be seen", "importantly".
4. Each bullet must contain at least one hard fact (number, name, date, quote, or specific outcome).
5. No bullet should start with "The" followed by a publication name. Lead with the news.

Return the improved newsletter as JSON in exactly the same format as the input. No preamble, no markdown fences.`;

const DEFAULT_TRANSCRIPT_PROMPT = `You are the newsletter editor for Breaking Points. Given a transcript of a show segment, extract the 3-5 most newsletter-worthy quotes. Punchy, substantive, stand on their own. Return JSON only:
{
  "block": "A BLOCK",
  "topic": "IRAN",
  "quotes": [
    { "timestamp": "2:35", "text": "Quote text here." }
  ]
}`;

const CHAT_SYSTEM = `You are the newsletter editor for Breaking Points. You will receive the current newsletter as JSON and a refinement instruction. Apply the instruction and return the updated newsletter as JSON in exactly the same format. No preamble, no markdown fences, JSON only.`;

function loadPrompt(key, defaultVal) {
  try { return localStorage.getItem(key) || defaultVal; } catch { return defaultVal; }
}
function savePrompt(key, val) {
  try { localStorage.setItem(key, val); } catch {}
}

async function callClaude(messages, systemPrompt) {
  const response = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      system: systemPrompt,
      messages,
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.content[0].text;
}

function parseJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

function countWords(nl) {
  if (!nl) return 0;
  return nl.blocks.map(b => b.summary + " " + b.bullets.join(" ")).join(" ").trim().split(/\s+/).length;
}

function buildPlainText(nl) {
  const lines = ["BREAKING POINTS\nSHOW RUNDOWN NEWSLETTER\n" + nl.date];
  for (const block of nl.blocks) {
    lines.push("\n" + block.label);
    lines.push(block.topic);
    if (block.guest) lines.push("Guest: " + block.guest);
    lines.push(block.summary);
    for (const bullet of block.bullets) lines.push("* " + bullet);
  }
  return lines.join("\n");
}

const TA = {
  width: "100%", background: "#0d0d0d", border: "1px solid #1e1e1e",
  color: "#bbb", padding: "12px 14px", fontSize: 12, fontFamily: "monospace",
  resize: "vertical", borderRadius: 2, outline: "none", boxSizing: "border-box", lineHeight: 1.65,
};

function Btn({ onClick, disabled, gold, small, children, style }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? "#1a1a1a" : gold ? "#c8a96e" : "none",
      color: disabled ? "#444" : gold ? "#0a0a0a" : "#666",
      border: gold ? "none" : "1px solid #252525",
      padding: small ? "6px 12px" : "11px 24px",
      fontSize: small ? 10 : 11, fontFamily: "monospace", letterSpacing: 1.5,
      cursor: disabled ? "not-allowed" : "pointer", borderRadius: 2,
      fontWeight: gold ? 700 : 400, transition: "all 0.15s", ...(style || {}),
    }}>{children}</button>
  );
}

function Lbl({ children }) {
  return <div style={{ fontSize: 10, letterSpacing: 3, color: "#555", fontFamily: "monospace", marginBottom: 8 }}>{children}</div>;
}

function SettingsPanel({ draftPrompt, setDraftPrompt, secondPassPrompt, setSecondPassPrompt, transcriptPrompt, setTranscriptPrompt, onClose }) {
  const [local, setLocal] = useState({ draft: draftPrompt, second: secondPassPrompt, transcript: transcriptPrompt });
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setDraftPrompt(local.draft);
    setSecondPassPrompt(local.second);
    setTranscriptPrompt(local.transcript);
    savePrompt("bp_draft_prompt", local.draft);
    savePrompt("bp_second_prompt", local.second);
    savePrompt("bp_transcript_prompt", local.transcript);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  const sections = [
    { key: "draft", label: "DRAFT PROMPT", desc: "Generates the initial newsletter from your rundown.", def: DEFAULT_DRAFT_PROMPT },
    { key: "second", label: "SECOND PASS PROMPT", desc: "Runs after the draft to tighten copy. Can be toggled off on the main screen.", def: DEFAULT_SECOND_PASS_PROMPT },
    { key: "transcript", label: "QUOTE EXTRACTION PROMPT", desc: "Extracts quotes from block transcripts.", def: DEFAULT_TRANSCRIPT_PROMPT },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto" }}>
      <div style={{ background: "#0f0f0f", border: "1px solid #2a2a2a", borderRadius: 3, width: "100%", maxWidth: 700, padding: "32px 36px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 4, color: "#555", fontFamily: "monospace", marginBottom: 4 }}>SETTINGS</div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 400, color: "#e8e4dc" }}>Prompt Editor</h2>
          </div>
          <Btn small onClick={onClose}>CLOSE</Btn>
        </div>
        <div style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 2, padding: "10px 14px", marginBottom: 22 }}>
          <p style={{ margin: 0, fontSize: 11, color: "#555", fontFamily: "monospace", lineHeight: 1.7 }}>
            Edit prompts here to refine output over time. Changes persist in this browser. To share with your team, update the defaults in the code and redeploy.
          </p>
        </div>
        {sections.map(({ key, label, desc, def }) => (
          <div key={key} style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <Lbl>{label}</Lbl>
              <button onClick={() => setLocal(l => ({ ...l, [key]: def }))}
                style={{ background: "none", border: "none", color: "#3a3a3a", fontSize: 10, fontFamily: "monospace", cursor: "pointer", letterSpacing: 1 }}>
                RESET DEFAULT
              </button>
            </div>
            <p style={{ margin: "0 0 7px", fontSize: 11, color: "#444", fontFamily: "monospace" }}>{desc}</p>
            <textarea value={local[key]} onChange={e => setLocal(l => ({ ...l, [key]: e.target.value }))}
              style={{ ...TA, height: 180 }} />
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn small onClick={onClose}>CANCEL</Btn>
          <Btn gold small onClick={handleSave}>{saved ? "SAVED" : "SAVE CHANGES"}</Btn>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState(() => loadPrompt("bp_draft_prompt", DEFAULT_DRAFT_PROMPT));
  const [secondPassPrompt, setSecondPassPrompt] = useState(() => loadPrompt("bp_second_prompt", DEFAULT_SECOND_PASS_PROMPT));
  const [transcriptPrompt, setTranscriptPrompt] = useState(() => loadPrompt("bp_transcript_prompt", DEFAULT_TRANSCRIPT_PROMPT));

  const [csvText, setCsvText] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [runningSecondPass, setRunningSecondPass] = useState(false);
  const [newsletter, setNewsletter] = useState(null);
  const [draftError, setDraftError] = useState("");
  const [editingBlock, setEditingBlock] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [secondPassEnabled, setSecondPassEnabled] = useState(true);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef();

  const [transcriptBlock, setTranscriptBlock] = useState("");
  const [transcriptText, setTranscriptText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [quotes, setQuotes] = useState(null);
  const [transcriptError, setTranscriptError] = useState("");

  const wordCount = countWords(newsletter);
  const warnColor = wordCount > 1200 ? "#ef4444" : wordCount > 1050 ? "#f59e0b" : "#22c55e";

  async function handleGenerateDraft() {
    if (!csvText.trim()) return;
    setDrafting(true);
    setDraftError("");
    setNewsletter(null);
    setChatHistory([]);
    try {
      const raw = await callClaude([{ role: "user", content: "Here is the show rundown:\n\n" + csvText }], draftPrompt);
      let parsed = parseJSON(raw);
      if (secondPassEnabled) {
        setDrafting(false);
        setRunningSecondPass(true);
        try {
          const refined = await callClaude([{ role: "user", content: "Here is the draft:\n\n" + JSON.stringify(parsed, null, 2) }], secondPassPrompt);
          parsed = parseJSON(refined);
        } catch {}
        setRunningSecondPass(false);
      }
      setNewsletter(parsed);
      setChatHistory([
        { role: "user", content: "[rundown]\n" + csvText },
        { role: "assistant", content: JSON.stringify(parsed) },
      ]);
    } catch (e) {
      setDraftError(e.message);
    }
    setDrafting(false);
    setRunningSecondPass(false);
  }

  async function handleChat() {
    if (!chatInput.trim() || !newsletter) return;
    setChatLoading(true);
    setChatError("");
    const userMsg = chatInput.trim();
    setChatInput("");
    const condensedHistory = [
      { role: "user", content: "[rundown]\n" + csvText },
      { role: "assistant", content: JSON.stringify(newsletter) },
      { role: "user", content: userMsg }
    ];
    try {
      const raw = await callClaude(condensedHistory, CHAT_SYSTEM);
      const parsed = parseJSON(raw);
      setNewsletter(parsed);
setChatHistory(prev => [...prev, { role: "user", content: userMsg }, { role: "assistant", content: JSON.stringify(parsed) }]);    } catch (e) {
      setChatError(e.message);
    }
    setChatLoading(false);
  }

  async function handleExtractQuotes() {
    if (!transcriptText.trim()) return;
    setExtracting(true);
    setTranscriptError("");
    setQuotes(null);
    try {
      const prompt = transcriptBlock ? "Block: " + transcriptBlock + "\n\nTranscript:\n" + transcriptText : "Transcript:\n" + transcriptText;
      const raw = await callClaude([{ role: "user", content: prompt }], transcriptPrompt);
      setQuotes(parseJSON(raw));
    } catch (e) {
      setTranscriptError(e.message);
    }
    setExtracting(false);
  }

  function updateBlock(idx, field, value) {
    setNewsletter(nl => ({ ...nl, blocks: nl.blocks.map((b, i) => i === idx ? { ...b, [field]: value } : b) }));
  }
  function updateBullet(bi, ji, value) {
    setNewsletter(nl => ({ ...nl, blocks: nl.blocks.map((b, i) => i === bi ? { ...b, bullets: b.bullets.map((bul, j) => j === ji ? value : bul) } : b) }));
  }
  function removeBullet(bi, ji) {
    setNewsletter(nl => ({ ...nl, blocks: nl.blocks.map((b, i) => i === bi ? { ...b, bullets: b.bullets.filter((_, j) => j !== ji) } : b) }));
  }

  const statusMsg = drafting ? "GENERATING DRAFT..." : runningSecondPass ? "RUNNING SECOND PASS..." : null;
  const chatTurns = chatHistory.slice(2).filter((_, i) => i % 2 === 0);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", fontFamily: "Georgia, serif", color: "#e8e4dc" }}>
      {showSettings && (
        <SettingsPanel
          draftPrompt={draftPrompt} setDraftPrompt={setDraftPrompt}
          secondPassPrompt={secondPassPrompt} setSecondPassPrompt={setSecondPassPrompt}
          transcriptPrompt={transcriptPrompt} setTranscriptPrompt={setTranscriptPrompt}
          onClose={() => setShowSettings(false)}
        />
      )}

      <div style={{ borderBottom: "1px solid #1a1a1a", padding: "20px 40px", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 4, color: "#555", fontFamily: "monospace", marginBottom: 3 }}>BREAKING POINTS</div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 400, color: "#e8e4dc" }}>Newsletter Generator</h1>
        </div>
        <Btn small onClick={() => setShowSettings(true)}>PROMPTS</Btn>
      </div>

      <div style={{ display: "flex", borderBottom: "1px solid #161616", padding: "0 40px" }}>
        {["Draft Newsletter", "Extract Quotes"].map((tab, i) => (
          <button key={i} onClick={() => setActiveTab(i)} style={{
            background: "none", border: "none",
            borderBottom: activeTab === i ? "2px solid #c8a96e" : "2px solid transparent",
            color: activeTab === i ? "#c8a96e" : "#444",
            padding: "12px 16px 10px", fontSize: 12, fontFamily: "monospace",
            letterSpacing: 1, cursor: "pointer", marginBottom: -1,
          }}>{tab}</button>
        ))}
      </div>

      <div style={{ padding: "32px 40px", maxWidth: 840, margin: "0 auto" }}>

        {activeTab === 0 && (
          <div>
            <div style={{ marginBottom: 18 }}>
              <Lbl>RUNDOWN INPUT</Lbl>
              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <Btn small onClick={() => fileInputRef.current.click()}>UPLOAD CSV</Btn>
                <input ref={fileInputRef} type="file" accept=".csv,.txt"
                  onChange={e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setCsvText(ev.target.result); r.readAsText(f); }}
                  style={{ display: "none" }} />
                <span style={{ fontSize: 11, color: "#3a3a3a", alignSelf: "center", fontFamily: "monospace" }}>or paste below</span>
              </div>
              <textarea value={csvText} onChange={e => setCsvText(e.target.value)}
                placeholder="Paste your CSV rundown here..."
                style={{ ...TA, height: 130 }} />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
              <Btn gold onClick={handleGenerateDraft} disabled={drafting || runningSecondPass || !csvText.trim()}>
                {statusMsg || "GENERATE DRAFT"}
              </Btn>
              <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 10, fontFamily: "monospace", color: "#444", letterSpacing: 1.5 }}>
                <input type="checkbox" checked={secondPassEnabled} onChange={e => setSecondPassEnabled(e.target.checked)} style={{ accentColor: "#c8a96e" }} />
                SECOND PASS
              </label>
            </div>

            {draftError && <div style={{ marginBottom: 14, color: "#ef4444", fontSize: 11, fontFamily: "monospace" }}>Error: {draftError}</div>}

            {newsletter && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, padding: "9px 13px", background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 2 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 9, fontFamily: "monospace", color: "#444", letterSpacing: 2 }}>WORDS</span>
                    <span style={{ fontSize: 13, fontFamily: "monospace", color: warnColor, fontWeight: 700 }}>{wordCount} / 1200</span>
                  </div>
                  <Btn small onClick={() => { navigator.clipboard.writeText(buildPlainText(newsletter)); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                    {copied ? "COPIED" : "COPY ALL"}
                  </Btn>
                </div>

                <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 22, marginBottom: 28 }}>
                  <div style={{ textAlign: "center", marginBottom: 24, paddingBottom: 18, borderBottom: "1px solid #161616" }}>
                    <div style={{ fontSize: 9, letterSpacing: 5, color: "#444", fontFamily: "monospace" }}>BREAKING POINTS</div>
                    <div style={{ fontSize: 10, letterSpacing: 2, color: "#3a3a3a", fontFamily: "monospace", marginTop: 3 }}>SHOW RUNDOWN NEWSLETTER</div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 5, fontFamily: "monospace" }}>{newsletter.date}</div>
                  </div>

                  {newsletter.blocks.map((block, i) => (
                    <div key={i} style={{ marginBottom: 28, paddingBottom: 28, borderBottom: i < newsletter.blocks.length - 1 ? "1px solid #131313" : "none" }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ fontSize: 9, letterSpacing: 3, color: "#444", fontFamily: "monospace" }}>{block.label}</span>
                        <button onClick={() => setEditingBlock(editingBlock === i ? null : i)}
                          style={{ background: "none", border: "none", color: "#3a3a3a", fontSize: 10, fontFamily: "monospace", cursor: "pointer", letterSpacing: 1 }}>
                          {editingBlock === i ? "DONE" : "EDIT"}
                        </button>
                      </div>

                      {editingBlock === i
                        ? <input value={block.topic} onChange={e => updateBlock(i, "topic", e.target.value)}
                            style={{ background: "#111", border: "1px solid #2a2a2a", color: "#e8e4dc", fontSize: 17, fontWeight: 700, padding: "4px 8px", width: "100%", fontFamily: "Georgia, serif", borderRadius: 2, marginBottom: 8, boxSizing: "border-box" }} />
                        : <h2 style={{ margin: "0 0 5px", fontSize: 18, fontWeight: 700, color: "#e8e4dc" }}>{block.topic}</h2>
                      }

                      {block.guest && <div style={{ color: "#666", fontStyle: "italic", fontSize: 12, marginBottom: 9 }}>Guest: {block.guest}</div>}

                      {editingBlock === i
                        ? <textarea value={block.summary} onChange={e => updateBlock(i, "summary", e.target.value)} rows={4}
                            style={{ ...TA, fontSize: 13, marginBottom: 10 }} />
                        : <p style={{ margin: "0 0 10px", fontSize: 13, lineHeight: 1.8, color: "#999" }}>{block.summary}</p>
                      }

                      <ul style={{ margin: 0, padding: "0 0 0 16px" }}>
                        {block.bullets.map((bullet, j) => (
                          <li key={j} style={{ marginBottom: 7, fontSize: 12, lineHeight: 1.7, color: "#777" }}>
                            {editingBlock === i
                              ? <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                                  <textarea value={bullet} onChange={e => updateBullet(i, j, e.target.value)} rows={2}
                                    style={{ ...TA, flex: 1, fontSize: 12 }} />
                                  <button onClick={() => removeBullet(i, j)}
                                    style={{ background: "none", border: "none", color: "#3a3a3a", cursor: "pointer", fontSize: 16, padding: "3px 4px" }}>x</button>
                                </div>
                              : bullet
                            }
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 22 }}>
                  <Lbl>REFINE WITH INSTRUCTIONS</Lbl>
                  <p style={{ margin: "0 0 12px", fontSize: 11, color: "#3a3a3a", fontFamily: "monospace", lineHeight: 1.65 }}>
                    e.g. "make the Iran block shorter" / "cut to hit word count" / "lead every bullet with the news, not the outlet name"
                  </p>

                  {chatTurns.length > 0 && (
                    <div style={{ marginBottom: 10, maxHeight: 150, overflowY: "auto", padding: "10px 12px", background: "#0d0d0d", border: "1px solid #161616", borderRadius: 2 }}>
                      {chatTurns.map((msg, i) => (
                        <div key={i} style={{ marginBottom: 6 }}>
                          <span style={{ fontSize: 9, color: "#c8a96e", fontFamily: "monospace", letterSpacing: 1 }}>YOU  </span>
                          <span style={{ fontSize: 11, color: "#666" }}>{msg.content}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10 }}>
                    <textarea
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChat(); } }}
                      placeholder="Type an instruction and press Enter..."
                      style={{ ...TA, flex: 1, height: 66 }}
                    />
                    <Btn gold onClick={handleChat} disabled={chatLoading || !chatInput.trim()} style={{ alignSelf: "flex-end", minWidth: 60 }}>
                      {chatLoading ? "..." : "SEND"}
                    </Btn>
                  </div>
                  {chatError && <div style={{ marginTop: 7, color: "#ef4444", fontSize: 11, fontFamily: "monospace" }}>Error: {chatError}</div>}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 1 && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <Lbl>BLOCK LABEL (OPTIONAL)</Lbl>
              <input value={transcriptBlock} onChange={e => setTranscriptBlock(e.target.value)}
                placeholder="e.g. A BLOCK - IRAN"
                style={{ ...TA, height: "auto", padding: "10px 14px", fontSize: 13 }} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <Lbl>TRANSCRIPT</Lbl>
              <textarea value={transcriptText} onChange={e => setTranscriptText(e.target.value)}
                placeholder="Paste the block transcript here..."
                style={{ ...TA, height: 210 }} />
            </div>
            <Btn gold onClick={handleExtractQuotes} disabled={extracting || !transcriptText.trim()}>
              {extracting ? "EXTRACTING..." : "EXTRACT QUOTES"}
            </Btn>

            {transcriptError && <div style={{ marginTop: 12, color: "#ef4444", fontSize: 11, fontFamily: "monospace" }}>Error: {transcriptError}</div>}

            {quotes && (
              <div style={{ marginTop: 28 }}>
                <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid #161616" }}>
                  <span style={{ fontSize: 9, letterSpacing: 3, color: "#444", fontFamily: "monospace" }}>
                    {quotes.block || "QUOTES"}{quotes.topic ? " - " + quotes.topic : ""}
                  </span>
                </div>
                {quotes.quotes.map((q, i) => (
                  <div key={i} style={{ background: "#0d0d0d", border: "1px solid #161616", borderRadius: 2, padding: "13px 15px", marginBottom: 9, position: "relative" }}>
                    <div style={{ fontSize: 9, color: "#444", fontFamily: "monospace", letterSpacing: 1, marginBottom: 6 }}>[{q.timestamp}]</div>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.8, color: "#bbb", fontStyle: "italic" }}>"{q.text}"</p>
                    <button onClick={() => navigator.clipboard.writeText('"' + q.text + '"')} style={{
                      position: "absolute", top: 10, right: 10, background: "none", border: "1px solid #1e1e1e",
                      color: "#3a3a3a", padding: "3px 9px", fontSize: 9, fontFamily: "monospace", letterSpacing: 1, cursor: "pointer", borderRadius: 2,
                    }}>COPY</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
