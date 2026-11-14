import { Bell, CheckCheck, MoreHorizontal, Archive, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNotifications, useUnreadCount } from '../hooks/useNotifications';
import { Temporal } from '@js-temporal/polyfill';
import { cn } from '@/lib/utils';
import type { NotificationDto } from '@/gen/model';
import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';

export const NotificationPopover = () => {
  const {
    notifications,
    markAsRead,
    archive,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading
  } = useNotifications();

  const { data: unreadCountData } = useUnreadCount();
  const unreadCount = unreadCountData ?? 0;

  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0, rootMargin: '20px' }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [observerTarget.current, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleMarkAllAsRead = () => {
    const unreadIds = notifications.filter(n => !n.isRead).map(n => n.id);
    if (unreadIds.length > 0) {
      markAsRead(unreadIds);
    }
  };

  const handleNotificationClick = (notification: NotificationDto) => {
    if (!notification.isRead) {
      markAsRead([notification.id]);
    }
  };

  // Format time using Temporal API
  const formatTime = (isoString: string) => {
    try {
      const instant = Temporal.Instant.from(isoString);
      const zonedDateTime = instant.toZonedDateTimeISO(Temporal.Now.timeZoneId());
      const now = Temporal.Now.zonedDateTimeISO();
      
      const duration = now.since(zonedDateTime);
      if (duration.days > 0) return `${duration.days}d ago`;
      if (duration.hours > 0) return `${duration.hours}h ago`;
      if (duration.minutes > 0) return `${duration.minutes}m ago`;
      return 'Just now';
    } catch {
      return '';
    }
  };

  return (
    <PopoverTrigger>
      <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-full">
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>
      <Popover placement="bottom end" className="w-80 p-0 sm:w-96">
        <div className="flex flex-col">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h4 className="text-sm font-semibold">Notifications</h4>
            {unreadCount > 0 && (
              <Button 
                variant="ghost" 
                size="xs" 
                className="text-xs text-muted-foreground hover:text-foreground"
                onPress={handleMarkAllAsRead}
              >
                <CheckCheck className="mr-1 h-3 w-3" />
                Mark all as read
              </Button>
            )}
          </div>
          <ScrollArea className="h-[400px] overflow-y-auto">
            {isLoading ? (
              <div className="flex p-4 items-center justify-center text-sm text-muted-foreground">
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <Bell className="mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={cn(
                      "group flex items-start gap-3 border-b p-4 transition-colors hover:bg-muted/50",
                      !notification.isRead && "bg-primary/5"
                    )}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex-1 space-y-1">
                      <p className={cn("text-sm leading-tight", !notification.isRead ? "font-medium" : "text-muted-foreground")}>
                        {notification.title}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatTime(notification.createdAt)}
                      </p>
                    </div>
                    
                    <DropdownMenuTrigger>
                      <Button variant="ghost" size="icon-xs" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                      <DropdownMenu placement="bottom end">
                        <DropdownMenuItem onAction={() => archive(notification.id)}>
                          <Archive className="mr-2 h-4 w-4" />
                          Archive
                        </DropdownMenuItem>
                        <DropdownMenuItem isDisabled>
                          <Mail className="mr-2 h-4 w-4" />
                          Mark as unread
                        </DropdownMenuItem>
                      </DropdownMenu>
                    </DropdownMenuTrigger>
                    
                    {!notification.isRead && (
                      <span className="mt-1 flex h-2 w-2 rounded-full bg-primary" />
                    )}
                  </div>
                ))}
                
                {/* Infinite Scroll Target */}
                <div ref={observerTarget} className="h-4 w-full" />
                
                {isFetchingNextPage && (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    Loading more...
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      </Popover>
    </PopoverTrigger>
  );
};
