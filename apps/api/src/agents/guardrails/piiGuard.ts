const PII_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
];

export function piiGuard(text: string): void {
  if (PII_PATTERNS.some((pattern) => pattern.test(text))) {
    throw new Error("PII review required");
  }
}
