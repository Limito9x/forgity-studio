import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GetProfileResult } from '@/gen/model';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface AuthState {
  /** Access token JWT hiện tại, null nếu chưa đăng nhập */
  accessToken: string | null;
  /** Thông tin user đăng nhập hiện tại */
  profile: GetProfileResult | null;
  /** Quyền hạn của user */
  permissions: string[];
  /** Lưu access token mới (sau login hoặc refresh thành công) */
  setAccessToken: (token: string) => void;
  /** Lưu profile mới */
  setProfile: (profile: GetProfileResult) => void;
  /** Lưu quyền hạn */
  setPermissions: (permissions: string[]) => void;
  /** Kiểm tra xem có quyền cụ thể không */
  hasPermission: (permission: string) => boolean;
  /** Kiểm tra xem có bất kỳ quyền nào bắt đầu bằng prefix không */
  hasAnyPermission: (prefix: string) => boolean;
  /** Xóa token (sau khi logout hoặc refresh thất bại) */
  clearToken: () => void;
  /** Xóa profile (sau khi logout) */
  clearProfile: () => void;
  /** Xóa toàn bộ phiên đăng nhập (token, profile, permissions) */
  logout: () => void;
}

// -----------------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------------

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      profile: null,
      permissions: [],
      setAccessToken: (token) => set({ accessToken: token }),
      setProfile: (profile) => set({ profile }),
      setPermissions: (permissions) => set({ permissions }),
      hasPermission: (permission) => get().permissions.includes('*') || get().permissions.includes(permission),
      hasAnyPermission: (prefix) => get().permissions.includes('*') || get().permissions.some(p => p.startsWith(prefix)),
      clearToken: () => set({ accessToken: null }),
      clearProfile: () => set({ profile: null, permissions: [] }),
      logout: () => set({ accessToken: null, profile: null, permissions: [] }),
    }),
    {
      name: 'auth', // key trong localStorage
      // Persist accessToken và permissions để giữ trạng thái khi reload trang (tránh route guard đá ra ngoài)
      partialize: (state) => ({ accessToken: state.accessToken, permissions: state.permissions }),
    }
  )
);

// -----------------------------------------------------------------------------
// Accessor ngoài React (dùng trong axios interceptor)
// -----------------------------------------------------------------------------

/** Lấy state hiện tại mà không cần React hook */
export const getAuthState = () => useAuthStore.getState();
