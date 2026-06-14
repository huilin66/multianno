import React from 'react';

interface LegendItem {
  color: string;
  label: string;
}

interface LegendProps {
  items: LegendItem[];
}

export function Legend({ items }: LegendProps) {
  return (
    <div className="p-3 border-t border-border space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${item.color}`} />
          {item.label}
        </div>
      ))}
    </div>
  );
}
