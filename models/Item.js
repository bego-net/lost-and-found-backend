import mongoose from "mongoose";

const ItemSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },

  description: {
    type: String,
    required: true,
    trim: true
  },

  type: {
    type: String,
    enum: ["lost", "found"],
    required: true,
  },

  category: {
    type: String,
    required: true,
  },

  images: {
  type: [String],
  default: [],
},


  location: {
    type: String,
    required: true,
  },

  // 📍 ADDED — GEO LOCATION COORDINATES
  latitude: {
    type: Number,
    required: false,
  },

  longitude: {
    type: Number,
    required: false,
  },

  dateLostOrFound: {
    type: Date,
    default: Date.now
  },

  status: {
    type: String,
    enum: ["open", "resolved"],
    default: "open"
  },

  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Enable text search on title + description
ItemSchema.index({ title: "text", description: "text" });

export default mongoose.model("Item", ItemSchema);
