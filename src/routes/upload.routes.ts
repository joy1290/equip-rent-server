
import { Router } from "express";
import { verifyToken } from "../middlewares/auth.middleware.js";

const router = Router();

// ==========================================
// Image Upload (imgbb) — key stays server-side
// ==========================================

router.post("/imgbb", verifyToken, async (req, res) => {
  try {
    const { image } = req.body;

    if (typeof image !== "string" || !image.trim()) {
      return res.status(400).json({
        success: false,
        message: "Image data is required.",
      });
    }

    const apiKey = process.env.IMGBB_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: "Image upload is not configured (IMGBB_API_KEY missing).",
      });
    }

    // Accept both "data:image/png;base64,AAAA" and raw base64 strings
    const base64 = image.includes(",") ? image.split(",")[1] : image;

    if (!base64) {
      return res.status(400).json({
        success: false,
        message: "Invalid image data.",
      });
    }

    const formData = new FormData();
    formData.append("image", base64);

    const uploadResponse = await fetch(
      `https://api.imgbb.com/1/upload?key=${apiKey}`,
      {
        method: "POST",
        body: formData,
      }
    );

    const data = await uploadResponse.json().catch(() => null);

    if (!uploadResponse.ok || !data?.data?.url) {
      console.error("imgbb upload failed:", data);

      return res.status(502).json({
        success: false,
        message: "Image upload failed. Please try again.",
      });
    }

    return res.status(200).json({
      success: true,
      url: data.data.url,
    });
  } catch (error) {
    console.error("Upload error:", error);

    return res.status(500).json({
      success: false,
      message: "Image upload failed.",
    });
  }
});

export default router;
