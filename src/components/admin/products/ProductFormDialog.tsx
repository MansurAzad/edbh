import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import ImageUpload from "@/components/admin/ImageUpload";
import GalleryImageUpload from "@/components/admin/GalleryImageUpload";
import VideoUpload from "@/components/admin/VideoUpload";
import type { AdminProduct, AdminProductInput } from "@/lib/admin/productHelpers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: AdminProduct | null;
  formData: AdminProductInput;
  setFormData: (data: AdminProductInput) => void;
  galleryUrls: string[];
  setGalleryUrls: (urls: string[]) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting?: boolean;
}

export default function ProductFormDialog({
  open, onOpenChange, editing, formData, setFormData, galleryUrls, setGalleryUrls, onSubmit, submitting,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Product" : "Add New Product"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input id="category" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} required />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Price (৳)</Label>
              <Input id="price" type="number" value={formData.price} onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sale_price">Sale Price (৳)</Label>
              <Input id="sale_price" type="number" value={formData.sale_price || ""} onChange={(e) => setFormData({ ...formData, sale_price: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stock">Stock</Label>
              <Input id="stock" type="number" value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Product Image</Label>
            <ImageUpload value={formData.image_url || ""} onChange={(url) => setFormData({ ...formData, image_url: url })} />
            <p className="text-xs text-muted-foreground">Or paste an image URL:</p>
            <Input id="image_url" placeholder="https://example.com/image.jpg" value={formData.image_url || ""} onChange={(e) => setFormData({ ...formData, image_url: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>গ্যালারি ইমেজ (একাধিক ছবি যুক্ত করুন)</Label>
            <GalleryImageUpload images={galleryUrls} onChange={setGalleryUrls} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={formData.description || ""} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sizes">Sizes (comma-separated)</Label>
              <Input id="sizes" value={formData.sizes?.join(", ") || ""} onChange={(e) => setFormData({ ...formData, sizes: e.target.value.split(",").map((s) => s.trim()) })} placeholder='52", 54", 56", 58", 60"' />
            </div>
            <div className="space-y-2">
              <Label htmlFor="colors">Colors (comma-separated)</Label>
              <Input id="colors" value={formData.colors?.join(", ") || ""} onChange={(e) => setFormData({ ...formData, colors: e.target.value.split(",").map((c) => c.trim()) })} placeholder="Black, White, Navy" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="material">Material / Fabric</Label>
              <Input id="material" value={formData.material || ""} onChange={(e) => setFormData({ ...formData, material: e.target.value })} placeholder="Nida, Zoom, Jorjet..." />
            </div>
            <div className="space-y-2">
              <Label>প্রোডাক্ট ভিডিও</Label>
              <VideoUpload value={formData.video_url || ""} onChange={(url) => setFormData({ ...formData, video_url: url })} />
              <p className="text-xs text-muted-foreground">অথবা ভিডিও URL পেস্ট করুন:</p>
              <Input id="video_url" placeholder="https://example.com/video.mp4" value={formData.video_url || ""} onChange={(e) => setFormData({ ...formData, video_url: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="featured" checked={formData.featured} onCheckedChange={(checked) => setFormData({ ...formData, featured: checked })} />
            <Label htmlFor="featured">Featured Product</Label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{editing ? "Update" : "Create"} Product</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
