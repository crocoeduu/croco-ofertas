import 'server-only';
export const errors = {
  ADMIN_REQUIRED: { status: 403, message: 'Esta operação exige a conta administradora autorizada.' },
  AFFILIATE_INVALID: { status: 400, message: 'Revise o produto, URL HTTPS oficial, canal e confirmação de titularidade.' },
  AFFILIATE_DUPLICATE: { status: 409, message: 'Já existe um link com este produto, canal e etiqueta. Edite o cadastro existente.' },
  AFFILIATE_NOT_FOUND: { status: 404, message: 'Link afiliado pendente, desativado ou indisponível.' },
  AFFILIATE_CONFLICT: { status: 409, message: 'O cadastro mudou. Atualize a página antes de salvar.' },
  CSV_INVALID: { status: 400, message: 'CSV inválido. Use as seis colunas indicadas e no máximo 100 linhas.' },
  OFFER_NOT_READY: { status: 409, message: 'A oferta ainda não cumpre os requisitos de divulgação.' },
  SEARCH_INVALID: { status: 400, message: 'Informe uma busca de 2 a 100 caracteres.' },
  PRODUCT_INVALID: { status: 400, message: 'O produto informado é inválido.' },
  COUPON_INVALID: { status: 400, message: 'Revise o código, desconto, condições e validade do cupom.' },
  REQUEST_INVALID: { status: 400, message: 'A solicitação é inválida.' },
  REQUEST_FORBIDDEN: { status: 403, message: 'Esta solicitação deve ser feita pela Central de Ofertas.' },
  MELI_SEARCH_FORBIDDEN: { status: 403, message: 'O Mercado Livre não liberou o acesso à busca para esta aplicação/conta. Sua conexão continua salva. Revise as permissões na área de desenvolvedores.' },
  MELI_PRICES_FORBIDDEN: { status: 403, message: 'Sua conta consegue consultar o catálogo, mas o Mercado Livre negou o acesso aos anúncios com preços. Sua conexão continua salva; a coleta depende da liberação desse recurso para a aplicação.' },
  MELI_API_ERROR: { status: 502, message: 'Não foi possível obter os produtos do Mercado Livre agora.' },
  SEARCH_RATE_LIMITED: { status: 429, message: 'Muitas consultas. Aguarde um minuto e tente novamente.' },
  PRODUCT_NOT_FOUND: { status: 404, message: 'Este produto ainda não está no seu histórico.' },
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
