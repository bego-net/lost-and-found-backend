import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    // User who receives the notification
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // improves fetch speed
    },

    // User who triggered the notification
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Related item (lost/found item)
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: false,
    },

    // Related message (if notification from chat)
    message: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      required: false,
    },

    // Notification type
    type: {
      type: String,
      enum: ["message", "offer", "like", "match"], // ✅ added match
      default: "message",
    },

    // Read status
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
=========================== */

notificationSchema.pre(/^find/, function (next) {
  this.populate("sender", "name profileImage")
      .populate("item", "title images")
      .populate("message");
  next();
});

export default mongoose.model("Notification", notificationSchema);