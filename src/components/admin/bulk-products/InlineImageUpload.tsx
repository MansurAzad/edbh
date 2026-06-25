import { useRef, useState } from "react";
import { Loader2, Image as ImageIcon, CheckCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface Props {
  value: string;
  onChange: (url: string) => void;
}

const InlineImageUpload = ({ value, onChange }: Props) => {
  const [uploading, setUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("ইমেজ ফাইল দিন"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("সর্বোচ্চ 5MB"); return; }
    setUploading(true);
    try {
      const { uploadToCloudinary } = await import("@/lib/cloudinary");
      const result = await uploadToCloudinary(file, "products");
      if (!result.success) { toast.error(result.error || "Upload failed"); setUploading(false); return; }
      onChange(result.url!);
    } catch (err: any) {
      toast.error(err.message);
    }
    setUploading(false);
  };

  const applyUrl = () => {
    if (urlValue.trim()) {
      onChange(urlValue.trim());
      setUrlValue("");
      setShowUrlInput(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {value ? (
        <div className="relative group">
          <img src={value} alt="" className="w-10 h-10 rounded object-cover border" />
          <button
            type="button"
            className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onChange("")}
          >×</button>
        </div>
      ) : showUrlInput ? (
        <div className="flex items-center gap-1">
          <Input
            className="h-8 text-[11px] w-32 sm:w-40"
            placeholder="https://... URL"
            value={urlValue}
            onChange={e => setUrlValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyUrl(); } }}
            autoFocus
          />
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={applyUrl}>
            <CheckCircle className="w-3.5 h-3.5 text-primary" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowUrlInput(false)}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="w-10 h-10 rounded border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-primary/50 transition-colors"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            title="ফাইল আপলোড"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : <ImageIcon className="w-4 h-4 text-muted-foreground" />}
          </button>
          <button
            type="button"
            className="text-[9px] text-primary hover:underline whitespace-nowrap"
            onClick={() => setShowUrlInput(true)}
            title="URL দিন"
          >URL</button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { if (e.target.files?.[0]) upload(e.target.files[0]); e.target.value = ""; }}
      />
    </div>
  );
};

export default InlineImageUpload;
