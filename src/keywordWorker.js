// keywordWorker.js
// 메시지 리스너
self.addEventListener('message', async (event) => {
    const { type, data } = event.data;
    
    if (type === 'EXTRACT_KEYWORDS') {
      try {
        // 진행률 시작 (10%)
        self.postMessage({
          type: 'LOADING_PROGRESS',
          progress: { progress: 0.1 }
        });
  
        const keywords = await extractAdvancedKeywords(data.messages);
        
        // 완료
        self.postMessage({
          type: 'KEYWORDS_EXTRACTED',
          keywords: keywords
        });
      } catch (error) {
        console.error('키워드 추출 오류:', error);
        self.postMessage({
          type: 'EXTRACTION_ERROR',
          error: error.message
        });
      }
    }
  });
  
  // TF-IDF + N-gram 기반 고급 키워드 추출
  async function extractAdvancedKeywords(messages) {
    console.log('받은 메시지 수:', messages.length);
    
    // 진행률 업데이트 (20%)
    self.postMessage({
      type: 'LOADING_PROGRESS',
      progress: { progress: 0.2 }
    });
  
    // 1. 문서 전처리
    const documents = messages.slice(0, 100).map(msg => {
      if (!msg.content) return '';
      return msg.content
        .toLowerCase()
        .replace(/[^a-zA-Z가-힣 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }).filter(doc => doc.length > 0);
  
    if (documents.length === 0) return [];
  
    // 진행률 업데이트 (40%)
    self.postMessage({
      type: 'LOADING_PROGRESS',
      progress: { progress: 0.4 }
    });
  
    // 2. TF-IDF 계산
    const tfidfResults = calculateTFIDF(documents);
    
    // 진행률 업데이트 (60%)
    self.postMessage({
      type: 'LOADING_PROGRESS',
      progress: { progress: 0.6 }
    });
  
    // 3. N-gram 추출
    const ngramResults = extractNGrams(documents);
    
    // 진행률 업데이트 (80%)
    self.postMessage({
      type: 'LOADING_PROGRESS',
      progress: { progress: 0.8 }
    });
  
    // 4. 사이버 보안 도메인 점수 적용
    const domainResults = applyDomainScoring(tfidfResults, ngramResults);
    
    // 진행률 업데이트 (90%)
    self.postMessage({
      type: 'LOADING_PROGRESS',
      progress: { progress: 0.9 }
    });
  
    // 5. 최종 결과 정리
    const finalResults = domainResults
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(item => ({
        text: item.keyword,
        value: Math.round(item.score * 10)
      }));
  
    console.log('TF-IDF + N-gram 결과:', finalResults);
    
    // 완료 진행률 (100%)
    self.postMessage({
      type: 'LOADING_PROGRESS',
      progress: { progress: 1.0 }
    });
  
    return finalResults;
  }
  
  // TF-IDF 계산 함수
  function calculateTFIDF(documents) {
    const stopwords = new Set([
      "the", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
      "do", "does", "did", "will", "would", "could", "should", "can", "must",
      "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "with", "by", "of", "from",
      "가", "이", "은", "는", "을", "를", "에", "의", "도", "로", "과", "와"
    ]);
  
    // 1. 단어 빈도 계산 (TF)
    const termFreq = {};
    const docFreq = {};
    const totalDocs = documents.length;
  
    documents.forEach((doc, docIndex) => {
      const words = doc.split(' ').filter(word => 
        word.length >= 3 && 
        !stopwords.has(word) &&
        !/^\d+$/.test(word)
      );
      
      const wordCount = {};
      words.forEach(word => {
        wordCount[word] = (wordCount[word] || 0) + 1;
      });
  
      // TF 계산
      const maxFreq = Math.max(...Object.values(wordCount));
      Object.keys(wordCount).forEach(word => {
        if (!termFreq[word]) termFreq[word] = [];
        termFreq[word][docIndex] = wordCount[word] / maxFreq;
      });
  
      // DF 계산
      Object.keys(wordCount).forEach(word => {
        docFreq[word] = (docFreq[word] || 0) + 1;
      });
    });
  
    // 2. TF-IDF 계산
    const tfidfScores = {};
    Object.keys(termFreq).forEach(word => {
      const idf = Math.log(totalDocs / docFreq[word]);
      const tfSum = termFreq[word].reduce((sum, tf) => sum + (tf || 0), 0);
      tfidfScores[word] = tfSum * idf;
    });
  
    return Object.entries(tfidfScores)
      .map(([keyword, score]) => ({ keyword, score, type: 'tfidf' }))
      .filter(item => item.score > 0);
  }
  
  // N-gram 추출 함수
  function extractNGrams(documents) {
    const ngramFreq = {};
    
    documents.forEach(doc => {
      const words = doc.split(' ').filter(word => word.length >= 3);
      
      // 2-gram 추출
      for (let i = 0; i < words.length - 1; i++) {
        const bigram = `${words[i]} ${words[i + 1]}`;
        if (bigram.length > 6) { // 의미있는 길이만
          ngramFreq[bigram] = (ngramFreq[bigram] || 0) + 1;
        }
      }
      
      // 3-gram 추출
      for (let i = 0; i < words.length - 2; i++) {
        const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
        if (trigram.length > 10) { // 의미있는 길이만
          ngramFreq[trigram] = (ngramFreq[trigram] || 0) + 1;
        }
      }
    });
  
    return Object.entries(ngramFreq)
      .filter(([ngram, freq]) => freq >= 2) // 최소 2번 이상 출현
      .map(([keyword, freq]) => ({ 
        keyword, 
        score: freq / documents.length, 
        type: 'ngram' 
      }));
  }
  
  // 사이버 보안 도메인 점수 적용
  function applyDomainScoring(tfidfResults, ngramResults) {
    const securityKeywords = new Set([
      'malware', 'ransomware', 'phishing', 'vulnerability', 'exploit', 'breach',
      'attack', 'threat', 'backdoor', 'trojan', 'virus', 'botnet', 'ddos',
      'injection', 'credential', 'password', 'authentication', 'encryption',
      'hack', 'hacker', 'hacking', 'leak', 'stolen', 'compromised',
      'zero-day', 'apt', 'spyware', 'adware', 'rootkit', 'keylogger',
      'database', 'server', 'network', 'firewall', 'vpn', 'ssl', 'tls'
    ]);
  
    const allResults = [...tfidfResults, ...ngramResults];
    
    return allResults.map(item => {
      let multiplier = 1;
      
      // 사이버 보안 키워드 가중치
      const words = item.keyword.toLowerCase().split(' ');
      const hasSecurityTerm = words.some(word => securityKeywords.has(word));
      if (hasSecurityTerm) multiplier *= 2.5;
      
      // N-gram 가중치 (구문이 더 의미있음)
      if (item.type === 'ngram') multiplier *= 1.5;
      
      // 길이 기반 가중치
      if (item.keyword.length >= 10) multiplier *= 1.2;
      
      return {
        ...item,
        score: item.score * multiplier
      };
    });
  }
  