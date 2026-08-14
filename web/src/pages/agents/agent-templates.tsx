import { useSetModalState } from '@/hooks/common-hooks';
import { useNavigatePage } from '@/hooks/logic-hooks/navigate-hooks';
import { useFetchAgentTemplates, useSetAgent } from '@/hooks/use-agent-request';

import { CardContainer } from '@/components/card-container';
import { AgentCategory } from '@/constants/agent';
import { IFlowTemplate } from '@/interfaces/database/agent';
import { useCallback, useMemo, useState } from 'react';
import { CreateAgentDialog } from './create-agent-dialog';
import { TemplateCard } from './template-card';

const SEAFILE_WEEKLY_TEMPLATE_ID = '49';

function isSeafileWeeklyReportTemplate(item: IFlowTemplate): boolean {
  if (item.id === SEAFILE_WEEKLY_TEMPLATE_ID) {
    return true;
  }
  const titles = Object.values(item.title || {}).join(' ');
  if (/seafile/i.test(titles)) {
    return true;
  }
  return Object.values(item.dsl?.components || {}).some(
    (component) => component?.obj?.component_name === 'Seafile',
  );
}

export default function AgentTemplates() {
  const list = useFetchAgentTemplates();
  const { loading, setAgent } = useSetAgent();
  const templateList = useMemo(
    () => (list || []).filter(isSeafileWeeklyReportTemplate),
    [list],
  );

  const {
    visible: creatingVisible,
    hideModal: hideCreatingModal,
    showModal: showCreatingModal,
  } = useSetModalState();

  const [template, setTemplate] = useState<IFlowTemplate>();

  const showModal = useCallback(
    (record: IFlowTemplate) => {
      setTemplate(record);
      showCreatingModal();
    },
    [showCreatingModal],
  );

  const { navigateToAgent } = useNavigatePage();

  const handleOk = useCallback(
    async (payload: any) => {
      const dsl = template?.dsl;
      const canvasCategory = template?.canvas_category;

      const ret = await setAgent({
        title: payload.name,
        dsl,
        avatar: template?.avatar,
        canvas_category: canvasCategory,
      });

      if (ret?.code === 0) {
        hideCreatingModal();
        if (canvasCategory === AgentCategory.DataflowCanvas) {
          navigateToAgent(ret.data.id, AgentCategory.DataflowCanvas)();
        } else {
          navigateToAgent(ret.data.id)();
        }
      }
    },
    [
      hideCreatingModal,
      navigateToAgent,
      setAgent,
      template?.avatar,
      template?.canvas_category,
      template?.dsl,
    ],
  );
  return (
    <section>
      <div className="flex flex-1 h-dvh">
        <main className="flex-1 bg-text-title-invert/50 h-dvh">
          <CardContainer className="max-h-[94vh] overflow-auto px-8 pt-8">
            {templateList.map((x) => {
              return (
                <TemplateCard
                  key={x.id}
                  data={x}
                  showModal={showModal}
                ></TemplateCard>
              );
            })}
          </CardContainer>
          {creatingVisible && (
            <CreateAgentDialog
              loading={loading}
              visible={creatingVisible}
              hideModal={hideCreatingModal}
              onOk={handleOk}
            ></CreateAgentDialog>
          )}
        </main>
      </div>
    </section>
  );
}
