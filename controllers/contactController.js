import ContactMessage from "../models/ContactMessage.js";
import nodemailer from "nodemailer";

/* =========================================
   CREATE MAIL TRANSPORTER (GLOBAL)
========================================= */

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* =========================================
   SEND CONTACT MESSAGE (USER)
========================================= */

export const sendContactMessage = async (req, res) => {
  try {

    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({
        error: "name, email, and message are required",
      });
    }

    // Save message to database
    const newMessage = new ContactMessage({
      name,
      email,
      message,
      status: "unread"
    });

    await newMessage.save();

    // SEND RESPONSE IMMEDIATELY
    res.json({
      message: "Message sent successfully",
      contactId: newMessage._id,
    });

    // SEND EMAIL TO ADMIN IN BACKGROUND
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {

      transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        subject: "New Contact Message",
        text: `
New contact message received

Name: ${name}
Email: ${email}

Message:
${message}
        `,
      })
      .then(() => console.log("Contact email sent"))
      .catch(err => console.error("Contact email failed:", err));

    }

  } catch (error) {

    console.error(error);
    res.status(500).json({ error: "Failed to send message" });

  }
};

/* =========================================
   GET ALL CONTACT MESSAGES (ADMIN)
========================================= */

export const getMessages = async (req, res) => {
  try {

    const messages = await ContactMessage
      .find()
      .sort({ createdAt: -1 });

    res.json(messages);

  } catch (error) {

    console.error(error);
    res.status(500).json({ error: "Failed to fetch messages" });

  }
};

/* =========================================
   ADMIN REPLY TO MESSAGE
========================================= */

export const replyMessage = async (req, res) => {
  try {

    const { messageId, id, reply } = req.body;
    const targetId = messageId || id;

    if (!targetId || !reply) {
      return res.status(400).json({
        error: "messageId and reply are required"
      });
    }

    const message = await ContactMessage.findById(targetId);

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Update message
    message.status = "replied";
    message.reply = reply;
    message.repliedAt = new Date();

    await message.save();

    // SEND RESPONSE IMMEDIATELY
    res.json({
      message: "Reply sent successfully"
    });

    // SEND EMAIL TO USER IN BACKGROUND
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {

      transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: message.email,
        subject: "Reply from FoundLost Support",
        text: `
Hello ${message.name},

Thank you for contacting FoundLost.

${reply}

Best regards,
FoundLost Support Team
        `,
      })
      .then(() => console.log("Reply email sent"))
      .catch(err => console.error("Reply email failed:", err));

    }

  } catch (error) {

    console.error(error);
    res.status(500).json({ error: "Failed to send reply" });

  }
};