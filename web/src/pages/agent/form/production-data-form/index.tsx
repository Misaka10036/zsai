import { FormContainer } from '@/components/form-container';
import NumberInput from '@/components/originui/number-input';
import { SelectWithSearch } from '@/components/originui/select-with-search';
import { RAGFlowFormItem } from '@/components/ragflow-form';
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
import {
  SeafileDirectoryTree,
  SeafileLibrarySelect,
} from '@/pages/user-setting/data-source/component/seafile-browser';
import { FormTooltip } from '@/components/ui/tooltip';
import { DataSourceKey } from '@/pages/user-setting/data-source/constant';
import { useListDataSource } from '@/pages/user-setting/data-source/hooks';
import { zodResolver } from '@hookform/resolvers/zod';
import { memo, useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { initialProductionDataValues } from '../../constant';
import { useFormValues } from '../../hooks/use-form-values';
import { useWatchFormChange } from '../../hooks/use-watch-form-change';
import { INextOperatorForm } from '../../interface';
import { FormWrapper } from '../components/form-wrapper';

const schema = z.object({
  connector_id: z.string().min(1),
  path: z.string().min(1),
  default_repo_id: z.string().optional(),
  filename_regex: z.string().min(1),
  week_mode: z.string(),
  timezone: z.string().min(1),
  sample_limit: z.number().int().positive(),
  skip_if_missing: z.boolean().optional(),
});

function Label({ label, tip }: { label: string; tip: string }) {
  return (
    <FormLabel className="flex items-center gap-1">
      {label}
      <FormTooltip tooltip={tip} />
    </FormLabel>
  );
}

function ProductionDataForm({ node }: INextOperatorForm) {
  const { t } = useTranslation();
  const { list, isFetching } = useListDataSource();
  const defaults = useFormValues(initialProductionDataValues, node);
  const form = useForm<z.infer<typeof schema>>({
    defaultValues: defaults,
    resolver: zodResolver(schema),
    mode: 'onChange',
  });
  useWatchFormChange(node?.id, form);
  const connectorId = useWatch({ control: form.control, name: 'connector_id' });
  const repoId = useWatch({ control: form.control, name: 'default_repo_id' });
  const options = useMemo(
    () =>
      (list || [])
        .filter((item) => item.source === DataSourceKey.SEAFILE)
        .map((item) => ({ value: item.id, label: item.name || item.id })),
    [list],
  );
  useEffect(() => {
    if (!form.getValues('connector_id') && options.length)
      form.setValue('connector_id', options[0].value, { shouldDirty: true });
  }, [form, options]);

  return (
    <Form {...form}>
      <FormWrapper>
        <FormContainer>
          <FormField
            control={form.control}
            name="connector_id"
            render={({ field }) => (
              <FormItem>
                <Label
                  label={t('flow.productionDataConnector')}
                  tip={t('flow.productionDataConnectorTip')}
                />
                <FormControl>
                  <SelectWithSearch
                    {...field}
                    options={options}
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
            name="default_repo_id"
            render={({ field }) => (
              <FormItem>
                <Label
                  label={t('flow.productionDataRepo')}
                  tip={t('flow.productionDataRepoTip')}
                />
                <FormControl>
                  <SeafileLibrarySelect
                    connectorId={connectorId}
                    value={field.value}
                    allowClear
                    onChange={(next) => {
                      const previous = field.value || '';
                      field.onChange(next);
                      if (next !== previous) {
                        form.setValue('path', '/', {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      }
                    }}
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
                <Label
                  label={t('flow.productionDataPath')}
                  tip={t('flow.productionDataPathTip')}
                />
                <FormControl>
                  <SeafileDirectoryTree
                    connectorId={connectorId}
                    repoId={repoId}
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <RAGFlowFormItem
            name="filename_regex"
            label={t('flow.productionDataFilename')}
            tooltip={t('flow.productionDataFilenameTip')}
          >
            <Input />
          </RAGFlowFormItem>
          <FormField
            control={form.control}
            name="week_mode"
            render={({ field }) => (
              <FormItem>
                <Label
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
          <RAGFlowFormItem
            name="timezone"
            label={t('flow.seafileTimezone')}
            tooltip={t('flow.seafileTimezoneTip')}
          >
            <Input />
          </RAGFlowFormItem>
          <RAGFlowFormItem
            name="sample_limit"
            label={t('flow.productionDataSampleLimit')}
            tooltip={t('flow.productionDataSampleLimitTip')}
          >
            <NumberInput className="w-full" />
          </RAGFlowFormItem>
          <FormField
            control={form.control}
            name="skip_if_missing"
            render={({ field }) => (
              <FormItem>
                <Label
                  label={t('flow.productionDataSkipIfMissing')}
                  tip={t('flow.productionDataSkipIfMissingTip')}
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

export default memo(ProductionDataForm);
