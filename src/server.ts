import express, { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

import Faces from "./face-match";
import judgeImage from "./llm";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const faceMatcher = new Faces({
  knownFaces: [
    { name: "Emily", files: [path.join(__dirname, "./assets/ref-images/emily.jpg")] },
    { name: "Rob", files: [path.join(__dirname, "./assets/ref-images/rob.jpg")] },
  ]
})

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Set up storage for uploaded files
const uploadDir = path.join(__dirname, "../.data/uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

// Handle file upload
app.post("/upload", upload.single("file"), (req: Request, res: Response) => {
  console.log(req.file);
  // TODO: check file is an image
  // TODO: check photo was taken today
  // TODO: check face matcher is ready
  // TODO: Respond with acceptance
  res.status(200).send();
  // TODO: Publish new picture
  // TODO: do face match and judgement
  // TODO: write result to .data/results
  // TODO: publish result to client and dashboard
});

app.listen(PORT, () => console.log(`Server up: http://localhost:${PORT}`));
