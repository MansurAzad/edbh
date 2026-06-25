import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Calendar, Clock, ArrowRight, Search, Tag } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Input } from "@/components/ui/input";
import SEOHead from "@/components/seo/SEOHead";
import { buildBlogListSeo } from "@/lib/seo/config";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import StructuredData, { articleSchema } from "@/components/seo/StructuredData";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  category: string;
  image_url: string | null;
  author_name: string | null;
  published_at: string | null;
  read_time: string | null;
}

const Blog = () => {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPost, setExpandedPost] = useState<string | null>(null);

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["blog-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("is_published", true)
        .order("published_at", { ascending: false });
      if (error) throw error;
      return data as BlogPost[];
    },
  });

  const categories = ["All", ...Array.from(new Set(posts.map((p) => p.category)))];

  const filteredPosts = posts.filter((post) => {
    const matchesCategory = selectedCategory === "All" || post.category === selectedCategory;
    const matchesSearch =
      post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (post.excerpt || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const featuredPost = filteredPosts[0];
  const regularPosts = selectedCategory === "All" && !searchQuery ? filteredPosts.slice(1) : filteredPosts;

  // Blog listing structured data
  const blogListSchema = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "দুবাই বোরকা হাউস ব্লগ",
    description: "ইসলামিক ফ্যাশন টিপস, স্টাইলিং গাইড, ট্রেন্ড আপডেট ও বোরকা-আবায়া কেনার গাইড।",
    url: "https://dubaiborkahouse.com/blog",
    publisher: {
      "@type": "Organization",
      name: "Dubai Borka House",
    },
    blogPost: posts.slice(0, 10).map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      description: post.excerpt || "",
      datePublished: post.published_at || "",
      author: { "@type": "Organization", name: post.author_name || "Dubai Borka House" },
      image: post.image_url || "",
      url: `https://dubaiborkahouse.com/blog/${post.slug}`,
    })),
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead {...buildBlogListSeo()} />
      <StructuredData data={blogListSchema} />
      <Header />
      <Breadcrumbs />
      <main className="pt-4 pb-20">
        <div className="bg-card border-b border-border py-12 mb-8">
          <div className="container mx-auto px-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
              <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">
                <span className="text-foreground">Our </span>
                <span className="text-gradient-gold">Blog</span>
              </h1>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Discover fashion trends, styling tips and much more from our blog.
              </p>
            </motion.div>
          </div>
        </div>

        <div className="container mx-auto px-4">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-8">
            <div className="relative w-full lg:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input type="text" placeholder="Search blog..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${selectedCategory === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[16/10] bg-muted rounded-xl mb-4" />
                  <div className="h-4 bg-muted rounded w-1/4 mb-2" />
                  <div className="h-6 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-4 bg-muted rounded w-full" />
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted-foreground text-lg">Blog posts coming soon!</p>
            </div>
          ) : (
            <>
              {featuredPost && selectedCategory === "All" && !searchQuery && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
                  <StructuredData data={articleSchema({ title: featuredPost.title, description: featuredPost.excerpt || "", image: featuredPost.image_url || "", date: featuredPost.published_at || "", author: featuredPost.author_name || undefined })} />
                  <div className="relative rounded-2xl overflow-hidden group cursor-pointer" onClick={() => setExpandedPost(expandedPost === featuredPost.id ? null : featuredPost.id)}>
                    <div className="aspect-[21/9] relative">
                      <img src={featuredPost.image_url || "/placeholder.svg"} alt={featuredPost.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-8">
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-primary text-primary-foreground mb-4">
                        <Tag className="w-3 h-3" />
                        Featured
                      </span>
                      <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3">{featuredPost.title}</h2>
                      <p className="text-muted-foreground max-w-2xl mb-4">{featuredPost.excerpt}</p>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {featuredPost.published_at && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {new Date(featuredPost.published_at).toLocaleDateString("bn-BD")}
                          </span>
                        )}
                        {featuredPost.read_time && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {featuredPost.read_time}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {expandedPost === featuredPost.id && featuredPost.content && (
                    <div className="card-luxury mt-4 prose prose-sm max-w-none text-muted-foreground">
                      <ReactMarkdown>{featuredPost.content}</ReactMarkdown>
                    </div>
                  )}
                </motion.div>
              )}

              <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                {regularPosts.map((post, index) => (
                  <motion.article key={post.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }} className="group">
                    <div className="card-luxury h-full flex flex-col">
                      <div className="relative aspect-[16/10] rounded-xl overflow-hidden mb-4 cursor-pointer" onClick={() => setExpandedPost(expandedPost === post.id ? null : post.id)}>
                        <img src={post.image_url || "/placeholder.svg"} alt={post.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy" />
                        <span className="absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-semibold bg-card/90 text-foreground backdrop-blur-sm">{post.category}</span>
                      </div>
                      <div className="flex-1 flex flex-col">
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                          {post.published_at && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(post.published_at).toLocaleDateString("bn-BD")}
                            </span>
                          )}
                          {post.read_time && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {post.read_time}
                            </span>
                          )}
                        </div>
                        <h3 className="font-display text-xl font-semibold text-foreground mb-2 group-hover:text-primary transition-colors cursor-pointer" onClick={() => setExpandedPost(expandedPost === post.id ? null : post.id)}>
                          {post.title}
                        </h3>
                        <p className="text-muted-foreground text-sm flex-1 mb-4">{post.excerpt}</p>
                        {expandedPost === post.id && post.content && (
                          <div className="prose prose-sm max-w-none text-muted-foreground mb-4 border-t border-border pt-4">
                            <ReactMarkdown>{post.content}</ReactMarkdown>
                          </div>
                        )}
                        <button onClick={() => setExpandedPost(expandedPost === post.id ? null : post.id)} className="inline-flex items-center gap-2 text-sm font-medium text-primary group/btn">
                          {expandedPost === post.id ? "Show Less" : "Read More"}
                          <ArrowRight className={`w-4 h-4 transition-transform ${expandedPost === post.id ? "rotate-90" : "group-hover/btn:translate-x-1"}`} />
                        </button>
                      </div>
                    </div>
                  </motion.article>
                ))}
              </div>

              {filteredPosts.length === 0 && (
                <div className="text-center py-20">
                  <p className="text-muted-foreground text-lg">No blog posts found.</p>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Blog;
