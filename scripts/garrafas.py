"""
Gera as imagens de produto (estilo foto de vitrine) usadas quando o item não tem foto:
garrafas realistas em fundo limpo, com sombra suave. Sem marcas reais.

Renderização própria: cada garrafa é um sólido de revolução (perfil -> raio por altura),
com iluminação de estúdio (duas softboxes), vidro escuro ou transparente com líquido,
rótulo aplicado em coordenadas cilíndricas e cápsula/tampa metálica.

Uso: python3 scripts/garrafas.py  ->  public/media/garrafas/*.webp
Requer: numpy, pillow, fonttools, brotli (fontes saem de src/assets/fonts).
"""

from __future__ import annotations

import math
import os
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'media' / 'garrafas'
FONTS_SRC = ROOT / 'src' / 'assets' / 'fonts'

W, H = 560, 1000  # tamanho final (todas as imagens com o mesmo quadro)
SS = 2  # supersampling
BASE_Y = 0.955  # linha do chão (fração da altura)
TOP_MARGIN = 0.03


# ---------------------------------------------------------------- fontes

def _fonts() -> dict[str, str]:
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer

    tmp = Path(tempfile.gettempdir()) / 'frades-fonts'
    tmp.mkdir(exist_ok=True)
    spec = {
        'serif': ('fraunces-latin-full-normal.woff2', {'wght': 650, 'opsz': 72, 'SOFT': 50, 'WONK': 0}),
        'serif-italic': ('fraunces-latin-opsz-italic.woff2', {'wght': 450, 'opsz': 36}),
        'cond': ('archivo-latin-wdth-normal.woff2', {'wght': 700, 'wdth': 72}),
        'sans': ('instrument-sans-latin-wght-normal.woff2', {'wght': 550}),
    }
    out = {}
    for key, (src, axes) in spec.items():
        dst = tmp / f'{key}.ttf'
        if not dst.exists():
            f = TTFont(FONTS_SRC / src)
            tags = {a.axisTag for a in f['fvar'].axes} if 'fvar' in f else set()
            if tags:
                f = instancer.instantiateVariableFont(f, {k: v for k, v in axes.items() if k in tags})
            f.flavor = None
            f.save(dst)
        out[key] = str(dst)
    return out


FONT = _fonts()


def font(key: str, size: float) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT[key], max(6, int(size)))


# ---------------------------------------------------------------- perfil

def pchip(xk: np.ndarray, yk: np.ndarray, x: np.ndarray) -> np.ndarray:
    """Interpolação cúbica monotônica (sem 'barrigas' entre os pontos)."""
    h = np.diff(xk)
    d = np.diff(yk) / h
    m = np.zeros_like(yk)
    for i in range(1, len(xk) - 1):
        if d[i - 1] * d[i] > 0:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    m[0], m[-1] = d[0], d[-1]
    idx = np.clip(np.searchsorted(xk, x) - 1, 0, len(xk) - 2)
    t = (x - xk[idx]) / h[idx]
    h00 = 2 * t**3 - 3 * t**2 + 1
    h10 = t**3 - 2 * t**2 + t
    h01 = -2 * t**3 + 3 * t**2
    h11 = t**3 - t**2
    return h00 * yk[idx] + h10 * h[idx] * m[idx] + h01 * yk[idx + 1] + h11 * h[idx] * m[idx + 1]


# ---------------------------------------------------------------- materiais

@dataclass
class Label:
    y0: float
    y1: float
    span: float  # meia abertura angular (graus)
    draw: callable
    paper: tuple = (240, 233, 216)


@dataclass
class Bottle:
    name: str
    profile: list[tuple[float, float]]  # (altura 0..1, raio) em unidades da altura
    height: float  # altura relativa no quadro (1 = garrafa de vinho)
    glass: tuple  # cor do vidro
    clear: bool = False  # vidro transparente (mostra o líquido)
    liquid: tuple | None = None
    level: float = 0.0  # nível do líquido (0..1)
    closure_from: float = 1.1  # a partir desta altura: cápsula/tampa
    closure: tuple = (30, 30, 30)
    closure_metal: float = 0.6
    closure_crinkle: bool = False
    labels: list[Label] = field(default_factory=list)


def env_light(rx, ry, rz):
    """Estúdio: duas softboxes verticais + luz de topo fraca."""
    az = np.degrees(np.arctan2(rx, rz))
    el = np.degrees(np.arcsin(np.clip(ry, -1, 1)))
    vert = 1 / (1 + np.exp((np.abs(el) - 38) / 4))
    left = np.exp(-(((az + 38) / 6) ** 2)) * 1.25
    right = np.exp(-(((az - 52) / 11) ** 2)) * 0.55
    rim_l = np.exp(-(((az + 84) / 5) ** 2)) * 0.35
    rim_r = np.exp(-(((az - 86) / 5) ** 2)) * 0.45
    top = np.clip((el - 55) / 25, 0, 1) * 0.25
    return (left + right + rim_l + rim_r) * vert + top


def render_bottle(b: Bottle, scale: float = 1.0) -> Image.Image:
    """Renderiza só a garrafa (RGBA, fundo transparente), já reduzida."""
    hp = int(H * SS * (BASE_Y - TOP_MARGIN) * b.height * scale)
    rmax = max(r for _, r in b.profile)
    wp = int(2 * rmax * hp) + 8
    ys = np.linspace(1, 0, hp)  # linha 0 = topo
    yk = np.array([p[0] for p in b.profile])
    rk = np.array([p[1] for p in b.profile])
    r = pchip(yk, rk, ys)  # raio por linha (unidades da altura)
    dr = np.gradient(r, ys)  # dr/dy

    xs = (np.arange(wp) - (wp - 1) / 2) / hp  # x em unidades da altura
    X, _ = np.meshgrid(xs, ys)
    R = r[:, None]
    DR = dr[:, None]
    Yy = ys[:, None] * np.ones_like(X)
    inside = np.abs(X) < R
    nx = np.clip(X / np.maximum(R, 1e-6), -1, 1)
    nz = np.sqrt(np.clip(1 - nx**2, 0, 1))
    # normal de um sólido de revolução
    N = np.stack([nx, -DR * np.ones_like(nx), nz], -1)
    N /= np.linalg.norm(N, axis=-1, keepdims=True)
    ndv = np.clip(N[..., 2], 0, 1)
    Rv = 2 * ndv[..., None] * N - np.array([0, 0, 1.0])
    spec = env_light(Rv[..., 0], Rv[..., 1], Rv[..., 2])
    fres = 0.04 + 0.96 * (1 - ndv) ** 5
    L = np.array([-0.45, 0.35, 0.82])
    L /= np.linalg.norm(L)
    diff = np.clip((N * L).sum(-1), 0, 1)

    g = np.array(b.glass, float) / 255
    col = np.zeros(X.shape + (3,))
    alpha = inside.astype(float)

    if b.clear:
        liq = np.array(b.liquid or b.glass, float) / 255
        thick = 0.35 + 0.65 * ndv  # caminho da luz no vidro/líquido
        absorb = -np.log(np.clip(liq, 0.02, 1)) * 1.25
        body = np.exp(-absorb[None, None, :] * thick[..., None])
        # vidro vazio: quase transparente, escurece nas bordas
        empty = 1 - (1 - g)[None, None, :] * (0.25 + 0.75 * (1 - ndv[..., None]) ** 1.5)
        filled = (Yy < b.level)[..., None]
        base = np.where(filled, body, empty)
        edge = 1 - 0.55 * np.clip((np.abs(nx) - 0.72) / 0.26, 0, 1)[..., None] ** 1.6
        col = base * edge * (0.82 + 0.18 * diff[..., None])
        # menisco: linha clara no nível do líquido
        men = np.exp(-(((Yy - b.level) * hp / 2.2) ** 2))[..., None]
        col = col * (1 - 0.35 * men) + 0.35 * men * np.array([1, 1, 1])
        alpha = alpha * np.where(filled[..., 0], 1.0, 0.22 + 0.7 * (1 - ndv) ** 1.1)
        alpha = np.maximum(alpha, inside * np.clip(spec * 0.9, 0, 1))
    else:
        col = g[None, None, :] * (0.28 + 0.72 * diff[..., None] ** 1.2)
        # brilho interno do vidro (luz que atravessa perto da borda)
        glow = np.clip((np.abs(nx) - 0.55) / 0.4, 0, 1) ** 2 * (1 - np.clip((np.abs(nx) - 0.93) / 0.07, 0, 1))
        col = col + g[None, None, :] * glow[..., None] * 0.9
        spec = spec * 1.5  # vidro escuro: reflexos mais marcados

    # rótulos (coordenadas cilíndricas)
    phi = np.degrees(np.arcsin(nx))
    for lb in b.labels:
        rmid = float(pchip(yk, rk, np.array([(lb.y0 + lb.y1) / 2]))[0])
        arc = 2 * rmid * math.radians(lb.span)
        th = lb.y1 - lb.y0
        tw_px = 1400
        th_px = int(tw_px * th / arc)
        tex = Image.new('RGBA', (tw_px, th_px), (0, 0, 0, 0))
        lb.draw(tex)
        T = np.asarray(tex, float) / 255
        u = (phi / lb.span + 1) / 2
        v = (lb.y1 - Yy) / th
        on = inside & (u >= 0) & (u <= 1) & (v >= 0) & (v <= 1)
        ui = np.clip((u * (tw_px - 1)).astype(int), 0, tw_px - 1)
        vi = np.clip((v * (th_px - 1)).astype(int), 0, th_px - 1)
        samp = T[vi, ui]
        a = samp[..., 3] * on
        shade = 0.42 + 0.68 * diff[..., None] ** 0.9
        lc = samp[..., :3] * shade + 0.10 * np.clip(spec, 0, 1)[..., None]
        col = col * (1 - a[..., None]) + lc * a[..., None]
        alpha = np.maximum(alpha, a)
        spec = spec * (1 - 0.8 * a)

    # cápsula / tampa
    cl = inside & (Yy >= b.closure_from)
    if cl.any():
        cc = np.array(b.closure, float) / 255
        met = b.closure_metal
        crinkle = 1.0
        if b.closure_crinkle:
            rng = np.random.default_rng(7)
            noise = rng.normal(0, 1, (hp // 6 + 2, wp // 10 + 2))
            noise = np.asarray(Image.fromarray(((noise + 3) * 40).clip(0, 255).astype(np.uint8)).resize((wp, hp), Image.BICUBIC), float) / 255
            crinkle = 0.82 + 0.36 * noise
        c_col = cc * (0.3 + 0.7 * diff[..., None]) * (1 - met * 0.5)
        c_col = c_col * (crinkle[..., None] if isinstance(crinkle, np.ndarray) else crinkle)
        c_col = c_col + met * cc * np.clip(spec * 1.4, 0, 1.6)[..., None] + 0.12 * np.clip(spec, 0, 1)[..., None]
        col = np.where(cl[..., None], c_col, col)
        alpha = np.where(cl, 1.0, alpha)
        spec = np.where(cl, 0, spec)

    # reflexos especulares do vidro
    s = np.clip(spec * (0.55 + 1.6 * fres), 0, 1.4)
    col = col + s[..., None] * (1 - col) * 0.95
    col = np.clip(col, 0, 1)

    # suaviza a borda (antisserrilhado)
    edge_soft = np.clip((R - np.abs(X)) * hp / 1.2, 0, 1)
    alpha = alpha * edge_soft
    rgba = np.dstack([col, alpha])
    return _downsample(rgba)


def _downsample(rgba: np.ndarray) -> Image.Image:
    a = rgba[..., 3:4]
    pre = rgba[..., :3] * a
    h, w = rgba.shape[:2]
    nw, nh = max(1, w // SS), max(1, h // SS)
    chans = []
    for c in range(3):
        chans.append(np.asarray(Image.fromarray(pre[..., c].astype(np.float32), 'F').resize((nw, nh), Image.LANCZOS)))
    al = np.asarray(Image.fromarray(a[..., 0].astype(np.float32), 'F').resize((nw, nh), Image.LANCZOS))
    al = np.clip(al, 0, 1)
    rgb = np.stack(chans, -1) / np.maximum(al[..., None], 1e-4)
    out = np.dstack([np.clip(rgb, 0, 1), al])
    return Image.fromarray((out * 255).round().astype(np.uint8), 'RGBA')


def shadow(width_px: float, canvas: Image.Image, cx: float, y: float, strength: float = 0.45):
    """Sombra de contato + sombra difusa no chão."""
    w, h = canvas.size
    sh = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(sh)
    for k, (fw, fh, a, blur) in enumerate([(1.5, 0.11, 0.55, 18), (1.05, 0.05, 0.9, 5)]):
        layer = Image.new('L', (w, h), 0)
        ld = ImageDraw.Draw(layer)
        rw, rh = width_px * fw / 2, width_px * fh
        ld.ellipse([cx - rw, y - rh / 2, cx + rw, y + rh / 2], fill=int(255 * a * strength))
        layer = layer.filter(ImageFilter.GaussianBlur(blur))
        sh = Image.fromarray(np.maximum(np.asarray(sh), np.asarray(layer)))
    dark = Image.new('RGBA', (w, h), (28, 30, 24, 0))
    dark.putalpha(sh)
    return Image.alpha_composite(canvas, dark)


def place(canvas: Image.Image, img: Image.Image, cx: float, base_y: float, shadow_w: float | None = None):
    if shadow_w:
        canvas = shadow(shadow_w, canvas, cx, base_y - 2)
    x = int(round(cx - img.width / 2))
    y = int(round(base_y - img.height))
    layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    layer.paste(img, (x, y), img)
    return Image.alpha_composite(canvas, layer)


def single(b: Bottle) -> Image.Image:
    img = render_bottle(b)
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    base_w = 2 * b.profile[0][1] * img.height / 1.0
    return place(canvas, img, W / 2, H * BASE_Y, shadow_w=max(base_w, img.width * 0.8))


# ---------------------------------------------------------------- rótulos

INK = (36, 30, 24)
GOLD = (176, 138, 74)
WINE = (122, 28, 44)


def text_c(d: ImageDraw.ImageDraw, w: int, y: float, txt: str, f, fill, spacing: float = 0):
    if spacing:
        widths = [d.textlength(ch, font=f) for ch in txt]
        total = sum(widths) + spacing * (len(txt) - 1)
        x = (w - total) / 2
        for ch, cw in zip(txt, widths):
            d.text((x, y), ch, font=f, fill=fill)
            x += cw + spacing
    else:
        tw = d.textlength(txt, font=f)
        d.text(((w - tw) / 2, y), txt, font=f, fill=fill)


def paper(img: Image.Image, color, radius=0, seed=1, grain=10):
    w, h = img.size
    rng = np.random.default_rng(seed)
    base = np.ones((h, w, 3)) * np.array(color, float)
    base += rng.normal(0, grain, (h, w, 1))
    fib = Image.fromarray(rng.normal(128, 40, (h // 8 + 1, w // 2 + 1)).clip(0, 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    base += (np.asarray(fib, float)[..., None] - 128) * 0.06
    p = Image.fromarray(base.clip(0, 255).astype(np.uint8), 'RGB').convert('RGBA')
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    img.paste(p, (0, 0), mask)


def crest(d, cx, cy, s, color):
    d.ellipse([cx - s, cy - s, cx + s, cy + s], outline=color, width=max(2, int(s * 0.08)))
    # ramo de videira estilizado
    d.line([cx, cy + s * 0.6, cx, cy - s * 0.55], fill=color, width=max(2, int(s * 0.07)))
    for k in range(4):
        yy = cy - s * 0.35 + k * s * 0.24
        rr = s * (0.16 - k * 0.012)
        for sgn in (-1, 1):
            d.ellipse([cx + sgn * s * 0.2 - rr, yy - rr, cx + sgn * s * 0.2 + rr, yy + rr], fill=color)


def label_tinto(img):
    w, h = img.size
    paper(img, (238, 229, 208), radius=6, seed=2)
    d = ImageDraw.Draw(img)
    m = w * 0.05
    d.rectangle([m, m * 0.8, w - m, h - m * 0.8], outline=GOLD, width=5)
    d.rectangle([m + 12, m * 0.8 + 12, w - m - 12, h - m * 0.8 - 12], outline=GOLD, width=2)
    crest(d, w / 2, h * 0.2, h * 0.09, WINE)
    text_c(d, w, h * 0.33, 'RESERVA', font('cond', h * 0.075), INK, spacing=h * 0.03)
    text_c(d, w, h * 0.44, 'Tinto', font('serif', h * 0.22), WINE)
    text_c(d, w, h * 0.72, 'vinho fino seco', font('serif-italic', h * 0.075), INK)
    text_c(d, w, h * 0.84, '2021', font('cond', h * 0.06), GOLD, spacing=h * 0.02)


def label_capsula_tinto(img):
    pass


def label_branco(img):
    w, h = img.size
    paper(img, (247, 245, 238), radius=4, seed=3, grain=6)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w, h * 0.06], fill=(196, 168, 92))
    d.rectangle([0, h * 0.94, w, h], fill=(196, 168, 92))
    text_c(d, w, h * 0.16, 'CHARDONNAY', font('cond', h * 0.07), (120, 110, 70), spacing=h * 0.028)
    text_c(d, w, h * 0.3, 'Branco', font('serif', h * 0.2), INK)
    d.line([w * 0.38, h * 0.62, w * 0.62, h * 0.62], fill=(196, 168, 92), width=4)
    text_c(d, w, h * 0.68, 'safra 2023', font('serif-italic', h * 0.075), INK)


def label_rose(img):
    w, h = img.size
    paper(img, (250, 244, 240), radius=8, seed=4, grain=5)
    d = ImageDraw.Draw(img)
    rose = (196, 96, 104)
    text_c(d, w, h * 0.14, 'VINHO ROSÉ', font('cond', h * 0.065), rose, spacing=h * 0.025)
    text_c(d, w, h * 0.28, 'Rosé', font('serif', h * 0.24), (92, 40, 48))
    d.ellipse([w / 2 - 9, h * 0.66, w / 2 + 9, h * 0.66 + 18], fill=rose)
    text_c(d, w, h * 0.74, 'seco e frutado', font('serif-italic', h * 0.075), (92, 40, 48))


def label_espumante(img):
    w, h = img.size
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).ellipse([w * 0.06, 0, w * 0.94, h - 1], fill=255)
    tmp = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    paper(tmp, (242, 234, 214), seed=5)
    img.paste(tmp, (0, 0), mask)
    d = ImageDraw.Draw(img)
    d.ellipse([w * 0.06 + 10, 10, w * 0.94 - 10, h - 11], outline=GOLD, width=6)
    d.ellipse([w * 0.06 + 26, 26, w * 0.94 - 26, h - 27], outline=GOLD, width=2)
    text_c(d, w, h * 0.2, 'MÉTODO TRADICIONAL', font('cond', h * 0.045), INK, spacing=h * 0.012)
    text_c(d, w, h * 0.3, 'Brut', font('serif', h * 0.27), (28, 48, 34))
    text_c(d, w, h * 0.66, 'espumante', font('serif-italic', h * 0.085), INK)


def label_espumante_colar(img):
    w, h = img.size
    img.paste((20, 32, 24, 255), [0, 0, w, h])
    d = ImageDraw.Draw(img)
    d.rectangle([0, 6, w, 12], fill=GOLD)
    d.rectangle([0, h - 12, w, h - 6], fill=GOLD)
    text_c(d, w, h * 0.3, 'BRUT', font('cond', h * 0.36), GOLD, spacing=h * 0.12)


def label_tinto_colar(img):
    w, h = img.size
    paper(img, (238, 229, 208), seed=9)
    d = ImageDraw.Draw(img)
    d.rectangle([0, h * 0.15, w, h * 0.2], fill=GOLD)
    d.rectangle([0, h * 0.8, w, h * 0.85], fill=GOLD)
    text_c(d, w, h * 0.33, '2021', font('cond', h * 0.32), WINE, spacing=h * 0.08)


def label_cerveja(img):
    w, h = img.size
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=int(h * 0.18), fill=255)
    tmp = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    paper(tmp, (214, 186, 140), seed=6, grain=12)
    img.paste(tmp, (0, 0), mask)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([14, 14, w - 15, h - 15], radius=int(h * 0.15), outline=(110, 40, 24), width=5)
    text_c(d, w, h * 0.13, 'CERVEJA ESPECIAL', font('cond', h * 0.06), (110, 40, 24), spacing=h * 0.008)
    text_c(d, w, h * 0.3, 'Weiss', font('serif', h * 0.24), (48, 30, 18))
    # espigas
    cy = h * 0.74
    for sgn in (-1, 1):
        for k in range(5):
            x = w / 2 + sgn * (w * 0.08 + k * w * 0.035)
            d.ellipse([x - 7, cy - 12 + k * 2, x + 7, cy + 12 + k * 2], fill=(150, 98, 40))
    text_c(d, w, h * 0.84, '500 ml', font('cond', h * 0.06), (110, 40, 24), spacing=h * 0.01)


def label_whisky(img):
    w, h = img.size
    img.paste((22, 20, 18, 255), [0, 0, w, h])
    d = ImageDraw.Draw(img)
    d.rectangle([12, 12, w - 13, h - 13], outline=(196, 160, 90), width=4)
    text_c(d, w, h * 0.1, 'BLENDED SCOTCH', font('cond', h * 0.065), (196, 160, 90), spacing=h * 0.02)
    text_c(d, w, h * 0.22, 'Whisky', font('serif', h * 0.2), (236, 220, 186))
    text_c(d, w, h * 0.5, '12', font('serif', h * 0.28), (196, 160, 90))
    text_c(d, w, h * 0.82, 'ANOS', font('cond', h * 0.07), (236, 220, 186), spacing=h * 0.05)


def label_gin(img):
    w, h = img.size
    paper(img, (246, 244, 236), radius=10, seed=8, grain=5)
    d = ImageDraw.Draw(img)
    teal = (24, 84, 92)
    d.rectangle([0, h * 0.08, w, h * 0.12], fill=teal)
    text_c(d, w, h * 0.2, 'LONDON DRY', font('cond', h * 0.07), teal, spacing=h * 0.03)
    text_c(d, w, h * 0.32, 'Gin', font('serif', h * 0.3), INK)
    # zimbro
    for k, (dx, dy) in enumerate([(-30, 0), (0, -14), (30, 0), (-14, 24), (16, 24)]):
        x, y = w / 2 + dx * 1.6, h * 0.76 + dy * 1.2
        d.ellipse([x - 16, y - 16, x + 16, y + 16], fill=(52, 70, 110))
    text_c(d, w, h * 0.88, 'destilado com zimbro', font('serif-italic', h * 0.05), INK)


# ---------------------------------------------------------------- garrafas

def bordeaux(r=0.118):
    return [(0, r * 0.9), (0.012, r), (0.6, r), (0.66, r * 0.92), (0.71, r * 0.55), (0.75, 0.041), (0.965, 0.038), (0.972, 0.045), (1.0, 0.044)]


BOTTLES: dict[str, Bottle] = {
    'tinto': Bottle(
        'tinto', bordeaux(), 1.0, (34, 12, 16), closure_from=0.865, closure=(120, 20, 38), closure_metal=0.7, closure_crinkle=True,
        labels=[Label(0.2, 0.5, 66, label_tinto), Label(0.62, 0.66, 58, label_tinto_colar)],
    ),
    'branco': Bottle(
        'branco',
        [(0, 0.115), (0.012, 0.124), (0.42, 0.124), (0.55, 0.11), (0.68, 0.07), (0.76, 0.043), (0.965, 0.038), (0.972, 0.045), (1.0, 0.044)],
        1.0, (196, 204, 150), clear=True, liquid=(236, 222, 150), level=0.7,
        closure_from=0.87, closure=(196, 168, 92), closure_metal=0.8, closure_crinkle=True,
        labels=[Label(0.18, 0.42, 62, label_branco)],
    ),
    'rose': Bottle(
        'rose',
        [(0, 0.118), (0.012, 0.126), (0.2, 0.124), (0.4, 0.112), (0.52, 0.106), (0.62, 0.095), (0.7, 0.068), (0.77, 0.042), (0.965, 0.038), (0.972, 0.045), (1.0, 0.044)],
        0.98, (240, 214, 208), clear=True, liquid=(244, 158, 150), level=0.72,
        closure_from=0.885, closure=(236, 226, 214), closure_metal=0.25,
        labels=[Label(0.14, 0.36, 58, label_rose)],
    ),
    'espumante': Bottle(
        'espumante',
        [(0, 0.12), (0.014, 0.132), (0.5, 0.132), (0.58, 0.122), (0.68, 0.085), (0.77, 0.05), (0.93, 0.047), (0.955, 0.056), (0.985, 0.054), (1.0, 0.05)],
        1.0, (22, 46, 28), closure_from=0.7, closure=(212, 172, 92), closure_metal=0.9, closure_crinkle=True,
        labels=[Label(0.2, 0.47, 64, label_espumante), Label(0.635, 0.69, 64, label_espumante_colar)],
    ),
    'cerveja': Bottle(
        'cerveja',
        [(0, 0.098), (0.012, 0.106), (0.5, 0.106), (0.58, 0.096), (0.68, 0.055), (0.76, 0.04), (0.95, 0.038), (0.96, 0.047), (1.0, 0.047)],
        0.8, (84, 40, 14), closure_from=0.955, closure=(204, 166, 84), closure_metal=0.85,
        labels=[Label(0.14, 0.44, 70, label_cerveja)],
    ),
    'whisky': Bottle(
        'whisky',
        [(0, 0.17), (0.02, 0.188), (0.5, 0.188), (0.6, 0.175), (0.67, 0.13), (0.72, 0.075), (0.76, 0.06), (0.84, 0.058), (0.845, 0.075), (1.0, 0.075)],
        0.78, (214, 196, 170), clear=True, liquid=(196, 112, 34), level=0.66,
        closure_from=0.845, closure=(38, 30, 26), closure_metal=0.3,
        labels=[Label(0.16, 0.5, 60, label_whisky)],
    ),
    'gin': Bottle(
        'gin',
        [(0, 0.128), (0.015, 0.14), (0.74, 0.14), (0.79, 0.122), (0.83, 0.07), (0.85, 0.058), (0.86, 0.068), (1.0, 0.068)],
        0.9, (176, 206, 214), clear=True, liquid=(222, 238, 240), level=0.76,
        closure_from=0.86, closure=(176, 112, 70), closure_metal=0.85,
        labels=[Label(0.2, 0.6, 58, label_gin)],
    ),
}


def taca() -> Image.Image:
    """Taça de cristal com vinho tinto."""
    b = Bottle(
        'taca',
        [(0, 0.15), (0.012, 0.15), (0.02, 0.03), (0.04, 0.012), (0.42, 0.012), (0.46, 0.03), (0.52, 0.11), (0.6, 0.15), (0.72, 0.162), (0.84, 0.15), (0.94, 0.13), (1.0, 0.122)],
        0.72, (210, 214, 210), clear=True, liquid=(150, 22, 44), level=0.67,
    )
    # o vinho só existe dentro do bojo
    img = render_bottle(b)
    arr = np.asarray(img, float) / 255
    hp = img.height
    rows = np.linspace(1, 0, hp)
    stem = rows < 0.47
    a = arr[..., 3]
    # haste/pé: cristal claro (sem vinho)
    lum = arr[..., :3].mean(-1, keepdims=True)
    clear_glass = np.clip(0.65 + 0.5 * lum, 0, 1) * np.array([0.93, 0.95, 0.94])
    arr[..., :3] = np.where(stem[:, None, None], clear_glass, arr[..., :3])
    arr[..., 3] = np.where(stem[:, None], np.clip(a * 0.85, 0, 1), a)
    img = Image.fromarray((arr * 255).astype(np.uint8), 'RGBA')
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    return place(canvas, img, W / 2, H * BASE_Y, shadow_w=img.width * 0.95)


def presente() -> Image.Image:
    """Caixa de madeira com duas garrafas (kit presente)."""
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    base = H * BASE_Y
    bw, bh = W * 0.82, H * 0.36
    x0, y0 = (W - bw) / 2, base - bh
    # garrafas atrás (parte de cima aparece acima da caixa)
    for name, dx in (('espumante', -0.2), ('tinto', 0.2)):
        g = render_bottle(BOTTLES[name], scale=0.86)
        canvas = place(canvas, g, W / 2 + dx * bw, base - bh * 0.12)
    canvas = shadow(bw * 0.95, canvas, W / 2, base - 2, strength=0.55)
    # caixa
    rng = np.random.default_rng(11)
    bwp, bhp = int(bw), int(bh)
    yy, xx = np.mgrid[0:bhp, 0:bwp]
    grain = np.sin(yy / 5.5 + 3 * np.sin(xx / 90) + rng.normal(0, 0.15, (bhp, bwp))) * 0.5 + 0.5
    streak = np.asarray(Image.fromarray(rng.normal(128, 50, (bhp // 4 + 1, 6)).clip(0, 255).astype(np.uint8)).resize((bwp, bhp), Image.BICUBIC), float) / 255
    wood = np.array([176, 124, 78], float)[None, None, :] * (0.8 + 0.16 * grain[..., None] + 0.14 * (streak[..., None] - 0.5))
    shade = 0.78 + 0.3 * (1 - np.abs(xx / bwp - 0.42) * 1.4)[..., None]
    top_light = np.clip(1.15 - yy / bhp * 0.35, 0, 1.2)[..., None]
    wood = np.clip(wood * shade * top_light, 0, 255)
    box = Image.fromarray(wood.astype(np.uint8), 'RGB').convert('RGBA')
    d = ImageDraw.Draw(box)
    d.rectangle([0, 0, bwp - 1, 10], fill=(214, 168, 116))  # borda de cima iluminada
    d.rectangle([0, 0, 6, bhp], fill=(140, 96, 58))
    d.rectangle([bwp - 7, 0, bwp, bhp], fill=(126, 84, 50))
    # carimbo
    stamp = (92, 52, 28)
    cx, cy = bwp / 2, bhp * 0.52
    d.ellipse([cx - bhp * 0.3, cy - bhp * 0.3, cx + bhp * 0.3, cy + bhp * 0.3], outline=stamp, width=4)
    text_c(d, bwp, cy - bhp * 0.19, 'KIT', font('cond', bhp * 0.09), stamp, spacing=8)
    text_c(d, bwp, cy - bhp * 0.08, 'Presente', font('serif', bhp * 0.12), stamp)
    text_c(d, bwp, cy + bhp * 0.1, 'sob encomenda', font('serif-italic', bhp * 0.055), stamp)
    # fita de sisal
    d.rectangle([0, bhp * 0.18, bwp, bhp * 0.18 + 14], fill=(196, 164, 104))
    canvas.alpha_composite(box, (int(x0), int(y0)))
    return canvas


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = {k: (lambda b=b: single(b)) for k, b in BOTTLES.items()}
    jobs['taca'] = taca
    jobs['presente'] = presente
    for name, job in jobs.items():
        img = job()
        img.save(OUT / f'{name}.webp', 'WEBP', quality=86, method=6)
        print(name, os.path.getsize(OUT / f'{name}.webp') // 1024, 'KB')


if __name__ == '__main__':
    main()
