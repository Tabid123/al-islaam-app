import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Copy, Check } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface ReversalAlert {
  id: string;
  amount: number | null;
  sender_phone: string | null;
  ussd_code: string | null;
  sms_body: string;
  created_at: string;
  dismissed_at: string | null;
}

interface Props {
  iconClassName?: string;
  buttonClassName?: string;
}

export function ReversalAlertsHeader({ iconClassName = 'h-5 w-5', buttonClassName = '' }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: alerts } = useQuery({
    queryKey: ['reversal-alerts-24h'],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('reversal_alerts')
        .select('*')
        .is('dismissed_at', null)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as ReversalAlert[];
    },
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel('reversal-alerts-header')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reversal_alerts' }, () => {
        queryClient.invalidateQueries({ queryKey: ['reversal-alerts-24h'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('reversal_alerts')
        .update({ dismissed_at: new Date().toISOString(), dismissed_by: user?.id })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reversal-alerts-24h'] }),
  });

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'La koobiyay', description: text });
  };

  const count = alerts?.length || 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`relative p-2 rounded-full hover:bg-white/20 ${buttonClassName}`}
          title="Reversal Alerts"
          aria-label="Reversal Alerts"
        >
          <AlertTriangle className={`${iconClassName} ${count > 0 ? 'text-red-300 animate-pulse' : 'text-white/80'}`} />
          {count > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1 bg-red-600 text-white text-[10px] rounded-full flex items-center justify-center">
              {count}
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0 max-h-[70vh] overflow-y-auto">
        <div className="p-3 border-b bg-red-50 dark:bg-red-950/30">
          <div className="flex items-center gap-2 font-semibold text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4" />
            Reversal Alerts (24 saac)
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fariimaha lacag-celin ah ee 24-saacii la soo dhaafay
          </p>
        </div>
        <div className="divide-y">
          {count === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              ✅ Wax reversal ah ma jiraan
            </div>
          )}
          {alerts?.map((a) => (
            <div key={a.id} className="p-3 space-y-2 hover:bg-muted/50">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {format(new Date(a.created_at), 'dd MMM HH:mm')}
                </span>
                {a.amount != null && (
                  <span className="font-bold text-red-600">${a.amount}</span>
                )}
              </div>
              {a.sender_phone && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Lambar: </span>
                  <span className="font-mono">{a.sender_phone}</span>
                </div>
              )}
              {a.ussd_code && (
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-2 py-1 rounded bg-muted font-mono text-sm break-all">
                    {a.ussd_code}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copy(a.ussd_code!)}
                    className="h-8 px-2"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground line-clamp-2">{a.sms_body}</p>
              <Button
                size="sm"
                variant="ghost"
                className="w-full h-7 text-xs"
                onClick={() => dismiss.mutate(a.id)}
                disabled={dismiss.isPending}
              >
                <Check className="h-3 w-3 mr-1" /> Xaqiiji oo qari
              </Button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
