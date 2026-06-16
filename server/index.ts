import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

interface ScoreData {
  highScore: number;
}

const app = express();
const PORT = 42021;
const DATA_FILE = path.join(process.cwd(), 'server', 'data', 'scores.json');

app.use(cors());
app.use(express.json());

const readScoreData = (): ScoreData => {
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(raw);
};

const writeScoreData = (data: ScoreData): void => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
};

app.get('/api/highscore', (_req, res) => {
  try {
    const data = readScoreData();
    res.json({ highScore: data.highScore });
  } catch (error) {
    res.status(500).json({ error: '读取分数失败' });
  }
});

app.post('/api/highscore', (req, res) => {
  try {
    const { score } = req.body as { score?: number };

    if (typeof score !== 'number' || score < 0) {
      return res.status(400).json({ error: '无效的分数' });
    }

    const data = readScoreData();
    
    if (score > data.highScore) {
      data.highScore = score;
      writeScoreData(data);
      res.json({ highScore: data.highScore, isNewRecord: true });
    } else {
      res.json({ highScore: data.highScore, isNewRecord: false });
    }
  } catch (error) {
    res.status(500).json({ error: '保存分数失败' });
  }
});

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
