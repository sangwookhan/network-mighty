# Mighty Network 3.2 board mockup renderer (layout ported from FUN_004073c0 / FUN_00407030 / FUN_00406c30)
import os
from PIL import Image, ImageDraw, ImageFont, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(HERE, '../../resources/')  # extract_resources.py 결과
OUT = os.path.join(HERE, '../../mockups/')
os.makedirs(OUT, exist_ok=True)
FONTF = '/System/Library/Fonts/AppleSDGothicNeo.ttc'

def font(px, w=4):
    return ImageFont.truetype(FONTF, px, index=w)

def bmp(i):
    return Image.open(R + 'bitmap_%d.png' % i).convert('RGB')

def card_id(suit, rank):  # suit 0..3 = S D H C, rank 1..13 ; joker = (4,0)
    return 762 if suit == 4 else 710 + suit * 13 + rank - 1

GREEN = (0, 128, 0)            # BackColor 0x008000
WHITE = (255, 255, 255)        # AttColor 0xffffff (야당 이름) / DSBText
CYAN = (0, 255, 255)           # DefColor 0xffff00 (여당 이름) / DSBStrong1
YELLOW = (255, 255, 0)         # DSBStrong2 0x00ffff
BACK = 772

# DAT_00437ae4 : seat flags [nPlayers][screenPos]
L, LC, C, RC, RR, T, TM, M, BM, B = 1, 2, 4, 8, 0x10, 0x20, 0x40, 0x80, 0x100, 0x200
FLAGS = {1: [C | B], 2: [C | B, C | T], 3: [C | B, L | TM, RR | TM],
         4: [C | B, L | M, C | T, RR | M], 5: [C | B, L | BM, LC | T, RC | T, RR | BM],
         6: [RC | B, LC | B, L | M, LC | T, RC | T, RR | M]}

def cdiv(a, b):  # C integer division (truncate toward zero)
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b > 0) else -q

def card_size(W, H, zoom=True):  # FUN_00407030
    w0, h0 = 71, 96
    if not zoom or W < 10 or H < 10:
        return w0, h0
    minW, maxW = 2 * h0 + cdiv(5 * w0, 2), 2 * h0 + cdiv(7 * w0, 2)
    minH, maxH = cdiv(9 * h0, 2), cdiv(11 * h0, 2)
    sx = sy = 1000
    if W < minW: sx = W * 1000 // minW
    elif W > maxW: sx = W * 1000 // maxW
    if H < minH: sy = H * 1000 // minH
    elif H > maxH: sy = H * 1000 // maxH
    if sx >= 1000 and sy >= 1000:
        if sx > 1000 and sy > 1000:
            s = max(1000, (min(sx, sy) + 250) // 500 * 500)
        else:
            s = 1000
    else:
        s = min(sx, sy)
    return w0 * s // 1000, h0 * s // 1000

class Board:
    def __init__(self, W, H, n):
        self.W, self.H, self.n = W, H, n
        self.cw, self.ch = card_size(W, H)
        self.fpx = self.ch * 14 // 96  # board font 0 height (돋움 600)

    def area(self, mode, pos):
        W, H, cw, ch = self.W, self.H, self.cw, self.ch
        cx, cy = W // 2, H // 2
        f = FLAGS[self.n][pos]
        if mode == 0:
            aw, ah = cw * 3 - cw // 5, ch * 2 + 8
            l, t = cx - aw // 2, cy - ah // 2
            r, b = l + aw, t + ah
            if f & L: x = l + 2
            elif f & LC: x = l + (cx - l) // 3
            elif f & C: x = cx - cw // 2
            elif f & RC: x = r - (r - cx) // 3 - cw
            else: x = r - 2 - cw
            if f & (T | TM): y = t + 2
            elif f & M: y = cy - ch // 2
            elif f & BM: y = cy + ch // 7 - ch // 2
            else: y = b - 2 - ch
            return (x, y, x + cw, y + ch), False, True
        vert = bool(f & (L | RR))
        rev = 0 if f & L else 1 if f & RR else (f >> 9) & 1
        base = ch + 2 * cw
        if not vert:
            if mode == 1:
                w = (7 * cw) // 4 + (0 if W < 2 * base else (W - 2 * base) // 3)
                div = 6
            else:
                w = 3 * cw + cw // 2 + (0 if W < 2 * base else (W - 2 * base) // 2)
                div = 20
            if f & LC: r = cx - cx // div; l = r - w
            elif f & RC: l = cx + (W - cx) // div; r = l + w
            else: l = cx - w // 2; r = l + w
            narrow = H < 5 * ch + ch // 2
            if mode == 1:
                if narrow:
                    if f & T: b = cy - ch // 4 - ch; t = b - ch
                    else: t = ch // 4 + cy + ch; b = t + ch
                else:
                    if f & T: t = ch // 2; b = t + ch
                    else: b = H - ch // 2; t = b - ch
            else:
                if narrow:
                    if f & T: b = cy - 7 * ch // 4; t = b - ch
                    else: t = 7 * ch // 4 + cy; b = t + ch
                else:
                    if f & T: t = 0; b = ch
                    else: b = H; t = b - ch
        else:
            if mode == 1:
                h = 2 * ch if H < 5 * ch + ch // 2 else H // 2 - 3 * ch // 4
            else:
                h = 3 * ch if H < 5 * ch + ch // 2 else H // 2 + ch // 4
            narrow = W < 2 * base
            off = (cw // 2) if mode == 1 else 0
            if f & L:
                if narrow: r = cx - (cw // 2 if mode == 1 else cw) - ch; l = r - cw
                else: l = off; r = l + cw
            else:
                if narrow: l = cx + (cw // 2 if mode == 1 else cw) + ch; r = l + cw
                else: r = W - off; l = r - cw
            if f & TM: t = cy - h // 7 - h // 2
            elif f & M: t = cy - h // 2
            else: t = cy + h // 7 - h // 2
            b = t + h
        return (l, t, r, b), vert, rev

    def card_rect(self, mode, pos, i, cnt):
        (l, t, r, b), vert, rev = self.area(mode, pos)
        cw, ch = self.cw, self.ch
        if not vert:
            extra = (r - l) - cw * cnt
            if extra < 0:
                if rev == 0: i = cnt - i - 1
                x = l + ((r - l - cw) * i) // max(1, cnt - 1)
            elif rev == 0:
                x = r - (i + 1) * cw - extra // 2
            else:
                x = l + cw * i + extra // 2
            return (x, t, x + cw, t + ch)
        extra = (b - t) - ch * cnt
        if extra < 0:
            if rev == 0: i = cnt - i - 1
            y = t + ((b - t - ch) * i) // max(1, cnt - 1)
        elif rev == 0:
            y = b - (i + 1) * ch - extra // 2
        else:
            y = t + ch * i + extra // 2
        return (l, y, l + cw, y + ch)

_cache = {}
def scaled(i, cw, ch):
    k = (i, cw, ch)
    if k not in _cache:
        _cache[k] = bmp(i).resize((cw, ch), Image.NEAREST)
    return _cache[k]

class Screen:
    """XP-like frame: window 1066x927, client = board"""
    def __init__(self, n, title='마이티 네트워크 3.2', W=1058, H=850):
        self.win = Image.new('RGB', (W + 8, H + 53 + 24), (236, 233, 216))
        self.ox, self.oy = 4, 53
        self.b = Board(W, H, n)
        self.img = Image.new('RGB', (W, H), GREEN)
        self.d = ImageDraw.Draw(self.img)
        self.title = title
        self.status = ('', '', '', '')

    # --- board primitives
    def card(self, cid, rect, raise_px=0):
        l, t, r, b = rect
        self.img.paste(scaled(cid, r - l, b - t), (l, t - raise_px))
        # 1px black frame drawn by FUN_00401b70 on visible edges (approximation)
        self.d.rectangle((l, t - raise_px, r - 1, b - 1 - raise_px), outline=(0, 0, 0))

    def hand(self, pos, cards, face_up, raised=(), hover=None, mode=2):
        cnt = len(cards)
        for i, c in enumerate(cards):
            rc = self.b.card_rect(mode, pos, i, cnt)
            rp = 0
            if i in raised: rp = self.b.ch // 5
            elif i == hover: rp = self.b.ch // 20
            self.card(c if face_up else BACK, rc, rp)

    def trick(self, pos, c):
        self.card(c, self.b.area(0, pos)[0])

    def pile(self, count):  # FUN_00404b10 (deck/kitty at centre)
        cw, ch = self.b.cw, self.b.ch
        cx, cy = self.b.W // 2, self.b.H // 2
        n = count if count < 3 else (count * 2) // 3 if count < 10 else (count - 9) * cw // 520 + 6
        y0 = ((cw * 44) // 520 + 6) * 2
        for i in range(n):
            self.card(BACK, (cx - cw // 2, y0 - ch // 2 + cy - 2 * i, cx - cw // 2 + cw, y0 - ch // 2 + cy - 2 * i + ch))

    def text(self, xy, s, f, fill, shadow=True, anchor='la'):
        x, y = xy
        if shadow:
            self.d.text((x + 1, y + 1), s, font=f, fill=(0, 0, 0), anchor=anchor)
        self.d.text((x, y), s, font=f, fill=fill, anchor=anchor)

    def name(self, pos, s, color=WHITE, current=False):
        # FUN_00404840 + FUN_00406c30: black 1px outline + colour; box when current player
        b = self.b
        hand = b.area(2, pos)[0]; score = b.area(1, pos)[0]
        vert = b.area(2, pos)[1]
        f = font(b.fpx, 4)
        tw = int(self.d.textlength(s, font=f)); th = b.fpx
        m = 8
        W, H = b.W, b.H
        if not vert:
            if hand[0] < W // 2 < hand[2]:
                x = hand[2] + m
                y = (H - m - th) if hand[1] > H // 2 else m
            elif hand[0] < W // 2 and hand[2] <= W // 2:
                x = score[0] - m - tw; y = hand[3] + m
            else:
                x = score[2] + m; y = hand[3] + m
        else:
            y = score[3] + m
            x = hand[2] + m if hand[0] < W // 2 else hand[0] - m - tw
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            self.d.text((x + dx, y + dy), s, font=f, fill=(0, 0, 0))
        self.d.text((x, y), s, font=f, fill=color)
        if current:
            bb = (x - 2, y - 1, x + tw + 3, y + th + 4)
            self.d.rectangle((bb[0] + 1, bb[1] + 1, bb[2] + 1, bb[3] + 1), outline=(0, 0, 0))
            self.d.rectangle(bb, outline=color)

    # --- DSB (FUN_004186e0): darkened box + bevel + optional X
    def dsb(self, rect, closable=False, shade='dark'):
        l, t, r, b = rect
        reg = self.img.crop(rect)
        if shade == 'dark':
            reg = Image.blend(reg, Image.new('RGB', reg.size, (0, 0, 0)), 0.5)
        elif shade == 'opaque':
            reg = Image.new('RGB', reg.size, (64, 64, 64))
        else:  # stipple with pattern 781
            pat = bmp(781).convert('L')
            for yy in range(0, reg.size[1], 8):
                for xx in range(0, reg.size[0], 8):
                    tile = reg.crop((xx, yy, xx + 8, yy + 8))
                    reg.paste(ImageChops.multiply(tile, pat.convert('RGB').crop((0, 0) + tile.size)), (xx, yy))
        self.img.paste(reg, (l, t))
        d = self.d
        d.line((r - 1, t, l, t), fill=(128, 128, 128)); d.line((l, t, l, b - 1), fill=(128, 128, 128))
        d.line((l, b - 1, r - 1, b - 1), fill=(64, 64, 64)); d.line((r - 1, b - 1, r - 1, t), fill=(64, 64, 64))
        d.line((r - 2, t + 1, l + 1, t + 1), fill=WHITE); d.line((l + 1, t + 1, l + 1, b - 2), fill=WHITE)
        d.line((l + 1, b - 2, r - 2, b - 2), fill=(0, 0, 0)); d.line((r - 2, b - 2, r - 2, t + 1), fill=(0, 0, 0))
        if closable:
            for k in (0, 1):
                d.line((r - 5, t + 15 + k, r - 16, t + 4 + k), fill=WHITE)
                d.line((r - 15, t + 15 + k, r - 4, t + 4 + k), fill=WHITE)

    def icon(self, i, xy, frame=True):
        x, y = xy
        self.img.paste(bmp(i), (x, y))
        if frame:
            self.d.rectangle((x - 1, y - 1, x + 20, y + 20), outline=WHITE)

    # --- final compose with frame/menu/status bar
    def finish(self, path, extra=None):
        win = self.win
        d = ImageDraw.Draw(win)
        Wt = win.size[0]
        for y in range(30):  # XP Luna title bar
            c = (0, 84 - y, 227 - y * 2)
            d.line((0, y, Wt, y), fill=c)
        d.text((30, 7), self.title, font=font(14, 6), fill=WHITE)
        d.text((8, 6), '♠', font=font(16, 6), fill=WHITE)
        for k, col in enumerate(((60, 110, 230), (60, 110, 230), (220, 80, 50))):
            x = Wt - 70 + k * 23
            d.rounded_rectangle((x, 5, x + 20, 25), 3, fill=col, outline=WHITE)
        d.rectangle((0, 30, Wt, 52), fill=(236, 233, 216))
        d.text((10, 34), '게임(G)', font=font(12, 0), fill=(0, 0, 0))
        d.text((60, 34), '도움말(H)', font=font(12, 0), fill=(0, 0, 0))
        win.paste(self.img, (self.ox, self.oy))
        sy = self.oy + self.b.H
        d.rectangle((0, sy, Wt, win.size[1]), fill=(236, 233, 216))
        # status bar panes: [기루다 아이콘][목표][프랜드][메시지]  (0x40d wParam 1/2/3/5)
        ico, goal, fr, msg = self.status
        d.rectangle((2, sy + 3, 24, sy + 22), outline=(160, 160, 160))
        if ico:
            win.paste(bmp(ico), (3, sy + 3))
        d.rectangle((26, sy + 3, 54, sy + 22), outline=(160, 160, 160))
        d.text((30, sy + 6), goal, font=font(12, 0), fill=(0, 0, 0))
        d.rectangle((56, sy + 3, 118, sy + 22), outline=(160, 160, 160))
        d.text((60, sy + 6), fr, font=font(12, 0), fill=(0, 0, 0))
        d.text((124, sy + 5), msg, font=font(13, 0), fill=(0, 0, 0))
        if extra:
            extra(win)
        win.save(path)
        print('saved', path, win.size, 'card', self.b.cw, self.b.ch)


def scoreboard_window(win, x=553, y=0, rows=(), cols=('이름', '지지율')):
    """dialog 821 '전적' tool window (WS_POPUP|WS_CAPTION|WS_SYSMENU, tool-window caption)."""
    d = ImageDraw.Draw(win)
    w, h = 142, 146
    d.rectangle((x, y, x + w, y + h), fill=(236, 233, 216), outline=(0, 60, 180))
    for yy in range(14):
        d.line((x + 1, y + 1 + yy, x + w - 1, y + 1 + yy), fill=(0, 84 - yy * 2, 227 - yy * 4))
    d.text((x + 4, y + 1), '전적', font=font(11, 6), fill=WHITE)
    d.rounded_rectangle((x + w - 13, y + 2, x + w - 3, y + 12), 2, fill=(220, 80, 50), outline=WHITE)
    fx = font(11, 0); fb = font(11, 6)
    d.text((x + 20, y + 17), cols[0], font=fx, fill=(0, 0, 0))
    d.text((x + w - 10, y + 17), cols[1], font=fx, fill=(0, 0, 0), anchor='ra')
    for k, (nm, v) in enumerate(rows):
        f = fb if k == 0 else fx
        d.text((x + 20, y + 40 + k * 15), nm, font=f, fill=(0, 0, 0))
        d.text((x + w - 10, y + 40 + k * 15), v, font=f, fill=(0, 0, 0), anchor='ra')
    d.rectangle((x + 3, y + h - 16, x + w - 3, y + h - 3), fill=(220, 220, 220), outline=(160, 160, 160))
    d.rectangle((x + 30, y + h - 14, x + 50, y + h - 5), fill=(190, 190, 200))
