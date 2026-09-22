import { SelectWithSearch } from '@/components/originui/select-with-search';
import { cn } from '@/lib/utils';
import {
  browseSeafile,
  SeafileBrowseResult,
} from '@/services/data-source-service';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Folder, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

type BrowseSource = {
  connectorId?: string;
  includeFormConfig?: boolean;
};

type ConfigShape = {
  seafile_url?: string;
  sync_scope?: string;
  include_shared?: boolean;
  credentials?: { seafile_token?: string; repo_token?: string };
};

function useBrowseSource({ connectorId, includeFormConfig }: BrowseSource) {
  const { control } = useFormContext();
  const [searchParams] = useSearchParams();
  const config = useWatch({ control, name: 'config' }) as ConfigShape | undefined;
  const scope = includeFormConfig ? config?.sync_scope : undefined;
  const token = config?.credentials?.seafile_token || '';
  const repoToken = config?.credentials?.repo_token || '';
  const url = config?.seafile_url || '';
  const savedId = includeFormConfig ? searchParams.get('id') || '' : '';
  const scopeAllows =
    !includeFormConfig || scope === 'library' || scope === 'directory';
  const credentialReady =
    Boolean(connectorId || savedId) || Boolean(url && (token || repoToken));
  const requestConfig = includeFormConfig
    ? {
        seafile_url: url,
        include_shared: config?.include_shared,
        credentials: {
          seafile_token: token,
          repo_token: repoToken,
        },
      }
    : undefined;
  return {
    enabled: scopeAllows && credentialReady,
    connectorId: connectorId || savedId || (includeFormConfig ? 'seafile' : ''),
    requestConfig,
    tokenKey: `${token.length}:${token.slice(-4)}:${repoToken.length}`,
    url,
  };
}

function useSeafileQuery(
  source: BrowseSource,
  repoId: string,
  path: string,
  enabled: boolean,
) {
  const target = useBrowseSource(source);
  return useQuery({
    queryKey: [
      'seafile-browse',
      target.connectorId,
      target.url,
      target.tokenKey,
      repoId,
      path,
    ],
    enabled: target.enabled && enabled,
    staleTime: 15_000,
    retry: false,
    queryFn: () =>
      browseSeafile(target.connectorId, {
        repo_id: repoId,
        path,
        config: target.requestConfig,
      }),
  });
}

export function DataSourceSeafileLibrary({
  value,
  onChange,
}: {
  value?: string;
  onChange: (value: string) => void;
}) {
  const form = useFormContext();
  return (
    <SeafileLibrarySelect
      includeFormConfig
      value={value}
      onChange={(next) => {
        onChange(next);
        if ((value || '') !== next) {
          form.setValue('config.sync_path', '', {
            shouldDirty: true,
            shouldValidate: true,
          });
        }
      }}
    />
  );
}

export function DataSourceSeafileDirectory({
  value,
  onChange,
}: {
  value?: string;
  onChange: (value: string) => void;
}) {
  const { control } = useFormContext();
  const repoId = useWatch({ control, name: 'config.repo_id' });
  return (
    <SeafileDirectoryTree
      includeFormConfig
      repoId={typeof repoId === 'string' ? repoId : ''}
      value={value}
      onChange={onChange}
      allowRoot={false}
    />
  );
}

export function SeafileLibrarySelect({
  connectorId,
  includeFormConfig,
  value,
  onChange,
  allowClear = false,
}: BrowseSource & {
  value?: string;
  onChange: (value: string) => void;
  allowClear?: boolean;
}) {
  const { t } = useTranslation();
  const source = useBrowseSource({ connectorId, includeFormConfig });
  const query = useSeafileQuery(
    { connectorId, includeFormConfig },
    '',
    '/',
    true,
  );
  const libraries = query.data?.libraries;
  const options = useMemo(
    () => (libraries || []).map((item) => ({ value: item.id, label: item.name })),
    [libraries],
  );
  const matched = (libraries || []).find(
    (item) => item.id === value || item.name === value,
  );
  const current = value || '';

  if (!source.enabled) {
    return (
      <p className="text-sm text-text-secondary">
        {t('setting.seafileBrowseNeedCredential')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <SelectWithSearch
        value={matched?.id || current}
        onChange={onChange}
        options={options}
        allowClear={allowClear}
        placeholder={
          query.isFetching
            ? t('setting.seafileBrowseLoading')
            : t('setting.seafileBrowseLibraryPlaceholder')
        }
        emptyData={t('setting.seafileBrowseEmptyLibraries')}
      />
      {query.error ? (
        <p className="text-sm text-state-error">
          {(query.error as Error).message}
        </p>
      ) : null}
      {current && !matched && !query.isFetching ? (
        <p className="text-sm text-text-secondary">
          {t('setting.seafileBrowseSavedValue', { value: current })}
        </p>
      ) : null}
    </div>
  );
}

function FolderLevel({
  source,
  repoId,
  path,
  selected,
  onSelect,
  depth,
}: {
  source: BrowseSource;
  repoId: string;
  path: string;
  selected: string;
  onSelect: (path: string) => void;
  depth: number;
}) {
  const { t } = useTranslation();
  const query = useSeafileQuery(source, repoId, path, true);
  const directories = (query.data?.entries || []).filter(
    (item) => item.type === 'dir',
  );
  if (query.isFetching) {
    return (
      <p className="flex items-center gap-1 px-2 py-1 text-sm text-text-secondary">
        <Loader2 className="size-3 animate-spin" />
        {t('setting.seafileBrowseLoading')}
      </p>
    );
  }
  if (query.error) {
    return (
      <p className="px-2 py-1 text-sm text-state-error">
        {(query.error as Error).message}
      </p>
    );
  }
  if (!directories.length) {
    return (
      <p className="px-2 py-1 text-sm text-text-secondary">
        {t('setting.seafileBrowseEmptyFolders')}
      </p>
    );
  }
  return (
    <div>
      {directories.map((item) => (
        <FolderRow
          key={item.path}
          source={source}
          repoId={repoId}
          entry={item}
          selected={selected}
          onSelect={onSelect}
          depth={depth}
        />
      ))}
    </div>
  );
}

function FolderRow({
  source,
  repoId,
  entry,
  selected,
  onSelect,
  depth,
}: {
  source: BrowseSource;
  repoId: string;
  entry: SeafileBrowseResult['entries'][number];
  selected: string;
  onSelect: (path: string) => void;
  depth: number;
}) {
  const [open, setOpen] = useState(false);
  const active = selected === entry.path;
  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 rounded px-1 py-0.5',
          active && 'bg-bg-card',
        )}
        style={{ paddingLeft: depth * 12 }}
      >
        <button
          type="button"
          className="inline-flex size-5 items-center justify-center"
          onClick={() => setOpen((prev) => !prev)}
          aria-label={entry.name}
        >
          {open ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
        </button>
        <button
          type="button"
          className="inline-flex min-w-0 flex-1 items-center gap-1 text-left text-sm"
          onClick={() => onSelect(entry.path)}
        >
          <Folder className="size-3 shrink-0" />
          <span className="truncate">{entry.name}</span>
        </button>
      </div>
      {open ? (
        <FolderLevel
          source={source}
          repoId={repoId}
          path={entry.path}
          selected={selected}
          onSelect={onSelect}
          depth={depth + 1}
        />
      ) : null}
    </div>
  );
}

export function SeafileDirectoryTree({
  connectorId,
  includeFormConfig,
  repoId,
  value,
  onChange,
  allowRoot = true,
}: BrowseSource & {
  repoId?: string;
  value?: string;
  onChange: (value: string) => void;
  allowRoot?: boolean;
}) {
  const { t } = useTranslation();
  const source = { connectorId, includeFormConfig };
  const browse = useBrowseSource(source);
  const libraryQuery = useSeafileQuery(source, '', '/', Boolean(repoId));
  const matchedLibrary = libraryQuery.data?.libraries.find(
    (item) => item.id === repoId || item.name === repoId,
  );
  const resolvedRepoId = matchedLibrary?.id || repoId || '';
  const current = value || '';
  const selectedRoot = current === '/' || current === '';

  if (!browse.enabled) {
    return (
      <p className="text-sm text-text-secondary">
        {t('setting.seafileBrowseNeedCredential')}
      </p>
    );
  }
  if (!repoId) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm text-text-secondary">
          {t('setting.seafileBrowseNeedLibrary')}
        </p>
        {current ? (
          <p className="text-sm text-text-secondary">
            {t('setting.seafileBrowseSavedValue', { value: current })}
          </p>
        ) : null}
      </div>
    );
  }
  if (!matchedLibrary && libraryQuery.isFetching) {
    return (
      <p className="flex items-center gap-1 text-sm text-text-secondary">
        <Loader2 className="size-3 animate-spin" />
        {t('setting.seafileBrowseLoading')}
      </p>
    );
  }

  return (
    <div className="max-h-48 overflow-auto rounded-md border border-border-button p-1">
      {allowRoot ? (
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-1 rounded px-2 py-1 text-left text-sm',
            selectedRoot && 'bg-bg-card',
          )}
          onClick={() => onChange('/')}
        >
          <Folder className="size-3" />
          {t('setting.seafileBrowseRoot')}
        </button>
      ) : null}
      <FolderLevel
        source={source}
        repoId={resolvedRepoId}
        path="/"
        selected={current}
        onSelect={onChange}
        depth={allowRoot ? 1 : 0}
      />
      {current && current !== '/' ? (
        <p className="px-2 py-1 text-xs text-text-secondary">
          {t('setting.seafileBrowseSavedValue', { value: current })}
        </p>
      ) : null}
    </div>
  );
}
