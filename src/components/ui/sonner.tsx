"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { AlertIcon, CheckCircleIcon, InfoIcon, StopIcon, SyncIcon } from "@primer/octicons-react"

// The page follows the OS colour scheme (data-color-mode="auto"), so toasts do too.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      icons={{
        success: <CheckCircleIcon size={16} />,
        info: <InfoIcon size={16} />,
        warning: <AlertIcon size={16} />,
        error: <StopIcon size={16} />,
        loading: <SyncIcon size={16} className="animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
