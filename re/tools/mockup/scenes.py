import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mock import *

S, D, Hh, Cc, J = 0, 1, 2, 3, 4
NAMES = ['Administrator', '태연', '윤아', '유리', '서현']   # screen pos 0..4 (5마)
ROWS = [('Administrator', '20.0%'), ('태연', '20.0%'), ('윤아', '20.0%'), ('유리', '20.0%'), ('서현', '20.0%')]
U = 14  # small DSB unit (FUN_00418610: 0xe when +0x4c set)

def bubble(s, pos, title, icon, text):
    """per-player DSB (FUN_00406640/FUN_00414fb0): yellow title, X, icon + text. placed under the hand,
    centred on the score-pile rect (calibrated on screenshot)."""
    b = s.b
    hand = b.area(2, pos)[0]; score = b.area(1, pos)[0]
    w, h = 170, 58
    cx = (score[0] + score[2]) // 2
    x0, y0 = cx - w // 2, hand[3] + 4
    s.dsb((x0, y0, x0 + w, y0 + h), closable=True)
    s.text((x0 + 4, y0 + 3), title, font(13, 6), YELLOW)
    s.icon(icon, (x0 + 10, y0 + 28))
    s.text((x0 + 38, y0 + 30), text, font(14, 4), WHITE)

def center_msg(s, text, closable=True, sub=None):
    """FUN_00414970: auto sized message DSB at board centre; X when timeout<0"""
    u = s.b.fpx
    f = font(u, 4)
    tw = int(s.d.textlength(text, font=f))
    wu = (u + 21 + tw) // u
    hu = 2 + (2 if sub else 0)
    W, H = s.b.W, s.b.H
    x0 = W // 2 - wu * u // 2 - 4; y0 = H // 2 - hu * u // 2 - 4
    s.dsb((x0, y0, x0 + wu * u + 8, y0 + hu * u + 8), closable=closable)
    s.text((x0 + (wu * u + 8) // 2 - 7, y0 + (hu * u + 8) // 2 - u // 2 - 2), text, f, WHITE, anchor='ma')

# ---------------------------------------------------------------- (b) election
def election():
    s = Screen(5)
    b = s.b
    my = [(S, 3), (S, 8), (S, 10), (D, 2), (D, 9), (Hh, 2), (Hh, 9), (Hh, 12), (Cc, 2), (Cc, 9)]
    for p in (1, 2, 3, 4):
        s.hand(p, [0] * 10, False)
    s.pile(3)
    s.hand(0, [card_id(*c) for c in my], True)
    for p, nm in enumerate(NAMES):
        s.name(p, nm, WHITE, current=(p == 0))
    bubble(s, 2, '윤아', 702, '다이아몬드   16')
    bubble(s, 3, '유리', 705, '출마 포기')
    center_msg(s, '초대 선거')
    # own election DSB (FUN_00411110 mode 0): 15x8 units, centred, bottom = area bottom - 8u (above own hand)
    hand = b.area(2, 0)[0]
    w, h = 15 * U + 8, 8 * U + 8
    x0 = b.W // 2 - w // 2; y0 = hand[1] - b.ch // 5 - h - 6
    s.dsb((x0, y0, x0 + w, y0 + h))
    s.text((x0 + w // 2, y0 + 5), '공약을 정해 주세요', font(14, 4), WHITE, anchor='ma')
    xs = x0 + 4 + U
    for k, ic in enumerate((701, 702, 703, 704, 700)):   # ♠◆♥♣ + 노기루다(X)
        s.icon(ic, (xs + k * 26, y0 + 4 + 2 * U), frame=(k == 1))
    s.text((x0 + 4 + 12 * U, y0 + 4 + 2 * U), '△', font(14, 4), WHITE)
    s.text((x0 + 4 + 12 * U, y0 + 4 + 4 * U), '▽', font(14, 4), WHITE)
    s.text((x0 + 4 + 13 * U + 2, y0 + 4 + 3 * U - 2), '17', font(16, 6), CYAN)
    s.text((x0 + 4 + 2 * U, y0 + 4 + 6 * U), '포기', font(14, 4), WHITE)
    s.text((x0 + 4 + 9 * U, y0 + 4 + 6 * U), '출마 !!', font(14, 4), CYAN)
    s.status = (700, '', '', 'Administrator 님의 공약 결정 중')
    s.finish(OUT + 'b_election_5p.png', lambda w: scoreboard_window(w, rows=ROWS))

# ---------------------------------------------------------------- (a) trick play
def trick():
    s = Screen(5)
    b = s.b
    my = [(S, 1), (S, 12), (D, 10), (Hh, 13), (Hh, 4), (Cc, 11), (Cc, 7)]
    counts = {1: 6, 2: 6, 3: 6, 4: 6}
    # 득점 카드 (mode 1 영역, 손패보다 먼저 그림 → 손패 아래로 ch/2 만큼 보임)
    piles = {0: [(Hh, 1), (Hh, 10)], 2: [(S, 13), (D, 1), (D, 11), (Cc, 10), (Cc, 1)], 3: [(Hh, 11)],
             4: [(S, 10), (Cc, 13)], 1: []}
    for p, cs in piles.items():
        for i, c in enumerate(cs):
            s.card(card_id(*c), b.card_rect(1, p, i, len(cs)))
    for p in (1, 2, 3, 4):
        s.hand(p, [0] * counts[p], False)
    s.hand(0, [card_id(*c) for c in my], True, hover=3)
    for p, c in ((1, (D, 5)), (2, (D, 13)), (3, (D, 3)), (4, (S, 2))):
        s.trick(p, card_id(*c))
    cols = {2: CYAN, 4: CYAN}
    for p, nm in enumerate(NAMES):
        s.name(p, nm, cols.get(p, WHITE), current=(p == 0))
    s.status = (701, '16', '♣10 프랜드', 'Administrator 님 차례입니다')
    rows = [('Administrator', '18.5%'), ('태연', '19.0%'), ('윤아', '24.0%'), ('유리', '19.5%'), ('서현', '19.0%')]
    s.finish(OUT + 'a_trick_5p.png', lambda w: scoreboard_window(w, rows=rows))

# ---------------------------------------------------------------- (c) master: discard
def discard():
    s = Screen(5)
    b = s.b
    my = [(S, 1), (S, 13), (S, 12), (S, 7), (S, 4), (D, 1), (D, 6), (Hh, 13), (Hh, 3), (Cc, 2), (Cc, 5), (Cc, 9), (4, 0)]
    for p in (1, 2, 3, 4):
        s.hand(p, [0] * 10, False)
    s.hand(0, [card_id(*c) for c in my], True, raised=(8, 9, 10))
    for p, nm in enumerate(NAMES):
        s.name(p, nm, CYAN if p == 0 else WHITE, current=(p == 0))
    # FUN_00411110 mode 1: 18x17 units at centre, moved 2 grid units up
    w, h = 18 * U + 8, 17 * U + 8
    x0 = b.W // 2 - w // 2; y0 = b.H // 2 - h // 2 - 2 * b.fpx
    s.dsb((x0, y0, x0 + w, y0 + h))
    f = font(14, 4)
    s.text((x0 + w // 2, y0 + 4 + U // 2), '당선을 축하드립니다 !!', font(16, 6), YELLOW, anchor='ma')
    for k, ln in enumerate(['버리고 싶은 카드 세 장을', '선택한 다음, 아래쪽에 있는', "'확정'을 클릭하세요", '',
                            '지금 기루다와 목표 점수를', '바꿀 수 있습니다']):
        s.text((x0 + w // 2, y0 + 4 + (k + 2) * U), ln, f, WHITE, anchor='ma')
    yy = y0 + 4 + 10 * U
    for k, ic in enumerate((701, 702, 703, 704, 700)):
        s.icon(ic, (x0 + 4 + U + k * 26, yy), frame=(k == 0))
    s.text((x0 + 4 + 12 * U, yy), '△', f, WHITE)
    s.text((x0 + 4 + 12 * U, yy + 2 * U), '▽', f, WHITE)
    s.text((x0 + 4 + 14 * U, yy + U), '16', font(16, 6), CYAN)
    s.text((x0 + 4 + 8 * U, y0 + 4 + 15 * U), '확정', font(15, 6), CYAN)
    s.status = (701, '16', '', 'Administrator 님이 당을 재정비하고 있습니다')
    s.finish(OUT + 'c1_master_discard_5p.png', lambda w: scoreboard_window(w, rows=ROWS))

# ---------------------------------------------------------------- (c2) friend selection
def friend():
    s = Screen(5)
    b = s.b
    my = [(S, 1), (S, 13), (S, 12), (S, 7), (S, 4), (D, 1), (D, 6), (Hh, 13), (Cc, 9), (4, 0)]
    for p in (1, 2, 3, 4):
        s.hand(p, [0] * 10, False)
    s.hand(0, [card_id(*c) for c in my], True)
    for p, nm in enumerate(NAMES):
        s.name(p, nm, CYAN if p == 0 else WHITE, current=(p == 0))
    # FUN_00413370: (u+223)/u+5  x  (96+31+2u)/u+13 units, centred
    wu, hu = (U + 223) // U + 5, (96 + 31 + 2 * U) // U + 13
    w, h = wu * U + 8, hu * U + 8
    x0 = b.W // 2 - w // 2; y0 = b.H // 2 - h // 2
    s.dsb((x0, y0, x0 + w, y0 + h))
    f = font(14, 4)
    gx = lambda u: x0 + 4 + u * U
    gy = lambda u: y0 + 4 + u * U
    s.text((x0 + w // 2, gy(0) + 2), '프랜드를 선택합니다', font(15, 6), YELLOW, anchor='ma')
    s.text((x0 + w // 2, gy(2)), "원하는 '프랜드 카드'나 플레이어를", f, WHITE, anchor='ma')
    s.text((x0 + w // 2, gy(3)), '선택하고 여기를 클릭하세요', f, WHITE, anchor='ma')
    s.text((gx(1), gy(6)), '마이티 프랜드', f, WHITE); s.text((gx(9), gy(6)), '기루다 A 프랜드', f, WHITE)
    s.text((gx(1), gy(8)), '조커 프랜드', f, WHITE); s.text((gx(9), gy(8)), '기루다 K 프랜드', f, WHITE)
    s.text((gx(1), gy(10)), '초구 프랜드', f, CYAN); s.text((gx(9), gy(10)), '노 프랜드', f, WHITE)
    for k, nm in enumerate(NAMES[1:]):
        s.text((gx(1), gy(14 + k)), '플레이어: ' + nm, f, WHITE)
    # FUN_00413a80: 14장 띠 = (right-u-224 .. right-u, bottom-u-32), 16px 간격, 선택 카드 3px 위로
    R_, B_ = x0 + w - 4, y0 + h - 4
    by = B_ - U - 32
    sx0 = R_ - U - 224
    s.text((gx(1), by - 26), '다른 카드:', f, WHITE)
    for k, ic in enumerate((701, 702, 703, 704)):
        s.icon(ic, (sx0 + k * 26, by - 30), frame=(k == 2))
    seq = [53] + [1] + list(range(13, 1, -1))
    for k, r in enumerate(seq):
        cid = 762 if r == 53 else card_id(Hh, r)
        crop = scaled(cid, 71, 96).crop((0, 0, 16, 32))
        rp = 3 if r == 10 else 0
        s.img.paste(crop, (sx0 + k * 16, by - rp))
        s.d.rectangle((sx0 + k * 16, by - rp, sx0 + k * 16 + 15, by + 31 - rp), outline=(0, 0, 0))
    # FUN_00412180: 큰 카드 = (right-71-u, bottom-96-u-37), 원래 크기 71x96
    bx = R_ - 71 - U; byy = B_ - 96 - U - 37
    s.card(card_id(Hh, 10), (bx, byy, bx + 71, byy + 96))
    s.d.line((bx - 40, gy(4) + 4, bx + 35, gy(4) + 4, bx + 35, byy - 4), fill=WHITE, width=2)
    s.status = (701, '16', '', 'Administrator 님이 당을 재정비하고 있습니다')
    s.finish(OUT + 'c2_master_friend_5p.png', lambda w: scoreboard_window(w, rows=ROWS))

# ---------------------------------------------------------------- (d) result / scoreboard
def result():
    s = Screen(5)
    b = s.b
    for p in range(5):
        pile = [(Hh, 1), (S, 10), (D, 13)] if p in (0, 2) else [(Cc, 12)]
        for i, c in enumerate(pile):
            s.card(card_id(*c), b.card_rect(1, p, i, len(pile)))
    cols = {0: CYAN, 2: CYAN}
    for p, nm in enumerate(NAMES):
        s.name(p, nm, cols.get(p, WHITE))
    u = b.fpx  # 결과 DSB 25x25 units (FUN_004159b0) – 일반 크기 단위
    w, h = 25 * U + 8, 25 * U + 8
    x0 = b.W // 2 - w // 2; y0 = b.H // 2 - h // 2
    s.dsb((x0, y0, x0 + w, y0 + h))
    f = font(14, 4)
    gx = lambda k: x0 + 4 + k * U
    gy = lambda k: y0 + 4 + k * U
    s.text((x0 + w // 2, gy(1)), '승리 !', font(21, 6), YELLOW, anchor='ma')
    s.text((gx(2), gy(4)), '♠ 스페이드 16', f, WHITE)
    s.text((gx(2), gy(5)), '[기본]: 16 장 공약에 17 장 득점', f, CYAN)
    rows = [('Administrator', '100', '112', CYAN), ('윤아', '100', '106', CYAN),
            ('태연', '100', '94', YELLOW), ('유리', '100', '94', YELLOW), ('서현', '100', '94', YELLOW)]
    for k, (nm, a, bb, c) in enumerate(rows):
        y = gy(8 + 3 * k)
        s.text((gx(1), y), nm, f, c)
        s.text((gx(3), y + U), a, f, WHITE)
        s.text((gx(17), y + U), '->', f, WHITE)
        s.text((gx(20), y + U), bb, f, CYAN)
    s.text((gx(5), gy(23)), '   확인   ', font(15, 6), CYAN)
    s.text((gx(14), gy(23)), '   게임 끝   ', font(15, 6), WHITE)
    s.status = (701, '16', '윤아', '게임 종료')
    rows2 = [('Administrator', '21.6%'), ('태연', '18.4%'), ('윤아', '21.2%'), ('유리', '18.4%'), ('서현', '18.4%')]
    s.finish(OUT + 'd_result_scoreboard_5p.png', lambda w: scoreboard_window(w, rows=rows2))

# ---------------------------------------------------------------- (e) seat layout per player count
def layouts():
    from PIL import Image as I
    tiles = []
    for n in (3, 4, 5, 6):
        s = Screen(n, W=800, H=600)
        b = s.b
        for p in range(n):
            cnt = 10 if n < 6 else 8
            for i in range(3):
                s.card(card_id(Hh, 1 + i), b.card_rect(1, p, i, 3))
            s.hand(p, [card_id(S, k + 1) for k in range(cnt)] if p == 0 else [0] * cnt, p == 0)
            s.trick(p, card_id(D, p + 1))
            s.name(p, 'P%d' % p + (' (나)' if p == 0 else ''), WHITE)
            for mode, col in ((2, (255, 255, 0)), (1, (255, 0, 255)), (0, (0, 255, 255))):
                r = b.area(mode, p)[0]
                s.d.rectangle(r, outline=col)
        s.d.text((10, 10 if n != 6 else 200), '%d마  card %dx%d' % (n, b.cw, b.ch), font=font(20, 6), fill=WHITE)
        tiles.append(s.img)
    out = I.new('RGB', (1610, 1210), (40, 40, 40))
    for k, t in enumerate(tiles):
        out.paste(t, ((k % 2) * 810, (k // 2) * 610))
    out.save(OUT + 'e_seat_layouts_3456.png'); print('saved layouts')

if __name__ == '__main__':
    election(); trick(); discard(); friend(); result(); layouts()
