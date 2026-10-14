export interface OAuthTokenResponse {
  access_token: string; token_type: 'bearer'; expires_in: number;
  scope: string; user_id: number; refresh_token: string;
}
export interface OAuthErrorResponse { error: string; error_description?: string; message?: string; status?: number }
export interface MercadoLivreUser { id: number; nickname: string; site_id: string }
export interface StoredTokens { accessToken: string; refreshToken: string; expiresAt: Date; userId: number; scope: string }
export interface TokenStorage {
  saveMercadoLivreTokens(ownerHash: string, tokens: OAuthTokenResponse): Promise<void>;
  getMercadoLivreTokens(ownerHash: string): Promise<StoredTokens | null>;
  updateMercadoLivreTokens(ownerHash: string, tokens: OAuthTokenResponse): Promise<void>;
}
