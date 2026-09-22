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
import {
  SeafileDirectoryTree,
  SeafileLibrarySelect,
} from '@/pages/user-setting/data-source/component/seafile-browser';
import { FormTooltip } from '@/components/ui/tooltip';
import { useFetchKnowledgeList } from '@/hooks/use-knowledge-request';
import { DataSourceKey } from '@/pages/user-setting/data-source/constant';
import { useListDataSource } from '@/pages/user-setting/data-source/hooks';
import { zodResolver } from '@hookform/resolvers/zod';
import { memo, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { initialDatasetWriteValues } from '../../constant';
import { useFormValues } from '../../hooks/use-form-values';
import { useWatchFormChange } from '../../hooks/use-watch-form-change';
import { INextOperatorForm } from '../../interface';
import { FormWrapper } from '../components/form-wrapper';
import { PromptEditor } from '../components/prompt-editor';

const FormSchema = z.object({
  dataset_ids: z.array(z.string()).optional(),
  publish_policy: z.string().optional(),
  language: z.string().optional(),
  content: z.string().optional(),
  week_id: z.string().optional(),
  output_format: z.string().optional(),
  seafile_connector_id: z.string().optional(),
  seafile_repo_id: z.string().optional(),
  seafile_path: z.string().optional(),
});

function FieldTip({ label, tip }: { label: string; tip: string }) {
  return (
    <FormLabel className="flex items-center gap-1">
      {label}
      <FormTooltip tooltip={tip} />
    </FormLabel>
  );
}

function DatasetWriteForm({ node }: INextOperatorForm) {
  const { t } = useTranslation();
  const { list, loading } = useFetchKnowledgeList(false);
  const { list: dataSources, isFetching } = useListDataSource();
  const defaultValues = useFormValues(initialDatasetWriteValues, node);
  const form = useForm<z.infer<typeof FormSchema>>({
    defaultValues,
    resolver: zodResolver(FormSchema),
    mode: 'onChange',
  });
  useWatchFormChange(node?.id, form);
  const connectorId = useWatch({
    control: form.control,
    name: 'seafile_connector_id',
  });
  const repoId = useWatch({ control: form.control, name: 'seafile_repo_id' });

  const datasetOptions = useMemo(
    () =>
      (list || []).map((item) => ({
        value: item.id,
        label: item.name,
      })),
    [list],
  );
  const seafileOptions = useMemo(
    () =>
      (dataSources || [])
        .filter((item) => item.source === DataSourceKey.SEAFILE)
        .map((item) => ({
          value: item.id,
          label: item.name
            ? `${item.name}（${item.id.slice(0, 8)}…）`
            : item.id,
        })),
    [dataSources],
  );

  return (
    <Form {...form}>
      <FormWrapper>
        <FormContainer>
          <FormField
            control={form.control}
            name="dataset_ids"
            render={({ field }) => (
              <FormItem>
                <FieldTip
                  label={t('flow.datasetWriteKb')}
                  tip={t('flow.datasetWriteKbTip')}
                />
                <FormControl>
                  <SelectWithSearch
                    value={
                      Array.isArray(field.value) ? field.value[0] || '' : ''
                    }
                    onChange={(value) =>
                      field.onChange(value ? [value] : [])
                    }
                    options={datasetOptions}
                    placeholder={
                      loading
                        ? t('flow.datasetWriteKbLoading')
                        : t('flow.datasetWriteKbPlaceholder')
                    }
                    allowClear
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="output_format"
            render={({ field }) => (
              <FormItem>
                <FieldTip
                  label={t('flow.datasetWriteOutputFormat')}
                  tip={t('flow.datasetWriteOutputFormatTip')}
                />
                <FormControl>
                  <SelectWithSearch
                    {...field}
                    options={[
                      {
                        value: 'md',
                        label: t('flow.datasetWriteOutputFormatMd'),
                      },
                      {
                        value: 'docx',
                        label: t('flow.datasetWriteOutputFormatDocx'),
                      },
                      {
                        value: 'pdf',
                        label: t('flow.datasetWriteOutputFormatPdf'),
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
            name="seafile_connector_id"
            render={({ field }) => (
              <FormItem>
                <FieldTip
                  label={t('flow.datasetWriteSeafileConnector')}
                  tip={t('flow.datasetWriteSeafileConnectorTip')}
                />
                <FormControl>
                  <SelectWithSearch
                    {...field}
                    options={seafileOptions}
                    placeholder={
                      isFetching
                        ? t('flow.seafileConnectorLoading')
                        : t('flow.datasetWriteSeafileConnectorPlaceholder')
                    }
                    allowClear
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="seafile_repo_id"
            render={({ field }) => (
              <FormItem>
                <FieldTip
                  label={t('flow.datasetWriteSeafileRepo')}
                  tip={t('flow.datasetWriteSeafileRepoTip')}
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
                        form.setValue('seafile_path', next ? '/' : '', {
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
            name="seafile_path"
            render={({ field }) => (
              <FormItem>
                <FieldTip
                  label={t('flow.datasetWriteSeafilePath')}
                  tip={t('flow.datasetWriteSeafilePathTip')}
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
          <FormField
            control={form.control}
            name="week_id"
            render={({ field }) => (
              <FormItem>
                <FieldTip
                  label={t('flow.datasetWriteWeekId')}
                  tip={t('flow.datasetWriteWeekIdTip')}
                />
                <FormControl>
                  <PromptEditor
                    {...field}
                    showToolbar={false}
                    multiLine={false}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem>
                <FieldTip
                  label={t('flow.datasetWriteContent')}
                  tip={t('flow.datasetWriteContentTip')}
                />
                <FormControl>
                  <PromptEditor
                    {...field}
                    showToolbar={false}
                    multiLine={false}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="publish_policy"
            render={({ field }) => (
              <FormItem>
                <FieldTip
                  label={t('flow.datasetWritePolicy')}
                  tip={t('flow.datasetWritePolicyTip')}
                />
                <FormControl>
                  <SelectWithSearch
                    {...field}
                    options={[
                      {
                        value: 'auto',
                        label: t('flow.datasetWritePolicyAuto'),
                      },
                      {
                        value: 'draft',
                        label: t('flow.datasetWritePolicyDraft'),
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
            name="language"
            render={({ field }) => (
              <FormItem>
                <FieldTip
                  label={t('flow.datasetWriteLanguage')}
                  tip={t('flow.datasetWriteLanguageTip')}
                />
                <FormControl>
                  <SelectWithSearch
                    {...field}
                    options={[
                      { value: 'zh', label: t('flow.datasetWriteLanguageZh') },
                      { value: 'en', label: t('flow.datasetWriteLanguageEn') },
                    ]}
                    allowClear={false}
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

export default memo(DatasetWriteForm);
