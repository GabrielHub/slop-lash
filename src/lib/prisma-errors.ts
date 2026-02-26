export function hasPrismaErrorCode(error: unknown, code: string): boolean {
  if (error == null || typeof error !== "object" || !("code" in error)) {
    return false;
  }
  return error.code === code;
}

function errorMessageIncludes(error: unknown, text: string): boolean {
  if (error == null || typeof error !== "object") {
    return false;
  }

  const message =
    "message" in error && typeof error.message === "string" ? error.message : null;
  if (message?.toLowerCase().includes(text.toLowerCase())) {
    return true;
  }

  if ("cause" in error) {
    return errorMessageIncludes(error.cause, text);
  }

  return false;
}

export function isPrismaDataTransferQuotaError(error: unknown): boolean {
  return (
    errorMessageIncludes(error, "DriverAdapterError") &&
    errorMessageIncludes(error, "data transfer quota")
  );
}

export function isPrismaMissingColumnError(error: unknown, columnName?: string): boolean {
  const hasKnownCode = hasPrismaErrorCode(error, "P2022");
  const mentionsMissingColumn =
    errorMessageIncludes(error, "column") &&
    (errorMessageIncludes(error, "does not exist") || errorMessageIncludes(error, "not found"));
  const matchesColumn = columnName ? errorMessageIncludes(error, columnName) : true;
  return matchesColumn && (hasKnownCode || mentionsMissingColumn);
}
