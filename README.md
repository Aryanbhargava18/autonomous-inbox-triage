# Autonomous Gmail Triage Agent

This repository contains the architecture and evaluation matrices for the **Gravity AI Gmail Triage Agent**, an autonomous inbox management system designed to reclaim hours of productivity by filtering, labeling, and drafting responses to incoming emails.

## Overview

Unlike standard email filters or basic LLM text generators, this agent reasons over the inbox state. It balances the core assignment (drafting personalized replies) with realistic safety constraints.

### Key Capabilities:
- **Deterministic Bouncer:** Prevents infinite auto-reply loops, ignores unsupported attachments to prevent hallucinations, and acts as an O(1) deduplication filter.
- **Agentic Context Verification:** Before committing to any auto-generated draft, it evaluates the thread's historical context to ensure a short, ambiguous reply doesn't inadvertently approve a high-risk historical context (e.g., "$250k budget approval").
- **Graceful Degradation:** Fails safe into a `MANUAL_REVIEW` queue if parsing fails or risk words are detected.

## Documentation

- **[Architecture (ARCHITECTURE.md)](ARCHITECTURE.md):** Details the 6-step execution layer, memory schema, and prompt design.
- **[Evaluation (EVALUATION.md)](EVALUATION.md):** Analyzes the adversarial test cases (False Urgency, Sarcasm, Context Reversal) and accepted tradeoffs used to harden this agent.
