const nodemailer = require('nodemailer');
const logger = require('./logger');

const sendEmail = async (options) => {
  try {
    // For development, use Ethereal (fake SMTP) or simply log to console to avoid setup overhead
    let transporter;

    if (process.env.SMTP_HOST && process.env.SMTP_PORT) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        auth: {
          user: process.env.SMTP_EMAIL,
          pass: process.env.SMTP_PASSWORD
        }
      });
    } else {
      // Mock transporter that just logs
      transporter = {
        sendMail: async (mailOptions) => {
          logger.info(`[MOCK EMAIL SENT] To: ${mailOptions.to}, Subject: ${mailOptions.subject}`);
          return true;
        }
      };
    }

    const message = {
      from: `${process.env.FROM_NAME || 'Smart Waste System'} <${process.env.FROM_EMAIL || 'noreply@smartwaste.city'}>`,
      to: options.email,
      subject: options.subject,
      text: options.message,
      html: options.html
    };

    await transporter.sendMail(message);
  } catch (error) {
    logger.error(`Error sending email: ${error.message}`);
  }
};

module.exports = sendEmail;
