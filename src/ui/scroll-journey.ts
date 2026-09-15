interface JourneyNavigation {
  goTo(id: string, focus?: boolean, behavior?: ScrollBehavior): void;
  dispose(): void;
}

export function bindScrollJourney(root: HTMLElement, onChange: (id: string) => void): JourneyNavigation {
  const chapters = [...root.querySelectorAll<HTMLElement>('[data-chapter]')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const activate = (id: string) => {
    root.dataset.chapter = id;
    root.querySelectorAll<HTMLElement>('[data-journey-link]').forEach((link) => {
      if (link.dataset.journeyLink === id) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
    onChange(id);
  };
  const goTo = (id: string, focus = true, behavior: ScrollBehavior = 'smooth') => {
    const chapter = chapters.find((element) => element.id === id);
    if (!chapter) return;
    activate(id);
    chapter.scrollIntoView?.({ behavior: reducedMotion.matches ? 'instant' : behavior, block: 'start' });
    if (focus) chapter.querySelector<HTMLElement>('h1, h2')?.focus({ preventScroll: true });
  };
  const links = [...root.querySelectorAll<HTMLAnchorElement>('[data-journey-link]')];
  const navigate = (event: Event) => {
    event.preventDefault();
    goTo((event.currentTarget as HTMLElement).dataset.journeyLink!);
  };
  links.forEach((link) => link.addEventListener('click', navigate));
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting);
    if (visible.length) activate(visible.at(-1)!.target.id);
  }, { rootMargin: '-30% 0px -50% 0px', threshold: 0 });
  chapters.forEach((chapter) => observer.observe(chapter));
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => entry.target.classList.toggle('is-visible', entry.isIntersecting));
  }, { threshold: 0, rootMargin: '0px 0px -4% 0px' });
  root.querySelectorAll('.journey-scene').forEach((scene) => revealObserver.observe(scene));
  root.classList.add('journey-ready');
  return {
    goTo,
    dispose() {
      observer.disconnect();
      revealObserver.disconnect();
      links.forEach((link) => link.removeEventListener('click', navigate));
    },
  };
}
