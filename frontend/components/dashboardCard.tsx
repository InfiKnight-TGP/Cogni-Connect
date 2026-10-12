"use client";

import { Card } from "@/components/ui/card";
import React from "react";

export interface DashboardCardProps {
  children: React.ReactNode;
  link?: string;
  navigate?: (path: string) => void;
  onClick?: () => void;
  className?: string;
  reverse?: boolean;
  done?: boolean;
}

export function DashboardCard({
  children,
  link,
  navigate,
  onClick,
  className = "",
  reverse = false,
  done = false,
}: DashboardCardProps) {
  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (link && navigate) {
      navigate(link);
    }
  };

  const isClickable = Boolean(onClick || (link && navigate));

  const borderClass = reverse
    ? "bg-gradient-to-br from-primary to-blue-950 text-white border-primary"
    : done
    ? "border-green-600 dark:border-green-500 bg-card text-card-foreground"
    : "border-primary bg-card text-card-foreground";

  return (
    <Card
      onClick={isClickable ? handleClick : undefined}
      onKeyDown={
        isClickable
          ? (e: React.KeyboardEvent<HTMLDivElement>) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      className={`relative z-0 h-52 w-full overflow-hidden transition-all ${borderClass} ${
        isClickable
          ? "cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary"
          : ""
      } p-6 ${className}`}
    >
      {children}
    </Card>
  );
}

export default DashboardCard;
