/**
 * Teacher Timetable Scheduler — Frontend Controller
 * ================================================
 * Vanilla JavaScript with no external dependencies.
 * Manages state, communicates with the Flask backend, and renders the UI.
 */

(() => {
    'use strict';

    // ========================
    // State
    // ========================
    let assignments = [];   // [{teacher, subject, hours}, ...]
    let periodsPerDay = 6;  // Default; can be made configurable

    // ========================
    // DOM refs
    // ========================
    const $teacher  = document.getElementById('input-teacher');
    const $subject  = document.getElementById('input-subject');
    const $hours    = document.getElementById('input-hours');
    const $btnAdd   = document.getElementById('btn-add');
    const $tbody    = document.querySelector('#entries-table tbody');
    const $empty    = document.getElementById('empty-state');
    const $total    = document.getElementById('total-hours');
    const $generate = document.getElementById('btn-generate');
    const $phaseIn  = document.getElementById('phase-input');
    const $phaseOut = document.getElementById('phase-output');
    const $loading  = document.getElementById('loading');
    const $errorBox = document.getElementById('error-box');
    const $results  = document.getElementById('results-area');
    const $btnReset = document.getElementById('btn-reset');

    // ========================
    // Helpers
    // ========================
    const totalHours = () => assignments.reduce((s, a) => s + (a.hours || 0), 0);

    const updateUI = () => {
        const total = totalHours();
        $total.textContent = total;
        $generate.disabled = total === 0;

        if (assignments.length === 0) {
            $empty.classList.remove('hidden');
            $tbody.innerHTML = '';
        } else {
            $empty.classList.add('hidden');
            renderTable();
        }
    };

    const renderTable = () => {
        $tbody.innerHTML = assignments.map((a, i) => `
            <tr>
                <td>${i + 1}</td>
                <td>${escapeHtml(a.teacher)}</td>
                <td>${escapeHtml(a.subject)}</td>
                <td>${a.hours}</td>
                <td style="text-align:right">
                    <button class="btn btn-danger" data-idx="${i}">Remove</button>
                </td>
            </tr>
        `).join('');
    };

    const escapeHtml = (str) => {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    };

    const clearInputs = () => {
        $teacher.value = '';
        $subject.value = '';
        $hours.value = '1';
        $teacher.focus();
    };

    const showError = (msg) => {
        $errorBox.textContent = msg;
        $errorBox.classList.remove('hidden');
    };

    const hideError = () => {
        $errorBox.classList.add('hidden');
        $errorBox.textContent = '';
    };

    // ========================
    // Actions
    // ========================
    const addEntry = () => {
        const t = $teacher.value.trim();
        const s = $subject.value.trim();
        const h = parseInt($hours.value, 10);

        if (!t || !s || isNaN(h) || h < 1) {
            alert('Please enter a valid teacher name, subject, and at least 1 hour.');
            return;
        }

        assignments.push({ teacher: t, subject: s, hours: h });
        clearInputs();
        updateUI();
    };

    const removeEntry = (idx) => {
        assignments.splice(idx, 1);
        updateUI();
    };

    const lockInput = () => {
        $btnAdd.disabled = true;
        $btnAdd.textContent = 'Locked';
        document.querySelectorAll('#entries-table button').forEach(b => b.disabled = true);
        document.querySelectorAll('.form-row input').forEach(i => i.disabled = true);
    };

    const switchToOutput = () => {
        $phaseIn.classList.add('hidden');
        $phaseOut.classList.remove('hidden');
        $results.innerHTML = '';
        hideError();
        $loading.classList.remove('hidden');
    };

    const switchToInput = () => {
        $phaseOut.classList.add('hidden');
        $phaseIn.classList.remove('hidden');
        // Unlock
        $btnAdd.disabled = false;
        $btnAdd.textContent = '+ Add';
        document.querySelectorAll('#entries-table button').forEach(b => b.disabled = false);
        document.querySelectorAll('.form-row input').forEach(i => i.disabled = false);
        assignments = [];
        updateUI();
        hideError();
    };

    // ========================
    // Fetch & Render
    // ========================
    const generateTimetable = async () => {
        if (totalHours() === 0) return;

        lockInput();
        switchToOutput();
        hideError();

        try {
            const res = await fetch('/solve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assignments: assignments,
                    periodsPerDay: periodsPerDay,
                }),
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Server error');
            }

            renderResults(data.timetable, data.periodsPerDay);
        } catch (err) {
            console.error(err);
            showError(err.message || 'Something went wrong. Please try again.');
        } finally {
            $loading.classList.add('hidden');
        }
    };

    const renderResults = (timetable, periods) => {
        // Group by teacher
        const byTeacher = {};
        timetable.forEach(item => {
            if (!byTeacher[item.teacher]) byTeacher[item.teacher] = [];
            byTeacher[item.teacher].push(item);
        });

        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
        const dayFull  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

        let html = '';

        Object.keys(byTeacher).sort().forEach(teacher => {
            const items = byTeacher[teacher];
            const initials = teacher.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

            // Build empty 5-day × periods grid
            const grid = Array.from({ length: periods }, () => Array(5).fill(null));
            items.forEach(item => {
                grid[item.period][item.day] = item.subject;
            });

            let cellHtml = '';
            for (let p = 0; p < periods; p++) {
                // Period label
                cellHtml += `<div class="period-label">P${p + 1}</div>`;
                for (let d = 0; d < 5; d++) {
                    const subj = grid[p][d];
                    if (subj) {
                        cellHtml += `<div class="cell filled">${escapeHtml(subj)}</div>`;
                    } else {
                        cellHtml += `<div class="cell"></div>`;
                    }
                }
            }

            html += `
                <div class="teacher-card">
                    <h3>
                        <span class="teacher-avatar">${initials}</span>
                        ${escapeHtml(teacher)}
                    </h3>
                    <div class="calendar-grid">
                        <div class="day-header" style="background:#e5e7eb; font-size:0.6rem;">Period</div>
                        ${dayFull.map(d => `<div class="day-header">${d}</div>`).join('')}
                        ${cellHtml}
                    </div>
                    <div style="margin-top:8px; font-size:0.8rem; color:#6b7280; text-align:right;">
                        ${items.length} periods scheduled across the week
                    </div>
                </div>
            `;
        });

        $results.innerHTML = html;
    };

    // ========================
    // Event Listeners
    // ========================
    $btnAdd.addEventListener('click', addEntry);

    // Enter key in any input triggers add
    [$teacher, $subject, $hours].forEach(el =>
        el.addEventListener('keydown', e => { if (e.key === 'Enter') addEntry(); })
    );

    $tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const idx = parseInt(btn.dataset.idx, 10);
        if (!isNaN(idx)) removeEntry(idx);
    });

    $generate.addEventListener('click', generateTimetable);
    $btnReset.addEventListener('click', switchToInput);

    // Init
    updateUI();
})();
