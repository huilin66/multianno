import React, { useMemo, useState } from 'react';
import { ExternalLink, Filter, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Annotation, TaxonomyAttribute, TaxonomyClass } from '../../store/useStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface AnnotationTableProps {
  annotations: Annotation[];
  taxonomyClasses: TaxonomyClass[];
  taxonomyAttributes: TaxonomyAttribute[];
  onOpenAnnotation: (annotation: Annotation, sceneObjectIndex: number) => void;
}

interface AnnotationTableRow {
  annotation: Annotation;
  sceneObjectIndex: number;
  attributesText: string;
  contentText: string;
}

const formatAttributeValue = (value: string | number | boolean) => {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
};

const formatContent = (annotation: Annotation) => {
  const content: string[] = [];
  if (annotation.text?.trim()) content.push(`text: ${annotation.text.trim()}`);
  if (annotation.group_id !== undefined && annotation.group_id !== null) {
    content.push(`group: ${annotation.group_id}`);
  }
  if (annotation.track_id !== undefined && annotation.track_id !== null) {
    content.push(`track: ${annotation.track_id}`);
  }
  content.push(`${annotation.points?.length || 0} points`);
  return content.join(' · ');
};

export function AnnotationTable({
  annotations,
  taxonomyClasses,
  taxonomyAttributes,
  onOpenAnnotation,
}: AnnotationTableProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const rows = useMemo<AnnotationTableRow[]>(() => {
    const sceneObjectCounts = new Map<string, number>();

    return annotations.map((annotation) => {
      const sceneObjectIndex = sceneObjectCounts.get(annotation.stem) || 0;
      sceneObjectCounts.set(annotation.stem, sceneObjectIndex + 1);

      const attributeEntries = Object.entries(annotation.attributes || {});
      const attributesText = attributeEntries.length > 0
        ? attributeEntries
          .map(([name, value]) => `${name}=${formatAttributeValue(value)}`)
          .join(' · ')
        : '—';

      return {
        annotation,
        sceneObjectIndex,
        attributesText,
        contentText: formatContent(annotation),
      };
    });
  }, [annotations]);

  const classOptions = useMemo(() => {
    const names = new Set([
      ...taxonomyClasses.map((taxonomyClass) => taxonomyClass.name),
      ...rows.map((row) => row.annotation.label),
    ]);
    return Array.from(names).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [rows, taxonomyClasses]);

  const typeOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.annotation.type))).sort(),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rows.filter((row) => {
      const { annotation } = row;
      if (classFilter !== 'all' && annotation.label !== classFilter) return false;
      if (typeFilter !== 'all' && annotation.type !== typeFilter) return false;
      if (!normalizedQuery) return true;

      return [
        annotation.id,
        annotation.label,
        annotation.type,
        annotation.stem,
        row.attributesText,
        row.contentText,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
    });
  }, [classFilter, query, rows, typeFilter]);

  const hasFilters = Boolean(query.trim()) || classFilter !== 'all' || typeFilter !== 'all';
  const classCount = new Set(filteredRows.map((row) => row.annotation.label)).size;
  const sceneCount = new Set(filteredRows.map((row) => row.annotation.stem)).size;
  const taxonomyAttributeNames = new Set(taxonomyAttributes.map((attribute) => attribute.name));

  const clearFilters = () => {
    setQuery('');
    setClassFilter('all');
    setTypeFilter('all');
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-neutral-100/50 dark:bg-neutral-950/30">
      <div className="p-5 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">{t('taxonomyDashboard.annotationTable', 'Annotation Table')}</h2>
            <p className="text-xs text-neutral-500 mt-1">
              {t('taxonomyDashboard.annotationTableDesc', 'Browse and filter every annotation in the current project.')}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-neutral-500 shrink-0">
            <span className="rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-2.5 py-1">
              {filteredRows.length} {t('taxonomyDashboard.objects', 'objects')}
            </span>
            <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1">
              {sceneCount} {t('taxonomyDashboard.scenes', 'scenes')}
            </span>
            <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1">
              {classCount} {t('taxonomyDashboard.classes', 'classes')}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('taxonomyDashboard.annotationSearch', 'Search ID, class, content or scene group...')}
              className="h-9 pl-9 pr-8 text-xs"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                aria-label={t('taxonomyDashboard.clearAnnotationSearch', 'Clear search')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="h-9 w-[170px] text-xs">
              <SelectValue placeholder={t('taxonomyDashboard.className', 'Class')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('taxonomyDashboard.allClasses', 'All classes')}</SelectItem>
              {classOptions.map((className) => (
                <SelectItem key={className} value={className}>{className}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 w-[150px] text-xs">
              <SelectValue placeholder={t('taxonomyDashboard.annotationType', 'Type')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('taxonomyDashboard.allTypes', 'All types')}</SelectItem>
              {typeOptions.map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button type="button" variant="ghost" className="h-9 px-3 text-xs" onClick={clearFilters}>
              <Filter className="w-3.5 h-3.5 mr-1.5" />
              {t('taxonomyDashboard.clearFilters', 'Clear filters')}
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5 custom-scrollbar">
        {filteredRows.length === 0 ? (
          <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-neutral-400">
            <Filter className="w-10 h-10 mb-3 opacity-25" />
            <p className="text-sm font-semibold">
              {annotations.length === 0
                ? t('taxonomyDashboard.noAnnotations', 'No annotations in the current project.')
                : t('taxonomyDashboard.noAnnotationMatches', 'No annotations match the current filters.')}
            </p>
            {hasFilters && (
              <Button type="button" variant="link" className="text-xs mt-1" onClick={clearFilters}>
                {t('taxonomyDashboard.clearFilters', 'Clear filters')}
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm overflow-hidden">
            <table className="w-full min-w-[980px] border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-800/95 text-[10px] uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="w-10 px-3 py-3 text-left font-black">#</th>
                  <th className="w-52 px-3 py-3 text-left font-black">{t('taxonomyDashboard.annotationId', 'Annotation ID')}</th>
                  <th className="w-44 px-3 py-3 text-left font-black">{t('taxonomyDashboard.className', 'Class')}</th>
                  <th className="w-28 px-3 py-3 text-left font-black">{t('taxonomyDashboard.annotationType', 'Type')}</th>
                  <th className="min-w-[220px] px-3 py-3 text-left font-black">{t('taxonomyDashboard.annotationContent', 'Annotation Content')}</th>
                  <th className="min-w-[220px] px-3 py-3 text-left font-black">{t('taxonomyDashboard.annotationAttributes', 'Attributes')}</th>
                  <th className="min-w-[220px] px-3 py-3 text-left font-black">{t('taxonomyDashboard.sceneGroup', 'Scene Group')}</th>
                  <th className="w-12 px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {filteredRows.map((row, index) => {
                  const classDefinition = taxonomyClasses.find((taxonomyClass) => taxonomyClass.name === row.annotation.label);
                  const knownAttributeCount = Object.keys(row.annotation.attributes || {})
                    .filter((name) => taxonomyAttributeNames.has(name)).length;

                  return (
                    <tr
                      key={`${row.annotation.id}-${row.annotation.stem}-${index}`}
                      onDoubleClick={() => onOpenAnnotation(row.annotation, row.sceneObjectIndex)}
                      className="group cursor-pointer hover:bg-blue-50/60 dark:hover:bg-blue-950/20"
                      title={t('taxonomyDashboard.openAnnotationHint', 'Double-click to open this annotation in the workspace')}
                    >
                      <td className="px-3 py-2.5 text-neutral-400 font-mono">{index + 1}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-neutral-700 dark:text-neutral-300 max-w-[210px] truncate" title={row.annotation.id}>
                        {row.annotation.id}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-2 max-w-full">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: classDefinition?.color || '#64748b' }}
                          />
                          <span className="font-semibold truncate" title={row.annotation.label}>{row.annotation.label}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="rounded bg-neutral-100 dark:bg-neutral-800 px-2 py-1 text-[10px] font-mono text-neutral-600 dark:text-neutral-300">
                          {row.annotation.type}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-neutral-600 dark:text-neutral-400 max-w-[260px] truncate" title={row.contentText}>
                        {row.contentText}
                      </td>
                      <td className="px-3 py-2.5 text-neutral-600 dark:text-neutral-400 max-w-[260px] truncate" title={row.attributesText}>
                        <span>{row.attributesText}</span>
                        {knownAttributeCount > 0 && (
                          <span className="ml-2 text-[9px] text-purple-600 dark:text-purple-400">{knownAttributeCount}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-neutral-600 dark:text-neutral-400 max-w-[250px] truncate" title={row.annotation.stem}>
                        {row.annotation.stem}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenAnnotation(row.annotation, row.sceneObjectIndex);
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-900/40 dark:hover:text-blue-300"
                          title={t('taxonomyDashboard.openAnnotation', 'Open annotation')}
                          aria-label={t('taxonomyDashboard.openAnnotation', 'Open annotation')}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
