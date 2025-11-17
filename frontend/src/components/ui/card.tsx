import React from 'react'

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ')
}

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

export const Card: React.FC<CardProps> = ({ className, ...props }) => {
  return (
    <div
      className={cn(
        'rounded-xl bg-card text-card-foreground border border-border/40 shadow-sm',
        className
      )}
      {...props}
    />
  )
}
