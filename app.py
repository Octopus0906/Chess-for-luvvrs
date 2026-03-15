"""
Chess for Luvvrs — Flask App
by Chris Dcruz
"""
from flask import Flask, render_template, request, jsonify, session
import json
import uuid
import threading
from engine import (
    new_game, execute_move, get_legal_for_sq,
    get_best_move, analyze_game, sq_name, rc, all_legal, in_check, opp
)

app = Flask(__name__)
app.secret_key = 'chess_for_luvvrs_secret_2024'
app.config['SESSION_TYPE'] = 'filesystem'

# In-memory game store
games = {}
games_lock = threading.Lock()


def get_game():
    gid = session.get('game_id')
    if gid and gid in games:
        return gid, games[gid]
    return None, None


def board_to_json(board):
    """Convert board array to JSON-friendly format."""
    return [p if p else '' for p in board]


def game_to_response(game, extra=None):
    """Serialize game state for frontend."""
    r = {
        'board': board_to_json(game['board']),
        'turn': game['turn'],
        'status': game['status'],
        'winner': game['winner'],
        'castling': game['castling'],
        'ep': game['ep'],
        'move_count': len(game['history']),
        'history': [
            {'san': m['san'], 'from': m['from'], 'to': m['to'],
             'from_sq': m['from_sq'], 'to_sq': m['to_sq'],
             'captured': m.get('captured', ''), 'promo': m.get('promo', '')}
            for m in game['history']
        ],
        'in_check': in_check(game['board'], game['turn']) if game['status'] == 'playing' else False,
    }
    if extra:
        r.update(extra)
    return r


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/new_game', methods=['POST'])
def api_new_game():
    data = request.get_json() or {}
    mode = data.get('mode', 'pvp')        # pvp | ai
    time_sec = int(data.get('time', 600))
    inc_sec = int(data.get('inc', 5))
    player_color = data.get('color', 'w') # w | b | r
    ai_depth = int(data.get('ai_depth', 2))
    mode_name = data.get('mode_name', 'Rapid')

    import random
    if player_color == 'r':
        player_color = random.choice(['w', 'b'])

    game = new_game()
    gid = str(uuid.uuid4())

    meta = {
        'mode': mode,
        'player_color': player_color,
        'ai_depth': ai_depth,
        'mode_name': mode_name,
        'time_w': time_sec,
        'time_b': time_sec,
        'inc': inc_sec,
        'unlimited': time_sec == 0,
    }

    with games_lock:
        games[gid] = {'game': game, 'meta': meta}

    session['game_id'] = gid

    resp = game_to_response(game)
    resp['meta'] = meta
    resp['game_id'] = gid

    # If AI goes first (player is black)
    if mode == 'ai' and player_color == 'b':
        ai_move = get_best_move(game, depth=ai_depth)
        if ai_move:
            game, move_info = execute_move(game, ai_move[0], ai_move[1], ai_move[2])
            resp = game_to_response(game)
            resp['meta'] = meta
            resp['ai_move'] = move_info
            resp['game_id'] = gid

    return jsonify(resp)


@app.route('/api/legal_moves', methods=['POST'])
def api_legal_moves():
    gid, store = get_game()
    if not store:
        return jsonify({'error': 'No game'}), 400

    data = request.get_json() or {}
    sq_idx = int(data.get('sq', -1))
    if sq_idx < 0 or sq_idx >= 64:
        return jsonify({'legal': []})

    game = store['game']
    if game['status'] != 'playing':
        return jsonify({'legal': []})

    legal = get_legal_for_sq(game, sq_idx)
    return jsonify({'legal': legal, 'sq': sq_idx})


@app.route('/api/move', methods=['POST'])
def api_move():
    gid, store = get_game()
    if not store:
        return jsonify({'error': 'No game'}), 400

    data = request.get_json() or {}
    frm = int(data.get('from', -1))
    to = int(data.get('to', -1))
    promo = data.get('promo', None)  # 'Q','R','B','N' or None

    game = store['game']
    meta = store['meta']

    if game['status'] != 'playing':
        return jsonify({'error': 'Game over'}), 400
    if frm < 0 or to < 0:
        return jsonify({'error': 'Invalid move'}), 400

    # Validate move is legal
    legal = get_legal_for_sq(game, frm)
    if to not in legal:
        return jsonify({'error': 'Illegal move', 'legal': legal}), 400

    # Check if promotion needed
    piece = game['board'][frm]
    tr, _ = rc(to)
    needs_promo = piece and piece[1] == 'P' and (tr == 0 or tr == 7)
    if needs_promo and not promo:
        return jsonify({'needs_promotion': True, 'from': frm, 'to': to})

    game, move_info = execute_move(game, frm, to, promo)
    store['game'] = game

    resp = game_to_response(game, {'move': move_info})

    # AI response
    if (game['status'] == 'playing'
            and meta['mode'] == 'ai'
            and game['turn'] != meta['player_color']):
        ai_move = get_best_move(game, depth=meta['ai_depth'])
        if ai_move:
            game, ai_info = execute_move(game, ai_move[0], ai_move[1], ai_move[2])
            store['game'] = game
            resp = game_to_response(game, {'move': move_info, 'ai_move': ai_info})

    return jsonify(resp)


@app.route('/api/resign', methods=['POST'])
def api_resign():
    gid, store = get_game()
    if not store:
        return jsonify({'error': 'No game'}), 400
    game = store['game']
    if game['status'] == 'playing':
        game['status'] = 'resigned'
        game['winner'] = opp(game['turn'])
    return jsonify(game_to_response(game))


@app.route('/api/draw', methods=['POST'])
def api_draw():
    gid, store = get_game()
    if not store:
        return jsonify({'error': 'No game'}), 400
    game = store['game']
    if game['status'] == 'playing':
        game['status'] = 'draw'
        game['winner'] = None
    return jsonify(game_to_response(game))


@app.route('/api/undo', methods=['POST'])
def api_undo():
    gid, store = get_game()
    if not store:
        return jsonify({'error': 'No game'}), 400

    game = store['game']
    meta = store['meta']
    count = 2 if meta['mode'] == 'ai' else 1

    if len(game['history']) < count:
        return jsonify({'error': 'Nothing to undo'}), 400

    # Rebuild from scratch
    fresh = new_game()
    moves = game['history'][:-count]
    for m in moves:
        fresh, _ = execute_move(fresh, m['from'], m['to'], m.get('promo'))

    fresh['status'] = 'playing'
    fresh['winner'] = None
    store['game'] = fresh
    return jsonify(game_to_response(fresh, {'undone': True}))


@app.route('/api/analyze', methods=['POST'])
def api_analyze():
    gid, store = get_game()
    if not store:
        return jsonify({'error': 'No game'}), 400
    game = store['game']
    if not game['history']:
        return jsonify({'error': 'No moves to analyze'}), 400
    result = analyze_game(game)
    return jsonify(result)


@app.route('/api/pgn', methods=['GET'])
def api_pgn():
    gid, store = get_game()
    if not store:
        return jsonify({'error': 'No game'}), 400
    game = store['game']
    meta = store['meta']
    from datetime import date
    result = ('1-0' if game['winner'] == 'w' else
              '0-1' if game['winner'] == 'b' else '*')
    moves_str = ' '.join(
        (f"{i//2+1}. " if i % 2 == 0 else '') + m['san']
        for i, m in enumerate(game['history'])
    )
    pgn = (f'[Event "Chess for Luvvrs"]\n'
           f'[Site "by Chris Dcruz"]\n'
           f'[Date "{date.today()}"]\n'
           f'[White "Player 1"]\n'
           f'[Black "Player 2"]\n'
           f'[Result "{result}"]\n\n'
           f'{moves_str}')
    return jsonify({'pgn': pgn})


if __name__ == '__main__':
    app.run(debug=True, port=5000)
