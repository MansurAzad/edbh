interface Props {
  step: number;
}

export default function CheckoutSteps({ step }: Props) {
  return (
    <div className="flex items-center justify-center gap-4 mb-12">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {s}
          </div>
          <span className={`hidden sm:block ${step >= s ? "text-foreground" : "text-muted-foreground"}`}>
            {s === 1 ? "Shipping" : s === 2 ? "Payment" : "Review"}
          </span>
          {s < 3 && <div className="w-12 h-0.5 bg-border" />}
        </div>
      ))}
    </div>
  );
}
