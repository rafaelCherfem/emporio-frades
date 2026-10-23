import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Movimento com intenção, em dois momentos:
 *  1. Abertura (em CSS, ver .hero__name em site.css): o nome entra condensado e se
 *     abre na largura da fachada. Aqui, ao rolar, ele volta a se estreitar, como um
 *     letreiro ficando para trás.
 *  2. Promoções: no desktop a seção fica fixa e as etiquetas correm na horizontal,
 *     balançando de leve com a velocidade da rolagem.
 * Com "reduzir movimento" ligado, nada disso roda.
 */

let mm: gsap.MatchMedia | null = null;
let railCleanup: (() => void) | null = null;

export function initMotion() {
  gsap.registerPlugin(ScrollTrigger);
  mm = gsap.matchMedia();

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    heroScroll();
  });

  mm.add('(prefers-reduced-motion: no-preference) and (min-width: 900px)', () => {
    railCleanup = buildRail();
    return () => {
      railCleanup?.();
      railCleanup = null;
    };
  });
}

function heroScroll() {
  const name = document.querySelector<HTMLElement>('[data-hero-name]');
  if (!name) return;
  gsap.fromTo(
    name,
    { '--wdth': '112%', yPercent: 0 },
    {
      '--wdth': '72%',
      yPercent: -6,
      ease: 'none',
      immediateRender: false,
      scrollTrigger: { trigger: '#topo', start: 'top top', end: 'bottom top', scrub: 0.6 },
    },
  );
}

function buildRail(): (() => void) | null {
  const section = document.querySelector<HTMLElement>('[data-promos]');
  const wrap = document.querySelector<HTMLElement>('[data-rail]');
  const track = wrap?.querySelector<HTMLElement>('.rail__track');
  if (!section || !wrap || !track || wrap.hidden) return null;

  wrap.dataset['pinned'] = 'true';
  const distance = () => Math.max(0, track.scrollWidth - document.documentElement.clientWidth);
  if (distance() < 40) {
    wrap.dataset['pinned'] = 'false';
    return null;
  }

  // Fixa quando o título da seção encosta logo abaixo do cabeçalho (o respiro
  // superior da seção passa por baixo dele), para nada ficar escondido.
  const offset = () => {
    const header = document.querySelector<HTMLElement>('[data-header]')?.offsetHeight ?? 0;
    const padTop = parseFloat(getComputedStyle(section).paddingTop) || 0;
    return Math.max(0, padTop - header - 56);
  };

  const tween = gsap.to(track, { x: () => -distance(), ease: 'none' });
  const pin = ScrollTrigger.create({
    trigger: section,
    start: () => `top+=${offset()} top`,
    end: () => `+=${distance()}`,
    pin: true,
    scrub: 0.8,
    animation: tween,
    invalidateOnRefresh: true,
  });

  // O balanço vai no corpo da etiqueta; a inclinação fixa fica no <li>
  const bodies = gsap.utils.toArray<HTMLElement>('.tag__body', track);
  const swing = bodies.map((b) => gsap.quickTo(b, 'rotation', { duration: 0.7, ease: 'power3.out' }));
  const sway = ScrollTrigger.create({
    trigger: section,
    start: 'top bottom',
    end: 'bottom top',
    onUpdate(self) {
      const v = gsap.utils.clamp(-3.5, 3.5, self.getVelocity() / -450);
      swing.forEach((fn, i) => fn(v * (i % 2 ? 1 : 0.7)));
    },
    onToggle(self) {
      if (!self.isActive) swing.forEach((fn) => fn(0));
    },
  });

  return () => {
    sway.kill();
    pin.kill(true);
    tween.kill();
    gsap.set(track, { clearProps: 'transform' });
    gsap.set(bodies, { clearProps: 'transform' });
    wrap.dataset['pinned'] = 'false';
  };
}

/** Recalcula o trilho depois que o conteúdo ao vivo substitui o de reserva. */
export function refreshMotion() {
  if (!mm) return;
  if (window.matchMedia('(prefers-reduced-motion: no-preference) and (min-width: 900px)').matches) {
    railCleanup?.();
    railCleanup = buildRail();
  }
  ScrollTrigger.refresh();
}
