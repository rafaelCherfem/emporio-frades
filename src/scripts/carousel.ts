/**
 * Vitrine de banners (carrossel).
 * - Troca automática a cada SLIDE_MS, com barra de tempo no indicador ativo.
 * - Pausa com o mouse/foco em cima, com a aba em segundo plano e para quem
 *   prefere menos movimento (aí só troca pelas setas/indicadores/gesto).
 * - Acessível: setas e indicadores com rótulo, teclado (← →), slides inativos
 *   ficam "inert" (fora do foco e do leitor de tela).
 */

const SLIDE_MS = 6500;

export interface Carousel {
  refresh(): void;
}

export function initCarousel(root: HTMLElement): Carousel {
  const track = root.querySelector<HTMLElement>('[data-list="banners"]')!;
  const controls = root.querySelector<HTMLElement>('[data-vitrine-controls]');
  const dotsBox = root.querySelector<HTMLElement>('[data-vitrine-dots]');
  const prev = root.querySelector<HTMLButtonElement>('[data-vitrine-prev]');
  const next = root.querySelector<HTMLButtonElement>('[data-vitrine-next]');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  let slides: HTMLElement[] = [];
  let dots: HTMLButtonElement[] = [];
  let index = 0;
  let timer: number | undefined;
  let hovering = false;

  root.style.setProperty('--slide-time', `${SLIDE_MS}ms`);

  const canPlay = () => slides.length > 1 && !reduce.matches && !hovering && !document.hidden;

  function schedule() {
    window.clearTimeout(timer);
    const playing = canPlay();
    root.dataset['playing'] = String(playing);
    if (playing) timer = window.setTimeout(() => go(index + 1), SLIDE_MS);
  }

  function go(i: number) {
    if (!slides.length) return;
    index = (i + slides.length) % slides.length;
    slides.forEach((s, n) => {
      const active = n === index;
      s.classList.toggle('is-active', active);
      s.setAttribute('aria-hidden', String(!active));
      s.toggleAttribute('inert', !active);
    });
    dots.forEach((d, n) => d.setAttribute('aria-current', String(n === index)));
    // reinicia a barra de tempo do indicador
    root.dataset['playing'] = 'false';
    void root.offsetWidth;
    schedule();
  }

  function build() {
    slides = [...track.querySelectorAll<HTMLElement>('[data-slide]')];
    slides.forEach((s, n) => {
      s.setAttribute('role', 'group');
      s.setAttribute('aria-roledescription', 'slide');
      s.setAttribute('aria-label', `${n + 1} de ${slides.length}`);
    });
    if (dotsBox) {
      dots = slides.map((_, n) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'vitrine__dot';
        b.setAttribute('aria-label', `Mostrar banner ${n + 1}`);
        b.addEventListener('click', () => go(n));
        return b;
      });
      dotsBox.replaceChildren(...dots);
    }
    if (controls) controls.hidden = slides.length < 2;
    root.dataset['ready'] = 'true';
    go(0);
  }

  prev?.addEventListener('click', () => go(index - 1));
  next?.addEventListener('click', () => go(index + 1));

  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(index - 1);
    else if (e.key === 'ArrowRight') go(index + 1);
  });

  const pause = () => {
    hovering = true;
    schedule();
  };
  const resume = () => {
    hovering = false;
    schedule();
  };
  root.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && pause());
  root.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && resume());
  root.addEventListener('focusin', pause);
  root.addEventListener('focusout', (e) => {
    if (!root.contains(e.relatedTarget as Node | null)) resume();
  });
  document.addEventListener('visibilitychange', schedule);
  reduce.addEventListener?.('change', schedule);

  // Gesto de deslizar (celular/touchpad)
  let startX = 0;
  let startY = 0;
  track.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
  });
  track.addEventListener('pointerup', (e) => {
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - startY)) go(index + (dx < 0 ? 1 : -1));
  });

  build();
  return { refresh: build };
}
