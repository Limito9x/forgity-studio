import axios, {
  type AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
  type AxiosRequestConfig,
} from 'axios';
import { toast } from 'sonner';
import { getAuthState } from '@/stores/authStore';
import { getCurrentStudioId } from '@/features/studios/hooks/useCurrentStudio';
import qs from 'qs';

// -----------------------------------------------------------------------------
// Cấu hình base client
// -----------------------------------------------------------------------------

export const AXIOS_INSTANCE = axios.create({
  baseURL: (import.meta.env.VITE_API_URL as string) || '',
  withCredentials: true, // để cookie refreshToken được gửi tự động
  paramsSerializer: (params) => qs.stringify(params, { arrayFormat: 'indices', allowDots: true }),
});

// -----------------------------------------------------------------------------
// Queue — tạm giữ các request bị 401 trong khi đang refresh token
// -----------------------------------------------------------------------------

type QueueEntry = {
  retry: (token: string) => void;
  reject: (err: unknown) => void;
};

let isRefreshing = false;
let pendingQueue: QueueEntry[] = [];

/** Xử lý toàn bộ queue sau khi refresh xong */
function flushQueue(error: unknown, newToken: string | null) {
  pendingQueue.forEach(({ retry, reject }) =>
    newToken ? retry(newToken) : reject(error)
  );
  pendingQueue = [];
}

// -----------------------------------------------------------------------------
// Token Refresh Flow
// -----------------------------------------------------------------------------

/**
 * Gọi BE để lấy access token mới.
 * - Nếu đang refresh: queue request lại, retry sau khi có token mới.
 * - Nếu refresh thất bại: xóa token, redirect về login.
 */
async function handleTokenRefresh(
  originalRequest: InternalAxiosRequestConfig & { _retry?: boolean }
) {
  // Có request khác đang refresh → queue lại, không gọi refresh thêm lần nữa
  if (isRefreshing) {
    return new Promise((resolve, reject) => {
      pendingQueue.push({
        retry: (token) => {
          originalRequest.headers.set('Authorization', `Bearer ${token}`);
          resolve(AXIOS_INSTANCE(originalRequest));
        },
        reject,
      });
    });
  }

  originalRequest._retry = true;
  isRefreshing = true;

  try {
    const res = await AXIOS_INSTANCE.post<{ accessToken: string }>('/api/auth/refresh', {});
    const newToken = res.data?.accessToken;

    if (!newToken) throw new Error('No access token returned from refresh');

    // Cập nhật token vào store (persist tự động vào localStorage)
    getAuthState().setAccessToken(newToken);

    // Cập nhật default header cho các request tiếp theo
    AXIOS_INSTANCE.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;

    // Retry tất cả request đang chờ
    originalRequest.headers.set('Authorization', `Bearer ${newToken}`);
    flushQueue(null, newToken);
    return AXIOS_INSTANCE(originalRequest);
  } catch (err) {
    flushQueue(err, null);
    getAuthState().clearToken();
    toast.error('Session expired. Please log in again.');
    // Hard redirect — không dùng router vì interceptor nằm ngoài React tree
    window.location.href = '/auth/login';
    return Promise.reject(err);
  } finally {
    isRefreshing = false;
  }
}

// -----------------------------------------------------------------------------
// Xử lý lỗi API chung (non-401)
// -----------------------------------------------------------------------------

function handleApiError(status: number, data: Record<string, unknown> | null) {
  switch (status) {
    case 403:
      toast.error('You do not have permission to perform this action.');
      break;

    case 400:
    case 422: {
      // Ưu tiên hiển thị validation errors theo từng field
      const errors = data?.errors;
      if (errors && typeof errors === 'object') {
        Object.entries(errors).forEach(([field, messages]) => {
          const list = Array.isArray(messages) ? messages : [messages];
          list.forEach((msg) => toast.error(`${field}: ${msg}`));
        });
      } else {
        const msg = (data?.title ?? data?.message ?? 'Invalid input data.') as string;
        toast.error(msg);
      }
      break;
    }

    default:
      toast.error((data?.title ?? data?.message ?? 'A system error occurred.') as string);
      break;
  }
}

// -----------------------------------------------------------------------------
// Interceptor: đính kèm access token vào mọi request (trừ refresh)
// -----------------------------------------------------------------------------

AXIOS_INSTANCE.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const isRefreshEndpoint = config.url?.includes('/api/auth/refresh');

  if (!isRefreshEndpoint) {
    const token = getAuthState().accessToken;
    if (token) config.headers.set('Authorization', `Bearer ${token}`);

    const activeStudioId = getCurrentStudioId();
    if (activeStudioId) config.headers.set('X-Studio-Id', activeStudioId);
  }

  return config;
});

// -----------------------------------------------------------------------------
// Interceptor: xử lý response lỗi
// -----------------------------------------------------------------------------

AXIOS_INSTANCE.interceptors.response.use(
  (response: AxiosResponse) => response,

  async (error: AxiosError<{ extensions?: { errorCode?: string }; title?: string; message?: string }>) => {
    // Bỏ qua nếu request bị cancel
    if (axios.isCancel(error) || error.code === 'ERR_CANCELED') {
      return Promise.reject(error);
    }

    // Không có response → lỗi mạng
    if (!error.response) {
      toast.error('Cannot connect to the server. Please check your network.');
      return Promise.reject(error);
    }

    const { status, data } = error.response;
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    const isLoginRequest = originalRequest?.url?.includes('/api/auth/login');
    const isRefreshRequest = originalRequest?.url?.includes('/api/auth/refresh');

    // Kích hoạt refresh flow khi:
    // - Status là 401
    // - Không phải chính request login hay refresh đang fail
    // - Chưa retry lần nào
    // Note: không check errorCode vì BE có thể trả 401 với body rỗng
    const shouldRefresh =
      status === 401 &&
      !isLoginRequest &&
      !isRefreshRequest &&
      !originalRequest._retry;

    if (shouldRefresh) {
      return handleTokenRefresh(originalRequest);
    }

    // Không hiển thị toast cho 401 (đã xử lý ở refresh flow hoặc là login fail)
    if (status !== 401) {
      handleApiError(status, data as Record<string, unknown> | null);
    }

    return Promise.reject(error);
  }
);

// -----------------------------------------------------------------------------
// Orval Mutator
// -----------------------------------------------------------------------------
export const customInstance = <T>(config: AxiosRequestConfig): Promise<T> => {
  const source = axios.CancelToken.source();
  const promise = AXIOS_INSTANCE({ ...config, cancelToken: source.token }).then(
    (response) => response.data
  );
  // @ts-expect-error - attach cancel for React Query
  promise.cancel = () => {
    source.cancel('Query was cancelled');
  };
  return promise;
};
