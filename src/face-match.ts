// Does not seem to work
//import '@tensorflow/tfjs-node';

import path from "path";

// implements nodejs wrappers for HTMLCanvasElement, HTMLImageElement, ImageData
import * as canvas from 'canvas';
import * as faceapi from 'face-api.js';

type ReferenceFace = {
  name: string,
  files: string[]
};
type DetectedFace = {
  name: string;
  expressions: faceapi.FaceExpressions;
}
interface Options {
  knownFaces: ReferenceFace[];
}
interface DetectionResult {
  facesDetectedCount: number;
  knownFacesDetected: DetectedFace[];
}

const MIN_CONFIDENCE = 0.4;
const FACE_DETECT_OPTIONS = new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_CONFIDENCE })


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

  async init(knownFaces: ReferenceFace[]) {

    const faceDetectionNet = faceapi.nets.ssdMobilenetv1
    await faceDetectionNet.loadFromDisk('./src/assets/weights');
    await faceapi.nets.faceLandmark68Net.loadFromDisk('./src/assets/weights');
    await faceapi.nets.faceRecognitionNet.loadFromDisk('./src/assets/weights');
    await faceapi.nets.ageGenderNet.loadFromDisk('./src/assets/weights');
    await faceapi.nets.faceExpressionNet.loadFromDisk('./src/assets/weights')

    this.#faces = await Promise.all(knownFaces.map(async face => {
      const descriptors = [];
      for (const filePath in face.files) {
        const refImage: any = await canvas.loadImage(filePath);
        const detection = await faceapi
          .detectSingleFace(refImage, FACE_DETECT_OPTIONS)
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (detection) {
          descriptors.push(detection.descriptor);
        }
      }
      return new faceapi.LabeledFaceDescriptors(face.name, descriptors);
    }));
  }

  async matchFaces(queryImagePath: string): Promise<DetectionResult> {
    if (this.#readyState !== "ready") throw new Error('Not ready');
    
    const queryImage: any = await canvas.loadImage(queryImagePath)
    const queryImageFaces = await faceapi.detectAllFaces(queryImage, FACE_DETECT_OPTIONS)
      .withFaceLandmarks().withFaceDescriptors().withAgeAndGender().withFaceExpressions();
    const faceMatcher = new faceapi.FaceMatcher(this.#faces, MIN_CONFIDENCE);
    
    return {
      facesDetectedCount: queryImageFaces.length,
      knownFacesDetected: queryImageFaces.reduce<DetectedFace[]>((out, faceDetection) => {
        const match = faceMatcher.findBestMatch(faceDetection.descriptor);
        if (match.label !== "unknown") {
          out.push({ name: match.label, expressions: faceDetection.expressions })
        }
        return out;
      }, [])
    }    
  }
}

