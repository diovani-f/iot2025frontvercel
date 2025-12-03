import { Loader2 } from "lucide-react"

interface LoadingSpinnerProps {
    size?: "sm" | "md" | "lg"
    text?: string
    className?: string
}

export function LoadingSpinner({ size = "md", text, className = "" }: LoadingSpinnerProps) {
    const sizeClasses = {
        sm: "h-4 w-4",
        md: "h-8 w-8",
        lg: "h-12 w-12",
    }

    return (
        <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
            <Loader2 className={`${sizeClasses[size]} animate-spin text-primary`} />
            {text && <p className="text-sm text-muted-foreground animate-pulse">{text}</p>}
        </div>
    )
}

interface LoadingOverlayProps {
    text?: string
}

export function LoadingOverlay({ text = "Carregando..." }: LoadingOverlayProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="glass-effect rounded-lg p-8 shadow-2xl">
                <LoadingSpinner size="lg" text={text} />
            </div>
        </div>
    )
}
