import 'server-only';
export const errors = {
  ENV_MISSING: { status: 503, message: 'A conexão com o Mercado Livre ainda não foi configurada.' },
  ENV_INVALID: { status: 503, message: 'A configuração da conexão precisa ser revisada.' },
  INVALID_STATE: { status: 400, message: 'A autorização é inválida ou expirou. Inicie uma nova conexão.' },
  PKCE_MISSING: { status: 400, message: 'A autorização expirou. Inicie uma nova conexão.' },
  CODE_MISSING: { status: 400, message: 'O código de autorização não foi recebido. Inicie uma nova conexão.' },
  ACCESS_DENIED: { status: 403, message: 'Você cancelou a autorização do Mercado Livre. Pode tentar novamente quando quiser.' },
  INVALID_INPUT: { status: 400, message: 'A solicitação de autorização é inválida.' },
  TOKEN_ENDPOINT_ERROR: { status: 502, message: 'Não foi possível concluir a autorização do Mercado Livre.' },
  RATE_LIMITED: { status: 429, message: 'Muitas tentativas de conexão. Aguarde um minuto e tente novamente.' },
  NETWORK_ERROR: { status: 502, message: 'Não foi possível comunicar com o Mercado Livre. Tente novamente mais tarde.' },
  STORAGE_ERROR: { status: 503, message: 'Não foi possível guardar a conexão com segurança. Tente novamente mais tarde.' },
  CONNECTION_MISSING: { status: 401, message: 'Conecte o Mercado Livre novamente para continuar.' }
} as const;
export type ErrorCode = keyof typeof errors;
export class AppError extends Error {
  constructor(readonly code: ErrorCode) { super(code); this.name = 'AppError'; }
}
export function safeError(error: unknown) {
  const code = error instanceof AppError && Object.hasOwn(errors, error.code) ? error.code : 'TOKEN_ENDPOINT_ERROR';
  return { code, ...errors[code] };
}
