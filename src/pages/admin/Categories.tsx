import { useState, useCallback, useMemo } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import LanguageMixWarning from "@/components/admin/seo/LanguageMixWarning";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, GripVertical, Save, Eye, EyeOff, Image as ImageIcon } from "lucide-react";
import ImageUpload from "@/components/admin/ImageUpload";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Category {
  id: string;
  name: string;
  name_bn: string | null;
  slug: string | null;
  description: string | null;
  description_bn: string | null;
  image_url: string | null;
  item_count: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

const emptyForm = {
  name: "", name_bn: "", slug: "", description: "", description_bn: "",
  image_url: "", item_count: "0+ Items", is_active: true,
};

const SortableCategoryRow = ({ category, onEdit, onDelete, onToggle, productCounts }: {
  category: Category;
  onEdit: (c: Category) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
  productCounts: Record<string, number>;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell>
        <button {...attributes} {...listeners} className="touch-none cursor-grab active:cursor-grabbing p-1">
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </button>
      </TableCell>
      <TableCell>
        {category.image_url ? (
          <img src={category.image_url} alt={category.name} className="w-12 h-12 object-cover rounded-lg" />
        ) : (
          <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-muted-foreground" />
          </div>
        )}
      </TableCell>
      <TableCell>
        <div>
          <p className="font-semibold text-foreground">{category.name_bn || category.name}</p>
          <p className="text-xs text-muted-foreground font-mono">{category.slug}</p>
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
        {category.description_bn || category.description || "—"}
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{productCounts[category.name] || 0} টি</Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          {category.is_active ? <Eye className="w-3.5 h-3.5 text-green-500" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
          <Switch checked={category.is_active} onCheckedChange={(v) => onToggle(category.id, v)} />
        </div>
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="icon" onClick={() => onEdit(category)}><Pencil className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(category.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
      </TableCell>
    </TableRow>
  );
};

const AdminCategories = () => {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("display_order");
      if (error) throw error;
      return (data || []) as Category[];
    },
  });

  const { data: productCounts = {} } = useQuery({
    queryKey: ["admin-category-product-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("category");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((p) => { counts[p.category] = (counts[p.category] || 0) + 1; });
      return counts;
    },
  });

  const filtered = useMemo(() => categories.filter(
    (c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.name_bn || "").includes(searchQuery) ||
      (c.slug || "").includes(searchQuery.toLowerCase())
  ), [categories, searchQuery]);

  const categoryIds = useMemo(() => filtered.map((c) => c.id), [filtered]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
    queryClient.invalidateQueries({ queryKey: ["categories"] });
  }, [queryClient]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name, name_bn: form.name_bn || null, slug: form.slug || form.name.toLowerCase().replace(/\s+/g, "-"),
        description: form.description || null, description_bn: form.description_bn || null,
        image_url: form.image_url || null, item_count: form.item_count || "0+ Items", is_active: form.is_active,
      };
      if (editingCategory) {
        const { error } = await supabase.from("categories").update(payload).eq("id", editingCategory.id);
        if (error) throw error;
      } else {
        const maxOrder = categories.length > 0 ? Math.max(...categories.map((c) => c.display_order)) : 0;
        const { error } = await supabase.from("categories").insert({ ...payload, display_order: maxOrder + 1 });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      setEditingCategory(null);
      toast.success(editingCategory ? "ক্যাটাগরি আপডেট হয়েছে!" : "নতুন ক্যাটাগরি যোগ হয়েছে!");
    },
    onError: (e: any) => toast.error(e.message || "সমস্যা হয়েছে"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("ক্যাটাগরি মুছে ফেলা হয়েছে!"); },
    onError: () => toast.error("মুছে ফেলা ব্যর্থ"),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("categories").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, is_active }) => {
      await queryClient.cancelQueries({ queryKey: ["admin-categories"] });
      queryClient.setQueryData<Category[]>(["admin-categories"], (old) =>
        old?.map((c) => (c.id === id ? { ...c, is_active } : c))
      );
    },
    onSettled: () => invalidate(),
  });

  const reorderMutation = useMutation({
    mutationFn: async (newOrder: Category[]) => {
      for (let i = 0; i < newOrder.length; i++) {
        const { error } = await supabase.from("categories").update({ display_order: i }).eq("id", newOrder[i].id);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidate(),
  });

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = filtered.findIndex((c) => c.id === active.id);
    const newIndex = filtered.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(filtered, oldIndex, newIndex);
    queryClient.setQueryData<Category[]>(["admin-categories"], newOrder.map((c, i) => ({ ...c, display_order: i })));
    reorderMutation.mutate(newOrder);
  }, [filtered, queryClient, reorderMutation]);

  const openCreate = () => {
    setEditingCategory(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (c: Category) => {
    setEditingCategory(c);
    setForm({
      name: c.name, name_bn: c.name_bn || "", slug: c.slug || "",
      description: c.description || "", description_bn: c.description_bn || "",
      image_url: c.image_url || "", item_count: c.item_count || "0+ Items", is_active: c.is_active,
    });
    setDialogOpen(true);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold">ক্যাটাগরি ম্যানেজমেন্ট</h1>
            <p className="text-muted-foreground text-sm">প্রোডাক্ট ক্যাটাগরি যোগ, এডিট, ডিলিট ও ক্রম পরিবর্তন করুন</p>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1.5" /> নতুন ক্যাটাগরি</Button>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="ক্যাটাগরি খুঁজুন..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={categoryIds} strategy={verticalListSortingStrategy}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead className="w-16">ইমেজ</TableHead>
                        <TableHead>নাম</TableHead>
                        <TableHead>বিবরণ</TableHead>
                        <TableHead>প্রোডাক্ট</TableHead>
                        <TableHead>স্ট্যাটাস</TableHead>
                        <TableHead className="text-right">অ্যাকশন</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">কোনো ক্যাটাগরি পাওয়া যায়নি</TableCell>
                        </TableRow>
                      ) : (
                        filtered.map((c) => (
                          <SortableCategoryRow
                            key={c.id} category={c}
                            onEdit={openEdit}
                            onDelete={(id) => setDeleteId(id)}
                            onToggle={(id, v) => toggleMutation.mutate({ id, is_active: v })}
                            productCounts={productCounts}
                          />
                        ))
                      )}
                    </TableBody>
                  </Table>
                </SortableContext>
              </DndContext>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCategory ? "ক্যাটাগরি এডিট করুন" : "নতুন ক্যাটাগরি যোগ করুন"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>নাম (English)</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="abaya" />
              </div>
              <div className="space-y-2">
                <Label>নাম (বাংলা)</Label>
                <Input value={form.name_bn} onChange={(e) => setForm({ ...form, name_bn: e.target.value })} placeholder="আবায়া" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto-generated from name" />
            </div>
            <div className="space-y-2">
              <Label>বিবরণ (English)</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
              <LanguageMixWarning value={form.description} field="English description" />
            </div>
            <div className="space-y-2">
              <Label>বিবরণ (বাংলা)</Label>
              <Textarea value={form.description_bn} onChange={(e) => setForm({ ...form, description_bn: e.target.value })} rows={2} />
              <LanguageMixWarning value={form.description_bn} field="বাংলা বিবরণ" />
            </div>
            <div className="space-y-2">
              <Label>ক্যাটাগরি ইমেজ</Label>
              <ImageUpload value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} />
              <Input className="mt-2" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="অথবা URL পেস্ট করুন..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>আইটেম কাউন্ট লেবেল</Label>
                <Input value={form.item_count} onChange={(e) => setForm({ ...form, item_count: e.target.value })} placeholder="120+ Items" />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>সক্রিয়</Label>
              </div>
            </div>
            <Button className="w-full gap-2" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name}>
              <Save className="w-4 h-4" />
              {saveMutation.isPending ? "সেভ হচ্ছে..." : "সেভ করুন"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ক্যাটাগরি মুছে ফেলবেন?</AlertDialogTitle>
            <AlertDialogDescription>এই ক্যাটাগরি মুছে ফেললে আর ফেরত পাওয়া যাবে না। প্রোডাক্টগুলো অক্ষত থাকবে।</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>বাতিল</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) deleteMutation.mutate(deleteId); setDeleteId(null); }} className="bg-destructive text-destructive-foreground">মুছে ফেলুন</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminCategories;
