const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { authenticate } = require("../middleware/auth");

const prisma = new PrismaClient();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, "/app/uploads"),
  filename: (_req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".docx"];
    const ext = path.extname(file.originalname).toLowerCase();
    allowed.includes(ext) ? cb(null, true) : cb(new Error("Only PDF and DOCX allowed"));
  },
});

router.post("/cv", authenticate, upload.single("cv"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  await prisma.cvFile.updateMany({
    where: { userId: req.user.id, active: true },
    data: { active: false },
  });

  const cv = await prisma.cvFile.create({
    data: {
      userId: req.user.id,
      filename: req.file.originalname,
      path: req.file.path,
      active: true,
    },
  });

  res.status(201).json({ cv });
});

router.get("/cv", authenticate, async (req, res) => {
  const files = await prisma.cvFile.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
  });
  res.json({ files });
});

module.exports = router;
