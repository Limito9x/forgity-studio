/**
 * session.ts — thin wrappers over useAuthStore for use outside React components.
 * Giữ logic token ở một chỗ; LoginForm và các nơi khác import từ đây.
 */

import { getAuthState } from '@/stores/authStore';

/** Lưu access token vào Zustand store (và localStorage qua persist middleware) */
export const setAccessToken = (token: string): void => {
  getAuthState().setAccessToken(token);
};

/** Xóa access token (logout hoặc refresh thất bại) */
export const clearAccessToken = (): void => {
  getAuthState().clearToken();
};

/** Lấy access token hiện tại */
export const getAccessToken = (): string | null => {
  return getAuthState().accessToken;
};
