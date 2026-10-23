import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Movimento com intenção:
 *  1. Letreiro (abertura em CSS): ao rolar, a placa inclina para trás em perspectiva,
 *     o relevo das letras cresce e as linhas se afastam, como um letreiro visto de
 *     baixo enquanto você passa pela calçada.
 *  2. Varal de promoções: trava SÓ quando as etiquetas estão inteiras na tela e corre
 *     na horizontal, com barra de progresso. Em telas baixas, vira rolagem lateral comum.
 *  3. Toldo e etiquetas balançam de leve com a velocidade da rolagem.
 * Com "reduzir movimento" ligado, nada disso roda.
 */

const MOTION = '(prefers-reduced-motion: no-preference)';
// Varal fixado só onde cabe: largura de desktop e altura suficiente para as etiquetas
const RAIL = `${MOTION} and (min-width: 900px) and (min-height: 600px)`;

let mm: gsap.MatchMedia | null = null;
let railCleanup: (() => void) | null = null;

export function initMotion() {
  gsap.registerPlugin(ScrollTrigger);
  mm = gsap.matchMedia();

  mm.add(MOTION, () => {
    signScroll();
    valanceSway();
  });

  mm.add(RAIL, () => {
    railCleanup = buildRail();
    return () => {
      railCleanup?.();
      railCleanup = null;
    };
  });
}

/* ---------- 1. Letreiro ---------- */

function signScroll() {
  const name = document.querySelector<HTMLElement>('[data-hero-name]');
  const lines = gsap.utils.toArray<HTMLElement>('[data-hero-line]');
  if (!name || lines.length < 2) return;

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: '#topo', start: 'top top', end: 'bottom top', scrub: 0.7 },
  });
  // Relevo cresce e as letras "amaciam" (eixo SOFT da Fraunces)
  tl.fromTo(name, { '--d': 7, '--soft': 40 }, { '--d': 15, '--soft': 100 }, 0)
    // A placa tomba para trás; a linha de cima mais, dando profundidade
    .fromTo(lines[0]!, { rotateX: 0, yPercent: 0 }, { rotateX: 38, yPercent: -18 }, 0)
    .fromTo(lines[1]!, { rotateX: 0, yPercent: 0, xPercent: 0 }, { rotateX: 24, yPercent: -10, xPercent: 2 }, 0)
    .fromTo(name, { autoAlpha: 1 }, { autoAlpha: 0.25, ease: 'power1.in' }, 0.35);
}

/* ---------- 3a. Toldo ---------- */

function valanceSway() {
  const valance = document.querySelector<HTMLElement>('[data-valance]');
  const photo = document.querySelector<HTMLElement>('[data-storefront]');
  if (!valance || !photo) return;
  const skew = gsap.quickTo(valance, 'skewX', { duration: 0.9, ease: 'power3.out' });
  const lift = gsap.quickTo(valance, 'scaleY', { duration: 0.9, ease: 'power3.out' });
  ScrollTrigger.create({
    trigger: photo,
    start: 'top bottom',
    end: 'bottom top',
    onUpdate(self) {
      const v = gsap.utils.clamp(-1, 1, self.getVelocity() / -2500);
      skew(v * 2.2); // tecido arrasta para o lado oposto do movimento
      lift(1 + Math.abs(v) * 0.06); // e "infla" um pouco com o vento
    },
    onToggle(self) {
      if (!self.isActive) {
        skew(0);
        lift(1);
      }
    },
  });
}

/* ---------- 2. Varal de promoções ---------- */

function buildRail(): (() => void) | null {
  const section = document.querySelector<HTMLElement>('[data-promos]');
  const wrap = document.querySelector<HTMLElement>('[data-rail]');
  const track = wrap?.querySelector<HTMLElement>('.rail__track');
  const bar = document.querySelector<HTMLElement>('[data-rail-progress]');
  if (!section || !wrap || !track || wrap.hidden) return null;

  wrap.dataset['pinned'] = 'true';
  const distance = () => Math.max(0, track.scrollWidth - document.documentElement.clientWidth);
  const headerH = () => document.querySelector<HTMLElement>('[data-header]')?.offsetHeight ?? 0;

  // Só trava se as etiquetas cabem inteiras entre o cabeçalho e o rodapé da tela
  const fits = () => wrap.offsetHeight + headerH() + 24 <= window.innerHeight;
  if (distance() < 40 || !fits()) {
    wrap.dataset['pinned'] = 'false';
    return null;
  }

  const tween = gsap.to(track, { x: () => -distance(), ease: 'none' });
  if (bar) tween.eventCallback('onUpdate', () => gsap.set(bar, { scaleX: tween.progress() }));

  // Início: só quando o PÉ do varal (etiquetas + barra) encosta no rodapé da tela,
  // com folga. Assim as etiquetas já estão inteiras quando começam a correr.
  const pin = ScrollTrigger.create({
    trigger: wrap,
    pin: section,
    start: 'bottom bottom-=32',
    end: () => `+=${distance()}`,
    scrub: 0.8,
    animation: tween,
    invalidateOnRefresh: true,
    anticipatePin: 1,
  });

  // Etiquetas balançam com a velocidade (corpo da etiqueta; a inclinação fixa fica no <li>)
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
    if (bar) gsap.set(bar, { clearProps: 'transform' });
    wrap.dataset['pinned'] = 'false';
  };
}

/** Recalcula o varal depois que o conteúdo ao vivo substitui o de reserva. */
export function refreshMotion() {
  if (!mm) return;
  if (window.matchMedia(RAIL).matches) {
    railCleanup?.();
    railCleanup = buildRail();
  }
  ScrollTrigger.refresh();
}
