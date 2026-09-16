export const RECENT_PROJECTS_KEY = 'multiAnno_recentProjects';
export const MAX_RECENT_PROJECTS = 3;

export interface RecentProject {
  path: string;
  name: string;
}

export const normalizeProjectPath = (path: string) => path.trim().replace(/[\\/]+$/, '').toLowerCase();

export const getProjectNameFromPath = (path: string) => {
  const fileName = path.trim().replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path.trim();
  return fileName.replace(/\.json$/i, '').replace(/_meta$/i, '') || path.trim();
};

export const parseRecentProjects = (raw: string | null): RecentProject[] => {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const projects: RecentProject[] = [];
    parsed.forEach((entry: unknown) => {
      const path = typeof entry === 'string'
        ? entry.trim()
        : entry && typeof entry === 'object' && 'path' in entry && typeof entry.path === 'string'
          ? entry.path.trim()
          : '';
      if (!path || projects.some((project) => normalizeProjectPath(project.path) === normalizeProjectPath(path))) return;

      const name = typeof entry === 'object' && entry && 'name' in entry && typeof entry.name === 'string'
        ? entry.name.trim()
        : getProjectNameFromPath(path);
      projects.push({ path, name: name || getProjectNameFromPath(path) });
    });

    return projects.slice(0, MAX_RECENT_PROJECTS);
  } catch (error) {
    console.warn('Failed to parse recent projects:', error);
    return [];
  }
};

export const rememberRecentProject = (
  path: string,
  name?: string,
  currentProjects: RecentProject[] = [],
): RecentProject[] => {
  const trimmedPath = path.trim();
  if (!trimmedPath) return currentProjects.slice(0, MAX_RECENT_PROJECTS);

  const project = {
    path: trimmedPath,
    name: name?.trim() || getProjectNameFromPath(trimmedPath),
  };
  const nextProjects = [
    project,
    ...currentProjects.filter((item) => normalizeProjectPath(item.path) !== normalizeProjectPath(trimmedPath)),
  ].slice(0, MAX_RECENT_PROJECTS);

  try {
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(nextProjects));
  } catch (error) {
    console.warn('Failed to save recent projects:', error);
  }

  return nextProjects;
};
