import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, User, ArrowLeft, Phone, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import SEOHead from "@/components/seo/SEOHead";
import { checkIfBlocked } from "@/hooks/useBlockedUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { loginSchema, signupSchema, resetPasswordSchema } from "@/lib/validation/schemas";
import { getFriendlyError } from "@/lib/error/getFriendlyError";


type AuthView = "login" | "signup" | "forgot-password";

const Auth = () => {
  const [view, setView] = useState<AuthView>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [formData, setFormData] = useState({ email: "", password: "", fullName: "", phone: "" });

  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const referralCode = searchParams.get("ref");
  const redirectTo = searchParams.get("redirect");

  useEffect(() => {
    if (user) {
      navigate(redirectTo || "/", { replace: true });
    }
  }, [user, navigate, redirectTo]);

  /**
   * Kick off Google OAuth. On failure we surface a friendly bilingual toast
   * — most failures here are "Unsupported provider" before Google is enabled.
   */
  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (error) throw error;
    } catch (error) {
      toast({
        title: "Google sign-in failed",
        description: getFriendlyError(error),
        variant: "destructive",
      });
      setGoogleLoading(false);
    }
  };

  /**
   * Forgot-password flow: validate the email with Zod first, then trigger
   * Supabase's password reset email. Any thrown error is normalised.
   */
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = resetPasswordSchema.safeParse({ email: formData.email });
    if (!parsed.success) {
      toast({
        title: "তথ্য অসম্পূর্ণ / Invalid input",
        description: getFriendlyError(parsed.error),
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: `${window.location.origin}/auth?redirect=/profile`,
      });
      if (error) throw error;
      setResetSent(true);
      toast({ title: "✅ Email Sent!", description: "Check your inbox for the password reset link" });
    } catch (error) {
      toast({
        title: "Error",
        description: getFriendlyError(error, "Failed to send reset email"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Unified login / signup submit handler.
   * 1. Validate the relevant Zod schema (login vs signup).
   * 2. Call the appropriate auth method.
   * 3. Map any error to a friendly bilingual toast.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Pre-flight client-side validation — saves a network round-trip.
    const schema = view === "login" ? loginSchema : signupSchema;
    const parsed = schema.safeParse(formData);
    if (!parsed.success) {
      toast({
        title: "তথ্য অসম্পূর্ণ / Invalid input",
        description: getFriendlyError(parsed.error),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      if (view === "login") {
        const { error } = await signIn(formData.email, formData.password);
        if (error) throw error;
        // Post-login: surface a friendly block message instead of letting the
        // user bounce around with no feedback.
        const { data: { user: loggedUser } } = await supabase.auth.getUser();
        if (loggedUser) {
          const blockStatus = await checkIfBlocked(loggedUser.id);
          if (blockStatus.isBlocked) {
            toast({
              title: "অ্যাকাউন্ট বন্ধ",
              description: blockStatus.reason,
              variant: "destructive",
            });
            return; // BlockedUserWarning overlay takes over.
          }
        }
        toast({ title: "Welcome!", description: "Successfully signed in" });
        navigate(redirectTo || "/");
      } else {
        const { error, session } = await signUp(
          formData.email,
          formData.password,
          formData.fullName,
          formData.phone,
        );
        if (error) throw error;
        if (session) {
          toast({ title: "Welcome!", description: "Your account has been created" });
          navigate(redirectTo || "/");
        } else {
          toast({ title: "Account Created!", description: "Please verify your email" });
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: getFriendlyError(error, "Authentication failed"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const isLogin = view === "login";
  const isForgot = view === "forgot-password";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <SEOHead title={isLogin ? "সাইন ইন" : "অ্যাকাউন্ট তৈরি করুন"} noIndex />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
          <AnimatePresence mode="wait">
            {isForgot ? (
              <motion.div key="forgot" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
                <div className="text-center mb-8">
                  <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-4">
                    <Mail className="w-7 h-7 text-primary-foreground" />
                  </div>
                  <h1 className="font-display text-2xl font-bold text-foreground">Reset Password</h1>
                  <p className="text-muted-foreground mt-2">
                    {resetSent ? "Check your email for the reset link" : "Enter your email to receive a reset link"}
                  </p>
                </div>

                {resetSent ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-primary/10 rounded-xl text-center">
                      <p className="text-sm text-primary font-medium">📧 Password reset link sent to</p>
                      <p className="text-sm font-semibold mt-1">{formData.email}</p>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      Didn't receive it? Check your spam folder or try again.
                    </p>
                    <Button variant="outline" className="w-full" onClick={() => { setResetSent(false); }}>
                      Try Again
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="reset-email">Email Address</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input id="reset-email" type="email" placeholder="Your email address" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="pl-10" required />
                      </div>
                    </div>
                    <Button type="submit" className="w-full btn-gold h-12" disabled={loading}>
                      {loading ? "Sending..." : "Send Reset Link"}
                      {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
                    </Button>
                  </form>
                )}

                <div className="mt-6 text-center">
                  <button type="button" onClick={() => { setView("login"); setResetSent(false); }} className="text-primary hover:underline text-sm inline-flex items-center gap-1">
                    <ArrowLeft className="w-3 h-3" /> Back to Sign In
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="auth" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}>
                <div className="text-center mb-8">
                  <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-4">
                    <span className="font-display text-primary-foreground font-bold text-2xl">D</span>
                  </div>
                  <h1 className="font-display text-2xl font-bold text-foreground">
                    {isLogin ? "Welcome Back" : "Create Account"}
                  </h1>
                  <p className="text-muted-foreground mt-2">
                    {isLogin ? "Sign in to your account" : "Join Dubai Borka House today"}
                  </p>
                </div>

                <div className="space-y-3 mb-6">
                  <Button type="button" variant="outline" className="w-full gap-3 h-12 border-border hover:border-primary/50 hover:bg-primary/5" onClick={handleGoogleSignIn} disabled={googleLoading}>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    {googleLoading ? "Please wait..." : "Sign in with Google"}
                  </Button>
                </div>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-3 text-muted-foreground">or with email</span></div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  {!isLogin && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="fullName">Full Name</Label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <Input id="fullName" type="text" placeholder="Your full name" value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} className="pl-10" required={!isLogin} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone Number</Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <Input id="phone" type="tel" placeholder="01XXXXXXXXX" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="pl-10" />
                        </div>
                        <p className="text-xs text-muted-foreground">Saved to your profile (optional)</p>
                      </div>
                    </>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input id="email" type="email" placeholder="Your email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="pl-10" required />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input id="password" type={showPassword ? "text" : "password"} placeholder="Your password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="pl-10 pr-10" required minLength={6} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {isLogin && (
                    <div className="text-right">
                      <button type="button" onClick={() => setView("forgot-password")} className="text-xs text-primary hover:underline">
                        Forgot Password?
                      </button>
                    </div>
                  )}

                  <Button type="submit" className="w-full btn-gold h-12" disabled={loading}>
                    {loading ? "Please wait..." : isLogin ? "Sign In" : "Create Account"}
                  </Button>
                  
                </form>

                {referralCode && (
                  <div className="mt-4 p-3 bg-primary/10 rounded-lg text-center">
                    <p className="text-sm text-primary font-medium">🎁 Referral Code: {referralCode}</p>
                    <p className="text-xs text-muted-foreground">Sign up to get 10% discount!</p>
                  </div>
                )}

                <div className="mt-6 text-center">
                  <button type="button" onClick={() => setView(isLogin ? "signup" : "login")} className="text-primary hover:underline text-sm">
                    {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;
