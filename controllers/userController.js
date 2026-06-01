import User from "../models/User.js";

function toPublicPath(filePath) {
  if (!filePath) return null;
  if (/^https?:\/\//i.test(filePath)) {
    return filePath;
  }
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.startsWith("uploads/")) {
    return `/${normalized}`;
  }
  if (normalized.includes("/uploads/")) {
    return normalized.slice(normalized.indexOf("/uploads/"));
  }
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

export const uploadProfileImage = async (req, res) => {
  try {
    console.log("==== PROFILE IMAGE UPLOAD ====");
    console.log("FILE:", req.file?.path);
    console.log("USER:", req.user?._id);

    if (!req.file) {
      return res.status(400).json({ message: "No image uploaded" });
    }

    const imageUrl = toPublicPath(req.file.path);

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { profileImage: imageUrl },
      { new: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Profile picture updated successfully",
      user: updatedUser,
    });
  } catch (err) {
    console.error("Profile upload error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};
