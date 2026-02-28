import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // 🔹 improves fetch speed
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: false,
    },

    message: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      required: false,
    },

    type: {
      type: String,
      enum: ["message", "offer", "like"],
      default: "message", // 🔹 helpful for frontend logic
    },

    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

/* ===========================
   AUTO POPULATE (OPTIONAL BUT RECOMMENDED)
   This prevents empty sender/profile issues
=========================== */

notificationSchema.pre(/^find/, function (next) {
  this.populate("sender", "name profileImage")
      .populate("item", "title images")
      .populate("message");
  next();
});

export default mongoose.model("Notification", notificationSchema);