import type { OAuthTokenResponse } from '@/lib/mercadolivre/types';
export const tokenFixture: OAuthTokenResponse = { access_token: 'mock-access-token', refresh_token: 'mock-refresh-token', expires_in: 21600, user_id: 12345, scope: 'read offline_access', token_type: 'bearer' };
