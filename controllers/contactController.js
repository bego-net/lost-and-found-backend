import ContactMessage from "../models/ContactMessage.js";
import nodemailer from "nodemailer";

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
      message
    });

    await newMessage.save();

    let emailSent = false;
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      try {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });

        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: process.env.EMAIL_USER,
          subject: "New Contact Message",
          text: `
Name: ${name}
Email: ${email}

Message:
${message}
`,
        });

        emailSent = true;
      } catch (mailError) {
        console.error("Contact email failed:", mailError);
      }
    }

    res.json({
      message: "Message sent successfully",
      emailSent,
      contactId: newMessage._id,
    });

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
      return res.status(400).json({ error: "messageId and reply are required" });
    }

    const message = await ContactMessage.findById(targetId);

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    message.status = "read";
    message.reply = reply;
    message.repliedAt = new Date();
    await message.save();

    let emailSent = false;
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      try {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });

        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: message.email,
          subject: "Re: Your contact message",
          text: reply,
        });

        emailSent = true;
      } catch (mailError) {
        console.error("Reply email failed:", mailError);
      }
    }

    res.json({ message: "Reply sent successfully", emailSent });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to send reply" });
  }
};

