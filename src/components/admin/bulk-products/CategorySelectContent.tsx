import { SelectContent, SelectItem } from "@/components/ui/select";

interface Props { items: string[] }

const CategorySelectContent = ({ items }: Props) => {
  const safe = items.filter(c => typeof c === "string" && c.trim().length > 0);
  if (!safe.length) {
    return (
      <SelectContent>
        <div className="px-3 py-3 text-xs text-muted-foreground">
          কোনো ক্যাটাগরি পাওয়া যায়নি।{" "}
          <a href="/admin/categories" className="text-primary underline">যোগ করুন</a>
        </div>
      </SelectContent>
    );
  }
  return (
    <SelectContent className="max-h-72">
      {safe.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
    </SelectContent>
  );
};

export default CategorySelectContent;
