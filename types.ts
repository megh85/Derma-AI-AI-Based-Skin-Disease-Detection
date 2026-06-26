export interface AnalysisResult {
  conditionName: string;
  confidence: number;
  description: string;
  symptoms: string[];
  recommendations: string[];
  urgency: 'Low' | 'Moderate' | 'High' | 'Emergency';
  disclaimer: string;
}

export const SKIN_DISEASES = [
  'Acne',
  'Eczema',
  'Psoriasis',
  'Melanoma',
  'Ringworm',
  'Rosacea',
  'Hives',
  'Warts'
];
