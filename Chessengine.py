"""
Chess Engine for Chess for Luvvrs
Complete chess rules: castling, en passant, promotion, check/checkmate/stalemate
AI: Negamax with alpha-beta pruning + piece-square tables
"""

# ─── CONSTANTS ────────────────────────────────────────────────────────
FILES = 'abcdefgh'
PIECE_VALS = {'P': 100, 'N': 320, 'B': 330, 'R': 500, 'Q': 900, 'K': 20000}

# Piece-square tables (white's perspective, mirrored for black)
PST = {
    'P': [
         0,  0,  0,  0,  0,  0,  0,  0,
        50, 50, 50, 50, 50, 50, 50, 50,
        10, 10, 20, 30, 30, 20, 10, 10,
         5,  5, 10, 25, 25, 10,  5,  5,
         0,  0,  0, 20, 20,  0,  0,  0,
         5, -5,-10,  0,  0,-10, -5,  5,
         5, 10, 10,-20,-20, 10, 10,  5,
         0,  0,  0,  0,  0,  0,  0,  0
    ],
    'N': [
        -50,-40,-30,-30,-30,-30,-40,-50,
        -40,-20,  0,  0,  0,  0,-20,-40,
        -30,  0, 10, 15, 15, 10,  0,-30,
        -30,  5, 15, 20, 20, 15,  5,-30,
        -30,  0, 15, 20, 20, 15,  0,-30,
        -30,  5, 10, 15, 15, 10,  5,-30,
        -40,-20,  0,  5,  5,  0,-20,-40,
        -50,-40,-30,-30,-30,-30,-40,-50
    ],
    'B': [
        -20,-10,-10,-10,-10,-10,-10,-20,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -10,  0,  5, 10, 10,  5,  0,-10,
        -10,  5,  5, 10, 10,  5,  5,-10,
        -10,  0, 10, 10, 10, 10,  0,-10,
        -10, 10, 10, 10, 10, 10, 10,-10,
        -10,  5,  0,  0,  0,  0,  5,-10,
        -20,-10,-10,-10,-10,-10,-10,-20
    ],
    'R': [
         0,  0,  0,  0,  0,  0,  0,  0,
         5, 10, 10, 10, 10, 10, 10,  5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
         0,  0,  0,  5,  5,  0,  0,  0
    ],
    'Q': [
        -20,-10,-10, -5, -5,-10,-10,-20,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -10,  0,  5,  5,  5,  5,  0,-10,
         -5,  0,  5,  5,  5,  5,  0, -5,
          0,  0,  5,  5,  5,  5,  0, -5,
        -10,  5,  5,  5,  5,  5,  0,-10,
        -10,  0,  5,  0,  0,  0,  0,-10,
        -20,-10,-10, -5, -5,-10,-10,-20
    ],
    'K': [
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -20,-30,-30,-40,-40,-30,-30,-20,
        -10,-20,-20,-20,-20,-20,-20,-10,
         20, 20,  0,  0,  0,  0, 20, 20,
         20, 30, 10,  0,  0, 10, 30, 20
    ],
}


def sq(r, c):
    return r * 8 + c


def rc(idx):
    return divmod(idx, 8)


def sq_name(idx):
    r, c = rc(idx)
    return FILES[c] + str(8 - r)


def opp(col):
    return 'b' if col == 'w' else 'w'


def piece_color(p):
    return p[0] if p else None


def piece_type(p):
    return p[1] if p else None


# ─── BOARD SETUP ──────────────────────────────────────────────────────
def start_board():
    board = [None] * 64
    back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
    for c, t in enumerate(back):
        board[sq(0, c)] = 'b' + t
        board[sq(7, c)] = 'w' + t
    for c in range(8):
        board[sq(1, c)] = 'bP'
        board[sq(6, c)] = 'wP'
    return board


def new_game():
    return {
        'board': start_board(),
        'turn': 'w',
        'castling': {'wK': True, 'wQ': True, 'bK': True, 'bQ': True},
        'ep': None,          # en passant target square index
        'half': 0,
        'full': 1,
        'history': [],       # list of move dicts
        'status': 'playing', # playing|checkmate|stalemate|draw|draw50|timeout|resigned
        'winner': None,
    }


# ─── PSEUDO-LEGAL MOVE GENERATION ─────────────────────────────────────
def pseudo_moves(board, idx, ep):
    """Generate pseudo-legal moves (may leave king in check)."""
    p = board[idx]
    if not p:
        return []
    r, c = rc(idx)
    col = p[0]
    tp = p[1]
    res = []

    def on_board(nr, nc):
        return 0 <= nr < 8 and 0 <= nc < 8

    def push(nr, nc):
        if on_board(nr, nc):
            t = board[sq(nr, nc)]
            if not t or piece_color(t) != col:
                res.append(sq(nr, nc))

    def push_cap(nr, nc):
        if on_board(nr, nc):
            t = board[sq(nr, nc)]
            if t and piece_color(t) != col:
                res.append(sq(nr, nc))

    def push_emp(nr, nc):
        if on_board(nr, nc) and not board[sq(nr, nc)]:
            res.append(sq(nr, nc))

    def slide(dr, dc):
        nr, nc = r + dr, c + dc
        while on_board(nr, nc):
            t = board[sq(nr, nc)]
            if t:
                if piece_color(t) != col:
                    res.append(sq(nr, nc))
                break
            res.append(sq(nr, nc))
            nr += dr
            nc += dc

    if tp == 'P':
        d = -1 if col == 'w' else 1
        start_r = 6 if col == 'w' else 1
        push_emp(r + d, c)
        if r == start_r and not board[sq(r + d, c)]:
            push_emp(r + 2 * d, c)
        push_cap(r + d, c - 1)
        push_cap(r + d, c + 1)
        if ep is not None:
            er, ec = rc(ep)
            if r + d == er and abs(c - ec) == 1:
                res.append(ep)

    elif tp == 'N':
        for dr, dc in [(-2,-1),(-2,1),(-1,-2),(-1,2),(1,-2),(1,2),(2,-1),(2,1)]:
            push(r + dr, c + dc)

    elif tp == 'B':
        for dr, dc in [(-1,-1),(-1,1),(1,-1),(1,1)]:
            slide(dr, dc)

    elif tp == 'R':
        for dr, dc in [(-1,0),(1,0),(0,-1),(0,1)]:
            slide(dr, dc)

    elif tp == 'Q':
        for dr, dc in [(-1,-1),(-1,1),(1,-1),(1,1),(-1,0),(1,0),(0,-1),(0,1)]:
            slide(dr, dc)

    elif tp == 'K':
        for dr, dc in [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]:
            push(r + dr, c + dc)

    return res


def apply_move(board, frm, to, promo, ep, castling):
    """Apply a move. Returns (new_board, captured, new_ep, new_castling)."""
    b = board[:]
    piece = b[frm]
    b[frm] = None
    col = piece[0]
    tp = piece[1]
    captured = b[to]
    b[to] = (col + promo) if promo else piece

    new_ep = None
    nc = dict(castling)

    # En passant capture
    if tp == 'P' and ep is not None and to == ep:
        er, ec = rc(ep)
        cap_r = er + 1 if col == 'w' else er - 1
        captured = b[sq(cap_r, ec)]
        b[sq(cap_r, ec)] = None

    # Set new en passant
    if tp == 'P':
        fr, _ = rc(frm)
        tr, fc = rc(to)
        if abs(fr - tr) == 2:
            new_ep = sq((fr + tr) // 2, fc)

    # Castling: move rook
    if tp == 'K':
        if col == 'w':
            nc['wK'] = False
            nc['wQ'] = False
        else:
            nc['bK'] = False
            nc['bQ'] = False
        fr, fc = rc(frm)
        _, tc = rc(to)
        if abs(fc - tc) == 2:
            if tc == 6:
                b[sq(fr, 5)] = b[sq(fr, 7)]
                b[sq(fr, 7)] = None
            else:
                b[sq(fr, 3)] = b[sq(fr, 0)]
                b[sq(fr, 0)] = None

    # Rook moves/captured => lose castling right
    if frm == sq(7, 7) or to == sq(7, 7): nc['wK'] = False
    if frm == sq(7, 0) or to == sq(7, 0): nc['wQ'] = False
    if frm == sq(0, 7) or to == sq(0, 7): nc['bK'] = False
    if frm == sq(0, 0) or to == sq(0, 0): nc['bQ'] = False

    return b, captured, new_ep, nc


def is_attacked(board, s, by_col):
    """Is square s attacked by by_col?"""
    for i in range(64):
        if piece_color(board[i]) == by_col:
            if s in pseudo_moves(board, i, None):
                return True
    return False


def in_check(board, col):
    ki = next((i for i, p in enumerate(board) if p == col + 'K'), None)
    if ki is None:
        return False
    return is_attacked(board, ki, opp(col))


def get_legal(board, idx, ep, castling):
    """Get all legal moves for piece at idx."""
    p = board[idx]
    if not p:
        return []
    col = p[0]
    tp = p[1]
    cands = pseudo_moves(board, idx, ep)

    # Add castling moves
    if tp == 'K':
        r = 7 if col == 'w' else 0
        if idx == sq(r, 4) and not in_check(board, col):
            # Kingside
            ks = castling['wK'] if col == 'w' else castling['bK']
            if (ks and board[sq(r, 7)] == col + 'R'
                    and not board[sq(r, 5)] and not board[sq(r, 6)]
                    and not is_attacked(board, sq(r, 5), opp(col))
                    and not is_attacked(board, sq(r, 6), opp(col))):
                cands.append(sq(r, 6))
            # Queenside
            qs = castling['wQ'] if col == 'w' else castling['bQ']
            if (qs and board[sq(r, 0)] == col + 'R'
                    and not board[sq(r, 1)] and not board[sq(r, 2)] and not board[sq(r, 3)]
                    and not is_attacked(board, sq(r, 3), opp(col))
                    and not is_attacked(board, sq(r, 2), opp(col))):
                cands.append(sq(r, 2))

    # Filter moves that leave king in check
    legal = []
    for to in cands:
        nb, _, _, _ = apply_move(board, idx, to, None, ep, castling)
        if not in_check(nb, col):
            legal.append(to)
    return legal


def all_legal(board, col, ep, castling):
    moves = []
    for i in range(64):
        if piece_color(board[i]) == col:
            for t in get_legal(board, i, ep, castling):
                moves.append((i, t))
    return moves


# ─── SAN NOTATION ────────────────────────────────────────────────────
def to_san(board, frm, to, promo, ep, castling):
    piece = board[frm]
    tp = piece[1]
    col = piece[0]
    has_cap = board[to] or (tp == 'P' and ep == to)
    nb, _, _, nc = apply_move(board, frm, to, promo, ep, castling)
    opp_col = opp(col)
    opp_in_chk = in_check(nb, opp_col)
    opp_moves = all_legal(nb, opp_col, None, nc)
    is_mate = opp_in_chk and not opp_moves

    fr, fc = rc(frm)
    tr, tc = rc(to)
    san = ''

    if tp == 'K' and abs(fc - tc) == 2:
        san = 'O-O' if tc > fc else 'O-O-O'
    else:
        if tp != 'P':
            san = tp
        # Disambiguation
        if tp not in ('P', 'K'):
            amb = []
            for i in range(64):
                if i != frm and board[i] == piece:
                    lm = get_legal(board, i, ep, castling)
                    if to in lm:
                        amb.append(i)
            if amb:
                same_file = any(rc(i)[1] == fc for i in amb)
                same_rank = any(rc(i)[0] == fr for i in amb)
                if not same_file:
                    san += FILES[fc]
                elif not same_rank:
                    san += str(8 - fr)
                else:
                    san += FILES[fc] + str(8 - fr)
        if has_cap:
            if tp == 'P':
                san += FILES[fc]
            san += 'x'
        san += FILES[tc] + str(8 - tr)
        if promo:
            san += '=' + promo

    san += '#' if is_mate else ('+' if opp_in_chk else '')
    return san


# ─── AI ──────────────────────────────────────────────────────────────
def eval_board(board):
    score = 0
    for i, p in enumerate(board):
        if not p:
            continue
        col, tp = p[0], p[1]
        sign = 1 if col == 'w' else -1
        pst_val = PST[tp][i] if col == 'w' else PST[tp][63 - i]
        score += sign * (PIECE_VALS[tp] + pst_val)
    return score


def negamax(board, depth, alpha, beta, col, ep, castling):
    if depth == 0:
        ev = eval_board(board)
        return ev if col == 'w' else -ev

    moves = all_legal(board, col, ep, castling)
    if not moves:
        if in_check(board, col):
            return -50000 - depth
        return 0

    best = -999999
    import random
    random.shuffle(moves)
    for frm, to in moves:
        nb, _, new_ep, new_cast = apply_move(board, frm, to, None, ep, castling)
        val = -negamax(nb, depth - 1, -beta, -alpha, opp(col), new_ep, new_cast)
        if val > best:
            best = val
        if val > alpha:
            alpha = val
        if alpha >= beta:
            break
    return best


def get_best_move(game, depth=2):
    import random
    col = game['turn']
    moves = all_legal(game['board'], col, game['ep'], game['castling'])
    if not moves:
        return None
    random.shuffle(moves)
    best_move = None
    best_val = -999999
    for frm, to in moves:
        # Determine if this is a promotion
        tp = piece_type(game['board'][frm])
        tr, _ = rc(to)
        promo = 'Q' if tp == 'P' and (tr == 0 or tr == 7) else None
        nb, _, new_ep, new_cast = apply_move(game['board'], frm, to, promo, game['ep'], game['castling'])
        val = -negamax(nb, depth - 1, -999999, 999999, opp(col), new_ep, new_cast)
        if val > best_val:
            best_val = val
            best_move = (frm, to, promo)
    return best_move


# ─── GAME ACTIONS ────────────────────────────────────────────────────
def execute_move(game, frm, to, promo=None):
    """Execute a move on the game state. Returns updated game + move info."""
    board = game['board']
    tp = piece_type(board[frm])
    col = game['turn']
    tr, _ = rc(to)

    # Auto-determine promotion type if not given
    if tp == 'P' and (tr == 0 or tr == 7):
        if not promo:
            promo = 'Q'  # default

    san = to_san(board, frm, to, promo, game['ep'], game['castling'])
    nb, captured, new_ep, new_cast = apply_move(board, frm, to, promo, game['ep'], game['castling'])

    # Update game state
    game['history'].append({
        'from': frm,
        'to': to,
        'promo': promo,
        'piece': board[frm],
        'captured': captured,
        'san': san,
        'from_sq': sq_name(frm),
        'to_sq': sq_name(to),
    })

    game['board'] = nb
    game['ep'] = new_ep
    game['castling'] = new_cast
    game['half'] = 0 if (captured or tp == 'P') else game['half'] + 1
    if col == 'b':
        game['full'] += 1
    game['turn'] = opp(col)

    # Check game over
    legal_next = all_legal(nb, game['turn'], new_ep, new_cast)
    chk = in_check(nb, game['turn'])

    if not legal_next:
        if chk:
            game['status'] = 'checkmate'
            game['winner'] = col
        else:
            game['status'] = 'stalemate'
    elif game['half'] >= 100:
        game['status'] = 'draw50'

    return game, {
        'san': san,
        'captured': captured,
        'check': chk,
        'from': frm,
        'to': to,
        'promo': promo,
    }


def get_legal_for_sq(game, idx):
    """Get legal moves for a square in the current game."""
    if piece_color(game['board'][idx]) != game['turn']:
        return []
    return get_legal(game['board'], idx, game['ep'], game['castling'])


def analyze_game(game):
    """Simple post-game analysis."""
    from copy import deepcopy
    state = new_game()
    results = {'w': {'best': 0, 'good': 0, 'inaccuracy': 0, 'mistake': 0, 'blunder': 0},
               'b': {'best': 0, 'good': 0, 'inaccuracy': 0, 'mistake': 0, 'blunder': 0}}
    critical = []
    prev_eval = 0

    for i, move in enumerate(game['history']):
        nb, _, new_ep, new_cast = apply_move(
            state['board'], move['from'], move['to'],
            move.get('promo'), state['ep'], state['castling']
        )
        ev = eval_board(nb)
        col = 'w' if i % 2 == 0 else 'b'
        diff = abs(ev - prev_eval)
        if diff > 250:   cat = 'blunder'
        elif diff > 150: cat = 'mistake'
        elif diff > 70:  cat = 'inaccuracy'
        elif diff > 25:  cat = 'good'
        else:            cat = 'best'
        results[col][cat] += 1
        if cat in ('blunder', 'mistake'):
            critical.append({
                'move_num': i // 2 + 1,
                'color': col,
                'san': move['san'],
                'category': cat,
            })
        prev_eval = ev
        state['board'] = nb
        state['ep'] = new_ep
        state['castling'] = new_cast
        state['turn'] = opp(state['turn'])

    total_w = sum(results['w'].values()) or 1
    total_b = sum(results['b'].values()) or 1
    acc_w = round((results['w']['best'] + results['w']['good'] * 0.8 + results['w']['inaccuracy'] * 0.5) * 100 / total_w)
    acc_b = round((results['b']['best'] + results['b']['good'] * 0.8 + results['b']['inaccuracy'] * 0.5) * 100 / total_b)

    return {
        'white': results['w'],
        'black': results['b'],
        'accuracy_white': acc_w,
        'accuracy_black': acc_b,
        'critical': critical[:8],
    }
