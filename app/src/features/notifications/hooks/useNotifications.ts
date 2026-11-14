import { useInfiniteQuery } from "@tanstack/react-query";
import { createMutationHook } from "@/lib/query-utils";
import * as NotificationsApi from "@/gen/endpoints/notifications/notifications";
import type { CursorPageOfNotificationDto } from "@/gen/model";
import { useNotificationSignalR } from "./useNotificationSignalR";
import { useAuthStore } from "@/stores/authStore";

export const useNotifications = () => {
  // Khởi tạo SignalR hook để lắng nghe realtime
  useNotificationSignalR();

  const query = useInfiniteQuery({
    queryKey: NotificationsApi.getGetNotificationsQueryKey(),
    queryFn: ({ pageParam }) => NotificationsApi.getNotifications({ cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: CursorPageOfNotificationDto) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
  });

  const archiveMutation = useArchiveNotification();
  const markAsReadMutation = useMarkAsRead();

  const notifications = query.data?.pages.flatMap((page) => page.items ?? []) ?? [];

  return {
    notifications,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    archive: (id: string) => archiveMutation.mutate({ id, data: {} }),
    markAsRead: (ids: string[]) => markAsReadMutation.mutate({ data: { ids } }),
  };
};

export const useUnreadCount = () => {
  const token = useAuthStore((state) => state.accessToken);
  return NotificationsApi.useGetUnreadCount({
    query: {
      enabled: !!token,
    },
  });
};

export const useArchiveNotification = createMutationHook(
  NotificationsApi.useArchive,
  [
    NotificationsApi.getGetNotificationsQueryKey(),
    NotificationsApi.getGetUnreadCountQueryKey(),
  ]
);

export const useMarkAsRead = createMutationHook(
  NotificationsApi.useMarkAsRead,
  [
    NotificationsApi.getGetNotificationsQueryKey(),
    NotificationsApi.getGetUnreadCountQueryKey(),
  ]
);

export const useMarkAllAsRead = createMutationHook(
  NotificationsApi.useMarkAllAsRead,
  [
    NotificationsApi.getGetNotificationsQueryKey(),
    NotificationsApi.getGetUnreadCountQueryKey(),
  ]
);
