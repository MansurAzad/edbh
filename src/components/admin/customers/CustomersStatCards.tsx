import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  total: number;
  registered: number;
  guest: number;
  blocked: number;
}

export default function CustomersStatCards({ total, registered, guest, blocked }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">মোট কাস্টমার</CardTitle>
        </CardHeader>
        <CardContent><div className="text-2xl font-bold">{total}</div></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">রেজিস্টার্ড</CardTitle>
        </CardHeader>
        <CardContent><div className="text-2xl font-bold text-primary">{registered}</div></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">গেস্ট</CardTitle>
        </CardHeader>
        <CardContent><div className="text-2xl font-bold text-muted-foreground">{guest}</div></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">ব্লকড</CardTitle>
        </CardHeader>
        <CardContent><div className="text-2xl font-bold text-destructive">{blocked}</div></CardContent>
      </Card>
    </div>
  );
}
