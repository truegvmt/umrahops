// @ts-nocheck
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface RiskAssessment {
  travelerId: string;
  riskScore: number;
  riskReason: string;
}

interface TravelerFeatures {
  id: string;
  passportHash: string; // SHA-256 hash, NOT raw passport
  ageRange: string; // e.g., "30-40", "60-70"
  missingFieldsCount: number;
  nationalityRiskLevel?: string; // Optional: based on historical data
}

interface CachedResult {
  riskScore: number;
  riskReason: string;
  timestamp: number;
}

export class AIService {
  private apiKey: string | undefined;
  private model: string;
  private maxBatchSize: number;
  private cacheDir: string;
  private cache: Map<string, CachedResult>;
  private cacheTTL: number = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this.maxBatchSize = parseInt(process.env.OPENAI_MAX_BATCH_SIZE || '50');
    this.cacheDir = path.join(process.cwd(), 'ai', 'cache');
    this.cache = new Map();

    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    this.loadCache();
  }

  /**
   * Load cache from disk
   */
  private loadCache() {
    const cacheFile = path.join(this.cacheDir, 'risk_cache.json');

    if (fs.existsSync(cacheFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        this.cache = new Map(Object.entries(data));
      } catch (error) {
        console.warn('Failed to load AI cache:', error);
      }
    }
  }

  /**
   * Save cache to disk
   */
  private saveCache() {
    const cacheFile = path.join(this.cacheDir, 'risk_cache.json');
    const data = Object.fromEntries(this.cache);

    try {
      fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('Failed to save AI cache:', error);
    }
  }

  /**
   * Generate fingerprint for caching (from hashed features only)
   */
  private generateFingerprint(features: TravelerFeatures): string {
    const str = `${features.passportHash}:${features.ageRange}:${features.missingFieldsCount}:${features.nationalityRiskLevel || ''}`;
    return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
  }

  /**
   * Get from cache if valid
   */
  private getFromCache(fingerprint: string): CachedResult | null {
    const cached = this.cache.get(fingerprint);

    if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
      return cached;
    }

    return null;
  }

  /**
   * Assess risk for a single traveler (mock or real)
   */
  async assessRisk(features: TravelerFeatures): Promise<RiskAssessment> {
    const fingerprint = this.generateFingerprint(features);

    // Check cache first
    const cached = this.getFromCache(fingerprint);
    if (cached) {
      console.log(`✅ Cache hit for traveler ${features.id}`);
      return {
        travelerId: features.id,
        riskScore: cached.riskScore,
        riskReason: cached.riskReason,
      };
    }

    // MOCK MODE if no API key
    if (!this.apiKey) {
      return this.mockAssessment(features);
    }

    // Real OpenAI call
    try {
      const result = await this.callOpenAI([features]);
      const assessment = result[0];

      // Cache result
      this.cache.set(fingerprint, {
        riskScore: assessment.riskScore,
        riskReason: assessment.riskReason,
        timestamp: Date.now(),
      });
      this.saveCache();

      return assessment;
    } catch (error: any) {
      console.error(`❌ OpenAI error for traveler ${features.id}:`, error.message);
      // Fallback to mock on error
      return this.mockAssessment(features);
    }
  }

  /**
   * Batch assess risk for multiple travelers (efficient)
   */
  async assessBatch(featuresList: TravelerFeatures[]): Promise<RiskAssessment[]> {
    if (!this.apiKey) {
      console.log('⚠️  Running in MOCK MODE (no OpenAI key)');
      return featuresList.map(f => this.mockAssessment(f));
    }

    const batches: TravelerFeatures[][] = [];
    for (let i = 0; i < featuresList.length; i += this.maxBatchSize) {
      batches.push(featuresList.slice(i, i + this.maxBatchSize));
    }

    const results: RiskAssessment[] = [];

    for (const batch of batches) {
      // Check cache for each
      const uncached: TravelerFeatures[] = [];
      const cachedResults: RiskAssessment[] = [];

      for (const features of batch) {
        const fingerprint = this.generateFingerprint(features);
        const cached = this.getFromCache(fingerprint);

        if (cached) {
          cachedResults.push({
            travelerId: features.id,
            riskScore: cached.riskScore,
            riskReason: cached.riskReason,
          });
        } else {
          uncached.push(features);
        }
      }

      console.log(`📦 Batch: ${cachedResults.length} cached, ${uncached.length} new calls`);

      // Call API for uncached
      if (uncached.length > 0) {
        try {
          const batchResults = await this.callOpenAI(uncached);

          // Cache results
          for (let i = 0; i < uncached.length; i++) {
            const fingerprint = this.generateFingerprint(uncached[i]);
            this.cache.set(fingerprint, {
              riskScore: batchResults[i].riskScore,
              riskReason: batchResults[i].riskReason,
              timestamp: Date.now(),
            });
          }
          this.saveCache();

          results.push(...batchResults);
        } catch (error: any) {
          console.error('❌ Batch API call failed:', error.message);
          // Fallback to mock for failed batch
          results.push(...uncached.map(f => this.mockAssessment(f)));
        }
      }

      results.push(...cachedResults);
    }

    return results;
  }

  /**
   * Call OpenAI API with retry logic
   */
  private async callOpenAI(featuresList: TravelerFeatures[], retries = 3): Promise<RiskAssessment[]> {
    const prompt = this.buildPrompt(featuresList);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: 'You are a risk assessment AI for Umrah travel operations. Analyze traveler features and return risk scores (0-100) with brief reasons. NEVER request or expect raw passport numbers or PII.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 500,
        }),
      });

      if (response.status === 429) {
        // Rate limit - wait and retry
        if (retries > 0) {
          const retryAfter = parseInt(response.headers.get('retry-after') || '5');
          console.warn(`⚠️  Rate limit hit. Retrying in ${retryAfter}s...`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          return this.callOpenAI(featuresList, retries - 1);
        } else {
          throw new Error('Rate limit exceeded, max retries');
        }
      }

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return this.parseOpenAIResponse(data.choices[0].message.content, featuresList);

    } catch (error: any) {
      if (retries > 0 && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT')) {
        console.warn(`⚠️  Network error. Retrying... (${retries} left)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.callOpenAI(featuresList, retries - 1);
      }

      throw error;
    }
  }

  /**
   * Build prompt for OpenAI (PII-safe)
   */
  private buildPrompt(featuresList: TravelerFeatures[]): string {
    const entries = featuresList.map((f, i) =>
      `Traveler ${i + 1}: Age ${f.ageRange}, Missing fields: ${f.missingFieldsCount}, Passport hash: ${f.passportHash.substring(0, 8)}...`
    ).join('\n');

    return `Assess risk for the following Umrah travelers based on anonymized features. Return JSON array with riskScore (0-100) and riskReason for each:\n\n${entries}\n\nFormat: [{"riskScore": 0-100, "riskReason": "brief explanation"}]`;
  }

  /**
   * Parse OpenAI JSON response
   */
  private parseOpenAIResponse(content: string, featuresList: TravelerFeatures[]): RiskAssessment[] {
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/) || content.match(/(\[[\s\S]*?\])/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;

      const parsed = JSON.parse(jsonStr);

      return featuresList.map((f, i) => ({
        travelerId: f.id,
        riskScore: parsed[i]?.riskScore || 0,
        riskReason: parsed[i]?.riskReason || 'Unknown',
      }));
    } catch (error) {
      console.error('Failed to parse OpenAI response:', error);
      return featuresList.map(f => this.mockAssessment(f));
    }
  }

  /**
   * Mock assessment (deterministic, no API)
   */
  private mockAssessment(features: TravelerFeatures): RiskAssessment {
    let score = 10; // Base low risk
    const reasons: string[] = [];

    // Age risk
    if (features.ageRange.includes('70') || features.ageRange.includes('80')) {
      score += 30;
      reasons.push('Senior age group');
    }

    // Missing fields risk
    if (features.missingFieldsCount > 3) {
      score += 40;
      reasons.push(`${features.missingFieldsCount} missing fields`);
    } else if (features.missingFieldsCount > 0) {
      score += 15;
      reasons.push(`${features.missingFieldsCount} missing fields`);
    }

    // Nationality risk (example)
    if (features.nationalityRiskLevel === 'high') {
      score += 25;
      reasons.push('High-risk nationality profile');
    }

    const riskReason = reasons.length > 0
      ? `Mock: ${reasons.join(', ')}`
      : 'Mock: Low risk profile';

    return {
      travelerId: features.id,
      riskScore: Math.min(score, 100),
      riskReason,
    };
  }
}

export const aiService = new AIService();

