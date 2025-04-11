import express, { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import slugify from "slugify";
import exifr from 'exifr';
import SSEChannel from 'sse-pubsub';

import Faces, { DetectionResult as FaceDetectionResult } from "./face-match";
import judgeImage, { type Result as LLMResult } from "./llm";
import { shuffleArray } from "./util";
import Gallery from "./gallery";
import type { PhotoData, ScoringTest } from "./types";

const PORT = Number(process.env.PORT || 3000);
const ASSETS_PATH = path.join(import.meta.dirname, "assets");
const GALLERY_SIZE = 50;

const app = express();
const faceMatcher = new Faces({
  knownFaces: [
    { name: "Emily", files: [`${ASSETS_PATH}/ref-images/emily1.jpg`, `${ASSETS_PATH}/ref-images/emily2.jpg`, `${ASSETS_PATH}/ref-images/emily3.jpg`] },
    { name: "Rob", files: [`${ASSETS_PATH}/ref-images/rob1.jpg`, `${ASSETS_PATH}/ref-images/rob2.jpg`] },
  ]
})
const channel = new SSEChannel();
const gallery = new Gallery(GALLERY_SIZE, path.join(import.meta.dirname, "../.data/results"));

// Serve static files and uploaded images
app.use(express.static(path.join(import.meta.dirname, '../public')));
app.use('/images', express.static(path.join(import.meta.dirname, '../.data/uploads')));

// Set up storage for uploaded files
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(import.meta.dirname, "../.data/uploads"),
    filename: (req, file, cb) => cb(null, `${slugify(req.body['uploader-name'])}-${Date.now()}-${file.originalname}`),
  })
});

// Handle streaming data endpoint
app.get('/stream', (req, res) => channel.subscribe(req, res));

// Handle random image fetch
app.get('/next-image', (req, res) => {
  res.json(gallery.getNextImage());
});

// Handle raw image requests
// app.get('/images/:filename', (req, res) => {
//   const filePath = path.join(import.meta.dirname, "../.data/uploads", req.params.filename);
//   console.log(filePath);
//   res.sendFile(filePath);
// });

// Handle file upload
app.post("/upload", upload.single("image-file"), async (req: Request, res: Response) => {
  if (!req.file || !req.body['uploader-name']) throw new Error('Missing file or author name');
  console.log(req.body['uploader-name'], req.file.filename);

  // Check file is an image
  // const exifData = await exifr.parse(req.file.path, ['DateTimeOriginal']);
  // const photoDateTime = exifData?.DateTimeOriginal;
  // if (!photoDateTime) {
  //   throw new Error('No DateTimeOriginal found in EXIF metadata, maybe upload is not an image');
  // }

  // // Check photo was taken today
  // const photoDate = new Date(photoDateTime);
  // const now = new Date();
  // const isToday = photoDate.getFullYear() === now.getFullYear() && photoDate.getMonth() === now.getMonth() && photoDate.getDate() === now.getDate();
  // if (!isToday) throw new Error("Photo was not taken today");

  // Check face matcher is ready
  if (!faceMatcher.isReady()) throw new Error('Face matcher is not ready');

  // Respond with acceptance
  res.status(200).json({ filename: req.file.filename });

  // Publish new picture
  channel.publish({ filename: req.file.filename, "uploaderName": req.body['uploader-name'] }, 'newImage');

  // Do face match and judge quality
  const [faceData, llmData] = await Promise.all([
    faceMatcher.matchFaces(req.file.path),
    judgeImage(req.file.path, req.body['uploader-name'])
  ]);
  const photoData: PhotoData = {
    timestamp: new Date(),
    filename: req.file.filename,
    uploaderName: req.body['uploader-name'],
    ...faceData,
    ...llmData,
    scoreMods: []
  };

  // Construct score
  const scoringTests: ScoringTest[] = shuffleArray([
    () => (llmData.numPeople === 0) ? [-3, "There's no-one in it!"] : null,
    () => (llmData.numPeople > 3) ? [1, "Group shot!"] : null,
    () => (llmData.hasBaby) ? [2, "Aw, look at Stanley!"] : null,
    () => (llmData.hasDog) ? [1, "Bonnie always a bonus"] : null,
    () => (llmData.focus >= 0.9) ? [1, "Sharp focus!"] : null,
    () => (llmData.focus < 0.7) ? [-2, "A bit blurry..."] : null,
    () => (llmData.framing >= 0.9) ? [3, "Well framed!"] : null,
    () => (llmData.framing < 0.7) ? [-2, "Dunno about the framing"] : null,
    () => (llmData.lighting >= 0.9) ? [1, "Love the lighting"] : null,
    () => (llmData.lighting < 0.7) ? [-1, "Not great on the lighting"] : null,
    () => (llmData.contrast >= 0.9) ? [1, "Dramatic contrast!"] : null,
    () => (llmData.contrast < 0.7) ? [-1, "A bit washed out?"] : null,
    () => (llmData.happinessScore >= 0.9) ? [3, "Exudes warmth and happiness!"] : null,
    () => (llmData.numPeople > 0 && Object.keys(faceData.knownFacesDetected).length === 0) ? [-2, "Can't you take one that's got Emily or Rob in it?!"] : null,
    () => (faceData.knownFacesDetected.Emily === 'negative') ? [-4, "Emily doesn't look very happy"] : null,
    () => (faceData.knownFacesDetected.Rob === 'negative') ? [-4, "Rob doesn't look very happy"] : null,
    () => (faceData.knownFacesDetected.Emily === 'positive') ? [4, "Emily looks great!"] : null,
    () => (faceData.knownFacesDetected.Rob === 'positive') ? [4, "Fab pic of Rob!"] : null,
  ]);
  while (photoData.scoreMods.length < 4 && scoringTests.length) {
    const nextTest = scoringTests.pop();
    if (nextTest) {
      const result = nextTest();
      if (result) photoData.scoreMods.push(result);
    }
  }
  photoData.finalScore = Math.min(Math.max(photoData.scoreMods.reduce((out, x) => out + x[0], llmData.llmScore), 0), 10);

  // Write result to .data/results
  const dataFilePath = path.join(import.meta.dirname, "../.data/results", req.file.filename + '.json');
  fs.writeFileSync(dataFilePath, JSON.stringify(photoData, null, 2));

  // Publish result to client and dashboard
  channel.publish(photoData, "imageData");
  gallery.addImage(photoData);
  console.log(photoData);
});

app.listen(PORT, () => console.log(`Server up: http://localhost:${PORT}`));
