import slugify from "slugify";
import multer from "multer";
import fs from "fs";

export const getUploaderMiddleWare = (uploadDestPath: string) => {
  if (!fs.existsSync(uploadDestPath)) {
    fs.mkdirSync(uploadDestPath);
  }
  const storage = multer.diskStorage({
    destination: uploadDestPath,
    filename: (req, file, cb) => {
      //req.body.
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  });
  return multer({ storage });
}