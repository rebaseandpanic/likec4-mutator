import { createLanguageServices, NoFileSystem, NoLikeC4ManualLayouts } from '@likec4/language-server/module';

type LikeC4Services = ReturnType<typeof createLanguageServices>;

let _services: LikeC4Services | null = null;

export function getServices(): LikeC4Services {
  if (!_services) {
    _services = createLanguageServices({
      ...NoFileSystem,
      ...NoLikeC4ManualLayouts,
    });
  }
  return _services;
}
