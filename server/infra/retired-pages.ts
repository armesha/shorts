const RETIRED_PAGE_PATHS = ['/cards', '/editor', '/admin/banners', '/banners', '/template-editor',
  '/szz', '/szzbackup', '/szzbackup2', '/szzbackup3', '/szzbackup4', '/szzcards', '/szzreport', '/tempszz', '/tempszz.txt'];

export function isRetiredPage(rawUrl: string): boolean {
  const path = rawUrl.split(/[?#]/, 1)[0];
  return RETIRED_PAGE_PATHS.some(base => path === base || path.startsWith(`${base}/`));
}
