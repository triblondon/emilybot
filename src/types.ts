import { type DetectionResult as FaceDetectionResult } from "./face-match";
import { type Result as LLMResult } from "./llm";

export type ScoreMod = [number, string]
export type ScoringTest = () => ScoreMod | null;

export type PhotoData = LLMResult & FaceDetectionResult & {
  timestamp: Date,
  filename: string,
  uploaderName: string,
  scoreMods: ScoreMod[],
  finalScore?: number,
}
