/**
 * Cleans a user's question before it is processed: trims the ends and
 * collapses any run of whitespace (spaces, tabs, line breaks) into one space.
 */
export function normalizeQuestion(question: string): string {
  return question.trim().replace(/\s+/g, " ");
}
