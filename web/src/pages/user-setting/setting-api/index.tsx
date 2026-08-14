import ApiContent from '@/components/api-service/chat-overview-modal/api-content';

const ApiPage = () => {
  return (
    <div className="h-full w-full overflow-auto">
      <ApiContent idKey="dialogId"></ApiContent>
    </div>
  );
};

export default ApiPage;
