// src/components/modules/PidAnswerAudit.tsx
//
// PID answer audit window: left the evidence video, right one test image with
// its questions. One answer per question, chosen blind among the SAM 3
// candidates already computed for that image by the PID repo.
//
// This module is self-contained on purpose: it never touches the project
// store, the annotation tables or the taxonomy, so it cannot affect any
// existing MultiAnno workflow. Its own storage is the backend's
// <PID_OUTPUT_DIR>/pid_audit directory.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../../api/client';
import { Button } from '../ui/button';
import {
  Check,
  CircleSlash,
  EyeOff,
  HelpCircle,
  Maximize,
  RotateCcw,
  Save,
  Download,
  Loader2,
  ChevronLeft,
  ChevronRight,
  SkipBack,
  SkipForward,
  Square,
  Users,
} from 'lucide-react';

type AnswerState = 'box' | 'absent' | 'cannot_tell';

interface Candidate {
  index: number;
  box: [number, number, number, number];
}

interface Question {
  question_id: string;
  speaker: string;
  text: string;
  label: string;
}

interface ImageEntry {
  bg_path: string;
  image_url: string;
  questions: Question[];
}

interface ProfileEntry {
  name: string;
  url: string;
}

interface VideoEntry {
  video_id: string;
  video_url: string;
  profiles: ProfileEntry[];
  images: ImageEntry[];
}

interface Answer {
  state: AnswerState | 'unset';
  bbox: number[] | null;
  confidence: number | null;
  evidence_ts: number | null;
  /** Where the box came from: a pre-computed candidate or a hand-drawn one. */
  source?: 'candidate' | 'manual' | null;
}

const EMPTY_ANSWER: Answer = { state: 'unset', bbox: null, confidence: null, evidence_ts: null, source: null };
const MEDIA_BASE = API_BASE_URL.replace(/\/api$/, '');
const STATE_LABEL: Record<AnswerState | 'unset', string> = {
  box: '已标注',
  absent: '不可见',
  cannot_tell: '无法判断',
  unset: '未标注',
};

const get = async (path: string) => {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.detail || `请求失败 (${response.status})`);
  }
  return response.json();
};

const post = async (path: string, body: unknown) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.detail || `请求失败 (${response.status})`);
  }
  return response.json();
};

export function PidAnswerAudit({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();

  const [videos, setVideos] = useState<VideoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [videoId, setVideoId] = useState('');
  const [imagePath, setImagePath] = useState('');
  const [candidates, setCandidates] = useState<Record<string, Candidate[]>>({});
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [activeQuestionId, setActiveQuestionId] = useState('');
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [evidenceTs, setEvidenceTs] = useState<number | null>(null);
  const [showAllBoxes, setShowAllBoxes] = useState(false);
  const [preview, setPreview] = useState<ProfileEntry | null>(null);
  const [mode, setMode] = useState<'select' | 'draw'>('select');
  const [drawRect, setDrawRect] = useState<number[] | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const drawRef = useRef<{ x: number; y: number } | null>(null);
  const historyRef = useRef<Record<string, Answer>[]>([]);
  const loadedVideoRef = useRef('');
  const hydratedRef = useRef(false);
  const dirtyRef = useRef(false);

  const video = useMemo(() => videos.find(item => item.video_id === videoId), [videos, videoId]);
  const image = useMemo(
    () => video?.images.find(item => item.bg_path === imagePath),
    [video, imagePath],
  );
  const questions = image?.questions ?? [];
  const activeQuestion = useMemo(
    () => questions.find(item => item.question_id === activeQuestionId) ?? questions[0],
    [questions, activeQuestionId],
  );
  const activeLabel = activeQuestion?.label ?? '';
  const activeCandidates = candidates[activeLabel] ?? [];
  const activeAnswer = activeQuestion ? answers[activeQuestion.question_id] ?? EMPTY_ANSWER : EMPTY_ANSWER;

  // ---------------------------------------------------------------- loading
  useEffect(() => {
    get('/pid_audit/dataset')
      .then(payload => {
        const list: VideoEntry[] = payload.videos ?? [];
        setVideos(list);
        if (list.length) {
          const first = list[0];
          setVideoId(first.video_id);
          setImagePath(first.images[0]?.bg_path ?? '');
        }
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  // answers for the selected video
  useEffect(() => {
    if (!videoId) return;
    loadedVideoRef.current = videoId;
    hydratedRef.current = false;
    setAnswers({});
    setStatus('idle');
    get(`/pid_audit/annotations?video=${encodeURIComponent(videoId)}`)
      .then(payload => {
        if (loadedVideoRef.current !== videoId) return;
        const restored: Record<string, Answer> = {};
        for (const item of payload.answers ?? []) {
          restored[item.question_id] = {
            state: item.state ?? 'unset',
            bbox: item.bbox ?? null,
            confidence: item.confidence ?? null,
            evidence_ts: item.evidence_ts ?? null,
            source: item.source ?? null,
          };
        }
        setAnswers(restored);
        hydratedRef.current = true;
      })
      .catch(() => {
        setAnswers({});
        hydratedRef.current = true;
      });
  }, [videoId]);

  // candidates for the selected image
  useEffect(() => {
    if (!videoId || !imagePath) return;
    setCandidates({});
    get(`/pid_audit/candidates?video=${encodeURIComponent(videoId)}&image=${encodeURIComponent(imagePath)}`)
      .then(payload => setCandidates(payload.labels ?? {}))
      .catch(() => setCandidates({}));
    setView({ scale: 1, x: 0, y: 0 });
  }, [videoId, imagePath]);

  // first unanswered question of the image
  useEffect(() => {
    if (!questions.length) {
      setActiveQuestionId('');
      return;
    }
    const unanswered = questions.find(item => (answers[item.question_id]?.state ?? 'unset') === 'unset');
    const stillHere = questions.some(item => item.question_id === activeQuestionId);
    if (!stillHere) setActiveQuestionId((unanswered ?? questions[0]).question_id);
  }, [questions, answers, activeQuestionId]);

  // ---------------------------------------------------------------- saving
  const persist = useCallback(async (current: Record<string, Answer>) => {
    if (!videoId) return;
    setStatus('saving');
    const payload = Object.entries(current)
      .filter(([, answer]) => answer.state !== 'unset')
      .map(([questionId, answer]) => ({
        question_id: questionId,
        state: answer.state,
        bbox: answer.state === 'box' ? answer.bbox : null,
        confidence: answer.confidence,
        evidence_ts: answer.evidence_ts,
        source: answer.source ?? null,
      }));
    try {
      await post('/pid_audit/save', { video_id: videoId, answers: payload });
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }, [videoId]);

  useEffect(() => {
    if (!videoId || !hydratedRef.current || !dirtyRef.current) return;
    const timer = window.setTimeout(() => void persist(answers), 700);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, videoId]);

  const commit = useCallback((questionId: string, answer: Answer) => {
    dirtyRef.current = true;
    setAnswers(previous => {
      historyRef.current.push(previous);
      if (historyRef.current.length > 40) historyRef.current.shift();
      return { ...previous, [questionId]: answer };
    });
  }, []);

  const answerQuestion = useCallback((questionId: string, answer: Answer) => {
    const stamp = videoRef.current ? Number(videoRef.current.currentTime.toFixed(1)) : null;
    commit(questionId, { ...answer, evidence_ts: answer.state === 'box' ? stamp : null });
  }, [commit]);

  const undo = useCallback(() => {
    const previous = historyRef.current.pop();
    if (previous) {
      dirtyRef.current = true;
      setAnswers(previous);
    }
  }, []);

  // ------------------------------------------------------------- interaction
  const selectCandidate = useCallback((candidate: Candidate) => {
    if (!activeQuestion) return;
    answerQuestion(activeQuestion.question_id, {
      state: 'box',
      bbox: candidate.box,
      confidence: 1,
      evidence_ts: null,
      source: 'candidate',
    });
  }, [activeQuestion, answerQuestion]);

  // Native listener: React's onWheel is passive, which would let the page
  // scroll instead of zooming the image.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      setView(previous => {
        const scale = Math.min(8, Math.max(0.2, previous.scale * (event.deltaY < 0 ? 1.12 : 0.89)));
        const ratio = scale / previous.scale;
        return {
          scale,
          x: px - (px - previous.x) * ratio,
          y: py - (py - previous.y) * ratio,
        };
      });
    };
    stage.addEventListener('wheel', handler, { passive: false });
    return () => stage.removeEventListener('wheel', handler);
  }, []);

  const toImagePoint = useCallback((event: React.PointerEvent) => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };
    const rect = stage.getBoundingClientRect();
    const x = (event.clientX - rect.left - view.x) / view.scale;
    const y = (event.clientY - rect.top - view.y) / view.scale;
    return {
      x: Math.max(0, Math.min(imageSize.width, x)),
      y: Math.max(0, Math.min(imageSize.height, y)),
    };
  }, [view, imageSize]);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0 && event.button !== 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (mode === 'draw' && event.button === 0) {
      const point = toImagePoint(event);
      drawRef.current = point;
      setDrawRect([point.x, point.y, point.x, point.y]);
      return;
    }
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: view.x,
      originY: view.y,
      moved: false,
    };
  }, [view, mode, toImagePoint]);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    if (mode === 'draw' && drawRef.current) {
      const point = toImagePoint(event);
      const start = drawRef.current;
      setDrawRect([
        Math.min(start.x, point.x),
        Math.min(start.y, point.y),
        Math.max(start.x, point.x),
        Math.max(start.y, point.y),
      ]);
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true;
    if (drag.moved) setView(previous => ({ ...previous, x: drag.originX + dx, y: drag.originY + dy }));
  }, [mode, toImagePoint]);

  const onPointerUp = useCallback(() => {
    if (mode === 'draw' && drawRef.current) {
      const rect = drawRect;
      drawRef.current = null;
      setDrawRect(null);
      setMode('select');
      if (activeQuestion && rect) {
        const [x1, y1, x2, y2] = rect;
        if (x2 - x1 >= 4 && y2 - y1 >= 4) {
          answerQuestion(activeQuestion.question_id, {
            state: 'box',
            bbox: [Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)],
            confidence: 1,
            evidence_ts: null,
            source: 'manual',
          });
        }
      }
      return;
    }
    dragRef.current = null;
  }, [mode, drawRect, activeQuestion, answerQuestion]);

  const fitView = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !imageSize.width) return;
    const rect = stage.getBoundingClientRect();
    const scale = Math.min(rect.width / imageSize.width, rect.height / imageSize.height) * 0.96;
    setView({
      scale,
      x: (rect.width - imageSize.width * scale) / 2,
      y: (rect.height - imageSize.height * scale) / 2,
    });
  }, [imageSize]);

  useEffect(() => {
    if (imageSize.width > 1) fitView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSize, imagePath]);

  // keyboard
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (!activeQuestion) return;

      if (/^[1-9]$/.test(event.key)) {
        const candidate = activeCandidates[Number(event.key) - 1];
        if (candidate) {
          event.preventDefault();
          selectCandidate(candidate);
        }
        return;
      }
      switch (event.key.toLowerCase()) {
        case 'a':
          event.preventDefault();
          answerQuestion(activeQuestion.question_id, { state: 'absent', bbox: null, confidence: 1, evidence_ts: null });
          break;
        case 'x':
          event.preventDefault();
          answerQuestion(activeQuestion.question_id, { state: 'cannot_tell', bbox: null, confidence: 1, evidence_ts: null });
          break;
        case 'z':
          event.preventDefault();
          undo();
          break;
        case 'd':
          event.preventDefault();
          setMode(value => (value === 'draw' ? 'select' : 'draw'));
          break;
        case 'escape':
          event.preventDefault();
          drawRef.current = null;
          setDrawRect(null);
          setMode('select');
          break;
        case 'enter': {
          event.preventDefault();
          const position = questions.findIndex(item => item.question_id === activeQuestion.question_id);
          const next = questions[position + 1] ?? questions[0];
          if (next) setActiveQuestionId(next.question_id);
          break;
        }
        case 'arrowdown':
        case 'arrowup': {
          event.preventDefault();
          const position = questions.findIndex(item => item.question_id === activeQuestion.question_id);
          const delta = event.key === 'ArrowDown' ? 1 : -1;
          const next = questions[(position + delta + questions.length) % questions.length];
          if (next) setActiveQuestionId(next.question_id);
          break;
        }
        case ' ':
          event.preventDefault();
          if (videoRef.current) {
            if (videoRef.current.paused) void videoRef.current.play();
            else videoRef.current.pause();
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeQuestion, activeCandidates, answerQuestion, questions, selectCandidate, undo]);

  const step = (seconds: number) => {
    const element = videoRef.current;
    if (!element) return;
    element.pause();
    element.currentTime = Math.max(0, element.currentTime + seconds);
    setEvidenceTs(Number(element.currentTime.toFixed(1)));
  };

  const download = async () => {
    const payload = await get('/pid_audit/export');
    const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'owned_gt.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // ---------------------------------------------------------------- rendering
  const answeredCount = questions.filter(item => (answers[item.question_id]?.state ?? 'unset') !== 'unset').length;
  const videoAnswered = useMemo(() => {
    if (!video) return 0;
    return video.images.reduce((total, entry) => (
      total + entry.questions.filter(item => (answers[item.question_id]?.state ?? 'unset') !== 'unset').length
    ), 0);
  }, [video, answers]);
  const videoTotal = useMemo(
    () => (video ? video.images.reduce((total, entry) => total + entry.questions.length, 0) : 0),
    [video],
  );
  const stateCounts = useMemo(() => {
    let box = 0, absent = 0, cannot = 0;
    for (const answer of Object.values(answers) as Answer[]) {
      if (answer.state === 'box') box += 1;
      else if (answer.state === 'absent') absent += 1;
      else if (answer.state === 'cannot_tell') cannot += 1;
    }
    return { box, absent, cannot };
  }, [answers]);

  const isActiveBox = (box: number[]) =>
    activeAnswer.state === 'box'
    && !!activeAnswer.bbox
    && box.every((value, index) => Math.abs(value - (activeAnswer.bbox as number[])[index]) < 3);

  const boxStyle = (box: number[], strong: boolean, selected: boolean, interactive: boolean): React.CSSProperties => ({
    left: box[0],
    top: box[1],
    width: Math.max(2, box[2] - box[0]),
    height: Math.max(2, box[3] - box[1]),
    borderColor: selected ? '#ef4444' : strong ? '#6b7280' : 'rgba(148,163,184,0.5)',
    borderWidth: (selected ? 3 : strong ? 2 : 1) / view.scale,
    background: selected ? 'rgba(239,68,68,0.12)' : strong ? 'rgba(107,114,128,0.08)' : 'transparent',
    pointerEvents: interactive ? 'auto' : 'none',
  });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500 dark:text-neutral-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t('pidAudit.loading', '正在加载 PID 数据集…')}
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-neutral-600 dark:text-neutral-300">
        <p className="text-sm">{error}</p>
        <p className="text-xs text-neutral-500">
          {t('pidAudit.hint', '请确认后端已启动，且 PID_DATA_ROOT / PID_OUTPUT_DIR 指向 PID 数据。')}
        </p>
        <Button variant="secondary" onClick={onClose}>{t('pidAudit.close', '关闭')}</Button>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-200 px-3 py-2 text-xs dark:border-neutral-800">
        <span className="font-semibold">{t('pidAudit.title', 'PID 答案标注')}</span>
        <span className="text-neutral-500 dark:text-neutral-400">
          {videoAnswered}/{videoTotal} · {answeredCount}/{questions.length} 本图
        </span>
        <span className={`ml-1 rounded px-1.5 py-0.5 ${
          status === 'saved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
            : status === 'saving' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
              : status === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
        }`}>
          {status === 'saved' ? t('pidAudit.saved', '已保存') : status === 'saving' ? t('pidAudit.saving', '保存中…')
            : status === 'error' ? t('pidAudit.saveFailed', '保存失败') : t('pidAudit.idle', '未改动')}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={undo} title="撤销 (Z)"><RotateCcw className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" onClick={fitView} title="适应窗口"><Maximize className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => void persist(answers)} title="保存">
            <Save className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void download()} title="导出 owned_gt.json">
            <Download className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="secondary" onClick={onClose}>{t('pidAudit.close', '关闭')}</Button>
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* video side */}
        <div className="flex w-[38%] min-w-[380px] max-w-[640px] shrink-0 flex-col gap-2 border-r border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-800 dark:bg-neutral-900/40">
          <select
            className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
            value={videoId}
            onChange={event => {
              const next = videos.find(item => item.video_id === event.target.value);
              setVideoId(event.target.value);
              setImagePath(next?.images[0]?.bg_path ?? '');
            }}
          >
            {videos.map(item => (
              <option key={item.video_id} value={item.video_id}>{item.video_id}</option>
            ))}
          </select>

          <video
            ref={videoRef}
            src={`${MEDIA_BASE}${video?.video_url ?? ''}`}
            controls
            className="max-h-[55vh] w-full rounded bg-black object-contain"
            preload="auto"
            playsInline
            onTimeUpdate={event => setEvidenceTs(Number(event.currentTarget.currentTime.toFixed(1)))}
          />

          <div className="flex items-center justify-between gap-1 text-xs">
            <span className="font-mono text-neutral-500 dark:text-neutral-400">t={evidenceTs ?? 0}s</span>
            <span className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => step(-1)} title="后退 1 秒"><SkipBack className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => step(-0.2)} title="后退 0.2 秒">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => step(0.2)} title="前进 0.2 秒">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => step(1)} title="前进 1 秒"><SkipForward className="h-4 w-4" /></Button>
            </span>
            <select
              className="rounded border border-neutral-300 bg-white px-1 py-0.5 dark:border-neutral-700 dark:bg-neutral-900"
              defaultValue="1"
              onChange={event => {
                if (videoRef.current) videoRef.current.playbackRate = Number(event.target.value);
              }}
            >
              <option value="0.25">0.25×</option>
              <option value="0.5">0.5×</option>
              <option value="1">1×</option>
              <option value="2">2×</option>
            </select>
          </div>

          <div className="mt-1">
            <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              <Users className="h-3.5 w-3.5" />
              {t('pidAudit.people', '人物')}
              <span className="font-mono text-[10px]">{video?.profiles?.length ?? 0}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(video?.profiles ?? []).map(profile => (
                <button
                  key={profile.name}
                  onClick={() => setPreview(profile)}
                  title={t('pidAudit.viewProfile', '点击看大图')}
                  className="flex w-[104px] flex-col items-center gap-1.5 rounded-md border border-neutral-200 bg-white p-2 transition-colors hover:border-sky-400 dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <img
                    src={`${MEDIA_BASE}${profile.url}`}
                    alt={profile.name}
                    className="h-20 w-20 rounded-full object-cover"
                  />
                  <span className="w-full truncate text-center text-xs">{profile.name}</span>
                </button>
              ))}
              {video && (video.profiles?.length ?? 0) === 0 && (
                <span className="text-[11px] text-neutral-400">{t('pidAudit.noProfiles', '无 profile 图片')}</span>
              )}
            </div>
          </div>

          <p className="mt-auto text-[11px] leading-4 text-neutral-500 dark:text-neutral-400">
            {t('pidAudit.blindHint', '盲标：本窗口不显示管线已选的答案。数字键选候选，A=不可见，X=无法判断，Z=撤销，回车=下一题。')}
          </p>
        </div>

        {/* image side */}
        <div className="flex min-w-[360px] flex-1 flex-col">
          <div
            ref={stageRef}
            className={`relative min-h-0 flex-1 overflow-hidden bg-neutral-100 dark:bg-neutral-900 ${mode === 'draw' ? 'cursor-crosshair' : 'cursor-grab'}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div
              className="absolute origin-top-left"
              style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
            >
              {image && (
                <img
                  src={`${MEDIA_BASE}${image.image_url}`}
                  alt={image.bg_path}
                  draggable={false}
                  onLoad={event => setImageSize({
                    width: event.currentTarget.naturalWidth || 1,
                    height: event.currentTarget.naturalHeight || 1,
                  })}
                  style={{ display: 'block', maxWidth: 'none', width: imageSize.width }}
                />
              )}

              {Object.keys(candidates).map(label => {
                const strong = showAllBoxes || label === activeLabel;
                if (!strong) return null;
                const items: Candidate[] = candidates[label] ?? [];
                return items.map(candidate => {
                  const selected = activeAnswer.state === 'box'
                    && activeAnswer.bbox
                    && candidate.box.every((value, index) => Math.abs(value - (activeAnswer.bbox as number[])[index]) < 3);
                  return (
                    <div
                      key={`${label}-${candidate.index}`}
                      className="absolute border-solid"
                      style={boxStyle(candidate.box, strong, Boolean(selected), label === activeLabel && mode === 'select')}
                      onPointerDown={event => event.stopPropagation()}
                      onClick={event => {
                        event.stopPropagation();
                        selectCandidate(candidate);
                      }}
                    >
                      <span
                        className="absolute left-0 rounded bg-neutral-800/90 px-1.5 py-0.5 font-mono text-[13px] font-semibold leading-none text-white"
                        style={{ top: -24 / view.scale, transform: `scale(${1 / view.scale})`, transformOrigin: 'top left' }}
                      >
                        {candidate.index + 1}
                      </span>
                    </div>
                  );
                });
              })}
              {/* the active question's answer, drawn even when no candidate matches it */}
              {activeQuestion && activeAnswer.state === 'box' && activeAnswer.bbox
                && !(candidates[activeLabel] ?? []).some(candidate => candidate.box.every(
                  (value, index) => Math.abs(value - (activeAnswer.bbox as number[])[index]) < 3,
                ))
                && (
                  <div
                    className="absolute border-solid"
                    style={{
                      left: (activeAnswer.bbox as number[])[0],
                      top: (activeAnswer.bbox as number[])[1],
                      width: Math.max(2, (activeAnswer.bbox as number[])[2] - (activeAnswer.bbox as number[])[0]),
                      height: Math.max(2, (activeAnswer.bbox as number[])[3] - (activeAnswer.bbox as number[])[1]),
                      borderColor: '#ef4444',
                      borderWidth: 3 / view.scale,
                      background: 'rgba(239,68,68,0.12)',
                      pointerEvents: 'none',
                    }}
                  />
                )}
              {drawRect && (
                <div
                  className="absolute border-2 border-dashed border-red-500 bg-red-400/10"
                  style={{
                    left: drawRect[0],
                    top: drawRect[1],
                    width: Math.max(1, drawRect[2] - drawRect[0]),
                    height: Math.max(1, drawRect[3] - drawRect[1]),
                    pointerEvents: 'none',
                  }}
                />
              )}
            </div>
            <span className="absolute bottom-2 left-2 rounded bg-black/50 px-1.5 py-0.5 font-mono text-[10px] text-white">
              {Math.round(view.scale * 100)}%
            </span>
          </div>

          {/* answer toolbar: candidates, states and tools, right under the image */}
          <div className="flex shrink-0 flex-wrap items-center gap-1 border-t border-neutral-200 bg-neutral-50 px-2 py-1.5 dark:border-neutral-800 dark:bg-neutral-900/40">
            <span className="mr-1 text-[11px] text-neutral-500 dark:text-neutral-400">
              {t('pidAudit.candidates', '候选')} {activeQuestion?.label ?? '-'}：
            </span>
            {activeQuestion && activeCandidates.length === 0 && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400">
                {t('pidAudit.noCandidates', '该标签在本图没有候选：点「画框」手动标，或标「不可见」')}
              </span>
            )}
            {activeQuestion && activeCandidates.map((candidate, position) => (
              <Button
                key={candidate.index}
                size="sm"
                variant={isActiveBox(candidate.box) ? 'default' : 'outline'}
                onClick={() => selectCandidate(candidate)}
                title={candidate.box.join(', ')}
              >
                {position + 1}
              </Button>
            ))}
            <span className="mx-1 h-4 w-px bg-neutral-300 dark:bg-neutral-700" />
            <Button
              size="sm"
              variant={activeAnswer.state === 'absent' ? 'default' : 'outline'}
              onClick={() => activeQuestion && answerQuestion(activeQuestion.question_id, { state: 'absent', bbox: null, confidence: 1, evidence_ts: null })}
              title="A"
            >
              <EyeOff className="mr-1 h-3.5 w-3.5" />{t('pidAudit.absent', '不可见')}
            </Button>
            <Button
              size="sm"
              variant={activeAnswer.state === 'cannot_tell' ? 'default' : 'outline'}
              onClick={() => activeQuestion && answerQuestion(activeQuestion.question_id, { state: 'cannot_tell', bbox: null, confidence: 1, evidence_ts: null })}
              title="X"
            >
              <HelpCircle className="mr-1 h-3.5 w-3.5" />{t('pidAudit.cannotTell', '无法判断')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => activeQuestion && commit(activeQuestion.question_id, { ...EMPTY_ANSWER })}
              title="清空"
            >
              <CircleSlash className="mr-1 h-3.5 w-3.5" />{t('pidAudit.clear', '清空')}
            </Button>
            <span className="mx-1 h-4 w-px bg-neutral-300 dark:bg-neutral-700" />
            <Button
              size="sm"
              variant={mode === 'draw' ? 'default' : 'outline'}
              onClick={() => setMode(value => (value === 'draw' ? 'select' : 'draw'))}
              title={t('pidAudit.drawHint', '画框 (D)：候选都不对时手动画一个')}
            >
              <Square className="mr-1 h-3.5 w-3.5" />{t('pidAudit.draw', '画框')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAllBoxes(value => !value)}>
              {showAllBoxes ? '仅当前标签' : '显示全部候选'}
            </Button>
          </div>

          {/* questions of this image */}
          <div className="flex shrink-0 flex-col border-t border-neutral-200 dark:border-neutral-800">
            <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 px-2 py-1 text-[11px] text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
              <span className="font-mono">{imagePath.split('/').pop()}</span>
              <span>·</span>
              <span>{questions.length} 题</span>
            </div>
            <div className="h-[186px] overflow-auto p-2">
            <div className="flex flex-col gap-1">
              {questions.map((question, position) => {
                const answer = answers[question.question_id] ?? EMPTY_ANSWER;
                const current = question.question_id === activeQuestion?.question_id;
                return (
                  <div
                    key={question.question_id}
                    onClick={() => setActiveQuestionId(question.question_id)}
                    className={`cursor-pointer rounded border px-2 py-1 text-xs ${
                      current
                        ? 'border-sky-400 bg-sky-50 dark:border-sky-600 dark:bg-sky-950/40'
                        : 'border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-neutral-500">{question.question_id}</span>
                      <span className="font-medium">{question.speaker}</span>
                      <span className="line-clamp-2 flex-1 leading-snug">{question.text}</span>
                      <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                        answer.state === 'box'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : answer.state === 'absent'
                            ? 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200'
                            : answer.state === 'cannot_tell'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                              : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                      }`}>
                        {STATE_LABEL[answer.state]}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1">
                      <span className="text-[10px] text-neutral-500 dark:text-neutral-400">标签：{question.label}</span>
                      {answer.state === 'box' && answer.bbox && (
                        <span className="font-mono text-[10px] text-neutral-500">
                          [{answer.bbox.join(', ')}]
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            </div>

          </div>
        </div>

        {/* column 3: image switcher */}
        <div className="flex w-[220px] min-w-[200px] shrink-0 flex-col border-l border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/40">
          <div className="flex min-h-0 flex-1 flex-col border-neutral-200 p-2 dark:border-neutral-800">
            <div className="mb-1 flex items-center gap-2 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              <span>{t('pidAudit.images', '图像')}</span>
              <span className="font-mono text-[10px]">{video?.images.length ?? 0}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {video?.images.map(entry => {
                const done = entry.questions.filter(item => (answers[item.question_id]?.state ?? 'unset') !== 'unset').length;
                const current = entry.bg_path === imagePath;
                return (
                  <button
                    key={entry.bg_path}
                    onClick={() => setImagePath(entry.bg_path)}
                    className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs ${
                      current ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <span className="truncate">{entry.bg_path.split('/').pop()}</span>
                    <span className="ml-2 shrink-0 font-mono text-[10px] text-neutral-500 dark:text-neutral-400">
                      {done}/{entry.questions.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="shrink-0 border-t border-neutral-200 p-2 text-[11px] dark:border-neutral-800">
            <div className="mb-1 font-medium text-neutral-500 dark:text-neutral-400">
              {t('pidAudit.progress', '进度')}
            </div>
            <div className="mb-1 text-neutral-700 dark:text-neutral-300">
              {stateCounts.box + stateCounts.absent + stateCounts.cannot} / {videoTotal}
            </div>
            <div className="flex flex-col gap-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-emerald-400" />
                {t('pidAudit.box', '框')} {stateCounts.box}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-neutral-400" />
                {t('pidAudit.absent', '不可见')} {stateCounts.absent}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-amber-400" />
                {t('pidAudit.cannotTell', '无法判断')} {stateCounts.cannot}
              </span>
            </div>
          </div>
        </div>
      </div>

      {preview && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          onClick={() => setPreview(null)}
        >
          <div
            className="rounded-lg bg-white p-3 shadow-xl dark:bg-neutral-900"
            onClick={event => event.stopPropagation()}
          >
            <img
              src={`${MEDIA_BASE}${preview.url}`}
              alt={preview.name}
              className="max-h-[68vh] max-w-[68vw] rounded object-contain"
            />
            <div className="mt-2 text-center text-sm font-medium">{preview.name}</div>
          </div>
        </div>
      )}
    </div>
  );
}
