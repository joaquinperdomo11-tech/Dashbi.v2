"use client";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

interface StatCardProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  sub?: string;
  accent?: boolean;
  delay?: number;
  icon?: string;
  trend?: number;
  invertTrend?: boolean;
}

function useCountUp(target: number, duration = 1200, delay = 0) {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    const timeout = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setCurrent(target * eased);
        if (progress < 1) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }, delay);

    return () => {
      clearTimeout(timeout);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, delay]);

  return current;
}

export default function StatCard({
  label,
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  sub,
  accent = false,
  delay = 0,
  icon,
  trend,
  invertTrend = false,
}: StatCardProps) {
  const animated = useCountUp(value, 1000, delay);

  const formatted = animated.toLocaleString("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-2xl border p-4 sm:p-6 transition-all duration-300",
        "hover:border-brand-muted hover:translate-y-[-2px]",
        accent
          ? "border-brand-yellow/30 bg-brand-yellow/5"
          : "border-brand-border bg-brand-card"
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {accent && (
        <div className="absolute -top-8 -right-8 w-32 h-32 bg-brand-yellow/10 rounded-full blur-2xl" />
      )}

      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <p className="text-brand-sub text-xs sm:text-sm font-body uppercase tracking-wider">
            {label}
          </p>
          {icon && <span className="text-lg sm:text-xl">{icon}</span>}
        </div>

        <div className="flex items-baseline gap-1">
          {prefix && (
            <span className={clsx("text-sm font-mono", accent ? "text-brand-yellow" : "text-brand-sub")}>
              {prefix}
            </span>
          )}
          <span className={clsx(
            "font-display font-bold leading-none",
            accent ? "text-brand-yellow text-3xl sm:text-4xl" : "text-brand-text text-2xl sm:text-3xl"
          )}>
            {formatted}
          </span>
          {suffix && <span className="text-brand-sub text-sm font-mono">{suffix}</span>}
        </div>

        {sub && <p className="text-brand-sub text-xs mt-2 font-body">{sub}</p>}

        {trend !== undefined && (
          <div className={clsx(
            "inline-flex items-center gap-1 mt-3 px-2 py-0.5 rounded-full text-xs font-mono",
            invertTrend
              ? trend <= 0 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
              : trend >= 0 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
          )}>
            <span>{trend >= 0 ? "▲" : "▼"}</span>
            <span>{Math.abs(trend).toFixed(1)}% vs mes anterior</span>
          </div>
        )}
      </div>
    </div>
  );
}
