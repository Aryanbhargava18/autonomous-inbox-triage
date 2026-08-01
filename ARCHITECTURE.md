# Gravity AI: Gmail Triage Architecture (The Final Release)

This system balances the core assignment (drafting personalized replies) with realistic safety constraints. It proves you can build an agent that reasons over inbox state rather than just blindly generating text.

## 0. The Memory Schema (Storage Piece)
**Scope:** FLOW
**Keys:** 
- `processed_ids`: `{}` (O(1) dictionary for deduplication lookups)
- `style_profile`: `{ "signoff": "Best", "average_length": "short", "tone": "casual" }` (Generated on first-run from the user's last 10 sent emails)

---

## 1. Trigger
**Piece:** Gmail (New Email)

---

## 2. Deterministic Bouncer (Code Step)
**Purpose:** Prevent infinite loops and handle edge cases for $0.

```javascript
export const code = async (inputs) => {
    const emailId = inputs.email.id;
    const sender = inputs.email.from.toLowerCase();
    const subject = inputs.email.subject || "";
    const rawBody = inputs.email.textBody || "";
    const myEmail = "your.email@example.com"; 
    
    // 1. Unsupported Features (Attachments)
    if (inputs.email.hasAttachments) {
        return { action: "MANUAL_REVIEW", reason: "UNSUPPORTED_ATTACHMENT" };
    }

    // 2. O(1) Infinite Loop & Dedup Protection
    if (sender.includes(myEmail) || inputs.processed_ids[emailId]) {
        return { action: "SKIP" };
    }

    // 3. Auto-Reply / Bounce Protection
    if (sender.includes("mailer-daemon") || subject.toLowerCase().includes("automatic reply")) {
        return { action: "CLASSIFY", category: "junk" };
    }

    // 4. Content Truncation 
    const truncatedBody = rawBody.substring(0, 1000); 

    return { action: "ESCALATE", text: truncatedBody, sender: sender, original_text: rawBody };
};
```

---

## 3. The Drafter (Universal AI Piece)
*Only runs on `ESCALATE`.*

**Prompt:**
```text
You are an inbox triage system. Classify the email and draft a reply if safe to do so.

JSON Schema:
{
  "category": "urgent | needs_reply | invoice | newsletter | junk",
  "urgency_score": 1-5,
  "draft_allowed": boolean,
  "draft_reason": "Explanation of why a draft is safe or unsafe",
  "reply_draft": "The actual text of the drafted reply (if allowed, else null)"
}

Rules:
1. Drafts must match the user's style: {{Step2.style_profile}}
2. Set draft_allowed = false if the email involves financial commitments, legal threats, or complex missing context.
3. For junk, newsletter, and invoices, set draft_allowed = false and reply_draft = null.
4. Return RAW JSON only.

Email text: {{Step2.text}}
```

---

## 4. The Production Router (Code Step)
**Purpose:** Enforce deterministic safeguards (acting as a seatbelt, not semantic risk detection).

```javascript
export const code = async (inputs) => {
    if (!inputs.ai_output || inputs.ai_status === "FAILED") {
        return { action: "MANUAL_REVIEW", reason: "LLM_UNAVAILABLE" };
    }

    let ai;
    try {
        ai = JSON.parse(inputs.ai_output);
    } catch(e) {
        return { action: "MANUAL_REVIEW", reason: "PARSE_ERROR" };
    }

    // Deterministic Seatbelt: Catches obvious high-risk patterns to prevent hallucinations.
    const dangerousWords = ["refund", "payment", "lawsuit", "contract", "invoice dispute", "wire transfer"];
    const hasRisk = dangerousWords.some(word => inputs.original_text.toLowerCase().includes(word));
    
    if (hasRisk && ai.draft_allowed) {
        return { action: "MANUAL_REVIEW", reason: "RISK_KEYWORD_OVERRIDE" };
    }

    let finalCategory = ai.category;
    
    // Only elevate human conversations, never spam
    if (ai.urgency_score === 5 && ai.category === "needs_reply") {
        finalCategory = "urgent";
    }

    return { 
        action: finalCategory,
        safe_to_draft: ai.draft_allowed && !hasRisk,
        draft_content: ai.reply_draft
    };
};
```

---

## 5. Execution Layer (Agentic Context Verification)
Based on `Step4.action`:
- **needs_reply:** 
  - *Condition:* `Step4.safe_to_draft == true`. 
  - **The Agentic Step:** Retrieve last 3 messages in the Gmail thread. 
  - **Context Verification (Universal AI Piece):** *"Does the thread context contradict the safety of this draft? (e.g., A draft saying 'Sounds good' when the thread is about a $250k budget approval). Return { context_changed: boolean }."*
  - If `context_changed == true`: Route to `MANUAL_REVIEW`.
  - Else: Create Draft using `Step4.draft_content`. Add Gmail Label.
  - *Fallback:* If `safe_to_draft == false`, add Label only. DO NOT draft.
- **urgent:** Add Gmail Label (URGENT). Send Slack Ping if necessary.
- **invoice:** Add Gmail Label.
- **junk / newsletter:** Add Gmail Label. Archive.
- **MANUAL_REVIEW:** Add Gmail Label (REVIEW_REQUIRED). Leave in inbox.

**Final Storage Update:** Set `processed_ids[emailId] = true`.

---

## 6. The README Submission
**Why this exists instead of just Gmail filters + ChatGPT:**
Gmail filters classify emails, and ChatGPT drafts replies, but neither reasons over inbox state. This agent combines memory, thread context, and risk-aware drafting to decide not only what to say, but whether automation is appropriate at all. 

**Key Decisions:**
- **Deterministic preprocessing:** Handles deduplication, bounce detection, and immediate manual review for unsupported features (attachments) for maximum reliability.
- **Context Reversal Detection:** Before committing any auto-generated draft, the agent fetches thread history to ensure short, ambiguous replies (e.g., "Sounds good") don't accidentally approve high-risk historical context.
- **Lightweight personalization:** Style profiles are inferred from the user's sent folder to match tone without overpromising on deep semantic mimickry.
- **Graceful degradation:** Model failures never block email processing; outages or parsing errors degrade gracefully into a manual-review queue, ensuring zero lost communications.
