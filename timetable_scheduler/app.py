"""
Teacher-Subject Timetable Scheduler - Backend Server
=====================================================
Auto-scheduling engine using backtracking + even distribution.

Algorithm:
  1. Flatten assignments into individual lesson slots.
  2. Sort by teacher workload (hardest first).
  3. Backtracking search: place each lesson into the least-loaded day,
     preferring the earliest available period within that day.
  4. Post-process: rebalance lessons across days so no teacher
     is over-concentrated on a single weekday.
"""

from flask import Flask, render_template, request, jsonify
from collections import Counter

app = Flask(__name__)

# Dev CORS — allow browser fetch
@app.after_request
def add_cors(resp):
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return resp


# ---------------------------------------------------------------------------
# Core solver
# ---------------------------------------------------------------------------

def solve_timetable(assignments, num_days=5, periods_per_day=6):
    lessons = []
    for a in assignments:
        h = int(a.get('hours', 0))
        if h <= 0:
            continue
        for _ in range(h):
            lessons.append({
                'teacher': a['teacher'].strip(),
                'subject': a['subject'].strip(),
            })

    if not lessons:
        return []

    teacher_loads = Counter(l['teacher'] for l in lessons)
    lessons.sort(key=lambda x: (-teacher_loads[x['teacher']], x['teacher']))

    teacher_slots = {}
    solution = []

    def get_preferred_slots(teacher):
        used = teacher_slots.get(teacher, set())
        day_counts = [0] * num_days
        for (d, _) in teacher_slots.get(teacher, []):
            day_counts[d] += 1

        candidates = []
        for d in range(num_days):
            for p in range(periods_per_day):
                if (d, p) not in used:
                    candidates.append((d, p, day_counts[d], p))

        candidates.sort(key=lambda x: (x[2], x[3]))
        return [(c[0], c[1]) for c in candidates]

    def backtrack(idx):
        if idx == len(lessons):
            return True

        lesson = lessons[idx]
        teacher = lesson['teacher']
        if teacher not in teacher_slots:
            teacher_slots[teacher] = set()

        for slot in get_preferred_slots(teacher):
            teacher_slots[teacher].add(slot)
            solution.append({
                'teacher': teacher,
                'subject': lesson['subject'],
                'day': slot[0],
                'period': slot[1],
            })

            if backtrack(idx + 1):
                return True

            teacher_slots[teacher].remove(slot)
            solution.pop()

        return False

    if backtrack(0):
        solution = even_distribute(solution, num_days, periods_per_day)
        solution.sort(key=lambda x: (x['teacher'], x['day'], x['period']))
        return solution

    return None


def even_distribute(solution, num_days, periods_per_day):
    if not solution:
        return solution

    teacher_day = {}
    for item in solution:
        t, d = item['teacher'], item['day']
        teacher_day.setdefault(t, {}).setdefault(d, []).append({
            'subject': item['subject'], 'period': item['period'],
        })

    days_range = list(range(num_days))
    changed = True
    iterations = 0
    while changed and iterations < 20:
        changed = False
        iterations += 1

        for teacher, day_map in teacher_day.items():
            counts = {d: len(day_map.get(d, [])) for d in days_range}
            if max(counts.values()) - min(counts.values()) <= 1:
                continue

            heavy = next(d for d in days_range if counts[d] > min(counts.values()))
            light = next(d for d in days_range if counts[d] == min(counts.values()))

            taken = {x['period'] for x in day_map.get(light, [])}
            cands = [x for x in day_map[heavy] if x['period'] not in taken]
            if not cands:
                continue

            moved = cands[0]
            day_map[heavy].remove(moved)
            day_map.setdefault(light, []).append(moved)
            changed = True
            break

    out = []
    for teacher, day_map in teacher_day.items():
        for day, items in day_map.items():
            for item in items:
                out.append({
                    'teacher': teacher,
                    'subject': item['subject'],
                    'day': day,
                    'period': item['period'],
                })
    return out


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/solve', methods=['POST', 'OPTIONS'])
def solve():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True}), 200

    payload = request.get_json(silent=True) or {}

    if not payload:
        return jsonify({
            'success': False,
            'error': 'Invalid request: expected JSON body with assignments and periodsPerDay.'
        }), 400

    assignments = payload.get('assignments', [])
    periods = int(payload.get('periodsPerDay', 6) or 6)

    if not assignments:
        return jsonify({
            'success': False,
            'error': 'No assignments provided.'
        }), 400

    try:
        result = solve_timetable(assignments, periods_per_day=periods)
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Solver error: {type(e).__name__}: {e}'
        }), 500

    if result is None:
        return jsonify({
            'success': False,
            'error': (
                'Could not generate a valid schedule. '
                f'The total weekly hours exceed the available slots ({5 * periods}).'
            )
        })

    return jsonify({
        'success': True,
        'timetable': result,
        'periodsPerDay': periods
    })


@app.errorhandler(404)
def handle_404(e):
    return jsonify({'success': False, 'error': f'Not Found: {request.url}'}), 404


@app.errorhandler(405)
def handle_405(e):
    return jsonify({'success': False, 'error': f'Method Not Allowed: {request.method} {request.url}'}), 405


@app.errorhandler(500)
def handle_500(e):
    return jsonify({'success': False, 'error': f'Server Error: {e}'}), 500


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    print("\n" + "=" * 60)
    print("  Teacher Timetable Scheduler")
    print("  Open → http://127.0.0.1:5000")
    print("=" * 60 + "\n")
    app.run(debug=True, port=5000)
