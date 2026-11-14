import { useLogin as useLoginOrval } from '@/gen/endpoints/auth/auth';
import { useAuthStore } from '@/stores/authStore';

export const useLogin = () => {
  const setAccessToken = useAuthStore((s) => s.setAccessToken);

  return useLoginOrval({
    mutation: {
      onSuccess: (data) => {
        // Lưu access token vào Zustand store (tự persist vào localStorage)
        if (data.accessToken) setAccessToken(data.accessToken);
      },
    }
  });
};
