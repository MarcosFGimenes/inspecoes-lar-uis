import type { HTMLAttributes, TableHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Table = forwardRef<HTMLTableElement, TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-x-auto">
      <table
        ref={ref}
        className={cn(
          "w-full min-w-[640px] border-collapse text-left text-sm text-[var(--text)]",
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
      className={cn("bg-[var(--surface-strong)] text-xs uppercase tracking-wide text-[var(--muted)]", className)}
      {...props}
    />
  )
);

TableHeader.displayName = "TableHeader";

export const TableHead = forwardRef<HTMLTableCellElement, HTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th ref={ref} className={cn("px-4 py-3 font-semibold", className)} scope="col" {...props} />
  )
);

TableHead.displayName = "TableHead";

export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("divide-y divide-[var(--border)]", className)} {...props} />
  )
);

TableBody.displayName = "TableBody";

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn("transition hover:bg-[var(--surface)]", className)} {...props} />
  )
);

TableRow.displayName = "TableRow";

export const TableCell = forwardRef<HTMLTableCellElement, HTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("px-4 py-3 align-top", className)} {...props} />
  )
);

TableCell.displayName = "TableCell";
