const readEnv = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const runtimeEnv = (
  import.meta as ImportMeta & { env?: Record<string, unknown> }
).env ?? {};

/** Non-secret AI defaults supplied by the local project .env file. */
export const AI_ENV_DEFAULTS = {
  model: readEnv(runtimeEnv.VITE_AI_MODEL_TYPE) || 'SAM-3',
  modelPath: readEnv(runtimeEnv.VITE_AI_MODEL_PATH),
  classFilePath: readEnv(runtimeEnv.VITE_AI_CLASSES_PATH),
};

/** Non-secret VLM display defaults; the API key remains backend-only. */
export const VLM_ENV_DEFAULTS = {
  baseUrl: readEnv(runtimeEnv.VITE_VLM_BASE_URL) || 'https://api.openai.com/v1',
  model: readEnv(runtimeEnv.VITE_VLM_MODEL) || 'gpt-4o-mini',
};
