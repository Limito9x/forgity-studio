import { useEffect, useRef } from 'react';
import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { useAuthStore } from '@/stores/authStore';
import { useQueryClient } from '@tanstack/react-query';
import type { NotificationDto, CursorPageOfNotificationDto } from '@/gen/model';
import { getGetNotificationsQueryKey, getGetUnreadCountQueryKey } from '@/gen/endpoints/notifications/notifications';

export const useNotificationSignalR = () => {
  const connectionRef = useRef<HubConnection | null>(null);
  const token = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) {
      if (connectionRef.current) {
        connectionRef.current.stop();
        connectionRef.current = null;
      }
      return;
    }

    const hubUrl = `${import.meta.env.VITE_API_URL || ''}/hubs/notifications`;

    const connection = new HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: () => token,
      })
      .configureLogging(LogLevel.Information)
      .withAutomaticReconnect()
      .build();

    connectionRef.current = connection;

    connection
      .start()
      .then(() => {
        console.log('SignalR Connected to NotificationHub');

        connection.on('ReceiveNewNotification', (notification: NotificationDto) => {
          queryClient.setQueryData(
            getGetNotificationsQueryKey(),
            (oldData: { pages: CursorPageOfNotificationDto[]; pageParams: unknown[] } | undefined) => {
              if (!oldData || !oldData.pages) return oldData;
              
              const newPages = [...oldData.pages];
              
              if (newPages.length > 0) {
                const firstPage = { ...newPages[0] };
                firstPage.items = [notification, ...(firstPage.items ?? [])];
                newPages[0] = firstPage;
              }

              return {
                ...oldData,
                pages: newPages,
              };
            }
          );

          // Invalidate unread count to update badge instantly
          queryClient.invalidateQueries({ queryKey: getGetUnreadCountQueryKey() });
        });
      })
      .catch((err) => console.error('SignalR Connection Error: ', err));

    return () => {
      connection.stop();
      connectionRef.current = null;
    };
  }, [token, queryClient]);
};
