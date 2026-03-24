/**
 * App.js - Controller for the Sudoku Web App
 */

class SudokuApp {
    constructor() {
        this.logic = new SudokuLogic();
        this.gridElement = document.getElementById('sudoku-grid');
        this.difficultyDisplay = document.getElementById('difficulty-display');
        this.timerDisplay = document.getElementById('timer');
        this.landingPage = document.getElementById('landing-page');
        this.gamePage = document.getElementById('game-page');

        this.selectedCell = null;
        this.mode = 'play'; // 'play' or 'notes'
        this.difficulty = 'medium';
        this.gridSize = 9;
        this.board = [];
        this.solution = [];
        this.notes = [];
        this.history = [];

        this.timer = null;
        this.seconds = 0;

        this.init();
    }

    init() {
        this.setupLandingPage();
        this.setupEventListeners();
    }

    setupLandingPage() {
        const modeOpts = document.querySelectorAll('.mode-opt');
        modeOpts.forEach(opt => {
            opt.addEventListener('click', () => {
                modeOpts.forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                this.gridSize = parseInt(opt.dataset.size);
            });
        });

        document.getElementById('main-start-btn').addEventListener('click', () => {
            this.landingPage.classList.remove('active');
            this.landingPage.style.display = 'none';
            this.gamePage.style.display = 'block';
            this.showDifficultyModal();
        });
    }

    createGrid() {
        this.gridElement.innerHTML = '';
        this.gridElement.style.gridTemplateColumns = `repeat(${this.gridSize}, 1fr)`;

        const count = this.gridSize * this.gridSize;
        const boxSize = Math.sqrt(this.gridSize);

        for (let i = 0; i < count; i++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.index = i;

            // Add border logic
            const row = Math.floor(i / this.gridSize);
            const col = i % this.gridSize;

            if (boxSize > 0 && Number.isInteger(boxSize)) {
                if ((col + 1) % boxSize === 0 && (col + 1) !== this.gridSize) {
                    cell.classList.add('border-right');
                }
                if ((row + 1) % boxSize === 0 && (row + 1) !== this.gridSize) {
                    cell.classList.add('border-bottom');
                }
            }

            this.gridElement.appendChild(cell);
        }

        this.updateNumberPad();
    }

    updateNumberPad() {
        const numPad = document.getElementById('number-pad');
        const btns = numPad.querySelectorAll('.num-btn:not(.action-btn)');
        btns.forEach((btn, idx) => {
            const val = idx + 1;
            if (val > this.gridSize) {
                btn.style.display = 'none';
            } else {
                btn.style.display = 'flex';
                btn.textContent = val;
                btn.dataset.value = val;
            }
        });
    }

    setupEventListeners() {
        // Cell selection
        this.gridElement.addEventListener('click', (e) => {
            const cell = e.target.closest('.cell');
            if (cell) this.selectCell(cell);
        });

        // Number pad
        document.querySelector('.number-pad').addEventListener('click', (e) => {
            const btn = e.target.closest('.num-btn');
            if (btn) this.handleNumberInput(btn.dataset.value);
        });

        // Keyboard input
        document.addEventListener('keydown', (e) => {
            if (e.key >= '1' && e.key <= this.gridSize.toString()) this.handleNumberInput(e.key);
            if (e.key === 'Backspace' || e.key === 'Delete') this.handleNumberInput('0');

            // Arrow navigation
            if (this.selectedCell) {
                let index = parseInt(this.selectedCell.dataset.index);
                if (e.key === 'ArrowUp') this.moveSelection(index - this.gridSize);
                if (e.key === 'ArrowDown') this.moveSelection(index + this.gridSize);
                if (e.key === 'ArrowLeft') this.moveSelection(index - 1);
                if (e.key === 'ArrowRight') this.moveSelection(index + 1);
            }
        });

        // Tabs (Mode toggle)
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.mode = btn.dataset.mode;
            });
        });

        // Action buttons
        document.getElementById('undo-btn').addEventListener('click', () => this.undo());
        document.getElementById('hint-btn').addEventListener('click', () => this.giveHint());
        document.getElementById('solve-btn').addEventListener('click', () => this.visualSolve());
        document.getElementById('new-game-btn').addEventListener('click', () => {
            this.gamePage.style.display = 'none';
            this.landingPage.style.display = 'flex';
            this.landingPage.classList.add('active');
        });

        // Modal buttons
        document.querySelectorAll('.diff-opt').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('.diff-opt').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                this.difficulty = opt.dataset.diff;
            });
        });

        document.getElementById('start-game-btn').addEventListener('click', () => {
            this.startNewGame();
            document.getElementById('difficulty-modal').classList.remove('active');
        });

        document.getElementById('play-again-btn').addEventListener('click', () => {
            document.getElementById('victory-modal').classList.remove('active');
            this.showDifficultyModal();
        });
    }

    showDifficultyModal() {
        document.getElementById('difficulty-modal').classList.add('active');
    }

    startNewGame() {
        this.logic.setSize(this.gridSize);
        this.createGrid();

        const { puzzle, solution } = this.logic.generateBoard(this.difficulty);
        this.board = puzzle.flat();
        this.solution = solution.flat();
        this.notes = Array(this.gridSize * this.gridSize).fill().map(() => new Set());
        this.history = [];

        this.difficultyDisplay.textContent = this.difficulty.charAt(0).toUpperCase() + this.difficulty.slice(1);
        this.resetTimer();
        this.renderBoard();
        this.startTimer();
    }

    renderBoard() {
        const cells = document.querySelectorAll('.cell');
        this.board.forEach((val, i) => {
            const cell = cells[i];
            cell.textContent = val !== 0 ? val : '';
            cell.className = 'cell';

            // Restore border classes
            const row = Math.floor(i / this.gridSize);
            const col = i % this.gridSize;
            const boxSize = Math.sqrt(this.gridSize);
            if (boxSize > 0 && Number.isInteger(boxSize)) {
                if ((col + 1) % boxSize === 0 && (col + 1) !== this.gridSize) cell.classList.add('border-right');
                if ((row + 1) % boxSize === 0 && (row + 1) !== this.gridSize) cell.classList.add('border-bottom');
            }

            if (val !== 0) {
                cell.classList.add('fixed');
            }

            this.renderNotes(cell, i);
        });
    }

    renderNotes(cell, index) {
        if (this.board[index] !== 0) {
            const notesContainer = cell.querySelector('.notes-container');
            if (notesContainer) notesContainer.remove();
            return;
        }

        let notesContainer = cell.querySelector('.notes-container');
        if (!notesContainer) {
            notesContainer = document.createElement('div');
            notesContainer.classList.add('notes-container');
            cell.appendChild(notesContainer);
        }

        notesContainer.innerHTML = '';
        const currentNotes = this.notes[index];
        for (let n = 1; n <= this.gridSize; n++) {
            const note = document.createElement('div');
            note.classList.add('note');
            if (this.gridSize === 3) note.style.fontSize = '1.2rem';
            note.textContent = currentNotes.has(n.toString()) ? n : '';
            notesContainer.appendChild(note);
        }
    }

    selectCell(cell) {
        if (this.selectedCell) {
            this.selectedCell.classList.remove('selected');
        }
        this.selectedCell = cell;
        this.selectedCell.classList.add('selected');

        this.highlightRelated(cell);
    }

    moveSelection(newIndex) {
        if (newIndex >= 0 && newIndex < (this.gridSize * this.gridSize)) {
            const nextCell = document.querySelector(`.cell[data-index="${newIndex}"]`);
            this.selectCell(nextCell);
        }
    }

    highlightRelated(cell) {
        const index = parseInt(cell.dataset.index);
        const row = Math.floor(index / this.gridSize);
        const col = index % this.gridSize;
        const boxSize = Math.sqrt(this.gridSize);
        const hasBox = boxSize > 0 && Number.isInteger(boxSize);

        const boxRow = hasBox ? Math.floor(row / boxSize) : -1;
        const boxCol = hasBox ? Math.floor(col / boxSize) : -1;
        const val = this.board[index];

        document.querySelectorAll('.cell').forEach((c, idx) => {
            c.classList.remove('highlighted', 'same-num');

            const r = Math.floor(idx / this.gridSize);
            const cl = idx % this.gridSize;

            let inSameBox = false;
            if (hasBox) {
                const br = Math.floor(r / boxSize);
                const bc = Math.floor(cl / boxSize);
                inSameBox = (br === boxRow && bc === boxCol);
            }

            if (r === row || cl === col || inSameBox) {
                c.classList.add('highlighted');
            }

            if (val !== 0 && this.board[idx] === val && idx !== index) {
                c.classList.add('same-num');
            }
        });
    }

    handleNumberInput(num) {
        if (!this.selectedCell) return;
        const index = parseInt(this.selectedCell.dataset.index);

        const originalCell = document.querySelectorAll('.cell')[index];
        if (originalCell.classList.contains('fixed')) return;

        if (this.mode === 'play') {
            this.saveHistory();
            this.board[index] = parseInt(num);
            this.selectedCell.textContent = num === '0' ? '' : num;

            if (num !== '0') {
                this.selectedCell.classList.add('user-filled');
                if (parseInt(num) !== this.solution[index]) {
                    this.selectedCell.classList.add('error');
                } else {
                    this.selectedCell.classList.remove('error');
                    this.checkVictory();
                }
            } else {
                this.selectedCell.classList.remove('user-filled', 'error');
            }

            this.highlightRelated(this.selectedCell);
        } else {
            if (num === '0') {
                this.notes[index].clear();
            } else {
                if (this.notes[index].has(num)) {
                    this.notes[index].delete(num);
                } else {
                    this.notes[index].add(num);
                }
            }
            this.renderNotes(this.selectedCell, index);
        }
    }

    giveHint() {
        if (!this.selectedCell) return;
        const index = parseInt(this.selectedCell.dataset.index);
        if (this.board[index] !== 0) return;

        this.handleNumberInput(this.solution[index].toString());
    }

    async visualSolve() {
        if (this.isSolving) return;
        this.isSolving = true;
        this.saveHistory();

        // Convert flat board to 2D
        let board2D = [];
        for (let i = 0; i < this.gridSize; i++) {
            board2D.push(this.board.slice(i * this.gridSize, (i + 1) * this.gridSize));
        }

        const solveStep = async (board) => {
            let empty = this.logic.findEmpty(board);
            if (!empty) return true;

            let [row, col] = empty;
            let index = row * this.gridSize + col;
            let cell = document.querySelector(`.cell[data-index="${index}"]`);

            for (let num = 1; num <= this.gridSize; num++) {
                if (this.logic.isValid(board, row, col, num)) {
                    board[row][col] = num;
                    this.board[index] = num;
                    cell.textContent = num;
                    cell.classList.add('user-filled', 'solving');

                    await new Promise(r => setTimeout(r, this.gridSize === 9 ? 10 : 100));

                    if (await solveStep(board)) return true;

                    board[row][col] = 0;
                    this.board[index] = 0;
                    cell.textContent = '';
                    cell.classList.remove('solving');
                }
            }
            return false;
        };

        const success = await solveStep(board2D);
        if (success) {
            this.renderBoard();
            this.checkVictory();
        }
        this.isSolving = false;
    }

    saveHistory() {
        this.history.push({
            board: [...this.board],
            notes: this.notes.map(s => new Set(s))
        });
        if (this.history.length > 20) this.history.shift();
    }

    undo() {
        if (this.history.length === 0) return;
        const last = this.history.pop();
        this.board = last.board;
        this.notes = last.notes;
        this.renderBoard();
        if (this.selectedCell) this.highlightRelated(this.selectedCell);
    }

    startTimer() {
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => {
            this.seconds++;
            this.updateTimerDisplay();
        }, 1000);
    }

    resetTimer() {
        if (this.timer) clearInterval(this.timer);
        this.seconds = 0;
        this.updateTimerDisplay();
    }

    updateTimerDisplay() {
        const m = Math.floor(this.seconds / 60).toString().padStart(2, '0');
        const s = (this.seconds % 60).toString().padStart(2, '0');
        this.timerDisplay.textContent = `${m}:${s}`;
    }

    checkVictory() {
        const isComplete = this.board.every((val, i) => val === this.solution[i]);
        if (isComplete) {
            clearInterval(this.timer);
            document.getElementById('final-time').textContent = this.timerDisplay.textContent;
            document.getElementById('victory-modal').classList.add('active');
            
            // Confetti effect
            confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#6366f1', '#a855f7', '#10b981']
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new SudokuApp();
});
