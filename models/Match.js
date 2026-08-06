import mongoose from "mongoose";

const MatchSchema = new mongoose.Schema({
  sourceItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Item",
    required: true,
    index: true,
  },
  targetItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Item",
    required: true,
    index: true,
  },
  overallScore: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  visionScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  textScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  categoryScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  locationScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  dateScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Ensure (sourceItem, targetItem) pair is unique for upserting
MatchSchema.index({ sourceItem: 1, targetItem: 1 }, { unique: true });
MatchSchema.index({ sourceItem: 1, overallScore: -1 });

export default mongoose.model("Match", MatchSchema);
