// Safety layer: a hard system prompt + pre-LLM signal detection.
// If a message trips a safety signal, we NEVER call the LLM — we return safe guidance + a referral.

export const SAFETY_SYSTEM_PROMPT = `You are Fitpal, a supportive, evidence-based fitness coach inside a fitness app.

ABSOLUTE RULES — never break these:
- You give GENERAL fitness and nutrition guidance only. You are NOT a doctor, dietitian, or therapist.
- Never diagnose medical or mental-health conditions. Never prescribe treatment, medication, or supplements beyond ordinary food.
- Never encourage extreme dieting, very-low-calorie diets, prolonged fasting for weight loss, purging, or any eating-disorder behaviour.
- Never encourage overtraining, training through real pain or injury, or skipping all rest.
- Never body-shame. Be kind, non-judgmental, and encouraging about the user's body and progress.
- Never encourage steroids, PEDs, or recreational drugs.
- For anyone who appears to be a minor, stay conservative and recommend involving a parent/guardian and a doctor.
- If the user mentions injury, illness, severe symptoms, disordered eating, or mental-health distress: give only general safe guidance and clearly recommend they speak to a qualified professional (doctor, registered dietitian, or mental-health professional).

STYLE:
- Be concise, warm, and practical. 2-5 short paragraphs or a tight list.
- Ground every answer in the user's PROFILE, ACTIVE PLAN, and RECENT DATA provided below. If data is missing, say so plainly.
- You may SUGGEST adjustments in plain language, but you cannot and do not change the user's plan yourself — tell them changes are theirs to make or will come from their weekly review.
- End with one small, encouraging next step when appropriate.`;

type Signal = { flag: string; response: string };

const ED_RE = /\b(anorexi|bulimi|purg(e|ing)|vomit|throw(ing)? up|starv(e|ing)|laxative|not eating|stop eating|skip(ping)? meals every|hate my body|disgusting)\b/i;
const SELF_HARM_RE = /\b(suicid|kill myself|end my life|self.?harm|hurt myself|want to die)\b/i;
const MED_RE = /\b(chest pain|can'?t breathe|shortness of breath|passed out|fainted|blood in|severe pain|dizzy and|numbness)\b/i;

const PROFESSIONAL = "Please reach out to a qualified professional who can help you properly and safely.";

export function detectSafetySignal(message: string): Signal | null {
  if (SELF_HARM_RE.test(message)) {
    return {
      flag: "self_harm",
      response:
        "I'm really sorry you're feeling this way, and I'm genuinely glad you said something. This is beyond what a fitness app can help with, and you deserve real support right now. Please contact a mental-health professional or a local crisis line, or talk to someone you trust today. If you might be in immediate danger, please contact your local emergency number. You matter.",
    };
  }
  if (ED_RE.test(message)) {
    return {
      flag: "eating_disorder",
      response:
        `What you're describing sounds really hard, and I don't want to give advice that could make it worse — so I'm not going to coach restriction or weight tactics here. Disordered eating is common and treatable, and you don't have to manage it alone. ${PROFESSIONAL} A doctor or a registered dietitian who specialises in eating concerns is a good first step. I'm still here for general, gentle, non-restrictive support.`,
    };
  }
  if (MED_RE.test(message)) {
    return {
      flag: "medical",
      response:
        `That sounds like something to take seriously, and it's outside what a fitness app should advise on. ${PROFESSIONAL} If symptoms are severe or sudden, please contact a doctor or your local emergency number rather than waiting. Once you're cleared and feeling better, I'm happy to help you ease back into training safely.`,
    };
  }
  return null;
}
