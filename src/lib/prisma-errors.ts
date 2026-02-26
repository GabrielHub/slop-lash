export function hasPrismaErrorCode(error: unknown, code: string): boolean {
  if (error == null || typeof error !== "object" || !("code" in error)) {
    return false;
  }
  return error.code === code;
}
