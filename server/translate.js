import express from 'express';
import { Translate } from '@google-cloud/translate/build/src/v2/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Google Cloud Translation API 클라이언트 초기화
let translate;

try {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    // 배포 환경: 환경 변수에서 JSON 키 읽기
    const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    translate = new Translate({ credentials });
    console.log('Google Cloud Translation API 초기화 완료 (환경 변수)');
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // 로컬 환경: 파일 경로 사용
    translate = new Translate();
    console.log('Google Cloud Translation API 초기화 완료 (파일 경로)');
  } else {
    // 키 파일이 있는 경우 (로컬 개발용)
    const keyFilePath = path.join(__dirname, '..', 'vigilant-walker-460406-i8-1fba3047567f.json');
    if (fs.existsSync(keyFilePath)) {
      translate = new Translate({ keyFilename: keyFilePath });
      console.log('Google Cloud Translation API 초기화 완료 (로컬 키 파일)');
    } else {
      throw new Error('Google Cloud 인증 정보를 찾을 수 없습니다.');
    }
  }
} catch (error) {
  console.error('Google Cloud Translation API 초기화 실패:', error);
}

// 번역 엔드포인트
router.post('/translate', async (req, res) => {
    try {
        if (!translate) {
            return res.status(500).json({ 
                error: 'Google Cloud Translation API가 초기화되지 않았습니다.' 
            });
        }

        const { text, targetLanguage = 'ko', sourceLanguage = 'auto' } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: '번역할 텍스트를 입력해주세요.' });
        }

        console.log(`번역 요청: "${text}" -> ${targetLanguage}`);

        // Google Cloud Translation API 호출
        const [translation] = await translate.translate(text, {
            from: sourceLanguage === 'auto' ? undefined : sourceLanguage,
            to: targetLanguage
        });

        // 원본 언어 감지
        const [detection] = await translate.detect(text);
        
        const result = {
            originalText: text,
            translatedText: translation,
            sourceLanguage: detection.language,
            targetLanguage: targetLanguage,
            confidence: detection.confidence
        };

        console.log('번역 완료:', result);
        res.json(result);

    } catch (error) {
        console.error('번역 오류:', error);
        res.status(500).json({ 
            error: '번역 중 오류가 발생했습니다.',
            details: error.message 
        });
    }
});

// 지원 언어 목록 조회
router.get('/languages', async (req, res) => {
    try {
        if (!translate) {
            return res.status(500).json({ 
                error: 'Google Cloud Translation API가 초기화되지 않았습니다.' 
            });
        }

        const [languages] = await translate.getLanguages('ko');
        res.json(languages);
    } catch (error) {
        console.error('언어 목록 조회 오류:', error);
        res.status(500).json({ error: '언어 목록을 가져올 수 없습니다.' });
    }
});

export default router;
