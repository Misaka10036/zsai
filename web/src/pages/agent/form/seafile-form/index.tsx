import { FormContainer } from '@/components/form-container';
import { SelectWithSearch } from '@/components/originui/select-with-search';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { FormTooltip } from '@/components/ui/tooltip';
import { DataSourceKey } from '@/pages/user-setting/data-source/constant';
import { useListDataSource } from '@/pages/user-setting/data-source/hooks';
import { zodResolver } from '@hookform/resolvers/zod';
import { memo, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { initialSeafileValues } from '../../constant';
import { useFormValues } from '../../hooks/use-form-values';
import { useWatchFormChange } from '../../hooks/use-watch-form-change';
import { INextOperatorForm } from '../../interface';
import { FormWrapper } from '../components/form-wrapper';

const FormSchema = z.object({
  connector_id: z.string(),
  path: z.string().optional(),
  filename_regex: z.string().optional(),
  week_mode: z.string().optional(),
  timezone: z.string().optional(),
  default_repo_id: z.string().optional(),
  require_complete: z.boolean().optional(),
});

function FieldTip({
  label,
  tip,
}: {
  label: string;
  tip: string;
}) {
  return (
    <FormLabel className="flex items-center gap-1">
      {label}
      <FormTooltip tooltip={tip} />
    </FormLabel>
  );
}

function SeafileForm({ node }: INextOperatorForm) {
  const { t } = useTranslation();
  const { list, isFetching } = useListDataSource();
  const defaultValues = useFormValues(initialSeafileValues, node);
  const form = useForm<z.infer<typeof FormSchema>>({
    defaultValues,
    resolver: zodResolver(FormSchema),
    mode: 'onChange',
  });
  useWatchFormChange(node?.id, form);

  const seafileOptions = useMemo(() => {
    return (list || [])
      .filter((item) => item.source === DataSourceKey.SEAFILE)
      .map((item) => ({
        value: item.id,
        label: item.name
          ? `${item.name}（${item.id.slice(0, 8)}…）`
          : item.id,
      }));
  }, [list]);

  useEffect(() => {
    const current = form.getValues('connector_id');
    if (current || seafileOptions.length === 0) {
      return;
    }
    form.setValue('connector_id', seafileOptions[0].value, {
      shouldDirty: true,
      shouldTouch: true,
    });
  }, [form, seafileOptions]);

  return (
    <Form {...form}>
      <FormWrapper>
        <FormContainer>
          <FormField
            control={form.control}
            name="connector_id"
            render={({ field }) => (
              <FormItem>
                <FieldTip
                  label={t('flow.seafileConnector')}
                  tip={t('flow.seafileConnectorTip')}
                />
                <FormControl>
                  <SelectWithSearch
                    {...field}
                    options={seafileOptions}
                    placeholder={
                      isFetching
                        ? t('flow.seafileConnectorLoading')
                        : t('flow.seafileConnectorPlaceholder')
                    }
                    allowClear={false}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="path"
            render={({ field }) => (
              <FormItem>
                <FieldTip
                  label={t('flow.seafilePath')}
                  tip={t('flow.seafilePathTip')}
                />
                <FormControl>
                  <Input
                    {...field}
                    placeholder={t('flow.seafilePathPlaceholder')}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="week_mode"
            render={({ field }) => (
              <FormItem>
                <FieldTip
                  label={t('flow.seafileWeekMode')}
                  tip={t('flow.seafileWeekModeTip')}
                />
                <FormControl>
                  <SelectWithSearch
                    {...field}
                    options={[
                      {
                        value: 'this_week',
                        label: t('flow.seafileWeekModeThisWeek'),
                      },
                      {
                        value: 'last_complete_week',
                        label: t('flow.seafileWeekModeLastWeek'),
                      },
                    ]}
                    allowClear={false}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="timezone"
            render={({ field }) => (
              <FormItem>
                <FieldTip
                  label={t('flow.seafileTimezone')}
                  tip={t('flow.seafileTimezoneTip')}
                />
                <FormControl>
                  <Input
                    {...field}
                    placeholder={t('flow.seafileTimezonePlaceholder')}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="filename_regex"
            render={({ field }) => (
              <FormItem>
                <FieldTip
                  label={t('flow.seafileFilenameRegex')}
                  tip={t('flow.seafileFilenameRegexTip')}
                />
                <FormControl>
                  <Input
                    {...field}
                    placeholder={t('flow.seafileFilenameRegexPlaceholder')}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="default_repo_id"
            render={({ field }) => (
              <FormItem>
                <FieldTip
                  label={t('flow.seafileDefaultRepo')}
                  tip={t('flow.seafileDefaultRepoTip')}
                />
                <FormControl>
                  <Input
                    {...field}
                    placeholder={t('flow.seafileDefaultRepoPlaceholder')}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="require_complete"
            render={({ field }) => (
              <FormItem>
                <FieldTip
                  label={t('flow.seafileRequireComplete')}
                  tip={t('flow.seafileRequireCompleteTip')}
                />
                <FormControl>
                  <Switch
                    checked={!!field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormContainer>
      </FormWrapper>
    </Form>
  );
}

export default memo(SeafileForm);
