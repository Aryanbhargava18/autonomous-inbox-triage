/**
 * Gravity AI - Deterministic Bouncer
 * 
 * Purpose: Prevent infinite loops, handle edge cases for $0, 
 * and filter unsupported features before LLM execution.
 */

export const bouncer = async (inputs) => {
    const emailId = inputs.email.id;
    const sender = inputs.email.from.toLowerCase();
    const subject = inputs.email.subject || "";
    const rawBody = inputs.email.textBody || "";
    const myEmail = "your.email@example.com"; // To be injected dynamically via Gravity user scope
    
    // 1. Unsupported Features (Attachments)
    // We bypass attachments to manual review to guarantee no contracts are accidentally approved.
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
    // Truncates long threads to protect LLM context windows and reduce token costs.
    const truncatedBody = rawBody.substring(0, 1000); 

    return { 
        action: "ESCALATE", 
        text: truncatedBody, 
        sender: sender, 
        original_text: rawBody 
    };
};
