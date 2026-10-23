"""Gera as ilustrações de garrafas (SVG) usadas nos banners padrão e como imagem
reserva dos produtos sem foto. Estilo "packshot": vidro em gradiente, reflexos,
líquido aparente nas garrafas claras e rótulos sem marca (nada de logos reais).
Uso: python3 scripts/ilustracoes.py  -> public/media/ilustracoes/*.svg
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'public' / 'media' / 'ilustracoes'
OUT.mkdir(parents=True, exist_ok=True)
W, H, CX = 160, 400, 80


def bottle_path(top, neck_bot, shoulder, base, w, n, curve=26):
    return (f"M{CX-n},{top} L{CX-n},{neck_bot} "
            f"C{CX-n},{neck_bot+curve} {CX-w},{shoulder-curve} {CX-w},{shoulder} "
            f"L{CX-w},{base-9} Q{CX-w},{base} {CX-w+9},{base} L{CX+w-9},{base} "
            f"Q{CX+w},{base} {CX+w},{base-9} L{CX+w},{shoulder} "
            f"C{CX+w},{shoulder-curve} {CX+n},{neck_bot+curve} {CX+n},{neck_bot} L{CX+n},{top} Z")


def svg(body, defs=''):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
            f'<defs>{defs}</defs>{body}</svg>\n')


def glass_grad(gid, dark, mid, light):
    return (f'<linearGradient id="{gid}" x1="0" x2="1">'
            f'<stop offset="0" stop-color="{dark}"/><stop offset=".22" stop-color="{mid}"/>'
            f'<stop offset=".42" stop-color="{light}"/><stop offset=".62" stop-color="{mid}"/>'
            f'<stop offset="1" stop-color="{dark}"/></linearGradient>')


SHADOW = f'<ellipse cx="{CX}" cy="388" rx="52" ry="7" fill="#000" opacity=".28"/>'


def highlights(top, base, w):
    return (f'<rect x="{CX-w+7}" y="{top}" width="5" height="{base-top-18}" rx="2.5" fill="#fff" opacity=".32"/>'
            f'<rect x="{CX-w+15}" y="{top+10}" width="2" height="{base-top-40}" rx="1" fill="#fff" opacity=".18"/>'
            f'<rect x="{CX+w-11}" y="{top+6}" width="3" height="{base-top-30}" rx="1.5" fill="#fff" opacity=".12"/>')


def label(x0, y0, x1, y1, paper, ink, accent, style='crest'):
    w = x1 - x0
    out = (f'<rect x="{x0}" y="{y0}" width="{w}" height="{y1-y0}" rx="3" fill="{paper}"/>'
           f'<rect x="{x0}" y="{y0}" width="{w}" height="{y1-y0}" rx="3" fill="url(#lblshade)"/>'
           f'<rect x="{x0+4}" y="{y0+4}" width="{w-8}" height="{y1-y0-8}" rx="2" fill="none" stroke="{accent}" stroke-width="1"/>')
    cx = (x0 + x1) / 2
    if style == 'crest':
        out += (f'<circle cx="{cx}" cy="{y0+22}" r="9" fill="none" stroke="{accent}" stroke-width="1.6"/>'
                f'<path d="M{cx-4},{y0+24} l4,-7 l4,7 z" fill="{accent}"/>')
        yy = y0 + 42
    else:
        out += f'<rect x="{x0+6}" y="{y0+12}" width="{w-12}" height="10" fill="{accent}"/>'
        yy = y0 + 34
    out += (f'<rect x="{cx-w*0.32}" y="{yy}" width="{w*0.64}" height="5" rx="2" fill="{ink}"/>'
            f'<rect x="{cx-w*0.24}" y="{yy+10}" width="{w*0.48}" height="3" rx="1.5" fill="{ink}" opacity=".55"/>'
            f'<rect x="{cx-w*0.18}" y="{yy+18}" width="{w*0.36}" height="3" rx="1.5" fill="{ink}" opacity=".4"/>')
    return out


LBL_SHADE = ('<linearGradient id="lblshade" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".18"/>'
             '<stop offset=".25" stop-color="#000" stop-opacity="0"/><stop offset=".75" stop-color="#000" stop-opacity="0"/>'
             '<stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>')


def wine(name, glass, liquid=None, capsule=('#7a1526', '#4d0c17'), paper='#f1e9d8', ink='#3a1a1a', accent='#8c2233'):
    top, nb, sh, base, w, n = 34, 150, 205, 382, 37, 12
    d = bottle_path(top, nb, sh, base, w, n)
    defs = glass_grad('g', *glass) + LBL_SHADE + f'<clipPath id="c"><path d="{d}"/></clipPath>'
    defs += f'<linearGradient id="cap" x1="0" x2="1"><stop offset="0" stop-color="{capsule[1]}"/><stop offset=".4" stop-color="{capsule[0]}"/><stop offset="1" stop-color="{capsule[1]}"/></linearGradient>'
    body = SHADOW + f'<path d="{d}" fill="url(#g)"/>'
    if liquid:
        body += f'<g clip-path="url(#c)"><rect x="0" y="175" width="{W}" height="{H}" fill="{liquid}" opacity=".85"/><rect x="0" y="175" width="{W}" height="3" fill="#fff" opacity=".35"/></g>'
    body += f'<rect x="{CX-n-1.5}" y="{top-4}" width="{2*n+3}" height="84" rx="3" fill="url(#cap)"/>'
    body += f'<rect x="{CX-n-1.5}" y="{top+70}" width="{2*n+3}" height="3" fill="#000" opacity=".25"/>'
    body += label(CX - w + 3, 250, CX + w - 3, 340, paper, ink, accent)
    body += highlights(sh - 20, base, w)
    (OUT / f'{name}.svg').write_text(svg(body, defs))


def sparkling():
    top, nb, sh, base, w, n = 28, 120, 215, 382, 39, 13
    d = bottle_path(top, nb, sh, base, w, n, curve=44)
    defs = glass_grad('g', '#06140c', '#123422', '#2e5a40') + LBL_SHADE
    defs += '<linearGradient id="foil" x1="0" x2="1"><stop offset="0" stop-color="#8a6a22"/><stop offset=".35" stop-color="#f3d27a"/><stop offset=".55" stop-color="#c9a24a"/><stop offset="1" stop-color="#7a5c1c"/></linearGradient>'
    body = SHADOW + f'<path d="{d}" fill="url(#g)"/>'
    # alumínio dourado cobrindo gargalo até o ombro
    foil = (f"M{CX-n-2},{top-6} L{CX-n-2},{nb} C{CX-n-2},{nb+18} {CX-27},{165} {CX-29},{178} "
            f"L{CX+29},{178} C{CX+27},{165} {CX+n+2},{nb+18} {CX+n+2},{nb} L{CX+n+2},{top-6} Z")
    body += f'<path d="{foil}" fill="url(#foil)"/>'
    for y in range(top, nb, 9):
        body += f'<rect x="{CX-n-2}" y="{y}" width="{2*n+4}" height="1.4" fill="#000" opacity=".18"/>'
    body += f'<path d="M{CX-29},{178} L{CX+29},{178}" stroke="#5a4310" stroke-width="2"/>'
    body += f'<ellipse cx="{CX}" cy="288" rx="{w-6}" ry="44" fill="#f4ecd6"/><ellipse cx="{CX}" cy="288" rx="{w-11}" ry="38" fill="none" stroke="#b08a3a" stroke-width="1.2"/>'
    body += f'<rect x="{CX-18}" y="282" width="36" height="5" rx="2" fill="#2a2414"/><rect x="{CX-12}" y="292" width="24" height="3" rx="1.5" fill="#2a2414" opacity=".5"/>'
    body += f'<path d="M{CX-8},270 l8,-10 l8,10 z" fill="#b08a3a"/>'
    body += highlights(185, base, w)
    (OUT / 'espumante.svg').write_text(svg(body, defs))


def beer():
    top, nb, sh, base, w, n = 92, 190, 238, 382, 31, 11
    d = bottle_path(top, nb, sh, base, w, n, curve=22)
    defs = glass_grad('g', '#2a1102', '#6b3510', '#9a5a22') + LBL_SHADE
    body = SHADOW + f'<path d="{d}" fill="url(#g)"/>'
    body += f'<rect x="{CX-n-3}" y="{top-8}" width="{2*n+6}" height="12" rx="2" fill="#b8902e"/>'
    for i in range(7):
        body += f'<rect x="{CX-n-3+i*(2*n+6)/7+1}" y="{top-8}" width="1.5" height="12" fill="#6e5414"/>'
    body += label(CX - w + 2, 265, CX + w - 2, 345, '#d9b77a', '#3a2410', '#7a1d12', style='band')
    body += f'<rect x="{CX-n}" y="200" width="{2*n}" height="18" rx="2" fill="#d9b77a"/>'
    body += highlights(sh - 10, base, w)
    (OUT / 'cerveja.svg').write_text(svg(body, defs))


def whisky():
    top, nb, sh, base, w, n = 92, 150, 176, 382, 46, 15
    d = bottle_path(top, nb, sh, base, w, n, curve=12)
    defs = glass_grad('g', '#5b6b66', '#c9d3cf', '#ffffff') + LBL_SHADE
    defs += f'<clipPath id="c"><path d="{d}"/></clipPath>'
    defs += '<linearGradient id="liq" x1="0" x2="1"><stop offset="0" stop-color="#7a3a0a"/><stop offset=".45" stop-color="#d07a24"/><stop offset="1" stop-color="#7a3a0a"/></linearGradient>'
    body = SHADOW + f'<path d="{d}" fill="url(#g)" opacity=".55"/>'
    body += f'<g clip-path="url(#c)"><rect x="0" y="182" width="{W}" height="{H}" fill="url(#liq)"/><rect x="0" y="182" width="{W}" height="3" fill="#fff" opacity=".4"/></g>'
    body += f'<rect x="{CX-n-4}" y="{top-34}" width="{2*n+8}" height="40" rx="5" fill="#5a3418"/><rect x="{CX-n-4}" y="{top-34}" width="{2*n+8}" height="6" rx="3" fill="#7a4a24"/>'
    body += f'<rect x="{CX-w+4}" y="232" width="{2*w-8}" height="104" rx="2" fill="#141414"/><rect x="{CX-w+9}" y="237" width="{2*w-18}" height="94" fill="none" stroke="#c9a24a" stroke-width="1.4"/>'
    body += f'<circle cx="{CX}" cy="262" r="10" fill="none" stroke="#c9a24a" stroke-width="1.5"/><rect x="{CX-24}" y="284" width="48" height="5" rx="2" fill="#c9a24a"/><rect x="{CX-16}" y="295" width="32" height="3" rx="1.5" fill="#c9a24a" opacity=".6"/><rect x="{CX-10}" y="310" width="20" height="8" rx="1" fill="#c9a24a" opacity=".85"/>'
    body += highlights(sh, base, w)
    (OUT / 'whisky.svg').write_text(svg(body, defs))


def gin():
    top, nb, sh, base, w, n = 70, 148, 168, 382, 36, 13
    d = bottle_path(top, nb, sh, base, w, n, curve=10)
    defs = glass_grad('g', '#5f9a8c', '#bfe3d8', '#f2fbf8') + LBL_SHADE
    defs += f'<clipPath id="c"><path d="{d}"/></clipPath>'
    body = SHADOW + f'<path d="{d}" fill="url(#g)" opacity=".8"/>'
    body += f'<g clip-path="url(#c)"><rect x="0" y="176" width="{W}" height="{H}" fill="#dff2ec" opacity=".55"/></g>'
    body += f'<rect x="{CX-n-3}" y="{top-26}" width="{2*n+6}" height="30" rx="3" fill="#aab4b8"/><rect x="{CX-n-3}" y="{top-26}" width="{2*n+6}" height="5" rx="2" fill="#dfe5e7"/>'
    body += label(CX - w + 4, 228, CX + w - 4, 330, '#fbfbf6', '#1d3d36', '#2f7a68', style='band')
    body += highlights(sh, base, w)
    (OUT / 'gin.svg').write_text(svg(body, defs))


def glass():
    defs = '<linearGradient id="wine" x1="0" x2="1"><stop offset="0" stop-color="#3a0710"/><stop offset=".5" stop-color="#8c1a2a"/><stop offset="1" stop-color="#3a0710"/></linearGradient>'
    defs += '<linearGradient id="gl" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".3" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity=".3"/></linearGradient>'
    bowl = 'M38,90 C34,170 50,232 80,236 C110,232 126,170 122,90 Z'
    body = SHADOW
    body += '<path d="M44,170 C50,214 62,232 80,234 C98,232 110,214 116,170 Z" fill="url(#wine)"/>'
    body += '<ellipse cx="80" cy="170" rx="36" ry="5" fill="#b23447"/>'
    body += f'<path d="{bowl}" fill="url(#gl)" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>'
    body += '<path d="M77,236 L77,360 Q77,372 60,376 L60,380 L100,380 L100,376 Q83,372 83,360 L83,236 Z" fill="#fff" opacity=".55"/>'
    body += '<ellipse cx="80" cy="382" rx="38" ry="6" fill="#fff" opacity=".5"/>'
    body += '<rect x="48" y="104" width="4" height="70" rx="2" fill="#fff" opacity=".5"/>'
    (OUT / 'taca.svg').write_text(svg(body, defs))


def gift():
    defs = '<linearGradient id="box" x1="0" x2="1"><stop offset="0" stop-color="#123a1f"/><stop offset=".5" stop-color="#1f5e2c"/><stop offset="1" stop-color="#123a1f"/></linearGradient>'
    defs += '<linearGradient id="rib" x1="0" x2="1"><stop offset="0" stop-color="#9a7428"/><stop offset=".5" stop-color="#f0cf78"/><stop offset="1" stop-color="#9a7428"/></linearGradient>'
    body = SHADOW
    body += '<rect x="22" y="200" width="116" height="182" rx="6" fill="url(#box)"/>'
    body += '<rect x="14" y="176" width="132" height="34" rx="6" fill="#26703a"/>'
    body += '<rect x="70" y="176" width="20" height="206" fill="url(#rib)"/>'
    body += '<path d="M80,176 C58,140 30,150 44,170 C52,180 70,178 80,176 Z" fill="url(#rib)"/>'
    body += '<path d="M80,176 C102,140 130,150 116,170 C108,180 90,178 80,176 Z" fill="url(#rib)"/>'
    body += '<rect x="22" y="208" width="116" height="4" fill="#000" opacity=".2"/>'
    (OUT / 'presente.svg').write_text(svg(body, defs))


wine('tinto', ('#14030a', '#4a1220', '#7a2a3a'))
wine('branco', ('#7d8f4c', '#d6e2a8', '#f6fbe4'), liquid='#e9d77c', capsule=('#d9b45a', '#8a6a22'), accent='#8a6a22')
wine('rose', ('#a8857c', '#f2d6cf', '#fff6f3'), liquid='#f08f7c', capsule=('#e0a48c', '#9a5c48'), accent='#c0605a')
sparkling()
beer()
whisky()
gin()
glass()
gift()
print('\n'.join(sorted(p.name for p in OUT.glob('*.svg'))))
