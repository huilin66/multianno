import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, Filter, Save, X } from 'lucide-react';
import type { Annotation } from '../../../store/useStore';
import {
  getAnnotationAttributeEntries,
  type AnnotationAttributeDefinition,
} from '../../../lib/annotationAttributeUtils';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '../../ui/popover';

type Rule = { id: string; field: string; op: string; value: string };
type Constant = { id: string; kind: 'constant'; value: boolean };
type QueryNode = Rule | Constant | QueryGroup;

export type QueryGroup = {
  id: string;
  scope: 'scene' | 'object';
  join: 'all' | 'any';
  children: QueryNode[];
  negated?: boolean;
  quantifier?: 'any' | 'all';
};

export const EMPTY_QUERY: QueryGroup = { id: 'root', scope: 'scene', join: 'all', children: [] };

const TRUE_FIELD = '__true';
const FALSE_FIELD = '__false';
const OBJECT_FIELDS = new Set(['class', 'shape', 'track', 'group', 'text', 'difficult']);
const SCENE_FIELDS = new Set(['name', 'count']);

const makeId = (prefix: string) => (
  globalThis.crypto?.randomUUID?.()
  ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
);

const isGroup = (node: QueryNode): node is QueryGroup => 'children' in node;
const isConstant = (node: QueryNode): node is Constant => 'kind' in node && node.kind === 'constant';
const isObjectRule = (node: QueryNode): node is Rule => (
  !isGroup(node)
  && !isConstant(node)
  && (node.field.startsWith('attr:') || OBJECT_FIELDS.has(node.field))
);

const isObjectExpression = (node: QueryNode) => (
  isObjectRule(node) || (isGroup(node) && node.scope === 'object')
);

function normalizeSceneNode(node: QueryNode): QueryNode {
  if (!isGroup(node) || node.scope === 'object') return node;
  const children = node.children.map(normalizeSceneNode);
  if (children.length > 0 && children.every(isObjectExpression)) {
    return { ...node, scope: 'object', children, quantifier: node.quantifier ?? 'any' };
  }
  return { ...node, children };
}

function cloneEmptyQuery(): QueryGroup {
  return { ...EMPTY_QUERY, children: [] };
}

function getRawFieldValue(
  field: string,
  stem: string,
  objects: readonly Annotation[],
  object: Annotation | undefined,
  taxonomyAttributes: AnnotationAttributeDefinition[],
) {
  if (field === 'name') return stem;
  if (field === 'count') return objects.length;
  if (field === 'class') return object?.label;
  if (field === 'shape') return object?.type;
  if (field === 'track') return object?.track_id;
  if (field === 'group') return object?.group_id;
  if (field === 'text') return object?.text;
  if (field === 'difficult') return object?.difficult;
  if (field.startsWith('attr:') && object) {
    return getAnnotationAttributeEntries(object, false, taxonomyAttributes)
      .find(([name]) => name.trim().toLowerCase() === field.slice(5).trim().toLowerCase())?.[1];
  }
  return undefined;
}

function evaluateRule(
  rule: Rule,
  stem: string,
  objects: readonly Annotation[],
  object: Annotation | undefined,
  taxonomyAttributes: AnnotationAttributeDefinition[],
) {
  if (rule.field === TRUE_FIELD) return true;
  if (rule.field === FALSE_FIELD) return false;

  const actual = String(getRawFieldValue(rule.field, stem, objects, object, taxonomyAttributes) ?? '').trim().toLowerCase();
  const target = rule.value.trim().toLowerCase();
  const numericActual = Number(actual);
  const numericTarget = Number(target);

  switch (rule.op) {
    case 'missing': return !actual;
    case 'present': return !!actual;
    case 'contains': return actual.includes(target);
    case 'prefix': return actual.startsWith(target);
    case 'suffix': return actual.endsWith(target);
    case 'in': return target.split(',').some(value => value.trim() === actual);
    case 'not_in': return !target.split(',').some(value => value.trim() === actual);
    case 'eq': return rule.field === 'count' ? numericActual === numericTarget : actual === target;
    case 'ne': return rule.field === 'count' ? numericActual !== numericTarget : actual !== target;
    case 'gt': return Number.isFinite(numericActual) && Number.isFinite(numericTarget) && numericActual > numericTarget;
    case 'gte': return Number.isFinite(numericActual) && Number.isFinite(numericTarget) && numericActual >= numericTarget;
    case 'lt': return Number.isFinite(numericActual) && Number.isFinite(numericTarget) && numericActual < numericTarget;
    case 'lte': return Number.isFinite(numericActual) && Number.isFinite(numericTarget) && numericActual <= numericTarget;
    case 'range': {
      const [min, max] = target.split(',').map(Number);
      return Number.isFinite(numericActual) && Number.isFinite(min) && Number.isFinite(max)
        && numericActual >= min && numericActual <= max;
    }
    default: return false;
  }
}

export function matchesQuery(
  group: QueryGroup,
  stem: string,
  objects: readonly Annotation[],
  taxonomyAttributes: AnnotationAttributeDefinition[] = [],
): boolean {
  function evaluate(node: QueryNode, object?: Annotation): boolean {
    if (isConstant(node)) return node.value;
    if (!isGroup(node)) {
      if (isObjectRule(node) && !object) {
        return objects.some(item => evaluateRule(node, stem, objects, item, taxonomyAttributes));
      }
      return evaluateRule(node, stem, objects, object, taxonomyAttributes);
    }

    const evaluateChildren = (currentObject?: Annotation) => {
      return node.join === 'all'
        ? node.children.every(child => evaluate(child, currentObject))
        : node.children.some(child => evaluate(child, currentObject));
    };

    if (node.scope === 'object' && !object) {
      const matches = objects.map(item => evaluateChildren(item));
      const result = node.quantifier === 'all'
        ? objects.length > 0 && matches.every(Boolean)
        : matches.some(Boolean);
      return node.negated ? !result : result;
    }

    const result = evaluateChildren(object);
    return node.negated ? !result : result;
  }

  return group.children.length === 0 || evaluate(group);
}

class QueryParseError extends Error {
  constructor(message: string, public readonly position?: number) {
    super(message);
    this.name = 'QueryParseError';
  }
}

type Token = {
  type: 'identifier' | 'string' | 'number' | 'operator' | 'lparen' | 'rparen' | 'comma' | 'eof';
  value: string;
  position: number;
};

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '(') {
      tokens.push({ type: 'lparen', value: char, position: index });
      index += 1;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: 'rparen', value: char, position: index });
      index += 1;
      continue;
    }
    if (char === ',') {
      tokens.push({ type: 'comma', value: char, position: index });
      index += 1;
      continue;
    }
    if (char === '\'' || char === '"') {
      const quote = char;
      const start = index;
      let value = '';
      index += 1;
      let closed = false;
      while (index < source.length) {
        if (source[index] === '\\' && index + 1 < source.length) {
          value += source[index + 1];
          index += 2;
          continue;
        }
        if (source[index] === quote) {
          if (source[index + 1] === quote) {
            value += quote;
            index += 2;
            continue;
          }
          index += 1;
          closed = true;
          break;
        }
        value += source[index];
        index += 1;
      }
      if (!closed) throw new QueryParseError('Unclosed string', start);
      tokens.push({ type: 'string', value, position: start });
      continue;
    }
    const twoCharacterOperator = source.slice(index, index + 2);
    if (['>=', '<=', '<>', '!=', '=='].includes(twoCharacterOperator)) {
      tokens.push({ type: 'operator', value: twoCharacterOperator, position: index });
      index += 2;
      continue;
    }
    if (['=', '>', '<'].includes(char)) {
      tokens.push({ type: 'operator', value: char, position: index });
      index += 1;
      continue;
    }
    if (/[0-9-]/.test(char) && (/[0-9]/.test(char) || /[0-9]/.test(source[index + 1] || ''))) {
      const start = index;
      index += 1;
      while (index < source.length && /[0-9.]/.test(source[index])) index += 1;
      tokens.push({ type: 'number', value: source.slice(start, index), position: start });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) index += 1;
      tokens.push({ type: 'identifier', value: source.slice(start, index), position: start });
      continue;
    }
    throw new QueryParseError(`Unexpected character "${char}"`, index);
  }
  tokens.push({ type: 'eof', value: '', position: source.length });
  return tokens;
}

type Scope = 'scene' | 'object';

const normalizeField = (raw: string) => {
  const field = raw.trim().toUpperCase();
  const aliases: Record<string, string> = {
    NAME: 'name',
    SCENE: 'name',
    SCENE_NAME: 'name',
    SCENE_GROUP: 'name',
    COUNT: 'count',
    OBJECT_COUNT: 'count',
    ANNOTATION_COUNT: 'count',
    CLASS: 'class',
    LABEL: 'class',
    SHAPE: 'shape',
    TYPE: 'shape',
    TRACK: 'track',
    TRACK_ID: 'track',
    GROUP: 'group',
    GROUP_ID: 'group',
    TEXT: 'text',
    DIFFICULT: 'difficult',
  };
  return aliases[field];
};

class QueryParser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): QueryGroup {
    const node = this.parseOr('scene');
    const end = this.peek();
    if (end.type !== 'eof') throw new QueryParseError(`Unexpected token "${end.value}"`, end.position);
    return this.asGroup(node, 'scene');
  }

  private peek() { return this.tokens[this.index]; }

  private take() {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  }

  private match(value: string) {
    const token = this.peek();
    return token.value.toUpperCase() === value.toUpperCase();
  }

  private expect(value: string) {
    if (!this.match(value)) {
      const token = this.peek();
      throw new QueryParseError(`Expected ${value}`, token.position);
    }
    return this.take();
  }

  private parseOr(scope: Scope): QueryNode {
    let node = this.parseAnd(scope);
    while (this.match('OR')) {
      this.take();
      node = this.combine(node, this.parseAnd(scope), 'any', scope);
    }
    return node;
  }

  private parseAnd(scope: Scope): QueryNode {
    let node = this.parseUnary(scope);
    while (this.match('AND')) {
      this.take();
      node = this.combine(node, this.parseUnary(scope), 'all', scope);
    }
    return node;
  }

  private parseUnary(scope: Scope): QueryNode {
    if (this.match('NOT')) {
      this.take();
      const node = this.asGroup(this.parseUnary(scope), scope);
      return { ...node, id: makeId('not'), negated: !node.negated };
    }
    return this.parsePrimary(scope);
  }

  private parsePrimary(scope: Scope): QueryNode {
    if (this.match('(')) {
      this.take();
      const node = this.parseOr(scope);
      this.expect(')');
      return node;
    }

    const token = this.peek();
    if (token.type !== 'identifier') {
      throw new QueryParseError('Expected a field or expression', token.position);
    }
    this.take();
    if (this.match('(')) return this.parseFunction(token.value, scope, token.position);
    if (token.value.toUpperCase() === 'TRUE') return { id: makeId('true'), kind: 'constant', value: true };
    if (token.value.toUpperCase() === 'FALSE') return { id: makeId('false'), kind: 'constant', value: false };

    const field = normalizeField(token.value);
    if (!field) throw new QueryParseError(`Unknown field "${token.value}"`, token.position);
    this.assertScope(field, scope, token.position);
    return this.parseRule(field, token.position);
  }

  private parseFunction(name: string, scope: Scope, position: number): QueryNode {
    const functionName = name.toUpperCase();
    this.expect('(');
    if (functionName === 'ATTRIBUTE' || functionName === 'ATTR') {
      const attributeName = this.parseScalar('attribute name');
      this.expect(')');
      const field = `attr:${attributeName}`;
      this.assertScope(field, scope, position);
      return this.parseRule(field, position);
    }

    if (['ANY_OBJECT', 'ANY', 'EXISTS', 'ALL_OBJECTS', 'ALL'].includes(functionName)) {
      const node = this.parseOr('object');
      this.expect(')');
      const group = this.asGroup(node, 'object');
      return {
        ...group,
        id: makeId('object-query'),
        scope: 'object',
        quantifier: ['ALL_OBJECTS', 'ALL'].includes(functionName) ? 'all' : 'any',
      };
    }

    throw new QueryParseError(`Unknown function "${name}"`, position);
  }

  private parseRule(field: string, position: number): Rule {
    const operatorToken = this.take();
    const operator = operatorToken.value.toUpperCase();
    if (operatorToken.type === 'operator') {
      const value = this.parseScalar('value');
      return { id: makeId('rule'), field, op: this.normalizeOperator(operator), value };
    }
    if (operator === 'LIKE') {
      return this.makeLikeRule(field, this.parseScalar('pattern'));
    }
    if (operator === 'CONTAINS') {
      return { id: makeId('rule'), field, op: 'contains', value: this.parseScalar('value') };
    }
    if (operator === 'STARTS_WITH' || operator === 'BEGINS_WITH') {
      return { id: makeId('rule'), field, op: 'prefix', value: this.parseScalar('value') };
    }
    if (operator === 'NOT' && this.match('IN')) {
      this.take();
      return { id: makeId('rule'), field, op: 'not_in', value: this.parseList() };
    }
    if (operator === 'IN') {
      return { id: makeId('rule'), field, op: 'in', value: this.parseList() };
    }
    if (operator === 'BETWEEN') {
      const min = this.parseScalar('minimum');
      this.expect('AND');
      const max = this.parseScalar('maximum');
      return { id: makeId('rule'), field, op: 'range', value: `${min}, ${max}` };
    }
    if (operator === 'IS') {
      const isNot = this.match('NOT');
      if (isNot) this.take();
      if (!this.match('NULL') && !this.match('EMPTY')) {
        throw new QueryParseError('Expected NULL or EMPTY after IS', this.peek().position);
      }
      this.take();
      return { id: makeId('rule'), field, op: isNot ? 'present' : 'missing', value: '' };
    }
    throw new QueryParseError('Expected an operator after field', position);
  }

  private parseList() {
    this.expect('(');
    const values: string[] = [];
    while (!this.match(')')) {
      values.push(this.parseScalar('list value'));
      if (!this.match(',')) break;
      this.take();
    }
    this.expect(')');
    return values.join(', ');
  }

  private parseScalar(label: string) {
    const token = this.take();
    if (token.type === 'string' || token.type === 'number' || token.type === 'identifier') {
      if (token.value.toUpperCase() === 'NULL' || token.value.toUpperCase() === 'EMPTY') return '';
      return token.value;
    }
    throw new QueryParseError(`Expected ${label}`, token.position);
  }

  private normalizeOperator(operator: string) {
    const map: Record<string, string> = {
      '=': 'eq',
      '==': 'eq',
      '<>': 'ne',
      '!=': 'ne',
      '>': 'gt',
      '>=': 'gte',
      '<': 'lt',
      '<=': 'lte',
    };
    const normalized = map[operator];
    if (!normalized) throw new QueryParseError(`Unsupported operator "${operator}"`);
    return normalized;
  }

  private makeLikeRule(field: string, pattern: string): Rule {
    const starts = pattern.startsWith('%');
    const ends = pattern.endsWith('%');
    const value = pattern.replace(/^%/, '').replace(/%$/, '');
    return {
      id: makeId('rule'),
      field,
      op: starts && ends ? 'contains' : starts ? 'suffix' : ends ? 'prefix' : 'eq',
      value,
    };
  }

  private assertScope(field: string, scope: Scope, position: number) {
    if (field.startsWith('attr:') || OBJECT_FIELDS.has(field)) {
      return;
    }
    if (SCENE_FIELDS.has(field) && scope !== 'scene') {
      throw new QueryParseError('COUNT and NAME can only be used outside ANY_OBJECT(...)', position);
    }
  }

  private combine(left: QueryNode, right: QueryNode, join: 'all' | 'any', scope: Scope): QueryGroup {
    return { id: makeId('group'), scope, join, children: [left, right] };
  }

  private asGroup(node: QueryNode, scope: Scope): QueryGroup {
    if (isGroup(node)) return node;
    return { id: makeId('group'), scope, join: 'all', children: [node] };
  }
}

function validateNode(node: QueryNode, isRoot = false): string | null {
  if (isConstant(node)) return null;
  if (isGroup(node)) {
    if (!isRoot && node.children.length === 0) return 'A group cannot be empty';
    for (const child of node.children) {
      const error = validateNode(child);
      if (error) return error;
    }
    return null;
  }
  if (node.field.startsWith('attr:') && !node.field.slice(5).trim()) return 'Attribute name is required';
  if (node.op === 'missing' || node.op === 'present') return null;
  if (!node.value.trim()) return 'A comparison value is required';
  if (node.op === 'range') {
    const values = node.value.split(',').map(value => Number(value.trim()));
    if (values.length !== 2 || values.some(value => !Number.isFinite(value)) || values[0] > values[1]) {
      return 'BETWEEN requires two ordered numbers';
    }
  }
  if (node.field === 'count' && ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'].includes(node.op) && !Number.isFinite(Number(node.value))) {
    return 'COUNT requires a number';
  }
  if (node.field === 'count' && node.op === 'in' && node.value.split(',').some(value => !Number.isFinite(Number(value.trim())))) {
    return 'COUNT IN requires numbers';
  }
  return null;
}

export function parseQuery(statement: string): { query: QueryGroup; error: string | null } {
  const source = statement.trim();
  if (!source || source.toUpperCase() === 'TRUE') return { query: cloneEmptyQuery(), error: null };
  try {
    const query = normalizeSceneNode(new QueryParser(tokenize(source)).parse()) as QueryGroup;
    return { query, error: validateNode(query, true) };
  } catch (error) {
    return {
      query: cloneEmptyQuery(),
      error: error instanceof QueryParseError ? error.message : 'Invalid query',
    };
  }
}

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

function formatRule(rule: Rule): string {
  if (rule.field === TRUE_FIELD) return 'TRUE';
  if (rule.field === FALSE_FIELD) return 'FALSE';
  const field = rule.field.startsWith('attr:')
    ? `ATTRIBUTE(${quote(rule.field.slice(5))})`
    : ({ name: 'NAME', count: 'COUNT', class: 'CLASS', shape: 'SHAPE', track: 'TRACK_ID', group: 'GROUP_ID', text: 'TEXT', difficult: 'DIFFICULT' } as Record<string, string>)[rule.field] ?? rule.field.toUpperCase();
  if (rule.op === 'missing') return `${field} IS NULL`;
  if (rule.op === 'present') return `${field} IS NOT NULL`;
  if (rule.op === 'contains') return `${field} LIKE ${quote(`%${rule.value}%`)}`;
  if (rule.op === 'prefix') return `${field} LIKE ${quote(`${rule.value}%`)}`;
  if (rule.op === 'suffix') return `${field} LIKE ${quote(`%${rule.value}`)}`;
  if (rule.op === 'in' || rule.op === 'not_in') return `${field} ${rule.op === 'not_in' ? 'NOT IN' : 'IN'} (${rule.value.split(',').map(value => quote(value.trim())).join(', ')})`;
  if (rule.op === 'range') return `${field} BETWEEN ${rule.value.split(',')[0].trim()} AND ${rule.value.split(',')[1].trim()}`;
  const operators: Record<string, string> = { eq: '=', ne: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
  const formattedValue = rule.field === 'count' || ['gt', 'gte', 'lt', 'lte', 'range'].includes(rule.op)
    ? rule.value.trim()
    : quote(rule.value);
  return `${field} ${operators[rule.op] ?? '='} ${formattedValue}`;
}

function formatNode(node: QueryNode): string {
  if (isConstant(node)) return node.value ? 'TRUE' : 'FALSE';
  if (!isGroup(node)) return formatRule(node);
  const joined = node.children.map(formatNode).join(node.join === 'all' ? ' AND ' : ' OR ');
  let expression = node.children.length === 1 ? joined : `(${joined})`;
  if (node.scope === 'object') expression = `${node.quantifier === 'all' ? 'ALL_OBJECTS' : 'ANY_OBJECT'}(${expression})`;
  if (node.negated) expression = `NOT (${expression})`;
  return expression;
}

export function queryToStatement(query: QueryGroup): string {
  if (query.children.length === 0) return 'TRUE';
  return formatNode(query);
}

interface QueryField {
  id: string;
  label: string;
  scope: Scope;
  options?: string[];
  numeric?: boolean;
}

interface Props {
  query: QueryGroup;
  stems: string[];
  total: number;
  matched: number;
  objects: ReadonlyMap<string, readonly Annotation[]>;
  classes: { name: string }[];
  attributes: { name: string; options?: string[] }[];
  onApply: (query: QueryGroup) => void;
}

export function SceneGroupQuery({ query, stems, total, matched, objects, classes, attributes, onApply }: Props) {
  const { t } = useTranslation();
  const statementRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [statement, setStatement] = useState(() => queryToStatement(query));
  const [saved, setSaved] = useState<{ name: string; statement: string }[]>([]);
  const [name, setName] = useState('');
  const [assistantFieldId, setAssistantFieldId] = useState('count');

  const fields = useMemo<QueryField[]>(() => [
    { id: 'count', label: t('rightPanel.sceneFilterAnnotationCount'), scope: 'scene', numeric: true },
    { id: 'name', label: t('rightPanel.sceneFilterSceneGroup'), scope: 'scene' },
    { id: 'class', label: t('sceneQuery.class'), scope: 'object', options: classes.map(item => item.name) },
    { id: 'shape', label: t('sceneQuery.shape'), scope: 'object', options: [...new Set(Array.from(objects.values()).flatMap(items => items.map(item => item.type)))] },
    { id: 'track', label: 'Track ID', scope: 'object' },
    { id: 'group', label: 'Group ID', scope: 'object' },
    { id: 'text', label: 'Text', scope: 'object' },
    ...attributes.map(attribute => ({
      id: `attr:${attribute.name}`,
      label: attribute.name,
      scope: 'object' as Scope,
      options: attribute.options,
    })),
  ], [attributes, classes, objects, t]);

  const assistantField = fields.find(field => field.id === assistantFieldId) ?? fields[0];
  const assistantOperators = assistantField?.numeric
    ? ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'range', 'in']
    : assistantField?.options
      ? ['eq', 'ne', 'in', 'missing', 'present']
      : ['eq', 'ne', 'contains', 'prefix', 'in', 'missing', 'present'];

  const assistantValues = useMemo(() => {
    if (!assistantField) return { values: [], tooMany: false, total: 0 };
    const values = new Set<string>();
    const add = (value: unknown) => {
      const text = String(value ?? '').trim();
      if (text) values.add(text);
    };
    assistantField.options?.forEach(add);
    if (assistantField.id === 'count') stems.forEach(stem => add(objects.get(stem)?.length ?? 0));
    else if (assistantField.id === 'name') stems.forEach(add);
    else {
      for (const annotationList of objects.values()) {
        for (const annotation of annotationList) {
          if (assistantField.id === 'class') add(annotation.label);
          else if (assistantField.id === 'shape') add(annotation.type);
          else if (assistantField.id === 'track') add(annotation.track_id);
          else if (assistantField.id === 'group') add(annotation.group_id);
          else if (assistantField.id === 'text') add(annotation.text);
          else if (assistantField.id.startsWith('attr:')) {
            getAnnotationAttributeEntries(annotation, false, attributes)
              .filter(([attributeName]) => attributeName.trim().toLowerCase() === assistantField.id.slice(5).toLowerCase())
              .forEach(([, value]) => add(value));
          }
        }
      }
    }
    const sorted = Array.from(values).sort((left, right) => assistantField.numeric
      ? Number(left) - Number(right)
      : left.localeCompare(right));
    const maxValues = 60;
    return { values: sorted.slice(0, maxValues), tooMany: sorted.length > maxValues, total: sorted.length };
  }, [assistantField, attributes, objects, stems]);

  const quickQueries = useMemo(() => [
    { key: 'sceneFilterAll', statement: 'TRUE' },
    { key: 'sceneFilterWithAnnotations', statement: 'COUNT > 0' },
    { key: 'sceneFilterEmpty', statement: 'COUNT = 0' },
  ], []);
  const parsed = useMemo(() => parseQuery(statement), [statement]);
  const preview = useMemo(() => {
    if (parsed.error) return null;
    return stems.filter(stem => matchesQuery(parsed.query, stem, objects.get(stem) ?? [], attributes)).length;
  }, [attributes, objects, parsed, stems]);
  const normalizedStatement = statement.trim().replace(/\s+/g, ' ').toUpperCase();
  const activeQuick = quickQueries.find(item => item.statement === normalizedStatement);

  const updateStatement = (next: string) => {
    setStatement(next);
    requestAnimationFrame(() => statementRef.current?.focus());
  };

  const insertAtCursor = (text: string) => {
    const textarea = statementRef.current;
    const isEmptyStatement = statement.trim().toUpperCase() === 'TRUE';
    const start = isEmptyStatement ? 0 : (textarea?.selectionStart ?? statement.length);
    const end = isEmptyStatement ? statement.length : (textarea?.selectionEnd ?? start);
    const next = `${statement.slice(0, start)}${text}${statement.slice(end)}`;
    setStatement(next);
    requestAnimationFrame(() => {
      textarea?.focus();
      const cursor = start + text.length;
      textarea?.setSelectionRange(cursor, cursor);
    });
  };

  const insertAssistantField = (field: QueryField) => {
    const token = field.id.startsWith('attr:')
      ? `ATTRIBUTE(${quote(field.id.slice(5))})`
      : ({ count: 'COUNT', name: 'NAME', class: 'CLASS', shape: 'SHAPE', track: 'TRACK_ID', group: 'GROUP_ID', text: 'TEXT' } as Record<string, string>)[field.id];
    if (token) insertAtCursor(`${token} `);
  };

  const insertAssistantValue = (value: string) => {
    insertAtCursor(assistantField?.numeric ? `${value} ` : `${quote(value)} `);
  };

  const insertAssistantOperator = (operator: string) => {
    const tokens: Record<string, string> = {
      eq: '= ',
      ne: '<> ',
      gt: '> ',
      gte: '>= ',
      lt: '< ',
      lte: '<= ',
      range: 'BETWEEN ',
      in: 'IN ',
      missing: 'IS NULL ',
      present: 'IS NOT NULL ',
      contains: 'LIKE ',
      prefix: 'LIKE ',
    };
    insertAtCursor(tokens[operator] ?? '');
  };

  const handleApply = () => {
    if (parsed.error) return;
    onApply(parsed.query);
    setOpen(false);
  };

  return <Popover open={open} onOpenChange={next => {
    if (next) {
      setStatement(queryToStatement(query));
      setName('');
    }
    setOpen(next);
  }}>
    <PopoverTrigger aria-label={t('rightPanel.filterSceneGroups')} title={t('rightPanel.filterSceneGroups')}
      className={'relative flex size-6 items-center justify-center rounded hover:bg-muted ' + (query.children.length ? 'text-primary' : 'text-muted-foreground')}>
      <Filter className="size-3.5" />
      {query.children.length > 0 && <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-primary" />}
    </PopoverTrigger>
    <PopoverContent align="end" onClick={event => event.stopPropagation()} className="w-[min(400px,calc(100vw-1rem))] max-h-[min(78vh,var(--available-height))] overflow-y-auto p-3.5">
      <div className="flex items-center justify-between gap-2">
        <PopoverTitle>{t('sceneQuery.title')}</PopoverTitle>
        <span className="rounded-full bg-muted px-2 py-1 text-xs font-mono">{matched}/{total}</span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold">{t('sceneQuery.quick')}</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {quickQueries.map(item => (
            <Button key={item.key} size="sm" variant={activeQuick?.key === item.key ? 'default' : 'outline'}
              className="h-8 text-xs" onClick={() => updateStatement(item.statement)}>
              {t(`rightPanel.${item.key}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <div className="min-w-0 overflow-hidden rounded-md border bg-muted/20">
            <div className="border-b px-2 py-1 text-[10px] font-semibold text-muted-foreground">{t('sceneQuery.fieldList')}</div>
            <div className="h-28 overflow-y-auto p-1 custom-scrollbar">
              {fields.map(field => (
                <button
                  key={field.id}
                  type="button"
                  aria-label={field.label}
                  onClick={() => setAssistantFieldId(field.id)}
                  onDoubleClick={() => insertAssistantField(field)}
                  className={`block w-full truncate rounded px-1.5 py-1 text-left text-[10px] transition-colors ${assistantField?.id === field.id ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted'}`}
                >
                  {field.label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-0 overflow-hidden rounded-md border bg-muted/20">
            <div className="border-b px-2 py-1 text-[10px] font-semibold text-muted-foreground">{t('sceneQuery.valueList')}</div>
            <div className="h-28 overflow-y-auto p-1 custom-scrollbar">
              {assistantValues.tooMany ? (
                <div className="px-1.5 py-2 text-[10px] text-muted-foreground">
                  {t('sceneQuery.tooManyValues', { count: assistantValues.total })}
                </div>
              ) : assistantValues.values.length > 0 ? assistantValues.values.map(value => (
                <button
                  key={value}
                  type="button"
                  onDoubleClick={() => insertAssistantValue(value)}
                  className="block w-full truncate rounded px-1.5 py-1 text-left text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {value}
                </button>
              )) : (
                <div className="px-1.5 py-2 text-[10px] text-muted-foreground">—</div>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-nowrap gap-1 overflow-x-auto rounded-md border bg-muted/20 p-1 custom-scrollbar">
          {assistantOperators.map(operator => (
            <button
              key={operator}
              type="button"
              aria-label={t(`sceneQuery.builderOps.${operator}`)}
              onClick={() => insertAssistantOperator(operator)}
              className="h-7 shrink-0 rounded px-2 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              {t(`sceneQuery.builderOps.${operator}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="scene-group-query-statement" className="text-xs font-semibold">{t('sceneQuery.statement')}</label>
        <textarea
          id="scene-group-query-statement"
          ref={statementRef}
          value={statement}
          onChange={event => setStatement(event.target.value)}
          spellCheck={false}
          aria-invalid={Boolean(parsed.error)}
          placeholder={t('sceneQuery.statementPlaceholder')}
          className={`min-h-24 w-full resize-y rounded-md border bg-background px-2.5 py-2 font-mono text-xs leading-5 outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 ${parsed.error ? 'border-destructive/70' : 'border-input'}`}
        />
      </div>

      {saved.length > 0 && <div className="space-y-1.5">
        <span className="text-[10px] font-semibold text-muted-foreground">{t('sceneQuery.saved')}</span>
        <div className="flex flex-wrap gap-1.5">
          {saved.map(item => <Button key={item.name} size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateStatement(item.statement)}>{item.name}</Button>)}
        </div>
      </div>}

      <div className="flex items-center justify-between gap-2 text-xs">
        {parsed.error ? (
          <span aria-live="polite" className="flex min-w-0 items-center gap-1.5 text-destructive">
            <AlertCircle className="size-3.5 shrink-0" />
            <span className="truncate">{t('sceneQuery.parseError', { message: parsed.error })}</span>
          </span>
        ) : (
          <span aria-live="polite" className="flex min-w-0 items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5 shrink-0" />
            {t('sceneQuery.valid')} · {t('sceneQuery.preview', { count: preview ?? 0 })}
          </span>
        )}
        <span className="shrink-0 text-muted-foreground">{t('sceneQuery.applied', { count: matched, total })}</span>
      </div>

      <div className="sticky bottom-0 z-10 space-y-2 border-t bg-popover pt-2">
        <div className="flex min-w-0 gap-1.5">
          <Input value={name} onChange={event => setName(event.target.value)} className="h-8 min-w-0 flex-1 text-xs"
            aria-label={t('sceneQuery.name')} placeholder={t('sceneQuery.name')} />
          <Button size="sm" variant="outline" className="h-8" disabled={!name.trim() || Boolean(parsed.error)}
            onClick={() => {
              const title = name.trim();
              setSaved(current => [...current.filter(item => item.name !== title), { name: title, statement: statement.trim() || 'TRUE' }]);
              setName('');
            }}><Save className="size-3.5" />{t('sceneQuery.save')}</Button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button size="sm" variant="ghost" className="h-8 px-1.5" onClick={() => updateStatement('TRUE')}><X className="size-3.5" />{t('rightPanel.sceneFilterClear')}</Button>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-8" onClick={() => setOpen(false)}>{t('rightPanel.sceneFilterCancel')}</Button>
            <Button size="sm" className="h-8" disabled={Boolean(parsed.error)} onClick={handleApply}>{t('rightPanel.sceneFilterApply')}</Button>
          </div>
        </div>
      </div>
    </PopoverContent>
  </Popover>;
}
