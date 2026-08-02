import { AlertTriangle } from "lucide-react";

import { analyseLanguageMix } from "@/lib/seo/languageMix";

interface LanguageMixWarningProps {
  /** Text being edited (a description, meta description, etc.). */
  value?: string | null;
  /** Optional label shown before the warning, e.g. "Description". */
  field?: string;
  className?: string;
}

/**
 * Inline editor warning: fires when Bengali and English keywords are forced
 * into the same paragraph, and suggests splitting into separate sections.
 */
const LanguageMixWarning = ({ value, field, className = "" }: LanguageMixWarningProps) => {
  const text = (value ?? "").trim();
  if (!text) return null;

  const report = analyseLanguageMix(text);
  if (report.severity === "ok") return null;

  const tone =
    report.severity === "error"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : "border-amber-500/40 bg-amber-500/10 text-amber-600";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-md border px-3 py-2 text-xs space-y-1 ${tone} ${className}`}
    >
      <div className="flex items-center gap-1.5 font-medium">
        <AlertTriangle className="w-3.5 h-3.5" />
        {field ? `${field}: ` : ""}ভাষা-মিশ্রণ সতর্কতা
      </div>
      {report.warnings.map((w) => (
        <p key={w.index}>{w.message}</p>
      ))}
      {report.suggestion && <p className="opacity-90">{report.suggestion}</p>}
    </div>
  );
};

export default LanguageMixWarning;
