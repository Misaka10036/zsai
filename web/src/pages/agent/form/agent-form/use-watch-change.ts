import { omit } from 'lodash';
import { useEffect } from 'react';
import { UseFormReturn, useWatch } from 'react-hook-form';
import { PromptRole } from '../../constant';
import useGraphStore from '../../store';

export function useWatchFormChange(id?: string, form?: UseFormReturn<any>) {
  const values = useWatch({ control: form?.control });
  const updateNodeForm = useGraphStore((state) => state.updateNodeForm);
  const getNode = useGraphStore((state) => state.getNode);

  useEffect(() => {
    if (!id || !form?.formState.isDirty) {
      return;
    }
    const current = form.getValues();
    const prev = getNode(id)?.data?.form || {};
    const promptContent =
      typeof current.prompts === 'string' ? current.prompts : '';
    const prevPrompt = Array.isArray(prev.prompts)
      ? String(prev.prompts?.[0]?.content || '')
      : '';
    const nextValues: any = omit(current, ['mcp', 'tools', 'outputs']);
    nextValues.prompts = [
      {
        role: PromptRole.User,
        content: promptContent.trim() ? promptContent : prevPrompt,
      },
    ];
    if (
      nextValues.sys_prompt === 'flow.sysPromptDefaultValue' &&
      typeof prev.sys_prompt === 'string' &&
      prev.sys_prompt &&
      prev.sys_prompt !== 'flow.sysPromptDefaultValue'
    ) {
      nextValues.sys_prompt = prev.sys_prompt;
    }
    updateNodeForm(id, nextValues);
  }, [form, form?.formState.isDirty, getNode, id, updateNodeForm, values]);
}
