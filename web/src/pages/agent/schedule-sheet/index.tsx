import { ButtonLoading } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  useFetchAgent,
  useFetchAgentSchedule,
  useUpdateAgentSchedule,
} from '@/hooks/use-agent-request';
import { cn } from '@/lib/utils';
import dayjs from 'dayjs';
import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface IScheduleSheetProps {
  hideModal: (open: boolean) => void;
}

const INTERVAL_OPTIONS = [
  { label: '1 min', value: 60 },
  { label: '5 min', value: 300 },
  { label: '15 min', value: 900 },
  { label: '30 min', value: 1800 },
  { label: '1 hour', value: 3600 },
  { label: '6 hours', value: 21600 },
  { label: '12 hours', value: 43200 },
  { label: '24 hours', value: 86400 },
];

const getBrowserTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export function ScheduleSheet({ hideModal }: IScheduleSheetProps) {
  const { t } = useTranslation();
  const { data: agent } = useFetchAgent();
  const agentId = agent?.id ?? '';
  const { data: schedule } = useFetchAgentSchedule(agentId);
  const { updateAgentSchedule, loading } = useUpdateAgentSchedule();

  const [autoRun, setAutoRun] = useState(false);
  const [scheduleType, setScheduleType] = useState<'interval' | 'cron'>(
    'interval',
  );
  const [intervalSeconds, setIntervalSeconds] = useState(3600);
  const [cronExpr, setCronExpr] = useState('0 9 * * *');
  const [timeZone, setTimeZone] = useState(getBrowserTimeZone);
  const [scheduleInput, setScheduleInput] = useState('');

  // Sync form state when schedule data loads
  useEffect(() => {
    if (schedule) {
      setAutoRun(schedule.auto_run ?? false);
      setScheduleType(schedule.schedule_config?.type ?? 'interval');
      setIntervalSeconds(schedule.schedule_config?.seconds ?? 3600);
      setCronExpr(schedule.schedule_config?.expr ?? '0 9 * * *');
      setTimeZone(schedule.schedule_config?.tz ?? getBrowserTimeZone());
      setScheduleInput(schedule.schedule_input ?? '');
    }
  }, [schedule]);

  const handleSave = async () => {
    const config = autoRun
      ? scheduleType === 'cron'
        ? { type: 'cron' as const, expr: cronExpr, tz: timeZone || 'UTC' }
        : { type: 'interval' as const, seconds: intervalSeconds }
      : null;

    await updateAgentSchedule({
      agentId,
      auto_run: autoRun,
      schedule_config: config,
      schedule_input: scheduleInput || undefined,
    });
  };

  const statusLabel = (status?: string) => {
    switch (status) {
      case 'scheduled':
        return t('flow.schedule.statusScheduled');
      case 'running':
        return t('flow.schedule.statusRunning');
      case 'error':
        return t('flow.schedule.statusError');
      default:
        return t('flow.schedule.statusIdle');
    }
  };

  return (
    <Sheet open onOpenChange={hideModal} modal={false}>
      <SheetContent
        className={cn('top-20 h-auto flex flex-col p-0 gap-0')}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <SheetHeader className="p-5">
          <SheetTitle className="flex items-center gap-2.5">
            <Clock className="w-5 h-5" />
            {t('flow.schedule.title')}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-5 pb-5 overflow-y-auto">
          {/* Status indicator */}
          {schedule && (
            <div className="flex items-center justify-between p-3 rounded-lg border border-border-default bg-bg-card text-sm">
              <span className="text-text-secondary">
                {t('flow.schedule.runStatus')}
              </span>
              <span
                className={cn('font-medium', {
                  'text-green-600': schedule.run_status === 'scheduled',
                  'text-blue-600': schedule.run_status === 'running',
                  'text-red-600': schedule.run_status === 'error',
                  'text-text-secondary': schedule.run_status === 'idle',
                })}
              >
                {statusLabel(schedule.run_status)}
              </span>
            </div>
          )}

          {/* Next/Last run time */}
          {schedule?.auto_run && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              {schedule.next_run_time && (
                <div className="flex flex-col gap-1">
                  <span className="text-text-secondary">
                    {t('flow.schedule.nextRunTime')}
                  </span>
                  <span className="font-medium">
                    {dayjs
                      .unix(schedule.next_run_time)
                      .format('YYYY-MM-DD HH:mm')}
                  </span>
                </div>
              )}
              {schedule.last_run_time && (
                <div className="flex flex-col gap-1">
                  <span className="text-text-secondary">
                    {t('flow.schedule.lastRunTime')}
                  </span>
                  <span className="font-medium">
                    {dayjs
                      .unix(schedule.last_run_time)
                      .format('YYYY-MM-DD HH:mm')}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="schedule-enable">{t('flow.schedule.enable')}</Label>
            <Switch
              id="schedule-enable"
              checked={autoRun}
              onCheckedChange={setAutoRun}
            />
          </div>

          {autoRun && (
            <>
              {/* Schedule type selector */}
              <div className="flex flex-col gap-2">
                <Label>{t('flow.schedule.scheduleType')}</Label>
                <Select
                  value={scheduleType}
                  onValueChange={(v) =>
                    setScheduleType(v as 'interval' | 'cron')
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="interval">
                      {t('flow.schedule.interval')}
                    </SelectItem>
                    <SelectItem value="cron">
                      {t('flow.schedule.cron')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Interval config */}
              {scheduleType === 'interval' && (
                <div className="flex flex-col gap-2">
                  <Label>{t('flow.schedule.intervalValue')}</Label>
                  <Select
                    value={String(intervalSeconds)}
                    onValueChange={(v) => setIntervalSeconds(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERVAL_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={String(opt.value)}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Cron config */}
              {scheduleType === 'cron' && (
                <div className="flex flex-col gap-2">
                  <Label>{t('flow.schedule.cronExpression')}</Label>
                  <Input
                    value={cronExpr}
                    onChange={(e) => setCronExpr(e.target.value)}
                    placeholder="0 9 * * 1-5"
                  />
                  <p className="text-xs text-text-secondary">
                    {t('flow.schedule.cronHelp')}
                  </p>
                  <Label>{t('flow.schedule.timezone')}</Label>
                  <Input
                    value={timeZone}
                    onChange={(e) => setTimeZone(e.target.value)}
                    placeholder="UTC"
                  />
                  <p className="text-xs text-text-secondary">
                    {t('flow.schedule.timezoneHelp')}
                  </p>
                </div>
              )}

              {/* Schedule input */}
              <div className="flex flex-col gap-2">
                <Label>{t('flow.schedule.scheduleInput')}</Label>
                <Textarea
                  value={scheduleInput}
                  onChange={(e) => setScheduleInput(e.target.value)}
                  placeholder={t('flow.schedule.scheduleInputTip')}
                  rows={3}
                />
              </div>
            </>
          )}

          {/* Save button */}
          <ButtonLoading onClick={handleSave} loading={loading}>
            {t('common.save')}
          </ButtonLoading>
        </div>
      </SheetContent>
    </Sheet>
  );
}
