import * as React from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export interface SinglePageShellProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
    title: React.ReactNode;
    description?: React.ReactNode;
    /**
     * Optional custom back handler. 
     * If not provided, defaults to `router.history.back()`.
     */
    onBack?: () => void;
    headerActions?: React.ReactNode;
}

export function SinglePageShell({ 
    title, 
    description, 
    onBack, 
    headerActions,
    className,
    children, 
    ...props 
}: SinglePageShellProps) {
    const router = useRouter();
    
    const handleBack = React.useCallback(() => {
        if (onBack) {
            onBack();
        } else {
            router.history.back();
        }
    }, [onBack, router]);

    return (
        <div className={cn("flex flex-col h-full gap-6 p-6 overflow-auto", className)} {...props}>
            <div className="flex items-center justify-between border-b pb-4 shrink-0">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={handleBack}>
                        <ChevronLeft className="h-5 w-5" />
                        <span className="sr-only">Go back</span>
                    </Button>
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
                        {description && <p className="text-muted-foreground">{description}</p>}
                    </div>
                </div>
                {headerActions && (
                    <div className="flex items-center gap-2">
                        {headerActions}
                    </div>
                )}
            </div>
            {children}
        </div>
    );
}
