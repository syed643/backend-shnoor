// middlewares/uploadPdf.js
import multer from "multer";

const storage = multer.memoryStorage();

const uploadPdf = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

export default uploadPdf;
