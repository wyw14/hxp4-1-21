type Color = 'red' | 'yellow' | 'blue' | 'green';
type GameMode = 'normal' | 'challenge';

const COLORS: Color[] = ['red', 'yellow', 'blue', 'green'];
const COLOR_TO_BITS: Record<Color, string> = {
  red: '00',
  yellow: '01',
  blue: '10',
  green: '11',
};
const BITS_TO_COLOR: Record<string, Color> = {
  '00': 'red',
  '01': 'yellow',
  '10': 'blue',
  '11': 'green',
};

interface HighScoreResponse {
  highScore: number;
  isNewRecord?: boolean;
}

class ColorMemoryGame {
  private sequence: Color[] = [];
  private playerIndex: number = 0;
  private isPlaying: boolean = false;
  private isShowingSequence: boolean = false;
  private level: number = 0;
  private highScore: number = 0;
  private gameMode: GameMode = 'normal';
  private challengeSequence: Color[] | null = null;

  private readonly buttons: NodeListOf<HTMLButtonElement>;
  private readonly startBtn: HTMLButtonElement;
  private readonly currentLevelEl: HTMLElement;
  private readonly highScoreEl: HTMLElement;
  private readonly gameStatusEl: HTMLElement;
  private readonly challengeInput: HTMLInputElement;
  private readonly challengeBtn: HTMLButtonElement;
  private readonly shareSection: HTMLElement;
  private readonly shareText: HTMLElement;
  private readonly copyHint: HTMLElement;

  private readonly lightOnDuration: number = 600;
  private readonly lightOffDuration: number = 300;

  constructor() {
    this.buttons = document.querySelectorAll('.color-btn');
    this.startBtn = document.getElementById('start-btn') as HTMLButtonElement;
    this.currentLevelEl = document.getElementById('current-level') as HTMLElement;
    this.highScoreEl = document.getElementById('high-score') as HTMLElement;
    this.gameStatusEl = document.getElementById('game-status') as HTMLElement;
    this.challengeInput = document.getElementById('challenge-input') as HTMLInputElement;
    this.challengeBtn = document.getElementById('challenge-btn') as HTMLButtonElement;
    this.shareSection = document.getElementById('share-section') as HTMLElement;
    this.shareText = document.getElementById('share-text') as HTMLElement;
    this.copyHint = document.getElementById('copy-hint') as HTMLElement;

    this.init();
  }

  private async init(): Promise<void> {
    this.setupEventListeners();
    await this.fetchHighScore();
  }

  private setupEventListeners(): void {
    this.startBtn.addEventListener('click', () => this.startGame());
    this.challengeBtn.addEventListener('click', () => this.startChallenge());
    this.challengeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.startChallenge();
      }
    });
    this.shareText.addEventListener('click', () => this.copyShareText());

    this.buttons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const color = (e.target as HTMLButtonElement).dataset.color as Color;
        this.handlePlayerInput(color);
      });
    });
  }

  private async fetchHighScore(): Promise<void> {
    try {
      const response = await fetch('/api/highscore');
      const data = await response.json() as HighScoreResponse;
      this.highScore = data.highScore;
      this.highScoreEl.textContent = this.highScore.toString();
    } catch (error) {
      console.error('获取最高分失败:', error);
    }
  }

  private async saveHighScore(score: number): Promise<void> {
    try {
      const response = await fetch('/api/highscore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ score }),
      });
      const data = await response.json() as HighScoreResponse;
      this.highScore = data.highScore;
      this.highScoreEl.textContent = this.highScore.toString();

      if (data.isNewRecord) {
        this.showStatus('🎉 新纪录！', 'success');
      }
    } catch (error) {
      console.error('保存最高分失败:', error);
    }
  }

  private encodeChallenge(sequence: Color[]): string {
    let binary = '';
    for (const color of sequence) {
      binary += COLOR_TO_BITS[color];
    }
    while (binary.length % 8 !== 0) {
      binary += '0';
    }
    let hex = '';
    for (let i = 0; i < binary.length; i += 8) {
      const byte = binary.substring(i, i + 8);
      hex += parseInt(byte, 2).toString(16).padStart(2, '0');
    }
    const lenHex = sequence.length.toString(16).padStart(2, '0');
    const raw = lenHex + hex;
    let checksum = 0;
    for (let i = 0; i < raw.length; i++) {
      checksum = (checksum + parseInt(raw[i], 16)) % 16;
    }
    return (checksum.toString(16) + raw).toUpperCase();
  }

  private decodeChallenge(code: string): Color[] | null {
    try {
      const cleanCode = code.trim().toUpperCase();
      if (cleanCode.length < 3) return null;

      const checksum = parseInt(cleanCode[0], 16);
      const raw = cleanCode.substring(1);
      let calcChecksum = 0;
      for (let i = 0; i < raw.length; i++) {
        calcChecksum = (calcChecksum + parseInt(raw[i], 16)) % 16;
      }
      if (checksum !== calcChecksum) return null;

      const seqLen = parseInt(raw.substring(0, 2), 16);
      if (seqLen < 1 || seqLen > 100) return null;

      const hexData = raw.substring(2);
      let binary = '';
      for (let i = 0; i < hexData.length; i += 2) {
        const byte = parseInt(hexData.substring(i, i + 2), 16);
        binary += byte.toString(2).padStart(8, '0');
      }

      const sequence: Color[] = [];
      for (let i = 0; i < seqLen * 2; i += 2) {
        const bits = binary.substring(i, i + 2);
        const color = BITS_TO_COLOR[bits];
        if (!color) return null;
        sequence.push(color);
      }
      return sequence;
    } catch {
      return null;
    }
  }

  private startGame(): void {
    this.gameMode = 'normal';
    this.challengeSequence = null;
    this.sequence = [];
    this.playerIndex = 0;
    this.level = 0;
    this.isPlaying = true;
    this.currentLevelEl.textContent = '0';

    this.shareSection.classList.add('hidden');
    this.shareText.classList.remove('copied');
    this.copyHint.classList.remove('copied');
    this.copyHint.textContent = '点击上方文字复制';

    this.setButtonsDisabled(true);
    this.startBtn.disabled = true;
    this.challengeBtn.disabled = true;
    this.challengeInput.disabled = true;

    this.showStatus('游戏开始！', 'playing');
    this.nextRound();
  }

  private startChallenge(): void {
    const code = this.challengeInput.value.trim();
    if (!code) {
      this.showStatus('请输入挑战码', 'gameover');
      return;
    }

    const sequence = this.decodeChallenge(code);
    if (!sequence) {
      this.showStatus('无效的挑战码', 'gameover');
      return;
    }

    this.gameMode = 'challenge';
    this.challengeSequence = sequence;
    this.sequence = [];
    this.playerIndex = 0;
    this.level = 0;
    this.isPlaying = true;
    this.currentLevelEl.textContent = '0';

    this.shareSection.classList.add('hidden');
    this.shareText.classList.remove('copied');
    this.copyHint.classList.remove('copied');
    this.copyHint.textContent = '点击上方文字复制';

    this.setButtonsDisabled(true);
    this.startBtn.disabled = true;
    this.challengeBtn.disabled = true;
    this.challengeInput.disabled = true;

    this.showStatus(`挑战开始！共 ${sequence.length} 关`, 'playing');
    this.nextRound();
  }

  private nextRound(): void {
    this.level++;
    this.currentLevelEl.textContent = this.level.toString();
    this.playerIndex = 0;

    if (this.gameMode === 'challenge' && this.challengeSequence) {
      this.sequence = this.challengeSequence.slice(0, this.level);
    } else {
      const randomColor = COLORS[Math.floor(Math.random() * COLORS.length)];
      this.sequence.push(randomColor);
    }

    if (this.gameMode === 'challenge' && this.challengeSequence && this.level > this.challengeSequence.length) {
      this.gameOver(true);
      return;
    }

    this.showStatus(`第 ${this.level} 关 - 记住序列`, 'playing');
    this.showSequence();
  }

  private async showSequence(): Promise<void> {
    this.isShowingSequence = true;
    this.setButtonsDisabled(true);

    await this.delay(500);

    for (let i = 0; i < this.sequence.length; i++) {
      const color = this.sequence[i];
      await this.lightUpButton(color);

      if (i < this.sequence.length - 1) {
        await this.delay(this.lightOffDuration);
      }
    }

    this.isShowingSequence = false;
    this.setButtonsDisabled(false);
    this.showStatus('请按顺序点击按钮', 'playing');
  }

  private async lightUpButton(color: Color): Promise<void> {
    const button = this.getButtonByColor(color);
    if (!button) return;

    button.classList.add('active');
    await this.delay(this.lightOnDuration);
    button.classList.remove('active');
  }

  private getButtonByColor(color: Color): HTMLButtonElement | null {
    return document.querySelector(`.color-btn[data-color="${color}"]`);
  }

  private async handlePlayerInput(color: Color): Promise<void> {
    if (!this.isPlaying || this.isShowingSequence) return;

    const expectedColor = this.sequence[this.playerIndex];
    const button = this.getButtonByColor(color);

    if (color === expectedColor) {
      button?.classList.add('correct');
      await this.delay(200);
      button?.classList.remove('correct');

      this.playerIndex++;

      if (this.playerIndex === this.sequence.length) {
        if (this.gameMode === 'challenge' && this.challengeSequence && this.level >= this.challengeSequence.length) {
          this.showStatus('🎉 挑战通关！', 'success');
          this.setButtonsDisabled(true);
          await this.delay(1500);
          this.gameOver(true);
        } else {
          this.showStatus('正确！准备下一关...', 'success');
          this.setButtonsDisabled(true);
          await this.delay(1000);
          this.nextRound();
        }
      }
    } else {
      button?.classList.add('wrong');
      await this.delay(500);
      button?.classList.remove('wrong');

      this.gameOver(false);
    }
  }

  private async gameOver(isWin: boolean = false): Promise<void> {
    this.isPlaying = false;
    this.setButtonsDisabled(true);
    this.startBtn.disabled = false;
    this.challengeBtn.disabled = false;
    this.challengeInput.disabled = false;

    const finalScore = this.level - 1;
    const modeText = this.gameMode === 'challenge' ? '挑战模式' : '普通模式';

    if (isWin && this.gameMode === 'challenge') {
      this.showStatus(`🎉 挑战通关！你完成了全部 ${finalScore + 1} 关`, 'success');
    } else if (this.gameMode === 'challenge') {
      this.showStatus(`挑战结束！你在第 ${this.level} 关失败`, 'gameover');
    } else {
      this.showStatus(`游戏结束！你完成了 ${finalScore} 关`, 'gameover');
    }

    if (this.gameMode === 'normal' && finalScore > this.highScore) {
      await this.saveHighScore(finalScore);
    }

    const shareSequence = this.gameMode === 'challenge' && this.challengeSequence
      ? this.challengeSequence
      : this.sequence.slice(0, Math.max(1, finalScore + 1));
    const challengeCode = this.encodeChallenge(shareSequence);
    const totalLevels = this.gameMode === 'challenge' && this.challengeSequence
      ? this.challengeSequence.length
      : finalScore + 1;

    const shareContent =
      `【色彩记忆挑战】\n` +
      `模式：${modeText}\n` +
      `关卡：${finalScore + (isWin ? 1 : 0)}/${totalLevels}\n` +
      `挑战码：${challengeCode}\n` +
      `成绩：${finalScore} 关${isWin ? '（全部通关）' : ''}`;

    this.shareText.textContent = shareContent;
    this.shareSection.classList.remove('hidden');
  }

  private async copyShareText(): Promise<void> {
    const text = this.shareText.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
      this.shareText.classList.add('copied');
      this.copyHint.classList.add('copied');
      this.copyHint.textContent = '✓ 已复制到剪贴板';

      setTimeout(() => {
        this.shareText.classList.remove('copied');
        this.copyHint.classList.remove('copied');
        this.copyHint.textContent = '点击上方文字复制';
      }, 2000);
    } catch (error) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);

      this.shareText.classList.add('copied');
      this.copyHint.classList.add('copied');
      this.copyHint.textContent = '✓ 已复制到剪贴板';

      setTimeout(() => {
        this.shareText.classList.remove('copied');
        this.copyHint.classList.remove('copied');
        this.copyHint.textContent = '点击上方文字复制';
      }, 2000);
    }
  }

  private setButtonsDisabled(disabled: boolean): void {
    this.buttons.forEach(btn => {
      btn.disabled = disabled;
    });
  }

  private showStatus(message: string, type: 'playing' | 'gameover' | 'success' | '' = ''): void {
    this.gameStatusEl.textContent = message;
    this.gameStatusEl.className = 'game-status';
    if (type) {
      this.gameStatusEl.classList.add(type);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

new ColorMemoryGame();
