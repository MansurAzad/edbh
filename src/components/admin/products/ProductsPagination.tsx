import { Button } from "@/components/ui/button";

interface Props {
  currentPage: number;
  totalPages: number;
  total: number;
  perPage: number;
  onChange: (page: number) => void;
}

export default function ProductsPagination({ currentPage, totalPages, total, perPage, onChange }: Props) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Showing {(currentPage - 1) * perPage + 1}-{Math.min(currentPage * perPage, total)} of {total}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => onChange(currentPage - 1)}>
          Previous
        </Button>
        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
          let page: number;
          if (totalPages <= 7) page = i + 1;
          else if (currentPage <= 4) page = i + 1;
          else if (currentPage >= totalPages - 3) page = totalPages - 6 + i;
          else page = currentPage - 3 + i;
          return (
            <Button
              key={page}
              variant={currentPage === page ? "default" : "outline"}
              size="sm"
              className="w-9"
              onClick={() => onChange(page)}
            >
              {page}
            </Button>
          );
        })}
        <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => onChange(currentPage + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
