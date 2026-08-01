# Gravity AI: Gmail Triage Evaluation Matrix

*"A system is only as robust as the edge cases it survives."*

## 1. Designed Adversarial Test Cases

Rather than relying on happy-path emails, this architecture was evaluated against specific failure modes common to B2B inboxes:

- [x] **False Urgency:** "URGENT: Your 50% discount expires in 1 hour!" (Caught by deterministic bouncer).
- [x] **Hidden Urgency:** "The database migration failed overnight, customers are locked out." (AI flags `urgency_score: 5`).
- [x] **Mixed Intent:** "I love the new features, but I was double-charged. I expect a refund immediately." (Deterministic risk override intercepts 'refund' and routes to `MANUAL_REVIEW`).
- [x] **Ambiguous Request:** "Can we proceed with what we discussed yesterday on the call?" (AI flags `draft_allowed: false` due to missing context).
- [x] **Context Reversal:** Subject: "Re: Deployment". Body: "Looks good." Thread Context: "Approve the $250k migration budget?" (The Agentic Context Verification step detects the contradiction and aborts the auto-draft, routing to `MANUAL_REVIEW`).
- [x] **The '+1' Email:** Subject: "Re: Deployment". Body: "+1" (AI categorizes as `junk` or `needs_reply` with `draft_allowed: false` due to lack of action item).
- [x] **The 'LGTM' Email:** Subject: "Need approval". Body: "LGTM" (AI categorizes as `needs_reply` with `draft_allowed: false`).
- [x] **Forwarded Threads:** (Code step truncates text strictly to 1000 chars to avoid polluting the LLM context window with endless history).
- [x] **Auto-Generated Notifications:** (AI identifies CI/CD or GitHub alerts and routes to junk/newsletter).

---

## 2. Known Failure Modes & Tradeoffs Accepted

### 1. Unsupported Attachments
- **Scenario:** An email arrives saying "Please sign the contract" with a PDF attached.
- **System Behavior:** The system completely ignores attachments. The Deterministic Bouncer detects `hasAttachments == true` and immediately defaults the email to `MANUAL_REVIEW`.
- **Tradeoff Accepted:** Extracting and analyzing PDF attachments introduces massive latency, high token costs, and unreliable text parsing. Bypassing them to manual review guarantees no contracts are accidentally approved.

### 2. The Naked Forward (Truncation Strategy)
- **Scenario:** A colleague forwards a massive thread from an angry customer and only types "FYI" at the top.
- **System Behavior:** Our deterministic code step truncates the body at 1000 characters to protect LLM context windows. 
- **Tradeoff Accepted:** Long email chains increase latency, API token costs, and reduce classification reliability. While a naked forward may result in a confused `MANUAL_REVIEW` routing, this is a highly acceptable degradation compared to parsing infinite historical threads.

### 3. The Sarcasm Vulnerability
- **Known Risk:** LLMs struggle with implicit tone. The classifier may misinterpret a sarcastic complaint as genuine praise and generate a polite "Thank you!" draft. 
- **Tradeoff Accepted:** I accepted this risk because sarcasm is a minor percentage of professional communication. The blast radius is limited since drafts must still be manually sent by the user.
