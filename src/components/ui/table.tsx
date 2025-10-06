import type { HTMLAttributes, TableHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Table = forwardRef<HTMLTableElement, TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="glass-table relative w-full overflow-x-auto">
      <table
        ref={ref}
        className={cn(
          "w-full min-w-[640px] text-left text-sm text-[var(--text)]",
          className
        )}
        {...props}
      />
    </div>
  )
);

Table.displayName = "Table";

export const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn(
        "text-xs uppercase tracking-wide text-[var(--muted)]",
        className
      )}
      {...props}
    />
  )
);

TableHeader.displayName = "TableHeader";

export const TableHead = forwardRef<HTMLTableCellElement, HTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "px-5 py-4 font-semibold text-[var(--muted)]",
        className
      )}
      scope="col"
      {...props}
    />
  )
);

TableHead.displayName = "TableHead";

export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody
      ref={ref}
      className={cn("divide-y divide-[color-mix(in_srgb,var(--border)_75%,transparent_25%)]", className)}
      {...props}
    />
  )
);

TableBody.displayName = "TableBody";

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "transition hover:bg-[color-mix(in_srgb,var(--surface)_88%,rgba(37,99,235,0.05)_12%)]",
        className
      )}
      {...props}
    />
  )
);

TableRow.displayName = "TableRow";

export const TableCell = forwardRef<HTMLTableCellElement, HTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn("px-5 py-4 align-top text-[var(--text)]", className)}
      {...props}
    />
  )
);

TableCell.displayName = "TableCell";
