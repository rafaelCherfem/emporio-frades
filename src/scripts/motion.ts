import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Movimento da página. Cada efeito roda isolado (safe): se um falhar num navegador,
 * os outros continuam. Com "reduzir movimento" ligado, nada disso roda.
 *
 *  1. Letreiro: ao rolar, as duas linhas se separam em direções opostas, as letras se
 *     espaçam e ondulam em sequência, ganham peso e relevo, e a placa tomba em perspectiva.
 *  2. Foto do salão: paralaxe (a foto anda mais devagar que a página).
 *  3. Toldo: uma onda percorre os gomos conforme a velocidade e a direção da rolagem.
 *  4. Varal: a seção trava e as etiquetas correm penduradas na corda, balançando no prendedor.
 *  5. Títulos de seção: palavras sobem de dentro de uma máscara ao entrar na tela.
 */

const MOTION = '(prefers-reduced-motion: no-preference)';
const RAIL = `${MOTION} and (min-width: 900px)`;

let mm: gsap.MatchMedia | null = null;
let railCleanup: (() => void) | null = null;

function safe(name: string, fn: () => void) {
  try {
    fn();
  } catch (err) {
    console.warn(`[movimento] "${name}" desativado:`, err);
  }
}

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s);
const headerH = () => $('[data-header]')?.offsetHeight ?? 0;

export function initMotion() {
  gsap.registerPlugin(ScrollTrigger);
  mm = gsap.matchMedia();

  mm.add(MOTION, () => {
    safe('letreiro', signScroll);
    safe('paralaxe', photoParallax);
    safe('toldo', valanceWave);
    safe('títulos', revealTitles);
  });

  mm.add(RAIL, () => {
    safe('varal', () => {
      railCleanup = buildRail();
    });
    return () => {
      railCleanup?.();
      railCleanup = null;
    };
  });
}

/* ---------- 1. Letreiro ---------- */

function signScroll() {
  const name = $('[data-hero-name]');
  const lines = gsap.utils.toArray<HTMLElement>('[data-hero-line]');
  if (!name || lines.length < 2) return;
  const chars = gsap.utils.toArray<HTMLElement>('.hero__char', name);

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: '#topo', start: 'top top', end: 'bottom top', scrub: 0.8 },
  });

  tl.fromTo(
    name,
    { '--d': 7, '--soft': 40, fontWeight: 660, letterSpacing: '-0.035em' },
    { '--d': 17, '--soft': 100, fontWeight: 840, letterSpacing: '0.025em', duration: 1 },
    0,
  )
    // As linhas se abrem em direções opostas, como portas de um letreiro
    .fromTo(lines[0]!, { xPercent: 0, yPercent: 0, rotateX: 0 }, { xPercent: -14, yPercent: -14, rotateX: 26, duration: 1 }, 0)
    .fromTo(lines[1]!, { xPercent: 0, yPercent: 0, rotateX: 0 }, { xPercent: 9, yPercent: -4, rotateX: 14, duration: 1 }, 0)
    // Onda que percorre as letras enquanto rola
    .to(chars, { keyframes: { yPercent: [0, -16, 0], rotate: [0, -3, 0] }, duration: 0.5, stagger: { each: 0.035, from: 'start' } }, 0)
    .to(name, { autoAlpha: 0.2, duration: 0.45, ease: 'power1.in' }, 0.55);
}

/* ---------- 2. Paralaxe da foto ---------- */

function photoParallax() {
  const fig = $('[data-storefront]');
  const img = fig?.querySelector('img');
  if (!fig || !img) return;
  gsap.fromTo(
    img,
    { yPercent: -9, scale: 1.06 },
    { yPercent: 9, scale: 1, ease: 'none', scrollTrigger: { trigger: fig, start: 'top bottom', end: 'bottom top', scrub: true } },
  );
}

/* ---------- 3. Toldo ---------- */

function valanceWave() {
  const fig = $('[data-storefront]');
  const gores = gsap.utils.toArray<HTMLElement>('.valance__gore');
  if (!fig || !gores.length) return;

  let last = 0;
  let current: gsap.core.Timeline | null = null;

  const wave = (velocity: number) => {
    const now = performance.now();
    if (Math.abs(velocity) < 120 || now - last < 160) return;
    last = now;
    const strength = gsap.utils.clamp(0.25, 1, Math.abs(velocity) / 2200);
    const dir = velocity > 0 ? 1 : -1; // descendo = vento empurra para trás
    const from = dir > 0 ? 'start' : 'end';
    current?.kill();
    current = gsap
      .timeline()
      .to(gores, {
        rotation: -dir * 9 * strength,
        skewX: dir * 5 * strength,
        scaleY: 1 + 0.07 * strength,
        duration: 0.32,
        ease: 'power2.out',
        stagger: { each: 0.014, from },
      })
      .to(
        gores,
        {
          rotation: 0,
          skewX: 0,
          scaleY: 1,
          duration: 1.5,
          ease: 'elastic.out(1, 0.32)',
          stagger: { each: 0.014, from },
        },
        0.3,
      );
  };

  ScrollTrigger.create({
    trigger: fig,
    start: 'top bottom',
    end: 'bottom top',
    onUpdate: (self) => wave(self.getVelocity()),
  });
}

/* ---------- 4. Varal de promoções ---------- */

function buildRail(): (() => void) | null {
  const section = $('[data-promos]');
  const wrap = $('[data-rail]');
  const track = wrap?.querySelector<HTMLElement>('.rail__track');
  const bar = $('[data-rail-progress]');
  if (!section || !wrap || !track || wrap.hidden) return null;

  wrap.dataset['pinned'] = 'true';
  const distance = () => Math.max(0, track.scrollWidth - document.documentElement.clientWidth);
  if (distance() < 40) {
    wrap.dataset['pinned'] = 'false';
    return null;
  }

  const tween = gsap.to(track, { x: () => -distance(), ease: 'none' });
  if (bar) tween.eventCallback('onUpdate', () => gsap.set(bar, { scaleX: tween.progress() }));

  // Início: quando as etiquetas estão inteiras na tela (pé do varal no rodapé).
  // Se a tela for baixa demais para isso, alinha o topo do varal logo abaixo do cabeçalho.
  const fits = () => wrap.offsetHeight + headerH() + 24 <= window.innerHeight;
  const pin = ScrollTrigger.create({
    trigger: wrap,
    pin: section,
    start: () => (fits() ? 'bottom bottom-=24' : `top top+=${headerH() + 8}`),
    // percurso de rolagem um pouco maior que o deslocamento: movimento mais cadenciado
    end: () => `+=${Math.round(distance() * 1.35)}`,
    scrub: 0.8,
    animation: tween,
    invalidateOnRefresh: true,
    anticipatePin: 1,
  });

  // Etiquetas balançam a partir do prendedor, conforme a velocidade
  const bodies = gsap.utils.toArray<HTMLElement>('.tag__body', track);
  // Um único controle por etiqueta (quickTo) para balançar e para voltar ao lugar:
  // a curva elástica dá o vaivém natural quando a rolagem para.
  const swing = bodies.map((b) => gsap.quickTo(b, 'rotation', { duration: 1.1, ease: 'elastic.out(1, 0.45)' }));
  const sway = ScrollTrigger.create({
    trigger: section,
    start: 'top bottom',
    end: 'bottom top',
    onUpdate(self) {
      const v = gsap.utils.clamp(-6, 6, self.getVelocity() / -300);
      swing.forEach((fn, i) => fn(v * (i % 2 ? 1 : 0.75)));
    },
    onToggle(self) {
      if (!self.isActive) swing.forEach((fn) => fn(0));
    },
  });
  const settle = () => swing.forEach((fn) => fn(0));
  ScrollTrigger.addEventListener('scrollEnd', settle);

  return () => {
    ScrollTrigger.removeEventListener('scrollEnd', settle);
    sway.kill();
    pin.kill(true);
    tween.kill();
    gsap.set(track, { clearProps: 'transform' });
    gsap.set(bodies, { clearProps: 'transform' });
    if (bar) gsap.set(bar, { clearProps: 'transform' });
    wrap.dataset['pinned'] = 'false';
  };
}

/* ---------- 5. Títulos de seção ---------- */

function revealTitles() {
  for (const title of gsap.utils.toArray<HTMLElement>('[data-reveal]')) {
    const words = title.querySelectorAll('.w > span');
    gsap.from(words, {
      yPercent: 115,
      rotate: 5,
      duration: 1.1,
      ease: 'expo.out',
      stagger: 0.07,
      scrollTrigger: { trigger: title, start: 'top 88%', once: true },
    });
  }
}

/** Recalcula o varal depois que o conteúdo ao vivo substitui o de reserva. */
export function refreshMotion() {
  if (!mm) return;
  if (window.matchMedia(RAIL).matches) {
    railCleanup?.();
    safe('varal', () => {
      railCleanup = buildRail();
    });
  }
  ScrollTrigger.refresh();
}
