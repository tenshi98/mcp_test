// Errores de dominio con código estable (se devuelven al agente de forma estructurada).
export class AppError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}
export const E = {
  validation: (m, d) => new AppError('VALIDATION_ERROR', m, d),
  notFound: (m) => new AppError('NOT_FOUND', m),
  unauthenticated: (m = 'Autenticación requerida o token inválido') => new AppError('UNAUTHENTICATED', m),
  forbidden: (m) => new AppError('FORBIDDEN', m),
  confirmation: (m, d) => new AppError('CONFIRMATION_REQUIRED', m, d),
  db: (m = 'Error interno de base de datos') => new AppError('DATABASE_ERROR', m),
};
