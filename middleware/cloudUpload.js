import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "lostfound_items",
    allowed_formats: ["jpg", "png", "jpeg"]
  }
});

const upload = multer({ storage });

export default upload;