// Does not seem to work
//import '@tensorflow/tfjs-node';

import slugify from 'slugify';

// implements nodejs wrappers for HTMLCanvasElement, HTMLImageElement, ImageData
import * as canvas from 'canvas';
import * as faceapi from 'face-api.js';

export type ReferenceFace = {
  name: string,
  files: string[]
};
export type ExpressionSentiment = 'positive' | 'negative' | 'neutral';
export type DetectedFaces = Record<string, ExpressionSentiment>;
export interface Options {
  knownFaces: ReferenceFace[];
}
export interface DetectionResult {
  facesDetectedCount: number;
  knownFacesDetected: DetectedFaces
}

const MIN_DETECTION_CONFIDENCE = 0.4;
const MATCHING_DISTANCE = 0.6;
const FACE_DETECT_OPTIONS = new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_DETECTION_CONFIDENCE })

function getDominantExpressionSentiment(expressions: faceapi.FaceExpressions): ExpressionSentiment {
  const expr = (Object.keys(expressions) as (keyof faceapi.FaceExpressions)[]).reduce((a, b) =>
    expressions[a] > expressions[b] ? a : b
  );
  if (['sad', 'angry', 'fearful', 'disgusted'].includes(expr)) return 'negative';
  if (['happy', 'surprised'].includes(expr)) return 'positive';
  return 'neutral';
}

// patch nodejs environment, we need to provide an implementation of
// HTMLCanvasElement and HTMLImageElement
const { Canvas, Image, ImageData } = canvas
faceapi.env.monkeyPatch({
  Canvas: Canvas as any,
  Image: Image as any,
  ImageData: ImageData as any
})

export default class Faces {

  #faces: faceapi.LabeledFaceDescriptors[] | undefined;
  #readyState: "loading" | "ready";

  constructor(options: Options) {
    this.#readyState = "loading";
    this.init(options.knownFaces).then(() => {
      this.#readyState = "ready";
    });
  }

  isReady(): boolean {
    return this.#readyState === "ready";
  }

  async init(knownFaces: ReferenceFace[]) {

    const faceDetectionNet = faceapi.nets.ssdMobilenetv1
    await faceDetectionNet.loadFromDisk('./src/assets/weights');
    await faceapi.nets.faceLandmark68Net.loadFromDisk('./src/assets/weights');
    await faceapi.nets.faceRecognitionNet.loadFromDisk('./src/assets/weights');
    await faceapi.nets.ageGenderNet.loadFromDisk('./src/assets/weights');
    await faceapi.nets.faceExpressionNet.loadFromDisk('./src/assets/weights')

    this.#faces = await Promise.all(knownFaces.map(async face => {
      const descriptors = [];
      for (const filePath of face.files) {
        const refImage: any = await canvas.loadImage(filePath);
        const detection = await faceapi
          .detectSingleFace(refImage, FACE_DETECT_OPTIONS)
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (detection) {
          descriptors.push(detection.descriptor);
        }
      }
      console.log('Face recognition ready', face.name);
      return new faceapi.LabeledFaceDescriptors(face.name, descriptors);
    }));
  }

  async matchFaces(queryImagePath: string): Promise<DetectionResult> {
    if (this.#readyState !== "ready") throw new Error('Not ready');

    const queryImage: any = await canvas.loadImage(queryImagePath)
    const queryImageFaces = await faceapi.detectAllFaces(queryImage, FACE_DETECT_OPTIONS)
      .withFaceLandmarks().withFaceDescriptors().withAgeAndGender().withFaceExpressions();
    const faceMatcher = new faceapi.FaceMatcher(this.#faces, MATCHING_DISTANCE);
    
    const result: DetectionResult = {
      facesDetectedCount: queryImageFaces.length,
      knownFacesDetected: queryImageFaces.reduce<DetectedFaces>((out, faceDetection) => {
        const match = faceMatcher.findBestMatch(faceDetection.descriptor);
        if (match.label !== "unknown") {
          out[slugify(match.label)] = getDominantExpressionSentiment(faceDetection.expressions);
        }
        return out;
      }, {})
    }
    //console.log(result);
    return result;
  }
}

