import { useFetchDefaultModelDictionary } from '@/hooks/use-llm-request';
import { RAGFlowNodeType } from '@/interfaces/database/agent';
import { get, isEmpty, omit } from 'lodash';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { initialAgentValues } from '../../constant';

// You need to exclude the mcp and tools fields that are not in the form,
// otherwise the form data update will reset the tools or mcp data to an array
// Exclude data that is not in the form to avoid writing this data to the canvas when using useWatch.
// Outputs, tools, and MCP data are directly synchronized to the canvas without going through the form.
function omitToolsAndMcp(values: Record<string, any>) {
  return omit(values, ['mcp', 'tools', 'outputs']);
}

export function useValues(node?: RAGFlowNodeType) {
  const { t } = useTranslation();
  const defaultModelDictionary = useFetchDefaultModelDictionary();

  const defaultValues = useMemo(
    () => ({
      ...omitToolsAndMcp(initialAgentValues),
      llm_id: defaultModelDictionary.llm_id,
      sys_prompt: t('flow.sysPromptDefaultValue'),
      prompts: '',
    }),
    [defaultModelDictionary, t],
  );

  const values = useMemo(() => {
    const formData = node?.data?.form;

    if (isEmpty(formData)) {
      return defaultValues;
    }

    const sysPrompt = formData?.sys_prompt;
    return {
      ...omitToolsAndMcp(formData),
      sys_prompt:
        !sysPrompt || sysPrompt === 'flow.sysPromptDefaultValue'
          ? t('flow.sysPromptDefaultValue')
          : sysPrompt,
      prompts: get(formData, 'prompts.0.content', ''),
    };
  }, [defaultValues, node?.data?.form, t]);

  return values;
}
