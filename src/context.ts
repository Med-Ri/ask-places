/** Same meaning in each language. Never an answer to the off-topic question. */
const ANSWERS = {
  en: "I'd love to help you find a place nearby. Tell me what you're looking for.",
  fr: "Je serais ravi de vous aider à trouver un lieu à proximité. Dites-moi ce que vous cherchez.",
  ar: "يسعدني مساعدتك في العثور على مكان قريب. أخبرني بما تبحث عنه.",
} as const;

/** Picks the generic out-of-context reply in the question's language. */
export function genericAnswerFor(question: string): string {
  if (/[\u0600-\u06FF]/.test(question)) return ANSWERS.ar;
  if (/[àâçéèêëîïôùûüœ]/i.test(question) || /\b(je|tu|vous|bonjour|salut|cherche|pourquoi|comment)\b/i.test(question)) {
    return ANSWERS.fr;
  }
  return ANSWERS.en;
}
