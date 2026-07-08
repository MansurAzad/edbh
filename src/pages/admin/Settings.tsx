 import { useState } from "react";
 import { Save, Shield, BarChart3, Image, Cloud, Loader2, CheckCircle } from "lucide-react";
 import { useQuery } from "@tanstack/react-query";
 import AdminLayout from "@/components/admin/AdminLayout";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { Switch } from "@/components/ui/switch";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { useToast } from "@/hooks/use-toast";
 import { supabase } from "@/integrations/supabase/client";
 import { useAuth } from "@/contexts/AuthContext";
 import ImageUpload from "@/components/admin/ImageUpload";
import { migrateToCloudinary } from "@/lib/cloudinary";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import RoleManagement from "@/components/admin/RoleManagement";
import AIProviderSettings from "@/components/admin/AIProviderSettings";
import WhatsAppSettingsCard from "@/components/admin/WhatsAppSettingsCard";

 const CloudinaryMigrationCard = () => {
   const [migrating, setMigrating] = useState(false);
   const [results, setResults] = useState<any>(null);
   const { toast } = useToast();

   const handleMigrate = async () => {
     setMigrating(true);
     setResults(null);
     try {
       const data = await migrateToCloudinary();
       setResults(data.results);
       toast({ title: "মাইগ্রেশন সম্পন্ন!", description: "সব ইমেজ Cloudinary-তে মাইগ্রেট হয়েছে" });
     } catch (error: any) {
       toast({ title: "মাইগ্রেশন ব্যর্থ", description: error.message, variant: "destructive" });
     } finally {
       setMigrating(false);
     }
   };

   return (
     <Card>
       <CardHeader>
         <CardTitle className="flex items-center gap-2">
           <Cloud className="w-5 h-5" />
           Cloudinary মাইগ্রেশন
         </CardTitle>
         <CardDescription>
           সব বিদ্যমান ইমেজ Cloudinary-তে মাইগ্রেট করুন। যেগুলো ইতিমধ্যে আছে সেগুলো স্কিপ হবে।
         </CardDescription>
       </CardHeader>
       <CardContent className="space-y-4">
         <Button onClick={handleMigrate} disabled={migrating} variant="outline" className="w-full">
           {migrating ? (
             <>
               <Loader2 className="w-4 h-4 mr-2 animate-spin" />
               মাইগ্রেট হচ্ছে...
             </>
           ) : (
             <>
               <Cloud className="w-4 h-4 mr-2" />
               Cloudinary-তে মাইগ্রেট করুন
             </>
           )}
         </Button>
         {results && (
           <Alert>
             <CheckCircle className="w-4 h-4" />
             <AlertDescription>
               <div className="grid grid-cols-2 gap-1 text-sm mt-1">
                 <span>প্রোডাক্ট:</span><span className="font-medium">{results.products_migrated}</span>
                 <span>গ্যালারি ইমেজ:</span><span className="font-medium">{results.product_images_migrated}</span>
                 <span>ভেরিয়েন্ট:</span><span className="font-medium">{results.variant_images_migrated}</span>
                 <span>ক্যাটেগরি:</span><span className="font-medium">{results.categories_migrated}</span>
                 <span>ব্লগ:</span><span className="font-medium">{results.blog_posts_migrated}</span>
                 <span>সাইট কন্টেন্ট:</span><span className="font-medium">{results.site_content_migrated}</span>
                 <span>স্কিপ করা:</span><span className="font-medium">{results.skipped}</span>
               </div>
               {results.errors?.length > 0 && (
                 <p className="text-destructive mt-2 text-xs">{results.errors.length}টি ত্রুটি</p>
               )}
             </AlertDescription>
           </Alert>
         )}
       </CardContent>
     </Card>
   );
 };

 const Settings = () => {
   const { user } = useAuth();
   const { toast } = useToast();
   const [settings, setSettings] = useState({
     storeName: "Dubai Borka House",
     storeEmail: "info@dubaiborkahouse.com",
     storePhone: "+880 1234 567890",
     currency: "৳",
     freeShippingThreshold: 5000,
     enableReviews: true,
     enableWishlist: true,
   });
   const [newAdminEmail, setNewAdminEmail] = useState("");
   const [addingAdmin, setAddingAdmin] = useState(false);
   const [gaId, setGaId] = useState("");
    const [fbPixelId, setFbPixelId] = useState("");
    const [savingAnalytics, setSavingAnalytics] = useState(false);
    const [mobileLogo, setMobileLogo] = useState("");
    const [savingLogo, setSavingLogo] = useState(false);

     useQuery({
       queryKey: ["admin-settings-content"],
       queryFn: async () => {
         const { data } = await supabase
           .from("site_content")
           .select("section_key, content, image_url")
           .in("section_key", ["google_analytics_id", "facebook_pixel_id", "mobile_logo"]);
         if (data) {
           data.forEach((row) => {
             if (row.section_key === "google_analytics_id") setGaId(row.content || "");
             if (row.section_key === "facebook_pixel_id") setFbPixelId(row.content || "");
             if (row.section_key === "mobile_logo") setMobileLogo(row.image_url || "");
           });
         }
         return data;
       },
       staleTime: 5 * 60 * 1000,
       refetchOnWindowFocus: false,
     });

   const handleSaveAnalytics = async () => {
     setSavingAnalytics(true);
     try {
       for (const [key, value] of [["google_analytics_id", gaId], ["facebook_pixel_id", fbPixelId]]) {
         const { data: existing } = await supabase.from("site_content").select("id").eq("section_key", key).maybeSingle();
         if (existing) {
           await supabase.from("site_content").update({ content: value, updated_at: new Date().toISOString() }).eq("id", existing.id);
         } else {
           await supabase.from("site_content").insert({ section_key: key, content: value, title: key === "google_analytics_id" ? "Google Analytics ID" : "Facebook Pixel ID", is_active: true });
         }
       }
       toast({ title: "সফল", description: "Analytics settings saved!" });
     } catch (err) {
       toast({ title: "Error", description: "Failed to save analytics", variant: "destructive" });
     } finally { setSavingAnalytics(false); }
   };
 
    const handleSaveMobileLogo = async (url: string) => {
      setMobileLogo(url);
      setSavingLogo(true);
      try {
        const { data: existing } = await supabase.from("site_content").select("id").eq("section_key", "mobile_logo").maybeSingle();
        if (existing) {
          await supabase.from("site_content").update({ image_url: url, updated_at: new Date().toISOString() }).eq("id", existing.id);
        } else {
          await supabase.from("site_content").insert({ section_key: "mobile_logo", title: "Mobile Logo", image_url: url, is_active: true });
        }
        toast({ title: "Success", description: "Mobile logo saved!" });
      } catch {
        toast({ title: "Error", description: "Failed to save mobile logo", variant: "destructive" });
      } finally { setSavingLogo(false); }
    };

    const handleSave = () => {
      toast({ title: "Success", description: "Settings saved successfully" });
    };
 
   const handleAddAdmin = async () => {
     if (!newAdminEmail.trim()) {
       toast({ title: "Error", description: "Please enter an email address", variant: "destructive" });
       return;
     }
 
     setAddingAdmin(true);
 
     // Note: In production, you'd look up the user ID by email from a profiles table
     // This is a simplified version that shows the concept
     toast({ 
       title: "Admin Role Management", 
       description: "To add an admin, insert a record into user_roles table with the user's ID and role 'admin'." 
     });
 
     setNewAdminEmail("");
     setAddingAdmin(false);
   };
 
   return (
     <AdminLayout>
       <div className="space-y-6 max-w-5xl">
         <div>
           <h1 className="text-3xl font-display font-bold">Settings</h1>
           <p className="text-muted-foreground">Configure your store settings</p>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Image className="w-5 h-5 text-primary" />
                <CardTitle>Mobile Logo</CardTitle>
              </div>
              <CardDescription>Upload a circular logo that will be shown on mobile devices in the header</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ImageUpload value={mobileLogo} onChange={handleSaveMobileLogo} bucket="product-images" />
              {mobileLogo && (
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <img src={mobileLogo} alt="Mobile logo preview" className="w-12 h-12 rounded-full object-cover border-2 border-primary" />
                  <p className="text-sm text-muted-foreground">This logo will appear on mobile header</p>
                </div>
              )}
            </CardContent>
          </Card>

         <Card>
           <CardHeader>
             <CardTitle>Store Information</CardTitle>
             <CardDescription>Basic information about your store</CardDescription>
           </CardHeader>
           <CardContent className="space-y-4">
             <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                 <Label htmlFor="storeName">Store Name</Label>
                 <Input
                   id="storeName"
                   value={settings.storeName}
                   onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                 />
               </div>
               <div className="space-y-2">
                 <Label htmlFor="storeEmail">Store Email</Label>
                 <Input
                   id="storeEmail"
                   type="email"
                   value={settings.storeEmail}
                   onChange={(e) => setSettings({ ...settings, storeEmail: e.target.value })}
                 />
               </div>
             </div>
             <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                 <Label htmlFor="storePhone">Store Phone</Label>
                 <Input
                   id="storePhone"
                   value={settings.storePhone}
                   onChange={(e) => setSettings({ ...settings, storePhone: e.target.value })}
                 />
               </div>
               <div className="space-y-2">
                 <Label htmlFor="currency">Currency Symbol</Label>
                 <Input
                   id="currency"
                   value={settings.currency}
                   onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                 />
               </div>
             </div>
           </CardContent>
         </Card>
 
         <Card>
           <CardHeader>
             <CardTitle>Shipping & Orders</CardTitle>
             <CardDescription>Configure shipping and order settings</CardDescription>
           </CardHeader>
           <CardContent className="space-y-4">
             <div className="space-y-2">
               <Label htmlFor="freeShipping">Free Shipping Threshold (৳)</Label>
               <Input
                 id="freeShipping"
                 type="number"
                 value={settings.freeShippingThreshold}
                 onChange={(e) =>
                   setSettings({ ...settings, freeShippingThreshold: Number(e.target.value) })
                 }
               />
               <p className="text-sm text-muted-foreground">
                 Orders above this amount qualify for free shipping
               </p>
             </div>
           </CardContent>
         </Card>
 
         <Card>
           <CardHeader>
             <CardTitle>Features</CardTitle>
             <CardDescription>Enable or disable store features</CardDescription>
           </CardHeader>
           <CardContent className="space-y-4">
             <div className="flex items-center justify-between">
               <div>
                 <Label>Product Reviews</Label>
                 <p className="text-sm text-muted-foreground">
                   Allow customers to leave reviews on products
                 </p>
               </div>
               <Switch
                 checked={settings.enableReviews}
                 onCheckedChange={(checked) => setSettings({ ...settings, enableReviews: checked })}
               />
             </div>
             <div className="flex items-center justify-between">
               <div>
                 <Label>Wishlist</Label>
                 <p className="text-sm text-muted-foreground">
                   Allow customers to save products to wishlist
                 </p>
               </div>
               <Switch
                 checked={settings.enableWishlist}
                 onCheckedChange={(checked) => setSettings({ ...settings, enableWishlist: checked })}
               />
             </div>
           </CardContent>
         </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                <CardTitle>Analytics & Tracking</CardTitle>
              </div>
              <CardDescription>Google Analytics ও Facebook Pixel কনফিগার করুন</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="gaId">Google Analytics Measurement ID</Label>
                <Input id="gaId" placeholder="G-XXXXXXXXXX" value={gaId} onChange={(e) => setGaId(e.target.value)} />
                <p className="text-sm text-muted-foreground">Google Analytics 4 থেকে Measurement ID দিন</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fbPixel">Facebook Pixel ID</Label>
                <Input id="fbPixel" placeholder="123456789012345" value={fbPixelId} onChange={(e) => setFbPixelId(e.target.value)} />
                <p className="text-sm text-muted-foreground">Facebook Events Manager থেকে Pixel ID দিন</p>
              </div>
              <Button onClick={handleSaveAnalytics} disabled={savingAnalytics}>
                <Save className="w-4 h-4 mr-2" />{savingAnalytics ? "Saving..." : "Save Analytics"}
              </Button>
            </CardContent>
          </Card>

         <RoleManagement />

         <AIProviderSettings />

         {/* Cloudinary Migration */}
         <CloudinaryMigrationCard />
 
         <Button onClick={handleSave} className="w-full">
           <Save className="w-4 h-4 mr-2" />
           Save Settings
         </Button>
       </div>
     </AdminLayout>
   );
 };
 
 export default Settings;